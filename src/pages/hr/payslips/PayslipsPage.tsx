import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Printer, FileDown, Loader2, AlertTriangle, ChevronRight, Wallet, CheckCircle2, Clock } from 'lucide-react';
import { EmployeeService, Employee, PayrollRun, PayrollRunItem } from '../../../services/domains/hr/EmployeeService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { fmt } from '../../../pages/operations/payroll/payrollDisplay';
import { localDateString } from '../../../utils/shared/date';

const RUN_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'مسودة',
  APPROVED: 'معتمدة',
  PAID: 'مصروفة',
  CLOSED: 'مغلقة',
};

const money = (n: number) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

export const PayslipsPage: React.FC = () => {
  const actor = AuthService.getCurrentUser();
  const canViewPayroll = PermissionService.canAny(actor, ['employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve', 'employees.manage']);
  const [periods, setPeriods] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    try {
      if (!canViewPayroll) {
        setPeriods([]);
        setRun(null);
        setSelectedPeriod(null);
        setError(null);
        return;
      }
      const allRuns = EmployeeService.getAllPayrollRuns();
      setPeriods(allRuns.map((r) => r.period));
      const current = localDateString().slice(0, 7);
      const defaultPeriod = allRuns.find((r) => r.period === current) ?? allRuns[0] ?? null;
      if (defaultPeriod) {
        setSelectedPeriod(defaultPeriod.period);
        setRun(defaultPeriod);
      } else {
        setRun(null);
        setSelectedPeriod(null);
      }
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل فترات الرواتب.');
    } finally {
      setLoading(false);
    }
  }, [canViewPayroll]);

  useEffect(() => { load(); }, [load]);

  const loadPeriod = useCallback((period: string) => {
    setLoading(true);
    try {
      const loadedRun = EmployeeService.getPayrollRun(period);
      setRun(loadedRun);
      setSelectedPeriod(period);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل كشوف الرواتب لهذه الفترة.');
      setRun(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const printPayslip = (item: PayrollRunItem) => {
    setPrinting(item.id);
    try {
      const printWindow = window.open('', '_blank', 'width=850,height=900');
      if (!printWindow) {
        setError('تعذر فتح نافذة طباعة قسيمة الراتب. يرجى السماح بالنوافذ المنبثقة.');
        setPrinting(null);
        return;
      }
      const lines: Array<[string, number]> = [
        ['الراتب الأساسي', item.baseAmount],
        ['العمل الإضافي', item.overtimeAmount],
        ['المكافآت', item.bonusAmount],
        ['العمولات المعتمدة', item.commissionAmount],
        ['البدلات الشهرية', item.allowanceAmount],
        ['خصم الغياب والإجازة غير المدفوعة', item.attendanceDeductionAmount],
        ['السلف', item.advanceAmount],
        ['الخصومات المعتمدة', item.manualDeductionAmount],
        ['أقساط القروض', item.loanDeductionAmount],
        ['الضريبة', item.taxAmount],
        ['تأمينات اجتماعية (جزء الموظف)', item.socialInsuranceEmployeeShare],
        ['دفعات سابقة خلال الفترة', item.details.previousPayoutAmount],
      ];
      const content = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>قسيمة راتب - ${escapeHtml(item.employeeName)} - ${escapeHtml(run?.period ?? selectedPeriod ?? '')}</title>
      <style>
        @page { margin: 18mm; }
        body { font-family: 'Tahoma', 'Segoe UI', Arial, sans-serif; margin: 0; color: #0f172a; font-size: 13px; line-height: 1.5; }
        .header { border-bottom: 3px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
        .title h1 { font-size: 20px; margin: 0; font-weight: bold; }
        .title p { margin: 4px 0 0; color: #475569; font-size: 12px; }
        .company { text-align: left; font-size: 12px; color: #475569; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
        th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: right; }
        th { background: #f1f5f9; font-weight: bold; color: #334155; width: 55%; }
        td.amount { font-family: 'Courier New', monospace; font-weight: bold; text-align: left; width: 45%; }
        .total-row { font-weight: bold; font-size: 15px; background: #f8fafc; border-top: 2px solid #0f172a; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0; font-size: 12px; color: #475569; }
        .meta div { display: flex; justify-content: space-between; }
        .footer { margin-top: 32px; border-top: 1px solid #cbd5e1; padding-top: 12px; font-size: 11px; color: #64748b; text-align: center; }
        .warnings { margin: 16px 0; padding: 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; font-size: 12px; color: #92400e; }
        .warning-item { margin: 4px 0; }
      </style>
      <div class="header">
        <div class="title">
          <h1>قسيمة راتب شهرية</h1>
          <p>الموظف: ${escapeHtml(item.employeeName)} • الفترة: ${escapeHtml(run?.period ?? selectedPeriod ?? '')}</p>
        </div>
        <div class="company">الشركة / المنشأة</div>
      </div>
      <div class="meta">
        <div><span>الوظيفة:</span> <strong>${escapeHtml(run?.items.find((i) => i.id === item.id)?.employeeName ?? '')}</strong></div>
        <div><span>طريقة الصرف:</span> <strong>${item.paymentMethod === 'CASH' ? 'نقدي' : item.paymentMethod === 'BANK_TRANSFER' ? 'تحويل بنكي' : 'محفظة إلكترونية'}</strong></div>
        <div><span>حالة الكشف:</span> <strong>${RUN_STATUS_LABELS[run?.status ?? 'DRAFT'] ?? run?.status}</strong></div>
        <div><span>تاريخ الطباعة:</span> <strong>${new Date().toLocaleDateString('ar-EG')}</strong></div>
      </div>
      ${item.warnings && item.warnings.length ? `<div class="warnings"><div style="font-weight:bold">تنبيهات:</div>${item.warnings.map((w) => `<div class="warning-item">• ${escapeHtml(w)}</div>`).join('')}</div>` : ''}
      <table>
        <thead><tr><th>البند</th><th>المبلغ</th></tr></thead>
        <tbody>
        ${lines.map(([label, amount]) => `<tr><td>${escapeHtml(label)}</td><td class="amount">${money(amount)}</td></tr>`).join('')}
        <tr class="total-row"><td>صافي الراتب المستحق</td><td class="amount">${money(item.netAmount)}</td></tr>
        </tbody>
      </table>
      <div class="footer">قسيمة راتب إلكترونية تُنشأ من نظام إدارة الموارد البشرية. هذه القسيمة توثيق Informational ولا تُعتبر بديلاً عن السند المالي الموقع.</div>
      <script>window.onload = () => { window.print(); setTimeout(() => { try { window.close(); } catch { } }, 500); }</script>
      </html>`;
      printWindow.document.write(content);
      printWindow.document.close();
    } catch (e: any) {
      setError(e?.message || 'تعذر طباعة قسيمة الراتب.');
    } finally {
      setPrinting(null);
    }
  };

  const exportPeriodCsv = () => {
    if (!run) return;
    const rows = [
      ['الموظف', 'الراتب الأساسي', 'إضافي', 'مكافآت', 'عمولات', 'بدلات', 'خصم حضور', 'سلف', 'خصومات', 'أقساط قروض', 'ضريبة', 'تأمينات موظف', 'الإجمالي', 'الصافي', 'طريقة الصرف', 'حالة الصرف'],
      ...run.items.map((item) => [
        item.employeeName, item.baseAmount, item.overtimeAmount, item.bonusAmount, item.commissionAmount, item.allowanceAmount,
        item.attendanceDeductionAmount, item.advanceAmount, item.manualDeductionAmount, item.loanDeductionAmount,
        item.taxAmount, item.socialInsuranceEmployeeShare, item.grossAmount, item.netAmount,
        item.paymentMethod === 'CASH' ? 'نقدي' : item.paymentMethod === 'BANK_TRANSFER' ? 'تحويل بنكي' : 'محفظة',
        item.payoutStatus === 'PAID' ? 'مصروف' : 'معلق',
      ]),
    ];
    const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `payslips-${run.period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totals = useMemo(() => {
    if (!run) return { gross: 0, net: 0, count: 0 };
    return {
      gross: run.items.reduce((s, i) => s + i.grossAmount, 0),
      net: run.items.reduce((s, i) => s + i.netAmount, 0),
      count: run.items.length,
    };
  }, [run]);

  if (!canViewPayroll) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        ليس لديك صلاحية عرض كشوف المرتبات.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 bg-slate-50 text-slate-900" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">كشوف المرتبات الشهرية</h1>
            <p className="text-xs text-slate-400">عرض وطباعة وتصدير كشوف رواتب الموظفين لكل فترة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {run && <button onClick={exportPeriodCsv} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <FileDown className="w-3.5 h-3.5" /> تصدير الفترة CSV
          </button>}
        </div>
      </div>

      {error && (
        <div className="mx-6 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="mx-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
          </div>
        ) : periods.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Clock className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-sm font-black text-slate-900">لا توجد فترات رواتب</h3>
            <p className="text-xs text-slate-500 mt-1">لم يتم احتساب أي دورة رواتب بعد. انتقل إلى صفحة الرواتب لحساب فترة أولى.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">الفترة المختارة</p>
                <p className="text-xl font-black text-slate-900 mt-1">{selectedPeriod || '—'}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">عدد الكشوف</p>
                <p className="text-xl font-black text-slate-900 mt-1">{run?.items.length ?? 0}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">إجمالي الاستحقاقات</p>
                <p className="text-xl font-black text-slate-900 mt-1">{fmt(totals.gross)}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">صافي المستحق</p>
                <p className="text-xl font-black text-slate-900 mt-1">{fmt(totals.net)}</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" /> فترات الرواتب المتاحة
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1">اختر فترة لعرض كشوف رواتب جميع الموظفين فيها</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {periods.map((p) => {
                    const isSelected = p === selectedPeriod;
                    const runForPeriod = periods.map(() => null); // placeholder
                    return (
                      <button
                        key={p}
                        onClick={() => loadPeriod(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          isSelected
                            ? 'bg-sky-600 text-white'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {run ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1200px] text-right text-xs">
                    <thead className="border-b border-slate-200 bg-white sticky top-0">
                      <tr>
                        {[
                          'الموظف', 'الأساسي', 'إضافي', 'مكافآت وعمولات', 'بدلات', 'الخصومات', 'ضريبة', 'تأمينات',
                          'السلف والقروض', 'الإجمالي', 'الصافي', 'حالة الصرف', 'إجراءات',
                        ].map((heading) => (
                          <th key={heading} className="px-3 py-3 font-bold text-slate-500">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {run.items.map((item) => (
                        <tr key={item.id} className="align-top hover:bg-slate-50/70">
                          <td className="px-3 py-3 font-bold text-slate-800">
                            {item.employeeName}
                            <div className="mt-1 text-[10px] font-normal text-slate-400">{item.paymentMethod === 'CASH' ? 'نقدي' : item.paymentMethod === 'BANK_TRANSFER' ? 'تحويل بنكي' : 'محفظة'}</div>
                          </td>
                          <td className="px-3 py-3 font-mono">{money(item.baseAmount)}</td>
                          <td className="px-3 py-3 font-mono">{money(item.overtimeAmount)}</td>
                          <td className="px-3 py-3 font-mono">{money(item.bonusAmount + item.commissionAmount)}</td>
                          <td className="px-3 py-3 font-mono">{money(item.allowanceAmount)}</td>
                          <td className="px-3 py-3 font-mono">{money(item.attendanceDeductionAmount + item.manualDeductionAmount)}</td>
                          <td className="px-3 py-3 font-mono">{money(item.taxAmount)}</td>
                          <td className="px-3 py-3 font-mono">{money(item.socialInsuranceEmployeeShare)}</td>
                          <td className="px-3 py-3 font-mono">{money(item.advanceAmount + item.loanDeductionAmount)}</td>
                          <td className="px-3 py-3 font-mono font-bold">{money(item.grossAmount)}</td>
                          <td className={`px-3 py-3 font-mono font-black ${item.netAmount < 0 ? 'text-rose-700' : 'text-sky-700'}`}>{money(item.netAmount)}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.payoutStatus === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {item.payoutStatus === 'PAID' ? 'مصروف' : 'معلق'}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => printPayslip(item)}
                              disabled={printing === item.id}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold text-slate-600 disabled:opacity-50"
                            >
                              {printing === item.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Printer className="w-2.5 h-2.5" />}
                              قسيمة
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!run.items.length && (
                        <tr><td colSpan={13} className="py-12 text-center text-slate-400">لا يوجد موظفون مستحقون في هذه الفترة.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-10 text-center text-slate-500">اختر فترة من القائمة أعلاه لعرض كشوف الرواتب.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
