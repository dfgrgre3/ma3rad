import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import type { User } from '../../../../types/auth/identity';
import type {
  AttendanceBreakEntry,
  AttendanceDeps,
  AttendanceEmployee,
  AttendanceEntry,
  AttendanceReportRow,
} from './types';
import { durationMinutes, isValidDate } from './utils';
import {
  employeeDataScope,
  requireView,
} from './context';

const ATTENDANCE_SELECT = `SELECT a.id, a.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode,
       e.branch_id AS branchId, a.date, a.status, a.check_in_at AS checkInAt,
       a.check_out_at AS checkOutAt, a.worked_minutes AS workedMinutes,
       a.late_minutes AS lateMinutes, a.early_leave_minutes AS earlyLeaveMinutes,
       a.overtime_minutes AS overtimeMinutes, a.break_minutes AS breakMinutes,
       a.overtime_approved AS overtimeApproved, a.notes, a.source,
       a.recorded_by AS recordedBy,
       EXISTS (SELECT 1 FROM attendance_breaks b
               WHERE b.attendance_id = a.id AND b.ended_at IS NULL) AS activeBreak
FROM attendance a JOIN employees e ON e.id = a.employee_id`;

function mapAttendanceRows(rows: AttendanceEntry[]): AttendanceEntry[] {
  return rows.map((row) => ({
    ...row,
    overtimeApproved: Boolean(row.overtimeApproved),
    activeBreak: Boolean(row.activeBreak),
  }));
}

export function getEmployees(deps: AttendanceDeps): AttendanceEmployee[] {
  const { db } = deps;
  const actor = requireView();
  const scope = employeeDataScope(deps, actor);
  return db.query<AttendanceEmployee>(
    `SELECT e.id, e.branch_id AS branchId, e.name, e.role, e.phone, e.status
     FROM employees e WHERE e.status != 'SUSPENDED' AND ${scope.clause}
     ORDER BY e.name`,
    scope.params
  );
}

export async function getEmployeesAsync(deps: AttendanceDeps): Promise<AttendanceEmployee[]> {
  const { db } = deps;
  const actor = requireView();
  const scope = employeeDataScope(deps, actor);
  return db.queryAsync<AttendanceEmployee>(
    `SELECT e.id, e.branch_id AS branchId, e.name, e.role, e.phone, e.status
     FROM employees e WHERE e.status != 'SUSPENDED' AND ${scope.clause}
     ORDER BY e.name`,
    scope.params
  );
}

export function getAttendanceByDate(deps: AttendanceDeps, date: string): AttendanceEntry[] {
  const { db } = deps;
  const actor = requireView();
  if (!isValidDate(date)) throw new Error('تاريخ الحضور غير صالح.');
  const scope = employeeDataScope(deps, actor);
  return mapAttendanceRows(db.query<AttendanceEntry>(
    `${ATTENDANCE_SELECT}
     WHERE a.date = ? AND ${scope.clause} ORDER BY e.name`,
    [date, ...scope.params]
  ));
}

export async function getAttendanceByDateAsync(deps: AttendanceDeps, date: string): Promise<AttendanceEntry[]> {
  const { db } = deps;
  const actor = requireView();
  if (!isValidDate(date)) throw new Error('تاريخ الحضور غير صالح.');
  const scope = employeeDataScope(deps, actor);
  return mapAttendanceRows(await db.queryAsync<AttendanceEntry>(
    `${ATTENDANCE_SELECT}
     WHERE a.date = ? AND ${scope.clause} ORDER BY e.name`,
    [date, ...scope.params]
  ));
}

const MONTHLY_REPORT_SELECT = `SELECT a.id, a.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode,
       e.branch_id AS branchId, a.date, a.status, a.check_in_at AS checkInAt,
       a.check_out_at AS checkOutAt, a.worked_minutes AS workedMinutes,
       a.late_minutes AS lateMinutes, a.early_leave_minutes AS earlyLeaveMinutes,
       a.overtime_minutes AS overtimeMinutes, a.break_minutes AS breakMinutes,
       a.overtime_approved AS overtimeApproved, a.notes, a.source,
       a.recorded_by AS recordedBy, s.name AS shiftName
FROM attendance a JOIN employees e ON e.id = a.employee_id
LEFT JOIN employee_shift_assignments sa
  ON sa.employee_id = e.id AND sa.effective_from <= a.date
  AND (sa.effective_to IS NULL OR sa.effective_to >= a.date)
LEFT JOIN attendance_shifts s ON s.id = sa.shift_id`;

