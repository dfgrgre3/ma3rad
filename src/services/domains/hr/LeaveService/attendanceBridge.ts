import { v4 as uuidv4 } from 'uuid';
import type { User } from '../../../../types/auth/identity';
import type { EmployeeLeaveRequest } from '../../../../types/hr/leave';
import type { AttendanceSnapshot, LeaveServiceDeps } from './types';
import { getChargeableDates } from './requestQueries';

type Db = LeaveServiceDeps['db'];

export function attendanceSnapshot(db: Db, employeeId: string, date: string): AttendanceSnapshot | null {
  return db.query<AttendanceSnapshot>(
    `SELECT id, status, check_in_at AS checkInAt, check_out_at AS checkOutAt,
            worked_minutes AS workedMinutes, late_minutes AS lateMinutes,
            early_leave_minutes AS earlyLeaveMinutes, overtime_minutes AS overtimeMinutes,
            break_minutes AS breakMinutes, overtime_approved AS overtimeApproved,
            overtime_approved_by AS overtimeApprovedBy, overtime_approved_at AS overtimeApprovedAt,
            source, notes, recorded_by AS recordedBy
     FROM attendance WHERE employee_id = ? AND date = ?`,
    [employeeId, date]
  )[0] ?? null;
}

export function applyApprovedLeaveAttendance(
  db: Db,
  request: EmployeeLeaveRequest,
  actor: User
): void {
  const dates = getChargeableDates(db, request.employeeId, request.branchId, request.startDate, request.endDate);
  const conflicts = dates.filter((date) => {
    const current = attendanceSnapshot(db, request.employeeId, date);
    return current && (
      current.status !== 'ABSENT' || current.checkInAt || current.checkOutAt || current.source === 'LEAVE'
    );
  });
  if (conflicts.length) {
    throw new Error(`تعذر اعتماد الإجازة لوجود سجلات حضور فعلية في: ${conflicts.join('، ')}. راجع السجلات أولاً.`);
  }

  for (const date of dates) {
    const previous = attendanceSnapshot(db, request.employeeId, date);
    const attendanceId = previous?.id ?? `att_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    if (previous) {
      db.run(
        `UPDATE attendance SET status = 'LEAVE', check_in_at = NULL, check_out_at = NULL,
         worked_minutes = 0, late_minutes = 0, early_leave_minutes = 0, overtime_minutes = 0,
         break_minutes = 0, overtime_approved = 0, overtime_approved_by = NULL,
         overtime_approved_at = NULL, source = 'LEAVE', notes = ?, recorded_by = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [`إجازة معتمدة: ${request.id}`, actor.id, attendanceId]
      );
    } else {
      db.run(
        `INSERT INTO attendance (id, employee_id, date, status, source, notes, recorded_by)
         VALUES (?, ?, ?, 'LEAVE', 'LEAVE', ?, ?)`,
        [attendanceId, request.employeeId, date, `إجازة معتمدة: ${request.id}`, actor.id]
      );
    }
    db.run(
      `INSERT INTO employee_leave_attendance_links
       (id, leave_request_id, attendance_id, previous_json, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [
        `leavelink_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
        request.id,
        attendanceId,
        previous ? JSON.stringify(previous) : null,
        actor.id,
      ]
    );
    db.run(
      `INSERT INTO attendance_audit_log
       (id, attendance_id, employee_id, attendance_date, action, before_json, after_json, actor_id)
       VALUES (?, ?, ?, ?, 'LEAVE_APPROVED', ?, ?, ?)`,
      [
        `attaud_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
        attendanceId,
        request.employeeId,
        date,
        previous ? JSON.stringify(previous) : null,
        JSON.stringify({ status: 'LEAVE', source: 'LEAVE', leaveRequestId: request.id }),
        actor.id,
      ]
    );
  }
}

export function restoreLeaveAttendance(
  db: Db,
  requestId: string,
  employeeId: string,
  actor: User
): void {
  const links = db.query<{ id: string; attendanceId: string; date: string; previousJson: string | null }>(
    `SELECT l.id, l.attendance_id AS attendanceId, a.date, l.previous_json AS previousJson
     FROM employee_leave_attendance_links l
     JOIN attendance a ON a.id = l.attendance_id
     WHERE l.leave_request_id = ? ORDER BY a.date`,
    [requestId]
  );
  for (const link of links) {
    const current = attendanceSnapshot(db, employeeId, link.date);
    if (!current || current.source !== 'LEAVE' || current.status !== 'LEAVE') {
      throw new Error(`تغير سجل الحضور ${link.date} بعد اعتماد الإجازة؛ راجعه قبل الإلغاء.`);
    }
  }
  for (const link of links) {
    const before = link.previousJson ? JSON.parse(link.previousJson) as AttendanceSnapshot : null;
    if (!before) {
      db.run('DELETE FROM attendance WHERE id = ?', [link.attendanceId]);
    } else {
      db.run(
        `UPDATE attendance SET status = ?, check_in_at = ?, check_out_at = ?, worked_minutes = ?,
         late_minutes = ?, early_leave_minutes = ?, overtime_minutes = ?, break_minutes = ?,
         overtime_approved = ?, overtime_approved_by = ?, overtime_approved_at = ?,
         source = ?, notes = ?, recorded_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [
          before.status, before.checkInAt, before.checkOutAt, before.workedMinutes,
          before.lateMinutes, before.earlyLeaveMinutes, before.overtimeMinutes, before.breakMinutes,
          before.overtimeApproved, before.overtimeApprovedBy, before.overtimeApprovedAt,
          before.source, before.notes, before.recordedBy, before.id,
        ]
      );
    }
    db.run('DELETE FROM employee_leave_attendance_links WHERE id = ?', [link.id]);
    db.run(
      `INSERT INTO attendance_audit_log
       (id, attendance_id, employee_id, attendance_date, action, before_json, after_json, actor_id)
       VALUES (?, ?, ?, ?, 'LEAVE_CANCELLED', ?, ?, ?)`,
      [
        `attaud_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
        before?.id ?? null,
        employeeId,
        link.date,
        JSON.stringify({ status: 'LEAVE', source: 'LEAVE', leaveRequestId: requestId }),
        before ? JSON.stringify(before) : null,
        actor.id,
      ]
    );
  }
}
