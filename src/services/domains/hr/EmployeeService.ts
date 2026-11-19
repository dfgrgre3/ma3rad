import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { postLedgerEntry, reverseLedgerEntry } from '../../../database/repositories/ledger';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { CentralUsageLimitService } from '../licensing/CentralUsageLimitService';
import { localDateString } from '../../../utils/shared/date';
import { AttendanceService } from './AttendanceService';
import { EmployeeDepartmentAccessService } from '../auth/EmployeeDepartmentAccessService';
import { unscaleMoneyRow } from '../../../utils/money';
import {
  daysBetweenInclusive,
  fingerprintPayrollSources,
  isValidDate,
  isValidPayrollPeriod,
} from './EmployeeService/utils';
import {
  buildEmployeeByIdQuery,
  buildEmployeeListQuery,
  getSalesReps,
  hydrateEmployee,
  listBranchAssignments,
  normalizeAdditionalBranchIds,
  validateEmployeeFields,
  validateEmployeeOrganization,
  type EmployeeListOptions,
} from './EmployeeService/employeeQueries';
import {
  insertEmployeeRecord,
  updateEmployeeRecord,
  type EmployeeCreateInput,
  type EmployeeUpdateInput,
} from './EmployeeService/employeeMutations';
import {
  assertPayrollPeriodEditable,
  buildTransactionsQuery,
  persistPayrollTransaction,
} from './EmployeeService/payrollTransactions';
import {
  buildPayrollRunQuery,
  mapPayrollRunRows,
  readPayrollRunAsync,
  readPayrollRunItemsBatchAsync,
  readPayrollRunSync,
} from './EmployeeService/payrollRunReaders';
import {
  approvePayrollRunInTransaction,
  buildPayrollPayoutPlan,
  computePayrollRunItems,
  getPayrollSourceRows,
  persistPayrollPayouts,
  resolvePayrollBatchReference,
  savePayrollRunDraft,
} from './EmployeeService/payrollRunEngine';
import {
  buildEmployeeFinancials,
  buildPaymentReconciliation,
  computeTotalWagesBill,
  fetchActiveEmployeeSalaries,
  fetchActiveEmployeeSalariesAsync,
  getPayrollPayoutOptionsData,
  getPayrollPayoutOptionsDataAsync,
  listAttendance,
  listAttendanceAsync,
  listLocationCounts,
  listLocationCountsAsync,
  queryPayrollPayables,
  queryPayrollPayablesAsync,
} from './EmployeeService/payrollReports';
import type {
  Attendance,
  AttendanceStatus,
  Employee,
  EmployeeBranchAssignment,
  EmployeeFinancials,
  EmployeePayrollPayable,
  EmployeeServiceActor,
  EmployeeStatus,
  PayrollPayOptions,
  PayrollPaymentReconciliation,
  PayrollRun,
  PayrollRunStatus,
  SalaryType,
  PayrollTransaction,
  PayrollTransactionInput,
  PayrollTxType,
  SalesRepOption,
} from './EmployeeService/types';

export * from './EmployeeService/types';

