import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import { AttendanceTimeService } from '../AttendanceTimeService';
import type {
  AttendanceDeps,
  AttendancePeriod,
} from './types';
import { durationMinutes, isValidDate } from './utils';
import {
  employeeDataScope,
  requireEmployeeBranch,
  requireManage,
  requireView,
} from './context';
import { assertPeriodEditable } from './core';

const PERIOD_SELECT = `SELECT p.id, p.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode,
       e.branch_id AS branchId, p.operation_shift_id AS operationShiftId,
       os.shift_number AS shiftNumber, p.attendance_date AS attendanceDate,
       p.check_in_at AS checkInAt, p.check_out_at AS checkOutAt,
       p.worked_minutes AS workedMinutes, p.late_minutes AS lateMinutes,
       p.overtime_minutes AS overtimeMinutes, p.status, p.source, p.notes
FROM employee_attendance_periods p
JOIN employees e ON e.id = p.employee_id
LEFT JOIN operation_shifts os ON os.id = p.operation_shift_id`;

function mapPeriodRow(row: any): AttendancePeriod {
  return {
    ...row,
    workedMinutes: Number(row.workedMinutes) || 0,
    lateMinutes: Number(row.lateMinutes) || 0,
    overtimeMinutes: Number(row.overtimeMinutes) || 0,
  };
}

export function getAttendancePeriods(
  deps: AttendanceDeps,
  filters: {
    employeeId?: string;
    date?: string;
    from?: string;
    to?: string;
    operationShiftId?: string;
  } = {}
): AttendancePeriod[] {
  const { db } = deps;
  const actor = requireView();
  const scope = employeeDataScope(deps, actor);
  const conditions = [scope.clause];
  const params: string[] = [...scope.params];
  if (filters.employeeId) {
    conditions.push('p.employee_id = ?');
    params.push(filters.employeeId);
  }
  if (filters.date) {
    if (!isValidDate(filters.date)) throw new Error('تاريخ الحضور غير صالح.');
    conditions.push('p.attendance_date = ?');
    params.push(filters.date);
  }
  if (filters.from) {
    if (!isValidDate(filters.from)) throw new Error('تاريخ بداية الفترة غير صالح.');
    conditions.push('p.attendance_date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    if (!isValidDate(filters.to)) throw new Error('تاريخ نهاية الفترة غير صالح.');
    conditions.push('p.attendance_date <= ?');
    params.push(filters.to);
  }
  if (filters.operationShiftId) {
    conditions.push('p.operation_shift_id = ?');
    params.push(filters.operationShiftId);
  }
  return db.query<any>(
    `${PERIOD_SELECT}
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.check_in_at DESC LIMIT 500`,
    params
  ).map(mapPeriodRow);
}

export function getOpenAttendancePeriod(deps: AttendanceDeps, employeeId: string): AttendancePeriod | null {
  const { db } = deps;
  const actor = requireView();
  requireEmployeeBranch(deps, employeeId, actor);
  const row = db.query<any>(
    `${PERIOD_SELECT}
     WHERE p.employee_id = ? AND p.check_out_at IS NULL
     ORDER BY p.check_in_at DESC LIMIT 1`,
    [employeeId]
  )[0];
  return row ? mapPeriodRow(row) : null;
}

/**
 * Standalone clock-in/out that is independent from the daily attendance
 * summary. Safe to call several times a day; one employee may only have one
 * open period at a time.
 */
export function clockAttendancePeriod(
  deps: AttendanceDeps,
  employeeId: string,
  direction: 'IN' | 'OUT',
  options: {
    operationShiftId?: string | null;
    at?: string;
    lateMinutes?: number;
    overtimeMinutes?: number;
    notes?: string;
    source?: string;
  } = {}
): AttendancePeriod {
  const { db } = deps;
  const actor = requireManage();
  const branchId = requireEmployeeBranch(deps, employeeId, actor);
  const now = options.at || `${localDateString()}T${new Date().toTimeString().slice(0, 8)}`;
  assertPeriodEditable(db, branchId, now.slice(0, 10));
  const date = now.slice(0, 10);
  if (!isValidDate(date) || !/^\d{2}:\d{2}/.test(now.slice(11))) {
    throw new Error('وقت تسجيل الحضور غير صالح.');
  }
  if (options.operationShiftId) {
    const shift = db.query<{ branchId: string }>(
      'SELECT branch_id AS branchId FROM operation_shifts WHERE id = ?',
      [options.operationShiftId]
    )[0];
    if (!shift) throw new Error('وردية التشغيل غير موجودة.');
    if (shift.branchId !== branchId) throw new Error('وردية التشغيل لا تتبع فرع الموظف.');
  }
  const open = db.query<{ id: string; checkInAt: string; operationShiftId: string | null }>(
    `SELECT id, check_in_at AS checkInAt, operation_shift_id AS operationShiftId
     FROM employee_attendance_periods WHERE employee_id = ? AND check_out_at IS NULL
     ORDER BY check_in_at DESC LIMIT 1`,
    [employeeId]
  )[0];

  if (direction === 'IN') {
    if (open) throw new Error('يوجد سجل حضور مفتوح لهذا الموظف؛ سجّل الانصراف أولاً.');
    const id = `attperiod_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    db.run(
      `INSERT INTO employee_attendance_periods
         (id, employee_id, operation_shift_id, attendance_date, check_in_at,
          late_minutes, overtime_minutes, status, source, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'OPEN', ?, ?, ?)`,
      [id, employeeId, options.operationShiftId || null, date, now,
        Math.max(0, options.lateMinutes || 0), options.source || 'MANUAL',
        options.notes?.trim() || null, actor.id]
    );
    AttendanceTimeService.syncDailySummary(employeeId, date, actor.id);
    return getAttendancePeriods(deps, { employeeId }).find((row) => row.id === id)!;
  }

  if (!open) throw new Error('لا يوجد سجل حضور مفتوح لهذا الموظف.');
  const workedMinutes = Math.max(0, durationMinutes(open.checkInAt, now));
  db.run(
    `UPDATE employee_attendance_periods
     SET check_out_at = ?, worked_minutes = ?, overtime_minutes = ?, status = 'CLOSED',
         notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [now, workedMinutes, Math.max(0, options.overtimeMinutes || 0),
      options.notes?.trim() || null, open.id]
  );
  AttendanceTimeService.syncDailySummary(employeeId, date, actor.id);
  return getAttendancePeriods(deps, { employeeId }).find((row) => row.id === open.id)!;
}
