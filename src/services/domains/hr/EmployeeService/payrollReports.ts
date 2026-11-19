import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import type { EmployeeDepartmentAccessService } from '../../auth/EmployeeDepartmentAccessService';
import { roundMoney } from './utils';
import type {
  Attendance,
  Employee,
  EmployeeFinancials,
  EmployeePayrollPayable,
  EmployeeServiceActor,
  PayrollPaymentReconciliation,
  PayrollPaymentReconciliationItem,
  PayrollRun,
  PayrollTxType,
} from './types';

export interface ScopedQueryServices {
  branchAccess: BranchAccessService;
  departmentAccess: EmployeeDepartmentAccessService;
}

/** Pure reconciliation report for a payroll run's payout items. */
export function buildPaymentReconciliation(run: PayrollRun): PayrollPaymentReconciliation {
  const items = run.items.map((item): PayrollPaymentReconciliationItem => {
    const issues: string[] = [];
    const paidAmount = roundMoney(Number(item.paidAmount) || 0);
    const difference = roundMoney(paidAmount - item.netAmount);
    if (item.netAmount > 0 && item.payoutStatus !== 'PAID') issues.push('لم تُسجل عملية صرف لهذا الموظف.');
    if (Math.abs(difference) > 0.009) issues.push('المبلغ المصروف لا يطابق صافي المستحق.');
    if (item.paymentMethod === 'BANK_TRANSFER' && item.payoutStatus === 'PAID' && !item.paymentReference) {
      issues.push('لا يوجد مرجع تحويل بنكي.');
    }
    if (item.paymentMethod === 'BANK_TRANSFER' && item.payoutStatus === 'PAID' && !item.paymentProof) {
      issues.push('لا يوجد إثبات تحويل.');
    }
    if (item.paymentMethod === 'WALLET' && item.payoutStatus === 'PAID' && !item.paymentReference) {
      issues.push('لا يوجد مرجع عملية المحفظة.');
    }
    return {
      itemId: item.id,
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      paymentMethod: item.paymentMethod,
      expectedAmount: item.netAmount,
      paidAmount,
      difference,
      payoutStatus: item.payoutStatus,
      payoutTransactionId: item.payoutTransactionId,
      paymentReference: item.paymentReference,
      paymentProof: item.paymentProof,
      issues,
    };
  });
  const byMethod = items.reduce((rows, item) => {
    if (item.payoutStatus !== 'PAID') return rows;
    const existing = rows.find((row) => row.method === item.paymentMethod);
    if (existing) {
      existing.count += 1;
      existing.amount = roundMoney(existing.amount + item.paidAmount);
    } else {
      rows.push({ method: item.paymentMethod, count: 1, amount: item.paidAmount });
    }
    return rows;
  }, [] as Array<{ method: PayrollPaymentReconciliationItem['paymentMethod']; count: number; amount: number }>);
  const expectedTotal = roundMoney(items.reduce((sum, item) => sum + item.expectedAmount, 0));
  const paidTotal = roundMoney(items.reduce((sum, item) => sum + item.paidAmount, 0));
  const difference = roundMoney(paidTotal - expectedTotal);
  return {
    runId: run.id,
    period: run.period,
    expectedTotal,
    paidTotal,
    difference,
    isBalanced: Math.abs(difference) <= 0.009 && items.every((item) => !item.issues.length),
    items,
    byMethod,
  };
}

export function getPayrollPayoutOptionsData(
  db: DatabaseManager,
  branchId: string
): {
  bankAccounts: Array<{ id: string; accountName: string; bankName: string; accountNumber: string; currentBalance: number }>;
  registers: Array<{ id: string; name: string; currentBalance: number }>;
} {
  const bankAccounts = db.query<any>(
    `SELECT id, account_name AS accountName, bank_name AS bankName,
            account_number AS accountNumber, COALESCE(current_balance, 0) / 100.0 AS currentBalance
     FROM bank_accounts
     WHERE is_active = 1 AND (branch_id = ? OR branch_id IS NULL)
     ORDER BY branch_id IS NULL, account_name`,
    [branchId]
  ).map((row) => ({ ...row, currentBalance: Number(row.currentBalance) || 0 }));
  const registers = db.query<any>(
    `SELECT id, name, COALESCE(current_balance, 0) / 100.0 AS currentBalance
     FROM cash_registers WHERE branch_id = ? AND is_active = 1
     ORDER BY is_default DESC, name`,
    [branchId]
  ).map((row) => ({ ...row, currentBalance: Number(row.currentBalance) || 0 }));
  return { bankAccounts, registers };
}

