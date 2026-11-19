import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { AttendanceTimeService } from '../../hr/AttendanceTimeService';
import type { ShiftServiceContext } from './context';
import { durationMinutes, localNow, timeMinutes } from './helpers';
import type {
  OperationEmployee,
  OperationShiftDetail,
  OperationShiftHandover,
  OperationShiftInstance,
  OperationShiftStaff,
  OperationStaffRole,
  OperationStaffStatus,
} from './types';

function assertEmployeeInBranch(ctx: ShiftServiceContext, employeeId: string, branchId: string): OperationEmployee {
  const employee = ctx.db.query<OperationEmployee>(
    `SELECT id, branch_id AS branchId, code, name, role, status FROM employees
     WHERE id = ? AND status != 'SUSPENDED'`,
    [employeeId]
  )[0];
  if (!employee) throw new Error('الموظف غير موجود أو موقوف.');
  if (employee.branchId !== branchId) throw new Error('الموظف لا يتبع فرع وردية التشغيل.');
  return employee;
}

function insertPeriod(
  ctx: ShiftServiceContext,
  employeeId: string,
  operationShiftId: string,
  businessDate: string,
  checkInAt: string,
  recordedBy: string,
  source = 'OPERATIONS_SHIFT'
): string {
  const id = `attperiod_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
  ctx.db.run(
    `INSERT INTO employee_attendance_periods
       (id, employee_id, operation_shift_id, attendance_date, check_in_at, status, source, recorded_by)
     VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    [id, employeeId, operationShiftId, businessDate, checkInAt, source, recordedBy]
  );
  return id;
}

