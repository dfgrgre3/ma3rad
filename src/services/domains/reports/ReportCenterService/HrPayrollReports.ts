import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

export function HrPayrollReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class HrPayrollReports extends Base {
  public async hrPayrollSummary({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('pr.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT pr.period, COALESCE(e.name, '—') AS employeeName,
        COALESCE(prt.base_amount, 0) / 100.0 AS baseAmount,
        COALESCE(prt.overtime_amount, 0) / 100.0 AS overtimeAmount,
        COALESCE(prt.bonus_amount, 0) / 100.0 AS bonusAmount,
        COALESCE(prt.commission_amount, 0) / 100.0 AS commissionAmount,
        COALESCE(prt.attendance_deduction_amount, 0) / 100.0 AS attendanceDeduction,
        COALESCE(prt.manual_deduction_amount, 0) / 100.0 AS manualDeduction,
        COALESCE(prt.advance_amount, 0) / 100.0 AS advanceAmount,
        COALESCE(prt.tax_amount, 0) / 100.0 AS taxAmount,
        COALESCE(prt.net_amount, 0) / 100.0 AS netAmount,
        COALESCE(prt.payment_method, 'CASH') AS paymentMethod,
        COALESCE(prt.payout_status, 'PENDING') AS payoutStatus
      FROM payroll_runs pr
      JOIN payroll_run_items prt ON prt.payroll_run_id = pr.id
      LEFT JOIN employees e ON e.id = prt.employee_id
      WHERE pr.period >= ? AND pr.period <= ? AND ${scope.clause}
      ORDER BY pr.period, e.name
    `, [from.slice(0, 7), to.slice(0, 7), ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      baseAmount: round2(num(row.baseAmount)),
      overtimeAmount: round2(num(row.overtimeAmount)),
      bonusAmount: round2(num(row.bonusAmount)),
      commissionAmount: round2(num(row.commissionAmount)),
      attendanceDeduction: round2(num(row.attendanceDeduction)),
      manualDeduction: round2(num(row.manualDeduction)),
      advanceAmount: round2(num(row.advanceAmount)),
      taxAmount: round2(num(row.taxAmount)),
      netAmount: round2(num(row.netAmount)),
    }));
    return {
      kpis: [
        { label: 'دورات/موظفين', value: result.length, tone: 'info' },
        { label: 'إجمالي الاستحقاقات', value: round2(result.reduce((t, r) => t + r.baseAmount + r.overtimeAmount + r.bonusAmount + r.commissionAmount, 0)), tone: 'success' },
        { label: 'إجمالي الخصومات والضرائب', value: round2(result.reduce((t, r) => t + r.attendanceDeduction + r.manualDeduction + r.advanceAmount + r.taxAmount, 0)), tone: 'danger' },
        { label: 'صافي الرواتب', value: round2(result.reduce((t, r) => t + r.netAmount, 0)), tone: 'success' },
      ],
      columns: [
        { key: 'period', label: 'الفترة' },
        { key: 'employeeName', label: 'الموظف' },
        { key: 'baseAmount', label: 'الأساسي', type: 'currency' },
        { key: 'overtimeAmount', label: 'إضافي', type: 'currency' },
        { key: 'bonusAmount', label: 'مكافأة', type: 'currency' },
        { key: 'commissionAmount', label: 'عمولة', type: 'currency' },
        { key: 'attendanceDeduction', label: 'غياب/تأخير', type: 'currency' },
        { key: 'manualDeduction', label: 'خصومات', type: 'currency' },
        { key: 'advanceAmount', label: 'سلف', type: 'currency' },
        { key: 'taxAmount', label: 'ضريبة', type: 'currency' },
        { key: 'netAmount', label: 'الصافي', type: 'currency' },
        { key: 'paymentMethod', label: 'طريقة الصرف', type: 'badge' },
        { key: 'payoutStatus', label: 'حالة الصرف', type: 'badge' },
      ],
      rows: result,
      notes: ['يستخدم دورات الرواتب (مسودة/معتمدة/مصروفة).'],
    };
  }
  public async hrPayrollPayouts({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('pt.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT pt.date, COALESCE(e.name, '—') AS employeeName, pt.type, pt.amount / 100.0 AS amount,
        COALESCE(pt.payment_method, 'CASH') AS paymentMethod,
        pt.bank_account_id AS bankAccountId, pt.reference_number AS referenceNumber,
        pt.proof_reference AS proofReference, pt.payment_status AS paymentStatus
      FROM payroll_transactions pt
      LEFT JOIN employees e ON e.id = pt.employee_id
      WHERE pt.type = 'SALARY_PAYOUT' AND substr(pt.date, 1, 10) >= ? AND substr(pt.date, 1, 10) <= ?
        AND ${scope.clause}
      ORDER BY pt.date DESC, e.name
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      amount: round2(num(row.amount)),
    }));
    const byMethod = (method: string) => result.filter((row) => row.paymentMethod === method);
    return {
      kpis: [
        { label: 'عدد عمليات الصرف', value: result.length, tone: 'info' },
        { label: 'نقدي', value: round2(byMethod('CASH').reduce((t, r) => t + r.amount, 0)), tone: 'success' },
        { label: 'تحويل بنكي', value: round2(byMethod('BANK_TRANSFER').reduce((t, r) => t + r.amount, 0)), tone: 'info' },
        { label: 'محفظة', value: round2(byMethod('WALLET').reduce((t, r) => t + r.amount, 0)), tone: 'warning' },
      ],
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'employeeName', label: 'الموظف' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
        { key: 'paymentMethod', label: 'الطريقة', type: 'badge' },
        { key: 'bankAccountId', label: 'الحساب البنكي' },
        { key: 'referenceNumber', label: 'المرجع' },
        { key: 'proofReference', label: 'الإثبات' },
        { key: 'paymentStatus', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }
  public async hrAttendanceSummary({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('e.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT e.id AS employeeId, COALESCE(e.name, '—') AS employeeName,
        COUNT(a.id) AS days, COALESCE(SUM(a.worked_minutes), 0) AS workedMinutes,
        COALESCE(SUM(a.late_minutes), 0) AS lateMinutes,
        COALESCE(SUM(a.overtime_minutes), 0) AS overtimeMinutes,
        COALESCE(SUM(CASE WHEN a.overtime_approved = 1 THEN a.overtime_minutes ELSE 0 END), 0) AS approvedOvertime
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date >= ? AND a.date <= ?
      WHERE e.is_active = 1 AND ${scope.clause}
      GROUP BY e.id, e.name
      ORDER BY e.name
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      days: num(row.days),
      workedMinutes: num(row.workedMinutes),
      lateMinutes: num(row.lateMinutes),
      overtimeMinutes: num(row.overtimeMinutes),
      approvedOvertime: num(row.approvedOvertime),
    }));
    return {
      kpis: [
        { label: 'موظفون', value: result.length, tone: 'info' },
        { label: 'أيام حضور', value: result.reduce((t, r) => t + r.days, 0), tone: 'info' },
        { label: 'دقائق تأخير', value: result.reduce((t, r) => t + r.lateMinutes, 0), tone: 'warning' },
        { label: 'عمل إضافي (دقائق)', value: result.reduce((t, r) => t + r.overtimeMinutes, 0), tone: 'success' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'days', label: 'أيام', type: 'qty' },
        { key: 'workedMinutes', label: 'عمل (دقائق)', type: 'qty' },
        { key: 'lateMinutes', label: 'تأخير (دقائق)', type: 'qty' },
        { key: 'overtimeMinutes', label: 'إضافي (دقائق)', type: 'qty' },
        { key: 'approvedOvertime', label: 'إضافي معتمد (دقائق)', type: 'qty' },
      ],
      rows: result,
      notes: ['يعتمد على جدول الحضور (attendance) المُحدّث من periods/shifts.'],
    };
  }
  public async hrLeaveSummary({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('lr.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, lr.leave_type AS leaveType,
        lr.start_date AS startDate, lr.end_date AS endDate, lr.days, lr.status,
        lr.reason, lr.decision_note AS decisionNote
      FROM employee_leave_requests lr
      LEFT JOIN employees e ON e.id = lr.employee_id
      WHERE lr.start_date <= ? AND lr.end_date >= ? AND ${scope.clause}
      ORDER BY lr.start_date DESC, e.name
    `, [to, from, ...scope.params]);
    const result = rows.map((row) => ({ ...row, days: num(row.days) }));
    return {
      kpis: [
        { label: 'طلبات', value: result.length, tone: 'info' },
        { label: 'معتمدة', value: result.filter((r) => r.status === 'APPROVED').length, tone: 'success' },
        { label: 'معلقة', value: result.filter((r) => r.status === 'PENDING').length, tone: 'warning' },
        { label: 'أيام إجازة', value: result.reduce((t, r) => t + (r.status === 'APPROVED' ? r.days : 0), 0), tone: 'info' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'leaveType', label: 'النوع', type: 'badge' },
        { key: 'startDate', label: 'من', type: 'date' },
        { key: 'endDate', label: 'إلى', type: 'date' },
        { key: 'days', label: 'أيام', type: 'qty' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'reason', label: 'السبب' },
        { key: 'decisionNote', label: 'ملاحظة القرار' },
      ],
      rows: result,
    };
  }
  public async hrTaxSummary({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('pr.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT pr.period, COALESCE(e.name, '—') AS employeeName,
        COALESCE(prt.tax_amount, 0) / 100.0 AS taxAmount,
        COALESCE(json_extract(prt.detail_json, '$.taxRuleName'), '—') AS taxRuleName,
        COALESCE(json_extract(prt.detail_json, '$.taxSource'), '—') AS taxSource,
        COALESCE(json_extract(prt.detail_json, '$.taxableAmount'), 0) AS taxableAmount,
        COALESCE(json_extract(prt.detail_json, '$.taxExemptionAmount'), 0) AS exemptionAmount
      FROM payroll_runs pr
      JOIN payroll_run_items prt ON prt.payroll_run_id = pr.id
      LEFT JOIN employees e ON e.id = prt.employee_id
      WHERE pr.period >= ? AND pr.period <= ? AND ${scope.clause}
      ORDER BY pr.period, e.name
    `, [from.slice(0, 7), to.slice(0, 7), ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      taxAmount: round2(num(row.taxAmount)),
      taxableAmount: round2(num(row.taxableAmount)),
      exemptionAmount: round2(num(row.exemptionAmount)),
    }));
    return {
      kpis: [
        { label: 'موظفون', value: result.length, tone: 'info' },
        { label: 'إجمالي الضريبة', value: round2(result.reduce((t, r) => t + r.taxAmount, 0)), tone: 'danger' },
        { label: 'إجمالي الخاضع', value: round2(result.reduce((t, r) => t + r.taxableAmount, 0)), tone: 'info' },
        { label: 'إجمالي الإعفاءات', value: round2(result.reduce((t, r) => t + r.exemptionAmount, 0)), tone: 'success' },
      ],
      columns: [
        { key: 'period', label: 'الفترة' },
        { key: 'employeeName', label: 'الموظف' },
        { key: 'taxRuleName', label: 'قاعدة الضريبة' },
        { key: 'taxSource', label: 'المصدر', type: 'badge' },
        { key: 'taxableAmount', label: 'الخاضع', type: 'currency' },
        { key: 'exemptionAmount', label: 'الإعفاء', type: 'currency' },
        { key: 'taxAmount', label: 'الضريبة', type: 'currency' },
      ],
      rows: result,
    };
  }
  };
}