export async function getPayrollPayoutOptionsDataAsync(
  db: DatabaseManager,
  branchId: string
): Promise<{
  bankAccounts: Array<{ id: string; accountName: string; bankName: string; accountNumber: string; currentBalance: number }>;
  registers: Array<{ id: string; name: string; currentBalance: number }>;
}> {
  const [bankRows, registerRows] = await Promise.all([
    db.queryAsync<any>(
      `SELECT id, account_name AS accountName, bank_name AS bankName,
              account_number AS accountNumber, COALESCE(current_balance, 0) / 100.0 AS currentBalance
       FROM bank_accounts
       WHERE is_active = 1 AND (branch_id = ? OR branch_id IS NULL)
       ORDER BY branch_id IS NULL, account_name`,
      [branchId]
    ),
    db.queryAsync<any>(
      `SELECT id, name, COALESCE(current_balance, 0) / 100.0 AS currentBalance
       FROM cash_registers WHERE branch_id = ? AND is_active = 1
       ORDER BY is_default DESC, name`,
      [branchId]
    ),
  ]);
  return {
    bankAccounts: bankRows.map((row) => ({ ...row, currentBalance: Number(row.currentBalance) || 0 })),
    registers: registerRows.map((row) => ({ ...row, currentBalance: Number(row.currentBalance) || 0 })),
  };
}

export function buildPayrollPayablesSpec(
  actor: EmployeeServiceActor,
  services: ScopedQueryServices
): { sql: string; params: any[] } {
  const scope = services.branchAccess.sqlScope('e.branch_id', undefined, actor);
  return {
    sql: `
    WITH payroll_lines AS (
      SELECT
        CASE
          WHEN e.reference_type IN ('PAYROLL_SALARY_ACCRUAL','PAYROLL_ADVANCE_APPLICATION')
            THEN substr(e.reference_id, 1, instr(e.reference_id, ':') - 1)
          WHEN e.reference_type IN ('PAYROLL_RUN_ACCRUAL','PAYROLL_RUN_ATTENDANCE_DEDUCTION','PAYROLL_RUN_TAX','PAYROLL_RUN_COMMISSION')
            THEN substr(e.reference_id, 1, instr(e.reference_id, ':') - 1)
          WHEN e.reference_type = 'PAYROLL_TRANSACTION' THEN tx.employee_id
          WHEN e.reference_type = 'PAYROLL_REVERSAL' THEN reversed_tx.employee_id
          ELSE NULL
        END AS employee_id,
        (l.credit - l.debit) / 100.0 AS balance
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id AND e.is_posted = 1
      JOIN chart_of_accounts a ON a.id = l.account_id AND a.code = '2104'
      LEFT JOIN payroll_transactions tx
        ON e.reference_type = 'PAYROLL_TRANSACTION' AND tx.id = e.reference_id
      LEFT JOIN payroll_transactions reversed_tx
        ON e.reference_type = 'PAYROLL_REVERSAL'
        AND substr(e.reference_id, 1, length(reversed_tx.id) + 1) = reversed_tx.id || ':'
      WHERE ${scope.clause}
    )
    SELECT p.employee_id AS employeeId,
           COALESCE(emp.name, 'قيود رواتب غير موزعة') AS employeeName,
           ROUND(SUM(p.balance), 2) AS balance
    FROM payroll_lines p
    LEFT JOIN employees emp ON emp.id = p.employee_id
    GROUP BY p.employee_id, emp.name
    HAVING ABS(SUM(p.balance)) > 0.009
    ORDER BY employeeName
  `,
    params: [...scope.params],
  };
}

export function queryPayrollPayables(
  db: DatabaseManager,
  actor: EmployeeServiceActor,
  services: ScopedQueryServices
): EmployeePayrollPayable[] {
  const { sql, params } = buildPayrollPayablesSpec(actor, services);
  return db.query<EmployeePayrollPayable>(sql, params);
}

export function queryPayrollPayablesAsync(
  db: DatabaseManager,
  actor: EmployeeServiceActor,
  services: ScopedQueryServices
): Promise<EmployeePayrollPayable[]> {
  const { sql, params } = buildPayrollPayablesSpec(actor, services);
  return db.queryAsync<EmployeePayrollPayable>(sql, params);
}

export function buildEmployeeFinancials(
  emp: Employee,
  txRows: Array<{ type: PayrollTxType; total: number }>,
  workingDays: number
): EmployeeFinancials {
  const map: Record<string, number> = {};
  for (const r of txRows) map[r.type] = r.total ?? 0;

  const advances = map['ADVANCE'] ?? 0;
  const bonuses = map['BONUS'] ?? 0;
  const deductions = map['DEDUCTION'] ?? 0;
  const payouts = map['SALARY_PAYOUT'] ?? 0;
  const monthlySalary = emp.salaryType === 'DAILY' ? emp.baseSalary * workingDays : emp.baseSalary;
  const netDue = monthlySalary + bonuses - advances - deductions - payouts;

  return { baseSalary: monthlySalary, advances, bonuses, deductions, payouts, netDue };
}

