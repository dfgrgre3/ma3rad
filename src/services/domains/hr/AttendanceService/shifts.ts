import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import type {
  AttendanceDeps,
  AttendanceShift,
  ShiftRow,
} from './types';
import {
  dateOffset,
  dateRangesOverlap,
  isValidDate,
  isValidTime,
} from './utils';
import {
  employeeDataScope,
  requireEmployeeBranch,
  requireManage,
  requireView,
} from './context';
import { assertPeriodEditable, mapShiftRows } from './core';

const SHIFT_SELECT = `SELECT s.id, s.branch_id AS branchId, s.name, s.start_time AS startTime,
       s.end_time AS endTime, s.break_minutes AS breakMinutes,
       s.grace_minutes AS graceMinutes, s.overtime_after_minutes AS overtimeAfterMinutes,
       s.workdays_json AS workdaysJson, s.is_active AS isActive
FROM attendance_shifts s`;

export function getShifts(deps: AttendanceDeps): AttendanceShift[] {
  const { db, branchAccess } = deps;
  const actor = requireView();
  const scope = branchAccess.sqlScope('s.branch_id', undefined, actor);
  return db.query<ShiftRow>(
    `${SHIFT_SELECT} WHERE ${scope.clause} ORDER BY s.name`,
    scope.params
  ).map((row) => ({
    id: row.id, branchId: row.branchId, name: row.name, startTime: row.startTime,
    endTime: row.endTime, breakMinutes: Number(row.breakMinutes),
    graceMinutes: Number(row.graceMinutes), overtimeAfterMinutes: Number(row.overtimeAfterMinutes),
    workdays: JSON.parse(row.workdaysJson) as number[], isActive: Boolean(row.isActive),
  }));
}

export async function getShiftsAsync(deps: AttendanceDeps): Promise<AttendanceShift[]> {
  const { db, branchAccess } = deps;
  const actor = requireView();
  const scope = branchAccess.sqlScope('s.branch_id', undefined, actor);
  const rows = await db.queryAsync<ShiftRow>(
    `${SHIFT_SELECT} WHERE ${scope.clause} ORDER BY s.name`,
    scope.params
  );
  return mapShiftRows(rows);
}

export function saveShift(
  deps: AttendanceDeps,
  data: Omit<AttendanceShift, 'id' | 'branchId' | 'isActive'> & { id?: string }
): AttendanceShift {
  const { db, branchAccess } = deps;
  const actor = requireManage();
  const branchId = branchAccess.getCurrentBranchId(actor);
  if (!data.name.trim() || !isValidTime(data.startTime) || !isValidTime(data.endTime)) {
    throw new Error('اسم الوردية ووقتا البداية والنهاية حقول مطلوبة.');
  }
  for (const [label, value] of [
    ['مدة الاستراحة', data.breakMinutes], ['السماح بالتأخير', data.graceMinutes],
    ['مهلة الإضافي', data.overtimeAfterMinutes],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 1440) throw new Error(`${label} غير صحيحة.`);
  }
  const workdays = [...new Set(data.workdays)].sort((a, b) => a - b);
  if (!workdays.length || workdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('حدد يوم عمل أسبوعياً واحداً على الأقل.');
  }
  const id = data.id || `shift_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  if (data.id && db.query(
    'SELECT id FROM employee_shift_assignments WHERE shift_id = ? LIMIT 1',
    [data.id]
  ).length) {
    throw new Error('الوردية مستخدمة في جداول موظفين؛ أنشئ وردية جديدة للحفاظ على سجل الدوام السابق.');
  }
  db.run(
    `INSERT INTO attendance_shifts
     (id, branch_id, name, start_time, end_time, break_minutes, grace_minutes,
      overtime_after_minutes, workdays_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, start_time = excluded.start_time,
       end_time = excluded.end_time, break_minutes = excluded.break_minutes,
       grace_minutes = excluded.grace_minutes, overtime_after_minutes = excluded.overtime_after_minutes,
       workdays_json = excluded.workdays_json, updated_at = CURRENT_TIMESTAMP
     WHERE attendance_shifts.branch_id = excluded.branch_id`,
    [id, branchId, data.name.trim(), data.startTime, data.endTime, data.breakMinutes,
      data.graceMinutes, data.overtimeAfterMinutes, JSON.stringify(workdays), actor.id]
  );
  const saved = getShifts(deps).find((shift) => shift.id === id);
  if (!saved) throw new Error('تعذر حفظ الوردية ضمن الفرع الحالي.');
  return saved;
}

export function assignShift(
  deps: AttendanceDeps,
  employeeId: string,
  shiftId: string,
  from: string,
  to?: string
): void {
  const { db } = deps;
  const actor = requireManage();
  if (!isValidDate(from) || (to && (!isValidDate(to) || to < from))) throw new Error('فترة تعيين الوردية غير صالحة.');
  const branchId = requireEmployeeBranch(deps, employeeId, actor);
  const shift = db.query<{ branchId: string }>(
    'SELECT branch_id AS branchId FROM attendance_shifts WHERE id = ? AND is_active = 1',
    [shiftId]
  )[0];
  if (!shift || shift.branchId !== branchId) throw new Error('الوردية غير نشطة أو لا تتبع فرع الموظف.');
  const overlaps = db.query<{ id: string; effectiveFrom: string; effectiveTo: string | null }>(
    `SELECT id, effective_from AS effectiveFrom, effective_to AS effectiveTo
     FROM employee_shift_assignments WHERE employee_id = ?`,
    [employeeId]
  ).filter((row) => dateRangesOverlap(row.effectiveFrom, row.effectiveTo, from, to ?? null));
  const prior = overlaps.length === 1 && overlaps[0].effectiveFrom < from ? overlaps[0] : undefined;
  if (overlaps.length && !prior) throw new Error('توجد وردية أخرى متداخلة مع فترة التعيين.');
  assertDateRangeEditable(db, branchId, from, to ?? localDateString());
  if (prior) assertDateRangeEditable(db, branchId, prior.effectiveFrom, dateOffset(from, -1));
  db.executeTransaction((txnDb) => {
    if (prior) {
      txnDb.run('UPDATE employee_shift_assignments SET effective_to = ? WHERE id = ?', [dateOffset(from, -1), prior.id]);
    }
    txnDb.run(
      `INSERT INTO employee_shift_assignments
       (id, employee_id, shift_id, effective_from, effective_to, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`assign_${uuidv4().replace(/-/g, '').slice(0, 16)}`, employeeId, shiftId, from, to ?? null, actor.id]
    );
  });
}

