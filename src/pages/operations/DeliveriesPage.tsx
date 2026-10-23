import React, { useEffect, useState } from 'react';
import { Truck, Plus, Search, Loader2, X, MapPin, User, Phone, Calendar } from 'lucide-react';
import { OperationsService, Delivery, Driver, Vehicle } from '../../services/OperationsService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';

const STATUS_LABEL: Record<Delivery['status'], string> = {
  PENDING: 'قيد الانتظار', SCHEDULED: 'مجدولة', IN_TRANSIT: 'في الطريق',
  DELIVERED: 'تم التسليم', FAILED: 'فشلت', CANCELLED: 'ملغاة',
};
const STATUS_STYLE: Record<Delivery['status'], string> = {
  PENDING: 'bg-slate-100 text-slate-600 border-slate-200',
  SCHEDULED: 'bg-violet-50 text-violet-600 border-violet-200',
  IN_TRANSIT: 'bg-sky-50 text-sky-600 border-sky-200',
  DELIVERED: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-600 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-400 border-slate-200',
};

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

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">أمر تسليم جديد</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">العميل *</label>
                <select required value={form.customerId} onChange={(e) => pickCustomer(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  <option value="">— اختر العميل —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
                </select>
              </div>
              <div><label className="font-bold text-slate-700 block mb-1">عنوان التسليم *</label><input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">المدينة</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">موعد التسليم</label><input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">السائق</label>
                  <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    <option value="">— غير مسند —</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المركبة</label>
                  <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    <option value="">— بدون —</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
                  </select>
                </div>
                <div><label className="font-bold text-slate-700 block mb-1">رسوم التوصيل</label><input type="number" min={0} step="0.01" value={form.deliveryFee} onChange={(e) => setForm({ ...form, deliveryFee: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
              </div>
              <div><label className="font-bold text-slate-700 block mb-1">ملاحظات</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إنشاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
