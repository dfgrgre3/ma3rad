import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Truck, Plus, Search, Loader2, MapPin, User, Phone, Calendar } from 'lucide-react';
import { OperationsService, Delivery, Driver, Vehicle } from '../../../services/domains/operations/OperationsService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { STATUS_LABEL, STATUS_STYLE } from './deliveryStatus';
import { DeliveryCreateModal } from './DeliveryCreateModal';
import { useToast } from '../../../components/ui/Toast';
type Customer = { id: string; name: string; phone?: string | null; address?: string | null; city?: string | null };
export const DeliveriesPage: React.FC = () => {
  const toast = useToast();
  const service = useMemo(() => new OperationsService(), []);
  const currentUser = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(currentUser, 'ui.deliveries.deliveries.create');
  const _canManage = PermissionService.can(currentUser, 'ui.deliveries.deliveries.manage');
  const canStart = PermissionService.can(currentUser, 'ui.deliveries.deliveries.start');
  const canComplete = PermissionService.can(currentUser, 'ui.deliveries.deliveries.complete');
  const canCancel = PermissionService.can(currentUser, 'ui.deliveries.deliveries.cancel');
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

  const load = useCallback(() => {
    setLoading(true);
    try {
      setDeliveries(service.getDeliveries(search, statusFilter));
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل أوامر التسليم.'); }
    finally { setLoading(false); }
  }, [search, service, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    try {
      setDrivers(service.getDrivers().filter((d) => d.isActive));
      setVehicles(service.getVehicles().filter((v) => v.isActive && v.status !== 'OUT_OF_SERVICE'));
      setCustomers(service.getCustomersForSelect());
    } catch (e: any) { setError(e?.message || 'تعذر تحميل البيانات المرجعية.'); }
  }, [service]);

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
    } catch (err: any) { toast.error(err?.message || 'تعذر إنشاء أمر التسليم.'); }
    finally { setSaving(false); }
  };

  const advance = (d: Delivery) => {
    const map: Partial<Record<Delivery['status'], Delivery['status']>> = {
      PENDING: 'IN_TRANSIT', SCHEDULED: 'IN_TRANSIT', IN_TRANSIT: 'DELIVERED',
    };
    const next = map[d.status];
    if (!next) return;
    try { service.updateDeliveryStatus(d.id, next); load(); } catch (e: any) { toast.warning(e?.message); }
  };

  const cancel = (d: Delivery) => {
    if (!confirm(`إلغاء أمر التسليم ${d.deliveryNumber}؟`)) return;
    try { service.updateDeliveryStatus(d.id, 'CANCELLED'); load(); } catch (e: any) { toast.warning(e?.message); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center"><Truck className="w-5 h-5 text-sky-600" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">أوامر التسليم</h1>
            <p className="text-xs text-slate-500 font-medium">جدولة الشحنات ومتابعة حالة التوصيل</p>
          </div>
        </div>
        {canCreate && (
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold transition shrink-0">
            <Plus className="w-4 h-4" /> أمر تسليم جديد
          </button>
        )}
      </div>

      <div className="p-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row gap-3">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم الأمر أو العميل أو العنوان ثم اضغط إدخال..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-sky-400" />
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
            <DataTable
              ariaLabel="أوامر التسليم"
              rows={deliveries}
              rowKey={(d: any) => String(d.id)}
              minWidth={800}
              tableClassName="text-xs"
              columns={[
                { key: 'num', header: 'رقم الأمر', render: (d: any) => <span className="font-mono font-bold text-slate-900">{d.deliveryNumber}</span> },
                {
                  key: 'customer', header: 'العميل',
                  render: (d: any) => (
                    <span className="block">
                      <span className="flex items-center gap-1 font-bold text-slate-800"><User className="h-3 w-3" />{d.customerName}</span>
                      <span className="flex items-center gap-1 font-mono text-[10px] text-slate-400"><Phone className="h-3 w-3" />{d.customerPhone || '—'}</span>
                    </span>
                  ),
                },
                {
                  key: 'address', header: 'العنوان',
                  render: (d: any) => (
                    <span className="flex items-start gap-1 text-slate-600">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="line-clamp-2">{d.address}{d.city ? `, ${d.city}` : ''}</span>
                    </span>
                  ),
                },
                {
                  key: 'driver', header: 'السائق / المركبة',
                  render: (d: any) => (
                    <span className="block text-slate-600">
                      <span className="block">{d.driverName || 'غير مسند'}</span>
                      <span className="block font-mono text-[10px] text-slate-400">{d.plateNumber || '—'}</span>
                    </span>
                  ),
                },
                {
                  key: 'date', header: 'التاريخ',
                  render: (d: any) => (
                    <span className="flex items-center gap-1 text-slate-600">
                      <Calendar className="h-3 w-3" />{d.date ? new Date(d.date).toLocaleDateString('ar-EG') : '—'}
                    </span>
                  ),
                },
                { key: 'status', header: 'الحالة', render: (d: any) => <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[d.status as keyof typeof STATUS_STYLE]}`}>{STATUS_LABEL[d.status as keyof typeof STATUS_LABEL]}</span> },
                ...(canStart || canComplete || canCancel ? [{
                  key: 'actions', header: '',
                  render: (d: any) => (
                    <span className="block whitespace-nowrap text-left">
                      {(d.status === 'PENDING' || d.status === 'SCHEDULED' || d.status === 'IN_TRANSIT')
                        && (d.status === 'IN_TRANSIT' ? canComplete : canStart) && (
                        <button
                          onClick={() => advance(d)}
                          className="ml-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-600 hover:bg-sky-100"
                        >
                          {d.status === 'IN_TRANSIT' ? 'تأكيد التسليم' : 'بدء التوصيل'}
                        </button>
                      )}
                      {canCancel && d.status !== 'DELIVERED' && d.status !== 'CANCELLED' && (
                        <button onClick={() => cancel(d)} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100">إلغاء</button>
                      )}
                    </span>
                  ),
                }] : []),
              ]}
              emptyTitle="لا توجد أوامر تسليم"
            />
          </div>
        )}
      </div>

      {modalOpen && <DeliveryCreateModal form={form} setForm={setForm} customers={customers} drivers={drivers} vehicles={vehicles} saving={saving} onClose={() => setModalOpen(false)} onSubmit={handleCreate} onPickCustomer={pickCustomer} />}
    </div>
  );
};
