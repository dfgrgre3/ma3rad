import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';

export type PerformancePeriodType = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'CUSTOM';
export type PerformanceCycleStatus = 'DRAFT' | 'OPEN' | 'CLOSED';
export type PerformanceEvaluatorType = 'SELF' | 'MANAGER' | 'DEPARTMENT' | 'HR' | 'PEER';
export type PerformanceEvaluationStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED';
export type PerformanceGoalStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type PerformancePipStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type PerformanceRewardType = 'BONUS' | 'PROMOTION' | 'RECOGNITION';
export type PerformanceRewardStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';

export interface PerformanceCycle {
  id: string;
  name: string;
  periodType: PerformancePeriodType;
  startDate: string;
  endDate: string;
  status: PerformanceCycleStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceKpi {
  id: string;
  jobTitle: string | null;
  departmentId: string | null;
  name: string;
  description: string | null;
  defaultWeight: number;
  unit: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface PerformanceGoal {
  id: string;
  employeeId: string;
  cycleId: string | null;
  title: string;
  description: string | null;
  weight: number;
  targetValue: number | null;
  actualValue: number | null;
  status: PerformanceGoalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceEvaluationItem {
  id: string;
  evaluationId: string;
  kpiId: string | null;
  goalId: string | null;
  score: number;
  weight: number;
  comments: string | null;
  createdAt: string;
}

export interface PerformanceEvaluation {
  id: string;
  employeeId: string;
  cycleId: string;
  evaluatorId: string | null;
  evaluatorType: PerformanceEvaluatorType;
  score: number;
  rating: string;
  notes: string | null;
  status: PerformanceEvaluationStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: PerformanceEvaluationItem[];
}

export interface PerformancePip {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  goals: string | null;
  status: PerformancePipStatus;
  reviewDate: string | null;
  outcome: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceReward {
  id: string;
  employeeId: string;
  evaluationId: string | null;
  rewardType: PerformanceRewardType;
  amount: number;
  status: PerformanceRewardStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export class PerformanceService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, ['ui.employees.employees.view', 'employees.payroll.view', 'employees.payroll.manage']);
    return actor;
  }

  private static requireManage() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.require(actor, 'employees.payroll.manage');
    return actor;
  }

  private static audit(actor: ReturnType<typeof AuthService.requireAuth>, action: string, recordId: string, values: unknown): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId, JSON.stringify(values)]
    );
  }

  // Cycles
  static createCycle(input: { name: string; periodType: PerformancePeriodType; startDate: string; endDate: string; status?: PerformanceCycleStatus }): PerformanceCycle {
    const actor = this.requireManage();
    const id = `pcy_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO performance_cycles (id, name, period_type, start_date, end_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.name.trim(), input.periodType, input.startDate, input.endDate, input.status || 'DRAFT', actor.id]
    );
    this.audit(actor, 'إنشاء دورة تقييم', id, input);
    return this.getCycle(id)!;
  }

  private static getCycle(id: string): PerformanceCycle | null {
    const row = this.db.query<any>(`SELECT * FROM performance_cycles WHERE id = ?`, [id])[0];
    return row ? this.mapCycle(row) : null;
  }

  static getCycles(): PerformanceCycle[] {
    this.requireView();
    return this.db.query<any>(`SELECT * FROM performance_cycles ORDER BY start_date DESC`).map((row) => this.mapCycle(row));
  }

  private static mapCycle(row: any): PerformanceCycle {
    return {
      id: row.id,
      name: row.name,
      periodType: row.period_type,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      createdBy: row.created_by || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  static updateCycleStatus(id: string, status: PerformanceCycleStatus): void {
    const actor = this.requireManage();
    this.db.run(`UPDATE performance_cycles SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, id]);
    this.audit(actor, 'تحديث حالة دورة تقييم', id, { status });
  }

  // KPIs
  static createKpi(input: { name: string; jobTitle?: string | null; departmentId?: string | null; description?: string; defaultWeight?: number; unit?: string | null }): PerformanceKpi {
    const actor = this.requireManage();
    const id = `kpi_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO performance_kpis (id, job_title, department_id, name, description, default_weight, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.jobTitle?.trim() || null, input.departmentId || null, input.name.trim(),
       input.description?.trim() || null, Math.max(0, Number(input.defaultWeight) || 1), input.unit?.trim() || null]
    );
    this.audit(actor, 'إنشاء مؤشر أداء', id, input);
    return this.getKpis().find((row) => row.id === id)!;
  }

  static getKpis(jobTitle?: string | null, departmentId?: string | null): PerformanceKpi[] {
    this.requireView();
    const conditions: string[] = ['is_active = 1'];
    const params: any[] = [];
    if (jobTitle) { conditions.push('job_title = ?'); params.push(jobTitle); }
    if (departmentId) { conditions.push('department_id = ?'); params.push(departmentId); }
    return this.db.query<any>(
      `SELECT * FROM performance_kpis WHERE ${conditions.join(' AND ')} ORDER BY name`,
      params
    ).map((row) => ({
      id: row.id,
      jobTitle: row.job_title || null,
      departmentId: row.department_id || null,
      name: row.name,
      description: row.description || null,
      defaultWeight: Number(row.default_weight) || 1,
      unit: row.unit || null,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
    }));
  }

  static deactivateKpi(id: string): void {
    const actor = this.requireManage();
    this.db.run(`UPDATE performance_kpis SET is_active = 0 WHERE id = ?`, [id]);
    this.audit(actor, 'تعطيل مؤشر أداء', id, {});
  }

  // Goals
  static createGoal(input: { employeeId: string; cycleId?: string | null; title: string; description?: string; weight?: number; targetValue?: number | null }): PerformanceGoal {
    const actor = this.requireManage();
    const id = `gol_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO performance_goals (id, employee_id, cycle_id, title, description, weight, target_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.cycleId || null, input.title.trim(), input.description?.trim() || null,
       Math.max(0, Number(input.weight) || 1), input.targetValue ?? null]
    );
    this.audit(actor, 'إنشاء هدف أداء', id, input);
    return this.getGoals(input.employeeId).find((row) => row.id === id)!;
  }

  static getGoals(employeeId?: string, cycleId?: string | null): PerformanceGoal[] {
    this.requireView();
    const conditions: string[] = [];
    const params: any[] = [];
    if (employeeId) { conditions.push('employee_id = ?'); params.push(employeeId); }
    if (cycleId) { conditions.push('cycle_id = ?'); params.push(cycleId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.db.query<any>(
      `SELECT * FROM performance_goals ${where} ORDER BY created_at DESC`, params
    ).map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      cycleId: row.cycle_id || null,
      title: row.title,
      description: row.description || null,
      weight: Number(row.weight) || 1,
      targetValue: row.target_value == null ? null : Number(row.target_value),
      actualValue: row.actual_value == null ? null : Number(row.actual_value),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  static updateGoalProgress(id: string, actualValue: number, status?: PerformanceGoalStatus): void {
    const actor = this.requireManage();
    this.db.run(
      `UPDATE performance_goals SET actual_value = ?, status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [actualValue, status || null, id]
    );
    this.audit(actor, 'تحديث تقدم هدف', id, { actualValue, status });
  }

  // Evaluations
  static createEvaluation(input: { employeeId: string; cycleId: string; evaluatorId?: string | null; evaluatorType?: PerformanceEvaluatorType; notes?: string }): PerformanceEvaluation {
    const actor = this.requireManage();
    const id = `pev_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO performance_evaluations (id, employee_id, cycle_id, evaluator_id, evaluator_type, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.cycleId, input.evaluatorId || actor.id, input.evaluatorType || 'MANAGER', input.notes?.trim() || null]
    );
    this.audit(actor, 'إنشاء تقييم أداء', id, input);
    return this.getEvaluation(id)!;
  }

  private static getEvaluation(id: string): PerformanceEvaluation | null {
    const row = this.db.query<any>(`SELECT * FROM performance_evaluations WHERE id = ?`, [id])[0];
    if (!row) return null;
    return this.mapEvaluation(row, this.getEvaluationItems(id));
  }

  static getEvaluations(employeeId?: string, cycleId?: string): PerformanceEvaluation[] {
    this.requireView();
    const conditions: string[] = [];
    const params: any[] = [];
    if (employeeId) { conditions.push('employee_id = ?'); params.push(employeeId); }
    if (cycleId) { conditions.push('cycle_id = ?'); params.push(cycleId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.query<any>(`SELECT * FROM performance_evaluations ${where} ORDER BY created_at DESC`, params);
    return rows.map((row) => this.mapEvaluation(row, this.getEvaluationItems(row.id)));
  }

  private static getEvaluationItems(evaluationId: string): PerformanceEvaluationItem[] {
    return this.db.query<any>(
      `SELECT * FROM performance_evaluation_items WHERE evaluation_id = ? ORDER BY created_at`,
      [evaluationId]
    ).map((row) => ({
      id: row.id,
      evaluationId: row.evaluation_id,
      kpiId: row.kpi_id || null,
      goalId: row.goal_id || null,
      score: Number(row.score) || 0,
      weight: Number(row.weight) || 1,
      comments: row.comments || null,
      createdAt: row.created_at,
    }));
  }

  private static mapEvaluation(row: any, items: PerformanceEvaluationItem[]): PerformanceEvaluation {
    return {
      id: row.id,
      employeeId: row.employee_id,
      cycleId: row.cycle_id,
      evaluatorId: row.evaluator_id || null,
      evaluatorType: row.evaluator_type,
      score: Number(row.score) || 0,
      rating: row.rating,
      notes: row.notes || null,
      status: row.status,
      submittedAt: row.submitted_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items,
    };
  }

  static addEvaluationItem(input: { evaluationId: string; kpiId?: string | null; goalId?: string | null; score: number; weight?: number; comments?: string }): PerformanceEvaluationItem {
    const actor = this.requireManage();
    const id = `pei_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO performance_evaluation_items (id, evaluation_id, kpi_id, goal_id, score, weight, comments)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.evaluationId, input.kpiId || null, input.goalId || null,
       Math.max(0, Number(input.score) || 0), Math.max(0, Number(input.weight) || 1), input.comments?.trim() || null]
    );
    this.recalculateEvaluation(input.evaluationId);
    this.audit(actor, 'إضافة بند تقييم', id, input);
    return this.getEvaluationItems(input.evaluationId).find((row) => row.id === id)!;
  }

  private static recalculateEvaluation(evaluationId: string): void {
    const items = this.db.query<any>(
      `SELECT score, weight FROM performance_evaluation_items WHERE evaluation_id = ?`,
      [evaluationId]
    );
    const totalWeight = items.reduce((sum, row) => sum + (Number(row.weight) || 0), 0);
    const weighted = items.reduce((sum, row) => sum + (Number(row.score) || 0) * (Number(row.weight) || 0), 0);
    const score = totalWeight > 0 ? weighted / totalWeight : 0;
    const rating = score >= 90 ? 'EXCELLENT' : score >= 75 ? 'GOOD' : score >= 60 ? 'SATISFACTORY' : score >= 40 ? 'NEEDS_IMPROVEMENT' : 'UNSATISFACTORY';
    this.db.run(
      `UPDATE performance_evaluations SET score = ?, rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [Math.round(score * 100) / 100, rating, evaluationId]
    );
  }

  static submitEvaluation(id: string): void {
    const actor = this.requireManage();
    this.db.run(
      `UPDATE performance_evaluations SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
    this.audit(actor, 'تقديم تقييم أداء', id, {});
  }

  static approveEvaluation(id: string): void {
    const actor = this.requireManage();
    this.db.run(
      `UPDATE performance_evaluations SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
    this.audit(actor, 'اعتماد تقييم أداء', id, {});
  }

  // PIPs
  static createPip(input: { employeeId: string; startDate: string; endDate: string; reason: string; goals?: string; status?: PerformancePipStatus }): PerformancePip {
    const actor = this.requireManage();
    const id = `pip_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO performance_pips (id, employee_id, start_date, end_date, reason, goals, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.startDate, input.endDate, input.reason.trim(), input.goals?.trim() || null, input.status || 'ACTIVE', actor.id]
    );
    this.audit(actor, 'إنشاء خطة تحسين أداء', id, input);
    return this.getPips(input.employeeId).find((row) => row.id === id)!;
  }

  static getPips(employeeId?: string): PerformancePip[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (employeeId) { where = 'employee_id = ?'; params.push(employeeId); }
    return this.db.query<any>(
      `SELECT * FROM performance_pips WHERE ${where} ORDER BY start_date DESC`, params
    ).map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      goals: row.goals || null,
      status: row.status,
      reviewDate: row.review_date || null,
      outcome: row.outcome || null,
      createdBy: row.created_by || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  static updatePip(id: string, patch: { status?: PerformancePipStatus; reviewDate?: string; outcome?: string }): void {
    const actor = this.requireManage();
    this.db.run(
      `UPDATE performance_pips SET status = COALESCE(?, status), review_date = COALESCE(?, review_date),
         outcome = COALESCE(?, outcome), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [patch.status || null, patch.reviewDate || null, patch.outcome || null, id]
    );
    this.audit(actor, 'تحديث خطة تحسين أداء', id, patch);
  }

  // Rewards
  static createReward(input: { employeeId: string; evaluationId?: string | null; rewardType: PerformanceRewardType; amount?: number; notes?: string; status?: PerformanceRewardStatus }): PerformanceReward {
    const actor = this.requireManage();
    const id = `rew_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO performance_rewards (id, employee_id, evaluation_id, reward_type, amount, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.evaluationId || null, input.rewardType, Math.max(0, Number(input.amount) || 0),
       input.status || 'PENDING', input.notes?.trim() || null, actor.id]
    );
    this.audit(actor, 'إنشاء مكافأة أداء', id, input);
    return this.getRewards(input.employeeId).find((row) => row.id === id)!;
  }

  static getRewards(employeeId?: string): PerformanceReward[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (employeeId) { where = 'employee_id = ?'; params.push(employeeId); }
    return this.db.query<any>(
      `SELECT * FROM performance_rewards WHERE ${where} ORDER BY created_at DESC`, params
    ).map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      evaluationId: row.evaluation_id || null,
      rewardType: row.reward_type,
      amount: Number(row.amount) || 0,
      status: row.status,
      notes: row.notes || null,
      createdBy: row.created_by || null,
      createdAt: row.created_at,
    }));
  }

  static approveReward(id: string): void {
    const actor = this.requireManage();
    this.db.run(`UPDATE performance_rewards SET status = 'APPROVED' WHERE id = ?`, [id]);
    this.audit(actor, 'اعتماد مكافأة أداء', id, {});
  }
  static autoCreateEvaluations(cycleId: string, evaluatorType: PerformanceEvaluatorType = 'MANAGER'): number {
    const actor = this.requireManage();
    const cycle = this.db.query<{ id: string; startDate: string; endDate: string }>(
      'SELECT id, start_date AS startDate, end_date AS endDate FROM performance_cycles WHERE id = ?',
      [cycleId]
    )[0];
    if (!cycle) throw new Error('دورة التقييم غير موجودة.');
    const employees = this.db.query<{ id: string; jobTitle: string | null; departmentId: string | null }>(`
      SELECT e.id, e.role AS jobTitle, e.department_id AS departmentId
      FROM employees e
      WHERE e.is_active = 1 AND e.status IN ('ACTIVE', 'PROBATION', 'ON_LEAVE')
    `);
    let created = 0;
    for (const employee of employees) {
      const existing = this.db.query<{ id: string }>(
        `SELECT id FROM performance_evaluations WHERE employee_id = ? AND cycle_id = ? AND evaluator_type = ?`,
        [employee.id, cycleId, evaluatorType]
      );
      if (existing.length) continue;
      const evaluation = this.createEvaluation({
        employeeId: employee.id,
        cycleId,
        evaluatorType,
        notes: 'تقييم تلقائي',
      });
      const kpis = this.getKpis(employee.jobTitle, employee.departmentId);
      for (const kpi of kpis) {
        this.addEvaluationItem({
          evaluationId: evaluation.id,
          kpiId: kpi.id,
          score: 0,
          weight: kpi.defaultWeight,
          comments: undefined,
        });
      }
      // Attendance KPI
      const attendanceKpi = this.ensureKpi('الحضور والانضباط', employee.jobTitle, employee.departmentId, 'نسبة الحضور والانضباط', 2, '%');
      this.addEvaluationItem({
        evaluationId: evaluation.id,
        kpiId: attendanceKpi.id,
        score: 0,
        weight: attendanceKpi.defaultWeight,
        comments: 'يُحدّث تلقائياً من بيانات الحضور',
      });
      created += 1;
    }
    this.audit(actor, 'إنشاء تقييمات تلقائية', cycleId, { evaluatorType, created });
    return created;
  }

  private static ensureKpi(name: string, jobTitle: string | null, departmentId: string | null, description: string, weight: number, unit: string): PerformanceKpi {
    const existing = this.db.query<{ id: string }>(
      `SELECT id FROM performance_kpis WHERE name = ? AND COALESCE(job_title,'') = COALESCE(?,'') AND is_active = 1`,
      [name, jobTitle]
    )[0];
    if (existing) return this.getKpis(jobTitle, departmentId).find((k) => k.id === existing.id)!;
    return this.createKpi({ name, jobTitle, departmentId, description, defaultWeight: weight, unit });
  }

  static syncAttendanceKpi(evaluationId: string, employeeId: string, from: string, to: string): number {
    const actor = this.requireManage();
    const evaluation = this.db.query<{ employeeId: string }>(
      'SELECT employee_id AS employeeId FROM performance_evaluations WHERE id = ?',
      [evaluationId]
    )[0];
    if (!evaluation || evaluation.employeeId !== employeeId) throw new Error('التقييم غير موجود أو لا يطابق الموظف.');

    const stats = this.db.query<any>(`
      SELECT COUNT(*) AS days,
        COALESCE(SUM(worked_minutes), 0) AS workedMinutes,
        COALESCE(SUM(late_minutes), 0) AS lateMinutes,
        COALESCE(SUM(overtime_minutes), 0) AS overtimeMinutes,
        COALESCE(SUM(CASE WHEN overtime_approved = 1 THEN overtime_minutes ELSE 0 END), 0) AS approvedOvertime
      FROM attendance
      WHERE employee_id = ? AND date >= ? AND date <= ?
    `, [employeeId, from, to])[0];

    const days = Math.max(1, Number(stats?.days) || 0);
    const lateMinutes = Number(stats?.lateMinutes) || 0;
    const workedMinutes = Number(stats?.workedMinutes) || 0;
    const expectedMinutes = days * 8 * 60;
    const attendanceRatio = expectedMinutes > 0 ? Math.min(1, workedMinutes / expectedMinutes) : 0;
    const latePenalty = Math.min(40, lateMinutes / 60 * 2); // 2 points per hour late, max 40
    const score = Math.max(0, Math.min(100, Math.round(attendanceRatio * 100 - latePenalty)));

    const kpi = this.ensureKpi('الحضور والانضباط', null, null, 'نسبة الحضور والانضباط', 2, '%');
    const item = this.db.query<{ id: string }>(
      `SELECT id FROM performance_evaluation_items WHERE evaluation_id = ? AND kpi_id = ?`,
      [evaluationId, kpi.id]
    )[0];
    if (item) {
      this.db.run(`UPDATE performance_evaluation_items SET score = ?, comments = ? WHERE id = ?`,
        [score, `أيام: ${days}, عمل: ${workedMinutes} د, تأخير: ${lateMinutes} د`, item.id]);
    } else {
      this.addEvaluationItem({
        evaluationId,
        kpiId: kpi.id,
        score,
        weight: kpi.defaultWeight,
        comments: `أيام: ${days}, عمل: ${workedMinutes} د, تأخير: ${lateMinutes} د`,
      });
    }
    this.recalculateEvaluation(evaluationId);
    this.audit(actor, 'مزامنة KPI الحضور', evaluationId, { employeeId, from, to, score });
    return score;
  }

  static autoScoreAllAttendance(cycleId: string, from: string, to: string): number {
    const actor = this.requireManage();
    const evaluations = this.getEvaluations(undefined, cycleId);
    let count = 0;
    for (const evaluation of evaluations) {
      try {
        this.syncAttendanceKpi(evaluation.id, evaluation.employeeId, from, to);
        count += 1;
      } catch {
        // skip invalid rows
      }
    }
    this.audit(actor, 'مزامنة KPI الحضور لدورة', cycleId, { from, to, count });
    return count;
  }

}