export function getAssignments(deps: AttendanceDeps): Array<{
  id: string; employeeId: string; employeeName: string; shiftId: string;
  shiftName: string; effectiveFrom: string; effectiveTo: string | null;
}> {
  const { db } = deps;
  const actor = requireView();
  const scope = employeeDataScope(deps, actor);
  return db.query(
    `SELECT a.id, a.employee_id AS employeeId, e.name AS employeeName,
            a.shift_id AS shiftId, s.name AS shiftName,
            a.effective_from AS effectiveFrom, a.effective_to AS effectiveTo
     FROM employee_shift_assignments a JOIN employees e ON e.id = a.employee_id
     JOIN attendance_shifts s ON s.id = a.shift_id
     WHERE ${scope.clause} ORDER BY e.name, a.effective_from DESC`,
    scope.params
  );
}

export async function getAssignmentsAsync(deps: AttendanceDeps): Promise<Array<{
  id: string; employeeId: string; employeeName: string; shiftId: string;
  shiftName: string; effectiveFrom: string; effectiveTo: string | null;
}>> {
  const { db } = deps;
  const actor = requireView();
  const scope = employeeDataScope(deps, actor);
  return db.queryAsync(
    `SELECT a.id, a.employee_id AS employeeId, e.name AS employeeName,
            a.shift_id AS shiftId, s.name AS shiftName,
            a.effective_from AS effectiveFrom, a.effective_to AS effectiveTo
     FROM employee_shift_assignments a JOIN employees e ON e.id = a.employee_id
     JOIN attendance_shifts s ON s.id = a.shift_id
     WHERE ${scope.clause} ORDER BY e.name, a.effective_from DESC`,
    scope.params
  );
}

export function addHoliday(deps: AttendanceDeps, date: string, name: string): void {
  const { db, branchAccess } = deps;
  const actor = requireManage();
  if (!isValidDate(date) || !name.trim()) throw new Error('تاريخ العطلة واسمها مطلوبان.');
  const branchId = branchAccess.getCurrentBranchId(actor);
  assertPeriodEditable(db, branchId, date);
  db.run(
    `INSERT INTO attendance_holidays (id, branch_id, date, name, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [`holiday_${uuidv4().replace(/-/g, '').slice(0, 16)}`, branchId, date, name.trim(), actor.id]
  );
}

export function removeHoliday(deps: AttendanceDeps, id: string): void {
  const { db, branchAccess } = deps;
  const actor = requireManage();
  const holiday = db.query<{ branchId: string; date: string }>(
    'SELECT branch_id AS branchId, date FROM attendance_holidays WHERE id = ?',
    [id]
  )[0];
  if (!holiday) throw new Error('العطلة غير موجودة.');
  branchAccess.requireBranchAccess(holiday.branchId, actor);
  assertPeriodEditable(db, holiday.branchId, holiday.date);
  db.run('DELETE FROM attendance_holidays WHERE id = ?', [id]);
}

export function getHolidays(deps: AttendanceDeps, period: string): Array<{ id: string; date: string; name: string }> {
  const { db, branchAccess } = deps;
  const actor = requireView();
  const scope = branchAccess.sqlScope('h.branch_id', undefined, actor);
  return db.query(
    `SELECT h.id, h.date, h.name FROM attendance_holidays h
     WHERE substr(h.date, 1, 7) = ? AND ${scope.clause} ORDER BY h.date`,
    [period, ...scope.params]
  );
}

export async function getHolidaysAsync(deps: AttendanceDeps, period: string): Promise<Array<{ id: string; date: string; name: string }>> {
  const { db, branchAccess } = deps;
  const actor = requireView();
  const scope = branchAccess.sqlScope('h.branch_id', undefined, actor);
  return db.queryAsync(
    `SELECT h.id, h.date, h.name FROM attendance_holidays h
     WHERE substr(h.date, 1, 7) = ? AND ${scope.clause} ORDER BY h.date`,
    [period, ...scope.params]
  );
}

function assertDateRangeEditable(db: AttendanceDeps['db'], branchId: string, start: string, end: string): void {
  if (end < start) return;
  const currentMonth = localDateString().slice(0, 7);
  const endMonth = end.slice(0, 7) > currentMonth ? `${currentMonth}-31` : end;
  let month = start.slice(0, 7);
  while (`${month}-01` <= endMonth) {
    assertPeriodEditable(db, branchId, `${month}-01`);
    const [year, value] = month.split('-').map(Number);
    month = `${value === 12 ? year + 1 : year}-${String(value === 12 ? 1 : value + 1).padStart(2, '0')}`;
  }
}
