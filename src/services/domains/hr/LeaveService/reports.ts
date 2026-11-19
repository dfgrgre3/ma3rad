import type { User } from '../../../../types/auth/identity';
import type { LeaveFilters, LeaveStatus, LeaveSummary, LeaveType } from '../../../../types/hr/leave';
import type { EmployeeLeaveRequest } from '../../../../types/hr/leave';
import type { LeaveCalendarEntry, LeaveServiceDeps } from './types';
import { employeeDataScope } from './access';
import {
  buildRequestFilterConditions,
  getChargeableDates,
  getChargeableDatesAsync,
  getChargeableDays,
  getChargeableDaysAsync,
} from './requestQueries';
import { yearEnd, yearStart } from './utils';

export function getCalendar(
  deps: LeaveServiceDeps,
  actor: User,
  period: string
): LeaveCalendarEntry[] {
  const { db } = deps;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('صيغة الشهر غير صحيحة (YYYY-MM).');
  const start = `${period}-01`;
  const month = Number(period.slice(5, 7));
  const year = Number(period.slice(0, 4));
  const end = `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  const scope = employeeDataScope(deps, actor);
  const requests = db.query<{
    employeeId: string; employeeName: string; branchId: string; leaveType: LeaveType;
    status: 'PENDING' | 'APPROVED'; startDate: string; endDate: string;
  }>(
    `SELECT l.employee_id AS employeeId, e.name AS employeeName,
            l.branch_id AS branchId, l.leave_type AS leaveType, l.status,
            l.start_date AS startDate, l.end_date AS endDate
     FROM employee_leave_requests l JOIN employees e ON e.id = l.employee_id
     WHERE l.status IN ('PENDING', 'APPROVED') AND l.start_date <= ? AND l.end_date >= ?
       AND ${scope.clause}
     ORDER BY l.start_date, e.name`,
    [end, start, ...scope.params]
  );
  const leaveEntries = requests.flatMap((request) => {
    const rangeStart = request.startDate > start ? request.startDate : start;
    const rangeEnd = request.endDate < end ? request.endDate : end;
    return getChargeableDates(db, request.employeeId, request.branchId, rangeStart, rangeEnd).map((date) => ({
      date,
      employeeId: request.employeeId,
      employeeName: request.employeeName,
      leaveType: request.leaveType,
      status: request.status,
    }));
  });
  const absences = db.query<{ date: string; employeeId: string; employeeName: string }>(
    `SELECT a.date, a.employee_id AS employeeId, e.name AS employeeName
     FROM attendance a JOIN employees e ON e.id = a.employee_id
     WHERE a.status = 'ABSENT' AND a.date BETWEEN ? AND ? AND ${scope.clause}
     ORDER BY a.date, e.name`,
    [start, end, ...scope.params]
  ).map((row) => ({ ...row, leaveType: null, status: 'ABSENT' as const }));
  return [...leaveEntries, ...absences].sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName));
}

export function getRequests(
  deps: LeaveServiceDeps,
  actor: User,
  filters: LeaveFilters = {}
): EmployeeLeaveRequest[] {
  const { db } = deps;
  const scope = employeeDataScope(deps, actor);
  const { conditions, params } = buildRequestFilterConditions(filters, scope.clause, scope.params);

  return db.query<EmployeeLeaveRequest>(
    `SELECT l.*, e.name AS employee_name, b.name AS branch_name,
            ru.full_name AS requester_name, du.full_name AS decider_name
     FROM employee_leave_requests l
     JOIN employees e ON e.id = l.employee_id
     LEFT JOIN branches b ON b.id = l.branch_id
     LEFT JOIN users ru ON ru.id = l.requested_by
     LEFT JOIN users du ON du.id = l.decided_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY l.start_date DESC, l.created_at DESC`,
    params
  );
}

export async function getRequestsAsync(
  deps: LeaveServiceDeps,
  actor: User,
  filters: LeaveFilters = {}
): Promise<EmployeeLeaveRequest[]> {
  const { db } = deps;
  const scope = employeeDataScope(deps, actor);
  const { conditions, params } = buildRequestFilterConditions(filters, scope.clause, scope.params);

  return db.queryAsync<EmployeeLeaveRequest>(
    `SELECT l.*, e.name AS employee_name, b.name AS branch_name,
            ru.full_name AS requester_name, du.full_name AS decider_name
     FROM employee_leave_requests l
     JOIN employees e ON e.id = l.employee_id
     LEFT JOIN branches b ON b.id = l.branch_id
     LEFT JOIN users ru ON ru.id = l.requested_by
     LEFT JOIN users du ON du.id = l.decided_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY l.start_date DESC, l.created_at DESC`,
    params
  );
}

export function getSummary(
  deps: LeaveServiceDeps,
  actor: User,
  year?: number
): LeaveSummary {
  const { db } = deps;
  const targetYear = year ?? new Date().getFullYear();
  if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
    throw new Error('السنة غير صالحة.');
  }
  const scope = employeeDataScope(deps, actor);
  const rows = db.query<{
    id: string; employeeId: string; branchId: string; status: LeaveStatus; leaveType: LeaveType;
    startDate: string; endDate: string; days: number;
  }>(
    `SELECT l.id, l.employee_id AS employeeId, l.branch_id AS branchId,
            l.status, l.leave_type AS leaveType, l.start_date AS startDate,
            l.end_date AS endDate, l.days
     FROM employee_leave_requests l
     JOIN employees e ON e.id = l.employee_id
     WHERE ${scope.clause} AND l.start_date <= ? AND l.end_date >= ?`,
    [...scope.params, yearEnd(targetYear), yearStart(targetYear)]
  );
  const summary: LeaveSummary = {
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    approvedDays: 0,
    daysByType: { ANNUAL: 0, SICK: 0, UNPAID: 0, OTHER: 0 },
  };
  for (const row of rows) {
    if (row.status === 'PENDING') summary.pending += 1;
    if (row.status === 'APPROVED') {
      summary.approved += 1;
      const start = row.startDate > yearStart(targetYear) ? row.startDate : yearStart(targetYear);
      const end = row.endDate < yearEnd(targetYear) ? row.endDate : yearEnd(targetYear);
      const days = getChargeableDays(db, row.employeeId, row.branchId, start, end);
      summary.approvedDays += days;
      summary.daysByType[row.leaveType] += days;
    }
    if (row.status === 'REJECTED') summary.rejected += 1;
    if (row.status === 'CANCELLED') summary.cancelled += 1;
  }
  return summary;
}

export async function getCalendarAsync(
  deps: LeaveServiceDeps,
  actor: User,
  period: string
): Promise<LeaveCalendarEntry[]> {
  const { db } = deps;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('صيغة الشهر غير صحيحة (YYYY-MM).');
  const start = `${period}-01`;
  const month = Number(period.slice(5, 7));
  const year = Number(period.slice(0, 4));
  const end = `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  const scope = employeeDataScope(deps, actor);
  const [requests, absences] = await Promise.all([
    db.queryAsync<{
      employeeId: string; employeeName: string; branchId: string; leaveType: LeaveType;
      status: 'PENDING' | 'APPROVED'; startDate: string; endDate: string;
    }>(
      `SELECT l.employee_id AS employeeId, e.name AS employeeName,
              l.branch_id AS branchId, l.leave_type AS leaveType, l.status,
              l.start_date AS startDate, l.end_date AS endDate
       FROM employee_leave_requests l JOIN employees e ON e.id = l.employee_id
       WHERE l.status IN ('PENDING', 'APPROVED') AND l.start_date <= ? AND l.end_date >= ?
         AND ${scope.clause}
       ORDER BY l.start_date, e.name`,
      [end, start, ...scope.params]
    ),
    db.queryAsync<{ date: string; employeeId: string; employeeName: string }>(
      `SELECT a.date, a.employee_id AS employeeId, e.name AS employeeName
       FROM attendance a JOIN employees e ON e.id = a.employee_id
       WHERE a.status = 'ABSENT' AND a.date BETWEEN ? AND ? AND ${scope.clause}
       ORDER BY a.date, e.name`,
      [start, end, ...scope.params]
    ),
  ]);
  const leaveEntries: LeaveCalendarEntry[] = [];
  for (const request of requests) {
    const rangeStart = request.startDate > start ? request.startDate : start;
    const rangeEnd = request.endDate < end ? request.endDate : end;
    const dates = await getChargeableDatesAsync(db, request.employeeId, request.branchId, rangeStart, rangeEnd);
    for (const date of dates) {
      leaveEntries.push({
        date,
        employeeId: request.employeeId,
        employeeName: request.employeeName,
        leaveType: request.leaveType,
        status: request.status,
      });
    }
  }
  const absenceEntries = absences.map((row) => ({ ...row, leaveType: null, status: 'ABSENT' as const }));
  return [...leaveEntries, ...absenceEntries].sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName));
}

