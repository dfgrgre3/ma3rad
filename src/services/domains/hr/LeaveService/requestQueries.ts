import type { LeaveFilters, LeaveType } from '../../../../types/hr/leave';
import type { LeaveServiceDeps, LeaveScheduleRow } from './types';
import { assertDate, dateOffset, yearEnd, yearStart } from './utils';

type Db = LeaveServiceDeps['db'];

export function assertPayrollPeriodsEditable(
  db: Db,
  request: { branchId: string; startDate: string; endDate: string }
): void {
  if (db.query(
    `SELECT id FROM payroll_runs
     WHERE branch_id = ? AND status != 'DRAFT'
       AND period BETWEEN substr(?, 1, 7) AND substr(?, 1, 7)
     LIMIT 1`,
    [request.branchId, request.startDate, request.endDate]
  ).length) {
    throw new Error('طلب الإجازة يؤثر في فترة رواتب معتمدة؛ لا يمكن تعديله.');
  }
}

export function assertNoOverlap(
  db: Db,
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeId?: string
): void {
  const overlap = db.query<{ count: number }>(
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

export function assertEmploymentPeriod(
  db: Db,
  employeeId: string,
  startDate: string,
  endDate: string
): void {
  const employee = db.query<{ joinedDate: string; terminatedAt: string | null }>(
    `SELECT joined_date AS joinedDate, terminated_at AS terminatedAt
     FROM employees WHERE id = ?`,
    [employeeId]
  )[0];
  if (!employee) throw new Error('الموظف المحدد غير موجود.');
  if (startDate < employee.joinedDate) {
    throw new Error('لا يمكن تسجيل إجازة قبل تاريخ تعيين الموظف.');
  }
  if (employee.terminatedAt && endDate > employee.terminatedAt) {
    throw new Error('لا يمكن تسجيل إجازة بعد تاريخ انتهاء خدمة الموظف.');
  }
}

export function getChargeableDates(
  db: Db,
  employeeId: string,
  branchId: string,
  startDate: string,
  endDate: string
): string[] {
  const shifts = db.query<LeaveScheduleRow>(
    `SELECT a.effective_from AS effectiveFrom, a.effective_to AS effectiveTo,
            s.workdays_json AS workdaysJson
     FROM employee_shift_assignments a
     JOIN attendance_shifts s ON s.id = a.shift_id AND s.is_active = 1
     WHERE a.employee_id = ? AND a.effective_from <= ?
       AND (a.effective_to IS NULL OR a.effective_to >= ?)
     ORDER BY a.effective_from DESC`,
    [employeeId, endDate, startDate]
  );
  const holidays = new Set(db.query<{ date: string }>(
    `SELECT date FROM attendance_holidays
     WHERE branch_id = ? AND date BETWEEN ? AND ?`,
    [branchId, startDate, endDate]
  ).map((row) => row.date));

  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = dateOffset(date, 1)) {
    if (holidays.has(date)) continue;
    const shift = shifts.find((row) =>
      row.effectiveFrom <= date && (!row.effectiveTo || row.effectiveTo >= date)
    );
    if (shift) {
      const weekdays = JSON.parse(shift.workdaysJson) as number[];
      if (!weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
    }
    dates.push(date);
  }
  return dates;
}

export function getChargeableDays(
  db: Db,
  employeeId: string,
  branchId: string,
  startDate: string,
  endDate: string
): number {
  return getChargeableDates(db, employeeId, branchId, startDate, endDate).length;
}

export async function getChargeableDatesAsync(
  db: Db,
  employeeId: string,
  branchId: string,
  startDate: string,
  endDate: string
): Promise<string[]> {
  const [shifts, holidayRows] = await Promise.all([
    db.queryAsync<LeaveScheduleRow>(
      `SELECT a.effective_from AS effectiveFrom, a.effective_to AS effectiveTo,
              s.workdays_json AS workdaysJson
       FROM employee_shift_assignments a
       JOIN attendance_shifts s ON s.id = a.shift_id AND s.is_active = 1
       WHERE a.employee_id = ? AND a.effective_from <= ?
         AND (a.effective_to IS NULL OR a.effective_to >= ?)
       ORDER BY a.effective_from DESC`,
      [employeeId, endDate, startDate]
    ),
    db.queryAsync<{ date: string }>(
      `SELECT date FROM attendance_holidays
       WHERE branch_id = ? AND date BETWEEN ? AND ?`,
      [branchId, startDate, endDate]
    ),
  ]);
  const holidays = new Set(holidayRows.map((row) => row.date));

  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = dateOffset(date, 1)) {
    if (holidays.has(date)) continue;
    const shift = shifts.find((row) =>
      row.effectiveFrom <= date && (!row.effectiveTo || row.effectiveTo >= date)
    );
    if (shift) {
      const weekdays = JSON.parse(shift.workdaysJson) as number[];
      if (!weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
    }
    dates.push(date);
  }
  return dates;
}

export async function getChargeableDaysAsync(
  db: Db,
  employeeId: string,
  branchId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  return (await getChargeableDatesAsync(db, employeeId, branchId, startDate, endDate)).length;
}

export function getYearlyRequests(
  db: Db,
  employeeId: string,
  leaveType: LeaveType,
  year: number,
  excludeId?: string,
  status: 'PENDING' | 'APPROVED' | 'ALL' = 'ALL'
): Array<{ id: string; branchId: string; startDate: string; endDate: string }> {
  const statusCondition = status === 'ALL' ? "status IN ('PENDING', 'APPROVED')" : 'status = ?';
  const params: Array<string> = [employeeId, leaveType];
  if (status !== 'ALL') params.push(status);
  params.push(yearEnd(year), yearStart(year));
  if (excludeId) params.push(excludeId);
  return db.query(
    `SELECT id, branch_id AS branchId, start_date AS startDate, end_date AS endDate
     FROM employee_leave_requests
     WHERE employee_id = ? AND leave_type = ?
       AND ${statusCondition}
       AND start_date <= ? AND end_date >= ?
       ${excludeId ? 'AND id != ?' : ''}
     ORDER BY start_date`,
    params
  );
}

export function getYearlyRequestDays(
  db: Db,
  employeeId: string,
  leaveType: LeaveType,
  year: number,
  excludeId?: string,
  status: 'PENDING' | 'APPROVED' | 'ALL' = 'ALL',
  asOfDate = yearEnd(year)
): number {
  return getYearlyRequests(db, employeeId, leaveType, year, excludeId, status).reduce((total, request) => {
    const start = request.startDate > yearStart(year) ? request.startDate : yearStart(year);
    const requestEnd = request.endDate < yearEnd(year) ? request.endDate : yearEnd(year);
    const end = requestEnd < asOfDate ? requestEnd : asOfDate;
    if (start > end) return total;
    return total + getChargeableDays(db, employeeId, request.branchId, start, end);
  }, 0);
}

export async function getYearlyRequestsAsync(
  db: Db,
  employeeId: string,
  leaveType: LeaveType,
  year: number,
  excludeId?: string,
  status: 'PENDING' | 'APPROVED' | 'ALL' = 'ALL'
): Promise<Array<{ id: string; branchId: string; startDate: string; endDate: string }>> {
  const statusCondition = status === 'ALL' ? "status IN ('PENDING', 'APPROVED')" : 'status = ?';
  const params: Array<string> = [employeeId, leaveType];
  if (status !== 'ALL') params.push(status);
  params.push(yearEnd(year), yearStart(year));
  if (excludeId) params.push(excludeId);
  return db.queryAsync(
    `SELECT id, branch_id AS branchId, start_date AS startDate, end_date AS endDate
     FROM employee_leave_requests
     WHERE employee_id = ? AND leave_type = ?
       AND ${statusCondition}
       AND start_date <= ? AND end_date >= ?
       ${excludeId ? 'AND id != ?' : ''}
     ORDER BY start_date`,
    params
  );
}

export async function getYearlyRequestDaysAsync(
  db: Db,
  employeeId: string,
  leaveType: LeaveType,
  year: number,
  excludeId?: string,
  status: 'PENDING' | 'APPROVED' | 'ALL' = 'ALL',
  asOfDate = yearEnd(year)
): Promise<number> {
  const requests = await getYearlyRequestsAsync(db, employeeId, leaveType, year, excludeId, status);
  let total = 0;
  for (const request of requests) {
    const start = request.startDate > yearStart(year) ? request.startDate : yearStart(year);
    const requestEnd = request.endDate < yearEnd(year) ? request.endDate : yearEnd(year);
    const end = requestEnd < asOfDate ? requestEnd : asOfDate;
    if (start > end) continue;
    total += await getChargeableDaysAsync(db, employeeId, request.branchId, start, end);
  }
  return total;
}

export function buildRequestFilterConditions(
  filters: LeaveFilters,
  scopeClause: string,
  scopeParams: Array<string | number>
): { conditions: string[]; params: Array<string | number> } {
  const conditions = [scopeClause];
  const params: Array<string | number> = [...scopeParams];

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

  return { conditions, params };
}
