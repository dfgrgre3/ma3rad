import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import type { EmployeeDepartmentAccessService } from '../../auth/EmployeeDepartmentAccessService';
import type {
  Employee,
  EmployeeBranchAssignment,
  EmployeeServiceActor,
  EmployeeStatus,
  SalesRepOption,
} from './types';
import { isValidDate, normalizePhone } from './utils';

export interface EmployeeListOptions {
  search?: string;
  location?: string;
  status?: EmployeeStatus;
}

type ScopedSql = { clause: string; params: any[] };

interface EmployeeQueryServices {
  branchAccess: BranchAccessService;
  departmentAccess: EmployeeDepartmentAccessService;
}

function employeeScopeClauses(
  services: EmployeeQueryServices,
  actor: EmployeeServiceActor
): { scope: ScopedSql; companyScope: ScopedSql; departmentScope: ScopedSql } {
  return {
    scope: services.branchAccess.sqlScope('e.branch_id', undefined, actor),
    companyScope: services.branchAccess.companyScope('e.company_id', actor),
    departmentScope: services.departmentAccess.sqlScope('e.department_id', actor),
  };
}

export function buildEmployeeListQuery(
  actor: EmployeeServiceActor,
  opts: EmployeeListOptions = {},
  services: EmployeeQueryServices
): { sql: string; params: any[] } {
  const canSeeFinancials = PermissionService.canAny(actor, ['employees.financials.view', 'employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve']);
  const canSeePrivateProfile = PermissionService.can(actor, 'employees.profile.view');
  const salaryColumns = canSeeFinancials
    ? 'e.base_salary / 100.0 AS baseSalary, e.salary_type AS salaryType'
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
  const { scope, companyScope, departmentScope } = employeeScopeClauses(services, actor);

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
    ? 'e.salary_payment_method AS salaryPaymentMethod, e.bank_name AS bankName, e.bank_account_number AS bankAccountNumber, e.wallet_provider AS walletProvider, e.wallet_number AS walletNumber, e.social_insurance_number AS socialInsuranceNumber, e.tax_file_number AS taxFileNumber, e.tax_exempt AS taxExempt, e.tax_exemption_amount / 100.0 AS taxExemptionAmount, e.tax_dependents AS taxDependents'
    : "'CASH' AS salaryPaymentMethod, NULL AS bankName, NULL AS bankAccountNumber, NULL AS walletProvider, NULL AS walletNumber, NULL AS socialInsuranceNumber, NULL AS taxFileNumber, 0 AS taxExempt, 0 AS taxExemptionAmount, 0 AS taxDependents";
  const sql = `SELECT e.id, e.code, e.branch_id AS branchId, e.employment_type AS employmentType,
                      COALESCE(e.name, e.full_name) AS name, ${privateProfileColumns},
                      e.location, e.role, e.phone, e.email,
                      e.department_id AS departmentId, d.name AS departmentName,
                      e.manager_employee_id AS managerEmployeeId, m.name AS managerName,
                      e.terminated_at AS terminatedAt,
                      ${salaryColumns}, ${financialColumns}, e.status,
                      COALESCE(e.is_sales_rep, 0) AS isSalesRep,
                      e.commission_percentage AS commissionPercentage,
                      e.monthly_target / 100.0 AS monthlyTarget,
                      (SELECT GROUP_CONCAT(eba.branch_id) FROM employee_branch_assignments eba
                        WHERE eba.employee_id = e.id) AS additionalBranchIdsRaw,
                      e.joined_date AS joinedDate, e.notes, e.created_at AS createdAt, e.updated_at AS updatedAt
               FROM employees e
               LEFT JOIN departments d ON d.id = e.department_id
               LEFT JOIN employees m ON m.id = e.manager_employee_id
               ${where} ORDER BY COALESCE(e.name, e.full_name) ASC`;
  return { sql, params };
}

