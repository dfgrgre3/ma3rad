import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { NotificationService } from '../notifications/NotificationService';
import { LeaveService } from './LeaveService';
import type { LeaveBalanceSummary } from './LeaveService';
import type { User } from '../../../types';

/** أنواع الطلبات العامة المتاحة داخل البوابة. */
export const SELF_SERVICE_REQUEST_TYPES = ['SALARY_CERTIFICATE', 'EMPLOYMENT_CERTIFICATE', 'DOCUMENT_COPY', 'LETTER', 'OTHER'] as const;
export type SelfServiceRequestType = (typeof SELF_SERVICE_REQUEST_TYPES)[number];

export interface MyProfile {
  employeeId: string;
  code: string;
  fullName: string;
  jobTitle: string;
  employmentType: string;
  status: string;
  branchName: string | null;
  departmentName: string | null;
  joinedDate: string;
  hiredAt: string;
  terminatedAt: string | null;
  phone: string;
  email: string | null;
}

export interface MyPayslip {
  id: string;
  period: string;
  runStatus: string;
  grossAmount: number;
  netAmount: number;
  baseAmount: number;
  overtimeAmount: number;
  bonusAmount: number;
  commissionAmount: number;
  allowanceAmount: number;
  loanDeductionAmount: number;
  advanceAmount: number;
  attendanceDeductionAmount: number;
  taxAmount: number;
  payoutStatus: string | null;
  paymentMethod: string | null;
  paidAt: string | null;
}

export interface MyAttendanceRecord { id: string; date: string; status: string; notes: string | null; }
export interface MyLeaveRequestRecord { id: string; leaveType: string; startDate: string; endDate: string; days: number; reason: string | null; status: string; decidedAt: string | null; decisionNote: string | null; }
export interface MyViolation { id: string; violationType: string; description: string | null; occurredAt: string; severity: string; status: string; }
export interface MyWarning { id: string; warningType: string; issuedAt: string; notes: string | null; status: string; }
export interface MyPenalty { id: string; penaltyType: string; amount: number; status: string; approvedAt: string | null; notes: string | null; }
export interface MyComplaint { id: string; subject: string; description: string | null; status: string; submittedAt: string; resolution: string | null; }
export interface MyAppeal { id: string; referenceType: string; referenceId: string; reason: string; status: string; decision: string | null; createdAt: string; }
export interface MyDiscipline { violations: MyViolation[]; warnings: MyWarning[]; penalties: MyPenalty[]; complaints: MyComplaint[]; appeals: MyAppeal[]; }

export interface MyDocument { id: string; documentType: string; title: string; documentNumber: string | null; issuedAt: string | null; expiresAt: string | null; status: string; notes: string | null; }
export interface MyEnrollment { id: string; courseName: string; courseStart: string | null; courseEnd: string | null; status: string; attendancePercent: number; score: number | null; certificateExpiry: string | null; notes: string | null; }
export interface MyEvaluationItem { kpiId: string | null; goalId: string | null; score: number; weight: number; comments: string | null; }
export interface MyEvaluation { id: string; cycleName: string | null; score: number; rating: string; status: string; submittedAt: string | null; notes: string | null; items: MyEvaluationItem[]; }
export interface MyGoal { id: string; title: string; weight: number; targetValue: number | null; actualValue: number | null; status: string; }
export interface MyPerformance { evaluations: MyEvaluation[]; goals: MyGoal[]; }

export interface MyAllowance { id: string; allowanceType: string; amount: number; frequency: string; effectiveFrom: string; effectiveTo: string | null; isActive: boolean; }
export interface MyBenefit { id: string; benefitType: string; provider: string | null; policyNumber: string | null; startDate: string; amount: number; status: string; }
export interface MyLoanInstallment { id: string; loanId: string; dueDate: string; amount: number; status: string; }
export interface MyLoan { id: string; principal: number; installmentAmount: number; startDate: string; remainingBalance: number; status: string; installments: MyLoanInstallment[]; }
export interface MyBenefits { allowances: MyAllowance[]; benefits: MyBenefit[]; loans: MyLoan[]; }

