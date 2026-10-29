import React, { useEffect, useState } from 'react';
import { Users, Plus, Search, Phone, CreditCard, Loader2, X, Power, Truck } from 'lucide-react';
import { OperationsService, Driver } from '../../services/OperationsService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';

export const DriversPage: React.FC = () => {
  const service = new OperationsService();
  const canManage = PermissionService.can(AuthService.getCurrentUser(), 'drivers.manage');
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
    } catch (err: any) { alert(err?.message || 'تعذر إضافة السائق.'); }
    finally { setSaving(false); }
  };

  const toggle = (d: Driver) => {
    try { service.toggleDriver(d.id, !d.isActive); load(); } catch (e: any) { alert(e?.message); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center"><Users className="w-5 h-5 text-amber-600" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">السائقون</h1>
            <p className="text-xs text-slate-500 font-medium">بيانات السائقين والرخص وعدد الرحلات</p>
          </div>
        </div>
        {canManage && (
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition shrink-0">
            <Plus className="w-4 h-4" /> إضافة سائق
          </button>
        )}
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
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                <tr>
                  <th className="px-4 py-3">السائق</th>
                  <th className="px-4 py-3">الهاتف</th>
                  <th className="px-4 py-3">رقم الرخصة</th>
                  <th className="px-4 py-3">انتهاء الرخصة</th>
                  <th className="px-4 py-3">الرحلات</th>
                  <th className="px-4 py-3">الحالة</th>
                  {canManage && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drivers.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{d.fullName}</div>
                      <div className="text-[10px] font-mono text-slate-400">{d.code}</div>
                    </td>
                    <td className="px-4 py-3"><a href={`tel:${d.phone}`} className="flex items-center gap-1 text-slate-600 hover:text-amber-600 font-mono"><Phone className="w-3 h-3" />{d.phone}</a></td>
                    <td className="px-4 py-3 font-mono text-slate-600">{d.licenseNumber || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{d.licenseExpiresAt ? new Date(d.licenseExpiresAt).toLocaleDateString('ar-EG') : '—'}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-slate-600"><Truck className="w-3 h-3" />{d.tripsCount || 0}</span></td>
                    <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${d.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{d.isActive ? 'نشط' : 'معطل'}</span></td>
                    {canManage && (
                      <td className="px-4 py-3 text-left">
                        <button onClick={() => toggle(d)} className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition ${d.isActive ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                          <Power className="w-3 h-3 inline ml-1" />{d.isActive ? 'تعطيل' : 'تفعيل'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {drivers.length === 0 && <tr><td colSpan={7} className="py-16 text-center text-slate-400">لا يوجد سائقون مسجلون</td></tr>}
              </tbody>
            </table>
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
              <div className="grid grid-cols-2 gap-2">
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
