import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { PayrollRun, PayrollRunItem } from './types';

export function buildPayrollRunQuery(where: string, params: any[]): { sql: string; params: any[] } {
  return {
    sql: `SELECT pr.id, pr.period, pr.branch_id AS branchId, pr.status,
            pr.created_at AS createdAt, pr.approved_at AS approvedAt,
            pr.paid_at AS paidAt, pr.closed_at AS closedAt
     FROM payroll_runs pr
     WHERE ${where}`,
    params,
  };
}

const PAYROLL_RUN_ITEM_COLUMNS = `id, employee_id AS employeeId, branch_id AS branchId, employee_name AS employeeName,
       salary_type AS salaryType, base_salary / 100.0 AS baseSalary, expected_workdays AS expectedWorkdays,
       absent_days AS absentDays, unpaid_leave_days AS unpaidLeaveDays,
       late_minutes AS lateMinutes, overtime_minutes AS overtimeMinutes,
       base_amount / 100.0 AS baseAmount, overtime_amount / 100.0 AS overtimeAmount,
       bonus_amount / 100.0 AS bonusAmount, commission_amount / 100.0 AS commissionAmount,
       allowance_amount / 100.0 AS allowanceAmount, loan_deduction_amount / 100.0 AS loanDeductionAmount,
       advance_amount / 100.0 AS advanceAmount, manual_deduction_amount / 100.0 AS manualDeductionAmount,
       attendance_deduction_amount / 100.0 AS attendanceDeductionAmount, tax_amount / 100.0 AS taxAmount,
       social_insurance_base / 100.0 AS socialInsuranceBase,
       social_insurance_employee_share / 100.0 AS socialInsuranceEmployeeShare,
       social_insurance_employer_share / 100.0 AS socialInsuranceEmployerShare,
       social_insurance_total / 100.0 AS socialInsuranceTotal,
       gross_amount / 100.0 AS grossAmount, net_amount / 100.0 AS netAmount, warning_json AS warningJson,
       detail_json AS detailJson, payout_transaction_id AS payoutTransactionId,
       payment_method AS paymentMethod, payment_reference AS paymentReference,
       payment_proof AS paymentProof, paid_amount / 100.0 AS paidAmount, payout_status AS payoutStatus`;

function mapPayrollRunItemRow(row: any): PayrollRunItem {
  return {
    ...row,
    warnings: JSON.parse(row.warningJson),
    details: JSON.parse(row.detailJson),
  };
}

export function readPayrollRunItemsSync(db: DatabaseManager, runId: string): PayrollRunItem[] {
  const rows = db.query<any>(
    `SELECT ${PAYROLL_RUN_ITEM_COLUMNS}
     FROM payroll_run_items WHERE payroll_run_id = ? ORDER BY employee_name`,
    [runId]
  );
  return rows.map(mapPayrollRunItemRow);
}

export async function readPayrollRunItemsAsync(db: DatabaseManager, runId: string): Promise<PayrollRunItem[]> {
  const rows = await db.queryAsync<any>(
    `SELECT ${PAYROLL_RUN_ITEM_COLUMNS}
     FROM payroll_run_items WHERE payroll_run_id = ? ORDER BY employee_name`,
    [runId]
  );
  return rows.map(mapPayrollRunItemRow);
}

/**
 * Batch-fetch items for all runs in one worker query (avoids N+1 round-trips).
 * Returns a map keyed by payroll_run_id.
 */
export async function readPayrollRunItemsBatchAsync(
  db: DatabaseManager,
  runIds: string[]
): Promise<Map<string, PayrollRunItem[]>> {
  const placeholders = runIds.map(() => '?').join(',');
  const itemRows = await db.queryAsync<any>(
    `SELECT payroll_run_id AS runId, ${PAYROLL_RUN_ITEM_COLUMNS}
     FROM payroll_run_items WHERE payroll_run_id IN (${placeholders}) ORDER BY employee_name`,
    runIds
  );
  const itemsByRun = new Map<string, PayrollRunItem[]>();
  for (const row of itemRows) {
    const { runId, ...item } = row;
    const list = itemsByRun.get(runId) || [];
    list.push({
      ...item,
      warnings: JSON.parse(item.warningJson),
      details: JSON.parse(item.detailJson),
    } as PayrollRunItem);
    itemsByRun.set(runId, list);
  }
  return itemsByRun;
}

export function readPayrollRunSync(db: DatabaseManager, run: any): PayrollRun {
  const items = readPayrollRunItemsSync(db, run.id);
  return { ...run, items };
}

export async function readPayrollRunAsync(db: DatabaseManager, run: any): Promise<PayrollRun> {
  return { ...run, items: await readPayrollRunItemsAsync(db, run.id) };
}

export function mapPayrollRunRows(db: DatabaseManager, rows: any[]): PayrollRun[] {
  return rows.map((run) => readPayrollRunSync(db, run));
}
