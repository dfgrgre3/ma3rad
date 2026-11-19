import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { AttendanceStatus } from '../EmployeeService';
import type { AttendanceEntry, AttendanceShift, ShiftRow } from './types';
import { durationMinutes, timeMinutes } from './utils';

export function assertPeriodEditable(db: DatabaseManager, branchId: string, date: string): void {
  const run = db.query<{ status: string }>(
    'SELECT status FROM payroll_runs WHERE branch_id = ? AND period = ?',
    [branchId, date.slice(0, 7)]
  )[0];
  if (run && run.status !== 'DRAFT') {
    throw new Error('فترة الحضور مرتبطة بدورة رواتب معتمدة؛ لا يمكن تعديلها.');
  }
}

export function getShift(db: DatabaseManager, employeeId: string, date: string): ShiftRow | undefined {
  const shift = db.query<ShiftRow>(
    `SELECT s.id, s.branch_id AS branchId, s.name, s.start_time AS startTime,
            s.end_time AS endTime, s.break_minutes AS breakMinutes,
            s.grace_minutes AS graceMinutes, s.overtime_after_minutes AS overtimeAfterMinutes,
            s.workdays_json AS workdaysJson, s.is_active AS isActive
     FROM employee_shift_assignments a
     JOIN attendance_shifts s ON s.id = a.shift_id AND s.is_active = 1
     WHERE a.employee_id = ? AND a.effective_from <= ?
       AND (a.effective_to IS NULL OR a.effective_to >= ?)
     ORDER BY a.effective_from DESC LIMIT 1`,
    [employeeId, date, date]
  )[0];
  if (!shift) return undefined;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (!(JSON.parse(shift.workdaysJson) as number[]).includes(weekday)) return undefined;
  if (db.query(
    'SELECT id FROM attendance_holidays WHERE branch_id = ? AND date = ? LIMIT 1',
    [shift.branchId, date]
  ).length) return undefined;
  return shift;
}

export function getAttendanceRow(
  db: DatabaseManager,
  employeeId: string,
  date: string
): AttendanceEntry | undefined {
  const row = db.query<AttendanceEntry>(
    `SELECT a.id, a.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode,
            e.branch_id AS branchId, a.date, a.status, a.check_in_at AS checkInAt,
            a.check_out_at AS checkOutAt, a.worked_minutes AS workedMinutes,
            a.late_minutes AS lateMinutes, a.early_leave_minutes AS earlyLeaveMinutes,
            a.overtime_minutes AS overtimeMinutes, a.break_minutes AS breakMinutes,
            a.overtime_approved AS overtimeApproved, a.notes, a.source,
            a.recorded_by AS recordedBy,
            EXISTS (SELECT 1 FROM attendance_breaks b
                    WHERE b.attendance_id = a.id AND b.ended_at IS NULL) AS activeBreak
     FROM attendance a JOIN employees e ON e.id = a.employee_id
     WHERE a.employee_id = ? AND a.date = ?`,
    [employeeId, date]
  )[0];
  return row ? { ...row, overtimeApproved: Boolean(row.overtimeApproved), activeBreak: Boolean(row.activeBreak) } : undefined;
}

export function recordAudit(
  db: DatabaseManager,
  attendanceId: string | null,
  employeeId: string,
  date: string,
  action: string,
  before: unknown,
  after: unknown,
  actorId: string
): void {
  db.run(
    `INSERT INTO attendance_audit_log
     (id, attendance_id, employee_id, attendance_date, action, before_json, after_json, actor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `attlog_${uuidv4().replace(/-/g, '')}`, attendanceId, employeeId, date, action,
      before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), actorId,
    ]
  );
}

export function recalculate(
  db: DatabaseManager,
  row: AttendanceEntry,
  shift?: ShiftRow
): AttendanceEntry {
  const breaks = db.query<{ startedAt: string; endedAt: string | null }>(
    'SELECT started_at AS startedAt, ended_at AS endedAt FROM attendance_breaks WHERE attendance_id = ?',
    [row.id]
  );
  const breakMinutes = breaks.reduce((total, item) => total + durationMinutes(item.startedAt, item.endedAt), 0);
  const workedMinutes = Math.max(0, durationMinutes(row.checkInAt, row.checkOutAt) - breakMinutes);
  let lateMinutes = Number(row.lateMinutes) || 0;
  let earlyLeaveMinutes = Number(row.earlyLeaveMinutes) || 0;
  let overtimeMinutes = Number(row.overtimeMinutes) || 0;

  if (shift && row.checkInAt) {
    const shiftStart = timeMinutes(shift.startTime);
    const checkInTime = timeMinutes(row.checkInAt.slice(11, 16));
    lateMinutes = Math.max(0, checkInTime - shiftStart - Number(shift.graceMinutes));
  }
  if (shift && row.checkOutAt) {
    const date = row.date;
    const start = timeMinutes(shift.startTime);
    const endRaw = timeMinutes(shift.endTime);
    const end = endRaw <= start ? endRaw + 1440 : endRaw;
    const checkOutDate = row.checkOutAt.slice(0, 10);
    const dayOffset = checkOutDate > date ? 1440 : 0;
    const checkOutTime = timeMinutes(row.checkOutAt.slice(11, 16)) + dayOffset;
    earlyLeaveMinutes = Math.max(0, end - checkOutTime);
    overtimeMinutes = Math.max(0, checkOutTime - end - Number(shift.overtimeAfterMinutes));
  }

  const status = shift && row.checkInAt && !['ABSENT', 'LEAVE'].includes(row.status)
    ? (lateMinutes > 0 ? 'LATE' : 'PRESENT')
    : row.status;
  const updated = {
    ...row, status: status as AttendanceStatus, workedMinutes, lateMinutes,
    earlyLeaveMinutes, overtimeMinutes, breakMinutes,
  };
  db.run(
    `UPDATE attendance SET status = ?, worked_minutes = ?, late_minutes = ?,
     early_leave_minutes = ?, overtime_minutes = ?, break_minutes = ?,
     overtime_approved = CASE WHEN overtime_minutes != ? THEN 0 ELSE overtime_approved END,
     overtime_approved_by = CASE WHEN overtime_minutes != ? THEN NULL ELSE overtime_approved_by END,
     overtime_approved_at = CASE WHEN overtime_minutes != ? THEN NULL ELSE overtime_approved_at END,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [updated.status, workedMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes,
     breakMinutes, overtimeMinutes, overtimeMinutes, overtimeMinutes, row.id]
  );
  return { ...updated, overtimeApproved: row.overtimeApproved && row.overtimeMinutes === overtimeMinutes };
}

export function mapShiftRows(rows: ShiftRow[]): AttendanceShift[] {
  return rows.map((row) => ({
    id: row.id, branchId: row.branchId, name: row.name, startTime: row.startTime,
    endTime: row.endTime, breakMinutes: Number(row.breakMinutes),
    graceMinutes: Number(row.graceMinutes), overtimeAfterMinutes: Number(row.overtimeAfterMinutes),
    workdays: JSON.parse(row.workdaysJson) as number[], isActive: Boolean(row.isActive),
  }));
}
