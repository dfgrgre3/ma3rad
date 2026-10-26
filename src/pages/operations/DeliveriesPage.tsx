import React, { useEffect, useState } from 'react';
import { Truck, Plus, Search, Loader2, MapPin, User, Phone, Calendar } from 'lucide-react';
import { OperationsService, Delivery, Driver, Vehicle } from '../../services/OperationsService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { STATUS_LABEL, STATUS_STYLE } from './deliveryStatus';
import { DeliveryCreateModal } from './DeliveryCreateModal';
type Customer = { id: string; name: string; phone?: string | null; address?: string | null; city?: string | null };
export const DeliveriesPage: React.FC = () => {
  const service = new OperationsService();
  const canManage = PermissionService.can(AuthService.getCurrentUser(), 'deliveries.manage');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | Delivery['status']>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerId: '', address: '', city: '', driverId: '', vehicleId: '',
    scheduledAt: '', deliveryFee: '', notes: '',
  });

  const load = () => {
    setLoading(true);
    try {
      setDeliveries(service.getDeliveries(search, statusFilter));
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل أوامر التسليم.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  useEffect(() => {
    try {
      setDrivers(service.getDrivers().filter((d) => d.isActive));
      setVehicles(service.getVehicles().filter((v) => v.isActive && v.status !== 'OUT_OF_SERVICE'));
      setCustomers(service.getCustomersForSelect());
    } catch (e: any) { setError(e?.message || 'تعذر تحميل البيانات المرجعية.'); }
  }, []);

  const pickCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id);
    setForm((f) => ({ ...f, customerId: id, address: f.address || c?.address || '', city: f.city || c?.city || '' }));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.createDelivery({
        customerId: form.customerId, address: form.address, city: form.city || undefined,
        driverId: form.driverId || undefined, vehicleId: form.vehicleId || undefined,
        scheduledAt: form.scheduledAt || undefined,
        deliveryFee: form.deliveryFee ? Number(form.deliveryFee) : undefined,
        notes: form.notes || undefined,
      });
      setModalOpen(false);
      setForm({ customerId: '', address: '', city: '', driverId: '', vehicleId: '', scheduledAt: '', deliveryFee: '', notes: '' });
      load();
    } catch (err: any) { alert(err?.message || 'تعذر إنشاء أمر التسليم.'); }
    finally { setSaving(false); }
  };

  const advance = (d: Delivery) => {
    const map: Partial<Record<Delivery['status'], Delivery['status']>> = {
      PENDING: 'IN_TRANSIT', SCHEDULED: 'IN_TRANSIT', IN_TRANSIT: 'DELIVERED',
    };
    const next = map[d.status];
    if (!next) return;
    try { service.updateDeliveryStatus(d.id, next); load(); } catch (e: any) { alert(e?.message); }
  };

  const cancel = (d: Delivery) => {
    if (!confirm(`إلغاء أمر التسليم ${d.deliveryNumber}؟`)) return;
    try { service.updateDeliveryStatus(d.id, 'CANCELLED'); load(); } catch (e: any) { alert(e?.message); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center"><Truck className="w-5 h-5 text-sky-600" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">أوامر التسليم</h1>
            <p className="text-xs text-slate-500 font-medium">جدولة الشحنات ومتابعة حالة التوصيل</p>
          </div>
        </div>
        {canManage && (
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold transition shrink-0">
            <Plus className="w-4 h-4" /> أمر تسليم جديد
          </button>
        )}
      </div>

      <div className="p-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row gap-3">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم الأمر أو العميل أو العنوان ثم Enter..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-sky-400" />
        </form>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
          <option value="ALL">كل الحالات</option>
          {Object.entries(STATUS_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div> : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-right text-xs min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                <tr>
                  <th className="px-4 py-3">رقم الأمر</th>
                  <th className="px-4 py-3">العميل</th>
                  <th className="px-4 py-3">العنوان</th>
                  <th className="px-4 py-3">السائق / المركبة</th>
                  <th className="px-4 py-3">التاريخ</th>
                  <th className="px-4 py-3">الحالة</th>
                  {canManage && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{d.deliveryNumber}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 font-bold text-slate-800"><User className="w-3 h-3" />{d.customerName}</div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono"><Phone className="w-3 h-3" />{d.customerPhone || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex items-start gap-1"><MapPin className="w-3 h-3 mt-0.5 shrink-0" /><span className="line-clamp-2">{d.address}{d.city ? `, ${d.city}` : ''}</span></div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{d.driverName || 'غير مسند'}</div>
                      <div className="text-[10px] font-mono text-slate-400">{d.plateNumber || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{d.date ? new Date(d.date).toLocaleDateString('ar-EG') : '—'}</div>
                    </td>
                    <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${STATUS_STYLE[d.status]}`}>{STATUS_LABEL[d.status]}</span></td>
                    {canManage && (
                      <td className="px-4 py-3 text-left whitespace-nowrap">
                        {(d.status === 'PENDING' || d.status === 'SCHEDULED' || d.status === 'IN_TRANSIT') && (
                          <button onClick={() => advance(d)} className="px-2.5 py-1 mr-1 rounded-lg text-[10px] font-bold bg-sky-50 text-sky-600 border border-sky-200 hover:bg-sky-100">
                            {d.status === 'IN_TRANSIT' ? 'تأكيد التسليم' : 'بدء التوصيل'}
                          </button>
                        )}
                        {d.status !== 'DELIVERED' && d.status !== 'CANCELLED' && (
                          <button onClick={() => cancel(d)} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100">إلغاء</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {deliveries.length === 0 && <tr><td colSpan={7} className="py-16 text-center text-slate-400">لا توجد أوامر تسليم</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && <DeliveryCreateModal form={form} setForm={setForm} customers={customers} drivers={drivers} vehicles={vehicles} saving={saving} onClose={() => setModalOpen(false)} onSubmit={handleCreate} onPickCustomer={pickCustomer} />}
    </div>
  );
};
