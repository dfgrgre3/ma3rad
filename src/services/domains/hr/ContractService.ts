import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { EmployeeDepartmentAccessService } from '../auth/EmployeeDepartmentAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { LeaveService } from './LeaveService';
import { localDateString } from '../../../utils/shared/date';
import type { User } from '../../../types/auth/identity';
import type {
  ContractSalaryComponent,
  ContractEffectiveStatus,
  ContractFilters,
  ContractRenewalDTO,
  ContractSummary,
  ContractTerminationDTO,
  ContractType,
  CreateContractDTO,
  EmployeeFinalSettlement,
  EmployeeContract,
  EmployeeLifecycleHistory,
  UpdateContractDTO,
} from '../../../types/hr/contract';

const CONTRACT_TYPES: ContractType[] = ['PERMANENT', 'FIXED_TERM', 'PART_TIME', 'TEMPORARY'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string | null | undefined, label: string): void {
  if (!value) return;
  const parsed = DATE_PATTERN.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD.`);
  }
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function validateSalaryComponents(components: ContractSalaryComponent[] | undefined): ContractSalaryComponent[] {
  if (components === undefined) return [];
  if (!Array.isArray(components) || components.some((component) =>
    !component.name?.trim() || !Number.isFinite(component.amount) || component.amount < 0
  )) {
    throw new Error('مكونات الراتب يجب أن تحتوي على أسماء ومبالغ غير سالبة.');
  }
  return components.map((component) => ({ name: component.name.trim(), amount: component.amount }));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function daysBetweenInclusive(startDate: string, endDate: string): number {
  return Math.max(0, Math.floor(
    (new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86_400_000
  ) + 1);
}

export class ContractService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private departmentAccess = new EmployeeDepartmentAccessService();

  private require(permission: string): User {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, permission);
    return actor;
  }

  private guardWrites(): void {
    ModuleRegistryService.assertModuleEnabled('hr');
  }

  private effectiveStatus(contract: EmployeeContract): ContractEffectiveStatus {
    if (contract.status !== 'ACTIVE') return contract.status;
    const today = localDateString();
    if (contract.startDate > today) return 'SCHEDULED';
    if (contract.endDate) {
      if (contract.endDate < today) return 'EXPIRED';
      const noticeStart = addDays(contract.endDate, -(Number(contract.renewalNoticeDays) || 0));
      if (noticeStart <= today) return 'EXPIRING';
    }
    return 'ACTIVE';
  }

  private decorate(contract: EmployeeContract): EmployeeContract {
    return { ...contract, effectiveStatus: this.effectiveStatus(contract) };
  }

  private queryContract(actor: User, id: string): EmployeeContract | null {
    const scope = this.branchAccess.sqlScope('c.branch_id', undefined, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    const row = this.db.query<EmployeeContract>(
      `SELECT c.*, e.name AS employee_name, b.name AS branch_name
       FROM employee_contracts c
       JOIN employees e ON e.id = c.employee_id
       LEFT JOIN branches b ON b.id = c.branch_id
       WHERE c.id = ? AND ${scope.clause} AND ${departmentScope.clause}`,
      [id, ...scope.params, ...departmentScope.params]
    )[0];
    return row ? this.decorate(row) : null;
  }

  private requireContract(actor: User, id: string): EmployeeContract {
    const contract = this.queryContract(actor, id);
    if (!contract) throw new Error('عقد الموظف غير موجود أو ليس لديك صلاحية الوصول إليه.');
    return contract;
  }

  private requireEmployeeBranch(employeeId: string, actor: User): { branchId: string; name: string } {
    const employee = this.db.query<{ branchId: string | null; name: string; status: string; terminatedAt: string | null }>(
      `SELECT branch_id AS branchId, name, status, terminated_at AS terminatedAt FROM employees WHERE id = ?`,
      [employeeId]
    )[0];
    if (!employee) throw new Error('الموظف المحدد غير موجود.');
    if (!employee.branchId) throw new Error('الموظف غير مرتبط بفرع.');
    if (employee.terminatedAt || ['RESIGNED', 'TERMINATED'].includes(employee.status)) {
      throw new Error('لا يمكن إنشاء عقد جديد لموظف انتهت خدمته.');
    }
    this.branchAccess.requireBranchAccess(employee.branchId, actor);
    this.departmentAccess.requireEmployeeAccess(employeeId, actor);
    return { branchId: employee.branchId, name: employee.name };
  }

  private assertNoActiveOverlap(
    employeeId: string,
    startDate: string,
    endDate: string | null,
    excludeId?: string
  ): void {
    const effectiveEnd = endDate || '9999-12-31';
    const overlap = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM employee_contracts
       WHERE employee_id = ? AND status = 'ACTIVE'
         AND start_date <= ? AND COALESCE(end_date, '9999-12-31') >= ?
         ${excludeId ? 'AND id != ?' : ''}`,
      excludeId
        ? [employeeId, effectiveEnd, startDate, excludeId]
        : [employeeId, effectiveEnd, startDate]
    )[0]?.count ?? 0;
    if (Number(overlap) > 0) {
      throw new Error('يوجد عقد نشط آخر للموظف يتداخل مع هذه الفترة. أنهِ العقد الحالي أو عدّل التواريخ.');
    }
  }

  public getContracts(filters: ContractFilters = {}): EmployeeContract[] {
    const actor = this.require('hr.contracts.view');
    const scope = this.branchAccess.sqlScope('c.branch_id', undefined, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    const conditions = [scope.clause, departmentScope.clause];
    const params: Array<string | number> = [...scope.params, ...departmentScope.params];

    if (filters.employeeId) {
      conditions.push('c.employee_id = ?');
      params.push(filters.employeeId);
    }
    if (filters.status && filters.status !== 'ALL') {
      conditions.push('c.status = ?');
      params.push(filters.status);
    }

    const rows = this.db.query<EmployeeContract>(
      `SELECT c.*, e.name AS employee_name, b.name AS branch_name
       FROM employee_contracts c
       JOIN employees e ON e.id = c.employee_id
       LEFT JOIN branches b ON b.id = c.branch_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.start_date DESC, c.created_at DESC`,
      params
    ).map((row) => this.decorate(row));

    if (filters.effectiveStatus && filters.effectiveStatus !== 'ALL') {
      return rows.filter((row) => row.effectiveStatus === filters.effectiveStatus);
    }
    return rows;
  }

  public getContract(id: string): EmployeeContract {
    const actor = this.require('hr.contracts.view');
    return this.requireContract(actor, id);
  }

  public createContract(input: CreateContractDTO): EmployeeContract {
    this.guardWrites();
    const actor = this.require('hr.contracts.manage');
    if (!input.employeeId) throw new Error('يجب اختيار الموظف.');
    if (!input.jobTitle?.trim()) throw new Error('المسمى الوظيفي مطلوب.');
    assertDate(input.startDate, 'تاريخ بداية العقد');
    assertDate(input.endDate, 'تاريخ نهاية العقد');
    if (input.endDate && input.endDate < input.startDate) {
      throw new Error('تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية.');
    }
    const contractType = input.contractType || 'PERMANENT';
    if (!CONTRACT_TYPES.includes(contractType)) throw new Error('نوع العقد غير صالح.');
    const salary = input.salary ?? 0;
    if (!Number.isFinite(salary) || salary < 0) throw new Error('قيمة الراتب يجب أن تكون رقماً غير سالب.');
    const salaryComponents = validateSalaryComponents(input.salaryComponents);
    const renewalNoticeDays = input.renewalNoticeDays ?? 30;
    if (!Number.isInteger(renewalNoticeDays) || renewalNoticeDays < 0 || renewalNoticeDays > 365) {
      throw new Error('مدة التنبيه قبل التجديد يجب أن تكون بين 0 و365 يوماً.');
    }

    const employee = this.requireEmployeeBranch(input.employeeId, actor);
    const id = `con_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    return this.db.executeTransaction((db) => {
      const contractNumber = db.nextNumber('CON');
      db.run(
        `INSERT INTO employee_contracts (
           id, employee_id, branch_id, contract_number, contract_type, start_date, end_date,
           job_title, salary, salary_components_json, currency, status, renewal_notice_days,
           notes, created_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)` ,
        [
          id, input.employeeId, employee.branchId, contractNumber, contractType, input.startDate,
          input.endDate || null, input.jobTitle.trim(), salary,
          JSON.stringify(salaryComponents),
          input.currency?.trim().toUpperCase() || 'EGP', renewalNoticeDays,
          input.notes?.trim() || null, actor.id, now, now,
        ]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إضافة عقد موظف', 'HR', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
          JSON.stringify({ employeeId: input.employeeId, contractNumber, startDate: input.startDate }),
        ]
      );
      return this.requireContract(actor, id);
    });
  }

  public updateContract(id: string, patch: UpdateContractDTO): EmployeeContract {
    this.guardWrites();
    const actor = this.require('hr.contracts.manage');
    const existing = this.requireContract(actor, id);
    if (existing.status !== 'DRAFT') {
      throw new Error('لا يمكن تعديل عقد بعد تفعيله. استخدم التجديد أو الإنهاء.');
    }
    if (patch.contractType && !CONTRACT_TYPES.includes(patch.contractType)) {
      throw new Error('نوع العقد غير صالح.');
    }
    if (patch.jobTitle !== undefined && !patch.jobTitle.trim()) throw new Error('المسمى الوظيفي مطلوب.');
    if (patch.salary !== undefined && (!Number.isFinite(patch.salary) || patch.salary < 0)) {
      throw new Error('قيمة الراتب يجب أن تكون رقماً غير سالب.');
    }
    const salaryComponents = patch.salaryComponents === undefined
      ? JSON.parse(existing.salaryComponentsJson || '[]') as ContractSalaryComponent[]
      : validateSalaryComponents(patch.salaryComponents);
    if (patch.renewalNoticeDays !== undefined) {
      if (!Number.isInteger(patch.renewalNoticeDays) || patch.renewalNoticeDays < 0 || patch.renewalNoticeDays > 365) {
        throw new Error('مدة التنبيه قبل التجديد يجب أن تكون بين 0 و365 يوماً.');
      }
    }
    assertDate(patch.startDate, 'تاريخ بداية العقد');
    assertDate(patch.endDate, 'تاريخ نهاية العقد');
    assertDate(patch.signedDate, 'تاريخ التوقيع');

    const startDate = patch.startDate ?? existing.startDate;
    const endDate = patch.endDate === undefined ? existing.endDate : patch.endDate;
    if (endDate && endDate < startDate) {
      throw new Error('تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية.');
    }

    this.db.run(
      `UPDATE employee_contracts SET
         contract_type = COALESCE(?, contract_type),
         start_date = COALESCE(?, start_date),
         end_date = ?,
         job_title = COALESCE(?, job_title),
         salary = COALESCE(?, salary),
         salary_components_json = ?,
         currency = COALESCE(?, currency),
         renewal_notice_days = COALESCE(?, renewal_notice_days),
         notes = COALESCE(?, notes),
         signed_date = COALESCE(?, signed_date),
         approved_by = NULL, approved_at = NULL,
         updated_at = ?
       WHERE id = ?`,
      [
        patch.contractType ?? null, patch.startDate ?? null, endDate,
        patch.jobTitle?.trim() || null, patch.salary ?? null,
        JSON.stringify(salaryComponents),
        patch.currency?.trim().toUpperCase() || null, patch.renewalNoticeDays ?? null,
        patch.notes?.trim() || null, patch.signedDate ?? null, new Date().toISOString(), id,
      ]
    );
    this.audit('تعديل عقد موظف', id, patch);
    return this.requireContract(actor, id);
  }

  public approveContract(id: string): EmployeeContract {
    this.guardWrites();
    const actor = this.require('hr.contracts.approve');
    const existing = this.requireContract(actor, id);
    if (existing.status !== 'DRAFT') throw new Error('يمكن اعتماد المسودة فقط.');
    const now = new Date().toISOString();
    this.db.run(
      'UPDATE employee_contracts SET approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?',
      [actor.id, now, now, id]
    );
    this.audit('اعتماد عقد موظف', id, { approvedBy: actor.id });
    return this.requireContract(actor, id);
  }

  public activateContract(id: string, signedDate?: string): EmployeeContract {
    this.guardWrites();
    const actor = this.require('hr.contracts.manage');
    const existing = this.requireContract(actor, id);
    if (existing.status !== 'DRAFT') throw new Error('لا يمكن تفعيل عقد ليس مسودة.');
    if (!existing.approvedAt || !existing.approvedBy) throw new Error('يجب اعتماد العقد قبل تفعيله.');
    assertDate(signedDate, 'تاريخ التوقيع');
    const renewalSourceId = existing.renewedFromId || undefined;
    this.assertNoActiveOverlap(existing.employeeId, existing.startDate, existing.endDate, renewalSourceId || existing.id);
    const employee = this.db.query<{
      status: string;
      baseSalary: number;
      salaryType: 'MONTHLY' | 'DAILY';
      terminatedAt: string | null;
    }>(
      `SELECT status, base_salary AS baseSalary, salary_type AS salaryType, terminated_at AS terminatedAt
       FROM employees WHERE id = ?`,
      [existing.employeeId]
    )[0];
    if (!employee) throw new Error('الموظف المرتبط بالعقد غير موجود.');
    if (employee.terminatedAt || ['RESIGNED', 'TERMINATED'].includes(employee.status)) {
      throw new Error('لا يمكن تفعيل عقد لموظف انتهت خدمته.');
    }

    this.db.executeTransaction((db) => {
      const now = new Date().toISOString();
      if (renewalSourceId) {
        const source = this.requireContract(actor, renewalSourceId);
        if (source.employeeId !== existing.employeeId || source.status !== 'ACTIVE') {
          throw new Error('العقد السابق المرتبط بالتجديد لم يعد نشطاً.');
        }
        const previousEndDate = addDays(existing.startDate, -1);
        db.run(
          `UPDATE employee_contracts SET
             end_date = CASE WHEN end_date IS NULL OR end_date > ? THEN ? ELSE end_date END,
             updated_at = ?
           WHERE id = ?`,
          [previousEndDate, previousEndDate, now, renewalSourceId]
        );
      }
      db.run(
        `UPDATE employee_contracts SET status = 'ACTIVE', signed_date = ?, updated_at = ? WHERE id = ?`,
        [signedDate || localDateString(), now, id]
      );
      db.run(
        `INSERT INTO employee_salary_history (
           id, employee_id, previous_salary, next_salary, salary_type, effective_date,
           source_type, source_id, reason, actor_id
         ) VALUES (?, ?, ?, ?, ?, ?, 'CONTRACT', ?, ?, ?)`,
        [
          `sal_${uuidv4().replace(/-/g, '').slice(0, 16)}`, existing.employeeId,
          employee.baseSalary, existing.salary, employee.salaryType, existing.startDate,
          id, `اعتماد وتفعيل العقد ${existing.contractNumber}`, actor.id,
        ]
      );
      db.run(
        'UPDATE employees SET base_salary = ?, updated_at = ? WHERE id = ?',
        [existing.salary, now, existing.employeeId]
      );
      if (employee.status === 'PROBATION' && existing.startDate <= localDateString()) {
        db.run(`UPDATE employees SET status = 'ACTIVE', updated_at = ? WHERE id = ?`, [now, existing.employeeId]);
        db.run(
          `INSERT INTO employee_status_history (
             id, employee_id, previous_status, next_status, effective_date, reason, actor_id
           ) VALUES (?, ?, 'PROBATION', 'ACTIVE', ?, ?, ?)`,
          [
            `sth_${uuidv4().replace(/-/g, '').slice(0, 16)}`, existing.employeeId,
            existing.startDate, `بدء سريان العقد ${existing.contractNumber}`, actor.id,
          ]
        );
      }
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'تفعيل عقد موظف', 'HR', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
          JSON.stringify({ signedDate: signedDate || localDateString(), renewalSourceId }),
        ]
      );
    });
    return this.requireContract(actor, id);
  }

  public renewContract(id: string, input: ContractRenewalDTO): EmployeeContract {
    this.guardWrites();
    const actor = this.require('hr.contracts.manage');
    const existing = this.requireContract(actor, id);
    if (existing.status !== 'ACTIVE') throw new Error('يمكن تجديد العقد النشط فقط.');
    if (this.db.query(
      `SELECT id FROM employee_contracts
       WHERE renewed_from_id = ? LIMIT 1`,
      [id]
    ).length) {
      throw new Error('يوجد عقد تجديد مفتوح مرتبط بهذا العقد بالفعل.');
    }
    assertDate(input.endDate, 'تاريخ نهاية التجديد');
    const today = localDateString();
    const startDate = input.startDate || (existing.endDate && existing.endDate >= today
      ? addDays(existing.endDate, 1)
      : existing.startDate >= today ? addDays(existing.startDate, 1) : today);
    assertDate(startDate, 'تاريخ بداية التجديد');
    const currentEnd = existing.endDate || localDateString();
    if (startDate <= existing.startDate || input.endDate < startDate || (existing.endDate && startDate <= existing.endDate)) {
      throw new Error('فترة التجديد يجب أن تبدأ بعد العقد السابق وتنتهي بعد تاريخ بدايتها.');
    }
    if (input.salary !== undefined && (!Number.isFinite(input.salary) || input.salary < 0)) {
      throw new Error('قيمة الراتب يجب أن تكون رقماً غير سالب.');
    }
    const components = validateSalaryComponents(input.salaryComponents);
    const employee = this.requireEmployeeBranch(existing.employeeId, actor);
    const renewalId = `con_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    return this.db.executeTransaction((db) => {
      const contractNumber = db.nextNumber('CON');
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO employee_contracts (
           id, employee_id, branch_id, contract_number, contract_type, start_date, end_date,
           job_title, salary, salary_components_json, currency, status, renewal_notice_days,
           renewed_from_id, notes, created_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)`,
        [
          renewalId, existing.employeeId, employee.branchId, contractNumber, existing.contractType,
          startDate, input.endDate, existing.jobTitle, input.salary ?? existing.salary,
          JSON.stringify(input.salaryComponents === undefined
            ? JSON.parse(existing.salaryComponentsJson || '[]')
            : components),
          existing.currency, existing.renewalNoticeDays, id,
          input.notes?.trim() || null, actor.id, now, now,
        ]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إنشاء تجديد عقد كمسودة', 'HR', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, renewalId,
          JSON.stringify({ renewedFromId: id, previousEndDate: currentEnd, startDate, endDate: input.endDate }),
        ]
      );
      return this.requireContract(actor, renewalId);
    });
  }

  public terminateContract(id: string, input: ContractTerminationDTO): EmployeeContract {
    this.guardWrites();
    const actor = this.require('hr.contracts.terminate');
    const existing = this.requireContract(actor, id);
    if (existing.status !== 'ACTIVE') throw new Error('يمكن إنهاء العقد النشط فقط.');
    assertDate(input.terminationDate, 'تاريخ إنهاء الخدمة');
    if (!input.reason?.trim()) throw new Error('سبب إنهاء العقد مطلوب.');
    if (!['RESIGNED', 'TERMINATED'].includes(input.employeeStatus)) throw new Error('نوع إنهاء الخدمة غير صالح.');
    if (input.terminationDate < existing.startDate) throw new Error('تاريخ إنهاء الخدمة يسبق بداية العقد.');
    if (input.terminationDate > localDateString()) {
      throw new Error('لا يمكن تسجيل إنهاء خدمة مستقبلي؛ سجّل الإنهاء عند سريانه لضمان اتساق الحالة الوظيفية.');
    }
    if (existing.endDate && input.terminationDate > existing.endDate) {
      throw new Error('تاريخ إنهاء الخدمة بعد انتهاء العقد؛ استخدم العقد الساري أو التجديد المرتبط به.');
    }
    if (this.db.query(
      `SELECT id FROM payroll_runs
       WHERE branch_id = ? AND period = substr(?, 1, 7) AND status != 'DRAFT'
         AND EXISTS (
           SELECT 1 FROM payroll_run_items pri
           WHERE pri.payroll_run_id = payroll_runs.id AND pri.employee_id = ?
         )
       LIMIT 1`,
      [existing.branchId, input.terminationDate, existing.employeeId]
    ).length) {
      throw new Error('فترة رواتب شهر إنهاء الخدمة معتمدة أو مصروفة؛ لا يمكن تعديلها قبل تسويتها.');
    }
    const employee = this.db.query<{ salaryType: 'MONTHLY' | 'DAILY'; branchId: string; workingDays: number }>(
      `SELECT e.salary_type AS salaryType, e.branch_id AS branchId,
              COALESCE(co.working_days_per_month, 26) AS workingDays
       FROM employees e
       LEFT JOIN branches b ON b.id = e.branch_id
       LEFT JOIN companies co ON co.id = b.company_id
       WHERE e.id = ?`,
      [existing.employeeId]
    )[0];
    if (!employee) throw new Error('الموظف المرتبط بالعقد غير موجود.');
    const components = JSON.parse(existing.salaryComponentsJson || '[]') as ContractSalaryComponent[];
    const totalMonthly = existing.salary + components.reduce((total, component) => total + component.amount, 0);
    const calendarMonthStart = `${input.terminationDate.slice(0, 7)}-01`;
    const monthStart = existing.startDate > calendarMonthStart ? existing.startDate : calendarMonthStart;
    const monthDays = new Date(Date.UTC(
      Number(input.terminationDate.slice(0, 4)), Number(input.terminationDate.slice(5, 7)), 0
    )).getUTCDate();
    const elapsedDays = daysBetweenInclusive(monthStart, input.terminationDate);
    const dailyRate = employee.salaryType === 'DAILY'
      ? totalMonthly
      : totalMonthly / Math.max(1, Number(employee.workingDays) || 26);
    const grossEarnedWages = employee.salaryType === 'DAILY'
      ? roundMoney(dailyRate * this.countScheduledWorkdays(
        existing.employeeId, employee.branchId, monthStart, input.terminationDate, employee.workingDays
      ))
      : roundMoney(totalMonthly * elapsedDays / monthDays);
    const salaryPayouts = Number(this.db.query<{ amount: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS amount FROM payroll_transactions
       WHERE employee_id = ? AND branch_id = ? AND type = 'SALARY_PAYOUT'
         AND date BETWEEN ? AND ?`,
      [existing.employeeId, existing.branchId, calendarMonthStart, input.terminationDate]
    )[0]?.amount ?? 0);
    const earnedWages = roundMoney(Math.max(0, grossEarnedWages - salaryPayouts));
    const unusedAnnualLeaveDays = new LeaveService().getAnnualBalanceAsOf(existing.employeeId, input.terminationDate);
    const leavePayout = roundMoney(unusedAnnualLeaveDays * dailyRate);
    const settlementId = `set_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const reason = input.reason.trim();

    this.db.executeTransaction((db) => {
      const now = new Date().toISOString();
      db.run(
        `UPDATE employee_contracts
         SET status = 'TERMINATED', end_date = ?, terminated_at = ?, termination_reason = ?, updated_at = ?
         WHERE id = ?`,
        [input.terminationDate, input.terminationDate, reason, now, id]
      );
      const previousStatus = db.query<{ status: string }>(
        'SELECT status FROM employees WHERE id = ?',
        [existing.employeeId]
      )[0]?.status;
      db.run(
        `UPDATE employees
         SET status = ?, is_active = 0, terminated_at = ?, termination_reason = ?, updated_at = ?
         WHERE id = ?`,
        [input.employeeStatus, input.terminationDate, reason, now, existing.employeeId]
      );
      db.run(
        `INSERT INTO employee_status_history (
           id, employee_id, previous_status, next_status, effective_date, reason, actor_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `sth_${uuidv4().replace(/-/g, '').slice(0, 16)}`, existing.employeeId, previousStatus || null,
          input.employeeStatus, input.terminationDate, reason, actor.id,
        ]
      );
      db.run(
        `INSERT INTO employee_final_settlements (
           id, employee_id, contract_id, branch_id, termination_date, reason, salary_type,
           base_salary, earned_wages, unused_annual_leave_days, leave_payout, total_amount,
           details_json, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          settlementId, existing.employeeId, id, existing.branchId, input.terminationDate, reason,
          employee.salaryType, existing.salary, earnedWages, unusedAnnualLeaveDays, leavePayout,
          roundMoney(earnedWages + leavePayout),
          JSON.stringify({
            salaryComponents: components, dailyRate, monthDays, monthElapsedDays: elapsedDays,
            eligibleStartDate: monthStart, grossEarnedWages, salaryPayouts,
          }),
          actor.id,
        ]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إنهاء عقد موظف', 'HR', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
          JSON.stringify({ terminationDate: input.terminationDate, reason, employeeStatus: input.employeeStatus, settlementId }),
        ]
      );
    });
    return this.requireContract(actor, id);
  }

  private countScheduledWorkdays(
    employeeId: string,
    branchId: string,
    startDate: string,
    endDate: string,
    fallbackDays: number
  ): number {
    const shifts = this.db.query<{ effectiveFrom: string; effectiveTo: string | null; workdaysJson: string }>(
      `SELECT a.effective_from AS effectiveFrom, a.effective_to AS effectiveTo, s.workdays_json AS workdaysJson
       FROM employee_shift_assignments a
       JOIN attendance_shifts s ON s.id = a.shift_id AND s.is_active = 1
       WHERE a.employee_id = ? AND a.effective_from <= ?
         AND (a.effective_to IS NULL OR a.effective_to >= ?)`,
      [employeeId, endDate, startDate]
    );
    const holidays = new Set(this.db.query<{ date: string }>(
      'SELECT date FROM attendance_holidays WHERE branch_id = ? AND date BETWEEN ? AND ?',
      [branchId, startDate, endDate]
    ).map((row) => row.date));
    let workdays = 0;
    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
      if (holidays.has(date)) continue;
      const shift = shifts.find((row) => row.effectiveFrom <= date && (!row.effectiveTo || row.effectiveTo >= date));
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (!shift || (JSON.parse(shift.workdaysJson) as number[]).includes(weekday)) {
        workdays += 1;
      }
    }
    if (!shifts.length) {
      const [year, month] = startDate.slice(0, 7).split('-').map(Number);
      const monthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return Math.min(workdays, Math.ceil(
        (Math.max(1, fallbackDays) * daysBetweenInclusive(startDate, endDate)) / monthDays
      ));
    }
    return workdays;
  }

  public getFinalSettlements(employeeId?: string): EmployeeFinalSettlement[] {
    const actor = this.require('hr.contracts.view');
    const scope = this.branchAccess.sqlScope('s.branch_id', undefined, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    const conditions = [scope.clause, departmentScope.clause];
    const params: Array<string> = [...scope.params, ...departmentScope.params];
    if (employeeId) {
      conditions.push('s.employee_id = ?');
      params.push(employeeId);
    }
    return this.db.query<EmployeeFinalSettlement>(
      `SELECT s.*, e.name AS employeeName, c.contract_number AS contractNumber
       FROM employee_final_settlements s
       JOIN employees e ON e.id = s.employee_id
       JOIN employee_contracts c ON c.id = s.contract_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.termination_date DESC, s.created_at DESC`,
      params
    );
  }

  public getEmployeeLifecycleHistory(employeeId: string): EmployeeLifecycleHistory {
    const actor = this.require('hr.contracts.view');
    const employee = this.db.query<{ branchId: string | null }>(
      'SELECT branch_id AS branchId FROM employees WHERE id = ?',
      [employeeId]
    )[0];
    if (!employee?.branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
    this.branchAccess.requireBranchAccess(employee.branchId, actor);
    this.departmentAccess.requireEmployeeAccess(employeeId, actor);
    const salaryChanges = this.db.query<EmployeeLifecycleHistory['salaryChanges'][number]>(
      `SELECT h.id, h.previous_salary AS previousSalary, h.next_salary AS nextSalary,
              h.salary_type AS salaryType, h.effective_date AS effectiveDate,
              h.source_type AS sourceType, h.reason, u.full_name AS actorName
       FROM employee_salary_history h
       LEFT JOIN users u ON u.id = h.actor_id
       WHERE h.employee_id = ?
       ORDER BY h.effective_date DESC, h.created_at DESC`,
      [employeeId]
    );
    const statusChanges = this.db.query<EmployeeLifecycleHistory['statusChanges'][number]>(
      `SELECT h.id, h.previous_status AS previousStatus, h.next_status AS nextStatus,
              h.effective_date AS effectiveDate, h.reason, u.full_name AS actorName
       FROM employee_status_history h
       LEFT JOIN users u ON u.id = h.actor_id
       WHERE h.employee_id = ?
       ORDER BY h.effective_date DESC, h.created_at DESC`,
      [employeeId]
    );
    return { salaryChanges, statusChanges };
  }

  public deleteContract(id: string): void {
    this.guardWrites();
    const actor = this.require('hr.contracts.manage');
    const existing = this.requireContract(actor, id);
    if (existing.status !== 'DRAFT') throw new Error('لا يمكن حذف عقد بعد تفعيله؛ استخدم الإنهاء.');
    this.db.run(`DELETE FROM employee_contracts WHERE id = ?`, [id]);
    this.audit('حذف عقد موظف', id, { employeeId: existing.employeeId });
  }

  public getSummary(employeeId?: string): ContractSummary {
    const rows = this.getContracts(employeeId ? { employeeId } : {});
    const summary: ContractSummary = { draft: 0, active: 0, expiring: 0, expired: 0, terminated: 0 };
    for (const row of rows) {
      switch (row.effectiveStatus) {
        case 'DRAFT': summary.draft += 1; break;
        case 'ACTIVE':
        case 'SCHEDULED': summary.active += 1; break;
        case 'EXPIRING': summary.active += 1; summary.expiring += 1; break;
        case 'EXPIRED': summary.expired += 1; break;
        case 'TERMINATED': summary.terminated += 1; break;
        default: break;
      }
    }
    return summary;
  }

  private audit(action: string, recordId: string, values?: unknown): void {
    const actor = AuthService.requireAuth();
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId,
        values === undefined ? null : JSON.stringify(values),
      ]
    );
  }
}
