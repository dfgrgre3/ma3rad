import type { Migration } from './support';
import { tableExists, columnExists } from './support';
import { withTableTriggersSuspended } from './triggerSuspend';

interface MoneyColumnSpec { table: string; columns: string[]; }

/**
 * Migration 215: sales transactional money columns -> INTEGER piastres.
 * Activate only after the sales-domain SQL sweep is complete.
 */

const MONEY_TABLES: MoneyColumnSpec[] = [
  { table: 'sales_invoices', columns: ['subtotal','discount_amount','tax_amount','shipping_cost','extra_fees','total_amount','paid_amount','remaining_amount','total_cost','gross_profit','returned_amount'] },
  { table: 'sales_invoice_items', columns: ['unit_price','original_unit_price','unit_cost','discount_amount','total_price','total_cost','profit'] },
  { table: 'sales_returns', columns: ['total_amount','return_tax_amount','refunded_amount','remaining_to_balance'] },
  { table: 'sales_return_items', columns: ['unit_price','unit_cost','total_refund'] },
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
  const pending = columns.filter((col) =>
    columnExists(db, table, col) &&
    !new RegExp(`\\b"${col}"\\b\\s+INTEGER|\\b${col}\\s+INTEGER\\b`, 'i').test(String(originalSql))
  );
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
    newSql = newSql.replace(
      new RegExp(`(\\b"${col}"\\b|\\b${col}\\b)\\s+REAL\\b`, 'i'),
      `$1 INTEGER`
    );
    if (newSql !== before) changed = true;
    // Remove CHECK constraints for this column that use comparison operators
    // Pattern: ,CHECK(column < number) or ,CHECK(column > number) etc.
    const escapedCol = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    newSql = newSql.replace(
      new RegExp(`,\\s*CHECK\\s*\\([^)]*?${escapedCol}\\s*[<>]=?\\s*[^)]*?\\)`, 'gi'),
      ''
    );
  }

  if (!changed) return;
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
  db.exec(newSql);
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

export const MIGRATION_PART_130: Migration = {
  id: '215_sales_money_minor_units',
  description: 'Convert sales invoice/return money columns to INTEGER piastres',
  disableForeignKeys: true,
  up: (db) => { for (const spec of MONEY_TABLES) convertTableColumns(db, spec.table, spec.columns); },
};
