import React, { useEffect, useState } from 'react';
import { Warehouse, Plus, Search, MapPin, Database, Loader2, X, Package } from 'lucide-react';
import { OperationsService, WarehouseRow } from '../../services/OperationsService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';

export const WarehousesPage: React.FC = () => {
  const service = new OperationsService();
  const canManage = PermissionService.can(AuthService.getCurrentUser(), 'warehouses.manage');
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', branchId: '' });

  const load = () => {
    setLoading(true);
    try {
      setWarehouses(service.getWarehouses(search));
      setBranches(service.getBranches().map((b) => ({ id: b.id, name: b.name })));
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل المخازن.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.createWarehouse({ name: form.name, location: form.location || undefined, branchId: form.branchId || undefined });
      setModalOpen(false);
      setForm({ name: '', location: '', branchId: '' });
      load();
    } catch (err: any) { alert(err?.message || 'تعذر إضافة المخزن.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center"><Warehouse className="w-5 h-5 text-violet-600" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">المخازن والمستودعات</h1>
            <p className="text-xs text-slate-500 font-medium">متابعة الأرصدة الفعلية وتوزيع الأصناف على المخازن</p>
          </div>
        </div>
        {canManage && (
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition shrink-0">
            <Plus className="w-4 h-4" /> إضافة مخزن جديد
          </button>
        )}
      </div>

      <div className="p-4 bg-white border-b border-slate-200">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم المخزن أو العنوان ثم Enter..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-400" />
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {warehouses.map((w) => (
              <div key={w.id} className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-extrabold text-slate-900 group-hover:text-violet-600 transition text-base">{w.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${w.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{w.isActive ? 'نشط' : 'معطل'}</span>
                  </div>
                  <p className="text-[10px] font-mono text-slate-400 mb-3">{w.code} {w.isDefault && <span className="text-violet-600 font-bold">• افتراضي</span>}</p>
                  <div className="space-y-2 text-xs text-slate-500">
                    <div className="flex items-start gap-1.5"><MapPin className="w-4 h-4 shrink-0 mt-0.5" /><span>{w.location || '—'}</span></div>
                    <div className="flex items-center gap-1.5"><Database className="w-4 h-4" /><span>الفرع: {w.branchName || '—'}</span></div>
                    <div className="flex items-center gap-1.5"><Package className="w-4 h-4" /><span>{w.productsCount || 0} صنف متوفر</span></div>
                  </div>
                  <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-500">أصناف ذات رصيد</span>
                    <span className="text-sm font-black text-violet-600">{w.productsCount || 0} صنف</span>
                  </div>
                </div>
              </div>
            ))}
            {warehouses.length === 0 && <div className="col-span-full py-16 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-white">لا توجد مخازن</div>}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">إضافة مخزن جديد</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div><label className="font-bold text-slate-700 block mb-1">اسم المخزن *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-semibold" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">الموقع</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">الفرع</label>
                <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  <option value="">— بدون فرع —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
