import type { Migration } from './support';
import { tableExists } from './support';

interface CheckSpec {
  table: string;
  checks: string[];
  violationWhere: string;
}

const CHECK_SPECS: CheckSpec[] = [
  {
    table: 'journal_entry_lines',
    checks: ['CHECK(debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0))'],
    violationWhere: 'debit < 0 OR credit < 0 OR (debit > 0 AND credit > 0)',
  },
  {
    table: 'warehouse_stock',
    checks: [
      'CHECK(quantity_m2 >= 0 AND reserved_m2 >= 0 AND ROUND(reserved_m2, 3) <= ROUND(quantity_m2, 3))',
    ],
    violationWhere: 'quantity_m2 < 0 OR reserved_m2 < 0 OR ROUND(reserved_m2, 3) > ROUND(quantity_m2, 3)',
  },
  {
    table: 'product_batches',
    checks: [
      'CHECK(quantity_m2 >= 0 AND quantity_remaining_m2 >= 0 AND ROUND(quantity_remaining_m2, 3) <= ROUND(quantity_m2, 3))',
    ],
    violationWhere: 'quantity_m2 < 0 OR quantity_remaining_m2 < 0 OR ROUND(quantity_remaining_m2, 3) > ROUND(quantity_m2, 3)',
  },
  {
    table: 'sales_invoice_items',
    checks: ['CHECK(quantity_m2 >= 0 AND unit_price >= 0 AND total_price >= 0)'],
    violationWhere: 'quantity_m2 < 0 OR unit_price < 0 OR total_price < 0',
  },
];

function scalar(db: any, sql: string): number {
  const res = db.exec(sql)[0];
  return res && res.values.length ? Number(res.values[0][0]) : 0;
}

// SQLite cannot ADD a CHECK constraint via ALTER TABLE, so the table is
// rebuilt: new definition with the checks appended, rows copied verbatim
// (identical column set/order), indexes and triggers recreated afterwards.
// Tables that already contain violating rows are left untouched rather than
// failing the whole migration.
function rebuildWithChecks(db: any, spec: CheckSpec): string {
  if (!tableExists(db, spec.table)) return 'missing';

  const violations = scalar(db, `SELECT COUNT(*) FROM "${spec.table}" WHERE ${spec.violationWhere}`);
  if (violations > 0) return `skipped:${violations}-violations`;

  const createSql = db.exec(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${spec.table}'`,
  )[0]?.values[0]?.[0];
  if (!createSql) return 'missing-sql';

  const tmp = `${spec.table}__scopechk`;
  let newSql = String(createSql)
    .replace(
      /(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)("?)[A-Za-z_][A-Za-z0-9_]*\2/i,
      `$1$2${tmp}$2`,
    )
    .trimEnd();
  const insertAt = newSql.lastIndexOf(')');
  if (insertAt === -1) return 'unparseable-sql';
  newSql = `${newSql.slice(0, insertAt)},\n  ${spec.checks.join(',\n  ')}\n${newSql.slice(insertAt)}`;

  const indexes = db.exec(
    `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = '${spec.table}' AND sql IS NOT NULL`,
  )[0]?.values || [];
  // Triggers on OTHER tables may reference this table in their body
  // (e.g. trg_prevent_delete_coa_with_entries queries journal_entry_lines).
  // SQLite revalidates all triggers on DROP TABLE, so every trigger whose
  // SQL mentions the table must be dropped first and recreated afterwards.
  const namePattern = new RegExp(`\\b${spec.table}\\b`);
  const triggers = (db.exec(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL`,
  )[0]?.values || []).filter((row: any[]) => namePattern.test(String(row[1])));

  db.exec(`DROP TABLE IF EXISTS "${tmp}"`);
  db.exec(newSql);
  db.exec(`INSERT INTO "${tmp}" SELECT * FROM "${spec.table}"`);
  for (const [triggerName] of triggers) db.exec(`DROP TRIGGER IF EXISTS "${String(triggerName)}"`);
  db.exec(`DROP TABLE "${spec.table}"`);
  db.exec(`ALTER TABLE "${tmp}" RENAME TO "${spec.table}"`);

  for (const [sql] of indexes) db.exec(String(sql));
  for (const [, sql] of triggers) db.exec(String(sql));
  return 'rebuilt';
}

export const MIGRATION_PART_121: Migration = {
  id: '206_safe_check_constraints',
  description: 'Add CHECK constraints for non-negative amounts and quantity bounds on core tables',
  disableForeignKeys: true,
  up: (db) => {
    for (const spec of CHECK_SPECS) {
      rebuildWithChecks(db, spec);
    }
  },
};
