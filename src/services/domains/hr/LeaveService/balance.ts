import { v4 as uuidv4 } from 'uuid';
import type { User } from '../../../../types/auth/identity';
import type {
  LeaveBalanceSummary,
  LeaveBalanceTransaction,
  LeaveServiceDeps,
} from './types';
import { assertDate, yearEnd, yearStart } from './utils';
import { employeeDataScope } from './access';
import {
  getYearlyRequestDays,
  assertPayrollPeriodsEditable,
} from './requestQueries';
import {
  effectiveAnnualLeavePolicy,
  ensureAnnualLeaveAccrual,
} from './accrual';

export function getBalanceSummary(
  deps: LeaveServiceDeps,
  actor: User,
  employeeId: string,
  year: number,
  asOfDate?: string
): LeaveBalanceSummary {
  const { db, branchAccess, departmentAccess } = deps;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('السنة غير صالحة.');
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const balanceDate = asOfDate ?? (
    year < currentYear ? yearEnd(year) : year === currentYear ? today : yearStart(year)
  );
  assertDate(balanceDate, 'تاريخ الرصيد');
  if (balanceDate.slice(0, 4) !== String(year)) throw new Error('تاريخ الرصيد يجب أن يقع في السنة المحددة.');
  const employee = db.query<{ branchId: string }>(
    'SELECT branch_id AS branchId FROM employees WHERE id = ?',
    [employeeId]
  )[0];
  if (!employee) throw new Error('الموظف المحدد غير موجود.');
  branchAccess.requireBranchAccess(employee.branchId, actor);
  departmentAccess.requireEmployeeAccess(employeeId, actor);
  ensureAnnualLeaveAccrual(db, employeeId, employee.branchId, balanceDate, actor.id);
  const grantedDays = Number(db.query<{ days: number }>(
    `SELECT COALESCE(SUM(days_delta), 0) AS days
    FROM employee_leave_balance_transactions WHERE employee_id = ? AND leave_year = ? AND effective_date <= ?`,
    [employeeId, year, balanceDate]
  )[0]?.days ?? 0);
  const approvedDays = getYearlyRequestDays(db, employeeId, 'ANNUAL', year, undefined, 'APPROVED', balanceDate);
  const pendingDays = getYearlyRequestDays(db, employeeId, 'ANNUAL', year, undefined, 'PENDING', balanceDate);
  return {
    year,
    grantedDays,
    approvedDays,
    pendingDays,
    availableDays: grantedDays - approvedDays - pendingDays,
  };
}

