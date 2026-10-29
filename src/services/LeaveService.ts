import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { ModuleRegistryService } from './ModuleRegistryService';
import type { User } from '../types/identity';
import type {
  CreateLeaveRequestDTO,
  EmployeeLeaveRequest,
  LeaveFilters,
  LeaveStatus,
  LeaveSummary,
  LeaveType,
} from '../types/hrLeave';

const LEAVE_TYPES: LeaveType[] = ['ANNUAL', 'SICK', 'UNPAID', 'OTHER'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string, label: string): void {
  if (!DATE_PATTERN.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD.`);
  }
}

function inclusiveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

export class LeaveService {
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

  private queryRequest(actor: User, id: string): EmployeeLeaveRequest | null {
    const scope = this.branchAccess.sqlScope('l.branch_id', undefined, actor);
    return this.db.query<EmployeeLeaveRequest>(
      `SELECT l.*, e.name AS employee_name, b.name AS branch_name,
              ru.full_name AS requester_name, du.full_name AS decider_name
       FROM employee_leave_requests l
       JOIN employees e ON e.id = l.employee_id
       LEFT JOIN branches b ON b.id = l.branch_id
       LEFT JOIN users ru ON ru.id = l.requested_by
       LEFT JOIN users du ON du.id = l.decided_by
       WHERE l.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    )[0] ?? null;
  }

  private requireRequestExists(actor: User, id: string): EmployeeLeaveRequest {
    const request = this.queryRequest(actor, id);
    if (!request) throw new Error('طلب الإجازة غير موجود أو ليس لديك صلاحية الوصول إليه.');
    return request;
  }

  private assertNoOverlap(
    employeeId: string,
    startDate: string,
    endDate: string,
    excludeId?: string
  ): void {
    const overlap = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM employee_leave_requests
       WHERE employee_id = ?
         AND status IN ('PENDING', 'APPROVED')
         AND start_date <= ? AND end_date >= ?
         ${excludeId ? 'AND id != ?' : ''}`,
      excludeId
        ? [employeeId, endDate, startDate, excludeId]
        : [employeeId, endDate, startDate]
    )[0]?.count ?? 0;
    if (Number(overlap) > 0) {
      throw new Error('يوجد طلب إجازة آخر متداخل مع هذه الفترة.');
    }
  }

  public getRequests(filters: LeaveFilters = {}): EmployeeLeaveRequest[] {
    const actor = this.require('hr.leave.view');
    const scope = this.branchAccess.sqlScope('l.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string | number> = [...scope.params];

    if (filters.status && filters.status !== 'ALL') {
      conditions.push('l.status = ?');
      params.push(filters.status);
    }
    if (filters.type && filters.type !== 'ALL') {
      conditions.push('l.leave_type = ?');
      params.push(filters.type);
    }
    if (filters.employeeId) {
      conditions.push('l.employee_id = ?');
      params.push(filters.employeeId);
    }
    if (filters.from) {
      assertDate(filters.from, 'تاريخ البداية');
      conditions.push('l.end_date >= ?');
      params.push(filters.from);
    }
    if (filters.to) {
      assertDate(filters.to, 'تاريخ النهاية');
      conditions.push('l.start_date <= ?');
      params.push(filters.to);
    }

    return this.db.query<EmployeeLeaveRequest>(
      `SELECT l.*, e.name AS employee_name, b.name AS branch_name,
              ru.full_name AS requester_name, du.full_name AS decider_name
       FROM employee_leave_requests l
       JOIN employees e ON e.id = l.employee_id
       LEFT JOIN branches b ON b.id = l.branch_id
       LEFT JOIN users ru ON ru.id = l.requested_by
       LEFT JOIN users du ON du.id = l.decided_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY l.start_date DESC, l.created_at DESC`,
      params
    );
  }

  public getRequest(id: string): EmployeeLeaveRequest {
    const actor = this.require('hr.leave.view');
    return this.requireRequestExists(actor, id);
  }

  public requestLeave(input: CreateLeaveRequestDTO): EmployeeLeaveRequest {
    this.guardWrites();
    const actor = this.require('hr.leave.request');
    if (!input.employeeId) throw new Error('يجب اختيار الموظف.');
    assertDate(input.startDate, 'تاريخ البداية');
    assertDate(input.endDate, 'تاريخ النهاية');
    if (input.endDate < input.startDate) throw new Error('تاريخ النهاية يجب أن يكون بعد تاريخ البداية.');

    const leaveType = input.leaveType || 'ANNUAL';
    if (!LEAVE_TYPES.includes(leaveType)) throw new Error('نوع الإجازة غير صالح.');

    const employee = this.db.query<{ branchId: string | null; isActive: number | null }>(
      `SELECT branch_id AS branchId, is_active AS isActive FROM employees WHERE id = ?`,
      [input.employeeId]
    )[0];
    if (!employee) throw new Error('الموظف المحدد غير موجود.');
    if (employee.isActive === 0) throw new Error('لا يمكن تسجيل إجازة لموظف غير نشط.');
    if (!employee.branchId) throw new Error('الموظف غير مرتبط بفرع.');
    this.branchAccess.requireBranchAccess(employee.branchId, actor);

    const days = inclusiveDays(input.startDate, input.endDate);
    this.assertNoOverlap(input.employeeId, input.startDate, input.endDate);

    const id = `leave_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO employee_leave_requests (
           id, employee_id, branch_id, leave_type, start_date, end_date, days, reason,
           status, requested_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
        [
          id, input.employeeId, employee.branchId, leaveType, input.startDate, input.endDate,
          days, input.reason?.trim() || null, actor.id, new Date().toISOString(), new Date().toISOString(),
        ]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'طلب إجازة', 'HR', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
          JSON.stringify({ employeeId: input.employeeId, leaveType, startDate: input.startDate, endDate: input.endDate, days }),
        ]
      );
    });

    return this.requireRequestExists(actor, id);
  }

  public decide(id: string, decision: 'APPROVED' | 'REJECTED', note?: string): EmployeeLeaveRequest {
    this.guardWrites();
    const actor = this.require('hr.leave.approve');
    const request = this.requireRequestExists(actor, id);
    if (request.status !== 'PENDING') throw new Error('لا يمكن البت في طلب ليس قيد الانتظار.');
    if (decision === 'APPROVED') {
      this.assertNoOverlap(request.employeeId, request.startDate, request.endDate, request.id);
    }
    this.db.run(
      `UPDATE employee_leave_requests
       SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ?
       WHERE id = ?`,
      [decision, actor.id, new Date().toISOString(), note?.trim() || null, new Date().toISOString(), id]
    );
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName,
        decision === 'APPROVED' ? 'اعتماد إجازة' : 'رفض إجازة', id,
        JSON.stringify({ status: request.status }), JSON.stringify({ status: decision, note: note || null }),
      ]
    );
    return this.requireRequestExists(actor, id);
  }

  public cancel(id: string, note?: string): EmployeeLeaveRequest {
    this.guardWrites();
    const actor = AuthService.requireAuth();
    const request = this.requireRequestExists(actor, id);
    if (request.status === 'CANCELLED' || request.status === 'REJECTED') {
      throw new Error('الطلب غير قابل للإلغاء في حالته الحالية.');
    }
    const canManage = PermissionService.can(actor, 'hr.leave.approve');
    const isRequester = request.requestedBy === actor.id;
    if (!canManage && !isRequester) {
      throw new Error('ليس لديك صلاحية إلغاء هذا الطلب.');
    }
    this.db.run(
      `UPDATE employee_leave_requests
       SET status = 'CANCELLED', decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ?
       WHERE id = ?`,
      [actor.id, new Date().toISOString(), note?.trim() || null, new Date().toISOString(), id]
    );
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
       VALUES (?, ?, ?, 'إلغاء إجازة', 'HR', ?, ?, '{"status":"CANCELLED"}')`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ status: request.status })]
    );
    return this.requireRequestExists(actor, id);
  }

  public getSummary(year?: number): LeaveSummary {
    const actor = this.require('hr.leave.view');
    const targetYear = year ?? new Date().getFullYear();
    if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
      throw new Error('السنة غير صالحة.');
    }
    const scope = this.branchAccess.sqlScope('l.branch_id', undefined, actor);
    const rows = this.db.query<{ status: LeaveStatus; leaveType: LeaveType; days: number }>(
      `SELECT status, leave_type AS leaveType, days
       FROM employee_leave_requests l
       WHERE ${scope.clause} AND l.start_date >= ? AND l.start_date <= ?`,
      [...scope.params, `${targetYear}-01-01`, `${targetYear}-12-31`]
    );
    const summary: LeaveSummary = {
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      approvedDays: 0,
      daysByType: { ANNUAL: 0, SICK: 0, UNPAID: 0, OTHER: 0 },
    };
    for (const row of rows) {
      if (row.status === 'PENDING') summary.pending += 1;
      if (row.status === 'APPROVED') {
        summary.approved += 1;
        summary.approvedDays += Number(row.days);
        summary.daysByType[row.leaveType] += Number(row.days);
      }
      if (row.status === 'REJECTED') summary.rejected += 1;
      if (row.status === 'CANCELLED') summary.cancelled += 1;
    }
    return summary;
  }
}
