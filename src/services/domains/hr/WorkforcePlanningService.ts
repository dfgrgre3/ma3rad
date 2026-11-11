import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { NotificationService } from '../notifications/NotificationService';
import { localDateString } from '../../../utils/shared/date';

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type WorkforcePlanStatus = 'DRAFT' | 'APPROVED' | 'CLOSED';
export type HiringRequisitionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CLOSED';

export interface WorkforcePlan {
  id: string;
  companyId: string;
  branchId: string;
  branchName: string;
  departmentId: string;
  departmentName: string;
  periodMonth: string;
  plannedHeadcount: number;
  approvedRecruitmentBudget: number;
  expectedEmployeeCost: number;
  notes: string | null;
  status: WorkforcePlanStatus;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  jobPlans: WorkforcePlanJob[];
  actualHeadcount: number;
  shortage: number;
  surplus: number;
}

export interface WorkforcePlanJob {
  id: string;
  planId: string;
  jobTitle: string;
  employmentType: string;
  plannedOpenings: number;
  estimatedMonthlySalary: number;
  notes: string | null;
}

export interface WorkforcePlanInput {
  branchId: string;
  departmentId: string;
  periodMonth: string;
  plannedHeadcount: number;
  approvedRecruitmentBudget?: number;
  expectedEmployeeCost?: number;
  notes?: string;
  jobPlans?: Array<{
    jobTitle: string;
    employmentType?: string;
    plannedOpenings: number;
    estimatedMonthlySalary?: number;
    notes?: string;
  }>;
}

