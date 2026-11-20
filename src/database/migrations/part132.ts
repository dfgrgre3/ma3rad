import type { Migration } from './support';
import { tableExists, columnExists } from './support';
import { withTableTriggersSuspended } from './triggerSuspend';

interface MoneyColumnSpec { table: string; columns: string[]; }

/**
 * Migration 217: payments/parties/expenses money columns -> INTEGER piastres.
 * Activate only after the parties-domain SQL sweep is complete.
 */

const MONEY_TABLES: MoneyColumnSpec[] = [
  { table: 'customer_payments', columns: ['amount'] },
  { table: 'customer_payment_allocations', columns: ['amount'] },
  { table: 'supplier_payments', columns: ['amount'] },
  { table: 'supplier_payment_allocations', columns: ['amount'] },
  { table: 'customers', columns: ['credit_limit','current_balance','total_purchases'] },
  { table: 'suppliers', columns: ['credit_limit','current_balance','total_purchases'] },
  { table: 'expenses', columns: ['amount'] },
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

export const MIGRATION_PART_132: Migration = {
  id: '217_parties_money_minor_units',
  description: 'Convert payments, customer/supplier balances and expenses to INTEGER piastres',
  disableForeignKeys: true,
  up: (db) => { for (const spec of MONEY_TABLES) convertTableColumns(db, spec.table, spec.columns); },
};