export async function getSummaryAsync(
  deps: LeaveServiceDeps,
  actor: User,
  year?: number
): Promise<LeaveSummary> {
  const { db } = deps;
  const targetYear = year ?? new Date().getFullYear();
  if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
    throw new Error('السنة غير صالحة.');
  }
  const scope = employeeDataScope(deps, actor);
  const rows = await db.queryAsync<{
    id: string; employeeId: string; branchId: string; status: LeaveStatus; leaveType: LeaveType;
    startDate: string; endDate: string; days: number;
  }>(
    `SELECT l.id, l.employee_id AS employeeId, l.branch_id AS branchId,
            l.status, l.leave_type AS leaveType, l.start_date AS startDate,
            l.end_date AS endDate, l.days
     FROM employee_leave_requests l
     JOIN employees e ON e.id = l.employee_id
     WHERE ${scope.clause} AND l.start_date <= ? AND l.end_date >= ?`,
    [...scope.params, yearEnd(targetYear), yearStart(targetYear)]
  );
  const summary: LeaveSummary = {
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    approvedDays: 0,
    daysByType: { ANNUAL: 0, SICK: 0, UNPAID: 0, OTHER: 0 },
  };
  for (const row of rows) {
    if (row.status === 'PENDING') summary.pending += 1;
    if (row.status === 'APPROVED') {
      summary.approved += 1;
      const start = row.startDate > yearStart(targetYear) ? row.startDate : yearStart(targetYear);
      const end = row.endDate < yearEnd(targetYear) ? row.endDate : yearEnd(targetYear);
      const days = await getChargeableDaysAsync(db, row.employeeId, row.branchId, start, end);
      summary.approvedDays += days;
      summary.daysByType[row.leaveType] += days;
    }
    if (row.status === 'REJECTED') summary.rejected += 1;
    if (row.status === 'CANCELLED') summary.cancelled += 1;
  }
  return summary;
}
