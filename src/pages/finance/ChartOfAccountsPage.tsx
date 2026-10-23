import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, Search, Loader2, X, Trash2, Power } from 'lucide-react';
import { FinanceExtrasService, Account, AccountType } from '../../services/FinanceExtrasService';

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'أصول',
  LIABILITY: 'التزامات',
  EQUITY: 'حقوق ملكية',
  REVENUE: 'إيرادات',
  EXPENSE: 'مصروفات',
};
const TYPE_COLORS: Record<AccountType, string> = {
  ASSET: 'bg-sky-50 text-sky-700 border-sky-200',
  LIABILITY: 'bg-rose-50 text-rose-700 border-rose-200',
  EQUITY: 'bg-violet-50 text-violet-700 border-violet-200',
  REVENUE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXPENSE: 'bg-amber-50 text-amber-700 border-amber-200',
};
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';

export const ChartOfAccountsPage: React.FC = () => {
  const service = useMemo(() => new FinanceExtrasService(), []);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | AccountType>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', type: 'ASSET' as AccountType, parentCode: '', notes: '' });

  const load = () => {
    setLoading(true);
    try { setAccounts(service.getAccounts()); setError(null); }
    catch (e: any) { setError(e?.message || 'تعذر تحميل دليل الحسابات.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = accounts.filter((a) => {
    const matchesType = typeFilter === 'ALL' || a.type === typeFilter;
    const q = search.trim();
    const matchesSearch = !q || a.name.includes(q) || a.code.includes(q);
    return matchesType && matchesSearch;
  });

  const totals = useMemo(() => {
    const result: Record<string, number> = {};
    accounts.forEach((a) => { result[a.type] = (result[a.type] || 0) + Number(a.computedBalance ?? a.balance ?? 0); });
    return result;
  }, [accounts]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      service.createAccount({ code: form.code, name: form.name, type: form.type, parentCode: form.parentCode || undefined, notes: form.notes });
      setModal(false);
      setForm({ code: '', name: '', type: 'ASSET', parentCode: '', notes: '' });
      load();
    } catch (err: any) { alert(err?.message || 'تعذر حفظ الحساب.'); }
  };

  const toggle = (a: Account) => {
    try { service.updateAccount(a.id, { isActive: !a.isActive }); load(); }
    catch (err: any) { alert(err?.message || 'تعذر تحديث الحساب.'); }
  };

  const remove = (a: Account) => {
    if (!confirm(`حذف الحساب ${a.code} — ${a.name}؟`)) return;
    try { service.deleteAccount(a.id); load(); }
    catch (err: any) { alert(err?.message || 'تعذر حذف الحساب.'); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center"><BookOpen className="w-5 h-5 text-sky-600" /></div>
          <div>
            <h1 className="text-base font-black">دليل الحسابات العام</h1>
            <p className="text-xs text-slate-500 font-medium">هيكل الحسابات المحاسبية وأرصدتها المستخرجة من القيود</p>
          </div>
        </div>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-bold transition shrink-0">
          <Plus className="w-4 h-4" /> إضافة حساب
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-white border-b border-slate-200">
        {(Object.keys(TYPE_LABELS) as AccountType[]).map((type) => (
          <button key={type} onClick={() => setTypeFilter(typeFilter === type ? 'ALL' : type)}
            className={`rounded-xl border px-3 py-2 text-right transition ${typeFilter === type ? 'ring-2 ring-sky-400' : ''} ${TYPE_COLORS[type]}`}>
            <div className="text-[10px] font-bold">{TYPE_LABELS[type]}</div>
            <div className="text-sm font-black mt-1 font-mono">{fmt(totals[type] || 0)}</div>
          </button>
        ))}
      </div>

      <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3 px-6">
        <form onSubmit={(e) => e.preventDefault()} className="relative flex-1 max-w-md">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالكود أو اسم الحساب..." className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-sky-400" />
        </form>
        <button onClick={() => { setTypeFilter('ALL'); setSearch(''); }} className="text-xs font-bold text-slate-500 hover:text-slate-800">إعادة الضبط</button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div> : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['الكود', 'اسم الحساب', 'النوع', 'الحساب الأب', 'الرصيد الصافي', 'الحالة', ''].map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-bold text-slate-700">{a.code}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{a.name}</td>
                    <td className="px-4 py-3"><span className={`text-[10px] px-2 py-1 rounded border font-bold ${TYPE_COLORS[a.type]}`}>{TYPE_LABELS[a.type]}</span></td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{a.parentCode || '—'}</td>
                    <td className="px-4 py-3 font-mono font-black text-slate-800">{fmt(Number(a.computedBalance ?? a.balance ?? 0))}</td>
                    <td className="px-4 py-3"><span className={`text-[10px] px-2 py-1 rounded-full font-bold ${a.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{a.isActive ? 'نشط' : 'موقوف'}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => toggle(a)} title="تفعيل/إيقاف" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><Power className="w-3.5 h-3.5" /></button>
                        <button onClick={() => remove(a)} title="حذف" className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="py-16 text-center text-slate-400">لا توجد حسابات مطابقة</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold">إضافة حساب جديد</h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">الكود *</label><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" placeholder="1106" /></div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">النوع *</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    {(Object.keys(TYPE_LABELS) as AccountType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="font-bold text-slate-700 block mb-1">اسم الحساب *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">كود الحساب الأب</label><input value={form.parentCode} onChange={(e) => setForm({ ...form, parentCode: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">ملاحظات</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl">حفظ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