export function openShift(ctx: ShiftServiceContext, id: string, input: {
  supervisorId?: string | null;
  employeeIds?: string[];
  notes?: string;
} = {}): OperationShiftDetail {
  const actor = ctx.requireManage();
  const shift = ctx.getInstance(id);
  if (shift.status !== 'PLANNED' && shift.status !== 'MISSED') {
    throw new Error('لا يمكن فتح وردية إلا إذا كانت مخططة أو فائتة.');
  }
  const alreadyOpen = ctx.db.query<{ id: string }>(
    `SELECT id FROM operation_shifts
     WHERE definition_id = ? AND status IN ('OPEN', 'HANDOVER_PENDING') LIMIT 1`,
    [shift.definitionId]
  )[0];
  if (alreadyOpen) throw new Error('توجد وردية مفتوحة بالفعل لنفس التعريف. أغلقها أو سلّمها أولاً.');
  const supervisorId = input.supervisorId || shift.supervisorId || null;
  if (supervisorId) assertEmployeeInBranch(ctx, supervisorId, shift.branchId);

  const now = localNow();
  const definition = ctx.db.query<any>(
    `SELECT start_time AS startTime, grace_minutes AS graceMinutes
     FROM attendance_shifts WHERE id = ?`,
    [shift.definitionId]
  )[0];
  const lateMinutes = Math.max(0, timeMinutes(now.slice(11, 16))
    - timeMinutes(definition.startTime) - Number(definition.graceMinutes || 0));

  const chosen = new Map<string, OperationStaffRole>();
  for (const staff of ctx.db.query<{ employeeId: string; role: OperationStaffRole }>(
    `SELECT employee_id AS employeeId, role FROM operation_shift_staff
     WHERE operation_shift_id = ? AND status NOT IN ('ABSENT', 'LEAVE')`,
    [id]
  )) chosen.set(staff.employeeId, staff.role);
  for (const assignment of ctx.currentAssignments(shift.definitionId, shift.businessDate)) {
    if (!chosen.has(assignment.employeeId)) chosen.set(assignment.employeeId, assignment.role);
  }
  for (const employeeId of input.employeeIds || []) chosen.set(employeeId, chosen.get(employeeId) || 'STAFF');
  if (supervisorId) chosen.set(supervisorId, 'SUPERVISOR');
  for (const employeeId of [...chosen.keys()]) {
    assertEmployeeInBranch(ctx, employeeId, shift.branchId);
    const rosterRow = ctx.db.query<{ status: OperationStaffStatus; checkInAt: string | null }>(
      `SELECT status, check_in_at AS checkInAt FROM operation_shift_staff
       WHERE operation_shift_id = ? AND employee_id = ?`,
      [id, employeeId]
    )[0];
    if (rosterRow && ['ABSENT', 'LEAVE'].includes(rosterRow.status)) {
      chosen.delete(employeeId);
      continue;
    }
    ctx.assertEmployeeAvailable(employeeId, shift);
  }

  ctx.db.executeTransaction((db) => {
    db.run(
      `UPDATE operation_shifts SET status = 'OPEN', supervisor_id = ?, opened_by = ?,
         opened_at = ?, opening_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [supervisorId, actor.id, now, input.notes?.trim() || null, id]
    );
    for (const [employeeId, role] of chosen) {
      const existing = db.query<{ id: string; checkInAt: string | null }>(
        `SELECT id, check_in_at AS checkInAt FROM operation_shift_staff
         WHERE operation_shift_id = ? AND employee_id = ?`,
        [id, employeeId]
      )[0];
      if (!existing) {
        db.run(
          `INSERT INTO operation_shift_staff
             (id, operation_shift_id, employee_id, role, status, check_in_at, late_minutes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [`opstaff_${uuidv4().replace(/-/g, '').slice(0, 14)}`, id, employeeId, role,
            lateMinutes > 0 ? 'LATE' : 'PRESENT', now, lateMinutes]
        );
      } else if (!existing.checkInAt) {
        db.run(
          `UPDATE operation_shift_staff SET role = ?, status = ?, check_in_at = ?,
             late_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [role, lateMinutes > 0 ? 'LATE' : 'PRESENT', now, lateMinutes, existing.id]
        );
      }
      if (!existing || !existing.checkInAt) {
        const openPeriod = db.query<{ id: string }>(
          'SELECT id FROM employee_attendance_periods WHERE employee_id = ? AND check_out_at IS NULL',
          [employeeId]
        )[0];
        if (openPeriod) throw new Error('يوجد سجل حضور مفتوح لهذا الموظف؛ سجّل الانصراف أولاً.');
        insertPeriod(ctx, employeeId, id, shift.businessDate, now, actor.id);
      }
    }
  });
  for (const employeeId of chosen.keys()) {
    AttendanceTimeService.syncDailySummary(employeeId, shift.businessDate, actor.id);
  }
  ctx.audit('فتح وردية تشغيل', id, { supervisorId, staff: chosen.size, notes: input.notes || null });
  return ctx.getShiftDetail(id);
}

export function addStaff(ctx: ShiftServiceContext, operationShiftId: string, employeeId: string, role: OperationStaffRole = 'STAFF'): void {
  const _actor = ctx.requireManage();
  const shift = ctx.getInstance(operationShiftId);
  if (!['OPEN', 'HANDOVER_PENDING'].includes(shift.status)) {
    throw new Error('لا يمكن إضافة موظفين إلا لوردية مفتوحة.');
  }
  assertEmployeeInBranch(ctx, employeeId, shift.branchId);
  if (ctx.db.query(
    'SELECT id FROM operation_shift_staff WHERE operation_shift_id = ? AND employee_id = ?',
    [operationShiftId, employeeId]
  ).length) throw new Error('الموظف مسجل بالفعل في هذه الوردية.');
  ctx.db.run(
    `INSERT INTO operation_shift_staff
       (id, operation_shift_id, employee_id, role, status)
     VALUES (?, ?, ?, ?, 'PRESENT')`,
    [`opstaff_${uuidv4().replace(/-/g, '').slice(0, 14)}`, operationShiftId, employeeId, role]
  );
  ctx.audit('إضافة موظف إلى وردية تشغيل', operationShiftId, { employeeId, role });
}

export function replaceAbsentStaff(
  ctx: ShiftServiceContext,
  operationShiftId: string,
  absentEmployeeId: string,
  replacementEmployeeId: string,
  notes = ''
): void {
  const actor = ctx.requireManage();
  const shift = ctx.getInstance(operationShiftId);
  if (!['PLANNED', 'MISSED'].includes(shift.status)) {
    throw new Error('يمكن تعيين البديل قبل فتح الوردية فقط.');
  }
  if (absentEmployeeId === replacementEmployeeId) throw new Error('اختر موظفاً بديلاً مختلفاً.');
  const absent = ctx.db.query<{ id: string; checkInAt: string | null }>(
    `SELECT id, check_in_at AS checkInAt FROM operation_shift_staff
     WHERE operation_shift_id = ? AND employee_id = ?`,
    [operationShiftId, absentEmployeeId]
  )[0];
  if (!absent) throw new Error('الموظف الغائب غير مجدول في هذه الوردية.');
  if (absent.checkInAt) throw new Error('لا يمكن استبدال موظف بدأ العمل بالفعل.');
  assertEmployeeInBranch(ctx, replacementEmployeeId, shift.branchId);
  if (ctx.db.query(
    'SELECT id FROM operation_shift_staff WHERE operation_shift_id = ? AND employee_id = ?',
    [operationShiftId, replacementEmployeeId]
  ).length) throw new Error('الموظف البديل مسجل بالفعل في الوردية.');
  ctx.assertEmployeeAvailable(replacementEmployeeId, shift);
  const attendance = ctx.db.query<{ id: string; status: string; checkInAt: string | null }>(
    `SELECT id, status, check_in_at AS checkInAt FROM attendance
     WHERE employee_id = ? AND date = ?`,
    [absentEmployeeId, shift.businessDate]
  )[0];
  if (attendance?.checkInAt || ['PRESENT', 'LATE'].includes(attendance?.status || '')) {
    throw new Error('يوجد حضور فعلي لهذا اليوم؛ لا يمكن تسجيل الموظف غائباً.');
  }
  if (attendance?.status === 'LEAVE') throw new Error('الموظف مسجل بإجازة في هذا اليوم.');
  const payroll = ctx.db.query<{ status: string }>(
    'SELECT status FROM payroll_runs WHERE branch_id = ? AND period = ?',
    [shift.branchId, shift.businessDate.slice(0, 7)]
  )[0];
  if (payroll && payroll.status !== 'DRAFT') {
    throw new Error('الفترة مرتبطة بدورة رواتب معتمدة؛ لا يمكن تسجيل الغياب.');
  }
  ctx.db.executeTransaction((db) => {
    db.run(
      `UPDATE operation_shift_staff SET status = 'ABSENT', notes = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [notes.trim() || 'غياب - تم تعيين بديل', absent.id]
    );
    if (attendance) {
      db.run(
        `UPDATE attendance SET status = 'ABSENT', notes = ?, source = 'OPERATIONS_SHIFT',
           recorded_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [notes.trim() || 'غياب - تم تعيين بديل', actor.id, attendance.id]
      );
    } else {
      db.run(
        `INSERT INTO attendance (id, employee_id, date, status, notes, source, recorded_by)
         VALUES (?, ?, ?, 'ABSENT', ?, 'OPERATIONS_SHIFT', ?)`,
        [`att_${uuidv4().replace(/-/g, '').slice(0, 16)}`, absentEmployeeId,
          shift.businessDate, notes.trim() || 'غياب - تم تعيين بديل', actor.id]
      );
    }
    db.run(
      `INSERT INTO operation_shift_staff (id, operation_shift_id, employee_id, role, status, notes)
       VALUES (?, ?, ?, 'STAFF', 'PRESENT', ?)`,
      [`opstaff_${uuidv4().replace(/-/g, '').slice(0, 14)}`, operationShiftId,
        replacementEmployeeId, notes.trim() || 'بديل عن موظف غائب']
    );
  });
  ctx.audit('تعيين بديل لموظف غائب', operationShiftId, {
    absentEmployeeId, replacementEmployeeId, notes,
  });
}

export function approveShiftOvertime(ctx: ShiftServiceContext, attendancePeriodId: string): void {
  const actor = ctx.requireManage();
  const row = ctx.db.query<any>(
    `SELECT p.id, p.employee_id AS employeeId, p.attendance_date AS attendanceDate,
            p.check_out_at AS checkOutAt, p.overtime_minutes AS overtimeMinutes,
            p.overtime_approved AS overtimeApproved, e.branch_id AS branchId
     FROM employee_attendance_periods p JOIN employees e ON e.id = p.employee_id
     WHERE p.id = ?`,
    [attendancePeriodId]
  )[0];
  if (!row) throw new Error('سجل فترة الحضور غير موجود.');
  ctx.branchAccess.requireBranchAccess(row.branchId, actor);
  if (!row.checkOutAt || Number(row.overtimeMinutes) <= 0) {
    throw new Error('لا توجد ساعات إضافية مكتملة لاعتمادها.');
  }
  if (Number(row.overtimeApproved)) throw new Error('تم اعتماد الإضافي لهذه الفترة بالفعل.');
  const payroll = ctx.db.query<{ status: string }>(
    'SELECT status FROM payroll_runs WHERE branch_id = ? AND period = ?',
    [row.branchId, String(row.attendanceDate).slice(0, 7)]
  )[0];
  if (payroll && payroll.status !== 'DRAFT') {
    throw new Error('الفترة مرتبطة بدورة رواتب معتمدة؛ لا يمكن تعديل الإضافي.');
  }
  ctx.db.run(
    `UPDATE employee_attendance_periods SET overtime_approved = 1,
       overtime_approved_by = ?, overtime_approved_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND overtime_approved = 0`,
    [actor.id, attendancePeriodId]
  );
  AttendanceTimeService.syncDailySummary(row.employeeId, row.attendanceDate, actor.id);
  ctx.audit('اعتماد إضافي فترة حضور وردية', attendancePeriodId, {
    employeeId: row.employeeId, overtimeMinutes: row.overtimeMinutes,
  });
}

export function recordStaffPresence(ctx: ShiftServiceContext, operationShiftId: string, employeeId: string, direction: 'IN' | 'OUT'): OperationShiftStaff {
  const actor = ctx.requireManage();
  const shift = ctx.getInstance(operationShiftId);
  if (shift.status !== 'OPEN') throw new Error('تسجيل الحضور متاح فقط للوردية المفتوحة.');
  const staff = ctx.db.query<any>(
    `SELECT st.*, d.start_time AS startTime, d.end_time AS endTime,
            d.grace_minutes AS graceMinutes, d.overtime_after_minutes AS overtimeAfterMinutes
     FROM operation_shift_staff st
     JOIN operation_shifts os ON os.id = st.operation_shift_id
     JOIN attendance_shifts d ON d.id = os.definition_id
     WHERE st.operation_shift_id = ? AND st.employee_id = ?`,
    [operationShiftId, employeeId]
  )[0];
  if (!staff) throw new Error('الموظف غير مسجل في وردية التشغيل.');
  const now = localNow();
  if (direction === 'IN') {
    if (staff.checkInAt) throw new Error('تم تسجيل دخول هذا الموظف بالفعل.');
    const lateMinutes = Math.max(0, timeMinutes(now.slice(11, 16))
      - timeMinutes(staff.startTime) - Number(staff.graceMinutes || 0));
    ctx.db.executeTransaction((db) => {
      db.run(
        `UPDATE operation_shift_staff SET check_in_at = ?, late_minutes = ?,
           status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [now, lateMinutes, lateMinutes > 0 ? 'LATE' : 'PRESENT', staff.id]
      );
      const openPeriod = db.query<{ id: string }>(
        'SELECT id FROM employee_attendance_periods WHERE employee_id = ? AND check_out_at IS NULL',
        [employeeId]
      )[0];
      if (openPeriod) throw new Error('يوجد سجل حضور مفتوح لهذا الموظف؛ سجّل الانصراف أولاً.');
      insertPeriod(ctx, employeeId, operationShiftId, shift.businessDate, now, actor.id);
    });
  } else {
    if (!staff.checkInAt) throw new Error('يجب تسجيل الدخول قبل الانصراف.');
    if (staff.checkOutAt) throw new Error('تم تسجيل انصراف هذا الموظف بالفعل.');
    const period = ctx.db.query<any>(
      `SELECT * FROM employee_attendance_periods
       WHERE employee_id = ? AND operation_shift_id = ? AND check_out_at IS NULL
       ORDER BY check_in_at DESC LIMIT 1`,
      [employeeId, operationShiftId]
    )[0];
    const worked = durationMinutes(period?.checkInAt || staff.checkInAt, now);
    const overtime = Math.max(0, timeMinutes(now.slice(11, 16))
      - timeMinutes(staff.endTime) - Number(staff.overtimeAfterMinutes || 0));
    ctx.db.executeTransaction((db) => {
      db.run(
        `UPDATE operation_shift_staff SET check_out_at = ?, overtime_minutes = ?,
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [now, overtime, staff.id]
      );
      if (period) {
        db.run(
          `UPDATE employee_attendance_periods SET check_out_at = ?, worked_minutes = ?,
             overtime_minutes = ?, status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [now, worked, overtime, period.id]
        );
      }
    });
  }
  AttendanceTimeService.syncDailySummary(employeeId, shift.businessDate, actor.id);
  ctx.audit(direction === 'IN' ? 'تسجيل حضور في وردية تشغيل' : 'تسجيل انصراف من وردية تشغيل',
    operationShiftId, { employeeId });
  return ctx.getShiftDetail(operationShiftId).staff
    .find((row) => row.employeeId === employeeId)!;
}

