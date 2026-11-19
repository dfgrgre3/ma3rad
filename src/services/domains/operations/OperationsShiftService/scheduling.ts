import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import type { ShiftServiceContext } from './context';
import { dateOffset, isValidDate, localNow, scheduledWindow } from './helpers';
import type {
  OperationEmployee,
  OperationShiftInstance,
  OperationStaffRole,
} from './types';

/**
 * Materialise shift instances from the active definitions for a date range.
 * Safe to call on every page load; duplicates are ignored by the unique
 * (definition_id, business_date) constraint.
 */
export function ensureShiftInstances(ctx: ShiftServiceContext, from: string, to: string, branchId?: string): number {
  const actor = ctx.requireView();
  if (!isValidDate(from) || !isValidDate(to) || to < from) {
    throw new Error('فترة إنشاء الورديات غير صالحة.');
  }
  const targetBranch = branchId || ctx.branchAccess.getCurrentBranchId(actor);
  ctx.branchAccess.requireBranchAccess(targetBranch, actor);
  const definitions = ctx.definitionRows(targetBranch);
  if (!definitions.length) return 0;

  const holidays = new Set(ctx.db.query<{ date: string }>(
    'SELECT date FROM attendance_holidays WHERE branch_id = ? AND date BETWEEN ? AND ?',
    [targetBranch, from, to]
  ).map((row) => row.date));
  const now = localNow();
  let created = 0;

  ctx.db.executeTransaction((db) => {
    for (let date = from; date <= to; date = dateOffset(date, 1)) {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      for (const definition of definitions) {
        const workdays = JSON.parse(definition.workdaysJson || '[]') as number[];
        if (!workdays.includes(weekday) || holidays.has(date)) continue;
        const window = scheduledWindow(date, definition.startTime, definition.endTime);
        const status = window.end < now ? 'MISSED' : 'PLANNED';
        const before = ctx.db.query<{ id: string }>(
          'SELECT id FROM operation_shifts WHERE definition_id = ? AND business_date = ?',
          [definition.id, date]
        ).length;
        if (before) continue;
        db.run(
          `INSERT OR IGNORE INTO operation_shifts
             (id, shift_number, definition_id, branch_id, business_date,
              scheduled_start, scheduled_end, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [`opshift_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
            `OP-${date.replace(/-/g, '')}-${uuidv4().replace(/-/g, '').slice(0, 4).toUpperCase()}`,
            definition.id, targetBranch, date, window.start, window.end, status]
        );
        if (!before) created += 1;
      }
    }
  });
  seedAssignedStaff(ctx, from, to, targetBranch);
  refreshMissedShifts(ctx, targetBranch);
  return created;
}

/** Auto-generate the current week and the next seven days. */
export function syncShiftLifecycle(ctx: ShiftServiceContext, today = localDateString()): number {
  return ensureShiftInstances(ctx, dateOffset(today, -1), dateOffset(today, 7));
}

function isOnApprovedLeave(ctx: ShiftServiceContext, employeeId: string, date: string): boolean {
  return ctx.db.query(
    `SELECT id FROM employee_leave_requests
     WHERE employee_id = ? AND status = 'APPROVED'
       AND start_date <= ? AND end_date >= ? LIMIT 1`,
    [employeeId, date, date]
  ).length > 0;
}

