import type { Migration } from './support';
import { tableExists } from './support';

const TABLES = [
  'analytics_snapshots',
  'cash_forecast_items',
  'training_courses',
  'dynamic_records',
  'operational_field_values',
];

// All current writers populate branch_id (verified via grep); the only
// schema-only table (cash_forecast_items) has no writer at all. Rebuild each
// table with branch_id NOT NULL DEFAULT 'br_main' so any future writer that
// omits the column still lands in a valid scope.
function rebuildNotNullBranch(db: any, table: string): string {
  if (!tableExists(db, table)) return 'missing';

  const createSql = db.exec(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${table}'`,
  )[0]?.values[0]?.[0];
  if (!createSql) return 'missing-sql';

  let newSql = String(createSql);
  const colRe = /("?branch_id"?\s+TEXT)(?!\s+NOT\s+NULL)/i;
  if (!colRe.test(newSql)) return 'already-not-null-or-absent';
  newSql = newSql.replace(colRe, `"branch_id" TEXT NOT NULL DEFAULT 'br_main'`);

  const tmp = `${table}__notnull`;
  newSql = newSql.replace(
    /(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)"?[A-Za-z_][A-Za-z0-9_]*"?/i,
    `$1"${tmp}"`,
  );

  const indexes = db.exec(
    `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = '${table}' AND sql IS NOT NULL`,
  )[0]?.values || [];
  const namePattern = new RegExp(`\\b${table}\\b`);
  const triggers = (db.exec(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL`,
  )[0]?.values || []).filter((row: any[]) => namePattern.test(String(row[1])));

  db.exec(`DROP TABLE IF EXISTS "${tmp}"`);
  db.exec(newSql);
  db.exec(`INSERT INTO "${tmp}" SELECT * FROM "${table}"`);
  for (const [triggerName] of triggers) db.exec(`DROP TRIGGER IF EXISTS "${String(triggerName)}"`);
  db.exec(`DROP TABLE "${table}"`);
  db.exec(`ALTER TABLE "${tmp}" RENAME TO "${table}"`);

  for (const [sql] of indexes) db.exec(String(sql));
  for (const [, sql] of triggers) db.exec(String(sql));
  return 'rebuilt';
}

export const MIGRATION_PART_125: Migration = {
  id: '210_branch_id_not_null_scope_gap_tables',
  description: 'Make branch_id NOT NULL on tables that gained it in 205',
  disableForeignKeys: true,
  up: (db) => {
    for (const t of TABLES) rebuildNotNullBranch(db, t);
  },
};
