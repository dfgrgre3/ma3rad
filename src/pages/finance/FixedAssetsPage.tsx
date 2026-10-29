import React, { useEffect, useMemo, useState } from 'react';
import { Building, Plus, Loader2, Trash2, TrendingDown, Search } from 'lucide-react';
import { FinanceExtrasService, FixedAsset } from '../../services/FinanceExtrasService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { localDateString } from '../../utils/date';

import { fmt, CATEGORY_LABELS } from './fixedAssetsHelpers';
import { FixedAssetEditorModal } from './FixedAssetEditorModal';

export const FixedAssetsPage: React.FC = () => {
  const service = useMemo(() => new FinanceExtrasService(), []);
  const canManage = PermissionService.can(AuthService.getCurrentUser(), 'finance.approve');
  const [rows, setRows] = useState<FixedAsset[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<FixedAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', category: 'EQUIPMENT', purchaseDate: localDateString(),
    purchaseCost: '', paymentType: 'CREDIT', salvageValue: '0', usefulLifeYears: '5', location: '', notes: '',
  });

  const load = () => {
    setLoading(true);
    try { setRows(service.getFixedAssets()); setError(null); }
    catch (e: any) { setError(e?.message || 'تعذر تحميل الأصول.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => !search.trim() || r.name.includes(search) || r.code.includes(search) || (r.location || '').includes(search));

  const totals = useMemo(() => ({
    cost: rows.reduce((s, r) => s + Number(r.purchaseCost), 0),
    accumulated: rows.reduce((s, r) => s + Number(r.accumulatedDepreciation), 0),
    bookValue: rows.reduce((s, r) => s + Math.max(0, Number(r.purchaseCost) - Number(r.accumulatedDepreciation)), 0),
  }), [rows]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', category: 'EQUIPMENT', purchaseDate: localDateString(), purchaseCost: '', paymentType: 'CREDIT', salvageValue: '0', usefulLifeYears: '5', location: '', notes: '' });
    setModal(true);
  };

  const openEdit = (row: FixedAsset) => {
    setEditing(row);
    setForm({
      name: row.name, category: row.category, purchaseDate: row.purchaseDate, purchaseCost: String(row.purchaseCost),
      paymentType: 'CASH',
      salvageValue: String(row.salvageValue), usefulLifeYears: String(row.usefulLifeYears), location: row.location || '', notes: row.notes || '',
    });
    setModal(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.saveFixedAsset({
        id: editing?.id,
        name: form.name,
        category: form.category,
        purchaseDate: form.purchaseDate,
        purchaseCost: Number(form.purchaseCost),
        paymentType: form.paymentType,
        salvageValue: Number(form.salvageValue || 0),
        usefulLifeYears: Number(form.usefulLifeYears || 5),
        location: form.location,
        notes: form.notes,
        status: editing?.status || 'ACTIVE',
      });
      setModal(false);
      load();
    } catch (err: any) { alert(err?.message || 'تعذر حفظ الأصل.'); }
    finally { setSaving(false); }
  };

  const depreciate = (row: FixedAsset) => {
    if (!confirm(`ترحيل إهلاك شهر واحد للأصل "${row.name}"؟`)) return;
    try { service.postMonthlyDepreciation(row.id); load(); }
    catch (err: any) { alert(err?.message || 'تعذر ترحيل الإهلاك.'); }
  };

  const remove = (row: FixedAsset) => {
    if (!confirm(`حذف الأصل ${row.code} — ${row.name}؟`)) return;
    try { service.deleteFixedAsset(row.id); load(); }
    catch (err: any) { alert(err?.message || 'تعذر حذف الأصل.'); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center"><Building className="w-5 h-5 text-violet-600" /></div>
          <div>
            <h1 className="text-base font-black">الأصول الثابتة والإهلاك</h1>
            <p className="text-xs text-slate-500 font-medium">سجل الأصول والقيمة الدفترية وجداول الإهلاك الشهري</p>
          </div>
        </div>
        {canManage && <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition shrink-0">
          <Plus className="w-4 h-4" /> إضافة أصل
        </button>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-white border-b border-slate-200">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[10px] font-bold text-slate-500">إجمالي تكلفة الأصول</div>
          <div className="text-lg font-black text-slate-900 mt-1">{fmt(totals.cost)}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <div className="text-[10px] font-bold text-rose-700">مجمع الإهلاك</div>
          <div className="text-lg font-black text-rose-700 mt-1">{fmt(totals.accumulated)}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-[10px] font-bold text-emerald-700">القيمة الدفترية الصافية</div>
          <div className="text-lg font-black text-emerald-700 mt-1">{fmt(totals.bookValue)}</div>
        </div>
      </div>

      <div className="px-6 py-3 bg-white border-b border-slate-200">
        <form onSubmit={(e) => e.preventDefault()} className="relative max-w-md">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الكود أو الموقع..." className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-400" />
        </form>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div> : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-white">لا توجد أصول مسجلة</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((row) => {
              const depreciable = Math.max(0, Number(row.purchaseCost) - Number(row.salvageValue));
              const monthly = row.usefulLifeYears > 0 ? depreciable / (row.usefulLifeYears * 12) : 0;
              const bookValue = Math.max(0, Number(row.purchaseCost) - Number(row.accumulatedDepreciation));
              const progress = depreciable > 0 ? Math.min(100, (Number(row.accumulatedDepreciation) / depreciable) * 100) : 100;
              return (
                <div key={row.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col hover:border-slate-300 transition">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] px-2 py-1 rounded border font-bold bg-violet-50 text-violet-700 border-violet-200">{CATEGORY_LABELS[row.category] || row.category}</span>
                    <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${row.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {row.status === 'ACTIVE' ? 'نشط' : row.status === 'FULLY_DEPRECIATED' ? 'مهلك بالكامل' : 'مستبعد'}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-slate-900">{row.name}</h3>
                  <div className="text-[11px] text-slate-500 mt-0.5 font-mono">{row.code} · {row.location || 'بدون موقع'}</div>
                  <div className="text-lg font-black text-slate-900 mt-3">{fmt(bookValue)}</div>
                  <div className="text-[11px] text-slate-400">تكلفة {fmt(Number(row.purchaseCost))} · مجمع {fmt(Number(row.accumulatedDepreciation))}</div>
                  <div className="mt-3">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>إهلاك شهري {fmt(monthly)}</span>
                      <span>{progress.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-1">
                    {canManage && <button onClick={() => depreciate(row)} disabled={row.status !== 'ACTIVE'} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-violet-50 text-violet-700 font-bold hover:bg-violet-100 disabled:opacity-40">
                      <TrendingDown className="w-3 h-3" /> ترحيل إهلاك
                    </button>}
                    <div className="flex items-center gap-1">
                      {canManage && <button onClick={() => openEdit(row)} className="text-[10px] px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">تعديل</button>}
                      {canManage && <button onClick={() => remove(row)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && canManage && <FixedAssetEditorModal form={form} setForm={setForm} editing={editing} saving={saving} onClose={() => setModal(false)} onSubmit={submit} />}
    </div>
  );
};
