import { v4 as uuidv4 } from 'uuid';
import type { ShiftServiceContext } from './context';
import { isValidDate } from './helpers';
import type { OperationShiftSwapRequest } from './types';

export function getShiftSwapRequests(ctx: ShiftServiceContext, from?: string, to?: string): OperationShiftSwapRequest[] {
  const actor = ctx.requireView();
  const scope = ctx.branchAccess.sqlScope('rs.branch_id', undefined, actor);
  const conditions = [scope.clause];
  const params: Array<string> = [...scope.params];
  if (from) {
    if (!isValidDate(from)) throw new Error('تاريخ بداية طلبات التبديل غير صالح.');
    conditions.push('rs.business_date >= ?');
    params.push(from);
  }
  if (to) {
    if (!isValidDate(to)) throw new Error('تاريخ نهاية طلبات التبديل غير صالح.');
    conditions.push('rs.business_date <= ?');
    params.push(to);
  }
  return ctx.db.query<OperationShiftSwapRequest>(
    `SELECT r.id, r.requester_employee_id AS requesterEmployeeId,
            requester.name AS requesterEmployeeName,
            r.target_employee_id AS targetEmployeeId, target.name AS targetEmployeeName,
            r.requester_shift_id AS requesterShiftId, rd.name AS requesterShiftName,
            rs.business_date AS requesterShiftDate,
            r.target_shift_id AS targetShiftId, td.name AS targetShiftName,
            ts.business_date AS targetShiftDate, r.status,
            requested.full_name AS requestedByName, r.requested_at AS requestedAt,
            decided.full_name AS decidedByName, r.decided_at AS decidedAt,
            r.decision_notes AS decisionNotes
     FROM operation_shift_swap_requests r
     JOIN operation_shifts rs ON rs.id = r.requester_shift_id
     JOIN operation_shifts ts ON ts.id = r.target_shift_id
     JOIN attendance_shifts rd ON rd.id = rs.definition_id
     JOIN attendance_shifts td ON td.id = ts.definition_id
     JOIN employees requester ON requester.id = r.requester_employee_id
     JOIN employees target ON target.id = r.target_employee_id
     JOIN users requested ON requested.id = r.requested_by
     LEFT JOIN users decided ON decided.id = r.decided_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END, r.requested_at DESC LIMIT 200`,
    params
  );
}

export function requestShiftSwap(ctx: ShiftServiceContext, input: {
  requesterEmployeeId: string;
  targetEmployeeId: string;
  requesterShiftId: string;
  targetShiftId: string;
}): OperationShiftSwapRequest {
  const actor = ctx.requireManage();
  if (input.requesterEmployeeId === input.targetEmployeeId || input.requesterShiftId === input.targetShiftId) {
    throw new Error('اختر موظفين وورديتين مختلفتين لطلب التبديل.');
  }
  const requesterShift = ctx.getInstance(input.requesterShiftId);
  const targetShift = ctx.getInstance(input.targetShiftId);
  if (requesterShift.branchId !== targetShift.branchId) throw new Error('يجب أن تكون الوردية في الفرع نفسه.');
  if (![requesterShift.status, targetShift.status].every((status) => status === 'PLANNED')) {
    throw new Error('يمكن طلب التبديل بين ورديات لم تبدأ فقط.');
  }
  for (const [shiftId, employeeId] of [
    [input.requesterShiftId, input.requesterEmployeeId],
    [input.targetShiftId, input.targetEmployeeId],
  ]) {
    if (!ctx.db.query(
      `SELECT id FROM operation_shift_staff
       WHERE operation_shift_id = ? AND employee_id = ? AND status NOT IN ('ABSENT', 'LEAVE')`,
      [shiftId, employeeId]
    ).length) throw new Error('يجب أن يكون كل موظف مسجلاً في ورديته قبل طلب التبديل.');
  }
  const id = `opsswap_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
  ctx.db.run(
    `INSERT INTO operation_shift_swap_requests
       (id, requester_employee_id, target_employee_id, requester_shift_id, target_shift_id, requested_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.requesterEmployeeId, input.targetEmployeeId,
      input.requesterShiftId, input.targetShiftId, actor.id]
  );
  ctx.audit('طلب تبديل وردية', id, input);
  return getShiftSwapRequests(ctx).find((request) => request.id === id)!;
}

export function decideShiftSwap(ctx: ShiftServiceContext, requestId: string, approve: boolean, notes = ''): void {
  const actor = ctx.requireManage();
  const request = ctx.db.query<any>(
    `SELECT r.*, rs.branch_id AS requesterBranchId, ts.branch_id AS targetBranchId,
            rs.scheduled_start AS requesterStart, rs.scheduled_end AS requesterEnd,
            ts.scheduled_start AS targetStart, ts.scheduled_end AS targetEnd,
            rs.business_date AS requesterDate, ts.business_date AS targetDate
     FROM operation_shift_swap_requests r
     JOIN operation_shifts rs ON rs.id = r.requester_shift_id
     JOIN operation_shifts ts ON ts.id = r.target_shift_id WHERE r.id = ?`,
    [requestId]
  )[0];
  if (!request) throw new Error('طلب تبديل الوردية غير موجود.');
  ctx.branchAccess.requireBranchAccess(request.requesterBranchId, actor);
  if (request.requesterBranchId !== request.targetBranchId) throw new Error('الوردية المستهدفة خارج الفرع.');
  if (request.status !== 'PENDING') throw new Error('تم البت في طلب التبديل سابقاً.');
  if (approve) {
    const requesterTarget = ctx.getInstance(request.targetShiftId);
    const targetTarget = ctx.getInstance(request.requesterShiftId);
    if (requesterTarget.status !== 'PLANNED' || targetTarget.status !== 'PLANNED') {
      throw new Error('لا يمكن اعتماد التبديل بعد بدء إحدى الورديتين.');
    }
    ctx.assertEmployeeAvailable(request.requesterEmployeeId, requesterTarget,
      [request.requesterShiftId, request.targetShiftId]);
    ctx.assertEmployeeAvailable(request.targetEmployeeId, targetTarget,
      [request.requesterShiftId, request.targetShiftId]);
    ctx.db.executeTransaction((db) => {
      db.run(
        `UPDATE operation_shift_staff SET employee_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE operation_shift_id = ? AND employee_id = ?`,
        [request.targetEmployeeId, request.requesterShiftId, request.requesterEmployeeId]
      );
      db.run(
        `UPDATE operation_shift_staff SET employee_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE operation_shift_id = ? AND employee_id = ?`,
        [request.requesterEmployeeId, request.targetShiftId, request.targetEmployeeId]
      );
      db.run(
        `UPDATE operation_shift_swap_requests SET status = 'APPROVED', decided_by = ?,
           decided_at = CURRENT_TIMESTAMP, decision_notes = ? WHERE id = ? AND status = 'PENDING'`,
        [actor.id, notes.trim() || null, requestId]
      );
    });
  } else {
    ctx.db.run(
      `UPDATE operation_shift_swap_requests SET status = 'REJECTED', decided_by = ?,
         decided_at = CURRENT_TIMESTAMP, decision_notes = ? WHERE id = ? AND status = 'PENDING'`,
      [actor.id, notes.trim() || null, requestId]
    );
  }
  ctx.audit(approve ? 'اعتماد تبديل وردية' : 'رفض تبديل وردية', requestId, { notes });
}
