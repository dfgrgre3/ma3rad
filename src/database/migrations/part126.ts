import type { Migration } from './support';
import { tableExists } from './support';

// Tables whose branch_id was added nullable by earlier migrations and whose
// writers now always supply a value (or rely on the DEFAULT below).
const BRANCH_TABLES = [
  'approval_requests',
  'bank_accounts',
  'cash_registers',
  'cash_shifts',
  'commissions',
  'customer_payments',
  'customer_warranty_claims',
  'customers',
  'deliveries',
  'departments',
  'employees',
  'enterprise_contracts',
  'expenses',
  'fiscal_year_openings',
  'fixed_assets',
  'installment_plans',
  'inventory_reconciliation_logs',
  'job_grades',
  'journal_entries',
  'manufacturing_maintenance',
  'manufacturing_quality_checks',
  'orders',
  'payroll_transactions',
  'projects',
  'purchase_invoices',
  'purchase_requests',
  'quotations',
  'sales_invoices',
  'supplier_claims',
  'supplier_payments',
  'sync_pending_changes',
];

// Tables whose company_id is nullable; all current writers supply it.
const COMPANY_TABLES = [
  'customers',
  'employees',
  'job_grades',
  'journal_entries',
  'products',
  'purchase_invoices',
  'quotations',
  'sales_invoices',
  'suppliers',
];

// Appends `NOT NULL DEFAULT '<def>'` to a `col TEXT [REFERENCES ...]` column
// definition unless it is already NOT NULL or the match is part of a longer
// identifier (e.g. target_branch_id). FK action clauses (ON DELETE/UPDATE,
// MATCH, DEFERRABLE) are kept inside the REFERENCES clause so the emitted
// SQL stays valid.
function hardenColumn(sql: string, col: string, def: string): string {
  const decl =
    '\\s+TEXT' +
    '(?:\\s+REFERENCES\\s+\\w+\\s*\\([^)]*\\)' +
    '(?:\\s+ON\\s+(?:DELETE|UPDATE)\\s+(?:SET\\s+NULL|SET\\s+DEFAULT|CASCADE|RESTRICT|NO\\s+ACTION))*' +
    '(?:\\s+MATCH\\s+\\w+)*' +
    '(?:\\s+(?:NOT\\s+)?DEFERRABLE(?:\\s+INITIALLY\\s+(?:DEFERRED|IMMEDIATE))?)?' +
    ')?';
  const re = new RegExp(`("?)${col}\\1(${decl})`, 'gi');
  return sql.replace(re, (m, q, d, offset) => {
    const prev = offset > 0 ? sql[offset - 1] : '';
    if (/[A-Za-z0-9_]/.test(prev)) return m;
    const after = sql.slice(offset + m.length, offset + m.length + 24);
    if (/^\s+NOT\s+NULL/i.test(after)) return m;
    return `${q}${col}${q}${d} NOT NULL DEFAULT '${def}'`;
  });
}

function rebuildTable(
  db: any,
  table: string,
  cols: Array<{ col: string; def: string }>,
): string {
  if (!tableExists(db, table)) return 'missing';

  const createSql = db.exec(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${table}'`,
  )[0]?.values[0]?.[0];
  if (!createSql) return 'missing-sql';

  // Backfill NULL scope rows to the default scope before enforcing NOT NULL.
  for (const { col, def } of cols) {
    db.run(`UPDATE "${table}" SET "${col}" = ? WHERE "${col}" IS NULL`, [def]);
  }

  const originalSql = String(createSql);
  let newSql = originalSql;
  for (const { col, def } of cols) newSql = hardenColumn(newSql, col, def);
  if (newSql === originalSql) return 'no-column-match';

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

export const MIGRATION_PART_126: Migration = {
  id: '211_scope_columns_not_null',
  description: 'Enforce NOT NULL on branch_id/company_id across business tables',
  disableForeignKeys: true,
  up: (db) => {
    const specs = new Map<string, Array<{ col: string; def: string }>>();
    for (const t of BRANCH_TABLES) {
      specs.set(t, [...(specs.get(t) || []), { col: 'branch_id', def: 'br_main' }]);
    }
    for (const t of COMPANY_TABLES) {
      specs.set(t, [...(specs.get(t) || []), { col: 'company_id', def: 'cmp_main' }]);
    }
    for (const [table, cols] of specs) rebuildTable(db, table, cols);
  },
};
