import { v4 as uuidv4 } from 'uuid';
import type { LeaveType } from '../../../../types/hr/leave';
import type { AnnualLeavePolicyRow, LeaveServiceDeps } from './types';
import { daysInMonth, monthEnd, roundLeaveDays, yearEnd, yearStart } from './utils';
import { getYearlyRequestDays } from './requestQueries';

type Db = LeaveServiceDeps['db'];

export function queryAnnualLeavePolicy(
  db: Db,
  branchId: string,
  employeeId: string | null,
  effectiveDate: string
): AnnualLeavePolicyRow | null {
  const scopeKey = employeeId ?? 'BRANCH';
  return db.query<AnnualLeavePolicyRow>(
    `SELECT id, branch_id AS branchId, employee_id AS employeeId,
            effective_from AS effectiveFrom,
            annual_entitlement_days AS annualEntitlementDays,
            carryover_limit_days AS carryoverLimitDays,
            prorate_on_service AS prorateOnService
     FROM employee_leave_accrual_policies
     WHERE branch_id = ? AND scope_key = ? AND effective_from <= ?
     ORDER BY effective_from DESC LIMIT 1`,
    [branchId, scopeKey, effectiveDate]
  )[0] ?? null;
}

export function effectiveAnnualLeavePolicy(
  db: Db,
  employeeId: string,
  branchId: string,
  effectiveDate: string
): AnnualLeavePolicyRow | null {
  const employeePolicy = queryAnnualLeavePolicy(db, branchId, employeeId, effectiveDate);
  if (employeePolicy) {
    if (employeePolicy.annualEntitlementDays !== null) return employeePolicy;
    return queryAnnualLeavePolicy(db, branchId, null, effectiveDate);
  }
  return queryAnnualLeavePolicy(db, branchId, null, effectiveDate);
}

export function insertGeneratedBalanceTransaction(
  db: Db,
  input: {
    employeeId: string;
    branchId: string;
    year: number;
    days: number;
    type: 'ALLOCATION' | 'CARRYOVER';
    effectiveDate: string;
    sourceKey: string;
    reason: string;
    actorId: string;
  }
): void {
  const existing = db.query<{ id: string }>(
    `SELECT id FROM employee_leave_balance_transactions
     WHERE employee_id = ? AND source_key = ?`,
    [input.employeeId, input.sourceKey]
  )[0];
  if (existing) return;
  db.run(
    `INSERT INTO employee_leave_balance_transactions
     (id, employee_id, branch_id, leave_year, days_delta, transaction_type,
      effective_date, reason, created_by, source_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `lbal_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
      input.employeeId,
      input.branchId,
      input.year,
      input.days,
      input.type,
      input.effectiveDate,
      input.reason,
      input.actorId,
      input.sourceKey,
    ]
  );
}

export function ensureAnnualLeaveAccrual(
  db: Db,
  employeeId: string,
  branchId: string,
  asOfDate: string,
  actorId: string
): void {
  const today = new Date().toISOString().slice(0, 10);
  const accrualThroughDate = asOfDate < today ? asOfDate : today;
  const employee = db.query<{ joinedDate: string; terminatedAt: string | null }>(
    'SELECT joined_date AS joinedDate, terminated_at AS terminatedAt FROM employees WHERE id = ? AND branch_id = ?',
    [employeeId, branchId]
  )[0];
  if (!employee || employee.joinedDate > accrualThroughDate) return;

  const firstYear = Number(employee.joinedDate.slice(0, 4));
  const finalYear = Number(accrualThroughDate.slice(0, 4));
  for (let year = firstYear; year <= finalYear; year += 1) {
    const janFirst = yearStart(year);
    if (year > firstYear && janFirst <= accrualThroughDate) {
      const carryPolicy = effectiveAnnualLeavePolicy(db, employeeId, branchId, janFirst);
      const carrySource = `CARRYOVER:${year}`;
      if (carryPolicy) {
        const previousYear = year - 1;
        const priorBalance = Number(db.query<{ days: number }>(
          `SELECT COALESCE(SUM(days_delta), 0) AS days
           FROM employee_leave_balance_transactions
           WHERE employee_id = ? AND leave_year = ? AND effective_date <= ?`,
          [employeeId, previousYear, yearEnd(previousYear)]
        )[0]?.days ?? 0);
        const approvedDays = getYearlyRequestDays(
          db, employeeId, 'ANNUAL' as LeaveType, previousYear, undefined, 'APPROVED', yearEnd(previousYear)
        );
        const carryoverDays = roundLeaveDays(Math.min(
          Math.max(0, priorBalance - approvedDays),
          Number(carryPolicy.carryoverLimitDays ?? 0)
        ));
        if (carryoverDays > 0) {
          insertGeneratedBalanceTransaction(db, {
            employeeId,
            branchId,
            year,
            days: carryoverDays,
            type: 'CARRYOVER',
            effectiveDate: janFirst,
            sourceKey: carrySource,
            reason: `ترحيل تلقائي من رصيد ${previousYear}`,
            actorId,
          });
        }
      }
    }

    for (let month = 1; month <= 12; month += 1) {
      const periodEnd = monthEnd(year, month);
      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
      if (employee.terminatedAt && employee.terminatedAt < periodStart) break;
      const effectiveDate = employee.terminatedAt && employee.terminatedAt < periodEnd
        ? employee.terminatedAt
        : periodEnd;
      if (effectiveDate > accrualThroughDate) break;
      if (effectiveDate < employee.joinedDate) continue;
      const serviceEnd = employee.terminatedAt && employee.terminatedAt < periodEnd
        ? employee.terminatedAt
        : periodEnd;
      if (serviceEnd < periodStart) continue;

      const policy = effectiveAnnualLeavePolicy(db, employeeId, branchId, periodStart);
      const entitlement = Number(policy?.annualEntitlementDays ?? 0);
      if (!policy || entitlement <= 0) continue;

      let accrual = entitlement / 12;
      if (policy.prorateOnService) {
        const activeStart = employee.joinedDate > periodStart ? employee.joinedDate : periodStart;
        const activeDays = Math.max(0, Math.floor(
          (new Date(`${serviceEnd}T00:00:00Z`).getTime() - new Date(`${activeStart}T00:00:00Z`).getTime())
            / 86400000
        ) + 1);
        accrual *= activeDays / daysInMonth(year, month);
      }
      accrual = roundLeaveDays(accrual);
      if (accrual <= 0) continue;
      insertGeneratedBalanceTransaction(db, {
        employeeId,
        branchId,
        year,
        days: accrual,
        type: 'ALLOCATION',
        effectiveDate,
        sourceKey: `ACCRUAL:${year}-${String(month).padStart(2, '0')}`,
        reason: `استحقاق شهري تلقائي ${year}-${String(month).padStart(2, '0')}`,
        actorId,
      });
    }
  }
}