export function buildEmployeeByIdQuery(
  id: string,
  actor: EmployeeServiceActor,
  services: EmployeeQueryServices
): { sql: string; params: any[] } {
  const { scope, companyScope, departmentScope } = employeeScopeClauses(services, actor);
  const canSeeFinancials = PermissionService.canAny(actor, ['employees.financials.view', 'employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve']);
  const canSeePrivateProfile = PermissionService.can(actor, 'employees.profile.view');
  const salaryColumns = canSeeFinancials
    ? 'e.base_salary / 100.0 AS baseSalary, e.salary_type AS salaryType'
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
    ? 'e.salary_payment_method AS salaryPaymentMethod, e.bank_name AS bankName, e.bank_account_number AS bankAccountNumber, e.wallet_provider AS walletProvider, e.wallet_number AS walletNumber, e.social_insurance_number AS socialInsuranceNumber, e.tax_file_number AS taxFileNumber, e.tax_exempt AS taxExempt, e.tax_exemption_amount / 100.0 AS taxExemptionAmount, e.tax_dependents AS taxDependents'
    : "'CASH' AS salaryPaymentMethod, NULL AS bankName, NULL AS bankAccountNumber, NULL AS walletProvider, NULL AS walletNumber, NULL AS socialInsuranceNumber, NULL AS taxFileNumber, 0 AS taxExempt, 0 AS taxExemptionAmount, 0 AS taxDependents";
  const sql = `SELECT e.id, e.code, e.branch_id AS branchId, e.employment_type AS employmentType,
            COALESCE(e.name, e.full_name) AS name, ${privateProfileColumns},
            e.location, e.role, e.phone, e.email, e.department_id AS departmentId,
            d.name AS departmentName, e.manager_employee_id AS managerEmployeeId,
            m.name AS managerName, e.terminated_at AS terminatedAt,
            ${salaryColumns}, ${financialColumns}, e.status,
            COALESCE(e.is_sales_rep, 0) AS isSalesRep,
            e.commission_percentage AS commissionPercentage,
            e.monthly_target / 100.0 AS monthlyTarget,
            (SELECT GROUP_CONCAT(eba.branch_id) FROM employee_branch_assignments eba
              WHERE eba.employee_id = e.id) AS additionalBranchIdsRaw,
            e.joined_date AS joinedDate, e.notes, e.created_at AS createdAt, e.updated_at AS updatedAt
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN employees m ON m.id = e.manager_employee_id
     WHERE e.id = ? AND ${scope.clause} AND ${companyScope.clause} AND ${departmentScope.clause}`;
  return { sql, params: [id, ...scope.params, ...companyScope.params, ...departmentScope.params] };
}

export function hydrateEmployee(row: Employee & { additionalBranchIdsRaw?: string | null }): Employee {
  const { additionalBranchIdsRaw, ...rest } = row;
  return {
    ...rest,
    isSalesRep: Boolean(Number((rest as any).isSalesRep ?? 0)),
    additionalBranchIds: additionalBranchIdsRaw
      ? String(additionalBranchIdsRaw).split(',').map((id) => id.trim()).filter(Boolean)
      : [],
  };
}

/**
 * Validates and normalizes additional branch ids for an employee: deduped,
 * active branches inside the actor's authorized scope, excluding the home branch.
 */
export function normalizeAdditionalBranchIds(
  db: DatabaseManager,
  branchAccess: BranchAccessService,
  ids: string[] | undefined,
  homeBranchId: string | null | undefined,
  actor: EmployeeServiceActor
): string[] {
  if (!ids?.length) return [];
  const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))]
    .filter((branchId) => branchId !== homeBranchId);
  for (const branchId of unique) {
    const branch = db.query<{ isActive: number }>(
      'SELECT is_active AS isActive FROM branches WHERE id = ?',
      [branchId]
    )[0];
    if (!branch || Number(branch.isActive) !== 1) {
      throw new Error('أحد الفروع الإضافية المحددة غير موجود أو غير نشط.');
    }
    branchAccess.requireBranchAuthorization(branchId, actor);
  }
  return unique;
}

export function syncBranchAssignments(
  db: DatabaseManager,
  employeeId: string,
  branchIds: string[],
  actorId: string
): void {
  db.run('DELETE FROM employee_branch_assignments WHERE employee_id = ?', [employeeId]);
  for (const branchId of branchIds) {
    db.run(
      'INSERT OR IGNORE INTO employee_branch_assignments (employee_id, branch_id, created_by) VALUES (?, ?, ?)',
      [employeeId, branchId, actorId]
    );
  }
}

/** Additional branches assigned to an employee (excludes the home branch). */
export function listBranchAssignments(db: DatabaseManager, employeeId: string): EmployeeBranchAssignment[] {
  AuthService.requireAuth();
  return db.query<EmployeeBranchAssignment>(
    `SELECT eba.branch_id AS branchId, b.name AS branchName
     FROM employee_branch_assignments eba
     JOIN branches b ON b.id = eba.branch_id
     WHERE eba.employee_id = ?
     ORDER BY b.name ASC`,
    [employeeId]
  );
}

/**
 * Sales-rep picker source: every active employee in the actor's company scope,
 * with home + assigned branch coverage. When `branchId` is given, each option
 * carries `servesBranch` so callers can badge or sort reps covering that branch.
 * This is intentionally not restricted by employees.view — quotation/order
 * creators need the picker without HR permissions.
 */
