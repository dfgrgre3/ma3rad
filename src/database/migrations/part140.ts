import type { Migration } from './support';
import { tableExists, columnExists } from './support';

interface MoneyColumnSpec { table: string; columns: string[]; }

/**
 * Migration 224: finance extras money columns -> INTEGER piastres.
 * Activate only after the corresponding SQL sweep is complete.
 */

const MONEY_TABLES: MoneyColumnSpec[] = [
  { table: 'bank_reconciliations', columns: ['statement_balance','book_balance','unreconciled_difference','cleared_deposits','cleared_withdrawals'] },
  { table: 'bank_reconciliation_lines', columns: ['amount'] },
  { table: 'budgets', columns: ['total_allocated'] },
  { table: 'budget_items', columns: ['allocated_amount'] },
  { table: 'cash_forecast_items', columns: ['amount'] },
  { table: 'payment_gateways', columns: ['fixed_fee'] },
  { table: 'payment_gateway_settlements', columns: ['gross_amount','commission_amount','tax_deduction','net_amount'] },
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
    throw new Error(`part140 rebuild failed for ${table}: ${err instanceof Error ? err.message : String(err)}\nSQL: ${newSql}`);
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

export const MIGRATION_PART_140: Migration = {
  id: '224_finance_extras_money_minor_units',
  description: 'Convert finance extras money columns to INTEGER piastres',
  disableForeignKeys: true,
  up: (db) => { for (const spec of MONEY_TABLES) convertTableColumns(db, spec.table, spec.columns); },
};