export class EmployeeService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();
  private static departmentAccess = new EmployeeDepartmentAccessService();

  private static scopedServices() {
    return { branchAccess: this.branchAccess, departmentAccess: this.departmentAccess };
  }

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'ui.employees.employees.view', 'employees.payroll.view', 'employees.financials.view',
      'employees.payroll.manage', 'employees.payroll.approve',
    ]);
    return actor;
  }

  private static requireCreate() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.require(actor, 'employees.create');
    return actor;
  }

  private static requireUpdate() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.require(actor, 'employees.update');
    return actor;
  }

  private static requirePayrollView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve',
    ]);
    return actor;
  }

  private static requireAttendanceView() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'employees.attendance.view');
    return actor;
  }

  private static requireFinancialView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'employees.financials.view', 'employees.payroll.manage', 'employees.payroll.approve',
    ]);
    return actor;
  }

  private static requirePayrollManage() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.require(actor, 'employees.payroll.manage');
    return actor;
  }

  private static requirePayrollApproval() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.require(actor, 'employees.payroll.approve');
    return actor;
  }

  private static requireEmployeeBranch(employeeId: string, actor = AuthService.requireAuth()): string {
    const employee = this.db.query<{ branchId: string | null }>(
      'SELECT branch_id AS branchId FROM employees WHERE id = ?',
      [employeeId]
    )[0];
    const branchId = employee?.branchId;
    if (!branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
    this.branchAccess.requireBranchAccess(branchId, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    if (!this.db.query(
      `SELECT 1 FROM employees e WHERE e.id = ? AND ${departmentScope.clause}`,
      [employeeId, ...departmentScope.params]
    ).length) throw new Error('الموظف خارج نطاق الأقسام المصرح بها.');
    return branchId;
  }

  // ─── Employees ────────────────────────────────────────────────────────────────

  static getAll(opts: EmployeeListOptions = {}): Employee[] {
    const actor = this.requireView();
    const { sql, params } = buildEmployeeListQuery(actor, opts, this.scopedServices());
    return this.db.query<Employee & { additionalBranchIdsRaw?: string | null }>(sql, params)
      .map((row) => hydrateEmployee(row));
  }

  static async getAllAsync(opts: EmployeeListOptions = {}): Promise<Employee[]> {
    const actor = this.requireView();
    const { sql, params } = buildEmployeeListQuery(actor, opts, this.scopedServices());
    const rows = await this.db.queryAsync<Employee & { additionalBranchIdsRaw?: string | null }>(sql, params);
    return rows.map((row) => hydrateEmployee(row));
  }

  static getById(id: string): Employee | null {
    const actor = this.requireView();
    return this.getScopedById(id, actor);
  }

  static async getByIdAsync(id: string): Promise<Employee | null> {
    const actor = this.requireView();
    return this.getScopedByIdAsync(id, actor);
  }

  private static getScopedById(id: string, actor: EmployeeServiceActor): Employee | null {
    const { sql, params } = buildEmployeeByIdQuery(id, actor, this.scopedServices());
    const rows = this.db.query<Employee & { additionalBranchIdsRaw?: string | null }>(sql, params);
    return rows[0] ? hydrateEmployee(rows[0]) : null;
  }

  private static async getScopedByIdAsync(id: string, actor: EmployeeServiceActor): Promise<Employee | null> {
    const { sql, params } = buildEmployeeByIdQuery(id, actor, this.scopedServices());
    const rows = await this.db.queryAsync<Employee & { additionalBranchIdsRaw?: string | null }>(sql, params);
    return rows[0] ? hydrateEmployee(rows[0]) : null;
  }

  /** Additional branches assigned to an employee (excludes the home branch). */
  static getBranchAssignments(employeeId: string): EmployeeBranchAssignment[] {
    return listBranchAssignments(this.db, employeeId);
  }

  /**
   * Sales-rep picker source: every active employee in the actor's company scope,
   * with home + assigned branch coverage. When `branchId` is given, each option
   * carries `servesBranch` so callers can badge or sort reps covering that branch.
   * This is intentionally not restricted by employees.view — quotation/order
   * creators need the picker without HR permissions.
   */
  static getSalesReps(branchId?: string): SalesRepOption[] {
    return getSalesReps(this.db, this.branchAccess, branchId);
  }

  static create(data: EmployeeCreateInput): Employee {
    const actor = this.requireCreate();
    CentralUsageLimitService.assertWithin('maxEmployees');
    if (!data.name?.trim()) throw new Error('اسم الموظف مطلوب.');
    if (!data.role?.trim()) throw new Error('المسمى الوظيفي مطلوب.');
    if (!data.phone?.trim()) throw new Error('رقم الهاتف مطلوب.');
    validateEmployeeFields(data);
    if (!Number.isFinite(data.baseSalary) || data.baseSalary < 0) {
      throw new Error('الراتب الأساسي يجب أن يكون رقماً موجباً أو صفراً.');
    }
    if (!['MONTHLY', 'DAILY'].includes(data.salaryType)) throw new Error('دورة احتساب الراتب غير صالحة.');
    if (!['PROBATION', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED'].includes(data.status)) {
      throw new Error('الحالة الإدارية غير صالحة عند إنشاء الموظف.');
    }
    const branchId = data.branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    validateEmployeeOrganization(this.db, this.departmentAccess, data, branchId, undefined, actor);
    const additionalBranchIds = normalizeAdditionalBranchIds(this.db, this.branchAccess, data.additionalBranchIds, branchId, actor);
    const id = `emp_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      insertEmployeeRecord(db, { data, id, branchId, additionalBranchIds, actor });
      return this.getScopedById(id, actor)!;
    });
  }

  static update(id: string, data: EmployeeUpdateInput): Employee {
    const actor = this.requireUpdate();
    const existing = this.getScopedById(id, actor);
    if (!existing) throw new Error('الموظف غير موجود.');
    if (data.branchId) this.branchAccess.requireBranchAccess(data.branchId, actor);
    validateEmployeeFields(data);
    if (data.status === 'RESIGNED' || data.status === 'TERMINATED') {
      throw new Error('سجّل الاستقالة أو إنهاء الخدمة من دورة إنهاء العقد لضمان التسوية وسجل الحالة.');
    }
    const stored = this.db.query<{ status: EmployeeStatus; baseSalary: number; salaryType: SalaryType }>(
      'SELECT status, base_salary / 100.0 AS baseSalary, salary_type AS salaryType FROM employees WHERE id = ?',
      [id]
    )[0];
    validateEmployeeOrganization(this.db, this.departmentAccess, data, data.branchId || existing.branchId || '', id, actor);
    const effectiveBranchId = data.branchId || existing.branchId || '';
    const additionalBranchIds = data.additionalBranchIds !== undefined
      ? normalizeAdditionalBranchIds(this.db, this.branchAccess, data.additionalBranchIds, effectiveBranchId, actor)
      : undefined;
    const nextStatus = data.status ?? existing.status;
    this.db.executeTransaction((db) => {
      updateEmployeeRecord(db, { id, data, stored, nextStatus, additionalBranchIds, actor });
    });
    return this.getById(id)!;
  }

  static delete(_id: string): void {
    AuthService.requireAuth();
    throw new Error('الحذف النهائي للموظفين معطل للحفاظ على السجلات المالية والتاريخية. استخدم إنهاء الخدمة أو الأرشفة.');
  }

  // ─── Payroll Transactions ─────────────────────────────────────────────────────

  static getTransactions(employeeId?: string): PayrollTransaction[] {
    const actor = this.requirePayrollView();
    if (employeeId) this.requireEmployeeBranch(employeeId, actor);
    const { sql, params } = buildTransactionsQuery(employeeId, actor, this.scopedServices());
    return this.db.query<PayrollTransaction>(sql, params);
  }

  static async getTransactionsAsync(employeeId?: string): Promise<PayrollTransaction[]> {
    const actor = this.requirePayrollView();
    if (employeeId) this.requireEmployeeBranch(employeeId, actor);
    const { sql, params } = buildTransactionsQuery(employeeId, actor, this.scopedServices());
    return this.db.queryAsync<PayrollTransaction>(sql, params);
  }

  static addTransaction(data: PayrollTransactionInput): PayrollTransaction {
    const actor = data.type === 'SALARY_PAYOUT' ? this.requirePayrollApproval() : this.requirePayrollManage();
    if (!isValidDate(data.date)) throw new Error('Payroll date is invalid.');
    const branchId = this.requireEmployeeBranch(data.employeeId, actor);
    assertPayrollPeriodEditable(this.db, branchId, data.date);
    const id = `ptx_${uuidv4().substring(0, 8)}`;
    const amount = Math.round(Number(data.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payroll amount must be greater than zero.');
    const requestedMethod = data.paymentMethod || this.db.query<{ salaryPaymentMethod: string }>(
      'SELECT salary_payment_method AS salaryPaymentMethod FROM employees WHERE id = ?',
      [data.employeeId]
    )[0]?.salaryPaymentMethod || 'CASH';
    const hasCashMovement = (data.type === 'ADVANCE' || data.type === 'SALARY_PAYOUT')
      && requestedMethod !== 'BANK_TRANSFER' && requestedMethod !== 'WALLET';
    const registerId = data.registerId
      ? data.registerId
      : hasCashMovement
        ? this.branchAccess.getDefaultRegisterId(branchId, actor)
        : null;
    this.db.executeTransaction((db) => {
      persistPayrollTransaction(db, this.branchAccess, data, amount, id, registerId, branchId, actor, undefined,
        (employeeId) => this.getById(employeeId)?.name);
    });
    return this.getTransactions(data.employeeId).find(t => t.id === id)!;
  }

  static accrueMonthlyPayroll(period: string): { created: number; skipped: number } {
    const actor = this.requirePayrollManage();
    this.departmentAccess.requireAllDepartmentAccess(actor);
    const branchScope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    const scope = {
      clause: `(${branchScope.clause}) AND (${departmentScope.clause})`,
      params: [...branchScope.params, ...departmentScope.params],
    };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Payroll period must be YYYY-MM.');
    if (period > localDateString().slice(0, 7)) throw new Error('Future payroll periods cannot be accrued.');
    if (this.db.query(
      `SELECT id FROM payroll_runs WHERE period = ? AND ${this.branchAccess.sqlScope('branch_id', undefined, actor).clause} LIMIT 1`,
      [period, ...this.branchAccess.sqlScope('branch_id', undefined, actor).params]
    ).length) {
      throw new Error('استخدم دورة الرواتب للفترة المحددة بدل الترحيل القديم.');
    }
    const year = Number(period.slice(0, 4));
    const month = Number(period.slice(5, 7));
    const periodStart = `${period}-01`;
    const periodEnd = localDateString(new Date(year, month, 0));
    const calendarDays = daysBetweenInclusive(periodStart, periodEnd);
    const employees = this.db.query<any>(
      `SELECT e.id, e.name,
              COALESCE((
                SELECT sh.next_salary FROM employee_salary_history sh
                WHERE sh.employee_id = e.id AND sh.effective_date <= ?
                ORDER BY sh.effective_date DESC, sh.created_at DESC LIMIT 1
              ), (
                SELECT sh.previous_salary FROM employee_salary_history sh
                WHERE sh.employee_id = e.id AND sh.effective_date > ?
                ORDER BY sh.effective_date, sh.created_at LIMIT 1
              ), e.base_salary / 100.0) AS baseSalary,
              e.salary_type AS salaryType,
              e.joined_date AS joinedDate, e.terminated_at AS terminatedAt,
              ec.salary / 100.0 AS contractSalary, ec.start_date AS contractStartDate, ec.end_date AS contractEndDate,
              ec.salary_components_json AS salaryComponentsJson,
              CASE WHEN EXISTS (
                SELECT 1 FROM employee_contracts hx
                WHERE hx.employee_id = e.id AND hx.status IN ('ACTIVE', 'TERMINATED')
                  AND hx.start_date <= ?
              ) THEN 1 ELSE 0 END AS hasContractHistory,
              COALESCE(c.working_days_per_month, 26) AS workingDays
       FROM employees e
       LEFT JOIN branches b ON b.id = e.branch_id
       LEFT JOIN companies c ON c.id = b.company_id
       LEFT JOIN employee_contracts ec ON ec.id = (
         SELECT ec2.id FROM employee_contracts ec2
         WHERE ec2.employee_id = e.id AND ec2.status IN ('ACTIVE', 'TERMINATED')
           AND ec2.start_date <= ? AND (ec2.end_date IS NULL OR ec2.end_date >= ?)
         ORDER BY ec2.start_date DESC LIMIT 1
       )
       WHERE e.joined_date <= ? AND (e.terminated_at IS NULL OR e.terminated_at >= ?)
         AND (e.status NOT IN ('SUSPENDED', 'RESIGNED', 'TERMINATED') OR e.terminated_at IS NOT NULL)
         AND NOT EXISTS (
           SELECT 1 FROM employee_final_settlements fs
           WHERE fs.employee_id = e.id AND substr(fs.termination_date, 1, 7) = ?
         )
         AND ${scope.clause}
       ORDER BY e.id`,
      [periodEnd, periodEnd, periodEnd, periodEnd, periodStart, periodEnd, periodStart, period, ...scope.params]
    );
    let created = 0;
    let skipped = 0;
    this.db.executeTransaction((db) => {
      for (const employee of employees) {
        const referenceId = `${employee.id}:${period}`;
        if (db.query(`SELECT id FROM journal_entries WHERE reference_type='PAYROLL_SALARY_ACCRUAL' AND reference_id=?`, [referenceId]).length) {
          skipped++;
          continue;
        }
        if (employee.hasContractHistory && !employee.contractStartDate) continue;
        const workingDays = Number(employee.workingDays) > 0 ? Number(employee.workingDays) : 26;
        const eligibleStart = [periodStart, employee.joinedDate, employee.contractStartDate]
          .filter(Boolean).sort().pop() as string;
        const eligibleEnd = [periodEnd, employee.terminatedAt, employee.contractEndDate]
          .filter(Boolean).sort()[0] as string;
        const eligibleDays = daysBetweenInclusive(eligibleStart, eligibleEnd);
        if (!eligibleDays) continue;
        const baseSalary = Number(employee.contractSalary ?? employee.baseSalary) || 0;
        let components: Array<{ name: string; amount: number }> = [];
        try {
          const parsed = JSON.parse(employee.salaryComponentsJson || '[]') as unknown;
          if (!Array.isArray(parsed) || parsed.some((component) =>
            !component || typeof component.name !== 'string' || !component.name.trim()
            || typeof component.amount !== 'number' || !Number.isFinite(component.amount) || component.amount < 0
          )) throw new Error('Invalid salary components');
          components = parsed.map((component) => ({ name: component.name, amount: component.amount }));
        } catch {
          throw new Error(`تعذر قراءة مكونات راتب الموظف ${employee.name} في دورة الترحيل.`);
        }
        const monthlySalary = baseSalary + components.reduce((total, component) => total + component.amount, 0);
        const salary = Math.round((
          employee.salaryType === 'DAILY'
            ? monthlySalary * workingDays * eligibleDays / calendarDays
            : monthlySalary * eligibleDays / calendarDays
        ) * 100) / 100;
        if (salary <= 0) continue;
        postLedgerEntry(db.getDatabase(), {
          date: `${period}-01`,
          description: `Salary accrual for ${employee.name} (${period})`,
          referenceType: 'PAYROLL_SALARY_ACCRUAL',
          referenceId,
          createdBy: actor.id,
          lines: [
            { accountCode: '5202', debit: salary, credit: 0 },
            { accountCode: '2104', debit: 0, credit: salary },
          ],
        });
        created++;
      }
      db.run(
        `INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values)
         VALUES (?,?,?,?,?,?,?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Accrue monthly payroll', 'HR', period,
          JSON.stringify({ created, skipped })]
      );
    });
    return { created, skipped };
  }

  static getPayrollRun(period: string): PayrollRun | null {
    const actor = this.requirePayrollView();
    this.departmentAccess.requireAllDepartmentAccess(actor);
    if (!isValidPayrollPeriod(period)) throw new Error('Payroll period must be YYYY-MM.');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const { sql, params } = buildPayrollRunQuery('pr.period = ? AND pr.branch_id = ?', [period, branchId]);
    const run = this.db.query<any>(sql, params)[0];
    return run ? readPayrollRunSync(this.db, run) : null;
  }

  static async getPayrollRunAsync(period: string): Promise<PayrollRun | null> {
    const actor = this.requirePayrollView();
    this.departmentAccess.requireAllDepartmentAccess(actor);
    if (!isValidPayrollPeriod(period)) throw new Error('Payroll period must be YYYY-MM.');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const { sql, params } = buildPayrollRunQuery('pr.period = ? AND pr.branch_id = ?', [period, branchId]);
    const run = (await this.db.queryAsync<any>(sql, params))[0];
    return run ? readPayrollRunAsync(this.db, run) : null;
  }

  static getPayrollRunById(id: string): PayrollRun {
    const actor = this.requirePayrollView();
    this.departmentAccess.requireAllDepartmentAccess(actor);
    const scope = this.branchAccess.sqlScope('pr.branch_id', undefined, actor);
    const { sql, params } = buildPayrollRunQuery(`pr.id = ? AND ${scope.clause}`, [id, ...scope.params]);
    const run = this.db.query<any>(sql, params)[0];
    if (!run) throw new Error('دورة الرواتب غير موجودة ضمن نطاق فروعك.');
    return readPayrollRunSync(this.db, run);
  }

  static async getPayrollRunByIdAsync(id: string): Promise<PayrollRun> {
    const actor = this.requirePayrollView();
    this.departmentAccess.requireAllDepartmentAccess(actor);
    const scope = this.branchAccess.sqlScope('pr.branch_id', undefined, actor);
    const { sql, params } = buildPayrollRunQuery(`pr.id = ? AND ${scope.clause}`, [id, ...scope.params]);
    const run = (await this.db.queryAsync<any>(sql, params))[0];
    if (!run) throw new Error('دورة الرواتب غير موجودة ضمن نطاق فروعك.');
    return readPayrollRunAsync(this.db, run);
  }

  static getAllPayrollRuns(): PayrollRun[] {
    const actor = this.requirePayrollView();
    const scope = this.branchAccess.sqlScope('pr.branch_id', undefined, actor);
    const { sql, params } = buildPayrollRunQuery(scope.clause, [...scope.params]);
    const rows = this.db.query<any>(`${sql} ORDER BY pr.period DESC`, params);
    return mapPayrollRunRows(this.db, rows);
  }

  static async getAllPayrollRunsAsync(): Promise<PayrollRun[]> {
    const actor = this.requirePayrollView();
    const scope = this.branchAccess.sqlScope('pr.branch_id', undefined, actor);
    const { sql, params } = buildPayrollRunQuery(scope.clause, [...scope.params]);
    const rows = await this.db.queryAsync<any>(`${sql} ORDER BY pr.period DESC`, params);
    if (rows.length === 0) return [];
    const itemsByRun = await readPayrollRunItemsBatchAsync(this.db, rows.map((r) => r.id));
    return rows.map((run) => ({ ...run, items: itemsByRun.get(run.id) || [] }));
  }

  static calculatePayrollRun(period: string): PayrollRun {
    const actor = this.requirePayrollManage();
    this.departmentAccess.requireAllDepartmentAccess(actor);
    if (!isValidPayrollPeriod(period)) throw new Error('Payroll period must be YYYY-MM.');
    if (period > localDateString().slice(0, 7)) throw new Error('لا يمكن احتساب فترة رواتب مستقبلية.');

    const branchId = this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    const sourceRows = getPayrollSourceRows(this.db, period, branchId);
    const runId = this.db.query<{ id: string }>(
      'SELECT id FROM payroll_runs WHERE period = ? AND branch_id = ?',
      [period, branchId]
    )[0]?.id;
    if (runId) {
      const current = this.db.query<{ status: PayrollRunStatus }>(
        'SELECT status FROM payroll_runs WHERE id = ?',
        [runId]
      )[0];
      if (current?.status !== 'DRAFT') throw new Error('لا يمكن إعادة احتساب دورة تم اعتمادها أو صرفها أو إغلاقها.');
    }

    const existingRunId = runId || `prun_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const sourceFingerprint = fingerprintPayrollSources(sourceRows);
    const calculated = computePayrollRunItems(this.db, sourceRows, branchId);

    this.db.executeTransaction((db) => {
      savePayrollRunDraft(db, {
        existingRunId,
        isRecalculation: Boolean(runId),
        period,
        branchId,
        sourceFingerprint,
        actor,
        calculated,
      });
    });
    return this.getPayrollRun(period)!;
  }

  static approvePayrollRun(id: string): PayrollRun {
    const actor = this.requirePayrollApproval();
    this.departmentAccess.requireAllDepartmentAccess(actor);
    const run = this.getPayrollRunById(id);
    this.branchAccess.requireBranchAccess(run.branchId, actor);
    if (run.status !== 'DRAFT') throw new Error('لا يمكن اعتماد دورة رواتب ليست مسودة.');
    if (!run.items.length) throw new Error('لا يمكن اعتماد دورة رواتب بلا موظفين.');
    if (run.items.some((item) => item.netAmount < 0)) throw new Error('توجد رواتب صافية سالبة؛ عالج التحذيرات قبل الاعتماد.');
    const storedFingerprint = this.db.query<{ sourceFingerprint: string }>(
      'SELECT source_fingerprint AS sourceFingerprint FROM payroll_runs WHERE id = ?',
      [id]
    )[0]?.sourceFingerprint;
    if (storedFingerprint !== fingerprintPayrollSources(getPayrollSourceRows(this.db, run.period, run.branchId))) {
      throw new Error('تغيرت بيانات الرواتب بعد الاحتساب؛ أعد احتساب المسودة قبل الاعتماد.');
    }

    const now = new Date().toISOString();
    this.db.executeTransaction((db) => {
      approvePayrollRunInTransaction(db, run, actor, id, now);
    });
    return this.getPayrollRunById(id);
  }

  static payPayrollRun(id: string, options: PayrollPayOptions = {}): PayrollRun {
    const actor = this.requirePayrollApproval();
    this.departmentAccess.requireAllDepartmentAccess(actor);
    const run = this.getPayrollRunById(id);
    this.branchAccess.requireBranchAccess(run.branchId, actor);
    if (run.status !== 'APPROVED') throw new Error('يجب اعتماد دورة الرواتب قبل صرفها.');
    const today = localDateString();
    const batchReference = resolvePayrollBatchReference(run, options);
    const resolved = buildPayrollPayoutPlan(this.db, this.branchAccess, run, options, actor, today, batchReference);
    this.db.executeTransaction((db) => {
      persistPayrollPayouts(db, this.branchAccess, resolved, run, actor, batchReference, id, today,
        (employeeId) => this.getById(employeeId)?.name);
    });
    return this.getPayrollRunById(id);
  }

  static getPayrollPaymentReconciliation(id: string): PayrollPaymentReconciliation {
    const actor = this.requirePayrollView();
    this.departmentAccess.requireAllDepartmentAccess(actor);
    const run = this.getPayrollRunById(id);
    this.branchAccess.requireBranchAccess(run.branchId, actor);
    return buildPaymentReconciliation(run);
  }

  static getPayrollPayoutOptions(): {
    bankAccounts: Array<{ id: string; accountName: string; bankName: string; accountNumber: string; currentBalance: number }>;
    registers: Array<{ id: string; name: string; currentBalance: number }>;
  } {
    const actor = this.requirePayrollApproval();
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    return getPayrollPayoutOptionsData(this.db, branchId);
  }

  static async getPayrollPayoutOptionsAsync(): Promise<{
    bankAccounts: Array<{ id: string; accountName: string; bankName: string; accountNumber: string; currentBalance: number }>;
    registers: Array<{ id: string; name: string; currentBalance: number }>;
  }> {
    const actor = this.requirePayrollApproval();
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    return getPayrollPayoutOptionsDataAsync(this.db, branchId);
  }

  static closePayrollRun(id: string): PayrollRun {
    const actor = this.requirePayrollApproval();
    this.departmentAccess.requireAllDepartmentAccess(actor);
    const run = this.getPayrollRunById(id);
    this.branchAccess.requireBranchAccess(run.branchId, actor);
    if (run.status !== 'PAID') throw new Error('يجب صرف دورة الرواتب قبل إغلاقها.');
    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE payroll_runs SET status = 'CLOSED', closed_by = ?, closed_at = ? WHERE id = ? AND status = 'PAID'`,
        [actor.id, new Date().toISOString(), id]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'Close payroll run', 'HR', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ period: run.period })]
      );
    });
    return this.getPayrollRunById(id);
  }

  static getPayrollPayables(): EmployeePayrollPayable[] {
    const actor = this.requireFinancialView();
    this.departmentAccess.requireAllDepartmentAccess(actor);
    return queryPayrollPayables(this.db, actor, this.scopedServices());
  }

  static async getPayrollPayablesAsync(): Promise<EmployeePayrollPayable[]> {
    const actor = this.requireFinancialView();
    this.departmentAccess.requireAllDepartmentAccess(actor);
    return queryPayrollPayablesAsync(this.db, actor, this.scopedServices());
  }

  static deleteTransaction(id: string): void {
    const actor = this.requirePayrollManage();
    const scope = this.branchAccess.sqlScope('pt.branch_id', 'e.branch_id', actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    const row = this.db.query<any>(`
      SELECT pt.*, COALESCE(pt.branch_id, e.branch_id) AS effective_branch_id FROM payroll_transactions pt
      LEFT JOIN employees e ON e.id = pt.employee_id
      WHERE pt.id = ? AND ${scope.clause} AND ${departmentScope.clause}
    `, [id, ...scope.params, ...departmentScope.params])
      .map((r) => unscaleMoneyRow(r, ['amount']))[0];
    if (!row) throw new Error('عملية الرواتب غير موجودة ضمن نطاق فروعك.');
    assertPayrollPeriodEditable(this.db, row.effective_branch_id, row.date);
    this.db.executeTransaction((db) => {
      const entry = db.query<any>(`SELECT id FROM journal_entries WHERE reference_type='PAYROLL_TRANSACTION' AND reference_id=?`, [id])[0];
      if (entry) reverseLedgerEntry(db.getDatabase(), entry.id, {
        date: localDateString(), description: `Reverse payroll transaction ${id}`,
        referenceType: 'PAYROLL_REVERSAL', referenceId: `${id}:${uuidv4()}`, createdBy: actor.id,
      });
      if (row.type === 'ADVANCE' || row.type === 'SALARY_PAYOUT') {
        db.run('UPDATE cash_registers SET current_balance = current_balance + ROUND(?*100) WHERE id=?', [row.amount, row.register_id || 'cr_main']);
      }
      db.run('DELETE FROM payroll_transactions WHERE id=?', [id]);
    });
  }

  static getEmployeeFinancials(employeeId: string, period = localDateString().slice(0, 7)): EmployeeFinancials {
    const actor = this.requireFinancialView();
    if (!isValidPayrollPeriod(period)) throw new Error('Payroll period must be YYYY-MM.');
    const emp = this.getScopedById(employeeId, actor);
    if (!emp) throw new Error('الموظف غير موجود ضمن نطاق فروعك.');

    const scope = this.branchAccess.sqlScope('pt.branch_id', 'e.branch_id', actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    const rows = this.db.query<{ type: PayrollTxType; total: number }>(
      `SELECT pt.type, SUM(pt.amount) / 100.0 AS total
       FROM payroll_transactions pt JOIN employees e ON e.id = pt.employee_id
       WHERE pt.employee_id = ? AND substr(pt.date, 1, 7) = ? AND ${scope.clause}
         AND ${departmentScope.clause} GROUP BY pt.type`,
      [employeeId, period, ...scope.params, ...departmentScope.params]
    );
    const workingDays = Number(this.db.query<{ workingDays: number }>(
      `SELECT COALESCE(c.working_days_per_month, 26) AS workingDays
       FROM employees e
       LEFT JOIN branches b ON b.id = e.branch_id
       LEFT JOIN companies c ON c.id = b.company_id
       WHERE e.id = ?`,
      [employeeId]
    )[0]?.workingDays) || 26;

    return buildEmployeeFinancials(emp, rows, workingDays);
  }

  static async getEmployeeFinancialsAsync(employeeId: string, period = localDateString().slice(0, 7)): Promise<EmployeeFinancials> {
    const actor = this.requireFinancialView();
    if (!isValidPayrollPeriod(period)) throw new Error('Payroll period must be YYYY-MM.');
    const emp = await this.getScopedByIdAsync(employeeId, actor);
    if (!emp) throw new Error('الموظف غير موجود ضمن نطاق فروعك.');

    const scope = this.branchAccess.sqlScope('pt.branch_id', 'e.branch_id', actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    const [rows, workingDaysRow] = await Promise.all([
      this.db.queryAsync<{ type: PayrollTxType; total: number }>(
        `SELECT pt.type, SUM(pt.amount) / 100.0 AS total
         FROM payroll_transactions pt JOIN employees e ON e.id = pt.employee_id
         WHERE pt.employee_id = ? AND substr(pt.date, 1, 7) = ? AND ${scope.clause}
           AND ${departmentScope.clause} GROUP BY pt.type`,
        [employeeId, period, ...scope.params, ...departmentScope.params]
      ),
      this.db.queryAsync<{ workingDays: number }>(
        `SELECT COALESCE(c.working_days_per_month, 26) AS workingDays
         FROM employees e
         LEFT JOIN branches b ON b.id = e.branch_id
         LEFT JOIN companies c ON c.id = b.company_id
         WHERE e.id = ?`,
        [employeeId]
      ),
    ]);

    const workingDays = Number(workingDaysRow[0]?.workingDays) || 26;
    return buildEmployeeFinancials(emp, rows, workingDays);
  }

  // ─── Attendance ────────────────────────────────────────────────────────────────

  static getAllAttendance(): Attendance[] {
    const actor = this.requireAttendanceView();
    return listAttendance(this.db, actor, this.scopedServices());
  }

  static async getAllAttendanceAsync(): Promise<Attendance[]> {
    const actor = this.requireAttendanceView();
    return listAttendanceAsync(this.db, actor, this.scopedServices());
  }

  static getAttendanceByDate(date: string): Attendance[] {
    const actor = this.requireAttendanceView();
    return listAttendance(this.db, actor, this.scopedServices(), date);
  }

  static async getAttendanceByDateAsync(date: string): Promise<Attendance[]> {
    const actor = this.requireAttendanceView();
    return listAttendanceAsync(this.db, actor, this.scopedServices(), date);
  }

  static upsertAttendance(data: {
    employeeId: string;
    date: string;
    status: AttendanceStatus;
    lateMinutes?: number;
    overtimeMinutes?: number;
    notes?: string;
    recordedBy?: string;
  }): { pendingApproval: boolean; attendanceId: string | null } {
    return AttendanceService.saveManualRecord(data);
  }

  // ─── Analytics helpers ────────────────────────────────────────────────────────

  static getLocationCounts(): { location: string; count: number }[] {
    const actor = this.requireView();
    return listLocationCounts(this.db, actor, this.scopedServices());
  }

  static async getLocationCountsAsync(): Promise<{ location: string; count: number }[]> {
    const actor = this.requireView();
    return listLocationCountsAsync(this.db, actor, this.scopedServices());
  }

  static getTotalWagesBill(): number {
    const actor = this.requireFinancialView();
    return computeTotalWagesBill(fetchActiveEmployeeSalaries(this.db, actor, this.scopedServices()));
  }

  static async getTotalWagesBillAsync(): Promise<number> {
    const actor = this.requireFinancialView();
    return computeTotalWagesBill(await fetchActiveEmployeeSalariesAsync(this.db, actor, this.scopedServices()));
  }
}
