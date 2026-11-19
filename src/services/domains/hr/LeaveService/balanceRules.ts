import type { LeaveType } from '../../../../types/hr/leave';
import type { LeaveServiceDeps } from './types';
import { dateYears, yearEnd, yearStart } from './utils';
import { getChargeableDays, getYearlyRequestDays } from './requestQueries';
import { ensureAnnualLeaveAccrual } from './accrual';

type Db = LeaveServiceDeps['db'];

export function assertAnnualBalance(
  db: Db,
  employeeId: string,
  branchId: string,
  startDate: string,
  endDate: string,
  actorId: string,
  excludeId?: string
): void {
  for (const year of dateYears(startDate, endDate)) {
    const start = startDate > yearStart(year) ? startDate : yearStart(year);
    const end = endDate < yearEnd(year) ? endDate : yearEnd(year);
    const requestedDays = getChargeableDays(db, employeeId, branchId, start, end);
    ensureAnnualLeaveAccrual(db, employeeId, branchId, start, actorId);
    const grantedDays = db.query<{ days: number }>(
      `SELECT COALESCE(SUM(days_delta), 0) AS days
       FROM employee_leave_balance_transactions
       WHERE employee_id = ? AND branch_id = ? AND leave_year = ? AND effective_date <= ?`,
      [employeeId, branchId, year, start]
    )[0]?.days ?? 0;
    const reservedDays = getYearlyRequestDays(db, employeeId, 'ANNUAL', year, excludeId);
    if (reservedDays + requestedDays > Number(grantedDays) + 1e-8) {
      throw new Error(
        `رصيد الإجازة السنوية غير كافٍ لعام ${year}. المتاح بعد الطلبات الحالية ${Math.max(0, Number(grantedDays) - reservedDays)} يوم، والمطلوب ${requestedDays} يوم.`
      );
    }
  }
}

export function assertTypeLimits(
  db: Db,
  employeeId: string,
  branchId: string,
  leaveType: LeaveType,
  startDate: string,
  endDate: string,
  excludeId?: string
): void {
  for (const year of dateYears(startDate, endDate)) {
    const policy = db.query<{ maxDaysPerYear: number | null }>(
      `SELECT max_days_per_year AS maxDaysPerYear
       FROM employee_leave_type_policies WHERE branch_id = ? AND leave_type = ?`,
      [branchId, leaveType]
    )[0];
    if (policy?.maxDaysPerYear == null) continue;

    const start = startDate > yearStart(year) ? startDate : yearStart(year);
    const end = endDate < yearEnd(year) ? endDate : yearEnd(year);
    const requestedDays = getChargeableDays(db, employeeId, branchId, start, end);
    const usedDays = getYearlyRequestDays(db, employeeId, leaveType, year, excludeId);
    if (usedDays + requestedDays > policy.maxDaysPerYear + 1e-8) {
      throw new Error(
        `يتجاوز الطلب الحد السنوي المحدد لنوع الإجازة (${policy.maxDaysPerYear} يوم) لعام ${year}.`
      );
    }
  }
}
