import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num, fmtMoney } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

export function HrStaffReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class HrStaffReports extends Base {
  public async hrVacancies({ from: _from, to: _to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('d.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT d.id AS departmentId, d.name AS departmentName,
        COALESCE(d.required_headcount, 0) AS requiredHeadcount,
        (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id AND e.is_active = 1) AS actualHeadcount
      FROM departments d
      WHERE d.is_active = 1 AND ${scope.clause}
      ORDER BY d.name
    `, scope.params);
    const result = rows.map((row) => ({
      ...row,
      requiredHeadcount: num(row.requiredHeadcount),
      actualHeadcount: num(row.actualHeadcount),
      vacant: Math.max(0, num(row.requiredHeadcount) - num(row.actualHeadcount)),
    }));
    return {
      kpis: [
        { label: 'أقسام', value: result.length, tone: 'info' },
        { label: 'مطلوب', value: result.reduce((t, r) => t + r.requiredHeadcount, 0), tone: 'info' },
        { label: 'فعلي', value: result.reduce((t, r) => t + r.actualHeadcount, 0), tone: 'success' },
        { label: 'شاغر', value: result.reduce((t, r) => t + r.vacant, 0), tone: 'danger' },
      ],
      columns: [
        { key: 'departmentName', label: 'القسم' },
        { key: 'requiredHeadcount', label: 'المطلوب', type: 'qty' },
        { key: 'actualHeadcount', label: 'الفعلي', type: 'qty' },
        { key: 'vacant', label: 'الشاغر', type: 'qty' },
      ],
      rows: result,
    };
  }
  public async hrOnboarding({ from: _from, to: _to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('e.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT e.id AS employeeId, COALESCE(e.name, '—') AS employeeName,
        COUNT(t.id) AS total,
        SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN t.status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN t.status = 'PENDING' AND (t.due_date IS NULL OR t.due_date <= ?) THEN 1 ELSE 0 END) AS overdue
      FROM employees e
      LEFT JOIN employee_onboarding_tasks t ON t.employee_id = e.id
      WHERE ${scope.clause}
      GROUP BY e.id, e.name
      HAVING COUNT(t.id) > 0
      ORDER BY e.name
    `, [_to, ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      total: num(row.total),
      completed: num(row.completed),
      pending: num(row.pending),
      overdue: num(row.overdue),
    }));
    return {
      kpis: [
        { label: 'موظفون', value: result.length, tone: 'info' },
        { label: 'مهام', value: result.reduce((t, r) => t + r.total, 0), tone: 'info' },
        { label: 'مكتملة', value: result.reduce((t, r) => t + r.completed, 0), tone: 'success' },
        { label: 'متأخرة', value: result.reduce((t, r) => t + r.overdue, 0), tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'total', label: 'المهام', type: 'qty' },
        { key: 'completed', label: 'مكتملة', type: 'qty' },
        { key: 'pending', label: 'معلقة', type: 'qty' },
        { key: 'overdue', label: 'متأخرة', type: 'qty' },
      ],
      rows: result,
    };
  }
  public async hrProbation({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('e.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, r.review_date AS reviewDate,
        r.score, r.rating, r.recommendation, r.status
      FROM employee_probation_reviews r
      LEFT JOIN employees e ON e.id = r.employee_id
      WHERE r.review_date >= ? AND r.review_date <= ? AND ${scope.clause}
      ORDER BY r.review_date DESC
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => ({ ...row, score: num(row.score) }));
    return {
      kpis: [
        { label: 'تقييمات', value: result.length, tone: 'info' },
        { label: 'معتمدة', value: result.filter((r) => r.status === 'APPROVED').length, tone: 'success' },
        { label: 'معلقة', value: result.filter((r) => r.status !== 'APPROVED').length, tone: 'warning' },
        { label: 'متوسط الدرجة', value: result.length ? round2(result.reduce((t, r) => t + r.score, 0) / result.length) : 0, tone: 'info' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'reviewDate', label: 'التاريخ', type: 'date' },
        { key: 'score', label: 'الدرجة', type: 'number' },
        { key: 'rating', label: 'التقييم', type: 'badge' },
        { key: 'recommendation', label: 'التوصية', type: 'badge' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }
  public async hrViolations({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, v.violation_type AS violationType,
        v.severity, v.status, v.occurred_at AS occurredAt, v.description
      FROM hr_violations v
      LEFT JOIN employees e ON e.id = v.employee_id
      WHERE v.occurred_at >= ? AND v.occurred_at <= ? AND (e.branch_id IS NULL OR e.branch_id IN (
        SELECT id FROM branches WHERE id = e.branch_id
      ))
      ORDER BY v.occurred_at DESC
    `, [from, to]);
    const result = rows.map((row) => ({ ...row }));
    return {
      kpis: [
        { label: 'مخالفات', value: result.length, tone: 'info' },
        { label: 'حرجة', value: result.filter((r) => r.severity === 'CRITICAL').length, tone: 'danger' },
        { label: 'كبيرة', value: result.filter((r) => r.severity === 'MAJOR').length, tone: 'warning' },
        { label: 'مغلقة', value: result.filter((r) => r.status === 'CLOSED').length, tone: 'success' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'violationType', label: 'النوع' },
        { key: 'severity', label: 'الخطورة', type: 'badge' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'occurredAt', label: 'التاريخ', type: 'date' },
        { key: 'description', label: 'الوصف' },
      ],
      rows: result,
    };
  }
  public async hrComplaints({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, c.subject, c.status, c.submitted_at AS submittedAt,
        c.resolved_at AS resolvedAt, c.resolution
      FROM hr_complaints c
      LEFT JOIN employees e ON e.id = c.employee_id
      WHERE c.submitted_at >= ? AND c.submitted_at <= ?
      ORDER BY c.submitted_at DESC
    `, [from, to]);
    const result = rows.map((row) => ({ ...row }));
    return {
      kpis: [
        { label: 'شكاوى', value: result.length, tone: 'info' },
        { label: 'مفتوحة', value: result.filter((r) => r.status === 'OPEN' || r.status === 'UNDER_REVIEW').length, tone: 'warning' },
        { label: 'محلولة', value: result.filter((r) => r.status === 'RESOLVED').length, tone: 'success' },
        { label: 'مرفوضة', value: result.filter((r) => r.status === 'REJECTED').length, tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'subject', label: 'الموضوع' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'submittedAt', label: 'تاريخ التقديم', type: 'date' },
        { key: 'resolvedAt', label: 'تاريخ الحل', type: 'date' },
        { key: 'resolution', label: 'القرار' },
      ],
      rows: result,
    };
  }
  public async hrPenaltiesReport({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, p.penalty_type AS penaltyType, p.amount, p.status,
        p.approved_at AS approvedAt, p.notes
      FROM hr_penalties p
      LEFT JOIN employees e ON e.id = p.employee_id
      WHERE p.created_at >= ? AND p.created_at <= ?
      ORDER BY p.created_at DESC
    `, [from + 'T00:00:00', to + 'T23:59:59']);
    const result = rows.map((row) => ({ ...row, amount: Number(row.amount) || 0 }));
    return {
      kpis: [
        { label: 'جزاءات', value: result.length, tone: 'info' },
        { label: 'معتمدة/مرحّلة', value: result.filter((r) => r.status === 'POSTED' || r.status === 'APPROVED').length, tone: 'success' },
        { label: 'مسودات', value: result.filter((r) => r.status === 'DRAFT').length, tone: 'warning' },
        { label: 'إجمالي', value: result.reduce((t, r) => t + r.amount, 0), tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'penaltyType', label: 'النوع' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'approvedAt', label: 'تاريخ الاعتماد', type: 'date' },
        { key: 'notes', label: 'ملاحظات' },
      ],
      rows: result,
    };
  }
  public async hrWarnings({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, w.warning_type AS warningType, w.status,
        w.issued_at AS issuedAt, w.notes
      FROM hr_warnings w
      LEFT JOIN employees e ON e.id = w.employee_id
      WHERE w.issued_at >= ? AND w.issued_at <= ?
      ORDER BY w.issued_at DESC
    `, [from, to]);
    const result = rows.map((row) => ({ ...row }));
    return {
      kpis: [
        { label: 'إنذارات', value: result.length, tone: 'info' },
        { label: 'صادرة', value: result.filter((r) => r.status === 'ISSUED').length, tone: 'warning' },
        { label: 'ملغاة', value: result.filter((r) => r.status === 'CANCELLED').length, tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'warningType', label: 'النوع' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'issuedAt', label: 'تاريخ الإصدار', type: 'date' },
        { key: 'notes', label: 'ملاحظات' },
      ],
      rows: result,
    };
  }
  public async hrAppeals({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, a.reference_type AS referenceType, a.reference_id AS referenceId,
        a.status, a.created_at AS createdAt, a.decided_at AS decidedAt, a.decision
      FROM hr_appeals a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.created_at >= ? AND a.created_at <= ?
      ORDER BY a.created_at DESC
    `, [from + 'T00:00:00', to + 'T23:59:59']);
    const result = rows.map((row) => ({ ...row }));
    return {
      kpis: [
        { label: 'تظلمات', value: result.length, tone: 'info' },
        { label: 'مفتوحة', value: result.filter((r) => r.status === 'OPEN').length, tone: 'warning' },
        { label: 'مقبولة', value: result.filter((r) => r.status === 'APPROVED').length, tone: 'success' },
        { label: 'مرفوضة', value: result.filter((r) => r.status === 'REJECTED').length, tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'referenceType', label: 'نوع المرجع' },
        { key: 'referenceId', label: 'معرف المرجع' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'createdAt', label: 'تاريخ التقديم', type: 'date' },
        { key: 'decidedAt', label: 'تاريخ القرار', type: 'date' },
        { key: 'decision', label: 'القرار' },
      ],
      rows: result,
    };
  }
  public async hrAttachments({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT a.reference_type AS referenceType, a.reference_id AS referenceId,
        a.file_name AS fileName, COALESCE(u.full_name, '—') AS uploadedBy, a.created_at AS createdAt
      FROM hr_case_attachments a
      LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.created_at >= ? AND a.created_at <= ?
      ORDER BY a.created_at DESC
    `, [from + 'T00:00:00', to + 'T23:59:59']);
    const result = rows.map((row) => ({ ...row }));
    return {
      kpis: [
        { label: 'مرفقات', value: result.length, tone: 'info' },
        { label: 'مخالفات', value: result.filter((r) => r.referenceType === 'HR_VIOLATION').length, tone: 'warning' },
        { label: 'شكاوى', value: result.filter((r) => r.referenceType === 'HR_COMPLAINT').length, tone: 'info' },
        { label: 'جزاءات', value: result.filter((r) => r.referenceType === 'HR_PENALTY').length, tone: 'danger' },
      ],
      columns: [
        { key: 'referenceType', label: 'نوع المرجع', type: 'badge' },
        { key: 'referenceId', label: 'معرف المرجع' },
        { key: 'fileName', label: 'اسم الملف' },
        { key: 'uploadedBy', label: 'رفع بواسطة' },
        { key: 'createdAt', label: 'تاريخ الرفع', type: 'date' },
      ],
      rows: result,
    };
  }
  public async hrAllowances({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, a.allowance_type AS allowanceType,
        a.amount, a.frequency, a.effective_from AS effectiveFrom,
        COALESCE(a.effective_to, '—') AS effectiveTo,
        CASE WHEN a.is_active = 1 THEN 'نشط' ELSE 'موقوف' END AS activeLabel
      FROM hr_allowances a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.effective_from <= ? AND (a.effective_to IS NULL OR a.effective_to >= ?)
      ORDER BY e.name, a.effective_from DESC
    `, [to, from]);
    const result = rows.map((row) => ({ ...row, amount: Number(row.amount) || 0 }));
    return {
      kpis: [
        { label: 'بدلات', value: result.length, tone: 'info' },
        { label: 'نشطة', value: result.filter((r) => r.activeLabel === 'نشط').length, tone: 'success' },
        { label: 'شهرية', value: result.filter((r) => r.frequency === 'MONTHLY' && r.activeLabel === 'نشط').length, tone: 'info' },        { label: 'إجمالي الشهرية النشطة', value: fmtMoney(result.filter((r) => r.frequency === 'MONTHLY' && r.activeLabel === 'نشط').reduce((t, r) => t + r.amount, 0)), tone: 'success' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'allowanceType', label: 'النوع' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
        { key: 'frequency', label: 'التكرار' },
        { key: 'effectiveFrom', label: 'من', type: 'date' },
        { key: 'effectiveTo', label: 'إلى', type: 'date' },
        { key: 'activeLabel', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }
  public async hrBenefits({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, b.benefit_type AS benefitType,
        COALESCE(b.provider, '—') AS provider, COALESCE(b.policy_number, '—') AS policyNumber,
        b.start_date AS startDate, COALESCE(b.end_date, '—') AS endDate, b.amount, b.status
      FROM hr_benefits b
      LEFT JOIN employees e ON e.id = b.employee_id
      WHERE b.start_date <= ? AND (b.end_date IS NULL OR b.end_date >= ?)
      ORDER BY e.name, b.start_date DESC
    `, [to, from]);
    const result = rows.map((row) => ({ ...row, amount: Number(row.amount) || 0 }));
    return {
      kpis: [
        { label: 'مزايا/تأمينات', value: result.length, tone: 'info' },
        { label: 'سارية', value: result.filter((r) => r.status === 'ACTIVE').length, tone: 'success' },
        { label: 'منتهية', value: result.filter((r) => r.status === 'EXPIRED').length, tone: 'warning' },
        { label: 'ملغاة', value: result.filter((r) => r.status === 'CANCELLED').length, tone: 'danger' },
        { label: 'إجمالي التكلفة', value: fmtMoney(result.reduce((t, r) => t + r.amount, 0)), tone: 'info' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'benefitType', label: 'النوع' },
        { key: 'provider', label: 'جهة التوفير' },
        { key: 'policyNumber', label: 'رقم البوليصة' },
        { key: 'startDate', label: 'من', type: 'date' },
        { key: 'endDate', label: 'إلى', type: 'date' },
        { key: 'amount', label: 'التكلفة', type: 'currency' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }
  public async hrLoans({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.db.queryAsync<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, l.id AS loanId, l.principal,
        l.installment_amount AS installmentAmount, l.remaining_balance AS remainingBalance,
        l.start_date AS startDate, l.status,
        COALESCE((SELECT COUNT(*) FROM hr_loan_installments i
          WHERE i.loan_id = l.id AND i.status = 'PAID'), 0) AS paidInstallments,
        COALESCE((SELECT COUNT(*) FROM hr_loan_installments i
          WHERE i.loan_id = l.id AND i.status = 'PENDING'), 0) AS pendingInstallments
      FROM hr_loans l
      LEFT JOIN employees e ON e.id = l.employee_id
      WHERE l.start_date >= ? AND l.start_date <= ?
      ORDER BY l.start_date DESC
    `, [from, to]);
    const result = rows.map((row) => ({
      ...row,
      principal: Number(row.principal) || 0,
      installmentAmount: Number(row.installmentAmount) || 0,
      remainingBalance: Number(row.remainingBalance) || 0,
      paidInstallments: Number(row.paidInstallments) || 0,
      pendingInstallments: Number(row.pendingInstallments) || 0,
    }));
    return {
      kpis: [
        { label: 'قروض', value: result.length, tone: 'info' },
        { label: 'نشطة', value: result.filter((r) => r.status === 'ACTIVE').length, tone: 'warning' },
        { label: 'مسددة', value: result.filter((r) => r.status === 'COMPLETED').length, tone: 'success' },
        { label: 'إجمالي المتبقي', value: fmtMoney(result.reduce((t, r) => t + r.remainingBalance, 0)), tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'loanId', label: 'معرف القرض' },
        { key: 'principal', label: 'أصل القرض', type: 'currency' },
        { key: 'installmentAmount', label: 'القسط', type: 'currency' },
        { key: 'paidInstallments', label: 'أقساط مسددة' },
        { key: 'pendingInstallments', label: 'أقساط متبقية' },
        { key: 'remainingBalance', label: 'المتبقي', type: 'currency' },
        { key: 'startDate', label: 'تاريخ البداية', type: 'date' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }
  };
}
