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

export type EmployeeStatus = 'PROBATION' | 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'RESIGNED' | 'TERMINATED';
export type SalaryType = 'MONTHLY' | 'DAILY';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'TEMPORARY';
export type PayrollTxType = 'ADVANCE' | 'BONUS' | 'DEDUCTION' | 'SALARY_PAYOUT';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND';

export interface Employee {
  id: string;
  code: string;
  branchId?: string;
  employmentType?: EmploymentType;
  name: string;
  nationalId?: string | null;
  birthDate?: string | null;
  gender?: 'FEMALE' | 'MALE' | 'OTHER' | null;
  location: string;
  role: string;
  phone: string;
  phone2?: string | null;
  email: string;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  managerEmployeeId?: string | null;
  managerName?: string | null;
  probationStartDate?: string | null;
  probationEndDate?: string | null;
  terminatedAt?: string | null;
  baseSalary: number;
  salaryType: SalaryType;
  salaryPaymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'WALLET';
  bankName?: string | null;
  bankAccountNumber?: string | null;
  socialInsuranceNumber?: string | null;
  taxFileNumber?: string | null;
  education?: string | null;
  previousExperience?: string | null;
  status: EmployeeStatus;
  joinedDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollTransaction {
  id: string;
  employeeId: string;
  branchId?: string;
  employeeName?: string;
  type: PayrollTxType;
  amount: number;
  date: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  workedMinutes?: number;
  lateMinutes: number;
  earlyLeaveMinutes?: number;
  overtimeMinutes: number;
  breakMinutes?: number;
  overtimeApproved?: boolean;
  notes: string;
  recordedBy: string;
  createdAt: string;
}

export interface EmployeeFinancials {
  baseSalary: number;
  advances: number;
  bonuses: number;
  deductions: number;
  payouts: number;
  netDue: number;
}

export interface EmployeePayrollPayable {
  employeeId: string | null;
  employeeName: string;
  balance: number;
}

export type PayrollRunStatus = 'DRAFT' | 'APPROVED' | 'PAID' | 'CLOSED';

export interface PayrollRunItem {
  id: string;
  employeeId: string;
  branchId: string;
  employeeName: string;
  salaryType: SalaryType;
  baseSalary: number;
  expectedWorkdays: number;
  absentDays: number;
  unpaidLeaveDays: number;
  lateMinutes: number;
  overtimeMinutes: number;
  baseAmount: number;
  overtimeAmount: number;
  bonusAmount: number;
  commissionAmount: number;
  advanceAmount: number;
  manualDeductionAmount: number;
  attendanceDeductionAmount: number;
  taxAmount: number;
  grossAmount: number;
  netAmount: number;
  warnings: string[];
  details: {
    workingDaysPerMonth: number;
    workingHoursPerDay: number;
    overtimeMultiplier: number;
    taxRate: number;
    previousPayoutAmount: number;
    commissionIds: string[];
    salaryComponents?: Array<{ name: string; amount: number }>;
    salaryComponentTotal?: number;
  };
  payoutTransactionId: string | null;
}

export interface PayrollRun {
  id: string;
  period: string;
  branchId: string;
  status: PayrollRunStatus;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  closedAt: string | null;
  items: PayrollRunItem[];
}

type PayrollTransactionInput = {
  employeeId: string;
  type: PayrollTxType;
  amount: number;
  date: string;
  notes: string;
  createdBy?: string;
  registerId?: string;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function daysBetweenInclusive(start: string, end: string): number {
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  return Math.max(0, Math.floor((endTime - startTime) / 86_400_000) + 1);
}

function countScheduledWorkdays(
  start: string,
  end: string,
  assignments: Array<{ effectiveFrom: string; effectiveTo: string | null; workdaysJson: string }>,
  holidayDates: Set<string>,
  fallbackWorkdays: number,
  monthDays: number
): number {
  let scheduled = 0;
  let cursor = start;
  while (cursor <= end) {
    if (!holidayDates.has(cursor)) {
      const assignment = assignments.find((row) =>
        row.effectiveFrom <= cursor && (!row.effectiveTo || row.effectiveTo >= cursor)
      );
      if (!assignment) {
        scheduled += fallbackWorkdays / monthDays;
      } else {
        const weekday = new Date(`${cursor}T00:00:00Z`).getUTCDay();
        if ((JSON.parse(assignment.workdaysJson) as number[]).includes(weekday)) scheduled += 1;
      }
    }
    const next = new Date(`${cursor}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return scheduled;
}

function countLeaveDays(
  start: string,
  end: string,
  assignments: Array<{ effectiveFrom: string; effectiveTo: string | null; workdaysJson: string }>,
  holidayDates: Set<string>
): number {
  let days = 0;
  for (let cursor = start; cursor <= end;) {
    if (!holidayDates.has(cursor)) {
      const assignment = assignments.find((row) =>
        row.effectiveFrom <= cursor && (!row.effectiveTo || row.effectiveTo >= cursor)
      );
      if (!assignment || (JSON.parse(assignment.workdaysJson) as number[])
        .includes(new Date(`${cursor}T00:00:00Z`).getUTCDay())) {
        days += 1;
      }
    }
    const next = new Date(`${cursor}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return days;
}

function isEmployeeScheduledOn(
  date: string,
  assignments: Array<{ effectiveFrom: string; effectiveTo: string | null; workdaysJson: string }>,
  holidayDates: Set<string>
): boolean {
  if (holidayDates.has(date)) return false;
  const assignment = assignments.find((row) =>
    row.effectiveFrom <= date && (!row.effectiveTo || row.effectiveTo >= date)
  );
  if (!assignment) return true;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (JSON.parse(assignment.workdaysJson) as number[]).includes(weekday);
}

function isValidPayrollPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

const WORKING_HOURS_PER_DAY = 8;

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function fingerprintPayrollSources(value: unknown): string {
  const serialized = JSON.stringify(value);
  let hash = 14_695_981_039_346_656_037n;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = (hash * 1_099_511_628_211n) & 0xffff_ffff_ffff_ffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

export class EmployeeService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();
  private static departmentAccess = new EmployeeDepartmentAccessService();

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'ui.employees.employees.view', 'employees.payroll.view', 'employees.financials.view',
      'employees.payroll.manage', 'employees.payroll.approve', 'ui.employees.employees.manage',
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

  static getAll(opts: { search?: string; location?: string; status?: EmployeeStatus } = {}): Employee[] {
    const actor = this.requireView();
    const canSeeFinancials = PermissionService.canAny(actor, ['employees.financials.view', 'employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve']);
    const canSeePrivateProfile = PermissionService.canAny(actor, ['employees.profile.view', 'employees.update']);
    const salaryColumns = canSeeFinancials
      ? 'e.base_salary AS baseSalary, e.salary_type AS salaryType'
      : "0 AS baseSalary, 'MONTHLY' AS salaryType";
    const privateProfileColumns = canSeePrivateProfile
      ? `e.national_id AS nationalId, e.birth_date AS birthDate, e.gender, e.phone2 AS phone2,
         e.address, e.emergency_contact_name AS emergencyContactName,
         e.emergency_contact_phone AS emergencyContactPhone, e.education,
         e.previous_experience AS previousExperience,
         e.probation_start_date AS probationStartDate, e.probation_end_date AS probationEndDate`
      : `NULL AS nationalId, NULL AS birthDate, NULL AS gender, NULL AS phone2,
         NULL AS address, NULL AS emergencyContactName, NULL AS emergencyContactPhone,
         NULL AS education, NULL AS previousExperience,
         NULL AS probationStartDate, NULL AS probationEndDate`;
    const conditions: string[] = [];
    const params: any[] = [];
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const companyScope = this.branchAccess.companyScope('e.company_id', actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);

    if (opts.search && opts.search.trim()) {
      conditions.push(`(e.name LIKE ? OR e.role LIKE ? OR e.phone LIKE ?)`);
      const t = `%${opts.search.trim()}%`;
      params.push(t, t, t);
    }
    if (opts.location && opts.location !== 'ALL') {
      conditions.push(`e.location = ?`);
      params.push(opts.location);
    }
    if (opts.status) {
      conditions.push(`e.status = ?`);
      params.push(opts.status);
    }
    conditions.push(scope.clause);
    params.push(...scope.params);
    conditions.push(companyScope.clause);
    params.push(...companyScope.params);
    conditions.push(departmentScope.clause);
    params.push(...departmentScope.params);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const financialColumns = canSeeFinancials
      ? 'e.salary_payment_method AS salaryPaymentMethod, e.bank_name AS bankName, e.bank_account_number AS bankAccountNumber, e.social_insurance_number AS socialInsuranceNumber, e.tax_file_number AS taxFileNumber'
      : "'CASH' AS salaryPaymentMethod, NULL AS bankName, NULL AS bankAccountNumber, NULL AS socialInsuranceNumber, NULL AS taxFileNumber";
    const sql = `SELECT e.id, e.code, e.branch_id AS branchId, e.employment_type AS employmentType,
                        COALESCE(e.name, e.full_name) AS name, ${privateProfileColumns},
                        e.location, e.role, e.phone, e.email,
                        e.department_id AS departmentId, d.name AS departmentName,
                        e.manager_employee_id AS managerEmployeeId, m.name AS managerName,
                        e.terminated_at AS terminatedAt,
                        ${salaryColumns}, ${financialColumns}, e.status,
                        e.joined_date AS joinedDate, e.notes, e.created_at AS createdAt, e.updated_at AS updatedAt
                 FROM employees e
                 LEFT JOIN departments d ON d.id = e.department_id
                 LEFT JOIN employees m ON m.id = e.manager_employee_id
                 ${where} ORDER BY COALESCE(e.name, e.full_name) ASC`;
    return this.db.query<Employee>(sql, params);
  }

  static getById(id: string): Employee | null {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const companyScope = this.branchAccess.companyScope('e.company_id', actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    const canSeeFinancials = PermissionService.canAny(actor, ['employees.financials.view', 'employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve']);
    const canSeePrivateProfile = PermissionService.canAny(actor, ['employees.profile.view', 'employees.update']);
    const salaryColumns = canSeeFinancials
      ? 'e.base_salary AS baseSalary, e.salary_type AS salaryType'
      : "0 AS baseSalary, 'MONTHLY' AS salaryType";
    const privateProfileColumns = canSeePrivateProfile
      ? `e.national_id AS nationalId, e.birth_date AS birthDate, e.gender, e.phone2,
         e.address, e.emergency_contact_name AS emergencyContactName,
         e.emergency_contact_phone AS emergencyContactPhone, e.education,
         e.previous_experience AS previousExperience,
         e.probation_start_date AS probationStartDate, e.probation_end_date AS probationEndDate`
      : `NULL AS nationalId, NULL AS birthDate, NULL AS gender, NULL AS phone2,
         NULL AS address, NULL AS emergencyContactName, NULL AS emergencyContactPhone,
         NULL AS education, NULL AS previousExperience,
         NULL AS probationStartDate, NULL AS probationEndDate`;
    const financialColumns = canSeeFinancials
      ? 'e.salary_payment_method AS salaryPaymentMethod, e.bank_name AS bankName, e.bank_account_number AS bankAccountNumber, e.social_insurance_number AS socialInsuranceNumber, e.tax_file_number AS taxFileNumber'
      : "'CASH' AS salaryPaymentMethod, NULL AS bankName, NULL AS bankAccountNumber, NULL AS socialInsuranceNumber, NULL AS taxFileNumber";
    const rows = this.db.query<Employee>(
      `SELECT e.id, e.code, e.branch_id AS branchId, e.employment_type AS employmentType,
              COALESCE(e.name, e.full_name) AS name, ${privateProfileColumns},
              e.location, e.role, e.phone, e.email, e.department_id AS departmentId,
              d.name AS departmentName, e.manager_employee_id AS managerEmployeeId,
              m.name AS managerName, e.terminated_at AS terminatedAt,
              ${salaryColumns}, ${financialColumns}, e.status,
              e.joined_date AS joinedDate, e.notes, e.created_at AS createdAt, e.updated_at AS updatedAt
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees m ON m.id = e.manager_employee_id
       WHERE e.id = ? AND ${scope.clause} AND ${companyScope.clause} AND ${departmentScope.clause}`,
      [id, ...scope.params, ...companyScope.params, ...departmentScope.params]
    );
    return rows[0] ?? null;
  }

  static create(data: Omit<Employee, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'notes'> & { notes?: string }): Employee {
    const actor = this.requireCreate();
    CentralUsageLimitService.assertWithin('maxEmployees');
    if (!data.name?.trim()) throw new Error('اسم الموظف مطلوب.');
    if (!data.role?.trim()) throw new Error('المسمى الوظيفي مطلوب.');
    if (!data.phone?.trim()) throw new Error('رقم الهاتف مطلوب.');
    this.validateEmployeeFields(data);
    if (!Number.isFinite(data.baseSalary) || data.baseSalary < 0) {
      throw new Error('الراتب الأساسي يجب أن يكون رقماً موجباً أو صفراً.');
    }
    if (!['MONTHLY', 'DAILY'].includes(data.salaryType)) throw new Error('دورة احتساب الراتب غير صالحة.');
    if (!['PROBATION', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED'].includes(data.status)) {
      throw new Error('الحالة الإدارية غير صالحة عند إنشاء الموظف.');
    }
    const branchId = data.branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    this.validateEmployeeOrganization(data, branchId);
    const id = `emp_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('EMP');
      const companyId = db.query<{ companyId: string | null }>(
        'SELECT company_id AS companyId FROM branches WHERE id = ?',
        [branchId]
      )[0]?.companyId || 'cmp_main';
      const joinedDate = data.joinedDate || localDateString();
      db.run(
        `INSERT INTO employees (
           id, code, full_name, name, phone, email, job_title, role, location, branch_id,
           employment_type, hired_at, joined_date, base_salary, salary_type, status, is_active, notes, company_id,
           national_id, phone2, address, birth_date, gender, emergency_contact_name, emergency_contact_phone,
           department_id, manager_employee_id, probation_start_date, probation_end_date, bank_account_number,
           bank_name, salary_payment_method, social_insurance_number, tax_file_number, education, previous_experience
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, code, data.name.trim(), data.name.trim(), this.normalizePhone(data.phone), data.email?.trim() || null, data.role.trim(), data.role.trim(),
         data.location?.trim() || '', branchId, data.employmentType || 'FULL_TIME', joinedDate, joinedDate, data.baseSalary,
         data.salaryType, data.status, data.status === 'ACTIVE' ? 1 : 0, data.notes?.trim() || null,
         companyId, data.nationalId?.trim() || null, data.phone2?.trim() ? this.normalizePhone(data.phone2) : null,
         data.address?.trim() || null, data.birthDate || null, data.gender || null,
         data.emergencyContactName?.trim() || null,
         data.emergencyContactPhone?.trim() ? this.normalizePhone(data.emergencyContactPhone) : null,
         data.departmentId || null, data.managerEmployeeId || null, data.probationStartDate || null,
         data.probationEndDate || null, data.bankAccountNumber?.trim() || null, data.bankName?.trim() || null,
         data.salaryPaymentMethod || 'CASH', data.socialInsuranceNumber?.trim() || null,
         data.taxFileNumber?.trim() || null, data.education?.trim() || null, data.previousExperience?.trim() || null]
      );
      db.run(
        `INSERT INTO employee_status_history
         (id, employee_id, previous_status, next_status, effective_date, reason, actor_id)
         VALUES (?, ?, NULL, ?, ?, 'إنشاء سجل الموظف', ?)`,
        [`emph_${uuidv4().replace(/-/g, '').slice(0, 16)}`, id, data.status, joinedDate, actor.id]
      );
      db.run(
        `INSERT INTO employee_salary_history
         (id, employee_id, previous_salary, next_salary, salary_type, effective_date, source_type, reason, actor_id)
         VALUES (?, ?, NULL, ?, ?, ?, 'MANUAL', 'الراتب عند إنشاء الموظف', ?)`,
        [`emps_${uuidv4().replace(/-/g, '').slice(0, 16)}`, id, data.baseSalary, data.salaryType, joinedDate, actor.id]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إضافة موظف', 'HR', ?, ?)`,
        [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, id,
          JSON.stringify({ branchId, departmentId: data.departmentId || null, status: data.status })]
      );
      return this.getById(id)!;
    });
  }

  static update(id: string, data: Partial<Omit<Employee, 'id' | 'code' | 'createdAt'>>): Employee {
    const actor = this.requireUpdate();
    const existing = this.getById(id);
    if (!existing) throw new Error('الموظف غير موجود.');
    if (data.branchId) this.branchAccess.requireBranchAccess(data.branchId, actor);
    this.validateEmployeeFields(data);
    if (data.status === 'RESIGNED' || data.status === 'TERMINATED') {
      throw new Error('سجّل الاستقالة أو إنهاء الخدمة من دورة إنهاء العقد لضمان التسوية وسجل الحالة.');
    }
    const stored = this.db.query<{ status: EmployeeStatus; baseSalary: number; salaryType: SalaryType }>(
      'SELECT status, base_salary AS baseSalary, salary_type AS salaryType FROM employees WHERE id = ?',
      [id]
    )[0];
    this.validateEmployeeOrganization(data, data.branchId || existing.branchId || '', id);
    const nextStatus = data.status ?? existing.status;
    this.db.executeTransaction((db) => {
    db.run(
      `UPDATE employees SET
         name = COALESCE(?, name),
         full_name = COALESCE(?, full_name),
         location = COALESCE(?, location),
         branch_id = COALESCE(?, branch_id),
         employment_type = COALESCE(?, employment_type),
         role = COALESCE(?, role),
         job_title = COALESCE(?, job_title),
         phone = COALESCE(?, phone),
         email = COALESCE(?, email),
         base_salary = COALESCE(?, base_salary),
         salary_type = COALESCE(?, salary_type),
         status = ?,
         is_active = ?,
         joined_date = COALESCE(?, joined_date),
         hired_at = COALESCE(?, hired_at),
         notes = COALESCE(?, notes),
         company_id = CASE WHEN ? IS NULL THEN company_id ELSE COALESCE((SELECT company_id FROM branches WHERE id = ?), 'cmp_main') END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [data.name ?? null, data.name ?? null, data.location ?? null, data.branchId ?? null, data.employmentType ?? null, data.role ?? null, data.role ?? null,
       data.phone === undefined ? null : this.normalizePhone(data.phone), data.email ?? null, data.baseSalary ?? null, data.salaryType ?? null,
       nextStatus, ['ACTIVE', 'PROBATION', 'ON_LEAVE'].includes(nextStatus) ? 1 : 0, data.joinedDate ?? null, data.joinedDate ?? null,
       data.notes ?? null, data.branchId ?? null, data.branchId ?? null, id]
    );
    const profileFields: Array<[
      keyof Omit<Employee, 'id' | 'code' | 'createdAt' | 'updatedAt'>,
      string,
      (value: any) => any,
    ]> = [
      ['nationalId', 'national_id', (value) => value?.trim() || null],
      ['birthDate', 'birth_date', (value) => value || null],
      ['gender', 'gender', (value) => value || null],
      ['phone2', 'phone2', (value) => value?.trim() ? this.normalizePhone(value) : null],
      ['address', 'address', (value) => value?.trim() || null],
      ['emergencyContactName', 'emergency_contact_name', (value) => value?.trim() || null],
      ['emergencyContactPhone', 'emergency_contact_phone', (value) => value?.trim() ? this.normalizePhone(value) : null],
      ['departmentId', 'department_id', (value) => value || null],
      ['managerEmployeeId', 'manager_employee_id', (value) => value || null],
      ['probationStartDate', 'probation_start_date', (value) => value || null],
      ['probationEndDate', 'probation_end_date', (value) => value || null],
      ['bankAccountNumber', 'bank_account_number', (value) => value?.trim() || null],
      ['bankName', 'bank_name', (value) => value?.trim() || null],
      ['salaryPaymentMethod', 'salary_payment_method', (value) => value || 'CASH'],
      ['socialInsuranceNumber', 'social_insurance_number', (value) => value?.trim() || null],
      ['taxFileNumber', 'tax_file_number', (value) => value?.trim() || null],
      ['education', 'education', (value) => value?.trim() || null],
      ['previousExperience', 'previous_experience', (value) => value?.trim() || null],
    ];
    const profileUpdates = profileFields.filter(([key]) => data[key] !== undefined);
    if (profileUpdates.length) {
      db.run(
        `UPDATE employees SET ${profileUpdates.map(([, column]) => `${column} = ?`).join(', ')},
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...profileUpdates.map(([key, , normalize]) => normalize(data[key])), id]
      );
    }
    if (stored && nextStatus !== stored.status) {
      db.run(
        `INSERT INTO employee_status_history
         (id, employee_id, previous_status, next_status, effective_date, reason, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `emph_${uuidv4().replace(/-/g, '').slice(0, 16)}`, id, stored.status, nextStatus,
          data.joinedDate || localDateString(), data.notes?.trim() || 'تعديل الحالة من ملف الموظف', actor.id,
        ]
      );
    }
    if (stored && data.baseSalary !== undefined
      && (stored.baseSalary !== data.baseSalary || stored.salaryType !== (data.salaryType ?? stored.salaryType))) {
      db.run(
        `INSERT INTO employee_salary_history
         (id, employee_id, previous_salary, next_salary, salary_type, effective_date, source_type, reason, actor_id)
         VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?)`,
        [
          `emps_${uuidv4().replace(/-/g, '').slice(0, 16)}`, id, stored.baseSalary, data.baseSalary,
          data.salaryType ?? stored.salaryType, data.joinedDate || localDateString(),
          data.notes?.trim() || 'تعديل يدوي للراتب الأساسي', actor.id,
        ]
      );
    }
    db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, 'تعديل ملف موظف', 'HR', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, id,
        JSON.stringify({
          fields: Object.keys(data),
          previousStatus: stored?.status,
          status: nextStatus,
          salaryChanged: data.baseSalary !== undefined && stored?.baseSalary !== data.baseSalary,
        })]
    );
    });
    return this.getById(id)!;
  }

  private static validateEmployeeFields(data: Partial<Employee>): void {
    if (data.name !== undefined && !data.name.trim()) throw new Error('اسم الموظف مطلوب.');
    if (data.role !== undefined && !data.role.trim()) throw new Error('المسمى الوظيفي مطلوب.');
    if (data.phone !== undefined) {
      this.validatePhone(data.phone, 'رقم الهاتف');
    }
    for (const [value, label] of [
      [data.phone2, 'رقم الهاتف البديل'],
      [data.emergencyContactPhone, 'هاتف جهة اتصال الطوارئ'],
    ] as Array<[string | null | undefined, string]>) {
      if (value?.trim()) this.validatePhone(value, label);
    }
    if (data.nationalId?.trim() && !/^[\dA-Za-z-]{6,24}$/.test(this.normalizePhone(data.nationalId))) {
      throw new Error('رقم الهوية يجب أن يتكون من 6 إلى 24 رقماً أو حرفاً.');
    }
    if (data.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      throw new Error('البريد الإلكتروني غير صالح.');
    }
    if (data.baseSalary !== undefined && (!Number.isFinite(data.baseSalary) || data.baseSalary < 0)) {
      throw new Error('الراتب الأساسي يجب أن يكون رقماً موجباً أو صفراً.');
    }
    if (data.joinedDate) {
      if (!isValidDate(data.joinedDate)) throw new Error('تاريخ الالتحاق غير صالح.');
    }
    for (const [value, label] of [
      [data.birthDate, 'تاريخ الميلاد'],
      [data.probationStartDate, 'بداية فترة الاختبار'],
      [data.probationEndDate, 'نهاية فترة الاختبار'],
    ] as Array<[string | null | undefined, string]>) {
      if (value && !isValidDate(value)) throw new Error(`${label} غير صالح.`);
    }
    if (data.gender && !['FEMALE', 'MALE', 'OTHER'].includes(data.gender)) {
      throw new Error('النوع غير صالح.');
    }
    if (data.salaryPaymentMethod && !['CASH', 'BANK_TRANSFER', 'WALLET'].includes(data.salaryPaymentMethod)) {
      throw new Error('طريقة صرف الراتب غير صالحة.');
    }
    const probationStart = data.probationStartDate;
    const probationEnd = data.probationEndDate;
    if (probationStart && probationEnd && probationEnd < probationStart) {
      throw new Error('نهاية فترة الاختبار يجب أن تأتي بعد بدايتها.');
    }
    if (data.employmentType && !['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY'].includes(data.employmentType)) {
      throw new Error('نوع التوظيف غير صالح.');
    }
    if (data.salaryType && !['MONTHLY', 'DAILY'].includes(data.salaryType)) {
      throw new Error('دورة احتساب الراتب غير صالحة.');
    }
    if (data.status && !['PROBATION', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED'].includes(data.status)) {
      throw new Error('الحالة الإدارية غير صالحة.');
    }
  }

  private static validatePhone(phone: string, label: string): void {
    const normalized = this.normalizePhone(phone);
    const digitCount = normalized.replace(/\D/g, '').length;
    if (!/^\+?[\d\s()-]{7,20}$/.test(normalized) || digitCount < 7 || digitCount > 15) {
      throw new Error(`${label} غير صالح.`);
    }
  }

  private static validateEmployeeOrganization(
    data: Partial<Employee>,
    branchId: string,
    employeeId?: string
  ): void {
    if (data.departmentId) {
      const department = this.db.query<{ branchId: string | null; isActive: number }>(
        'SELECT branch_id AS branchId, is_active AS isActive FROM departments WHERE id = ?',
        [data.departmentId]
      )[0];
      const isUnchangedInactiveDepartment = Boolean(
        employeeId
        && department
        && !department.isActive
        && this.db.query<{ departmentId: string | null }>(
          'SELECT department_id AS departmentId FROM employees WHERE id = ?',
          [employeeId]
        )[0]?.departmentId === data.departmentId
      );
      if (!department || (!department.isActive && !isUnchangedInactiveDepartment)
        || (department.branchId && department.branchId !== branchId)) {
        throw new Error('القسم غير نشط أو لا يتبع فرع الموظف.');
      }
    }
    if (data.nationalId?.trim()) {
      const duplicate = this.db.query<{ id: string }>(
        `SELECT id FROM employees WHERE national_id = ? ${employeeId ? 'AND id != ?' : ''} LIMIT 1`,
        employeeId
          ? [this.normalizePhone(data.nationalId), employeeId]
          : [this.normalizePhone(data.nationalId)]
      )[0];
      if (duplicate) throw new Error('رقم الهوية مسجل لموظف آخر.');
    }
    if (!data.managerEmployeeId) return;
    if (data.managerEmployeeId === employeeId) throw new Error('لا يمكن تعيين الموظف مديراً مباشراً لنفسه.');
    const manager = this.db.query<{ branchId: string | null; status: EmployeeStatus; managerEmployeeId: string | null }>(
      'SELECT branch_id AS branchId, status, manager_employee_id AS managerEmployeeId FROM employees WHERE id = ?',
      [data.managerEmployeeId]
    )[0];
    if (!manager || manager.branchId !== branchId || !['ACTIVE', 'PROBATION', 'ON_LEAVE'].includes(manager.status)) {
      throw new Error('المدير المباشر يجب أن يكون موظفاً نشطاً في الفرع نفسه.');
    }
    const visited = new Set<string>(employeeId ? [employeeId] : []);
    let currentId: string | null | undefined = data.managerEmployeeId;
    while (currentId) {
      if (visited.has(currentId)) throw new Error('اختيار المدير المباشر ينشئ تسلسلاً إدارياً دائرياً.');
      visited.add(currentId);
      currentId = this.db.query<{ managerEmployeeId: string | null }>(
        'SELECT manager_employee_id AS managerEmployeeId FROM employees WHERE id = ?',
        [currentId]
      )[0]?.managerEmployeeId;
    }
  }

  private static normalizePhone(phone: string): string {
    return phone.trim()
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
  }

  static delete(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'employees.delete');
    this.requireEmployeeBranch(id, actor);
    throw new Error('الحذف النهائي للموظفين معطل للحفاظ على السجلات المالية والتاريخية. استخدم إنهاء الخدمة أو الأرشفة.');
  }

  // ─── Payroll Transactions ─────────────────────────────────────────────────────

  static getTransactions(employeeId?: string): PayrollTransaction[] {
    const actor = this.requirePayrollView();
    const scope = this.branchAccess.sqlScope('pt.branch_id', 'e.branch_id', actor);
    if (employeeId) {
      this.requireEmployeeBranch(employeeId, actor);
      return this.db.query<PayrollTransaction>(
        `SELECT pt.*, e.name AS employee_name
         FROM payroll_transactions pt
         LEFT JOIN employees e ON e.id = pt.employee_id
         WHERE pt.employee_id = ? AND ${scope.clause}
         ORDER BY pt.date DESC, pt.created_at DESC`,
        [employeeId, ...scope.params]
      );
    }
    return this.db.query<PayrollTransaction>(
      `SELECT pt.*, e.name AS employee_name
       FROM payroll_transactions pt
       LEFT JOIN employees e ON e.id = pt.employee_id
       WHERE ${scope.clause}
       ORDER BY pt.date DESC, pt.created_at DESC`,
      scope.params
    );
  }

  private static ensureSalaryAccrual(
    db: DatabaseManager,
    employeeId: string,
    date: string,
    createdBy: string
  ): void {
    const period = date.slice(0, 7);
    const referenceId = `${employeeId}:${period}`;
    const accrued = db.query(`SELECT id FROM journal_entries WHERE reference_type='PAYROLL_SALARY_ACCRUAL' AND reference_id=?`, [referenceId])[0];
    if (accrued) return;
    const runAccrual = db.query(
      `SELECT id FROM journal_entries WHERE reference_type='PAYROLL_RUN_ACCRUAL' AND reference_id=?`,
      [referenceId]
    )[0];
    if (runAccrual) return;

    const employee = db.query<{ name: string; baseSalary: number; salaryType: SalaryType }>(
      'SELECT name,base_salary AS baseSalary,salary_type AS salaryType FROM employees WHERE id=?',
      [employeeId]
    )[0];
    const salary = Math.round((Number(employee?.baseSalary || 0) * (employee?.salaryType === 'DAILY' ? 26 : 1)) * 100) / 100;
    if (salary <= 0) return;

    postLedgerEntry(db.getDatabase(), {
      date: `${period}-01`,
      description: `Salary accrual for ${employee?.name || employeeId} (${period})`,
      referenceType: 'PAYROLL_SALARY_ACCRUAL',
      referenceId,
      createdBy,
      lines: [{ accountCode: '5202', debit: salary, credit: 0 }, { accountCode: '2104', debit: 0, credit: salary }],
    });
  }

  private static applyAdvancesToSalary(
    db: DatabaseManager,
    employeeId: string,
    date: string,
    createdBy: string
  ): void {
    const period = date.slice(0, 7);
    const referenceId = `${employeeId}:${period}`;
    const applied = db.query(
      `SELECT id FROM journal_entries WHERE reference_type='PAYROLL_ADVANCE_APPLICATION' AND reference_id=?`,
      [referenceId]
    )[0];
    if (applied) return;

    const advances = Number(db.query<{ amount: number }>(
      `SELECT COALESCE(SUM(amount),0) AS amount FROM payroll_transactions WHERE employee_id=? AND type='ADVANCE' AND substr(date,1,7)=?`,
      [employeeId, period]
    )[0]?.amount || 0);
    if (advances <= 0) return;

    postLedgerEntry(db.getDatabase(), {
      date,
      description: `Apply employee advances to salary (${period})`,
      referenceType: 'PAYROLL_ADVANCE_APPLICATION',
      referenceId,
      createdBy,
      lines: [{ accountCode: '2104', debit: advances, credit: 0 }, { accountCode: '1202', debit: 0, credit: advances }],
    });
  }

  private static getPayrollPayable(db: DatabaseManager, employeeId: string, date: string): number {
    const period = date.slice(0, 7);
    return Number(db.query<{ amount: number }>(`
      SELECT COALESCE(SUM(l.credit-l.debit),0) AS amount
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id=l.entry_id AND e.is_posted=1
      JOIN chart_of_accounts a ON a.id=l.account_id
      WHERE a.code='2104' AND (
        (e.reference_type IN ('PAYROLL_SALARY_ACCRUAL','PAYROLL_ADVANCE_APPLICATION') AND e.reference_id=?)
        OR (e.reference_type IN ('PAYROLL_RUN_ACCRUAL','PAYROLL_RUN_ATTENDANCE_DEDUCTION','PAYROLL_RUN_TAX','PAYROLL_RUN_COMMISSION') AND e.reference_id=?)
        OR (e.reference_type='PAYROLL_TRANSACTION' AND e.reference_id IN (
          SELECT id FROM payroll_transactions
          WHERE employee_id=? AND substr(date,1,7)=? AND type IN ('BONUS','DEDUCTION','SALARY_PAYOUT')
        ))
      )
    `, [`${employeeId}:${period}`, `${employeeId}:${period}`, employeeId, period])[0]?.amount || 0);
  }

  private static getPayrollPostingLines(type: PayrollTxType, amount: number, payable: number) {
    switch (type) {
      case 'ADVANCE':
        return [{ accountCode: '1202', debit: amount, credit: 0 }, { accountCode: '1101', debit: 0, credit: amount }];
      case 'BONUS':
        return [{ accountCode: '5202', debit: amount, credit: 0 }, { accountCode: '2104', debit: 0, credit: amount }];
      case 'DEDUCTION':
        return [{ accountCode: '2104', debit: amount, credit: 0 }, { accountCode: '5202', debit: 0, credit: amount }];
      case 'SALARY_PAYOUT':
        return [
          { accountCode: '2104', debit: Math.min(amount, Math.max(0, payable)), credit: 0 },
          { accountCode: '1101', debit: 0, credit: amount },
        ];
    }
  }

  private static persistPayrollTransaction(
    db: DatabaseManager,
    data: PayrollTransactionInput,
    amount: number,
    id: string,
    registerId: string | null,
    branchId: string,
    actor: ReturnType<typeof AuthService.requireAuth>,
    accountingPeriod?: string
  ): void {
    if (registerId) this.branchAccess.requireRegisterAccess(registerId, actor, branchId);
    if ((data.type === 'ADVANCE' || data.type === 'SALARY_PAYOUT') && !registerId) {
      throw new Error('يجب تحديد خزينة فرع الموظف لهذه الحركة النقدية.');
    }
    db.run(
      `INSERT INTO payroll_transactions (id,employee_id,type,amount,date,notes,created_by,register_id,branch_id) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, data.employeeId, data.type, amount, data.date, data.notes, actor.id, registerId, branchId]
    );

    const accountingDate = accountingPeriod ? `${accountingPeriod}-01` : data.date;
    if (data.type === 'DEDUCTION' || data.type === 'SALARY_PAYOUT') {
      this.ensureSalaryAccrual(db, data.employeeId, accountingDate, actor.id);
    }
    if (data.type === 'SALARY_PAYOUT') {
      this.applyAdvancesToSalary(db, data.employeeId, accountingDate, actor.id);
    }

    const payable = data.type === 'SALARY_PAYOUT'
      ? this.getPayrollPayable(db, data.employeeId, accountingDate)
      : 0;
    if (data.type === 'SALARY_PAYOUT' && amount > payable + 0.009) {
      throw new Error(`Salary payout exceeds accrued payroll payable (${payable}).`);
    }
    const lines = this.getPayrollPostingLines(data.type, amount, payable);
    postLedgerEntry(db.getDatabase(), {
      date: data.date,
      description: `Payroll ${data.type} for ${this.getById(data.employeeId)?.name || data.employeeId}`,
      referenceType: 'PAYROLL_TRANSACTION',
      referenceId: id,
      createdBy: actor.id,
      lines,
    });

    if (data.type === 'ADVANCE' || data.type === 'SALARY_PAYOUT') {
      db.run('UPDATE cash_registers SET current_balance=current_balance-? WHERE id=?', [amount, registerId]);
    }
    db.run(
      `INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, `Payroll ${data.type}`, 'HR', id,
        JSON.stringify({ employeeId: data.employeeId, amount, date: data.date })]
    );
  }

  private static assertPayrollPeriodEditable(branchId: string, date: string): void {
    const run = this.db.query<{ status: PayrollRunStatus }>(
      `SELECT status FROM payroll_runs WHERE branch_id = ? AND period = ?`,
      [branchId, date.slice(0, 7)]
    )[0];
    if (run && run.status !== 'DRAFT') {
      throw new Error('الفترة مرتبطة بدورة رواتب معتمدة؛ لا يمكن تعديل حركاتها أو حضورها.');
    }
  }

  static addTransaction(data: PayrollTransactionInput): PayrollTransaction {
    const actor = data.type === 'SALARY_PAYOUT' ? this.requirePayrollApproval() : this.requirePayrollManage();
    if (!isValidDate(data.date)) throw new Error('Payroll date is invalid.');
    const branchId = this.requireEmployeeBranch(data.employeeId, actor);
    this.assertPayrollPeriodEditable(branchId, data.date);
    const id = `ptx_${uuidv4().substring(0, 8)}`;
    const amount = Math.round(Number(data.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payroll amount must be greater than zero.');
    const hasCashMovement = data.type === 'ADVANCE' || data.type === 'SALARY_PAYOUT';
    const registerId = data.registerId
      ? data.registerId
      : hasCashMovement
        ? this.branchAccess.getDefaultRegisterId(branchId, actor)
        : null;
    this.db.executeTransaction((db) => {
      this.persistPayrollTransaction(db, data, amount, id, registerId, branchId, actor);
    });
    return this.getTransactions(data.employeeId).find(t => t.id === id)!;
  }

  static accrueMonthlyPayroll(period: string): { created: number; skipped: number } {
    const actor = this.requirePayrollManage();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
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
              ), e.base_salary) AS baseSalary,
              e.salary_type AS salaryType,
              e.joined_date AS joinedDate, e.terminated_at AS terminatedAt,
              ec.salary AS contractSalary, ec.start_date AS contractStartDate, ec.end_date AS contractEndDate,
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
    if (!isValidPayrollPeriod(period)) throw new Error('Payroll period must be YYYY-MM.');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const run = this.db.query<any>(
      `SELECT pr.id, pr.period, pr.branch_id AS branchId, pr.status,
              pr.created_at AS createdAt, pr.approved_at AS approvedAt,
              pr.paid_at AS paidAt, pr.closed_at AS closedAt
       FROM payroll_runs pr
       WHERE pr.period = ? AND pr.branch_id = ?`,
      [period, branchId]
    )[0];
    return run ? this.readPayrollRun(run) : null;
  }

  static getPayrollRunById(id: string): PayrollRun {
    const actor = this.requirePayrollView();
    const scope = this.branchAccess.sqlScope('pr.branch_id', undefined, actor);
    const run = this.db.query<any>(
      `SELECT pr.id, pr.period, pr.branch_id AS branchId, pr.status,
              pr.created_at AS createdAt, pr.approved_at AS approvedAt,
              pr.paid_at AS paidAt, pr.closed_at AS closedAt
       FROM payroll_runs pr
       WHERE pr.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    )[0];
    if (!run) throw new Error('دورة الرواتب غير موجودة ضمن نطاق فروعك.');
    return this.readPayrollRun(run);
  }

  private static readPayrollRun(run: any): PayrollRun {
    const items = this.db.query<any>(
      `SELECT id, employee_id AS employeeId, branch_id AS branchId, employee_name AS employeeName,
              salary_type AS salaryType, base_salary AS baseSalary, expected_workdays AS expectedWorkdays,
              absent_days AS absentDays, unpaid_leave_days AS unpaidLeaveDays,
              late_minutes AS lateMinutes, overtime_minutes AS overtimeMinutes,
              base_amount AS baseAmount, overtime_amount AS overtimeAmount,
              bonus_amount AS bonusAmount, commission_amount AS commissionAmount,
              advance_amount AS advanceAmount, manual_deduction_amount AS manualDeductionAmount,
              attendance_deduction_amount AS attendanceDeductionAmount, tax_amount AS taxAmount,
              gross_amount AS grossAmount, net_amount AS netAmount, warning_json AS warningJson,
              detail_json AS detailJson, payout_transaction_id AS payoutTransactionId
       FROM payroll_run_items WHERE payroll_run_id = ? ORDER BY employee_name`,
      [run.id]
    ).map((row): PayrollRunItem => ({
      ...row,
      warnings: JSON.parse(row.warningJson),
      details: JSON.parse(row.detailJson),
    }));
    return { ...run, items };
  }

  private static getPayrollSourceRows(period: string, branchId: string) {
    const [year, month] = period.split('-').map(Number);
    const periodStart = `${period}-01`;
    const periodEnd = localDateString(new Date(year, month, 0));
    const employees = this.db.query<any>(
      `SELECT e.id, e.name, e.branch_id AS branchId, e.salary_type AS salaryType,
              COALESCE((
                SELECT sh.next_salary FROM employee_salary_history sh
                WHERE sh.employee_id = e.id AND sh.effective_date <= ?
                ORDER BY sh.effective_date DESC, sh.created_at DESC LIMIT 1
              ), (
                SELECT sh.previous_salary FROM employee_salary_history sh
                WHERE sh.employee_id = e.id AND sh.effective_date > ?
                ORDER BY sh.effective_date, sh.created_at LIMIT 1
              ), e.base_salary) AS baseSalary,
              e.joined_date AS joinedDate,
              e.terminated_at AS terminatedAt,
              c.salary AS contractSalary, c.start_date AS contractStartDate, c.end_date AS contractEndDate,
              c.salary_components_json AS salaryComponentsJson,
              CASE WHEN EXISTS (
                SELECT 1 FROM employee_contracts hx
                WHERE hx.employee_id = e.id AND hx.status IN ('ACTIVE', 'TERMINATED')
                  AND hx.start_date <= ?
              ) THEN 1 ELSE 0 END AS hasContractHistory,
              COALESCE(co.working_days_per_month, 26) AS workingDays,
              COALESCE(co.overtime_multiplier, 1.5) AS overtimeMultiplier,
              COALESCE(co.payroll_tax_rate, 0) AS taxRate
       FROM employees e
       LEFT JOIN branches b ON b.id = e.branch_id
       LEFT JOIN companies co ON co.id = b.company_id
       LEFT JOIN employee_contracts c ON c.id = (
         SELECT ec.id FROM employee_contracts ec
         WHERE ec.employee_id = e.id AND ec.status IN ('ACTIVE', 'TERMINATED')
           AND ec.start_date <= ? AND (ec.end_date IS NULL OR ec.end_date >= ?)
         ORDER BY ec.start_date DESC LIMIT 1
       )
       WHERE e.branch_id = ? AND e.joined_date <= ?
         AND (e.terminated_at IS NULL OR e.terminated_at >= ?)
        AND (e.status NOT IN ('SUSPENDED', 'RESIGNED', 'TERMINATED') OR e.terminated_at IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM employee_final_settlements fs
          WHERE fs.employee_id = e.id AND substr(fs.termination_date, 1, 7) = ?
        )
       ORDER BY e.name, e.id`,
      [periodEnd, periodEnd, periodEnd, periodEnd, periodStart, branchId, periodEnd, periodStart, period]
    );
    const attendanceRows = this.db.query<any>(
      `SELECT a.employee_id AS employeeId, a.date, a.status,
              COALESCE(a.late_minutes, 0) AS lateMinutes,
              COALESCE(a.overtime_minutes, 0) AS overtimeMinutes,
              COALESCE(a.overtime_approved, 0) AS overtimeApproved
       FROM attendance a JOIN employees e ON e.id = a.employee_id
       WHERE e.branch_id = ? AND a.date BETWEEN ? AND ?
       ORDER BY a.employee_id, a.date`,
      [branchId, periodStart, periodEnd]
    );
    const shiftRows = this.db.query<any>(
      `SELECT a.employee_id AS employeeId, a.effective_from AS effectiveFrom,
              a.effective_to AS effectiveTo, s.workdays_json AS workdaysJson,
              s.name AS shiftName, s.start_time AS startTime, s.end_time AS endTime,
              s.break_minutes AS breakMinutes, s.grace_minutes AS graceMinutes,
              s.overtime_after_minutes AS overtimeAfterMinutes
       FROM employee_shift_assignments a
       JOIN attendance_shifts s ON s.id = a.shift_id AND s.is_active = 1
       JOIN employees e ON e.id = a.employee_id
       WHERE e.branch_id = ? AND a.effective_from <= ?
         AND (a.effective_to IS NULL OR a.effective_to >= ?)
       ORDER BY a.employee_id, a.effective_from`,
      [branchId, periodEnd, periodStart]
    );
    const holidayRows = this.db.query<{ date: string }>(
      'SELECT date FROM attendance_holidays WHERE branch_id = ? AND date BETWEEN ? AND ? ORDER BY date',
      [branchId, periodStart, periodEnd]
    );
    const leaveRows = this.db.query<any>(
      `SELECT l.employee_id AS employeeId, l.start_date AS startDate, l.end_date AS endDate
       FROM employee_leave_requests l
       WHERE l.branch_id = ? AND l.status = 'APPROVED' AND l.leave_type = 'UNPAID'
         AND l.start_date <= ? AND l.end_date >= ?
       ORDER BY l.employee_id, l.start_date, l.end_date`,
      [branchId, periodEnd, periodStart]
    );
    const transactionRows = this.db.query<any>(
      `SELECT employee_id AS employeeId, type, SUM(amount) AS amount
       FROM payroll_transactions
       WHERE branch_id = ? AND date BETWEEN ? AND ?
       GROUP BY employee_id, type
       ORDER BY employee_id, type`,
      [branchId, periodStart, periodEnd]
    );
    const commissionRows = this.db.query<any>(
      `SELECT id, employee_id AS employeeId, commission_amount AS amount, status
       FROM commissions
       WHERE branch_id = ? AND period_month = ? AND status IN ('APPROVED', 'PENDING')
       ORDER BY employee_id, id`,
      [branchId, period]
    );
    return {
      periodStart,
      periodEnd,
      calendarDays: daysBetweenInclusive(periodStart, periodEnd),
      employees,
      attendanceRows,
      shiftRows,
      holidayRows,
      leaveRows,
      transactionRows,
      commissionRows,
    };
  }

  static calculatePayrollRun(period: string): PayrollRun {
    const actor = this.requirePayrollManage();
    if (!isValidPayrollPeriod(period)) throw new Error('Payroll period must be YYYY-MM.');
    if (period > localDateString().slice(0, 7)) throw new Error('لا يمكن احتساب فترة رواتب مستقبلية.');

    const branchId = this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    const sourceRows = this.getPayrollSourceRows(period, branchId);
    const {
      periodStart, periodEnd, calendarDays, employees, attendanceRows, shiftRows, holidayRows,
      leaveRows, transactionRows, commissionRows,
    } = sourceRows;
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
    const rowsByEmployee = <T extends { employeeId: string }>(rows: T[]) => {
      const grouped = new Map<string, T[]>();
      for (const row of rows) grouped.set(row.employeeId, [...(grouped.get(row.employeeId) ?? []), row]);
      return grouped;
    };
    const attendanceByEmployee = rowsByEmployee(attendanceRows);
    const leavesByEmployee = rowsByEmployee(leaveRows);
    const transactionsByEmployee = rowsByEmployee(transactionRows);
    const commissionsByEmployee = rowsByEmployee(commissionRows);
    const calculated: Array<{ item: PayrollRunItem; warnings: string[] }> = [];

    for (const employee of employees) {
      const warnings: string[] = [];
      const workingDays = Number(employee.workingDays) > 0 ? Number(employee.workingDays) : 26;
      if (employee.hasContractHistory && !employee.contractStartDate) continue;
      const employeeShifts = shiftRows.filter((row) => row.employeeId === employee.id);
      const holidayDates = new Set(holidayRows.map((row) => row.date));
      const overtimeMultiplier = Number(employee.overtimeMultiplier) > 0 ? Number(employee.overtimeMultiplier) : 1.5;
      const taxRate = Math.max(0, Number(employee.taxRate) || 0);
      const contractStart = employee.contractStartDate && employee.contractStartDate > employee.joinedDate
        ? employee.contractStartDate
        : employee.joinedDate;
      const eligibleStart = contractStart > periodStart ? contractStart : periodStart;
      const employeeEnd = [employee.terminatedAt, employee.contractEndDate].filter(Boolean).sort()[0] as string | undefined;
      const eligibleEnd = employeeEnd && employeeEnd < periodEnd ? employeeEnd : periodEnd;
      const employedDays = daysBetweenInclusive(eligibleStart, eligibleEnd);
      if (!employedDays) continue;

      const salary = Math.max(0, Number(employee.contractSalary ?? employee.baseSalary) || 0);
      let salaryComponents: Array<{ name: string; amount: number }> = [];
      try {
        const parsed = JSON.parse(employee.salaryComponentsJson || '[]') as unknown;
        if (!Array.isArray(parsed) || parsed.some((component) =>
          !component || typeof component.name !== 'string' || !component.name.trim()
          || typeof component.amount !== 'number' || !Number.isFinite(component.amount) || component.amount < 0
        )) throw new Error('Invalid salary components');
        salaryComponents = parsed;
      } catch {
        throw new Error(`مكونات الراتب في عقد الموظف ${employee.name} غير صالحة؛ تعذر احتساب دورة الرواتب.`);
      }
      const fixedComponentTotal = salaryComponents.reduce((sum, component) =>
        sum + (Number.isFinite(Number(component.amount)) ? Math.max(0, Number(component.amount)) : 0), 0);
      const salaryType: SalaryType = employee.salaryType === 'DAILY' ? 'DAILY' : 'MONTHLY';
      const fullMonthWorkdays = countScheduledWorkdays(
        periodStart, periodEnd, employeeShifts, holidayDates, workingDays, calendarDays
      );
      const expectedWorkdaysExact = countScheduledWorkdays(
        eligibleStart, eligibleEnd, employeeShifts, holidayDates, workingDays, calendarDays
      );
      const expectedWorkdays = roundMoney(expectedWorkdaysExact);
      const dailyRate = salaryType === 'DAILY'
        ? salary + fixedComponentTotal
        : (salary + fixedComponentTotal) / Math.max(1, fullMonthWorkdays);
      const baseAmount = salaryType === 'DAILY'
        ? roundMoney(dailyRate * expectedWorkdaysExact)
        : roundMoney((salary + fixedComponentTotal) * employedDays / calendarDays);
      const attendance = attendanceByEmployee.get(employee.id) ?? [];
      const leaves = leavesByEmployee.get(employee.id) ?? [];
      const inUnpaidLeave = (date: string) => leaves.some((leave) =>
        date >= leave.startDate && date <= leave.endDate && date >= eligibleStart && date <= eligibleEnd
      );
      const absentDays = attendance.filter((row) =>
        row.status === 'ABSENT' && row.date >= eligibleStart && row.date <= eligibleEnd
          && isEmployeeScheduledOn(row.date, employeeShifts, holidayDates) && !inUnpaidLeave(row.date)
      ).length;
      const unpaidLeaveCalendarDays = leaves.reduce((total, leave) => {
        const start = leave.startDate > eligibleStart ? leave.startDate : eligibleStart;
        const end = leave.endDate < eligibleEnd ? leave.endDate : eligibleEnd;
        return total + countLeaveDays(start, end, employeeShifts, holidayDates);
      }, 0);
      const unpaidLeaveDays = Math.min(expectedWorkdaysExact, roundMoney(unpaidLeaveCalendarDays));
      const lateMinutes = attendance.reduce((sum, row) =>
        row.date >= eligibleStart && row.date <= eligibleEnd && ['PRESENT', 'LATE'].includes(row.status)
          && isEmployeeScheduledOn(row.date, employeeShifts, holidayDates)
          ? sum + Math.max(0, Number(row.lateMinutes) || 0) : sum, 0);
      const overtimeMinutes = attendance.reduce((sum, row) =>
        row.date >= eligibleStart && row.date <= eligibleEnd && ['PRESENT', 'LATE'].includes(row.status)
          && Boolean(row.overtimeApproved)
          ? sum + Math.max(0, Number(row.overtimeMinutes) || 0) : sum, 0);
      const hourlyRate = dailyRate / WORKING_HOURS_PER_DAY;
      const overtimeAmount = roundMoney(hourlyRate * (overtimeMinutes / 60) * overtimeMultiplier);
      const attendanceDeductionAmount = roundMoney(
        dailyRate * Math.min(expectedWorkdaysExact, absentDays + unpaidLeaveDays)
          + hourlyRate * lateMinutes / 60
      );
      const transactions = transactionsByEmployee.get(employee.id) ?? [];
      const amountFor = (type: PayrollTxType) => Number(transactions.find((row) => row.type === type)?.amount) || 0;
      const bonusAmount = roundMoney(amountFor('BONUS'));
      const advanceAmount = roundMoney(amountFor('ADVANCE'));
      const manualDeductionAmount = roundMoney(amountFor('DEDUCTION'));
      const previousPayoutAmount = roundMoney(amountFor('SALARY_PAYOUT'));
      const commissions = commissionsByEmployee.get(employee.id) ?? [];
      const approvedCommissions = commissions.filter((row) => row.status === 'APPROVED');
      const commissionAmount = roundMoney(approvedCommissions.reduce((sum, row) => sum + Number(row.amount || 0), 0));
      const grossAmount = roundMoney(baseAmount + overtimeAmount + bonusAmount + commissionAmount);
      const taxAmount = roundMoney(grossAmount * taxRate / 100);
      const netAmount = roundMoney(
        grossAmount - attendanceDeductionAmount - manualDeductionAmount - advanceAmount - previousPayoutAmount - taxAmount
      );

      if (!employee.contractSalary && !employee.hasContractHistory && salaryType !== 'DAILY') warnings.push('لا يوجد عقد نشط يغطي الفترة؛ استُخدم الراتب الأساسي المسجل.');
      if (salaryComponents.length) warnings.push('يتضمن الراتب الأساسي المحسوب مكونات ثابتة من العقد.');
      if (!employeeShifts.length) warnings.push('لم تُعيّن وردية للموظف؛ استُخدم متوسط أيام الشركة ولم يُتحقق من أيام الأسبوع والعطلات.');
      if (attendance.length < Math.floor(expectedWorkdays)) warnings.push('سجلات الحضور أقل من أيام العمل المتوقعة؛ لم يُحتسب اليوم غير المسجل غيابًا.');
      if (commissions.some((row) => row.status === 'PENDING')) warnings.push('توجد عمولات معلقة لم تدخل في صافي الراتب.');
      if (previousPayoutAmount > 0) warnings.push('توجد دفعات راتب سابقة في الفترة وخُصمت من الصافي.');
      if (netAmount < 0) warnings.push('صافي الراتب سالب؛ يجب تسوية السلف أو الخصومات قبل الاعتماد.');

      calculated.push({
        warnings,
        item: {
          id: `prit_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
          employeeId: employee.id,
          branchId,
          employeeName: employee.name,
          salaryType,
          baseSalary: salary,
          expectedWorkdays,
          absentDays,
          unpaidLeaveDays,
          lateMinutes,
          overtimeMinutes,
          baseAmount,
          overtimeAmount,
          bonusAmount,
          commissionAmount,
          advanceAmount,
          manualDeductionAmount,
          attendanceDeductionAmount,
          taxAmount,
          grossAmount,
          netAmount,
          warnings,
          details: {
            workingDaysPerMonth: workingDays,
            workingHoursPerDay: WORKING_HOURS_PER_DAY,
            overtimeMultiplier,
            taxRate,
            salaryComponents,
            salaryComponentTotal: fixedComponentTotal,
            previousPayoutAmount,
            commissionIds: approvedCommissions.map((row) => row.id),
          },
          payoutTransactionId: null,
        },
      });
    }

    this.db.executeTransaction((db) => {
      if (runId) {
        db.run('DELETE FROM payroll_run_items WHERE payroll_run_id = ?', [runId]);
        db.run(
          'UPDATE payroll_runs SET created_by = ?, created_at = ?, source_fingerprint = ? WHERE id = ?',
          [actor.id, new Date().toISOString(), sourceFingerprint, runId]
        );
      } else {
        db.run(
          `INSERT INTO payroll_runs (id, period, branch_id, status, source_fingerprint, created_by, created_at)
           VALUES (?, ?, ?, 'DRAFT', ?, ?, ?)`,
          [existingRunId, period, branchId, sourceFingerprint, actor.id, new Date().toISOString()]
        );
      }
      for (const { item } of calculated) {
        db.run(
          `INSERT INTO payroll_run_items (
             id, payroll_run_id, employee_id, branch_id, employee_name, salary_type, base_salary,
             expected_workdays, absent_days, unpaid_leave_days, late_minutes, overtime_minutes,
             base_amount, overtime_amount, bonus_amount, commission_amount, advance_amount,
             manual_deduction_amount, attendance_deduction_amount, tax_amount, gross_amount,
             net_amount, warning_json, detail_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id, existingRunId, item.employeeId, item.branchId, item.employeeName, item.salaryType,
            item.baseSalary, item.expectedWorkdays, item.absentDays, item.unpaidLeaveDays, item.lateMinutes,
            item.overtimeMinutes, item.baseAmount, item.overtimeAmount, item.bonusAmount, item.commissionAmount,
            item.advanceAmount, item.manualDeductionAmount, item.attendanceDeductionAmount, item.taxAmount,
            item.grossAmount, item.netAmount, JSON.stringify(item.warnings), JSON.stringify(item.details),
          ]
        );
      }
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'Calculate payroll run', 'HR', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, existingRunId,
          JSON.stringify({ period, branchId, employeeCount: calculated.length }),
        ]
      );
    });
    return this.getPayrollRun(period)!;
  }

