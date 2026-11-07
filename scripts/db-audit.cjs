#!/usr/bin/env node
/*
 * Read-only SQLite audit helper.
 *
 * Usage:
 *   node scripts/db-audit.cjs <path-to-sqlite-file> [--json]
 *
 * It never writes to the database. Always point it at a copy, not the live
 * production file, so WAL/journal files cannot be modified while the app runs.
 */
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

const QUICK_CHECKS = [
  {
    id: 'unbalanced-journal-entries',
    label: 'قيود يومية غير متوازنة',
    sql: `SELECT COUNT(*) AS n FROM journal_entries
          WHERE ABS(COALESCE(total_debit,0) - COALESCE(total_credit,0)) > 0.005`,
  },
  {
    id: 'journal-entry-line-mismatch',
    label: 'قيود مجموع سطورها لا يطابق رأس القيد',
    sql: `SELECT COUNT(*) AS n FROM journal_entries je
          WHERE ABS(COALESCE(je.total_debit,0) - COALESCE((
            SELECT SUM(jel.debit) FROM journal_entry_lines jel WHERE jel.entry_id = je.id
          ),0)) > 0.005
             OR ABS(COALESCE(je.total_credit,0) - COALESCE((
            SELECT SUM(jel.credit) FROM journal_entry_lines jel WHERE jel.entry_id = je.id
          ),0)) > 0.005`,
  },
  {
    id: 'sales-invoice-without-lines',
    label: 'فواتير بيع بدون بنود',
    sql: `SELECT COUNT(*) AS n FROM sales_invoices si
          WHERE NOT EXISTS (SELECT 1 FROM sales_invoice_items i WHERE i.invoice_id = si.id)`,
  },
  {
    id: 'purchase-invoice-without-lines',
    label: 'فواتير شراء بدون بنود',
    sql: `SELECT COUNT(*) AS n FROM purchase_invoices pi
          WHERE NOT EXISTS (SELECT 1 FROM purchase_invoice_items i WHERE i.purchase_id = pi.id)`,
  },
  {
    id: 'customer-balance-mismatch',
    label: 'عملاء رصيدهم لا يطابق مستنداتهم (فرق > 0.01)',
    sql: `SELECT COUNT(*) AS n FROM customers c
          WHERE ABS(COALESCE(c.current_balance,0) - COALESCE((
            SELECT SUM(si.remaining_amount) FROM sales_invoices si
            WHERE si.customer_id = c.id AND si.invoice_status <> 'CANCELLED'
          ),0)) > 0.01`,
  },
  {
    id: 'supplier-balance-mismatch',
    label: 'موردون رصيدهم لا يطابق مستنداتهم (فرق > 0.01)',
    sql: `SELECT COUNT(*) AS n FROM suppliers s
          WHERE ABS(COALESCE(s.current_balance,0) - COALESCE((
            SELECT SUM(pi.remaining_amount) FROM purchase_invoices pi
            WHERE pi.supplier_id = s.id
          ),0)) > 0.01`,
  },
  {
    id: 'cash-register-vs-ledger',
    label: 'إجمالي الخزائن لا يطابق حساب النقدية 1101 (فرق > 0.01)',
    sql: `SELECT COUNT(*) AS n FROM (
            SELECT ABS(
              COALESCE((SELECT SUM(current_balance) FROM cash_registers),0)
              - COALESCE((SELECT balance FROM chart_of_accounts WHERE code = '1101'),0)
            ) AS diff
          ) WHERE diff > 0.01`,
  },
  {
    id: 'negative-stock',
    label: 'أرصدة مخزون سالبة',
    sql: `SELECT COUNT(*) AS n FROM warehouse_stock WHERE quantity < -0.0001`,
  },
  {
    id: 'stock-without-warehouse',
    label: 'أرصدة مخزون بدون مستودع صالح',
    sql: `SELECT COUNT(*) AS n FROM warehouse_stock s
          WHERE NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.id = s.warehouse_id)`,
  },
  {
    id: 'sales-invoice-total-mismatch',
    label: 'فواتير بيع مجموع بنودها لا يطابق إجماليها',
    sql: `SELECT COUNT(*) AS n FROM sales_invoices si
          WHERE ABS(COALESCE(si.total_amount,0) - COALESCE((
            SELECT SUM(i.total_price) FROM sales_invoice_items i WHERE i.invoice_id = si.id
          ),0)) > 0.05`,
  },
  {
    id: 'purchase-invoice-total-mismatch',
    label: 'فواتير شراء مجموع بنودها لا يطابق إجماليها',
    sql: `SELECT COUNT(*) AS n FROM purchase_invoices pi
          WHERE ABS(COALESCE(pi.total_amount,0) - COALESCE((
            SELECT SUM(i.total_cost) FROM purchase_invoice_items i WHERE i.purchase_id = pi.id
          ),0)) > 0.05`,
  },
  {
    id: 'duplicate-invoice-numbers',
    label: 'أرقام فواتير بيع مكررة',
    sql: `SELECT COUNT(*) AS n FROM (
            SELECT invoice_number FROM sales_invoices GROUP BY invoice_number HAVING COUNT(*) > 1)`,
  },
  {
    id: 'duplicate-purchase-numbers',
    label: 'أرقام فواتير شراء مكررة',
    sql: `SELECT COUNT(*) AS n FROM (
            SELECT invoice_number FROM purchase_invoices GROUP BY invoice_number HAVING COUNT(*) > 1)`,
  },
  {
    id: 'orphan-journal-lines',
    label: 'سطور قيود يتيمة',
    sql: `SELECT COUNT(*) AS n FROM journal_entry_lines jel
          WHERE NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = jel.entry_id)`,
  },
  {
    id: 'inventory-without-product',
    label: 'حركات/أرصدة مخزون لأصناف غير موجودة',
    sql: `SELECT COUNT(*) AS n FROM warehouse_stock s
          WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = s.product_id)`,
  },
];

