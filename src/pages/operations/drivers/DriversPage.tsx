import React, { useEffect, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Users, Plus, Search, Phone, Loader2, X, Power, Truck } from 'lucide-react';
import { OperationsService, Driver } from '../../../services/domains/operations/OperationsService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';

import { useToast } from '../../../components/ui/Toast';
export const DriversPage: React.FC = () => {
  const toast = useToast();
  const service = new OperationsService();
  const currentUser = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(currentUser, 'ui.drivers.drivers.create');
  const canUpdate = PermissionService.can(currentUser, 'ui.drivers.drivers.update');
  const canManage = PermissionService.can(currentUser, 'ui.drivers.drivers.manage');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', licenseNumber: '', licenseExpiresAt: '', notes: '' });

  const load = () => {
    setLoading(true);
    try { setDrivers(service.getDrivers(search)); setError(null); }
    catch (e: any) { setError(e?.message || 'تعذر تحميل السائقين.'); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.createDriver({
        fullName: form.fullName, phone: form.phone,
        licenseNumber: form.licenseNumber || undefined,
        licenseExpiresAt: form.licenseExpiresAt || undefined,
        notes: form.notes || undefined,
      });
      setModalOpen(false);
      setForm({ fullName: '', phone: '', licenseNumber: '', licenseExpiresAt: '', notes: '' });
      load();
    } catch (err: any) { toast.error(err?.message || 'تعذر إضافة السائق.'); }
    finally { setSaving(false); }
  };

  const toggle = (d: Driver) => {
    try { service.toggleDriver(d.id, !d.isActive); load(); } catch (e: any) { toast.warning(e?.message); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      <div className="bg-white px-6 pt-4">
        <PageHeader
          icon={<Users className="h-5 w-5" />}
          title="السائقون"
          description="بيانات السائقين والرخص وعدد الرحلات"
          actions={canCreate && (
            <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition shrink-0">
              <Plus className="w-4 h-4" /> إضافة سائق
            </button>
          )}
        />
      </div>

      <div className="p-4 bg-white border-b border-slate-200">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف أو رقم الرخصة ثم اضغط إدخال..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-400" />
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div> : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <DataTable
              ariaLabel="السائقون"
              rows={drivers}
              rowKey={(d: any) => String(d.id)}
              tableClassName="text-xs"
              columns={[
                {
                  key: 'driver', header: 'السائق',
                  render: (d: any) => (
                    <span className="block">
                      <span className="block font-bold text-slate-900">{d.fullName}</span>
                      <span className="block font-mono text-[10px] text-slate-400">{d.code}</span>
                    </span>
                  ),
                },
                {
                  key: 'phone', header: 'الهاتف',
                  render: (d: any) => <a href={`tel:${d.phone}`} className="flex items-center gap-1 font-mono text-slate-600 hover:text-amber-600"><Phone className="h-3 w-3" />{d.phone}</a>,
                },
                { key: 'license', header: 'رقم الرخصة', render: (d: any) => <span className="font-mono text-slate-600">{d.licenseNumber || '—'}</span> },
                { key: 'expiry', header: 'انتهاء الرخصة', render: (d: any) => <span className="text-slate-600">{d.licenseExpiresAt ? new Date(d.licenseExpiresAt).toLocaleDateString('ar-EG') : '—'}</span> },
                {
                  key: 'trips', header: 'الرحلات',
                  render: (d: any) => <span className="inline-flex items-center gap-1 text-slate-600"><Truck className="h-3 w-3" />{d.tripsCount || 0}</span>,
                },
                {
                  key: 'status', header: 'الحالة',
                  render: (d: any) => (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${d.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                      {d.isActive ? 'نشط' : 'معطل'}
                    </span>
                  ),
                },
                ...(canUpdate || canManage ? [{
                  key: 'actions', header: '',
                  render: (d: any) => (
                    <span className="block text-left">
                      <button onClick={() => toggle(d)} className={`rounded-lg border px-3 py-1 text-[10px] font-bold transition ${d.isActive ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-emerald-200 bg-emerald-50 text-emerald-600'}`}>
                        <Power className="ml-1 inline h-3 w-3" />{d.isActive ? 'تعطيل' : 'تفعيل'}
                      </button>
                    </span>
                  ),
                }] : []),
              ]}
              emptyTitle="لا يوجد سائقون مسجلون"
            />
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">إضافة سائق جديد</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div><label className="font-bold text-slate-700 block mb-1">الاسم الكامل *</label><input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-semibold" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">الهاتف *</label><input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                <div><label className="font-bold text-slate-700 block mb-1">رقم الرخصة</label><input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
              </div>
              <div><label className="font-bold text-slate-700 block mb-1">تاريخ انتهاء الرخصة</label><input type="date" value={form.licenseExpiresAt} onChange={(e) => setForm({ ...form, licenseExpiresAt: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">ملاحظات</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
