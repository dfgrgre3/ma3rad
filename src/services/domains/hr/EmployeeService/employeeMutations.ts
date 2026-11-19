import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { localDateString } from '../../../../utils/shared/date';
import type {
  Employee,
  EmployeeServiceActor,
  EmployeeStatus,
  SalaryType,
} from './types';
import { normalizePhone } from './utils';
import { syncBranchAssignments } from './employeeQueries';

export type EmployeeCreateInput = Omit<Employee, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'notes'> & { notes?: string };
export type EmployeeUpdateInput = Partial<Omit<Employee, 'id' | 'code' | 'createdAt'>>;

export interface InsertEmployeeArgs {
  data: EmployeeCreateInput;
  id: string;
  branchId: string;
  additionalBranchIds: string[];
  actor: EmployeeServiceActor;
}

export interface UpdateEmployeeArgs {
  id: string;
  data: EmployeeUpdateInput;
  stored: { status: EmployeeStatus; baseSalary: number; salaryType: SalaryType } | undefined;
  nextStatus: EmployeeStatus;
  additionalBranchIds: string[] | undefined;
  actor: EmployeeServiceActor;
}

/** Transaction body for EmployeeService.create (employee row + history + audit). */
export function insertEmployeeRecord(db: DatabaseManager, args: InsertEmployeeArgs): void {
  const { data, id, branchId, additionalBranchIds, actor } = args;
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
       bank_name, wallet_provider, wallet_number, salary_payment_method, social_insurance_number, tax_file_number, tax_exempt, tax_exemption_amount, tax_dependents, education, previous_experience,
       is_sales_rep, commission_percentage, monthly_target
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?, ROUND(?*100))`,
    [id, code, data.name.trim(), data.name.trim(), normalizePhone(data.phone), data.email?.trim() || null, data.role.trim(), data.role.trim(),
     data.location?.trim() || '', branchId, data.employmentType || 'FULL_TIME', joinedDate, joinedDate, data.baseSalary,
     data.salaryType, data.status, data.status === 'ACTIVE' ? 1 : 0, data.notes?.trim() || null,
     companyId, data.nationalId?.trim() || null, data.phone2?.trim() ? normalizePhone(data.phone2) : null,
     data.address?.trim() || null, data.birthDate || null, data.gender || null,
     data.emergencyContactName?.trim() || null,
     data.emergencyContactPhone?.trim() ? normalizePhone(data.emergencyContactPhone) : null,
     data.departmentId || null, data.managerEmployeeId || null, data.probationStartDate || null,
     data.probationEndDate || null, data.bankAccountNumber?.trim() || null, data.bankName?.trim() || null,
     data.walletProvider?.trim() || null, data.walletNumber?.trim() || null,
     data.salaryPaymentMethod || 'CASH', data.socialInsuranceNumber?.trim() || null,
     data.taxFileNumber?.trim() || null, data.taxExempt ? 1 : 0,
     Math.max(0, Number(data.taxExemptionAmount) || 0), Math.max(0, Math.round(Number(data.taxDependents) || 0)),
     data.education?.trim() || null, data.previousExperience?.trim() || null,
     data.isSalesRep ? 1 : 0, Math.max(0, Number(data.commissionPercentage) || 0),
     Math.max(0, Math.round(Number(data.monthlyTarget) || 0))]
  );
  syncBranchAssignments(db, id, additionalBranchIds, actor.id);
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
}

/** Transaction body for EmployeeService.update (row updates + history + audit). */
export function updateEmployeeRecord(db: DatabaseManager, args: UpdateEmployeeArgs): void {
  const { id, data, stored, nextStatus, additionalBranchIds, actor } = args;
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
       base_salary = COALESCE(ROUND(?*100), base_salary),
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
     data.phone === undefined ? null : normalizePhone(data.phone), data.email ?? null, data.baseSalary ?? null, data.salaryType ?? null,
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
    ['phone2', 'phone2', (value) => value?.trim() ? normalizePhone(value) : null],
    ['address', 'address', (value) => value?.trim() || null],
    ['emergencyContactName', 'emergency_contact_name', (value) => value?.trim() || null],
    ['emergencyContactPhone', 'emergency_contact_phone', (value) => value?.trim() ? normalizePhone(value) : null],
    ['departmentId', 'department_id', (value) => value || null],
    ['managerEmployeeId', 'manager_employee_id', (value) => value || null],
    ['probationStartDate', 'probation_start_date', (value) => value || null],
    ['probationEndDate', 'probation_end_date', (value) => value || null],
    ['bankAccountNumber', 'bank_account_number', (value) => value?.trim() || null],
    ['bankName', 'bank_name', (value) => value?.trim() || null],
    ['walletProvider', 'wallet_provider', (value) => value?.trim() || null],
    ['walletNumber', 'wallet_number', (value) => value?.trim() || null],
    ['salaryPaymentMethod', 'salary_payment_method', (value) => value || 'CASH'],
    ['socialInsuranceNumber', 'social_insurance_number', (value) => value?.trim() || null],
    ['taxFileNumber', 'tax_file_number', (value) => value?.trim() || null],
    ['taxExempt', 'tax_exempt', (value) => value ? 1 : 0],
    ['taxExemptionAmount', 'tax_exemption_amount', (value) => Math.max(0, Number(value) || 0)],
    ['taxDependents', 'tax_dependents', (value) => Math.max(0, Math.round(Number(value) || 0))],
    ['education', 'education', (value) => value?.trim() || null],
    ['previousExperience', 'previous_experience', (value) => value?.trim() || null],
  ];
  const profileUpdates = profileFields.filter(([key]) => data[key] !== undefined);
  if (profileUpdates.length) {
    db.run(
      `UPDATE employees SET ${profileUpdates.map(([, column]) => column === 'tax_exemption_amount' ? 'tax_exemption_amount = ROUND(?*100)' : `${column} = ?`).join(', ')},
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...profileUpdates.map(([key, , normalize]) => normalize(data[key])), id]
    );
  }
  const repUpdates: string[] = [];
  const repParams: any[] = [];
  if (data.isSalesRep !== undefined) {
    repUpdates.push('is_sales_rep = ?');
    repParams.push(data.isSalesRep ? 1 : 0);
  }
  if (data.commissionPercentage !== undefined) {
    repUpdates.push('commission_percentage = ?');
    repParams.push(Math.max(0, Number(data.commissionPercentage) || 0));
  }
  if (data.monthlyTarget !== undefined) {
    repUpdates.push('monthly_target = ROUND(?*100)');
    repParams.push(Math.max(0, Number(data.monthlyTarget) || 0));
  }
  if (repUpdates.length) {
    db.run(
      `UPDATE employees SET ${repUpdates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...repParams, id]
    );
  }
  if (additionalBranchIds !== undefined) {
    syncBranchAssignments(db, id, additionalBranchIds, actor.id);
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
}