  static approvePayrollRun(id: string): PayrollRun {
    const actor = this.requirePayrollApproval();
    const run = this.getPayrollRunById(id);
    this.branchAccess.requireBranchAccess(run.branchId, actor);
    if (run.status !== 'DRAFT') throw new Error('لا يمكن اعتماد دورة رواتب ليست مسودة.');
    if (!run.items.length) throw new Error('لا يمكن اعتماد دورة رواتب بلا موظفين.');
    if (run.items.some((item) => item.netAmount < 0)) throw new Error('توجد رواتب صافية سالبة؛ عالج التحذيرات قبل الاعتماد.');
    const storedFingerprint = this.db.query<{ sourceFingerprint: string }>(
      'SELECT source_fingerprint AS sourceFingerprint FROM payroll_runs WHERE id = ?',
      [id]
    )[0]?.sourceFingerprint;
    if (storedFingerprint !== fingerprintPayrollSources(this.getPayrollSourceRows(run.period, run.branchId))) {
      throw new Error('تغيرت بيانات الرواتب بعد الاحتساب؛ أعد احتساب المسودة قبل الاعتماد.');
    }

    const now = new Date().toISOString();
    this.db.executeTransaction((db) => {
      for (const item of run.items) {
        const referenceId = `${item.employeeId}:${run.period}`;
        const legacyAccrual = db.query<{ id: string }>(
          `SELECT id FROM journal_entries
           WHERE reference_type = 'PAYROLL_SALARY_ACCRUAL' AND reference_id = ?`,
          [referenceId]
        )[0];
        const wages = roundMoney(item.baseAmount + item.overtimeAmount);
        const legacyAmount = legacyAccrual
          ? Number(db.query<{ amount: number }>(
            `SELECT COALESCE(SUM(l.credit - l.debit), 0) AS amount
             FROM journal_entry_lines l
             JOIN chart_of_accounts a ON a.id = l.account_id
             WHERE l.entry_id = ? AND a.code = '2104'`,
            [legacyAccrual.id]
          )[0]?.amount || 0)
          : 0;
        const wageAdjustment = roundMoney(wages - legacyAmount);
        if (Math.abs(wageAdjustment) > 0.009) {
          postLedgerEntry(db.getDatabase(), {
            date: `${run.period}-01`,
            description: `Payroll run wage adjustment for ${item.employeeName} (${run.period})`,
            referenceType: 'PAYROLL_RUN_ACCRUAL',
            referenceId,
            createdBy: actor.id,
            branchId: item.branchId,
            lines: wageAdjustment > 0
              ? [
                { accountCode: '5202', debit: wageAdjustment, credit: 0 },
                { accountCode: '2104', debit: 0, credit: wageAdjustment },
              ]
              : [
                { accountCode: '2104', debit: Math.abs(wageAdjustment), credit: 0 },
                { accountCode: '5202', debit: 0, credit: Math.abs(wageAdjustment) },
              ],
          });
        }
        if (item.attendanceDeductionAmount > 0) {
          postLedgerEntry(db.getDatabase(), {
            date: `${run.period}-01`,
            description: `Payroll attendance deductions for ${item.employeeName} (${run.period})`,
            referenceType: 'PAYROLL_RUN_ATTENDANCE_DEDUCTION',
            referenceId,
            createdBy: actor.id,
            branchId: item.branchId,
            lines: [
              { accountCode: '2104', debit: item.attendanceDeductionAmount, credit: 0 },
              { accountCode: '5202', debit: 0, credit: item.attendanceDeductionAmount },
            ],
          });
        }
        if (item.taxAmount > 0) {
          postLedgerEntry(db.getDatabase(), {
            date: `${run.period}-01`,
            description: `Payroll tax withholding for ${item.employeeName} (${run.period})`,
            referenceType: 'PAYROLL_RUN_TAX',
            referenceId,
            createdBy: actor.id,
            branchId: item.branchId,
            lines: [
              { accountCode: '2104', debit: item.taxAmount, credit: 0 },
              { accountCode: '2106', debit: 0, credit: item.taxAmount },
            ],
          });
        }
        const commissionIds = item.details.commissionIds;
        if (commissionIds.length) {
          const stillApproved = db.query<{ count: number }>(
            `SELECT COUNT(*) AS count FROM commissions
             WHERE employee_id = ? AND period_month = ? AND status = 'APPROVED'
               AND id IN (${commissionIds.map(() => '?').join(', ')})`,
            [item.employeeId, run.period, ...commissionIds]
          )[0]?.count ?? 0;
          if (Number(stillApproved) !== commissionIds.length) {
            throw new Error(`تغيرت حالة عمولات الموظف ${item.employeeName} بعد احتساب الدورة؛ أعد الاحتساب.`);
          }
          postLedgerEntry(db.getDatabase(), {
            date: `${run.period}-01`,
            description: `Move approved commissions to payroll payable for ${item.employeeName} (${run.period})`,
            referenceType: 'PAYROLL_RUN_COMMISSION',
            referenceId,
            createdBy: actor.id,
            branchId: item.branchId,
            lines: [
              { accountCode: '2103', debit: item.commissionAmount, credit: 0 },
              { accountCode: '2104', debit: 0, credit: item.commissionAmount },
            ],
          });
        }
      }
      db.run(
        `UPDATE payroll_runs SET status = 'APPROVED', approved_by = ?, approved_at = ? WHERE id = ? AND status = 'DRAFT'`,
        [actor.id, now, id]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'Approve payroll run', 'HR', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ period: run.period })]
      );
    });
    return this.getPayrollRunById(id);
  }

  static payPayrollRun(id: string): PayrollRun {
    const actor = this.requirePayrollApproval();
    const run = this.getPayrollRunById(id);
    this.branchAccess.requireBranchAccess(run.branchId, actor);
    if (run.status !== 'APPROVED') throw new Error('يجب اعتماد دورة الرواتب قبل صرفها.');
    const today = localDateString();
    this.db.executeTransaction((db) => {
      for (const item of run.items) {
        if (item.netAmount <= 0) continue;
        const branchId = this.requireEmployeeBranch(item.employeeId, actor);
        const registerId = this.branchAccess.getDefaultRegisterId(branchId, actor);
        const txId = `ptx_${uuidv4().substring(0, 8)}`;
        this.persistPayrollTransaction(db, {
          employeeId: item.employeeId,
          type: 'SALARY_PAYOUT',
          amount: item.netAmount,
          date: today,
          notes: `صرف دورة الرواتب ${run.period}`,
          registerId,
        }, item.netAmount, txId, registerId, branchId, actor, run.period);
        db.run('UPDATE payroll_run_items SET payout_transaction_id = ? WHERE id = ?', [txId, item.id]);
        if (item.details.commissionIds.length) {
          db.run(
            `UPDATE commissions SET status = 'PAID', paid_at = ?
             WHERE status = 'APPROVED' AND id IN (${item.details.commissionIds.map(() => '?').join(', ')})`,
            [today, ...item.details.commissionIds]
          );
        }
      }
      db.run(
        `UPDATE payroll_runs SET status = 'PAID', paid_by = ?, paid_at = ? WHERE id = ? AND status = 'APPROVED'`,
        [actor.id, new Date().toISOString(), id]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'Pay payroll run', 'HR', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ period: run.period })]
      );
    });
    return this.getPayrollRunById(id);
  }

  static closePayrollRun(id: string): PayrollRun {
    const actor = this.requirePayrollApproval();
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
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    return this.db.query<EmployeePayrollPayable>(`
      WITH payroll_lines AS (
        SELECT
          CASE
            WHEN e.reference_type IN ('PAYROLL_SALARY_ACCRUAL','PAYROLL_ADVANCE_APPLICATION')
              THEN substr(e.reference_id, 1, instr(e.reference_id, ':') - 1)
            WHEN e.reference_type IN ('PAYROLL_RUN_ACCRUAL','PAYROLL_RUN_ATTENDANCE_DEDUCTION','PAYROLL_RUN_TAX','PAYROLL_RUN_COMMISSION')
              THEN substr(e.reference_id, 1, instr(e.reference_id, ':') - 1)
            WHEN e.reference_type = 'PAYROLL_TRANSACTION' THEN tx.employee_id
            WHEN e.reference_type = 'PAYROLL_REVERSAL' THEN reversed_tx.employee_id
            ELSE NULL
          END AS employee_id,
          l.credit - l.debit AS balance
        FROM journal_entry_lines l
        JOIN journal_entries e ON e.id = l.entry_id AND e.is_posted = 1
        JOIN chart_of_accounts a ON a.id = l.account_id AND a.code = '2104'
        LEFT JOIN payroll_transactions tx
          ON e.reference_type = 'PAYROLL_TRANSACTION' AND tx.id = e.reference_id
        LEFT JOIN payroll_transactions reversed_tx
          ON e.reference_type = 'PAYROLL_REVERSAL'
          AND substr(e.reference_id, 1, length(reversed_tx.id) + 1) = reversed_tx.id || ':'
        WHERE ${scope.clause}
      )
      SELECT p.employee_id AS employeeId,
             COALESCE(emp.name, 'قيود رواتب غير موزعة') AS employeeName,
             ROUND(SUM(p.balance), 2) AS balance
      FROM payroll_lines p
      LEFT JOIN employees emp ON emp.id = p.employee_id
      GROUP BY p.employee_id, emp.name
      HAVING ABS(SUM(p.balance)) > 0.009
      ORDER BY employeeName
    `, scope.params);
  }

  static deleteTransaction(id: string): void {
    const actor = this.requirePayrollManage();
    const scope = this.branchAccess.sqlScope('pt.branch_id', 'e.branch_id', actor);
    const row = this.db.query<any>(`
      SELECT pt.*, COALESCE(pt.branch_id, e.branch_id) AS effective_branch_id FROM payroll_transactions pt
      LEFT JOIN employees e ON e.id = pt.employee_id
      WHERE pt.id = ? AND ${scope.clause}
    `, [id, ...scope.params])[0];
    if (!row) throw new Error('عملية الرواتب غير موجودة ضمن نطاق فروعك.');
    this.assertPayrollPeriodEditable(row.effective_branch_id, row.date);
    this.db.executeTransaction((db) => {
      const entry = db.query<any>(`SELECT id FROM journal_entries WHERE reference_type='PAYROLL_TRANSACTION' AND reference_id=?`, [id])[0];
      if (entry) reverseLedgerEntry(db.getDatabase(), entry.id, {
        date: localDateString(), description: `Reverse payroll transaction ${id}`,
        referenceType: 'PAYROLL_REVERSAL', referenceId: `${id}:${uuidv4()}`, createdBy: actor.id,
      });
      if (row.type === 'ADVANCE' || row.type === 'SALARY_PAYOUT') {
        db.run('UPDATE cash_registers SET current_balance=current_balance+? WHERE id=?', [row.amount, row.register_id || 'cr_main']);
      }
      db.run('DELETE FROM payroll_transactions WHERE id=?', [id]);
    });
  }

  static getEmployeeFinancials(employeeId: string, period = localDateString().slice(0, 7)): EmployeeFinancials {
    const actor = this.requireFinancialView();
    if (!isValidPayrollPeriod(period)) throw new Error('Payroll period must be YYYY-MM.');
    const emp = this.getById(employeeId);
    if (!emp) throw new Error('الموظف غير موجود ضمن نطاق فروعك.');

    const scope = this.branchAccess.sqlScope('pt.branch_id', 'e.branch_id', actor);
    const rows = this.db.query<{ type: PayrollTxType; total: number }>(
      `SELECT pt.type, SUM(pt.amount) AS total
       FROM payroll_transactions pt JOIN employees e ON e.id = pt.employee_id
       WHERE pt.employee_id = ? AND substr(pt.date, 1, 7) = ? AND ${scope.clause} GROUP BY pt.type`,
      [employeeId, period, ...scope.params]
    );

    const map: Record<string, number> = {};
    for (const r of rows) map[r.type] = r.total ?? 0;

    const advances = map['ADVANCE'] ?? 0;
    const bonuses = map['BONUS'] ?? 0;
    const deductions = map['DEDUCTION'] ?? 0;
    const payouts = map['SALARY_PAYOUT'] ?? 0;
    const workingDays = Number(this.db.query<{ workingDays: number }>(
      `SELECT COALESCE(c.working_days_per_month, 26) AS workingDays
       FROM employees e
       LEFT JOIN branches b ON b.id = e.branch_id
       LEFT JOIN companies c ON c.id = b.company_id
       WHERE e.id = ?`,
      [employeeId]
    )[0]?.workingDays) || 26;
    const monthlySalary = emp.salaryType === 'DAILY' ? emp.baseSalary * workingDays : emp.baseSalary;
    const netDue = monthlySalary + bonuses - advances - deductions - payouts;

    return { baseSalary: monthlySalary, advances, bonuses, deductions, payouts, netDue };
  }

  // ─── Attendance ────────────────────────────────────────────────────────────────

  static getAllAttendance(): Attendance[] {
    const actor = this.requireAttendanceView();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    return this.db.query<Attendance>(`
      SELECT a.id, a.employee_id AS employeeId, a.date, a.status,
             COALESCE(a.late_minutes, 0) AS lateMinutes,
             COALESCE(a.overtime_minutes, 0) AS overtimeMinutes,
             a.notes, a.recorded_by AS recordedBy, a.created_at AS createdAt
      FROM attendance a JOIN employees e ON e.id = a.employee_id
      WHERE ${scope.clause} AND ${departmentScope.clause} ORDER BY a.date DESC
    `, [...scope.params, ...departmentScope.params]);
  }

  static getAttendanceByDate(date: string): Attendance[] {
    const actor = this.requireAttendanceView();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    return this.db.query<Attendance>(
      `SELECT a.id, a.employee_id AS employeeId, a.date, a.status,
              COALESCE(a.late_minutes, 0) AS lateMinutes,
              COALESCE(a.overtime_minutes, 0) AS overtimeMinutes,
              a.notes, a.recorded_by AS recordedBy, a.created_at AS createdAt
       FROM attendance a JOIN employees e ON e.id = a.employee_id
       WHERE a.date = ? AND ${scope.clause} AND ${departmentScope.clause} ORDER BY a.created_at`,
      [date, ...scope.params, ...departmentScope.params]
    );
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
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    return this.db.query<{ location: string; count: number }>(
      `SELECT e.location, COUNT(*) AS count FROM employees e
       WHERE ${scope.clause} GROUP BY e.location ORDER BY count DESC`,
      scope.params
    );
  }

  static getTotalWagesBill(): number {
    const actor = this.requireFinancialView();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const rows = this.db.query<{ salaryType: string; baseSalary: number }>(
      `SELECT e.salary_type AS salaryType, e.base_salary AS baseSalary FROM employees e
       WHERE e.status = 'ACTIVE' AND ${scope.clause}`,
      scope.params
    );
    return rows.reduce((sum, e) => {
      return sum + (e.salaryType === 'DAILY' ? e.baseSalary * 26 : e.baseSalary);
    }, 0);
  }
}
