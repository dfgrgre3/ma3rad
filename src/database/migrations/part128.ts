import type { Migration } from './support';
import { tableExists, columnExists } from './support';

/**
 * Migration 213: Store general-ledger money columns as INTEGER piastres.
 *
 * Converts financial columns from REAL (major units, floating-point errors) to
 * INTEGER (piastres, exact arithmetic). The migration:
 *   1. Backfills any existing fractional piastres with ROUND(value * 100).
 *   2. Rebuilds each table with INTEGER columns, copying the rounded data.
 *   3. Removes the old CHECK(ABS(... * 100 - ROUND(... * 100)) < 0.01) constraints
 *      from part127 since INTEGER storage makes them redundant.
 *
 * JavaScript code must wrap SELECT expressions with `/ 100.0` and INSERT/UPDATE
 * parameters with `ROUND(? * 100)` (see src/utils/money.ts).
 *
 * The schema files (part-16.ts, part58.ts, index.ts) have been updated to define
 * these columns as INTEGER for new databases. This migration handles existing
 * databases.
 */

interface MoneyColumnSpec {
  table: string;
  column: string;
}

const MONEY_COLUMNS: MoneyColumnSpec[] = [
  { table: 'chart_of_accounts', column: 'balance' },
  { table: 'journal_entries', column: 'total_debit' },
  { table: 'journal_entries', column: 'total_credit' },
  { table: 'journal_entry_lines', column: 'debit' },
  { table: 'journal_entry_lines', column: 'credit' },
  { table: 'fiscal_year_openings', column: 'debit' },
  { table: 'fiscal_year_openings', column: 'credit' },
  { table: 'fiscal_year_openings', column: 'balance' },
  { table: 'finance_subledger_events', column: 'amount' },
  { table: 'fiscal_period_subledger_snapshots', column: 'balance' },
];

/**
 * Replace a REAL money column with INTEGER piastres.
 *
 * Steps:
 *   1. Read the current CREATE TABLE SQL.
 *   2. Backfill NULLs to 0 (should not happen, but safe).
 *   3. Round existing values to the nearest piastre (ROUND(value * 100)).
 *   4. Replace the column type from REAL to INTEGER in the CREATE SQL.
 *   5. Remove any precision CHECK added by part127 (e.g. ABS("balance" * 100 - ROUND("balance" * 100)) < 0.01).
 *   6. Create a temporary table with the new schema.
 *   7. Copy data (rounded values are already in the source column).
 *   8. Drop old table, rename temp to original.
 *   9. Recreate indexes and triggers.
 */
function convertMoneyColumnToInt(db: any, spec: MoneyColumnSpec): void {
  const { table, column } = spec;
  if (!tableExists(db, table)) return;
  if (!columnExists(db, table, column)) return;

  const createResult = db.exec(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table]
  );
  const originalSql = createResult[0]?.values[0]?.[0];
  if (!originalSql) return;

  // If already INTEGER, skip.
  if (new RegExp(`\\b${column}\\s+INTEGER\\b`, 'i').test(originalSql)) return;

  // Backfill NULLs to 0.
  db.run(`UPDATE "${table}" SET "${column}" = 0 WHERE "${column}" IS NULL`);

  // Round existing REAL values to piastres.
  db.run(`UPDATE "${table}" SET "${column}" = ROUND("${column}" * 100)`);

  // Build new CREATE TABLE SQL.
  let newSql = String(originalSql);

  // Replace REAL -> INTEGER for this column.
  newSql = newSql.replace(
    new RegExp(`(\\b"${column}"\\b|\\b${column}\\b)\\s+REAL\\b`, 'i'),
    `$1 INTEGER`
  );

  // Remove part127 CHECK constraints for this column.
  // Pattern: CHECK(ABS("col" * 100 - ROUND("col" * 100)) < 0.01)
  newSql = newSql.replace(
    new RegExp(`,\\s*CHECK\\(ABS\\("${column}"\\s*\\*\\s*100\\s*-\\s*ROUND\\("${column}"\\s*\\*\\s*100\\)\\)\\s*<\\s*0\\.01\\)`, 'gi'),
    ''
  );

  // Ensure the replacement didn't leave a trailing comma or syntax issue.
  newSql = newSql.replace(/,\s*\)/g, ')');

  // If no change, skip.
  if (newSql === originalSql) return;

  const tmp = `${table}__money_int`;
  newSql = newSql.replace(
    /(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)"?[A-Za-z_][A-Za-z0-9_]*"?/i,
    `$1"${tmp}"`
  );

  // Get existing indexes.
  const indexes = db.exec(
    `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
    [table]
  )[0]?.values || [];

  // Get existing triggers.
  const triggers = db.exec(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL AND sql LIKE ?`,
    [`%${table}%`]
  )[0]?.values || [];

  // Execute rebuild.
  db.exec(`DROP TABLE IF EXISTS "${tmp}"`);
  db.exec(newSql);
  db.exec(`INSERT INTO "${tmp}" SELECT * FROM "${table}"`);

  // Drop triggers on old table before dropping it.
  for (const [triggerName] of triggers) {
    db.exec(`DROP TRIGGER IF EXISTS "${String(triggerName)}"`);
  }

  db.exec(`DROP TABLE "${table}"`);
  db.exec(`ALTER TABLE "${tmp}" RENAME TO "${table}"`);

  // Recreate indexes.
  for (const [sql] of indexes) {
    db.exec(String(sql));
  }

  // Recreate triggers.
  for (const [, sql] of triggers) {
    const triggerSql = String(sql).replace(new RegExp(`\\b${table}\\b`, 'gi'), table);
    db.exec(triggerSql);
  }
}

export const MIGRATION_PART_128: Migration = {
  id: '213_money_minor_units',
  description: 'Convert general-ledger money columns from REAL to INTEGER piastres',
  disableForeignKeys: true,
  up: (db) => {
    for (const spec of MONEY_COLUMNS) {
      convertMoneyColumnToInt(db, spec);
    }
  },
};
