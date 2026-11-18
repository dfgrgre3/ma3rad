import type { Migration } from './support';
import { tableExists, columnExists } from './support';

interface MoneyColumnSpec { table: string; columns: string[]; }

/**
 * Migration 223: assets / facilities / operations money columns -> INTEGER piastres.
 * Activate only after the corresponding SQL sweep is complete.
 */

const MONEY_TABLES: MoneyColumnSpec[] = [
  { table: 'fixed_assets', columns: ['purchase_cost','salvage_value','accumulated_depreciation'] },
  { table: 'fixed_asset_depreciation_periods', columns: ['amount'] },
  { table: 'fixed_asset_depreciation_requests', columns: ['amount'] },
  { table: 'fixed_asset_disposals', columns: ['sale_proceeds','expenses','accumulated_depreciation','book_value','gain_loss'] },
  { table: 'fixed_asset_maintenance', columns: ['cost'] },
  { table: 'facility_assets', columns: ['purchase_price'] },
  { table: 'facility_asset_maintenance_logs', columns: ['cost'] },
  { table: 'facility_cleaning_supplies', columns: ['unit_cost'] },
  { table: 'facility_contracts', columns: ['payment_amount','sla_penalty_per_delay'] },
  { table: 'facility_contract_payments', columns: ['amount_due','amount_paid'] },
  { table: 'facility_contract_renewals', columns: ['new_payment_amount'] },
  { table: 'facility_utility_bills', columns: ['amount_due','amount_paid'] },
  { table: 'facility_utility_meters', columns: ['tariff_per_unit','fixed_monthly_fee'] },
  { table: 'facility_utility_readings', columns: ['cost'] },
  { table: 'facility_work_orders', columns: ['labor_cost','parts_cost','service_cost'] },
  { table: 'vehicle_maintenance', columns: ['cost'] },
  { table: 'manufacturing_maintenance', columns: ['cost'] },
  { table: 'operation_shift_handovers', columns: ['expected_cash','actual_cash','cash_difference','cash_delivered'] },
  { table: 'warranty_claim_executions', columns: ['amount'] },
  { table: 'business_partners', columns: ['capital_amount'] },
  { table: 'partner_account_transactions', columns: ['amount','balance_effect'] },
  { table: 'partner_capital_history', columns: ['old_amount','new_amount'] },
  { table: 'finance_subledger_control_baselines', columns: ['balance'] },
  { table: 'finance_subledger_control_baselines_company', columns: ['balance'] },
  { table: 'finance_subledger_party_baselines', columns: ['balance'] },
  { table: 'finance_subledger_party_baselines_company', columns: ['balance'] },
  { table: 'finance_subledger_manual_reconciliations', columns: ['verified_subledger_balance','control_balance'] },
];

function convertTableColumns(db: any, table: string, columns: string[]): void {
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
    throw new Error(`part139 rebuild failed for ${table}: ${err instanceof Error ? err.message : String(err)}\nSQL: ${newSql}`);
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

export const MIGRATION_PART_139: Migration = {
  id: '223_assets_facilities_ops_money_minor_units',
  description: 'Convert asset/facility/operations money columns to INTEGER piastres',
  disableForeignKeys: true,
  up: (db) => { for (const spec of MONEY_TABLES) convertTableColumns(db, spec.table, spec.columns); },
};