function scheduleConflict(
  ctx: ShiftServiceContext,
  employeeId: string,
  shift: Pick<OperationShiftInstance, 'id' | 'branchId' | 'scheduledStart' | 'scheduledEnd'>,
  excludedShiftIds: string[] = []
): string | null {
  const rows = ctx.db.query<any>(
    `SELECT os.id, os.scheduled_start AS scheduledStart, os.scheduled_end AS scheduledEnd,
            d.name AS definitionName, d.required_rest_minutes AS requiredRestMinutes
     FROM operation_shift_staff st
     JOIN operation_shifts os ON os.id = st.operation_shift_id
     JOIN attendance_shifts d ON d.id = os.definition_id
     WHERE st.employee_id = ? AND os.branch_id = ?
       AND os.status != 'CANCELLED'
       AND os.business_date BETWEEN ? AND ?
       AND st.status NOT IN ('ABSENT', 'LEAVE')`,
    [employeeId, shift.branchId,
      dateOffset(shift.scheduledStart.slice(0, 10), -2),
      dateOffset(shift.scheduledStart.slice(0, 10), 2)]
  );
  const targetStart = Date.parse(shift.scheduledStart);
  const targetEnd = Date.parse(shift.scheduledEnd);
  for (const row of rows) {
    if (row.id === shift.id || excludedShiftIds.includes(row.id)) continue;
    const currentStart = Date.parse(row.scheduledStart);
    const currentEnd = Date.parse(row.scheduledEnd);
    const overlap = targetStart < currentEnd && currentStart < targetEnd;
    const restGap = targetStart >= currentEnd
      ? targetStart - currentEnd
      : currentStart >= targetEnd
        ? currentStart - targetEnd
        : -1;
    const candidateRest = ctx.db.query<{ requiredRestMinutes: number }>(
      `SELECT required_rest_minutes AS requiredRestMinutes FROM attendance_shifts
       WHERE id = (SELECT definition_id FROM operation_shifts WHERE id = ?)`,
      [shift.id]
    )[0]?.requiredRestMinutes || 0;
    const requiredRest = Math.max(Number(row.requiredRestMinutes) || 0, Number(candidateRest) || 0);
    if (overlap) return `تعارض مع وردية «${row.definitionName}».`;
    if (restGap < requiredRest * 60_000) {
      return `فترة الراحة بين الورديات أقل من ${requiredRest} دقيقة.`;
    }
  }
  return null;
}

export function assertEmployeeAvailable(
  ctx: ShiftServiceContext,
  employeeId: string,
  shift: Pick<OperationShiftInstance, 'id' | 'branchId' | 'scheduledStart' | 'scheduledEnd' | 'businessDate'>,
  excludedShiftIds: string[] = []
): void {
  if (isOnApprovedLeave(ctx, employeeId, shift.businessDate)) {
    throw new Error('الموظف في إجازة معتمدة خلال تاريخ الوردية.');
  }
  const conflict = scheduleConflict(ctx, employeeId, shift, excludedShiftIds);
  if (conflict) throw new Error(conflict);
}

function seedAssignedStaff(ctx: ShiftServiceContext, from: string, to: string, branchId: string): void {
  const rows = ctx.db.query<{ id: string; definitionId: string; businessDate: string; branchId: string;
    scheduledStart: string; scheduledEnd: string }>(
    `SELECT id, definition_id AS definitionId, business_date AS businessDate,
            branch_id AS branchId, scheduled_start AS scheduledStart, scheduled_end AS scheduledEnd
     FROM operation_shifts WHERE branch_id = ? AND business_date BETWEEN ? AND ?
       AND status IN ('PLANNED', 'MISSED') ORDER BY scheduled_start`,
    [branchId, from, to]
  );
  for (const shift of rows) {
    for (const assignment of ctx.currentAssignments(shift.definitionId, shift.businessDate)) {
      if (ctx.db.query(
        'SELECT id FROM operation_shift_staff WHERE operation_shift_id = ? AND employee_id = ?',
        [shift.id, assignment.employeeId]
      ).length || isOnApprovedLeave(ctx, assignment.employeeId, shift.businessDate)) continue;
      if (scheduleConflict(ctx, assignment.employeeId, shift)) continue;
      ctx.db.run(
        `INSERT OR IGNORE INTO operation_shift_staff
           (id, operation_shift_id, employee_id, role, status)
         VALUES (?, ?, ?, ?, 'PRESENT')`,
        [`opstaff_${uuidv4().replace(/-/g, '').slice(0, 14)}`, shift.id,
          assignment.employeeId, assignment.role]
      );
    }
  }
}