export function buildAttendanceQuery(
  actor: EmployeeServiceActor,
  services: ScopedQueryServices,
  date?: string
): { sql: string; params: any[] } {
  const { branchAccess, departmentAccess } = services;
  const scope = branchAccess.sqlScope('e.branch_id', undefined, actor);
  const departmentScope = departmentAccess.sqlScope('e.department_id', actor);
  const columns = `a.id, a.employee_id AS employeeId, a.date, a.status,
           COALESCE(a.late_minutes, 0) AS lateMinutes,
           COALESCE(a.overtime_minutes, 0) AS overtimeMinutes,
           a.notes, a.recorded_by AS recordedBy, a.created_at AS createdAt`;
  if (date) {
    return {
      sql: `SELECT ${columns}
       FROM attendance a JOIN employees e ON e.id = a.employee_id
       WHERE a.date = ? AND ${scope.clause} AND ${departmentScope.clause} ORDER BY a.created_at`,
      params: [date, ...scope.params, ...departmentScope.params],
    };
  }
  return {
    sql: `SELECT ${columns}
     FROM attendance a JOIN employees e ON e.id = a.employee_id
     WHERE ${scope.clause} AND ${departmentScope.clause} ORDER BY a.date DESC`,
    params: [...scope.params, ...departmentScope.params],
  };
}

export function listAttendance(
  db: DatabaseManager,
  actor: EmployeeServiceActor,
  services: ScopedQueryServices,
  date?: string
): Attendance[] {
  const { sql, params } = buildAttendanceQuery(actor, services, date);
  return db.query<Attendance>(sql, params);
}

export async function listAttendanceAsync(
  db: DatabaseManager,
  actor: EmployeeServiceActor,
  services: ScopedQueryServices,
  date?: string
): Promise<Attendance[]> {
  const { sql, params } = buildAttendanceQuery(actor, services, date);
  return db.queryAsync<Attendance>(sql, params);
}

export function listLocationCounts(
  db: DatabaseManager,
  actor: EmployeeServiceActor,
  services: ScopedQueryServices
): { location: string; count: number }[] {
  const scope = services.branchAccess.sqlScope('e.branch_id', undefined, actor);
  return db.query<{ location: string; count: number }>(
    `SELECT e.location, COUNT(*) AS count FROM employees e
     WHERE ${scope.clause} GROUP BY e.location ORDER BY count DESC`,
    scope.params
  );
}

export async function listLocationCountsAsync(
  db: DatabaseManager,
  actor: EmployeeServiceActor,
  services: ScopedQueryServices
): Promise<{ location: string; count: number }[]> {
  const scope = services.branchAccess.sqlScope('e.branch_id', undefined, actor);
  return db.queryAsync<{ location: string; count: number }>(
    `SELECT e.location, COUNT(*) AS count FROM employees e
     WHERE ${scope.clause} GROUP BY e.location ORDER BY count DESC`,
    scope.params
  );
}

export function fetchActiveEmployeeSalaries(
  db: DatabaseManager,
  actor: EmployeeServiceActor,
  services: ScopedQueryServices
): { salaryType: string; baseSalary: number }[] {
  const scope = services.branchAccess.sqlScope('e.branch_id', undefined, actor);
  return db.query<{ salaryType: string; baseSalary: number }>(
    `SELECT e.salary_type AS salaryType, e.base_salary / 100.0 AS baseSalary FROM employees e
     WHERE e.status = 'ACTIVE' AND ${scope.clause}`,
    scope.params
  );
}

export async function fetchActiveEmployeeSalariesAsync(
  db: DatabaseManager,
  actor: EmployeeServiceActor,
  services: ScopedQueryServices
): Promise<{ salaryType: string; baseSalary: number }[]> {
  const scope = services.branchAccess.sqlScope('e.branch_id', undefined, actor);
  return db.queryAsync<{ salaryType: string; baseSalary: number }>(
    `SELECT e.salary_type AS salaryType, e.base_salary / 100.0 AS baseSalary FROM employees e
     WHERE e.status = 'ACTIVE' AND ${scope.clause}`,
    scope.params
  );
}

export function computeTotalWagesBill(rows: Array<{ salaryType: string; baseSalary: number }>): number {
  return rows.reduce((sum, e) => {
    return sum + (e.salaryType === 'DAILY' ? e.baseSalary * 26 : e.baseSalary);
  }, 0);
}
