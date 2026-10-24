import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Loader2, X, Plus, Trash2, Users, Banknote } from 'lucide-react';
import { EmployeeService, Employee, PayrollTransaction, PayrollTxType, EmployeeFinancials } from '../../services/EmployeeService';
import { AuthService } from '../../services/AuthService';
import { localDateString } from '../../utils/date';

const TX_LABELS: Record<PayrollTxType, string> = { SALARY_PAYOUT: 'صرف راتب', ADVANCE: 'سلفة', BONUS: 'مكافأة', DEDUCTION: 'خصم' };
const TX_COLORS: Record<PayrollTxType, string> = {
  SALARY_PAYOUT: 'bg-sky-50 text-sky-700 border-sky-200',
  ADVANCE: 'bg-amber-50 text-amber-700 border-amber-200',
  BONUS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DEDUCTION: 'bg-rose-50 text-rose-700 border-rose-200',
};
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';
const today = () => localDateString();

export const PayrollPage: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [financials, setFinancials] = useState<Record<string, EmployeeFinancials>>({});
  const [transactions, setTransactions] = useState<PayrollTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Employee | null>(null);
  const [form, setForm] = useState({ type: 'SALARY_PAYOUT' as PayrollTxType, amount: '', date: today(), notes: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    try {
      const list = EmployeeService.getAll().filter((e) => e.status !== 'SUSPENDED');
      setEmployees(list);
      const map: Record<string, EmployeeFinancials> = {};
      list.forEach((e) => { map[e.id] = EmployeeService.getEmployeeFinancials(e.id); });
      setFinancials(map);
      setTransactions(EmployeeService.getTransactions().slice(0, 100));
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل بيانات الرواتب.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    let salaries = 0, advances = 0, bonuses = 0, deductions = 0, payouts = 0, netDue = 0;
    employees.forEach((e) => {
      const f = financials[e.id];
      if (!f) return;
      salaries += e.salaryType === 'DAILY' ? Number(e.baseSalary) * 26 : Number(e.baseSalary);
      advances += Number(f.advances); bonuses += Number(f.bonuses); deductions += Number(f.deductions);
      payouts += Number(f.payouts); netDue += Number(f.netDue);
    });
    return { salaries, advances, bonuses, deductions, payouts, netDue };
  }, [employees, financials]);

  const openTx = (employee: Employee, type: PayrollTxType) => {
    setTarget(employee);
    setForm({ type, amount: type === 'SALARY_PAYOUT' ? String(Math.max(0, financials[employee.id]?.netDue || 0)) : '', date: today(), notes: '' });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const amount = Number(form.amount);
    if (!(amount > 0)) { alert('أدخل مبلغاً صحيحاً.'); return; }
    setSaving(true);
    try {
      EmployeeService.addTransaction({
        employeeId: target.id,
        type: form.type,
        amount,
        date: form.date,
        notes: form.notes,
        createdBy: AuthService.getCurrentUser()?.id,
      });
      setTarget(null);
      load();
    } catch (err: any) { alert(err?.message || 'تعذر تسجيل الحركة.'); }
    finally { setSaving(false); }
  };

  const removeTx = (tx: PayrollTransaction) => {
    if (!confirm('حذف حركة الرواتب هذه؟')) return;
    try { EmployeeService.deleteTransaction(tx.id); load(); }
    catch (err: any) { alert(err?.message || 'تعذر حذف الحركة.'); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center"><Wallet className="w-5 h-5 text-sky-600" /></div>
        <div>
          <h1 className="text-base font-black">الرواتب والمسحوبات</h1>
          <p className="text-xs text-slate-500 font-medium">احتساب مستحقات الموظفين وصرف الرواتب والسلف والمكافآت</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-white border-b border-slate-200">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[10px] font-bold text-slate-500">إجمالي الرواتب الشهرية</div>
          <div className="text-lg font-black text-slate-900 mt-1">{fmt(totals.salaries)}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-[10px] font-bold text-amber-700">السلف الممنوحة</div>
          <div className="text-lg font-black text-amber-700 mt-1">{fmt(totals.advances)}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-[10px] font-bold text-emerald-700">المكافآت</div>
          <div className="text-lg font-black text-emerald-700 mt-1">{fmt(totals.bonuses)}</div>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <div className="text-[10px] font-bold text-sky-700">صافي المستحق للصرف</div>
          <div className="text-lg font-black text-sky-700 mt-1">{fmt(totals.netDue)}</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {error && <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div> : (
          <>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-black flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> كشف مستحقات الموظفين</h3>
                <span className="text-[10px] text-slate-400">{employees.length} موظف</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right min-w-[760px]">
                  <thead className="bg-white border-b border-slate-200">
                    <tr>{['الموظف', 'الراتب الأساسي', 'السلف', 'المكافآت', 'الخصومات', 'المدفوع', 'الصافي', 'إجراء'].map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employees.map((e) => {
                      const f = financials[e.id] || { baseSalary: 0, advances: 0, bonuses: 0, deductions: 0, payouts: 0, netDue: 0 };
                      const salary = e.salaryType === 'DAILY' ? Number(e.baseSalary) * 26 : Number(e.baseSalary);
                      return (
                        <tr key={e.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-800">{e.name}</div>
                            <div className="text-[10px] text-slate-400">{e.role}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-700">{fmt(salary)}</td>
                          <td className="px-4 py-3 font-mono text-amber-700">{fmt(Number(f.advances))}</td>
                          <td className="px-4 py-3 font-mono text-emerald-700">{fmt(Number(f.bonuses))}</td>
                          <td className="px-4 py-3 font-mono text-rose-700">{fmt(Number(f.deductions))}</td>
                          <td className="px-4 py-3 font-mono text-slate-500">{fmt(Number(f.payouts))}</td>
                          <td className={`px-4 py-3 font-mono font-black ${Number(f.netDue) >= 0 ? 'text-sky-700' : 'text-rose-700'}`}>{fmt(Number(f.netDue))}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              <button onClick={() => openTx(e, 'SALARY_PAYOUT')} className="text-[10px] px-2 py-1 rounded-lg bg-sky-600 text-white font-bold hover:bg-sky-700">صرف راتب</button>
                              <button onClick={() => openTx(e, 'ADVANCE')} className="text-[10px] px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-bold hover:bg-amber-100">سلفة</button>
                              <button onClick={() => openTx(e, 'BONUS')} className="text-[10px] px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold hover:bg-emerald-100">مكافأة</button>
                              <button onClick={() => openTx(e, 'DEDUCTION')} className="text-[10px] px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold hover:bg-rose-100">خصم</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {employees.length === 0 && <tr><td colSpan={8} className="py-16 text-center text-slate-400">لا يوجد موظفون مسجلون</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-black flex items-center gap-2"><Banknote className="w-4 h-4 text-slate-400" /> آخر حركات الرواتب</h3>
                <span className="text-[10px] text-slate-400">{transactions.length} حركة</span>
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-white border-b border-slate-200 sticky top-0">
                    <tr>{['الموظف', 'النوع', 'المبلغ', 'التاريخ', 'ملاحظات', ''].map((h) => <th key={h} className="px-4 py-2.5 text-xs font-bold text-slate-500">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-bold text-slate-700">{tx.employeeName || tx.employeeId}</td>
                        <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-1 rounded border font-bold ${TX_COLORS[tx.type]}`}>{TX_LABELS[tx.type]}</span></td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-800">{fmt(Number(tx.amount))}</td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono">{tx.date}</td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs max-w-[240px] truncate">{tx.notes || '—'}</td>
                        <td className="px-4 py-2.5"><button onClick={() => removeTx(tx)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                    {transactions.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-slate-400">لا توجد حركات رواتب مسجلة</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {target && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold">{TX_LABELS[form.type]}</h3>
              <button onClick={() => setTarget(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="mb-3 text-xs text-slate-500">الموظف: <span className="font-bold text-slate-800">{target.name}</span></div>
            <form onSubmit={submit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">نوع الحركة</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PayrollTxType })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  {(Object.keys(TX_LABELS) as PayrollTxType[]).map((t) => <option key={t} value={t}>{TX_LABELS[t]}</option>)}
                </select>
              </div>
              <div><label className="font-bold text-slate-700 block mb-1">المبلغ *</label><input required autoFocus type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">التاريخ *</label><input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">ملاحظات</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} <Plus className="w-3.5 h-3.5" /> تسجيل</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
