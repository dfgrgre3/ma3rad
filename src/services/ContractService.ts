import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { ModuleRegistryService } from './ModuleRegistryService';
import { localDateString } from '../utils/date';
import type { User } from '../types/identity';
import type {
  ContractEffectiveStatus,
  ContractFilters,
  ContractRenewalDTO,
  ContractSummary,
  ContractType,
  CreateContractDTO,
  EmployeeContract,
  UpdateContractDTO,
} from '../types/hrContract';

const CONTRACT_TYPES: ContractType[] = ['PERMANENT', 'FIXED_TERM', 'PART_TIME', 'TEMPORARY'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string | null | undefined, label: string): void {
  if (!value) return;
  if (!DATE_PATTERN.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD.`);
  }
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export class ContractService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

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
    const row = this.db.query<EmployeeContract>(
      `SELECT c.*, e.name AS employee_name, b.name AS branch_name
       FROM employee_contracts c
       JOIN employees e ON e.id = c.employee_id
       LEFT JOIN branches b ON b.id = c.branch_id
       WHERE c.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    )[0];
    return row ? this.decorate(row) : null;
  }

  private requireContract(actor: User, id: string): EmployeeContract {
    const contract = this.queryContract(actor, id);
    if (!contract) throw new Error('عقد الموظف غير موجود أو ليس لديك صلاحية الوصول إليه.');
    return contract;
  }

  private requireEmployeeBranch(employeeId: string, actor: User): { branchId: string; name: string } {
    const employee = this.db.query<{ branchId: string | null; name: string }>(
      `SELECT branch_id AS branchId, name FROM employees WHERE id = ?`,
      [employeeId]
    )[0];
    if (!employee) throw new Error('الموظف المحدد غير موجود.');
    if (!employee.branchId) throw new Error('الموظف غير مرتبط بفرع.');
    this.branchAccess.requireBranchAccess(employee.branchId, actor);
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
    const conditions = [scope.clause];
    const params: Array<string | number> = [...scope.params];

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
           job_title, salary, currency, status, renewal_notice_days, notes, created_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`,
        [
          id, input.employeeId, employee.branchId, contractNumber, contractType, input.startDate,
          input.endDate || null, input.jobTitle.trim(), salary,
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
         currency = COALESCE(?, currency),
         renewal_notice_days = COALESCE(?, renewal_notice_days),
         notes = COALESCE(?, notes),
         signed_date = COALESCE(?, signed_date),
         updated_at = ?
       WHERE id = ?`,
      [
        patch.contractType ?? null, patch.startDate ?? null, endDate,
        patch.jobTitle?.trim() || null, patch.salary ?? null,
        patch.currency?.trim().toUpperCase() || null, patch.renewalNoticeDays ?? null,
        patch.notes?.trim() || null, patch.signedDate ?? null, new Date().toISOString(), id,
      ]
    );
    this.audit('تعديل عقد موظف', id, patch);
    return this.requireContract(actor, id);
  }

  public activateContract(id: string, signedDate?: string): EmployeeContract {
    this.guardWrites();
    const actor = this.require('hr.contracts.manage');
    const existing = this.requireContract(actor, id);
    if (existing.status !== 'DRAFT') throw new Error('لا يمكن تفعيل عقد ليس مسودة.');
    assertDate(signedDate, 'تاريخ التوقيع');
    this.assertNoActiveOverlap(existing.employeeId, existing.startDate, existing.endDate, existing.id);

    this.db.run(
      `UPDATE employee_contracts SET
         status = 'ACTIVE', signed_date = ?, updated_at = ?
       WHERE id = ?`,
      [signedDate || localDateString(), new Date().toISOString(), id]
    );
    this.audit('تفعيل عقد موظف', id, { signedDate: signedDate || localDateString() });
    return this.requireContract(actor, id);
  }

  public renewContract(id: string, input: ContractRenewalDTO): EmployeeContract {
    this.guardWrites();
    const actor = this.require('hr.contracts.manage');
    const existing = this.requireContract(actor, id);
    if (existing.status !== 'ACTIVE') throw new Error('يمكن تجديد العقد النشط فقط.');
    assertDate(input.endDate, 'تاريخ نهاية التجديد');
    const currentEnd = existing.endDate || existing.startDate;
    if (input.endDate <= currentEnd) {
      throw new Error('تاريخ نهاية التجديد يجب أن يكون بعد نهاية العقد الحالي.');
    }
    if (input.salary !== undefined && (!Number.isFinite(input.salary) || input.salary < 0)) {
      throw new Error('قيمة الراتب يجب أن تكون رقماً غير سالب.');
    }
    this.assertNoActiveOverlap(existing.employeeId, existing.startDate, input.endDate, existing.id);

    this.db.run(
      `UPDATE employee_contracts SET
         end_date = ?, salary = COALESCE(?, salary),
         notes = COALESCE(?, notes), updated_at = ?
       WHERE id = ?`,
      [input.endDate, input.salary ?? null, input.notes?.trim() || null, new Date().toISOString(), id]
    );
    this.audit('تجديد عقد موظف', id, { previousEndDate: currentEnd, endDate: input.endDate, salary: input.salary });
    return this.requireContract(actor, id);
  }

  public terminateContract(id: string, reason: string): EmployeeContract {
    this.guardWrites();
    const actor = this.require('hr.contracts.terminate');
    const existing = this.requireContract(actor, id);
    if (existing.status !== 'ACTIVE') throw new Error('يمكن إنهاء العقد النشط فقط.');
    if (!reason?.trim()) throw new Error('سبب إنهاء العقد مطلوب.');

    this.db.run(
      `UPDATE employee_contracts SET
         status = 'TERMINATED', terminated_at = ?, termination_reason = ?, updated_at = ?
       WHERE id = ?`,
      [localDateString(), reason.trim(), new Date().toISOString(), id]
    );
    this.audit('إنهاء عقد موظف', id, { reason: reason.trim() });
    return this.requireContract(actor, id);
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
