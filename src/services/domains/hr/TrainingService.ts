import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { postLedgerEntry } from '../../../database/repositories/ledger';

export interface TrainingTrainer { id: string; name: string; specialty: string | null; contact: string | null; isActive: boolean; createdAt: string; }
export interface TrainingCourse { id: string; name: string; description: string | null; trainerId: string | null; startDate: string | null; endDate: string | null; cost: number; status: string; createdBy: string | null; createdAt: string; }
export interface TrainingEnrollment { id: string; courseId: string; employeeId: string; status: string; attendancePercent: number; score: number | null; certificateExpiry: string | null; notes: string | null; createdAt: string; }
export interface TrainingExpense { id: string; courseId: string | null; employeeId: string | null; amount: number; expenseDate: string; description: string | null; paymentMethod: string; registerId: string | null; bankAccountId: string | null; ledgerReferenceId: string | null; createdBy: string | null; createdAt: string; }
export interface Skill { id: string; name: string; category: string | null; isActive: boolean; createdAt: string; }
export interface JobSkill { id: string; jobTitle: string; skillId: string; requiredLevel: number; createdAt: string; }
export interface EmployeeSkill { id: string; employeeId: string; skillId: string; level: number; certifiedAt: string | null; expiry: string | null; notes: string | null; createdAt: string; }
export interface TrainingGap { employeeId: string; skillId: string; skillName: string; requiredLevel: number; actualLevel: number; gap: number; }