export function submitHandover(ctx: ShiftServiceContext, operationShiftId: string, input: {
  expectedCash?: number;
  actualCash: number;
  cashDelivered?: number;
  pendingOrders?: string[];
  inventoryStatus?: string;
  equipmentStatus?: string;
  notes?: string;
  nextStaffIds?: string[];
}): OperationShiftHandover {
  const actor = ctx.requireManage();
  const shift = ctx.getInstance(operationShiftId);
  if (!['OPEN', 'HANDOVER_PENDING'].includes(shift.status)) {
    throw new Error('لا يمكن تسليم وردية غير مفتوحة.');
  }
  const cash = ctx.getCashSummary(operationShiftId);
  if (cash.openShifts > 0) {
    throw new Error('توجد ورديات كاشير مفتوحة مرتبطة بالوردية. أغلقها قبل تسليم التشغيل.');
  }
  if (!Number.isFinite(input.actualCash) || input.actualCash < 0) {
    throw new Error('الرصيد النقدي الفعلي يجب أن يكون رقماً غير سالب.');
  }
  const expected = Number.isFinite(input.expectedCash) ? Number(input.expectedCash) : cash.expected;
  const delivered = Number.isFinite(input.cashDelivered) ? Number(input.cashDelivered) : 0;
  if (delivered < 0) throw new Error('المبلغ المسلّم للخزينة يجب أن يكون رقماً غير سالب.');
  const difference = Number((Number(input.actualCash) - expected).toFixed(2));
  const handoverId = `opshand_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
  const nextStaff = [...new Set(input.nextStaffIds || [])];
  for (const employeeId of nextStaff) assertEmployeeInBranch(ctx, employeeId, shift.branchId);

  ctx.db.executeTransaction((db) => {
    db.run('DELETE FROM operation_shift_handovers WHERE operation_shift_id = ?', [operationShiftId]);
    db.run(
      `INSERT INTO operation_shift_handovers
         (id, operation_shift_id, expected_cash, actual_cash, cash_difference, cash_delivered,
          pending_orders_json, inventory_status, equipment_status, notes, next_staff_json,
          status, submitted_by, submitted_at)
       VALUES (?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [handoverId, operationShiftId, expected, input.actualCash, difference, delivered,
        JSON.stringify(input.pendingOrders || []), input.inventoryStatus?.trim() || null,
        input.equipmentStatus?.trim() || null, input.notes?.trim() || null,
        JSON.stringify(nextStaff), actor.id, localNow()]
    );
    db.run(
      `UPDATE operation_shifts SET status = 'HANDOVER_PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [operationShiftId]
    );
  });
  ctx.audit('تسليم وردية تشغيل', operationShiftId, {
    expected, actual: input.actualCash, difference, delivered, nextStaff,
  });
  return ctx.getShiftDetail(operationShiftId).handover!;
}

export function confirmHandover(ctx: ShiftServiceContext, operationShiftId: string, notes = ''): OperationShiftDetail {
  const actor = ctx.requireManage();
  const shift = ctx.getInstance(operationShiftId);
  const handover = ctx.getShiftDetail(operationShiftId).handover;
  if (!handover) throw new Error('لا يوجد تسليم وردية لاستلامه.');
  if (handover.status === 'RECEIVED') throw new Error('تم استلام الوردية بالفعل.');
  if (!['HANDOVER_PENDING', 'OPEN'].includes(shift.status)) {
    throw new Error('الوردية ليست في حالة تسمح بالاستلام.');
  }
  const now = localNow();
  ctx.db.executeTransaction((db) => {
    db.run(
      `UPDATE operation_shift_handovers SET status = 'RECEIVED', received_by = ?,
         received_at = ?, received_notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE operation_shift_id = ?`,
      [actor.id, now, notes.trim() || null, operationShiftId]
    );
    db.run(
      `UPDATE operation_shift_staff SET check_out_at = COALESCE(check_out_at, ?),
         updated_at = CURRENT_TIMESTAMP WHERE operation_shift_id = ?`,
      [now, operationShiftId]
    );
    db.run(
      `UPDATE employee_attendance_periods SET check_out_at = COALESCE(check_out_at, ?),
         worked_minutes = CASE WHEN check_out_at IS NULL THEN ? ELSE worked_minutes END,
         status = 'CLOSED', updated_at = CURRENT_TIMESTAMP
       WHERE operation_shift_id = ? AND check_out_at IS NULL`,
      [now, Math.max(0, durationMinutes(shift.openedAt || shift.scheduledStart, now)), operationShiftId]
    );
    db.run(
      `UPDATE operation_shifts SET status = 'CLOSED', closed_by = ?, closed_at = ?,
         closing_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [actor.id, now, notes.trim() || handover.notes || null, operationShiftId]
    );
    assignNextShiftStaff(ctx, db, shift, handover.nextStaffIds, now);
  });
  for (const staff of ctx.getShiftDetail(operationShiftId).staff) {
    AttendanceTimeService.syncDailySummary(staff.employeeId, shift.businessDate, actor.id);
  }
  ctx.audit('استلام وردية تشغيل', operationShiftId, { receivedBy: actor.id });
  return ctx.getShiftDetail(operationShiftId);
}

