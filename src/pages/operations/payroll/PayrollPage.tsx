import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, Loader2, Trash2, Users, Banknote, Calculator, CheckCircle2, FileDown, Printer, LockKeyhole } from 'lucide-react';
import { EmployeeService, Employee, PayrollTransaction, PayrollTxType, PayrollRun, PayrollRunItem, PayrollPayOptions, PayrollPaymentMethod, PayrollPaymentReconciliation } from '../../../services/domains/hr/EmployeeService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';

import { TX_LABELS, TX_COLORS, fmt, today } from './payrollDisplay';
import { PayrollTransactionModal } from './PayrollTransactionModal';
import { PayrollPayoutModal } from './PayrollPayoutModal';
import { PayrollTaxRulesModal } from './PayrollTaxRulesModal';

const PAYMENT_METHOD_LABELS: Record<PayrollPaymentMethod, string> = {
  CASH: 'نقدي',
  BANK_TRANSFER: 'تحويل بنكي',
  WALLET: 'محفظة',
};

const RUN_STATUS_LABELS: Record<PayrollRun['status'], string> = {
  DRAFT: 'مسودة',
  APPROVED: 'معتمدة',
  PAID: 'مصروفة',
  CLOSED: 'مغلقة',
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export const PayrollPage: React.FC = () => {
  const actor = AuthService.getCurrentUser();
  const canViewPayroll = PermissionService.canAny(actor, ['employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve', 'employees.manage']);
  const canManagePayroll = PermissionService.canAny(actor, ['employees.payroll.manage', 'employees.manage']);
  const canApprovePayroll = PermissionService.canAny(actor, ['employees.payroll.approve', 'employees.manage']);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<PayrollTransaction[]>([]);
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Employee | null>(null);
  const [form, setForm] = useState({ type: 'SALARY_PAYOUT' as PayrollTxType, amount: '', date: today(), notes: '' });
  const [saving, setSaving] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [payoutOptions, setPayoutOptions] = useState<{ bankAccounts: Array<{ id: string; accountName: string; bankName: string; accountNumber: string; currentBalance: number }>; registers: Array<{ id: string; name: string; currentBalance: number }> }>({ bankAccounts: [], registers: [] });
  const [reconciliation, setReconciliation] = useState<PayrollPaymentReconciliation | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    try {
      const list = EmployeeService.getAll().filter((e) => e.status !== 'SUSPENDED');
      setEmployees(list);
      setTransactions(canViewPayroll ? EmployeeService.getTransactions().slice(0, 100) : []);
      const loadedRun = canViewPayroll ? EmployeeService.getPayrollRun(period) : null;
      setRun(loadedRun);
      setReconciliation(loadedRun && loadedRun.status !== 'DRAFT' && loadedRun.status !== 'APPROVED'
        ? EmployeeService.getPayrollPaymentReconciliation(loadedRun.id)
        : null);
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل بيانات الرواتب.'); }
    finally { setLoading(false); }
  }, [canViewPayroll, period]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    return (run?.items ?? []).reduce((total, item) => ({
      gross: total.gross + item.grossAmount,
      deductions: total.deductions + item.advanceAmount + item.manualDeductionAmount + item.attendanceDeductionAmount + item.taxAmount,
      net: total.net + item.netAmount,
    }), { gross: 0, deductions: 0, net: 0 });
  }, [run]);

  const openTx = (employee: Employee, type: PayrollTxType) => {
    setTarget(employee);
    setForm({ type, amount: '', date: today(), notes: '' });
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

  const calculateRun = () => {
    setSaving(true);
    try { setRun(EmployeeService.calculatePayrollRun(period)); setError(null); }
    catch (err: any) { setError(err?.message || 'تعذر احتساب دورة الرواتب.'); }
    finally { setSaving(false); }
  };

  const approveRun = () => {
    if (!run || !confirm(`اعتماد كشف رواتب ${run.period}؟ بعد الاعتماد لن يمكن تعديل بيانات الفترة.`)) return;
    setSaving(true);
    try { setRun(EmployeeService.approvePayrollRun(run.id)); setError(null); }
    catch (err: any) { setError(err?.message || 'تعذر اعتماد دورة الرواتب.'); }
    finally { setSaving(false); }
  };

  const payRun = () => {
    if (!run) return;
    try {
      setPayoutOptions(EmployeeService.getPayrollPayoutOptions());
      setPayoutOpen(true);
      setError(null);
    } catch (err: any) { setError(err?.message || 'تعذر تحميل بيانات الصرف.'); }
  };

  const submitPayout = (payout: PayrollPayOptions) => {
    if (!run) return;
    setSaving(true);
    try {
      const paid = EmployeeService.payPayrollRun(run.id, payout);
      setRun(paid);
      setReconciliation(EmployeeService.getPayrollPaymentReconciliation(paid.id));
      setPayoutOpen(false);
      setError(null);
    } catch (err: any) { setError(err?.message || 'تعذر صرف دورة الرواتب.'); }
    finally { setSaving(false); }
  };

  const closeRun = () => {
    if (!run || !confirm(`إغلاق دورة رواتب ${run.period} نهائياً؟`)) return;
    setSaving(true);
    try { setRun(EmployeeService.closePayrollRun(run.id)); setError(null); }
    catch (err: any) { setError(err?.message || 'تعذر إغلاق دورة الرواتب.'); }
    finally { setSaving(false); }
  };

  const exportRun = () => {
    if (!run) return;
    const rows = [
      ['الموظف', 'الراتب الأساسي المستحق', 'إضافي', 'مكافآت', 'عمولات معتمدة', 'غياب', 'إجازة غير مدفوعة', 'تأخير', 'السلف', 'خصومات', 'ضريبة', 'الصافي'],
      ...run.items.map((item) => [
        item.employeeName, item.baseAmount, item.overtimeAmount, item.bonusAmount, item.commissionAmount,
        item.absentDays, item.unpaidLeaveDays, item.lateMinutes, item.advanceAmount,
        item.manualDeductionAmount + item.attendanceDeductionAmount, item.taxAmount, item.netAmount,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll-${run.period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printPayslip = (item: PayrollRunItem) => {
    const printWindow = window.open('', '_blank', 'width=850,height=700');
    if (!printWindow) {
      setError('تعذر فتح نافذة قسيمة الراتب؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
      return;
    }
    const lines: Array<[string, number]> = [
      ['الراتب الأساسي المستحق', item.baseAmount],
      ['العمل الإضافي', item.overtimeAmount],
      ['المكافآت', item.bonusAmount],
      ['العمولات المعتمدة', item.commissionAmount],
      ['خصم الغياب والإجازة غير المدفوعة والتأخير', item.attendanceDeductionAmount],
      ['السلف', item.advanceAmount],
      ['الخصومات المعتمدة', item.manualDeductionAmount],
      ['الضريبة', item.taxAmount],
      ['دفعات سابقة خلال الفترة', item.details.previousPayoutAmount],
    ];
    const content = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>قسيمة راتب ${escapeHtml(item.employeeName)}</title>
      <style>body{font-family:Arial,sans-serif;margin:32px;color:#0f172a}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border-bottom:1px solid #cbd5e1;padding:12px;text-align:right}th{background:#f1f5f9}.total{font-weight:bold;font-size:18px}</style>
      <h1>قسيمة راتب - ${escapeHtml(item.employeeName)}</h1><p>الفترة: ${escapeHtml(run?.period ?? period)}</p>
      <table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>
      ${lines.map(([label, amount]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(fmt(amount))}</td></tr>`).join('')}
      <tr class="total"><td>صافي المستحق</td><td>${escapeHtml(fmt(item.netAmount))}</td></tr></tbody></table>
      <script>window.onload=()=>window.print()</script></html>`;
    printWindow.document.write(content);
    printWindow.document.close();
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

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {error && <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div> : (
          <>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> دورة الرواتب</h3>
                  <p className="text-[10px] text-slate-500 mt-1">احتساب مستقل للفترة المحددة مع تثبيت تفاصيل الأجر والخصومات</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-bold text-slate-600">فترة الرواتب
                    <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="mr-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono" />
                  </label>
                  {canManagePayroll && <button onClick={calculateRun} disabled={saving || (run !== null && run.status !== 'DRAFT')} className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    <Calculator className="h-3.5 w-3.5" /> {run ? 'إعادة الاحتساب' : 'احتساب الرواتب'}
                  </button>}
                  {run && <button onClick={exportRun} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                    <FileDown className="h-3.5 w-3.5" /> تصدير CSV
                  </button>}
                  {canManagePayroll && <button onClick={() => setTaxOpen(true)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                    قواعد الضريبة
                  </button>}
                  {run?.status === 'DRAFT' && canApprovePayroll && <button onClick={approveRun} disabled={saving || run.items.some((item) => item.netAmount < 0)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    <CheckCircle2 className="h-3.5 w-3.5" /> اعتماد الكشف
                  </button>}
                  {run?.status === 'APPROVED' && canApprovePayroll && <button onClick={payRun} disabled={saving} className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    <Banknote className="h-3.5 w-3.5" /> صرف جماعي
                  </button>}
                  {run?.status === 'PAID' && canApprovePayroll && <button onClick={closeRun} disabled={saving} className="flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    <LockKeyhole className="h-3.5 w-3.5" /> إغلاق الفترة
                  </button>}
                </div>
              </div>
              {run ? <>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs">
                  <span className="rounded-full bg-sky-50 px-3 py-1 font-bold text-sky-700">الحالة: {RUN_STATUS_LABELS[run.status]}</span>
                  <span className="text-slate-500">{run.items.length} موظف</span>
                  <span className="text-slate-500">الضريبة كنسبة من الإجمالي؛ تحويل الدقائق على أساس يوم عمل 8 ساعات.</span>
                  {run.status === 'DRAFT' && <span className="text-amber-700">يمكن أن تتغير المسودة بعد تعديل الحضور أو الحركات؛ أعد الاحتساب قبل الاعتماد.</span>}
                </div>
                <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-[10px] font-bold text-slate-500">إجمالي الاستحقاقات</div><div className="mt-1 font-black">{fmt(totals.gross)}</div></div>
                  <div className="rounded-xl bg-rose-50 px-4 py-3"><div className="text-[10px] font-bold text-rose-700">إجمالي الخصومات</div><div className="mt-1 font-black text-rose-700">{fmt(totals.deductions)}</div></div>
                  <div className="rounded-xl bg-sky-50 px-4 py-3"><div className="text-[10px] font-bold text-sky-700">صافي مستحق الفترة</div><div className="mt-1 font-black text-sky-700">{fmt(totals.net)}</div></div>
                </div>
                {reconciliation && (
                  <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="font-black text-slate-700">مطابقة الصرف:</span>
                      <span>المستحق <b className="font-mono">{fmt(reconciliation.expectedTotal)}</b></span>
                      <span>المصروف <b className="font-mono">{fmt(reconciliation.paidTotal)}</b></span>
                      <span className={reconciliation.isBalanced ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>
                        {reconciliation.isBalanced ? 'مطابق' : `فرق ${fmt(reconciliation.difference)}`}
                      </span>
                      {reconciliation.byMethod.map((row) => (
                        <span key={row.method} className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600">
                          {PAYMENT_METHOD_LABELS[row.method]}: {row.count} / {fmt(row.amount)}
                        </span>
                      ))}
                    </div>
                    {reconciliation.items.flatMap((item) => item.issues.map((issue) => (
                      <div key={`${item.itemId}-${issue}`} className="mt-1 text-[10px] text-amber-700">{item.employeeName}: {issue}</div>
                    )))}
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-right text-xs">
                    <thead className="border-b border-slate-200 bg-white">
                      <tr>{['الموظف', 'الأساسي', 'الإضافي', 'مكافأة وعمولة', 'غياب / إجازة', 'تأخير', 'سلف وخصومات', 'ضريبة', 'الصافي', 'الصرف', 'القسيمة / التحذيرات'].map((heading) => <th key={heading} className="px-3 py-3 font-bold text-slate-500">{heading}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {run.items.map((item) => (
                        <tr key={item.id} className="align-top hover:bg-slate-50/70">
                          <td className="px-3 py-3 font-bold">{item.employeeName}<div className="mt-1 text-[10px] font-normal text-slate-400">{item.expectedWorkdays} يوم عمل مستحق</div></td>
                          <td className="px-3 py-3 font-mono">{fmt(item.baseAmount)}</td>
                          <td className="px-3 py-3 font-mono">{fmt(item.overtimeAmount)}<div className="mt-1 text-[10px] text-slate-400">{item.overtimeMinutes} دقيقة</div></td>
                          <td className="px-3 py-3 font-mono">{fmt(item.bonusAmount + item.commissionAmount)}</td>
                          <td className="px-3 py-3">{item.absentDays} / {item.unpaidLeaveDays} يوم<div className="mt-1 font-mono">{fmt(item.attendanceDeductionAmount)}</div></td>
                          <td className="px-3 py-3">{item.lateMinutes} دقيقة</td>
                          <td className="px-3 py-3 font-mono">{fmt(item.advanceAmount + item.manualDeductionAmount)}</td>
                          <td className="px-3 py-3 font-mono">{fmt(item.taxAmount)}</td>
                          <td className={`px-3 py-3 font-mono font-black ${item.netAmount < 0 ? 'text-rose-700' : 'text-sky-700'}`}>{fmt(item.netAmount)}</td>
                          <td className="px-3 py-3">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{PAYMENT_METHOD_LABELS[item.paymentMethod] || item.paymentMethod}</span>
                            {item.payoutStatus === 'PAID' && <div className="mt-1 text-[10px] font-bold text-emerald-700">مصروف</div>}
                            {item.paymentReference && <div className="mt-1 max-w-[130px] truncate font-mono text-[10px] text-slate-400" title={item.paymentReference}>{item.paymentReference}</div>}
                          </td>
                          <td className="px-3 py-3">
                            <button onClick={() => printPayslip(item)} className="mb-1 flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-bold text-slate-600">
                              <Printer className="h-3 w-3" /> قسيمة
                            </button>
                            {item.warnings.map((warning) => <div key={warning} className="max-w-[220px] text-[10px] text-amber-700">{warning}</div>)}
                          </td>
                        </tr>
                      ))}
                      {!run.items.length && <tr><td colSpan={11} className="py-10 text-center text-slate-400">لا يوجد موظفون مستحقون في هذه الفترة.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </> : <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-slate-500">
                <span>لم يتم احتساب رواتب هذه الفترة بعد.</span>
                {canManagePayroll && <button onClick={calculateRun} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 font-bold text-white disabled:opacity-50"><Calculator className="ml-1 inline h-4 w-4" /> احتساب المسودة</button>}
              </div>}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-black flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> حركات إضافية للموظفين</h3>
                <span className="text-[10px] text-slate-400">{employees.length} موظف</span>
              </div>
              <div className="flex flex-wrap gap-2 p-4">
                {employees.map((employee) => <div key={employee.id} className="flex min-w-[250px] flex-1 items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                  <span className="text-xs font-bold">{employee.name}</span>
                  {canManagePayroll && <div className="flex gap-1">
                    <button onClick={() => openTx(employee, 'ADVANCE')} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">سلفة</button>
                    <button onClick={() => openTx(employee, 'BONUS')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">مكافأة</button>
                    <button onClick={() => openTx(employee, 'DEDUCTION')} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">خصم</button>
                  </div>}
                </div>)}
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
                        <td className="px-4 py-2.5">{canManagePayroll && <button onClick={() => removeTx(tx)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
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

      {target && <PayrollTransactionModal target={target} form={form} setForm={setForm} saving={saving} onClose={() => setTarget(null)} onSubmit={submit} />}
      {payoutOpen && run && (
        <PayrollPayoutModal
          run={run}
          options={payoutOptions}
          saving={saving}
          onClose={() => setPayoutOpen(false)}
          onSubmit={submitPayout}
        />
      )}
      {taxOpen && <PayrollTaxRulesModal open={taxOpen} onClose={() => { setTaxOpen(false); load(); }} />}
    </div>
  );
};