export class TrainingService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();

  private static requireView() { const actor = AuthService.requireAuth(); PermissionService.requireAny(actor, ['ui.employees.employees.view', 'employees.payroll.view', 'employees.payroll.manage']); return actor; }
  private static requireManage() { const actor = AuthService.requireAuth(); ModuleRegistryService.assertModuleEnabled('hr'); PermissionService.require(actor, 'employees.payroll.manage'); return actor; }

  // Trainers
  static createTrainer(input: { name: string; specialty?: string; contact?: string }): TrainingTrainer {
    const actor = this.requireManage();
    const id = `trn_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO training_trainers (id, name, specialty, contact) VALUES (?, ?, ?, ?)`, [id, input.name.trim(), input.specialty?.trim() || null, input.contact?.trim() || null]);
    this.audit(actor, 'إضافة مدرب', id, input);
    return this.getTrainers().find((r) => r.id === id)!;
  }
  static getTrainers(): TrainingTrainer[] {
    this.requireView();
    return this.db.query<any>(`SELECT * FROM training_trainers WHERE is_active = 1 ORDER BY name`).map((r) => ({ id: r.id, name: r.name, specialty: r.specialty || null, contact: r.contact || null, isActive: Boolean(r.is_active), createdAt: r.created_at }));
  }
  static deactivateTrainer(id: string): void { const actor = this.requireManage(); this.db.run('UPDATE training_trainers SET is_active = 0 WHERE id = ?', [id]); this.audit(actor, 'تعطيل مدرب', id, {}); }

  // Courses
  static createCourse(input: { name: string; description?: string; trainerId?: string | null; startDate?: string | null; endDate?: string | null; cost?: number; status?: string }): TrainingCourse {
    const actor = this.requireManage();
    const id = `crs_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO training_courses (id, name, description, trainer_id, start_date, end_date, cost, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.name.trim(), input.description?.trim() || null, input.trainerId || null, input.startDate || null, input.endDate || null, Math.max(0, Number(input.cost) || 0), input.status || 'PLANNED', actor.id]);
    this.audit(actor, 'إضافة دورة تدريبية', id, input);
    return this.getCourses().find((r) => r.id === id)!;
  }
  static getCourses(): TrainingCourse[] {
    this.requireView();
    return this.db.query<any>(`SELECT * FROM training_courses ORDER BY created_at DESC`).map((r) => ({ id: r.id, name: r.name, description: r.description || null, trainerId: r.trainer_id || null, startDate: r.start_date || null, endDate: r.end_date || null, cost: Number(r.cost) || 0, status: r.status, createdBy: r.created_by || null, createdAt: r.created_at }));
  }
  static updateCourseStatus(id: string, status: string): void { const actor = this.requireManage(); this.db.run('UPDATE training_courses SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]); if (status === 'COMPLETED') { try { this.postCourseCost(id); } catch { /* already posted or zero cost */ } } this.audit(actor, 'تحديث حالة دورة', id, { status }); }

  // Enrollments
  static enroll(input: { courseId: string; employeeId: string; notes?: string }): TrainingEnrollment {
    const actor = this.requireManage();
    const id = `enr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO training_enrollments (id, course_id, employee_id, notes) VALUES (?, ?, ?, ?)`, [id, input.courseId, input.employeeId, input.notes?.trim() || null]);
    this.audit(actor, 'تسجيل موظف في دورة', id, input);
    return this.getEnrollmentsByCourse(input.courseId).find((r) => r.id === id)!;
  }
  static updateEnrollment(id: string, patch: { status?: string; attendancePercent?: number; score?: number | null; certificateExpiry?: string | null; notes?: string }): void {
    const actor = this.requireManage();
    this.db.run(`UPDATE training_enrollments SET status = COALESCE(?, status), attendance_percent = COALESCE(?, attendance_percent), score = COALESCE(?, score), certificate_expiry = COALESCE(?, certificate_expiry), notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [patch.status || null, patch.attendancePercent ?? null, patch.score ?? null, patch.certificateExpiry || null, patch.notes?.trim() || null, id]);
    this.audit(actor, 'تحديث تسجيل تدريبي', id, patch);
  }
  static getEnrollmentsByCourse(courseId: string): TrainingEnrollment[] {
    this.requireView();
    return this.db.query<any>(`SELECT * FROM training_enrollments WHERE course_id = ? ORDER BY created_at`, [courseId]).map(this.mapEnrollment);
  }
  static getEnrollmentsByEmployee(employeeId: string): TrainingEnrollment[] {
    this.requireView();
    return this.db.query<any>(`SELECT * FROM training_enrollments WHERE employee_id = ? ORDER BY created_at DESC`, [employeeId]).map(this.mapEnrollment);
  }
  private static mapEnrollment(r: any): TrainingEnrollment {
    return { id: r.id, courseId: r.course_id, employeeId: r.employee_id, status: r.status, attendancePercent: Number(r.attendance_percent) || 0, score: r.score == null ? null : Number(r.score), certificateExpiry: r.certificate_expiry || null, notes: r.notes || null, createdAt: r.created_at };
  }

  // Skills
  static createSkill(input: { name: string; category?: string }): Skill {
    const actor = this.requireManage();
    const id = `skl_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO skills (id, name, category) VALUES (?, ?, ?)`, [id, input.name.trim(), input.category?.trim() || null]);
    this.audit(actor, 'إضافة مهارة', id, input);
    return this.getSkills().find((r) => r.id === id)!;
  }
  static getSkills(): Skill[] {
    this.requireView();
    return this.db.query<any>(`SELECT * FROM skills WHERE is_active = 1 ORDER BY name`).map((r) => ({ id: r.id, name: r.name, category: r.category || null, isActive: Boolean(r.is_active), createdAt: r.created_at }));
  }
  static deactivateSkill(id: string): void { const actor = this.requireManage(); this.db.run('UPDATE skills SET is_active = 0 WHERE id = ?', [id]); this.audit(actor, 'تعطيل مهارة', id, {}); }

  // Job skills
  static addJobSkill(input: { jobTitle: string; skillId: string; requiredLevel: number }): JobSkill {
    const actor = this.requireManage();
    const id = `jsk_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO job_skills (id, job_title, skill_id, required_level) VALUES (?, ?, ?, ?)`, [id, input.jobTitle.trim(), input.skillId, Math.max(1, Number(input.requiredLevel) || 1)]);
    this.audit(actor, 'ربط مهارة بوظيفة', id, input);
    return this.getJobSkills(input.jobTitle).find((r) => r.id === id)!;
  }
  static getJobSkills(jobTitle?: string): JobSkill[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (jobTitle) { where = 'job_title = ?'; params.push(jobTitle); }
    return this.db.query<any>(`SELECT * FROM job_skills WHERE ${where} ORDER BY job_title`, params).map((r) => ({ id: r.id, jobTitle: r.job_title, skillId: r.skill_id, requiredLevel: Number(r.required_level) || 1, createdAt: r.created_at }));
  }

  // Employee skills
  static addEmployeeSkill(input: { employeeId: string; skillId: string; level: number; certifiedAt?: string | null; expiry?: string | null; notes?: string }): EmployeeSkill {
    const actor = this.requireManage();
    const id = `esk_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO employee_skills (id, employee_id, skill_id, level, certified_at, expiry, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.skillId, Math.max(1, Number(input.level) || 1), input.certifiedAt || null, input.expiry || null, input.notes?.trim() || null]);
    this.audit(actor, 'إضافة مهارة موظف', id, input);
    return this.getEmployeeSkills(input.employeeId).find((r) => r.id === id)!;
  }
  static getEmployeeSkills(employeeId: string): EmployeeSkill[] {
    this.requireView();
    return this.db.query<any>(`SELECT * FROM employee_skills WHERE employee_id = ? ORDER BY created_at`, [employeeId]).map((r) => ({ id: r.id, employeeId: r.employee_id, skillId: r.skill_id, level: Number(r.level) || 1, certifiedAt: r.certified_at || null, expiry: r.expiry || null, notes: r.notes || null, createdAt: r.created_at }));
  }

  // Gap report
  static getTrainingGaps(jobTitle: string): TrainingGap[] {
    this.requireView();
    const employees = this.db.query<{ id: string }>(`SELECT id FROM employees WHERE role = ? AND is_active = 1`, [jobTitle]);
    const required = this.getJobSkills(jobTitle);
    const skillMap = new Map(this.getSkills().map((s) => [s.id, s.name]));
    const gaps: TrainingGap[] = [];
    for (const emp of employees) {
      const skills = this.getEmployeeSkills(emp.id);
      for (const req of required) {
        const actual = skills.find((s) => s.skillId === req.skillId);
        const actualLevel = actual ? actual.level : 0;
        if (actualLevel < req.requiredLevel) {
          gaps.push({ employeeId: emp.id, skillId: req.skillId, skillName: skillMap.get(req.skillId) || req.skillId, requiredLevel: req.requiredLevel, actualLevel, gap: req.requiredLevel - actualLevel });
        }
      }
    }
    return gaps;
  }

  static getExpiringCertificates(days = 30): TrainingEnrollment[] {
    this.requireView();
    const future = new Date();
    future.setDate(future.getDate() + days);
    const cutoff = future.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return this.db.query<any>(`
      SELECT * FROM training_enrollments
      WHERE certificate_expiry IS NOT NULL AND certificate_expiry <= ? AND certificate_expiry >= ?
    `, [cutoff, today]).map(this.mapEnrollment);
  }


  // Expenses
  static recordExpense(input: { courseId?: string | null; employeeId?: string | null; amount: number; expenseDate: string; description?: string; paymentMethod?: string; registerId?: string | null; bankAccountId?: string | null }): TrainingExpense {
    const actor = this.requireManage();
    const amount = Math.max(0, Number(input.amount) || 0);
    if (!(amount > 0)) throw new Error('المبلغ يجب أن يكون أكبر من صفر.');
    const id = `tex_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const paymentMethod = input.paymentMethod || 'CASH';
    const ledgerRef = `tex_${id}`;

    // Resolve destination before writing anything.
    let creditAccountCode = '1101';
    const registerId: string | null = input.registerId || null;
    const bankAccountId: string | null = input.bankAccountId || null;
    if (paymentMethod === 'CASH') {
      if (registerId) {
        const register = this.db.query<{ id: string; branchId: string | null }>(
          'SELECT id, branch_id AS branchId FROM cash_registers WHERE id = ? AND is_active = 1', [registerId]
        )[0];
        if (!register) throw new Error('الخزينة المحددة غير موجودة أو غير نشطة.');
        this.branchAccess.requireBranchAccess(register.branchId || this.branchAccess.getCurrentBranchId(actor), actor);
      }
    } else if (paymentMethod === 'BANK_TRANSFER') {
      if (!bankAccountId) throw new Error('حدد الحساب البنكي لمصروف التدريب.');
      const bank = this.db.query<{ id: string; branchId: string | null; glAccountCode: string }>(
        `SELECT ba.id, ba.branch_id AS branchId, coa.code AS glAccountCode
         FROM bank_accounts ba JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
         WHERE ba.id = ? AND ba.is_active = 1`, [bankAccountId]
      )[0];
      if (!bank) throw new Error('الحساب البنكي المحدد غير موجود أو غير نشط.');
      this.branchAccess.requireBranchAccess(bank.branchId || this.branchAccess.getCurrentBranchId(actor), actor);
      creditAccountCode = bank.glAccountCode || '1102';
    } else if (paymentMethod === 'WALLET') {
      creditAccountCode = '1107';
    }

    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO training_expenses (id, course_id, employee_id, amount, expense_date, description, payment_method, register_id, bank_account_id, ledger_reference_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.courseId || null, input.employeeId || null, amount, input.expenseDate, input.description?.trim() || null, paymentMethod, registerId, bankAccountId, ledgerRef, actor.id]
      );
      postLedgerEntry(db.getDatabase(), {
        date: input.expenseDate,
        description: `مصروف تدريب: ${input.description?.trim() || input.courseId || ''}`,
        referenceType: 'TRAINING_EXPENSE',
        referenceId: ledgerRef,
        createdBy: actor.id,
        lines: [
          { accountCode: '5208', debit: amount, credit: 0 },
          { accountCode: creditAccountCode, debit: 0, credit: amount },
        ],
      });
      if (paymentMethod === 'CASH' && registerId) {
        db.run('UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?', [amount, registerId]);
      } else if (paymentMethod === 'BANK_TRANSFER' && bankAccountId) {
        db.run('UPDATE bank_accounts SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, bankAccountId]);
      }
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'تسجيل مصروف تدريب', 'HR', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ amount, paymentMethod, registerId, bankAccountId })]
      );
    });
    return this.getExpenses(input.courseId || undefined).find((r) => r.id === id)!;
  }

  static getExpenses(courseId?: string): TrainingExpense[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (courseId) { where = 'course_id = ?'; params.push(courseId); }
    return this.db.query<any>(
      `SELECT * FROM training_expenses WHERE ${where} ORDER BY expense_date DESC, created_at DESC`, params
    ).map((r) => ({
      id: r.id,
      courseId: r.course_id || null,
      employeeId: r.employee_id || null,
      amount: Number(r.amount) || 0,
      expenseDate: r.expense_date,
      description: r.description || null,
      paymentMethod: r.payment_method,
      registerId: r.register_id || null,
      bankAccountId: r.bank_account_id || null,
      ledgerReferenceId: r.ledger_reference_id || null,
      createdBy: r.created_by || null,
      createdAt: r.created_at,
    }));
  }

  static postCourseCost(courseId: string): void {
    const actor = this.requireManage();
    const course = this.db.query<{ name: string; cost: number }>(
      'SELECT name, cost FROM training_courses WHERE id = ?', [courseId]
    )[0];
    if (!course) throw new Error('الدورة غير موجودة.');
    const cost = Number(course.cost) || 0;
    if (!(cost > 0)) throw new Error('تكلفة الدورة صفر.');
    const existing = this.db.query<{ id: string }>(
      'SELECT id FROM training_expenses WHERE course_id = ? AND description = ?', [courseId, `تكلفة دورة: ${course.name}`]
    );
    if (existing.length) throw new Error('تم ترحيل تكلفة هذه الدورة مسبقًا.');
    this.recordExpense({
      courseId,
      amount: cost,
      expenseDate: new Date().toISOString().slice(0, 10),
      description: `تكلفة دورة: ${course.name}`,
      paymentMethod: 'CASH',
    });
    this.audit(actor, 'ترحيل تكلفة دورة', courseId, { cost });
  }

  static getTotalExpenses(courseId?: string): number {
    this.requireView();
    const row = this.db.query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM training_expenses ${courseId ? 'WHERE course_id = ?' : ''}`,
      courseId ? [courseId] : []
    )[0];
    return Number(row?.total) || 0;
  }

  private static audit(actor: ReturnType<typeof AuthService.requireAuth>, action: string, recordId: string, values: unknown): void {
    this.db.run(`INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values) VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId, JSON.stringify(values)]);
  }
}