function buildMonthlyReport(
  deps: AttendanceDeps,
  period: string,
  actor: User
): AttendanceReportRow[] {
  const { db } = deps;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('صيغة الشهر غير صحيحة (YYYY-MM).');
  const scope = employeeDataScope(deps, actor);
  return db.query<AttendanceReportRow>(
    `${MONTHLY_REPORT_SELECT}
     WHERE substr(a.date, 1, 7) = ? AND ${scope.clause}
     ORDER BY a.date, e.name`,
    [period, ...scope.params]
  ).map((row) => ({ ...row, overtimeApproved: Boolean(row.overtimeApproved) }));
}

async function buildMonthlyReportAsync(
  deps: AttendanceDeps,
  period: string,
  actor: User
): Promise<AttendanceReportRow[]> {
  const { db } = deps;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('صيغة الشهر غير صحيحة (YYYY-MM).');
  const scope = employeeDataScope(deps, actor);
  return (await db.queryAsync<AttendanceReportRow>(
    `${MONTHLY_REPORT_SELECT}
     WHERE substr(a.date, 1, 7) = ? AND ${scope.clause}
     ORDER BY a.date, e.name`,
    [period, ...scope.params]
  )).map((row) => ({ ...row, overtimeApproved: Boolean(row.overtimeApproved) }));
}

export function getMonthlyReport(deps: AttendanceDeps, period: string): AttendanceReportRow[] {
  const actor = requireView();
  return buildMonthlyReport(deps, period, actor);
}

export async function getMonthlyReportAsync(deps: AttendanceDeps, period: string): Promise<AttendanceReportRow[]> {
  const actor = requireView();
  return buildMonthlyReportAsync(deps, period, actor);
}

export function getMonthlyReportForExport(deps: AttendanceDeps, period: string): AttendanceReportRow[] {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'employees.attendance.export');
  return buildMonthlyReport(deps, period, actor);
}

export async function getMonthlyReportForExportAsync(deps: AttendanceDeps, period: string): Promise<AttendanceReportRow[]> {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'employees.attendance.export');
  return buildMonthlyReportAsync(deps, period, actor);
}

export function getBreaks(deps: AttendanceDeps, attendanceId: string): Array<{ id: string; startedAt: string; endedAt: string | null; minutes: number }> {
  const { db } = deps;
  const actor = requireView();
  const scope = employeeDataScope(deps, actor);
  const breaks = db.query<{ id: string; startedAt: string; endedAt: string | null; employeeId: string; date: string }>(
    `SELECT b.id, b.started_at AS startedAt, b.ended_at AS endedAt,
            a.employee_id AS employeeId, a.date
     FROM attendance_breaks b
     JOIN attendance a ON a.id = b.attendance_id
     JOIN employees e ON e.id = a.employee_id
     WHERE b.attendance_id = ? AND ${scope.clause} ORDER BY b.started_at`,
    [attendanceId, ...scope.params]
  );
  return breaks.map((item) => ({
    id: item.id, startedAt: item.startedAt, endedAt: item.endedAt,
    minutes: durationMinutes(item.startedAt, item.endedAt),
  }));
}

const BREAKS_BY_DATE_SELECT = `SELECT b.id, b.attendance_id AS attendanceId, b.started_at AS startedAt,
       b.ended_at AS endedAt,
       CASE WHEN b.ended_at IS NULL THEN 0
            ELSE MAX(0, CAST((julianday(b.ended_at) - julianday(b.started_at)) * 1440 AS INTEGER))
       END AS minutes
FROM attendance_breaks b JOIN attendance a ON a.id = b.attendance_id
JOIN employees e ON e.id = a.employee_id`;

export function getBreaksByDate(deps: AttendanceDeps, date: string): AttendanceBreakEntry[] {
  const { db } = deps;
  const actor = requireView();
  const scope = employeeDataScope(deps, actor);
  return db.query<AttendanceBreakEntry>(
    `${BREAKS_BY_DATE_SELECT}
     WHERE a.date = ? AND ${scope.clause}
     ORDER BY b.started_at`,
    [date, ...scope.params]
  );
}

export async function getBreaksByDateAsync(deps: AttendanceDeps, date: string): Promise<AttendanceBreakEntry[]> {
  const { db } = deps;
  const actor = requireView();
  const scope = employeeDataScope(deps, actor);
  return db.queryAsync<AttendanceBreakEntry>(
    `${BREAKS_BY_DATE_SELECT}
     WHERE a.date = ? AND ${scope.clause}
     ORDER BY b.started_at`,
    [date, ...scope.params]
  );
}
