import React, { useEffect, useState } from 'react';
import { TrendingDown, Plus, Search, Loader2, X, Tag, Wallet } from 'lucide-react';
import { CashierService } from '../../services/CashierService';
import { AuthService } from '../../services/AuthService';

type ExpenseRow = {
  id: string; category: string; description: string; amount: number; date: string;
  paymentType: string; recipient?: string | null; performedByName?: string;
};

const PAYMENT_LABELS: Record<string, string> = { CASH: 'خزينة نقدية', CARD: 'بطاقة', BANK: 'تحويل بنكي', CHEQUE: 'شيك' };
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n) + ' ج';

export const ExpensesPage: React.FC = () => {
  const service = new CashierService();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: '', amount: '', description: '', recipient: '', paymentType: 'CASH' });

  const load = () => {
    setLoading(true);
    try {
      setExpenses(service.getAllExpenses() as unknown as ExpenseRow[]);
      setCategories(service.getExpenseCategories());
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل المصروفات.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = expenses.filter((e) =>
    !search.trim() || e.category.includes(search) || (e.description || '').includes(search)
  );
  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.category) return alert('اختر فئة المصروف.');
    if (!(amount > 0)) return alert('أدخل مبلغاً صحيحاً أكبر من صفر.');
    if (!form.description.trim()) return alert('أدخل وصف المصروف.');
    setSaving(true);
    try {
      const registers = service.getAllRegisters();
      const registerId = registers.find((r) => (r as any).isDefault)?.id || registers[0]?.id;
      if (!registerId) throw new Error('لا يوجد صندوق نشط لتسجيل المصروف.');
      const shift = service.getActiveShift(AuthService.getCurrentUser()?.id);
      service.addExpense(
        form.category, amount, form.description.trim(), registerId,
        shift?.id, form.paymentType as any, form.recipient,
        AuthService.getCurrentUser()?.id || 'usr_admin'
      );
      setModalOpen(false);
      setForm({ category: '', amount: '', description: '', recipient: '', paymentType: 'CASH' });
      load();
    } catch (err: any) { alert(err?.message || 'تعذر تسجيل المصروف.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-rose-600" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">إدارة المصروفات التشغيلية</h1>
            <p className="text-xs text-slate-500 font-medium">سجل النفقات اليومية، الصيانة، الإيجارات وفواتير المرافق</p>
          </div>
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold transition shrink-0">
          <Plus className="w-4 h-4" /> تسجيل مصروف جديد
        </button>
      </div>

      <div className="p-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3 justify-between px-6">
        <form onSubmit={(e) => { e.preventDefault(); }} className="relative flex-1 max-w-md">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالفئة أو الوصف..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-rose-400" />
        </form>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
          إجمالي المصروفات المعروضة:
          <span className="text-lg font-black text-rose-600">{fmt(total)}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-rose-500" /></div> : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['الفئة', 'التاريخ', 'طريقة الدفع', 'المستفيد', 'الوصف والبيان', 'المبلغ'].map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-600"><Tag className="w-3 h-3" />{e.category}</span></td>
                    <td className="px-4 py-3 text-slate-500">{e.date}</td>
                    <td className="px-4 py-3 text-slate-700 font-semibold"><span className="inline-flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />{PAYMENT_LABELS[e.paymentType] || e.paymentType}</span></td>
                    <td className="px-4 py-3 text-slate-500">{e.recipient || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[260px] truncate">{e.description}</td>
                    <td className="px-4 py-3 text-rose-600 font-black">{fmt(Number(e.amount))}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} className="py-16 text-center text-slate-400">لا توجد مصروفات مسجلة</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">تسجيل مصروف جديد</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">الفئة *</label>
                <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  <option value="">— اختر الفئة —</option>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">المبلغ *</label><input required type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" /></div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">طريقة الدفع</label>
                  <select value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="font-bold text-slate-700 block mb-1">المستفيد</label><input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">الوصف *</label><textarea required rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