export interface MySelfServiceRequest { id: string; requestType: string; subject: string; details: string | null; status: string; resolution: string | null; createdAt: string; }

function nowIso(): string {
  return new Date().toISOString();
}

function isValidDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * بوابة الموظف الذاتية (Self-Service):
 * كل القراءات مقيدة بملف الموظف المرتبط بحساب المستخدم (employees.user_id)،
 * ولا يستطيع المستخدم رؤية أي بيانات لزملائه. طلبات التقديم تنشئ سجلات
 * تخصّ الموظف المرتبط فقط، مع إشعارات وسجل تدقيق.
 */
export class EmployeeSelfServiceService {
  private static db = DatabaseManager.getInstance();

  /** يتحقق من صلاحية البوابة ويعيد معرّف الموظف المرتبط بحساب المستخدم. */
  private static requirePortal(): { actor: User; employeeId: string } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'hr.selfservice.view');
    const row = this.db.query<{ id: string }>(
      'SELECT id FROM employees WHERE user_id = ? LIMIT 1',
      [actor.id]
    )[0];
    if (!row) throw new Error('لا يوجد ملف موظف مرتبط بحسابك. راجع مسؤول الموارد البشرية.');
    return { actor, employeeId: row.id };
  }

  /** صلاحية التقديم: تُفحص إضافةً إلى البوابة قبل أي عملية كتابة. */
  private static requirePortalSubmit(): { actor: User; employeeId: string } {
    const ctx = this.requirePortal();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.require(ctx.actor, 'hr.selfservice.request');
    return ctx;
  }

  private static audit(action: string, actor: User, recordId: string, values: unknown): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId, JSON.stringify(values)]
    );
  }

  private static notify(title: string, message: string, referenceType: string, referenceId: string): void {
    try { new NotificationService().createNotification('SYSTEM', title, message, undefined, referenceType, referenceId); } catch { /* ignore */ }
  }

  // ============ القراءات (بياناتي فقط) ============

  static getMyProfile(): MyProfile {
    const { employeeId } = this.requirePortal();
    const row = this.db.query<any>(
      `SELECT e.id AS employeeId, e.code, COALESCE(e.name, e.full_name) AS fullName,
              e.job_title AS jobTitle, e.employment_type AS employmentType, e.status,
              b.name AS branchName, d.name AS departmentName,
              e.joined_date AS joinedDate, e.hired_at AS hiredAt, e.terminated_at AS terminatedAt,
              e.phone, e.email
       FROM employees e
       LEFT JOIN branches b ON b.id = e.branch_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.id = ?`,
      [employeeId]
    )[0];
    if (!row) throw new Error('ملف الموظف المرتبط بحسابك غير موجود.');
    return {
      employeeId: row.employeeId, code: row.code, fullName: row.fullName, jobTitle: row.jobTitle,
      employmentType: row.employmentType, status: row.status, branchName: row.branchName || null,
      departmentName: row.departmentName || null, joinedDate: row.joinedDate, hiredAt: row.hiredAt,
      terminatedAt: row.terminatedAt || null, phone: row.phone, email: row.email || null,
    };
  }

  /** كشوف راتبي: بنود دورات الرواتب المعتمدة/المصروفة فقط (لا تظهر المسودات). */
  static getMyPayslips(): MyPayslip[] {
    const { employeeId } = this.requirePortal();
    return this.db.query<any>(
      `SELECT pri.id, pr.period, pr.status AS runStatus,
              pri.gross_amount AS grossAmount, pri.net_amount AS netAmount,
              pri.base_amount AS baseAmount, pri.overtime_amount AS overtimeAmount,
              pri.bonus_amount AS bonusAmount, pri.commission_amount AS commissionAmount,
              pri.allowance_amount AS allowanceAmount, pri.loan_deduction_amount AS loanDeductionAmount,
              pri.advance_amount AS advanceAmount, pri.attendance_deduction_amount AS attendanceDeductionAmount,
              pri.tax_amount AS taxAmount, pri.payout_status AS payoutStatus,
              pri.payment_method AS paymentMethod, pr.paid_at AS paidAt
       FROM payroll_run_items pri
       JOIN payroll_runs pr ON pr.id = pri.payroll_run_id
       WHERE pri.employee_id = ? AND pr.status != 'DRAFT'
       ORDER BY pr.period DESC`,
      [employeeId]
    ).map((r) => ({
      id: r.id, period: r.period, runStatus: r.runStatus,
      grossAmount: Number(r.grossAmount) || 0, netAmount: Number(r.netAmount) || 0,
      baseAmount: Number(r.baseAmount) || 0, overtimeAmount: Number(r.overtimeAmount) || 0,
      bonusAmount: Number(r.bonusAmount) || 0, commissionAmount: Number(r.commissionAmount) || 0,
      allowanceAmount: Number(r.allowanceAmount) || 0, loanDeductionAmount: Number(r.loanDeductionAmount) || 0,
      advanceAmount: Number(r.advanceAmount) || 0, attendanceDeductionAmount: Number(r.attendanceDeductionAmount) || 0,
      taxAmount: Number(r.taxAmount) || 0, payoutStatus: r.payoutStatus || null,
      paymentMethod: r.paymentMethod || null, paidAt: r.paidAt || null,
    }));
  }

  static getMyAttendance(fromDate?: string, toDate?: string): MyAttendanceRecord[] {
    const { employeeId } = this.requirePortal();
    const conditions = ['employee_id = ?'];
    const params: any[] = [employeeId];
    if (fromDate) { conditions.push('date >= ?'); params.push(fromDate); }
    if (toDate) { conditions.push('date <= ?'); params.push(toDate); }
    return this.db.query<any>(
      `SELECT id, date, status, notes FROM attendance WHERE ${conditions.join(' AND ')} ORDER BY date DESC`,
      params
    ).map((r) => ({ id: r.id, date: r.date, status: r.status, notes: r.notes || null }));
  }

  static getMyLeaveRequests(): MyLeaveRequestRecord[] {
    const { employeeId } = this.requirePortal();
    return this.db.query<any>(
      `SELECT id, leave_type AS leaveType, start_date AS startDate, end_date AS endDate,
              days, reason, status, decided_at AS decidedAt, decision_note AS decisionNote
       FROM employee_leave_requests WHERE employee_id = ? ORDER BY created_at DESC`,
      [employeeId]
    ).map((r) => ({
      id: r.id, leaveType: r.leaveType, startDate: r.startDate, endDate: r.endDate,
      days: Number(r.days) || 0, reason: r.reason || null, status: r.status,
      decidedAt: r.decidedAt || null, decisionNote: r.decisionNote || null,
    }));
  }

  static getMyLeaveBalances(year: number): LeaveBalanceSummary {
    const { employeeId } = this.requirePortal();
    return new LeaveService().getBalanceSummary(employeeId, year);
  }

  /** جزاءاتي وسجلاتي الانضباطية: تُخفى الجزاءات المسودة (لم تُعتمد بعد). */
  static getMyDiscipline(): MyDiscipline {
    const { employeeId } = this.requirePortal();
    const violations = this.db.query<any>(
      `SELECT id, violation_type AS violationType, description, occurred_at AS occurredAt, severity, status
       FROM hr_violations WHERE employee_id = ? ORDER BY occurred_at DESC`,
      [employeeId]
    ).map((r) => ({ id: r.id, violationType: r.violationType, description: r.description || null, occurredAt: r.occurredAt, severity: r.severity, status: r.status }));
    const warnings = this.db.query<any>(
      `SELECT id, warning_type AS warningType, issued_at AS issuedAt, notes, status
       FROM hr_warnings WHERE employee_id = ? ORDER BY issued_at DESC`,
      [employeeId]
    ).map((r) => ({ id: r.id, warningType: r.warningType, issuedAt: r.issuedAt, notes: r.notes || null, status: r.status }));
    const penalties = this.db.query<any>(
      `SELECT id, penalty_type AS penaltyType, amount, status, approved_at AS approvedAt, notes
       FROM hr_penalties WHERE employee_id = ? AND status != 'DRAFT' ORDER BY created_at DESC`,
      [employeeId]
    ).map((r) => ({ id: r.id, penaltyType: r.penaltyType, amount: Number(r.amount) || 0, status: r.status, approvedAt: r.approvedAt || null, notes: r.notes || null }));
    const complaints = this.db.query<any>(
      `SELECT id, subject, description, status, submitted_at AS submittedAt, resolution
       FROM hr_complaints WHERE employee_id = ? ORDER BY submitted_at DESC`,
      [employeeId]
    ).map((r) => ({ id: r.id, subject: r.subject, description: r.description || null, status: r.status, submittedAt: r.submittedAt, resolution: r.resolution || null }));
    const appeals = this.db.query<any>(
      `SELECT id, reference_type AS referenceType, reference_id AS referenceId, reason, status, decision, created_at AS createdAt
       FROM hr_appeals WHERE employee_id = ? ORDER BY created_at DESC`,
      [employeeId]
    ).map((r) => ({ id: r.id, referenceType: r.referenceType, referenceId: r.referenceId, reason: r.reason, status: r.status, decision: r.decision || null, createdAt: r.createdAt }));
    return { violations, warnings, penalties, complaints, appeals };
  }

  static getMyDocuments(): MyDocument[] {
    const { employeeId } = this.requirePortal();
    return this.db.query<any>(
      `SELECT id, document_type AS documentType, title, document_number AS documentNumber,
              issued_at AS issuedAt, expires_at AS expiresAt, status, notes
       FROM employee_documents WHERE employee_id = ? ORDER BY created_at DESC`,
      [employeeId]
    ).map((r) => ({
      id: r.id, documentType: r.documentType, title: r.title, documentNumber: r.documentNumber || null,
      issuedAt: r.issuedAt || null, expiresAt: r.expiresAt || null, status: r.status, notes: r.notes || null,
    }));
  }

  static getMyTraining(): MyEnrollment[] {
    const { employeeId } = this.requirePortal();
    return this.db.query<any>(
      `SELECT te.id, c.name AS courseName, c.start_date AS courseStart, c.end_date AS courseEnd,
              te.status, te.attendance_percent AS attendancePercent, te.score,
              te.certificate_expiry AS certificateExpiry, te.notes
       FROM training_enrollments te
       LEFT JOIN training_courses c ON c.id = te.course_id
       WHERE te.employee_id = ? ORDER BY te.created_at DESC`,
      [employeeId]
    ).map((r) => ({
      id: r.id, courseName: r.courseName || '', courseStart: r.courseStart || null, courseEnd: r.courseEnd || null,
      status: r.status, attendancePercent: Number(r.attendancePercent) || 0, score: r.score ?? null,
      certificateExpiry: r.certificateExpiry || null, notes: r.notes || null,
    }));
  }

  static getMyPerformance(): MyPerformance {
    const { employeeId } = this.requirePortal();
    const evaluations = this.db.query<any>(
      `SELECT pe.id, pc.name AS cycleName, pe.score, pe.rating, pe.status,
              pe.submitted_at AS submittedAt, pe.notes
       FROM performance_evaluations pe
       LEFT JOIN performance_cycles pc ON pc.id = pe.cycle_id
       WHERE pe.employee_id = ? ORDER BY pe.created_at DESC`,
      [employeeId]
    ).map((r) => ({
      id: r.id, cycleName: r.cycleName || null, score: Number(r.score) || 0, rating: r.rating,
      status: r.status, submittedAt: r.submittedAt || null, notes: r.notes || null,
      items: [] as MyEvaluationItem[],
    }));
    if (evaluations.length > 0) {
      const ids = evaluations.map((e) => e.id);
      const items = this.db.query<any>(
        `SELECT evaluation_id AS evaluationId, kpi_id AS kpiId, goal_id AS goalId, score, weight, comments
         FROM performance_evaluation_items WHERE evaluation_id IN (${ids.map(() => '?').join(', ')})`,
        ids
      );
      for (const item of items) {
        const owner = evaluations.find((e) => e.id === item.evaluationId);
        if (owner) owner.items.push({ kpiId: item.kpiId || null, goalId: item.goalId || null, score: Number(item.score) || 0, weight: Number(item.weight) || 0, comments: item.comments || null });
      }
    }
    const goals = this.db.query<any>(
      `SELECT id, title, weight, target_value AS targetValue, actual_value AS actualValue, status
       FROM performance_goals WHERE employee_id = ? ORDER BY created_at DESC`,
      [employeeId]
    ).map((r) => ({ id: r.id, title: r.title, weight: Number(r.weight) || 0, targetValue: r.targetValue ?? null, actualValue: r.actualValue ?? null, status: r.status }));
    return { evaluations, goals };
  }

  static getMyBenefits(): MyBenefits {
    const { employeeId } = this.requirePortal();
    const allowances = this.db.query<any>(
      `SELECT id, allowance_type AS allowanceType, amount, frequency,
              effective_from AS effectiveFrom, effective_to AS effectiveTo, is_active AS isActive
       FROM hr_allowances WHERE employee_id = ? ORDER BY effective_from DESC`,
      [employeeId]
    ).map((r) => ({ id: r.id, allowanceType: r.allowanceType, amount: Number(r.amount) || 0, frequency: r.frequency, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo || null, isActive: Boolean(r.isActive) }));
    const benefits = this.db.query<any>(
      `SELECT id, benefit_type AS benefitType, provider, policy_number AS policyNumber,
              start_date AS startDate, amount, status
       FROM hr_benefits WHERE employee_id = ? ORDER BY start_date DESC`,
      [employeeId]
    ).map((r) => ({ id: r.id, benefitType: r.benefitType, provider: r.provider || null, policyNumber: r.policyNumber || null, startDate: r.startDate, amount: Number(r.amount) || 0, status: r.status }));
    const loans = this.db.query<any>(
      `SELECT id, principal, installment_amount AS installmentAmount, start_date AS startDate,
              remaining_balance AS remainingBalance, status
       FROM hr_loans WHERE employee_id = ? ORDER BY start_date DESC`,
      [employeeId]
    ).map((r) => ({
      id: r.id, principal: Number(r.principal) || 0, installmentAmount: Number(r.installmentAmount) || 0,
      startDate: r.startDate, remainingBalance: Number(r.remainingBalance) || 0, status: r.status,
      installments: [] as MyLoanInstallment[],
    }));
    if (loans.length > 0) {
      const loanIds = loans.map((l) => l.id);
      const installments = this.db.query<any>(
        `SELECT id, loan_id AS loanId, due_date AS dueDate, amount, status
         FROM hr_loan_installments WHERE loan_id IN (${loanIds.map(() => '?').join(', ')}) ORDER BY due_date`,
        loanIds
      );
      for (const installment of installments) {
        const owner = loans.find((l) => l.id === installment.loanId);
        if (owner) owner.installments.push({ id: installment.id, loanId: installment.loanId, dueDate: installment.dueDate, amount: Number(installment.amount) || 0, status: installment.status });
      }
    }
    return { allowances, benefits, loans };
  }

  static getMyRequests(): MySelfServiceRequest[] {
    const { employeeId } = this.requirePortal();
    return this.db.query<any>(
      `SELECT id, request_type AS requestType, subject, details, status, resolution, created_at AS createdAt
       FROM hr_self_service_requests WHERE employee_id = ? ORDER BY created_at DESC`,
      [employeeId]
    ).map((r) => ({
      id: r.id, requestType: r.requestType, subject: r.subject, details: r.details || null,
      status: r.status, resolution: r.resolution || null, createdAt: r.createdAt,
    }));
  }

  // ============ الطلبات (تخصّ الموظف المرتبط فقط) ============

  /** طلب إجازة لنفسي عبر دورة الطلبات القائمة (نفس التحققات والأرصدة). */
  static submitLeaveRequest(input: { leaveType?: string; startDate: string; endDate: string; reason?: string | null }): MyLeaveRequestRecord {
    const ctx = this.requirePortalSubmit();
    PermissionService.require(ctx.actor, 'hr.leave.request');
    const created = new LeaveService().requestLeave({
      employeeId: ctx.employeeId,
      leaveType: (input.leaveType as any) || 'ANNUAL',
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason ?? null,
    });
    this.audit('طلب إجازة من بوابة الموظف', ctx.actor, created.id, input);
    this.notify('طلب إجازة جديد', `تقديم ${ctx.actor.fullName} طلب إجازة للفترة ${input.startDate} إلى ${input.endDate}.`, 'HR_LEAVE_REQUEST', created.id);
    return {
      id: created.id, leaveType: created.leaveType, startDate: created.startDate, endDate: created.endDate,
      days: created.days, reason: created.reason, status: created.status,
      decidedAt: created.decidedAt, decisionNote: created.decisionNote,
    };
  }

  /** تقديم شكوى باسمي. */
  static submitComplaint(input: { subject: string; description?: string }): MyComplaint {
    const ctx = this.requirePortalSubmit();
    const subject = input.subject?.trim();
    if (!subject) throw new Error('موضوع الشكوى مطلوب.');
    const id = `cmp_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hr_complaints (id, employee_id, subject, description, status, submitted_at)
       VALUES (?, ?, ?, ?, 'OPEN', ?)`,
      [id, ctx.employeeId, subject, input.description?.trim() || null, nowIso()]
    );
    this.audit('تقديم شكوى من البوابة', ctx.actor, id, input);
    this.notify('شكوى جديدة من بوابة الموظف', `تقديم ${ctx.actor.fullName} شكوى: ${subject}`, 'HR_COMPLAINT', id);
    return { id, subject, description: input.description?.trim() || null, status: 'OPEN', submittedAt: nowIso(), resolution: null };
  }

  /** تقديم تظلم على جزاء/إنذار/مخالفة تخصّني فقط (تحقق ملكية المرجع). */
  static submitAppeal(input: { referenceType: string; referenceId: string; reason: string }): MyAppeal {
    const ctx = this.requirePortalSubmit();
    const referenceType = input.referenceType?.trim();
    const reason = input.reason?.trim();
    if (!reason) throw new Error('سبب التظلم مطلوب.');
    let owned: unknown = null;
    if (referenceType === 'HR_PENALTY') {
      owned = this.db.query(
        `SELECT id FROM hr_penalties WHERE id = ? AND employee_id = ? AND status != 'DRAFT'`,
        [input.referenceId, ctx.employeeId]
      )[0];
    } else if (referenceType === 'HR_WARNING') {
      owned = this.db.query(
        'SELECT id FROM hr_warnings WHERE id = ? AND employee_id = ?',
        [input.referenceId, ctx.employeeId]
      )[0];
    } else if (referenceType === 'HR_VIOLATION') {
      owned = this.db.query(
        'SELECT id FROM hr_violations WHERE id = ? AND employee_id = ?',
        [input.referenceId, ctx.employeeId]
      )[0];
    } else {
      throw new Error('نوع المرجع غير صالح للتظلم.');
    }
    if (!owned) throw new Error('المرجع المطلوب التظلم عليه غير موجود أو لا يخصّك.');
    const id = `apl_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hr_appeals (id, reference_type, reference_id, employee_id, reason, status)
       VALUES (?, ?, ?, ?, ?, 'OPEN')`,
      [id, referenceType, input.referenceId, ctx.employeeId, reason]
    );
    this.audit('تقديم تظلم من البوابة', ctx.actor, id, input);
    this.notify('تظلم جديد من بوابة الموظف', `تقديم ${ctx.actor.fullName} تظلمًا على ${referenceType}.`, 'HR_APPEAL', id);
    return { id, referenceType, referenceId: input.referenceId, reason, status: 'OPEN', decision: null, createdAt: nowIso() };
  }

  /** طلب عام: شهادة راتب/تعيين، نسخة مستند، خطاب، أو غيره. */
  static submitRequest(input: { requestType: string; subject: string; details?: string }): MySelfServiceRequest {
    const ctx = this.requirePortalSubmit();
    const subject = input.subject?.trim();
    if (!subject) throw new Error('موضوع الطلب مطلوب.');
    const requestType = SELF_SERVICE_REQUEST_TYPES.includes(input.requestType as SelfServiceRequestType) ? input.requestType : 'OTHER';
    const id = `ssr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hr_self_service_requests (id, employee_id, request_type, subject, details, status, submitted_by)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [id, ctx.employeeId, requestType, subject, input.details?.trim() || null, ctx.actor.id]
    );
    this.audit('طلب من بوابة الموظف', ctx.actor, id, input);
    this.notify('طلب جديد من بوابة الموظف', `تقديم ${ctx.actor.fullName} طلبًا: ${subject}`, 'HR_SELF_SERVICE_REQUEST', id);
    return { id, requestType, subject, details: input.details?.trim() || null, status: 'PENDING', resolution: null, createdAt: nowIso() };
  }

  /** طلب تحديث البيانات الشخصية مع اعتماد */
  static requestPersonalDataUpdate(input: {
    fieldName: string;
    currentValue: string | null;
    newValue: string;
    reason?: string | null;
  }): MySelfServiceRequest {
    const ctx = this.requirePortalSubmit();
    const fieldName = input.fieldName?.trim();
    const newValue = input.newValue?.trim();
    if (!fieldName) throw new Error('اسم الحقل المطلوب تحديثه مطلوب.');
    if (!newValue) throw new Error('القيمة الجديدة مطلوبة.');
    const subject = `تحديث البيانات الشخصية: ${fieldName}`;
    const details = `الحقل: ${fieldName}\nالقيمة الحالية: ${input.currentValue ?? 'غير محدد'}\nالقيمة الجديدة: ${newValue}\nالسبب: ${input.reason ?? 'غير محدد'}`;
    const id = `ssr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hr_self_service_requests (id, employee_id, request_type, subject, details, status, submitted_by)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [id, ctx.employeeId, 'PERSONAL_DATA_UPDATE', subject, details, ctx.actor.id]
    );
    this.audit('طلب تحديث بيانات شخصية من البوابة', ctx.actor, id, input);
    this.notify('طلب تحديث بيانات شخصية', `تقديم ${ctx.actor.fullName} طلب تحديث: ${fieldName}`, 'HR_SELF_SERVICE_REQUEST', id);
    return { id, requestType: 'PERSONAL_DATA_UPDATE', subject, details, status: 'PENDING', resolution: null, createdAt: nowIso() };
  }

  /** طلب خطاب تعريف بالراتب */
  static requestSalaryCertificate(input: {
    purpose?: string | null;
    recipient?: string | null;
  }): MySelfServiceRequest {
    const ctx = this.requirePortalSubmit();
    const subject = 'طلب خطاب تعريف بالراتب';
    const details = `الغرض: ${input.purpose ?? 'غير محدد'}\nالمستلم: ${input.recipient ?? 'غير محدد'}`;
    const id = `ssr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hr_self_service_requests (id, employee_id, request_type, subject, details, status, submitted_by)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [id, ctx.employeeId, 'SALARY_CERTIFICATE', subject, details, ctx.actor.id]
    );
    this.audit('طلب خطاب تعريف بالراتب من البوابة', ctx.actor, id, input);
    this.notify('طلب خطاب تعريف بالراتب', `تقديم ${ctx.actor.fullName} طلب خطاب تعريف بالراتب`, 'HR_SELF_SERVICE_REQUEST', id);
    return { id, requestType: 'SALARY_CERTIFICATE', subject, details, status: 'PENDING', resolution: null, createdAt: nowIso() };
  }

  /** طلب شهادة خبرة */
  static requestExperienceCertificate(input: {
    purpose?: string | null;
    recipient?: string | null;
  }): MySelfServiceRequest {
    const ctx = this.requirePortalSubmit();
    const subject = 'طلب شهادة خبرة';
    const details = `الغرض: ${input.purpose ?? 'غير محدد'}\nالمستلم: ${input.recipient ?? 'غير محدد'}`;
    const id = `ssr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hr_self_service_requests (id, employee_id, request_type, subject, details, status, submitted_by)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [id, ctx.employeeId, 'EMPLOYMENT_CERTIFICATE', subject, details, ctx.actor.id]
    );
    this.audit('طلب شهادة خبرة من البوابة', ctx.actor, id, input);
    this.notify('طلب شهادة خبرة', `تقديم ${ctx.actor.fullName} طلب شهادة خبرة`, 'HR_SELF_SERVICE_REQUEST', id);
    return { id, requestType: 'EMPLOYMENT_CERTIFICATE', subject, details, status: 'PENDING', resolution: null, createdAt: nowIso() };
  }

  /** طلب سلفة */
  static requestAdvance(input: {
    amount: number;
    reason?: string | null;
  }): MySelfServiceRequest {
    const ctx = this.requirePortalSubmit();
    const amount = Number(input.amount);
    if (!amount || amount <= 0) throw new Error('مبلغ السلفة يجب أن يكون أكبر من صفر.');
    const subject = 'طلب سلفة مالية';
    const details = `المبلغ: ${amount} ج\nالسبب: ${input.reason ?? 'غير محدد'}`;
    const id = `ssr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hr_self_service_requests (id, employee_id, request_type, subject, details, status, submitted_by)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [id, ctx.employeeId, 'ADVANCE_REQUEST', subject, details, ctx.actor.id]
    );
    this.audit('طلب سلفة من البوابة', ctx.actor, id, input);
    this.notify('طلب سلفة مالية', `تقديم ${ctx.actor.fullName} طلب سلفة بمبلغ ${amount} ج`, 'HR_SELF_SERVICE_REQUEST', id);
    return { id, requestType: 'ADVANCE_REQUEST', subject, details, status: 'PENDING', resolution: null, createdAt: nowIso() };
  }

  /** تقديم اعتراض على الحضور */
  static submitAttendanceObjection(input: {
    attendanceDate: string;
    objectionType: string;
    description: string;
    evidence?: string | null;
  }): MySelfServiceRequest {
    const ctx = this.requirePortalSubmit();
    const objectionType = input.objectionType?.trim();
    const description = input.description?.trim();
    if (!objectionType) throw new Error('نوع الاعتراض مطلوب.');
    if (!description) throw new Error('وصف الاعتراض مطلوب.');
    if (!isValidDate(input.attendanceDate)) throw new Error('تاريخ الحضور غير صالح.');
    const subject = `اعتراض على الحضور: ${objectionType}`;
    const details = `التاريخ: ${input.attendanceDate}\nالنوع: ${objectionType}\nالوصف: ${description}\nالأدلة: ${input.evidence ?? 'غير محدد'}`;
    const id = `ssr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hr_self_service_requests (id, employee_id, request_type, subject, details, status, submitted_by)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [id, ctx.employeeId, 'ATTENDANCE_OBJECTION', subject, details, ctx.actor.id]
    );
    this.audit('تقديم اعتراض على الحضور من البوابة', ctx.actor, id, input);
    this.notify('اعتراض على الحضور', `تقديم ${ctx.actor.fullName} اعتراض على الحضور لليوم ${input.attendanceDate}`, 'HR_SELF_SERVICE_REQUEST', id);
    return { id, requestType: 'ATTENDANCE_OBJECTION', subject, details, status: 'PENDING', resolution: null, createdAt: nowIso() };
  }

  /** طلب مستند معتمد للتحميل */
  static requestApprovedDocument(input: {
    documentType: string;
    documentTitle: string;
    reason?: string | null;
  }): MySelfServiceRequest {
    const ctx = this.requirePortalSubmit();
    const documentType = input.documentType?.trim();
    const documentTitle = input.documentTitle?.trim();
    if (!documentType) throw new Error('نوع المستند مطلوب.');
    if (!documentTitle) throw new Error('عنوان المستند مطلوب.');
    const subject = `طلب مستند معتمد: ${documentTitle}`;
    const details = `النوع: ${documentType}\nالعنوان: ${documentTitle}\nالسبب: ${input.reason ?? 'غير محدد'}`;
    const id = `ssr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hr_self_service_requests (id, employee_id, request_type, subject, details, status, submitted_by)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [id, ctx.employeeId, 'DOCUMENT_COPY', subject, details, ctx.actor.id]
    );
    this.audit('طلب مستند معتمد من البوابة', ctx.actor, id, input);
    this.notify('طلب مستند معتمد', `تقديم ${ctx.actor.fullName} طلب مستند: ${documentTitle}`, 'HR_SELF_SERVICE_REQUEST', id);
    return { id, requestType: 'DOCUMENT_COPY', subject, details, status: 'PENDING', resolution: null, createdAt: nowIso() };
  }
}
