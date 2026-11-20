import type { Migration } from './support';
import { tableExists, columnExists } from './support';
import { withTableTriggersSuspended } from './triggerSuspend';

interface MoneyColumnSpec { table: string; columns: string[]; }

/**
 * Migration 221: HR / payroll money columns -> INTEGER piastres.
 * Activate only after the corresponding SQL sweep is complete.
 */

const MONEY_TABLES: MoneyColumnSpec[] = [
  { table: 'employees', columns: ['base_salary','monthly_target'] },
  { table: 'employee_contracts', columns: ['salary'] },
  { table: 'employee_salary_history', columns: ['previous_salary','next_salary'] },
  { table: 'job_grades', columns: ['min_salary','max_salary'] },
  { table: 'hr_candidate_offers', columns: ['salary'] },
  { table: 'payroll_transactions', columns: ['amount'] },
  { table: 'payroll_run_items', columns: ['base_salary','base_amount','overtime_amount','bonus_amount','commission_amount','advance_amount','manual_deduction_amount','attendance_deduction_amount','tax_amount','gross_amount','net_amount','paid_amount','allowance_amount','loan_deduction_amount','social_insurance_base','social_insurance_employee_share','social_insurance_employer_share','social_insurance_total','end_of_service_benefit'] },
  { table: 'payroll_social_insurance_contributions', columns: ['contribution_base','employee_share_amount','employer_share_amount','total_amount'] },
  { table: 'payroll_social_insurance_rules', columns: ['contribution_ceiling','minimum_contribution_base','maximum_contribution_base'] },
  { table: 'payroll_end_of_service_settlements', columns: ['last_monthly_salary','benefit_amount'] },
  { table: 'employee_final_settlements', columns: ['base_salary','earned_wages','leave_payout','total_amount'] },
  { table: 'hr_leave_settlements', columns: ['amount'] },
  { table: 'hr_loans', columns: ['principal','installment_amount','remaining_balance'] },
  { table: 'hr_loan_installments', columns: ['amount'] },
  { table: 'hr_allowances', columns: ['amount'] },
  { table: 'hr_benefits', columns: ['amount'] },
  { table: 'hr_penalties', columns: ['amount'] },
  { table: 'hr_workforce_plans', columns: ['approved_recruitment_budget','expected_employee_cost'] },
  { table: 'performance_rewards', columns: ['amount'] },
  { table: 'training_courses', columns: ['cost'] },
  { table: 'training_expenses', columns: ['amount'] },
];

function convertTableColumns(db: any, table: string, columns: string[]): void {
  withTableTriggersSuspended(db, table, () => convertTableColumnsInner(db, table, columns));
}

function convertTableColumnsInner(db: any, table: string, columns: string[]): void {
  if (!tableExists(db, table)) return;

  const createResult = db.exec(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table]
  );
  const originalSql = createResult[0]?.values[0]?.[0];
  if (!originalSql) return;

  // Skip when every money column is already INTEGER.
  const pending = columns.filter((col) => {
    if (!columnExists(db, table, col)) return false;
    const escaped = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return !new RegExp(`"${escaped}"\\s+INTEGER|\\b${escaped}\\s+INTEGER\\b`, 'i').test(String(originalSql));
  });
  if (pending.length === 0) return;

  let newSql = String(originalSql);
  let changed = false;

  for (const col of pending) {
    // Backfill NULLs.
    db.run(`UPDATE "${table}" SET "${col}" = 0 WHERE "${col}" IS NULL`);
    // Round to piastres.
    db.run(`UPDATE "${table}" SET "${col}" = ROUND("${col}" * 100)`);
    // REAL -> INTEGER in DDL.
    const before = newSql;
    const escapedCol = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    newSql = newSql.replace(
      new RegExp(`("${escapedCol}"|\\b${escapedCol}\\b)\\s+REAL\\b`, 'i'),
      `$1 INTEGER`
    );
    if (newSql !== before) changed = true;
    // NOTE: precision CHECKs added by part127 stay valid — piastres are
    // integers, so ABS(col*100 - ROUND(col*100)) is always 0.
  }

  // Columns added later via ALTER TABLE are absent from the CREATE sql;
  // append them (in PRAGMA order) so INSERT INTO ... SELECT * stays aligned.
  const pragma = db.exec(`PRAGMA table_info("${table}")`)[0]?.values || [];
  const missingDefs: string[] = [];
  let missingMoney = false;
  for (const row of pragma) {
    const colName = String(row[1]);
    const colType = String(row[2] || 'TEXT');
    const escaped = colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const defined = new RegExp(
      `"${escaped}"\\s+\\w|\\b${escaped}\\b\\s+(REAL|INTEGER|TEXT|NUMERIC|BLOB)`,
      'i'
    ).test(newSql);
    if (defined) continue;
    const isMoney = columns.includes(colName);
    if (isMoney) missingMoney = true;
    const notNull = row[3] === 1 ? ' NOT NULL' : '';
    const dflt = row[4] != null ? ` DEFAULT ${row[4]}` : '';
    missingDefs.push(`, "${colName}" ${isMoney ? 'INTEGER' : colType}${notNull}${dflt}`);
  }

  if (!changed && !missingMoney) return;
  if (missingDefs.length > 0) {
    newSql = newSql.replace(/\)\s*$/, `${missingDefs.join('')})`);
  }
  newSql = newSql.replace(/,\s*\)/g, ')');

  const tmp = `${table}__money_int`;
  newSql = newSql.replace(
    /(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)"?[A-Za-z_][A-Za-z0-9_]*"?/i,
    `$1"${tmp}"`
  );

  const indexes = db.exec(
    `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
    [table]
  )[0]?.values || [];

  const triggers = db.exec(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL AND sql LIKE ?`,
    [`%${table}%`]
  )[0]?.values || [];

  db.exec(`DROP TABLE IF EXISTS "${tmp}"`);
  try {
    db.exec(newSql);
  } catch (err) {
    throw new Error(`part137 rebuild failed for ${table}: ${err instanceof Error ? err.message : String(err)}\nSQL: ${newSql}`);
  }
  db.exec(`INSERT INTO "${tmp}" SELECT * FROM "${table}"`);

  for (const [triggerName] of triggers) {
    db.exec(`DROP TRIGGER IF EXISTS "${String(triggerName)}"`);
  }

  db.exec(`DROP TABLE "${table}"`);
  db.exec(`ALTER TABLE "${tmp}" RENAME TO "${table}"`);

  for (const [sql] of indexes) {
    db.exec(String(sql));
  }
  for (const [, sql] of triggers) {
    db.exec(String(sql));
  }
}

export const MIGRATION_PART_137: Migration = {
  id: '221_hr_payroll_money_minor_units',
  description: 'Convert HR/payroll money columns to INTEGER piastres',
  disableForeignKeys: true,
  up: (db) => { for (const spec of MONEY_TABLES) convertTableColumns(db, spec.table, spec.columns); },
};
