import type { Migration } from './support';
import { tableExists, columnExists } from './support';

interface MoneyColumnSpec { table: string; columns: string[]; }

/**
 * Migration 219: sales pipeline / receivables / cash-shift money columns
 * -> INTEGER piastres. Covers orders, quotations, installments, receivables,
 * cheques, commissions, payment promises, return reconciliations,
 * bank accounts and cashier shifts.
 * Activate only after the corresponding SQL sweep is complete.
 */

const MONEY_TABLES: MoneyColumnSpec[] = [
  { table: 'orders', columns: ['subtotal','discount_amount','tax_amount','shipping_cost','total_amount','paid_amount','remaining_amount'] },
  { table: 'order_items', columns: ['unit_price','discount_amount','total_price'] },
  { table: 'quotations', columns: ['subtotal','discount_amount','tax_amount'] },
  { table: 'quotation_items', columns: ['unit_price','total_price','discount_amount'] },
  { table: 'quotation_service_items', columns: ['unit_price','discount_amount','total_price'] },
  { table: 'deliveries', columns: ['delivery_fee'] },
  { table: 'installments', columns: ['amount','paid_amount','remaining_amount'] },
  { table: 'installment_plans', columns: ['total_amount','down_payment','financed_amount','installment_amount','paid_amount','remaining_amount'] },
  { table: 'sales_invoice_payments', columns: ['amount'] },
  { table: 'order_deposits', columns: ['amount'] },
  { table: 'order_deposit_refunds', columns: ['amount'] },
  { table: 'receivables', columns: ['amount'] },
  { table: 'cheques', columns: ['amount','bounce_fee'] },
  { table: 'commissions', columns: ['base_amount','commission_amount'] },
  { table: 'customer_payment_promises', columns: ['promised_amount'] },
  { table: 'sales_return_reconciliations', columns: ['invoice_returned_amount_before','stored_cash_amount','stored_balance_amount','calculated_tax_amount','confirmed_cash_amount','confirmed_balance_amount'] },
  { table: 'financial_calendar_events', columns: ['amount','paid_amount'] },
  { table: 'financial_calendar_payments', columns: ['amount'] },
  { table: 'bank_accounts', columns: ['opening_balance','current_balance'] },
  { table: 'cash_shifts', columns: ['opening_balance','total_sales_cash','total_sales_card','total_sales_transfer','total_customer_payments','total_supplier_payments','total_expenses','total_refunds','expected_ending_cash','actual_ending_cash','cash_difference','total_partner_inflows','total_partner_outflows'] },
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
    throw new Error(`part135 rebuild failed for ${table}: ${err instanceof Error ? err.message : String(err)}\nSQL: ${newSql}`);
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

export const MIGRATION_PART_135: Migration = {
  id: '219_cash_sales_pipeline_money_minor_units',
  description: 'Convert orders/quotations/installments/receivables/cash-shift money columns to INTEGER piastres',
  disableForeignKeys: true,
  up: (db) => { for (const spec of MONEY_TABLES) convertTableColumns(db, spec.table, spec.columns); },
};
