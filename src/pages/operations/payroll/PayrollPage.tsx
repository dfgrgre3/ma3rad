import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, Loader2, Trash2, Users, Banknote, Calculator, CheckCircle2, FileDown, Printer, LockKeyhole } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmployeeService, Employee, PayrollTransaction, PayrollTxType, PayrollRun, PayrollRunItem, PayrollPayOptions, PayrollPaymentMethod, PayrollPaymentReconciliation } from '../../../services/domains/hr/EmployeeService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';

import { TX_LABELS, TX_COLORS, fmt, today } from './payrollDisplay';
import { PayrollTransactionModal } from './PayrollTransactionModal';
import { PayrollPayoutModal } from './PayrollPayoutModal';
import { PayrollTaxRulesModal } from './PayrollTaxRulesModal';

import { DataTable } from '../../../components/ui/DataTable';
import { useToast } from '../../../components/ui/Toast';
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
  const toast = useToast();
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
    void (async () => {
      try {
        const [employeeList, transactions, loadedRun] = await Promise.all([
          EmployeeService.getAllAsync(),
          canViewPayroll ? EmployeeService.getTransactionsAsync() : Promise.resolve([]),
          canViewPayroll ? EmployeeService.getPayrollRunAsync(period) : Promise.resolve(null),
        ]);
        setEmployees(employeeList.filter((e) => e.status !== 'SUSPENDED'));
        setTransactions(transactions.slice(0, 100));
        setRun(loadedRun);
        setReconciliation(loadedRun && loadedRun.status !== 'DRAFT' && loadedRun.status !== 'APPROVED'
          ? EmployeeService.getPayrollPaymentReconciliation(loadedRun.id)
          : null);
        setError(null);
      } catch (e: any) { setError(e?.message || 'تعذر تحميل بيانات الرواتب.'); }
      finally { setLoading(false); }
    })();
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
    if (!(amount > 0)) { toast.warning('أدخل مبلغاً صحيحاً.'); return; }
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
    } catch (err: any) { toast.error(err?.message || 'تعذر تسجيل الحركة.'); }
    finally { setSaving(false); }
  };

  const removeTx = (tx: PayrollTransaction) => {
    if (!confirm('حذف حركة الرواتب هذه؟')) return;
    try { EmployeeService.deleteTransaction(tx.id); load(); }
    catch (err: any) { toast.error(err?.message || 'تعذر حذف الحركة.'); }
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
    void (async () => {
      try {
        setPayoutOptions(await EmployeeService.getPayrollPayoutOptionsAsync());
        setPayoutOpen(true);
        setError(null);
      } catch (err: any) { setError(err?.message || 'تعذر تحميل بيانات الصرف.'); }
    })();
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
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<Wallet className="h-5 w-5" />}
          title="الرواتب والمسحوبات"
          description="احتساب مستحقات الموظفين وصرف الرواتب والسلف والمكافآت"
        />
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {error && <div className="px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : (
          <>
            <div className="bg-surface border border-line rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-line bg-surface-muted flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black flex items-center gap-2"><Users className="w-4 h-4 text-muted" /> دورة الرواتب</h3>
                  <p className="text-[10px] text-muted mt-1">احتساب مستقل للفترة المحددة مع تثبيت تفاصيل الأجر والخصومات</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-bold text-ink-secondary">فترة الرواتب
                    <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="mr-2 rounded-lg border border-line bg-surface px-2 py-1.5 font-mono" />
                  </label>
                  {canManagePayroll && <button onClick={calculateRun} disabled={saving || (run !== null && run.status !== 'DRAFT')} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    <Calculator className="h-3.5 w-3.5" /> {run ? 'إعادة الاحتساب' : 'احتساب الرواتب'}
                  </button>}
                  {run && <button onClick={exportRun} className="flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-ink">
                    <FileDown className="h-3.5 w-3.5" /> تصدير CSV
                  </button>}
                  {canManagePayroll && <button onClick={() => setTaxOpen(true)} className="flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-ink">
                    قواعد الضريبة
                  </button>}
                  {run?.status === 'DRAFT' && canApprovePayroll && <button onClick={approveRun} disabled={saving || run.items.some((item) => item.netAmount < 0)} className="flex items-center gap-1 rounded-lg bg-success px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    <CheckCircle2 className="h-3.5 w-3.5" /> اعتماد الكشف
                  </button>}
                  {run?.status === 'APPROVED' && canApprovePayroll && <button onClick={payRun} disabled={saving} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    <Banknote className="h-3.5 w-3.5" /> صرف جماعي
                  </button>}
                  {run?.status === 'PAID' && canApprovePayroll && <button onClick={closeRun} disabled={saving} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    <LockKeyhole className="h-3.5 w-3.5" /> إغلاق الفترة
                  </button>}
                </div>
              </div>
              {run ? <>
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 text-xs">
                  <span className="rounded-full bg-accent-soft px-3 py-1 font-bold text-primary">الحالة: {RUN_STATUS_LABELS[run.status]}</span>
                  <span className="text-muted">{run.items.length} موظف</span>
                  <span className="text-muted">الضريبة كنسبة من الإجمالي؛ تحويل الدقائق على أساس يوم عمل 8 ساعات.</span>
                  {run.status === 'DRAFT' && <span className="text-warning">يمكن أن تتغير المسودة بعد تعديل الحضور أو الحركات؛ أعد الاحتساب قبل الاعتماد.</span>}
                </div>
                <div className="grid grid-cols-1 gap-3 border-b border-line p-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-surface-muted px-4 py-3"><div className="text-[10px] font-bold text-muted">إجمالي الاستحقاقات</div><div className="mt-1 font-black">{fmt(totals.gross)}</div></div>
                  <div className="rounded-xl bg-danger-soft px-4 py-3"><div className="text-[10px] font-bold text-danger">إجمالي الخصومات</div><div className="mt-1 font-black text-danger">{fmt(totals.deductions)}</div></div>
                  <div className="rounded-xl bg-accent-soft px-4 py-3"><div className="text-[10px] font-bold text-primary">صافي مستحق الفترة</div><div className="mt-1 font-black text-primary">{fmt(totals.net)}</div></div>
                </div>
                {reconciliation && (
                  <div className="border-b border-line bg-surface-muted/70 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="font-black text-ink">مطابقة الصرف:</span>
                      <span>المستحق <b className="font-mono">{fmt(reconciliation.expectedTotal)}</b></span>
                      <span>المصروف <b className="font-mono">{fmt(reconciliation.paidTotal)}</b></span>
                      <span className={reconciliation.isBalanced ? 'font-bold text-success' : 'font-bold text-danger'}>
                        {reconciliation.isBalanced ? 'مطابق' : `فرق ${fmt(reconciliation.difference)}`}
                      </span>
                      {reconciliation.byMethod.map((row) => (
                        <span key={row.method} className="rounded-full bg-surface px-2 py-1 text-[10px] font-bold text-ink-secondary">
                          {PAYMENT_METHOD_LABELS[row.method]}: {row.count} / {fmt(row.amount)}
                        </span>
                      ))}
                    </div>
                    {reconciliation.items.flatMap((item) => item.issues.map((issue) => (
                      <div key={`${item.itemId}-${issue}`} className="mt-1 text-[10px] text-warning">{item.employeeName}: {issue}</div>
                    )))}
                  </div>
                )}
                <DataTable
                                    ariaLabel="بنود مسير الرواتب"
                                    rows={run.items}
                                    rowKey={(item) => item.id}
                                    minWidth={1100}
                                    dense
                                    columns={[
                                      {
                                        key: 'employee', header: 'الموظف',
                                        render: (item) => (
                                          <span className="font-bold align-top">{item.employeeName}<div className="mt-1 text-[10px] font-normal text-muted">{item.expectedWorkdays} يوم عمل مستحق</div></span>
                                        ),
                                      },
                                      { key: 'base', header: 'الأساسي', render: (item) => <span className="font-mono">{fmt(item.baseAmount)}</span> },
                                      { key: 'overtime', header: 'الإضافي', render: (item) => <span className="font-mono">{fmt(item.overtimeAmount)}<div className="mt-1 text-[10px] text-muted">{item.overtimeMinutes} دقيقة</div></span> },
                                      { key: 'bonus', header: 'مكافأة وعمولة', render: (item) => <span className="font-mono">{fmt(item.bonusAmount + item.commissionAmount)}</span> },
                                      { key: 'absence', header: 'غياب / إجازة', render: (item) => <span>{item.absentDays} / {item.unpaidLeaveDays} يوم<div className="mt-1 font-mono">{fmt(item.attendanceDeductionAmount)}</div></span> },
                                      { key: 'late', header: 'تأخير', render: (item) => <span>{item.lateMinutes} دقيقة</span> },
                                      { key: 'deductions', header: 'سلف وخصومات', render: (item) => <span className="font-mono">{fmt(item.advanceAmount + item.manualDeductionAmount)}</span> },
                                      { key: 'tax', header: 'ضريبة', render: (item) => <span className="font-mono">{fmt(item.taxAmount)}</span> },
                                      { key: 'net', header: 'الصافي', render: (item) => <span className={`font-mono font-black ${item.netAmount < 0 ? 'text-danger' : 'text-primary'}`}>{fmt(item.netAmount)}</span> },
                                      {
                                        key: 'payout', header: 'الصرف',
                                        render: (item) => (
                                          <span>
                                            <span className="rounded-full bg-surface-sunken px-2 py-1 text-[10px] font-bold text-ink-secondary">{PAYMENT_METHOD_LABELS[item.paymentMethod] || item.paymentMethod}</span>
                                            {item.payoutStatus === 'PAID' && <div className="mt-1 text-[10px] font-bold text-success">مصروف</div>}
                                            {item.paymentReference && <div className="mt-1 max-w-[130px] truncate font-mono text-[10px] text-muted" title={item.paymentReference}>{item.paymentReference}</div>}
                                          </span>
                                        ),
                                      },
                                      {
                                        key: 'payslip', header: 'القسيمة / التحذيرات',
                                        render: (item) => (
                                          <span>
                                            <button onClick={() => printPayslip(item)} className="mb-1 flex items-center gap-1 rounded-lg border border-line px-2 py-1 font-bold text-ink-secondary">
                                              <Printer className="h-3 w-3" /> قسيمة
                                            </button>
                                            {item.warnings.map((warning) => <div key={warning} className="max-w-[220px] text-[10px] text-warning">{warning}</div>)}
                                          </span>
                                        ),
                                      },
                                    ]}
                                    emptyTitle="لا يوجد موظفون مستحقون في هذه الفترة."
                                  />

              </> : <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted">
                <span>لم يتم احتساب رواتب هذه الفترة بعد.</span>
                {canManagePayroll && <button onClick={calculateRun} disabled={saving} className="rounded-lg bg-primary px-4 py-2 font-bold text-white disabled:opacity-50"><Calculator className="ml-1 inline h-4 w-4" /> احتساب المسودة</button>}
              </div>}
            </div>

            <div className="bg-surface border border-line rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-line bg-surface-muted flex items-center justify-between">
                <h3 className="text-sm font-black flex items-center gap-2"><Users className="w-4 h-4 text-muted" /> حركات إضافية للموظفين</h3>
                <span className="text-[10px] text-muted">{employees.length} موظف</span>
              </div>
              <div className="flex flex-wrap gap-2 p-4">
                {employees.map((employee) => <div key={employee.id} className="flex min-w-[250px] flex-1 items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="text-xs font-bold">{employee.name}</span>
                  {canManagePayroll && <div className="flex gap-1">
                    <button onClick={() => openTx(employee, 'ADVANCE')} className="rounded-lg border border-warning-border bg-warning-soft px-2 py-1 text-[10px] font-bold text-warning">سلفة</button>
                    <button onClick={() => openTx(employee, 'BONUS')} className="rounded-lg border border-success-border bg-success-soft px-2 py-1 text-[10px] font-bold text-success">مكافأة</button>
                    <button onClick={() => openTx(employee, 'DEDUCTION')} className="rounded-lg border border-danger-border bg-danger-soft px-2 py-1 text-[10px] font-bold text-danger">خصم</button>
                  </div>}
                </div>)}
              </div>
            </div>

            <div className="bg-surface border border-line rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-line bg-surface-muted flex items-center justify-between">
                <h3 className="text-sm font-black flex items-center gap-2"><Banknote className="w-4 h-4 text-muted" /> آخر حركات الرواتب</h3>
                <span className="text-[10px] text-muted">{transactions.length} حركة</span>
              </div>
              <DataTable
                                ariaLabel="آخر حركات الرواتب"
                                rows={transactions}
                                rowKey={(tx) => tx.id}
                                dense
                                columns={[
                                  { key: 'employee', header: 'الموظف', render: (tx) => <span className="font-bold text-ink">{tx.employeeName || tx.employeeId}</span> },
                                  { key: 'type', header: 'النوع', render: (tx) => <span className={`text-[10px] px-2 py-1 rounded border font-bold ${TX_COLORS[tx.type]}`}>{TX_LABELS[tx.type]}</span> },
                                  { key: 'amount', header: 'المبلغ', render: (tx) => <span className="font-mono font-bold text-ink">{fmt(Number(tx.amount))}</span> },
                                  { key: 'date', header: 'التاريخ', render: (tx) => <span className="text-muted font-mono">{tx.date}</span> },
                                  { key: 'notes', header: 'ملاحظات', render: (tx) => <span className="text-muted text-xs max-w-[240px] truncate block">{tx.notes || '—'}</span> },
                                  { key: 'actions', header: '', render: (tx) => canManagePayroll ? <button onClick={() => removeTx(tx)} className="p-1.5 rounded-lg text-danger hover:bg-danger-soft"><Trash2 className="w-3.5 h-3.5" /></button> : null },
                                ]}
                                emptyTitle="لا توجد حركات رواتب مسجلة"
                              />

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