export function getSalesReps(db: DatabaseManager, branchAccess: BranchAccessService, branchId?: string): SalesRepOption[] {
  const actor = AuthService.requireAuth();
  const companyScope = branchAccess.companyScope('e.company_id', actor);
  const rows = db.query<any>(
    `SELECT e.id, e.code, COALESCE(e.name, e.full_name) AS name, e.branch_id AS homeBranchId,
            COALESCE(e.is_sales_rep, 0) AS isSalesRep,
            e.commission_percentage AS commissionPercentage,
            (SELECT GROUP_CONCAT(a.branch_id) FROM employee_branch_assignments a
              WHERE a.employee_id = e.id) AS extraBranchIds
     FROM employees e
     WHERE e.is_active = 1 AND ${companyScope.clause}
     ORDER BY COALESCE(e.is_sales_rep, 0) DESC, name ASC`,
    companyScope.params
  );
  const branchNames = new Map(
    db.query<{ id: string; name: string }>(
      'SELECT id, name FROM branches WHERE is_active = 1'
    ).map((branch) => [branch.id, branch.name])
  );
  return rows.map((row) => {
    const extraIds: string[] = row.extraBranchIds
      ? String(row.extraBranchIds).split(',').map((id: string) => id.trim()).filter(Boolean)
      : [];
    const ids = [row.homeBranchId, ...extraIds].filter(Boolean) as string[];
    return {
      id: String(row.id),
      code: String(row.code || ''),
      name: String(row.name || ''),
      homeBranchId: row.homeBranchId ?? null,
      branchIds: ids,
      branchNames: ids.map((id) => branchNames.get(id) || id).join('، '),
      isSalesRep: Boolean(Number(row.isSalesRep)),
      commissionPercentage: Number(row.commissionPercentage) || 0,
      servesBranch: branchId ? ids.includes(branchId) : undefined,
    };
  });
}

export function validateEmployeeFields(data: Partial<Employee>): void {
  if (data.name !== undefined && !data.name.trim()) throw new Error('اسم الموظف مطلوب.');
  if (data.role !== undefined && !data.role.trim()) throw new Error('المسمى الوظيفي مطلوب.');
  if (data.phone !== undefined) {
    validatePhone(data.phone, 'رقم الهاتف');
  }
  for (const [value, label] of [
    [data.phone2, 'رقم الهاتف البديل'],
    [data.emergencyContactPhone, 'هاتف جهة اتصال الطوارئ'],
  ] as Array<[string | null | undefined, string]>) {
    if (value?.trim()) validatePhone(value, label);
  }
  if (data.nationalId?.trim() && !/^[\dA-Za-z-]{6,24}$/.test(normalizePhone(data.nationalId))) {
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

function validatePhone(phone: string, label: string): void {
  const normalized = normalizePhone(phone);
  const digitCount = normalized.replace(/\D/g, '').length;
  if (!/^\+?[\d\s()-]{7,20}$/.test(normalized) || digitCount < 7 || digitCount > 15) {
    throw new Error(`${label} غير صالح.`);
  }
}

export function validateEmployeeOrganization(
  db: DatabaseManager,
  departmentAccess: EmployeeDepartmentAccessService,
  data: Partial<Employee>,
  branchId: string,
  employeeId: string | undefined,
  actor: EmployeeServiceActor
): void {
  if (data.departmentId) {
    const department = db.query<{ branchId: string | null; isActive: number }>(
      'SELECT branch_id AS branchId, is_active AS isActive FROM departments WHERE id = ?',
      [data.departmentId]
    )[0];
    const isUnchangedInactiveDepartment = Boolean(
      employeeId
      && department
      && !department.isActive
      && db.query<{ departmentId: string | null }>(
        'SELECT department_id AS departmentId FROM employees WHERE id = ?',
        [employeeId]
      )[0]?.departmentId === data.departmentId
    );
    if (!department || (!department.isActive && !isUnchangedInactiveDepartment)
      || (department.branchId && department.branchId !== branchId)) {
      throw new Error('القسم غير نشط أو لا يتبع فرع الموظف.');
    }
    const departmentScope = departmentAccess.sqlScope('d.id', actor);
    if (!db.query(
      `SELECT 1 FROM departments d WHERE d.id = ? AND ${departmentScope.clause}`,
      [data.departmentId, ...departmentScope.params]
    ).length) throw new Error('القسم خارج نطاق الأقسام المصرح بها.');
  }
  if (employeeId) departmentAccess.requireEmployeeAccess(employeeId, actor);
  if (data.nationalId?.trim()) {
    const duplicate = db.query<{ id: string }>(
      `SELECT id FROM employees WHERE national_id = ? ${employeeId ? 'AND id != ?' : ''} LIMIT 1`,
      employeeId
        ? [normalizePhone(data.nationalId), employeeId]
        : [normalizePhone(data.nationalId)]
    )[0];
    if (duplicate) throw new Error('رقم الهوية مسجل لموظف آخر.');
  }
  if (!data.managerEmployeeId) return;
  if (data.managerEmployeeId === employeeId) throw new Error('لا يمكن تعيين الموظف مديراً مباشراً لنفسه.');
  const manager = db.query<{ branchId: string | null; status: EmployeeStatus; managerEmployeeId: string | null }>(
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
    currentId = db.query<{ managerEmployeeId: string | null }>(
      'SELECT manager_employee_id AS managerEmployeeId FROM employees WHERE id = ?',
      [currentId]
    )[0]?.managerEmployeeId;
  }
}
