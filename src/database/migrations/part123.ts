import type { Migration } from './support';
import { columnExists, tableExists } from './support';

interface FkSpec {
  table: string;
  fks: Array<{ column: string; parent: string }>;
}

// Missing FOREIGN KEY declarations found by scripts/db-scope-audit.cjs.
// Only unambiguous entity references are listed; polymorphic columns
// (party_id, actor_id, created_by, cycle_id, ...) and audit tables are
// intentionally excluded.
const FK_SPECS: FkSpec[] = [
  {
    table: 'cheques',
    fks: [
      { column: 'bank_account_id', parent: 'bank_accounts' },
      { column: 'journal_entry_id', parent: 'journal_entries' },
      { column: 'clearing_entry_id', parent: 'journal_entries' },
      { column: 'bounce_entry_id', parent: 'journal_entries' },
    ],
  },
  { table: 'hr_allowances', fks: [{ column: 'employee_id', parent: 'employees' }] },
  { table: 'hr_benefits', fks: [{ column: 'employee_id', parent: 'employees' }] },
  { table: 'hr_loans', fks: [{ column: 'employee_id', parent: 'employees' }] },
  {
    table: 'hr_penalties',
    fks: [
      { column: 'employee_id', parent: 'employees' },
      { column: 'payroll_transaction_id', parent: 'payroll_transactions' },
    ],
  },
  { table: 'hr_leave_settlements', fks: [{ column: 'employee_id', parent: 'employees' }] },
  {
    table: 'hr_loan_installments',
    fks: [
      { column: 'loan_id', parent: 'hr_loans' },
      { column: 'payroll_transaction_id', parent: 'payroll_transactions' },
    ],
  },
  { table: 'performance_goals', fks: [{ column: 'employee_id', parent: 'employees' }] },
  {
    table: 'performance_rewards',
    fks: [
      { column: 'employee_id', parent: 'employees' },
      { column: 'evaluation_id', parent: 'performance_evaluations' },
    ],
  },
  { table: 'employee_lifecycle_events', fks: [{ column: 'employee_id', parent: 'employees' }] },
  {
    table: 'training_expenses',
    fks: [
      { column: 'employee_id', parent: 'employees' },
      { column: 'course_id', parent: 'training_courses' },
      { column: 'register_id', parent: 'cash_registers' },
      { column: 'bank_account_id', parent: 'bank_accounts' },
    ],
  },
  {
    table: 'warehouse_location_movements',
    fks: [
      { column: 'warehouse_id', parent: 'warehouses' },
      { column: 'product_id', parent: 'products' },
      { column: 'from_location_id', parent: 'warehouse_locations' },
      { column: 'to_location_id', parent: 'warehouse_locations' },
    ],
  },
];

function scalar(db: any, sql: string): number {
  const res = db.exec(sql)[0];
  return res && res.values.length ? Number(res.values[0][0]) : 0;
}

// Same rebuild pattern as 206: new table definition with the FK clauses
// appended, rows copied verbatim, indexes/triggers (own + cross-table
// references) recreated afterwards. A table is skipped entirely when any
// existing row would violate one of the new constraints.
function rebuildWithForeignKeys(db: any, spec: FkSpec): string {
  if (!tableExists(db, spec.table)) return 'missing';

  const applicable = spec.fks.filter(
    (fk) => columnExists(db, spec.table, fk.column) && tableExists(db, fk.parent),
  );
  if (!applicable.length) return 'no-applicable-fks';

  for (const fk of applicable) {
    const orphans = scalar(
      db,
      `SELECT COUNT(*) FROM "${spec.table}" t
       WHERE t."${fk.column}" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "${fk.parent}" p WHERE p.id = t."${fk.column}")`,
    );
    if (orphans > 0) return `skipped:${orphans}-orphans-${fk.column}`;
  }

  const createSql = db.exec(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${spec.table}'`,
  )[0]?.values[0]?.[0];
  if (!createSql) return 'missing-sql';

  const tmp = `${spec.table}__fkfix`;
  const fkClauses = applicable
    .map((fk) => `FOREIGN KEY ("${fk.column}") REFERENCES "${fk.parent}"(id)`)
    .join(',\n  ');
  let newSql = String(createSql)
    .replace(
      /(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)("?)[A-Za-z_][A-Za-z0-9_]*\2/i,
      `$1$2${tmp}$2`,
    )
    .trimEnd();
  const insertAt = newSql.lastIndexOf(')');
  if (insertAt === -1) return 'unparseable-sql';
  newSql = `${newSql.slice(0, insertAt)},\n  ${fkClauses}\n${newSql.slice(insertAt)}`;

  const indexes = db.exec(
    `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = '${spec.table}' AND sql IS NOT NULL`,
  )[0]?.values || [];
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
  return `rebuilt:${applicable.length}-fks`;
}

export const MIGRATION_PART_123: Migration = {
  id: '208_missing_fk_constraints',
  description: 'Declare missing foreign keys on HR, cheque, training, and movement tables',
  disableForeignKeys: true,
  up: (db) => {
    for (const spec of FK_SPECS) {
      rebuildWithForeignKeys(db, spec);
    }
  },
};