export interface HiringRequisition {
  id: string;
  companyId: string;
  branchId: string;
  branchName: string;
  departmentId: string;
  departmentName: string;
  requisitionNumber: string;
  jobTitle: string;
  employmentType: string;
  openings: number;
  estimatedMonthlySalary: number;
  justification: string | null;
  status: HiringRequisitionStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  linkedPlanId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HiringRequisitionInput {
  branchId: string;
  departmentId: string;
  jobTitle: string;
  employmentType?: string;
  openings: number;
  estimatedMonthlySalary?: number;
  justification?: string;
  linkedPlanId?: string | null;
}

export interface HeadcountComparison {
  branchId: string;
  branchName: string;
  departmentId: string;
  departmentName: string;
  periodMonth: string;
  plannedHeadcount: number;
  actualHeadcount: number;
  shortage: number;
  surplus: number;
  alert: 'SHORTAGE' | 'SURPLUS' | 'OK';
}

export interface WorkforceSummary {
  totalPlanned: number;
  totalActual: number;
  totalShortage: number;
  totalSurplus: number;
  departmentsWithShortage: number;
  departmentsWithSurplus: number;
  comparisons: HeadcountComparison[];
}

const MAX_DATE = '9999-12-31';
const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidPeriodMonth(value: string): boolean {
  return YEAR_MONTH_PATTERN.test(value);
}

export class WorkforcePlanningService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'hr.recruitment.view', 'employees.payroll.view', 'employees.view',
    ]);
    return actor;
  }

  private static requireManage() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.requireAny(actor, [
      'hr.recruitment.manage', 'employees.manage',
    ]);
    return actor;
  }

  private static currentCompanyId(actor = AuthService.requireAuth()): string {
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const row = this.db.query<{ companyId: string | null }>(
      'SELECT company_id AS companyId FROM branches WHERE id = ?',
      [branchId]
    )[0];
    if (!row?.companyId) throw new Error('فرع العمل الحالي غير مرتبط بشركة.');
    return row.companyId;
  }

  /* ========== Workforce Plans ========== */

  static getWorkforcePlans(periodMonth?: string): WorkforcePlan[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['wp.company_id = ?'];
    const params: (string | number)[] = [companyId];
    if (periodMonth) {
      if (!isValidPeriodMonth(periodMonth)) throw new Error('الفترة غير صالحة (صيغة YYYY-MM).');
      conditions.push('wp.period_month = ?');
      params.push(periodMonth);
    }
    const scope = this.branchAccess.sqlScope('wp.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);

    const rows = this.db.query<any>(
      `SELECT wp.id, wp.company_id AS companyId, wp.branch_id AS branchId,
              b.name AS branchName, wp.department_id AS departmentId,
              d.name AS departmentName, wp.period_month AS periodMonth,
              wp.planned_headcount AS plannedHeadcount,
              wp.approved_recruitment_budget AS approvedRecruitmentBudget,
              wp.expected_employee_cost AS expectedEmployeeCost,
              wp.notes, wp.status,
              wp.created_by AS createdBy, u.full_name AS createdByName,
              wp.created_at AS createdAt, wp.updated_at AS updatedAt
       FROM hr_workforce_plans wp
       JOIN branches b ON b.id = wp.branch_id
       JOIN departments d ON d.id = wp.department_id
       LEFT JOIN users u ON u.id = wp.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY wp.period_month DESC, b.name, d.name`,
      params
    );
    return rows.map((row) => ({
      ...row,
      jobPlans: this.getWorkforcePlanJobs(row.id),
      actualHeadcount: this.getActualHeadcount(row.branchId, row.departmentId, row.periodMonth),
      shortage: Math.max(0, row.plannedHeadcount - this.getActualHeadcount(row.branchId, row.departmentId, row.periodMonth)),
      surplus: Math.max(0, this.getActualHeadcount(row.branchId, row.departmentId, row.periodMonth) - row.plannedHeadcount),
    }));
  }

  static getWorkforcePlan(planId: string): WorkforcePlan | null {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('wp.branch_id', undefined, actor);
    const row = this.db.query<any>(
      `SELECT wp.id, wp.company_id AS companyId, wp.branch_id AS branchId,
              b.name AS branchName, wp.department_id AS departmentId,
              d.name AS departmentName, wp.period_month AS periodMonth,
              wp.planned_headcount AS plannedHeadcount,
              wp.approved_recruitment_budget AS approvedRecruitmentBudget,
              wp.expected_employee_cost AS expectedEmployeeCost,
              wp.notes, wp.status,
              wp.created_by AS createdBy, u.full_name AS createdByName,
              wp.created_at AS createdAt, wp.updated_at AS updatedAt
       FROM hr_workforce_plans wp
       JOIN branches b ON b.id = wp.branch_id
       JOIN departments d ON d.id = wp.department_id
       LEFT JOIN users u ON u.id = wp.created_by
       WHERE wp.id = ? AND wp.company_id = ? AND ${scope.clause}`,
      [planId, companyId, ...scope.params]
    )[0];
    if (!row) return null;
    return {
      ...row,
      jobPlans: this.getWorkforcePlanJobs(planId),
      actualHeadcount: this.getActualHeadcount(row.branchId, row.departmentId, row.periodMonth),
      shortage: Math.max(0, row.plannedHeadcount - this.getActualHeadcount(row.branchId, row.departmentId, row.periodMonth)),
      surplus: Math.max(0, this.getActualHeadcount(row.branchId, row.departmentId, row.periodMonth) - row.plannedHeadcount),
    };
  }

  private static getWorkforcePlanJobs(planId: string): WorkforcePlanJob[] {
    return this.db.query<any>(
      `SELECT id, plan_id AS planId, job_title AS jobTitle,
              employment_type AS employmentType, planned_openings AS plannedOpenings,
              estimated_monthly_salary AS estimatedMonthlySalary, notes,
              created_at AS createdAt
       FROM hr_workforce_plan_jobs WHERE plan_id = ?
       ORDER BY job_title`,
      [planId]
    );
  }

  private static getActualHeadcount(branchId: string, departmentId: string, periodMonth: string): number {
    const [year, month] = periodMonth.split('-').map(Number);
    const periodStart = `${periodMonth}-01`;
    const periodEnd = new Date(year, month, 0).toISOString().slice(0, 10);
    const count = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM employees
       WHERE branch_id = ? AND department_id = ?
         AND joined_date <= ?
         AND (terminated_at IS NULL OR terminated_at >= ?)
         AND status NOT IN ('SUSPENDED', 'RESIGNED', 'TERMINATED')`,
      [branchId, departmentId, periodEnd, periodStart]
    )[0]?.count ?? 0;
    return Number(count);
  }

  static saveWorkforcePlan(input: WorkforcePlanInput, id?: string): WorkforcePlan {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    if (!isValidPeriodMonth(input.periodMonth)) throw new Error('الفترة غير صالحة (صيغة YYYY-MM).');
    const branch = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM branches WHERE id = ?',
      [input.branchId]
    )[0];
    if (!branch) throw new Error('الفرع غير موجود.');
    const department = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM departments WHERE id = ? AND branch_id = ?',
      [input.departmentId, input.branchId]
    )[0];
    if (!department) throw new Error('القسم غير موجود أو لا يتبع الفرع المحدد.');
    if (input.plannedHeadcount < 0) throw new Error('العدد المخطط يجب أن يكون غير سالب.');

    if (id) {
      const existing = this.db.query<{ id: string; status: string }>(
        'SELECT id, status FROM hr_workforce_plans WHERE id = ? AND company_id = ?',
        [id, companyId]
      )[0];
      if (!existing) throw new Error('خطة القوى العاملة غير موجودة.');
      if (existing.status !== 'DRAFT') throw new Error('لا يمكن تعديل خطة معتمدة أو مغلقة.');
    }

    const planId = id || `wfp_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const approvedRecruitmentBudget = roundMoney(Math.max(0, Number(input.approvedRecruitmentBudget || 0)));
    const expectedEmployeeCost = roundMoney(Math.max(0, Number(input.expectedEmployeeCost || 0)));

    this.db.executeTransaction((db) => {
      if (id) {
        db.run(
          `UPDATE hr_workforce_plans SET branch_id = ?, department_id = ?, period_month = ?,
             planned_headcount = ?, approved_recruitment_budget = ?, expected_employee_cost = ?,
             notes = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND company_id = ?`,
          [input.branchId, input.departmentId, input.periodMonth, input.plannedHeadcount,
            approvedRecruitmentBudget, expectedEmployeeCost, input.notes || null, id, companyId]
        );
        db.run('DELETE FROM hr_workforce_plan_jobs WHERE plan_id = ?', [id]);
      } else {
        db.run(
          `INSERT INTO hr_workforce_plans
             (id, company_id, branch_id, department_id, period_month, planned_headcount,
              approved_recruitment_budget, expected_employee_cost, notes, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
          [planId, companyId, input.branchId, input.departmentId, input.periodMonth,
            input.plannedHeadcount, approvedRecruitmentBudget, expectedEmployeeCost,
            input.notes || null, actor.id]
        );
      }
      for (const job of input.jobPlans || []) {
        if (!job.jobTitle?.trim()) continue;
        db.run(
          `INSERT INTO hr_workforce_plan_jobs
             (id, plan_id, job_title, employment_type, planned_openings,
              estimated_monthly_salary, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [`wfpj_${uuidv4().replace(/-/g, '').slice(0, 14)}`, planId, job.jobTitle.trim(),
            job.employmentType || 'FULL_TIME', Math.max(0, Number(job.plannedOpenings || 0)),
            roundMoney(Math.max(0, Number(job.estimatedMonthlySalary || 0))), job.notes || null]
        );
      }
      this.audit(db, actor, id ? 'تعديل خطة القوى العاملة' : 'إضافة خطة قوى عاملة', planId, {
        branchId: input.branchId, departmentId: input.departmentId, periodMonth: input.periodMonth,
        plannedHeadcount: input.plannedHeadcount,
      });
    });
    return this.getWorkforcePlan(planId)!;
  }

  static approveWorkforcePlan(planId: string): WorkforcePlan {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const plan = this.db.query<{ id: string; status: string }>(
      'SELECT id, status FROM hr_workforce_plans WHERE id = ? AND company_id = ?',
      [planId, companyId]
    )[0];
    if (!plan) throw new Error('خطة القوى العاملة غير موجودة.');
    if (plan.status !== 'DRAFT') throw new Error('لا يمكن اعتماد خطة ليست في حالة مسودة.');
    this.db.run(
      'UPDATE hr_workforce_plans SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['APPROVED', planId]
    );
    this.auditActor(actor, 'اعتماد خطة قوى عاملة', planId, { status: 'APPROVED' });
    return this.getWorkforcePlan(planId)!;
  }

  static closeWorkforcePlan(planId: string): WorkforcePlan {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const plan = this.db.query<{ id: string; status: string }>(
      'SELECT id, status FROM hr_workforce_plans WHERE id = ? AND company_id = ?',
      [planId, companyId]
    )[0];
    if (!plan) throw new Error('خطة القوى العاملة غير موجودة.');
    if (plan.status === 'CLOSED') throw new Error('الخطة مغلقة مسبقاً.');
    this.db.run(
      'UPDATE hr_workforce_plans SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['CLOSED', planId]
    );
    this.auditActor(actor, 'إغلاق خطة قوى عاملة', planId, { status: 'CLOSED' });
    return this.getWorkforcePlan(planId)!;
  }

  static deleteWorkforcePlan(planId: string): void {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const plan = this.db.query<{ id: string; status: string }>(
      'SELECT id, status FROM hr_workforce_plans WHERE id = ? AND company_id = ?',
      [planId, companyId]
    )[0];
    if (!plan) throw new Error('خطة القوى العاملة غير موجودة.');
    if (plan.status !== 'DRAFT') throw new Error('لا يمكن حذف خطة معتمدة أو مغلقة.');
    this.db.run('DELETE FROM hr_workforce_plans WHERE id = ? AND company_id = ?', [planId, companyId]);
    this.auditActor(actor, 'حذف خطة قوى عاملة', planId, {});
  }

  /* ========== Hiring Requisitions ========== */

  static getHiringRequisitions(status?: HiringRequisitionStatus): HiringRequisition[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['hr.company_id = ?'];
    const params: (string | number)[] = [companyId];
    if (status) {
      conditions.push('hr.status = ?');
      params.push(status);
    }
    const scope = this.branchAccess.sqlScope('hr.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);

    return this.db.query<any>(
      `SELECT hr.id, hr.company_id AS companyId, hr.branch_id AS branchId,
              b.name AS branchName, hr.department_id AS departmentId,
              d.name AS departmentName, hr.requisition_number AS requisitionNumber,
              hr.job_title AS jobTitle, hr.employment_type AS employmentType,
              hr.openings, hr.estimated_monthly_salary AS estimatedMonthlySalary,
              hr.justification, hr.status,
              hr.requested_by AS requestedBy, req.full_name AS requestedByName,
              hr.requested_at, hr.decided_by AS decidedBy,
              dec.full_name AS decidedByName, hr.decided_at, hr.decision_note,
              hr.linked_plan_id AS linkedPlanId,
              hr.created_at, hr.updated_at
       FROM hr_hiring_requisitions hr
       JOIN branches b ON b.id = hr.branch_id
       JOIN departments d ON d.id = hr.department_id
       LEFT JOIN employees req ON req.id = hr.requested_by
       LEFT JOIN users dec ON dec.id = hr.decided_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY hr.status = 'PENDING' DESC, hr.requested_at DESC`,
      params
    );
  }

  static createHiringRequisition(input: HiringRequisitionInput): HiringRequisition {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const branch = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM branches WHERE id = ?',
      [input.branchId]
    )[0];
    if (!branch) throw new Error('الفرع غير موجود.');
    const department = this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM departments WHERE id = ? AND branch_id = ?',
      [input.departmentId, input.branchId]
    )[0];
    if (!department) throw new Error('القسم غير موجود أو لا يتبع الفرع المحدد.');
    if (!input.jobTitle?.trim()) throw new Error('المسمى الوظيفي مطلوب.');
    if (!Number.isInteger(input.openings) || input.openings < 1) {
      throw new Error('عدد الشواغر يجب أن يكون رقمًا صحيحًا أكبر من صفر.');
    }

    const requisitionNumber = `REQ-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `req_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hr_hiring_requisitions
         (id, company_id, branch_id, department_id, requisition_number, job_title,
          employment_type, openings, estimated_monthly_salary, justification,
          status, requested_by, linked_plan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [id, companyId, input.branchId, input.departmentId, requisitionNumber,
        input.jobTitle.trim(), input.employmentType || 'FULL_TIME', input.openings,
        roundMoney(Math.max(0, Number(input.estimatedMonthlySalary || 0))),
        input.justification || null, actor.id, input.linkedPlanId || null]
    );
    this.auditActor(actor, 'إنشاء طلب توظيف', id, {
      requisitionNumber, jobTitle: input.jobTitle, departmentId: input.departmentId,
      openings: input.openings,
    });
    return this.getHiringRequisition(id)!;
  }

  static decideHiringRequisition(requisitionId: string, approve: boolean, decisionNote?: string): HiringRequisition {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const req = this.db.query<any>(
      `SELECT hr.*, b.name AS branchName, d.name AS departmentName,
              req.full_name AS requestedByName
       FROM hr_hiring_requisitions hr
       JOIN branches b ON b.id = hr.branch_id
       JOIN departments d ON d.id = hr.department_id
       LEFT JOIN employees req ON req.id = hr.requested_by
       WHERE hr.id = ? AND hr.company_id = ?`,
      [requisitionId, companyId]
    )[0];
    if (!req) throw new Error('طلب التوظيف غير موجود.');
    if (req.status !== 'PENDING') throw new Error('تم البت في هذا الطلب مسبقاً.');
    const now = new Date().toISOString();
    const newStatus = approve ? 'APPROVED' : 'REJECTED';
    this.db.run(
      `UPDATE hr_hiring_requisitions SET status = ?, decided_by = ?, decided_at = ?,
         decision_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newStatus, actor.id, now, decisionNote || null, requisitionId]
    );
    this.auditActor(actor, approve ? 'اعتماد طلب توظيف' : 'رفض طلب توظيف', requisitionId, {
      previousStatus: req.status, newStatus, decisionNote,
    });
    return this.getHiringRequisition(requisitionId)!;
  }

  static closeHiringRequisition(requisitionId: string): HiringRequisition {
    const actor = this.requireManage();
    const companyId = this.currentCompanyId(actor);
    const req = this.db.query<{ id: string; status: string }>(
      'SELECT id, status FROM hr_hiring_requisitions WHERE id = ? AND company_id = ?',
      [requisitionId, companyId]
    )[0];
    if (!req) throw new Error('طلب التوظيف غير موجود.');
    if (req.status === 'CLOSED') throw new Error('الطلب مغلق مسبقاً.');
    this.db.run(
      'UPDATE hr_hiring_requisitions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['CLOSED', requisitionId]
    );
    this.auditActor(actor, 'إغلاق طلب توظيف', requisitionId, {});
    return this.getHiringRequisition(requisitionId)!;
  }

  private static getHiringRequisition(requisitionId: string): HiringRequisition | null {
    const rows = this.getHiringRequisitions().filter((r) => r.id === requisitionId);
    return rows[0] ?? null;
  }

  /* ========== Headcount Comparison (Actual vs Planned) ========== */

  static getHeadcountComparison(periodMonth: string): WorkforceSummary {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    if (!isValidPeriodMonth(periodMonth)) throw new Error('الفترة غير صالحة (صيغة YYYY-MM).');
    const scope = this.branchAccess.sqlScope('d.branch_id', undefined, actor);
    const conditions: string[] = ['d.company_id = ?'];
    const params: (string | number)[] = [companyId];
    conditions.push(scope.clause);
    params.push(...scope.params);

    const departments = this.db.query<any>(
      `SELECT d.id AS departmentId, d.name AS departmentName, d.branch_id AS branchId,
              b.name AS branchName
       FROM departments d
       JOIN branches b ON b.id = d.branch_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.name, d.name`,
      params
    );

    const plans = this.getWorkforcePlans(periodMonth);
    const planMap = new Map<string, WorkforcePlan>();
    for (const plan of plans) {
      planMap.set(`${plan.branchId}|${plan.departmentId}`, plan);
    }

    const comparisons: HeadcountComparison[] = [];
    let totalPlanned = 0;
    let totalActual = 0;
    let totalShortage = 0;
    let totalSurplus = 0;
    let deptsWithShortage = 0;
    let deptsWithSurplus = 0;

    for (const dept of departments) {
      const plan = planMap.get(`${dept.branchId}|${dept.departmentId}`);
      const plannedHeadcount = plan ? plan.plannedHeadcount : 0;
      const actualHeadcount = this.getActualHeadcount(dept.branchId, dept.departmentId, periodMonth);
      const shortage = Math.max(0, plannedHeadcount - actualHeadcount);
      const surplus = Math.max(0, actualHeadcount - plannedHeadcount);
      const alert = shortage > 0 ? 'SHORTAGE' : surplus > 0 ? 'SURPLUS' : 'OK';

      if (alert === 'SHORTAGE') deptsWithShortage += 1;
      if (alert === 'SURPLUS') deptsWithSurplus += 1;

      totalPlanned += plannedHeadcount;
      totalActual += actualHeadcount;
      totalShortage += shortage;
      totalSurplus += surplus;

      comparisons.push({
        branchId: dept.branchId,
        branchName: dept.branchName,
        departmentId: dept.departmentId,
        departmentName: dept.departmentName,
        periodMonth,
        plannedHeadcount,
        actualHeadcount,
        shortage,
        surplus,
        alert,
      });
    }

    return {
      totalPlanned,
      totalActual,
      totalShortage,
      totalSurplus,
      departmentsWithShortage: deptsWithShortage,
      departmentsWithSurplus: deptsWithSurplus,
      comparisons,
    };
  }

  /* ========== Alerts ========== */

  static generateShortageSurplusAlerts(periodMonth?: string): void {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const targetPeriod = periodMonth || localDateString().slice(0, 7);
    if (!isValidPeriodMonth(targetPeriod)) throw new Error('الفترة غير صالحة.');

    const summary = this.getHeadcountComparison(targetPeriod);
    const notifications = new NotificationService();

    for (const comp of summary.comparisons) {
      if (comp.alert === 'OK') continue;

      const title = comp.alert === 'SHORTAGE'
        ? `نقص في القوى العاملة - ${comp.departmentName}`
        : `فائض في القوى العاملة - ${comp.departmentName}`;
      const message = comp.alert === 'SHORTAGE'
        ? `يوجد نقص بقيمة ${comp.shortage} موظف في قسم ${comp.departmentName} (فرع ${comp.branchName}) للفترة ${targetPeriod}. المخطط: ${comp.plannedHeadcount}، الفعلي: ${comp.actualHeadcount}.`
        : `يوجد فائض بقيمة ${comp.surplus} موظف في قسم ${comp.departmentName} (فرع ${comp.branchName}) للفترة ${targetPeriod}. المخطط: ${comp.plannedHeadcount}، الفعلي: ${comp.actualHeadcount}.`;

      const referenceId = `WORKFORCE_ALERT:${comp.branchId}:${comp.departmentId}:${targetPeriod}:${comp.alert}`;
      const exists = this.db.query<{ id: string }>(
        `SELECT id FROM notifications WHERE user_id = ? AND reference_type = 'WORKFORCE_ALERT' AND reference_id = ? LIMIT 1`,
        [actor.id, referenceId]
      );
      if (!exists.length) {
        notifications.createNotification('SYSTEM', title, message, actor.id, 'WORKFORCE_ALERT', referenceId);
      }
    }
  }

  /* ========== Helpers ========== */

  private static auditActor(actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        JSON.stringify(values)]
    );
  }

  private static audit(db: any, actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
    db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        JSON.stringify(values)]
    );
  }
}
