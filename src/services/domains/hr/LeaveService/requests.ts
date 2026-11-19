import { v4 as uuidv4 } from 'uuid';
import { PermissionService } from '../../auth/PermissionService';
import type { User } from '../../../../types/auth/identity';
import type { CreateLeaveRequestDTO, EmployeeLeaveRequest } from '../../../../types/hr/leave';
import type { LeaveServiceDeps } from './types';
import { assertDate, LEAVE_TYPES } from './utils';
import { employeeDataScope } from './access';
import {
  assertAnnualBalance,
  assertTypeLimits,
} from './balanceRules';
import {
  assertEmploymentPeriod,
  assertNoOverlap,
  assertPayrollPeriodsEditable,
  getChargeableDays,
} from './requestQueries';
import { applyApprovedLeaveAttendance, restoreLeaveAttendance } from './attendanceBridge';

export function queryRequest(
  deps: LeaveServiceDeps,
  actor: User,
  id: string
): EmployeeLeaveRequest | null {
  const { db } = deps;
  const scope = employeeDataScope(deps, actor);
  return db.query<EmployeeLeaveRequest>(
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

export function requireRequestExists(
  deps: LeaveServiceDeps,
  actor: User,
  id: string
): EmployeeLeaveRequest {
  const request = queryRequest(deps, actor, id);
  if (!request) throw new Error('طلب الإجازة غير موجود أو ليس لديك صلاحية الوصول إليه.');
  return request;
}

export function requestLeave(
  deps: LeaveServiceDeps,
  actor: User,
  input: CreateLeaveRequestDTO
): EmployeeLeaveRequest {
  const { db, branchAccess, departmentAccess } = deps;
  if (!input.employeeId) throw new Error('يجب اختيار الموظف.');
  assertDate(input.startDate, 'تاريخ البداية');
  assertDate(input.endDate, 'تاريخ النهاية');
  if (input.endDate < input.startDate) throw new Error('تاريخ النهاية يجب أن يكون بعد تاريخ البداية.');

  const leaveType = input.leaveType || 'ANNUAL';
  if (!LEAVE_TYPES.includes(leaveType)) throw new Error('نوع الإجازة غير صالح.');

  const employee = db.query<{ branchId: string | null; isActive: number | null }>(
    `SELECT branch_id AS branchId, is_active AS isActive FROM employees WHERE id = ?`,
    [input.employeeId]
  )[0];
  if (!employee) throw new Error('الموظف المحدد غير موجود.');
  if (employee.isActive === 0) throw new Error('لا يمكن تسجيل إجازة لموظف غير نشط.');
  if (!employee.branchId) throw new Error('الموظف غير مرتبط بفرع.');
  branchAccess.requireBranchAccess(employee.branchId, actor);
  departmentAccess.requireEmployeeAccess(input.employeeId, actor);
  assertEmploymentPeriod(db, input.employeeId, input.startDate, input.endDate);

  const days = getChargeableDays(db, input.employeeId, employee.branchId, input.startDate, input.endDate);
  if (!days) throw new Error('الفترة المحددة لا تتضمن أيام دوام بعد استثناء العطلات وأيام الراحة المجدولة.');
  assertNoOverlap(db, input.employeeId, input.startDate, input.endDate);
  assertTypeLimits(db, input.employeeId, employee.branchId, leaveType, input.startDate, input.endDate);
  if (leaveType === 'ANNUAL') {
    assertAnnualBalance(db, input.employeeId, employee.branchId, input.startDate, input.endDate, actor.id);
  }

  const id = `leave_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.executeFinancialTransaction((txnDb) => {
    txnDb.run(
      `INSERT INTO employee_leave_requests (
         id, employee_id, branch_id, leave_type, start_date, end_date, days, reason,
         status, requested_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [
        id, input.employeeId, employee.branchId, leaveType, input.startDate, input.endDate,
        days, input.reason?.trim() || null, actor.id, new Date().toISOString(), new Date().toISOString(),
      ]
    );
    txnDb.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, 'طلب إجازة', 'HR', ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
        JSON.stringify({ employeeId: input.employeeId, leaveType, startDate: input.startDate, endDate: input.endDate, days }),
      ]
    );
  });

  return requireRequestExists(deps, actor, id);
}

export function decide(
  deps: LeaveServiceDeps,
  actor: User,
  id: string,
  decision: 'APPROVED' | 'REJECTED',
  note?: string
): EmployeeLeaveRequest {
  const { db } = deps;
  const request = requireRequestExists(deps, actor, id);
  if (request.status !== 'PENDING') throw new Error('لا يمكن البت في طلب ليس قيد الانتظار.');
  assertPayrollPeriodsEditable(db, request);
  if (decision === 'APPROVED') {
    assertEmploymentPeriod(db, request.employeeId, request.startDate, request.endDate);
    assertNoOverlap(db, request.employeeId, request.startDate, request.endDate, request.id);
    assertTypeLimits(
      db, request.employeeId, request.branchId, request.leaveType, request.startDate, request.endDate, request.id
    );
    if (request.leaveType === 'ANNUAL') {
      assertAnnualBalance(
        db, request.employeeId, request.branchId, request.startDate, request.endDate, actor.id, request.id
      );
    }
  }
  db.executeFinancialTransaction(() => {
    if (decision === 'APPROVED') applyApprovedLeaveAttendance(db, request, actor);
    db.run(
      `UPDATE employee_leave_requests
       SET status = ?, days = ?, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ?
       WHERE id = ?`,
      [
        decision,
        getChargeableDays(db, request.employeeId, request.branchId, request.startDate, request.endDate),
        actor.id,
        new Date().toISOString(),
        note?.trim() || null,
        new Date().toISOString(),
        id,
      ]
    );
    db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName,
        decision === 'APPROVED' ? 'اعتماد إجازة' : 'رفض إجازة', id,
        JSON.stringify({ status: request.status }), JSON.stringify({ status: decision, note: note || null }),
      ]
    );
  });
  return requireRequestExists(deps, actor, id);
}

export function cancel(
  deps: LeaveServiceDeps,
  actor: User,
  id: string,
  note?: string
): EmployeeLeaveRequest {
  const { db } = deps;
  const request = requireRequestExists(deps, actor, id);
  assertPayrollPeriodsEditable(db, request);
  if (request.status === 'CANCELLED' || request.status === 'REJECTED') {
    throw new Error('الطلب غير قابل للإلغاء في حالته الحالية.');
  }
  const canManage = PermissionService.can(actor, 'hr.leave.approve');
  const isRequester = request.requestedBy === actor.id;
  if (!canManage && !isRequester) {
    throw new Error('ليس لديك صلاحية إلغاء هذا الطلب.');
  }
  db.executeFinancialTransaction(() => {
    if (request.status === 'APPROVED') restoreLeaveAttendance(db, request.id, request.employeeId, actor);
    db.run(
      `UPDATE employee_leave_requests
       SET status = 'CANCELLED', decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ?
       WHERE id = ?`,
      [actor.id, new Date().toISOString(), note?.trim() || null, new Date().toISOString(), id]
    );
    db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
       VALUES (?, ?, ?, 'إلغاء إجازة', 'HR', ?, ?, '{"status":"CANCELLED"}')`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ status: request.status })]
    );
  });
  return requireRequestExists(deps, actor, id);
}