export function generateWorkforceSchedule(ctx: ShiftServiceContext, from: string, to: string, branchId?: string): {
  shiftsCreated: number;
  staffAssigned: number;
  shortages: Array<{ shiftId: string; name: string; date: string; shortageCount: number }>;
} {
  const actor = ctx.requireManage();
  if (!isValidDate(from) || !isValidDate(to) || to < from) {
    throw new Error('فترة إنشاء جدول الورديات غير صالحة.');
  }
  const targetBranch = branchId || ctx.branchAccess.getCurrentBranchId(actor);
  ctx.branchAccess.requireBranchAccess(targetBranch, actor);
  const shiftsCreated = ensureShiftInstances(ctx, from, to, targetBranch);
  const shifts = ctx.db.query<any>(
    `SELECT os.id, os.definition_id AS definitionId, os.branch_id AS branchId,
            os.business_date AS businessDate, os.scheduled_start AS scheduledStart,
            os.scheduled_end AS scheduledEnd, d.name, d.minimum_staff_count AS minimumStaffCount
     FROM operation_shifts os JOIN attendance_shifts d ON d.id = os.definition_id
     WHERE os.branch_id = ? AND os.business_date BETWEEN ? AND ?
       AND os.status IN ('PLANNED', 'MISSED') ORDER BY os.scheduled_start`,
    [targetBranch, from, to]
  );
  const employees = ctx.db.query<OperationEmployee>(
    `SELECT id, branch_id AS branchId, code, name, role, status FROM employees
     WHERE branch_id = ? AND status IN ('ACTIVE', 'PROBATION') ORDER BY name`,
    [targetBranch]
  );
  let staffAssigned = 0;
  for (const row of shifts) {
    const existing = ctx.db.query<{ employeeId: string; role: OperationStaffRole; status: string }>(
      `SELECT employee_id AS employeeId, role, status FROM operation_shift_staff
       WHERE operation_shift_id = ?`,
      [row.id]
    );
    let eligibleCount = existing.filter((staff) => !['ABSENT', 'LEAVE'].includes(staff.status)).length;
    const required = Math.max(0, Number(row.minimumStaffCount) || 0);
    if (eligibleCount >= required) continue;
    const assigned = ctx.currentAssignments(row.definitionId, row.businessDate);
    const assignedIds = new Set(assigned.map((assignment) => assignment.employeeId));
    const scheduledCounts = new Map(ctx.db.query<{ employeeId: string; count: number }>(
      `SELECT st.employee_id AS employeeId, COUNT(*) AS count
       FROM operation_shift_staff st JOIN operation_shifts os ON os.id = st.operation_shift_id
       WHERE os.branch_id = ? AND os.business_date BETWEEN ? AND ?
         AND st.status NOT IN ('ABSENT', 'LEAVE')
       GROUP BY st.employee_id`,
      [targetBranch, from, to]
    ).map((entry) => [entry.employeeId, Number(entry.count) || 0]));
    const candidates = [
      ...assigned.map((assignment) => employees.find((employee) => employee.id === assignment.employeeId))
        .filter((employee): employee is OperationEmployee => Boolean(employee)),
      ...employees.filter((employee) => !assignedIds.has(employee.id)),
    ].sort((left, right) => (scheduledCounts.get(left.id) || 0) - (scheduledCounts.get(right.id) || 0)
      || left.name.localeCompare(right.name));
    for (const employee of candidates) {
      if (eligibleCount >= required) break;
      if (existing.some((staff) => staff.employeeId === employee.id)
        || isOnApprovedLeave(ctx, employee.id, row.businessDate)) continue;
      const conflict = scheduleConflict(ctx, employee.id, row);
      if (conflict) continue;
      const role = assigned.find((assignment) => assignment.employeeId === employee.id)?.role || 'STAFF';
      ctx.db.run(
        `INSERT OR IGNORE INTO operation_shift_staff
           (id, operation_shift_id, employee_id, role, status)
         VALUES (?, ?, ?, ?, 'PRESENT')`,
        [`opstaff_${uuidv4().replace(/-/g, '').slice(0, 14)}`, row.id, employee.id, role]
      );
      existing.push({ employeeId: employee.id, role, status: 'PRESENT' });
      eligibleCount += 1;
      staffAssigned += 1;
    }
  }
  const roster = ctx.getShiftBoard({ from, to, branchId: targetBranch });
  const shortages = roster.filter((shift) => shift.shortageCount > 0).map((shift) => ({
    shiftId: shift.id,
    name: shift.definitionName,
    date: shift.businessDate,
    shortageCount: shift.shortageCount,
  }));
  return { shiftsCreated, staffAssigned, shortages };
}

function refreshMissedShifts(ctx: ShiftServiceContext, branchId: string): void {
  ctx.db.run(
    `UPDATE operation_shifts
     SET status = 'MISSED', updated_at = CURRENT_TIMESTAMP
     WHERE branch_id = ? AND status = 'PLANNED' AND scheduled_end < ?`,
    [branchId, localNow()]
  );
}