export function getAnnualBalanceAsOf(
  deps: LeaveServiceDeps,
  actor: User,
  employeeId: string,
  asOfDate: string
): number {
  const { db, branchAccess, departmentAccess } = deps;
  assertDate(asOfDate, 'تاريخ الرصيد');
  const employee = db.query<{ branchId: string | null; joinedDate: string }>(
    'SELECT branch_id AS branchId, joined_date AS joinedDate FROM employees WHERE id = ?',
    [employeeId]
  )[0];
  if (!employee?.branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
  branchAccess.requireBranchAccess(employee.branchId, actor);
  departmentAccess.requireEmployeeAccess(employeeId, actor);
  ensureAnnualLeaveAccrual(db, employeeId, employee.branchId, asOfDate, actor.id);
  let balance = 0;
  const targetYear = Number(asOfDate.slice(0, 4));
  for (let year = Number(employee.joinedDate.slice(0, 4)); year <= targetYear; year += 1) {
    const end = asOfDate < yearEnd(year) ? asOfDate : yearEnd(year);
    const yearBalance = Number(db.query<{ days: number }>(
      `SELECT COALESCE(SUM(days_delta), 0) AS days
       FROM employee_leave_balance_transactions
       WHERE employee_id = ? AND leave_year = ? AND effective_date <= ?`,
      [employeeId, year, end]
    )[0]?.days ?? 0);
    const remaining = yearBalance
      - getYearlyRequestDays(db, employeeId, 'ANNUAL', year, undefined, 'ALL', end);
    const policy = effectiveAnnualLeavePolicy(db, employeeId, employee.branchId, yearStart(year));
    balance = year === Number(employee.joinedDate.slice(0, 4)) || policy
      ? remaining
      : balance + remaining;
  }
  return Math.max(0, balance);
}

export function getBalanceTransactions(
  deps: LeaveServiceDeps,
  actor: User,
  employeeId: string,
  year: number
): LeaveBalanceTransaction[] {
  const { db, branchAccess, departmentAccess } = deps;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('السنة غير صالحة.');
  const employee = db.query<{ branchId: string | null }>(
    'SELECT branch_id AS branchId FROM employees WHERE id = ?',
    [employeeId]
  )[0];
  if (!employee?.branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
  branchAccess.requireBranchAccess(employee.branchId, actor);
  departmentAccess.requireEmployeeAccess(employeeId, actor);
  const today = new Date().toISOString().slice(0, 10);
  ensureAnnualLeaveAccrual(
    db, employeeId, employee.branchId, yearEnd(year) < today ? yearEnd(year) : today, actor.id
  );
  const scope = employeeDataScope(deps, actor);
  return db.query<LeaveBalanceTransaction>(
    `SELECT t.id, t.employee_id AS employeeId, e.name AS employeeName,
            t.leave_year AS year, t.days_delta AS daysDelta,
            t.transaction_type AS transactionType, t.effective_date AS effectiveDate,
            t.reason, u.full_name AS createdByName, t.created_at AS createdAt
     FROM employee_leave_balance_transactions t
     JOIN employees e ON e.id = t.employee_id
     JOIN users u ON u.id = t.created_by
     WHERE t.employee_id = ? AND t.leave_year = ? AND ${scope.clause}
     ORDER BY t.effective_date DESC, t.created_at DESC`,
    [employeeId, year, ...scope.params]
  );
}

export function adjustAnnualBalance(
  deps: LeaveServiceDeps,
  actor: User,
  input: {
    employeeId: string;
    year: number;
    daysDelta: number;
    transactionType: 'ALLOCATION' | 'CARRYOVER' | 'ADJUSTMENT';
    effectiveDate: string;
    reason: string;
  }
): LeaveBalanceTransaction {
  const { db, branchAccess, departmentAccess } = deps;
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) throw new Error('السنة غير صالحة.');
  assertDate(input.effectiveDate, 'تاريخ الاستحقاق');
  if (input.effectiveDate.slice(0, 4) !== String(input.year)) throw new Error('تاريخ الاستحقاق يجب أن يقع في سنة الرصيد المحددة.');
  if (!['ALLOCATION', 'CARRYOVER', 'ADJUSTMENT'].includes(input.transactionType)) {
    throw new Error('نوع حركة الرصيد غير صالح.');
  }
  if (!Number.isFinite(input.daysDelta) || input.daysDelta === 0) throw new Error('أدخل عدد أيام صحيحًا غير صفري.');
  if (!input.reason.trim()) throw new Error('سبب تعديل الرصيد مطلوب.');

  const employee = db.query<{ branchId: string }>(
    'SELECT branch_id AS branchId FROM employees WHERE id = ?',
    [input.employeeId]
  )[0];
  if (!employee) throw new Error('الموظف المحدد غير موجود.');
  branchAccess.requireBranchAccess(employee.branchId, actor);
  departmentAccess.requireEmployeeAccess(input.employeeId, actor);
  ensureAnnualLeaveAccrual(db, input.employeeId, employee.branchId, input.effectiveDate, actor.id);
  assertPayrollPeriodsEditable(db, {
    branchId: employee.branchId,
    startDate: input.effectiveDate,
    endDate: input.effectiveDate,
  });
  if (input.transactionType === 'CARRYOVER') {
    const policy = effectiveAnnualLeavePolicy(db, input.employeeId, employee.branchId, input.effectiveDate);
    if (policy) {
      const existingCarryover = Number(db.query<{ days: number }>(
        `SELECT COALESCE(SUM(days_delta), 0) AS days
         FROM employee_leave_balance_transactions
         WHERE employee_id = ? AND leave_year = ? AND transaction_type = 'CARRYOVER'
           AND effective_date <= ?`,
        [input.employeeId, input.year, input.effectiveDate]
      )[0]?.days ?? 0);
      if (existingCarryover + input.daysDelta > Number(policy.carryoverLimitDays ?? 0) + 1e-8) {
        throw new Error(`حركة الترحيل تتجاوز الحد المسموح (${policy.carryoverLimitDays} يوم).`);
      }
    }
  }
  const balanceAtEffectiveDate = Number(db.query<{ days: number }>(
    `SELECT COALESCE(SUM(days_delta), 0) AS days
     FROM employee_leave_balance_transactions
     WHERE employee_id = ? AND leave_year = ? AND effective_date <= ?`,
    [input.employeeId, input.year, input.effectiveDate]
  )[0]?.days ?? 0);
  const committedAtDate = getYearlyRequestDays(
    db, input.employeeId, 'ANNUAL', input.year, undefined, 'ALL', input.effectiveDate
  );
  const yearEndBalance = Number(db.query<{ days: number }>(
    `SELECT COALESCE(SUM(days_delta), 0) AS days
     FROM employee_leave_balance_transactions WHERE employee_id = ? AND leave_year = ?`,
    [input.employeeId, input.year]
  )[0]?.days ?? 0);
  const committedForYear = getYearlyRequestDays(db, input.employeeId, 'ANNUAL', input.year);
  if (balanceAtEffectiveDate + input.daysDelta < committedAtDate - 1e-8
    || yearEndBalance + input.daysDelta < committedForYear - 1e-8) {
    throw new Error('لا يمكن خفض الرصيد عن الأيام السنوية المعتمدة أو قيد الانتظار.');
  }

  const id = `lbal_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.executeFinancialTransaction(() => {
    db.run(
      `INSERT INTO employee_leave_balance_transactions
       (id, employee_id, branch_id, leave_year, days_delta, transaction_type, effective_date, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.employeeId, employee.branchId, input.year, input.daysDelta,
        input.transactionType, input.effectiveDate, input.reason.trim(), actor.id,
      ]
    );
    db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, 'تعديل رصيد إجازة سنوية', 'HR', ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
        JSON.stringify(input),
      ]
    );
  });
  return getBalanceTransactions(deps, actor, input.employeeId, input.year).find((row) => row.id === id)!;
}