async function main() {
  const dbPath = process.argv[2];
  const asJson = process.argv.includes('--json');
  if (!dbPath) {
    console.error('Usage: node scripts/db-audit.cjs <sqlite-file> [--json]');
    process.exit(2);
  }
  if (!fs.existsSync(dbPath)) {
    console.error(`File not found: ${dbPath}`);
    process.exit(2);
  }
  const SQL = await initSqlJs();
  const bytes = fs.readFileSync(dbPath);
  const db = new SQL.Database(new Uint8Array(bytes));
  const scalar = (sql, params = []) => {
    const result = db.exec(sql, params)[0];
    return result ? result.values[0][0] : undefined;
  };
  const rows = (sql, params = []) => {
    const result = db.exec(sql, params)[0];
    if (!result) return [];
    return result.values.map((values) => {
      const row = {};
      result.columns.forEach((column, index) => { row[column] = values[index]; });
      return row;
    });
  };

  const pragmas = {
    integrityCheck: scalar('PRAGMA integrity_check'),
    foreignKeys: scalar('PRAGMA foreign_keys'),
    journalMode: scalar('PRAGMA journal_mode'),
    pageSize: scalar('PRAGMA page_size'),
    pageCount: scalar('PRAGMA page_count'),
    userVersion: scalar('PRAGMA user_version'),
  };
  const schemaVersion = rows('SELECT * FROM schema_migrations ORDER BY id').length
    ? rows('SELECT id, applied_at FROM schema_migrations ORDER BY id')
    : [];

  const tables = rows(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .map(({ name }) => ({ name, rows: Number(scalar(`SELECT COUNT(*) FROM "${name}"`) || 0) }));
  const totalRows = tables.reduce((sum, table) => sum + table.rows, 0);

  const foreignKeyViolations = rows('PRAGMA foreign_key_check').slice(0, 50);
  const indexes = Number(scalar(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL`));
  const triggers = Number(scalar(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger'`));
  const views = Number(scalar(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'view'`));
  const columns = tables.reduce((sum, table) => {
    try {
      return sum + Number(scalar(`SELECT COUNT(*) FROM pragma_table_info('${table.name.replace(/'/g, "''")}')`) || 0);
    } catch {
      return sum;
    }
  }, 0);

  const checks = [];
  for (const check of QUICK_CHECKS) {
    try {
      checks.push({ ...check, count: Number(scalar(check.sql) || 0), error: null });
    } catch (error) {
      checks.push({ ...check, count: null, error: String(error.message || error) });
    }
  }

  const report = {
    file: path.resolve(dbPath),
    fileSizeBytes: bytes.length,
    pragmas,
    schema: { tables: tables.length, totalRows, indexes, triggers, views, columns, appliedMigrations: schemaVersion.length },
    latestMigrations: schemaVersion.slice(-8),
    largestTables: [...tables].sort((a, b) => b.rows - a.rows).slice(0, 15),
    tables,
    foreignKeyViolations,
    checks,
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log('Database:', report.file);
    console.log('Size:', report.fileSizeBytes, 'bytes');
    console.log('PRAGMA:', report.pragmas);
    console.log('Schema:', report.schema);
    console.log('Largest tables:', report.largestTables);
    console.log('Foreign key violations:', foreignKeyViolations);
    console.log('Checks:');
    for (const check of checks) {
      console.log(`  [${check.error ? 'ERROR' : check.count === 0 ? 'OK' : 'FAIL'}] ${check.label}:`,
        check.error || check.count);
    }
  }
  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