function assignNextShiftStaff(ctx: ShiftServiceContext, db: DatabaseManager, shift: OperationShiftInstance, employeeIds: string[], now: string): void {
  if (!employeeIds.length) return;
  const next = db.query<{ id: string }>(
    `SELECT id FROM operation_shifts
     WHERE branch_id = ? AND definition_id = ? AND scheduled_start > ?
       AND status IN ('PLANNED', 'MISSED')
     ORDER BY scheduled_start LIMIT 1`,
    [shift.branchId, shift.definitionId, shift.scheduledStart]
  )[0];
  if (!next) return;
  for (const employeeId of employeeIds) {
    if (db.query(
      'SELECT id FROM operation_shift_staff WHERE operation_shift_id = ? AND employee_id = ?',
      [next.id, employeeId]
    ).length) continue;
    db.run(
      `INSERT INTO operation_shift_staff (id, operation_shift_id, employee_id, role, status)
       VALUES (?, ?, ?, 'STAFF', 'PRESENT')`,
      [`opstaff_${uuidv4().replace(/-/g, '').slice(0, 14)}`, next.id, employeeId]
    );
  }
  db.run('UPDATE operation_shifts SET updated_at = ? WHERE id = ?', [now, next.id]);
}

export function closeShift(ctx: ShiftServiceContext, operationShiftId: string, notes = ''): OperationShiftDetail {
  const actor = ctx.requireManage();
  const shift = ctx.getInstance(operationShiftId);
  if (shift.status === 'CLOSED') throw new Error('الوردية مغلقة بالفعل.');
  const cash = ctx.getCashSummary(operationShiftId);
  if (cash.openShifts > 0) throw new Error('أغلق ورديات الكاشير المرتبطة قبل إغلاق وردية التشغيل.');
  const handover = ctx.getShiftDetail(operationShiftId).handover;
  if (handover && handover.status !== 'RECEIVED') {
    throw new Error('يجب استلام التسليم الإلكتروني قبل إغلاق الوردية.');
  }
  const now = localNow();
  ctx.db.executeTransaction((db) => {
    db.run(
      `UPDATE operation_shifts SET status = 'CLOSED', closed_by = ?, closed_at = ?,
         closing_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [actor.id, now, notes.trim() || null, operationShiftId]
    );
    db.run(
      `UPDATE operation_shift_staff SET check_out_at = COALESCE(check_out_at, ?),
         updated_at = CURRENT_TIMESTAMP WHERE operation_shift_id = ?`,
      [now, operationShiftId]
    );
    db.run(
      `UPDATE employee_attendance_periods SET check_out_at = COALESCE(check_out_at, ?),
         worked_minutes = CASE WHEN check_out_at IS NULL THEN ? ELSE worked_minutes END,
         status = 'CLOSED', updated_at = CURRENT_TIMESTAMP
       WHERE operation_shift_id = ? AND check_out_at IS NULL`,
      [now, Math.max(0, durationMinutes(shift.openedAt || shift.scheduledStart, now)), operationShiftId]
    );
  });
  for (const staff of ctx.getShiftDetail(operationShiftId).staff) {
    AttendanceTimeService.syncDailySummary(staff.employeeId, shift.businessDate, actor.id);
  }
  ctx.audit('إغلاق وردية تشغيل', operationShiftId, { notes });
  return ctx.getShiftDetail(operationShiftId);
}
