import type { Migration } from './support';
import { tableExists } from './support';

// Precision policy enforcement at the database level.
//
// Money columns must hold whole cents (2 decimals); square-metre quantities
// must hold thousandths (3 decimals). Storage stays REAL for backward
// compatibility — the CHECK constraints make sub-cent/sub-millimetre values
// impossible to write, which delivers the integrity goal of minor-unit
// accounting without breaking every existing read path.
//
// A column is only included in the CHECK when zero existing rows violate it;
// tables with legacy fractional data keep working and are reported by
// scripts/db-scope-audit-style inspection instead of failing the migration.

interface PrecisionSpec {
  table: string;
  money?: string[];
  qty?: string[];
}

const SPECS: PrecisionSpec[] = [
  { table: 'chart_of_accounts', money: ['balance'] },
  { table: 'journal_entries', money: ['total_debit', 'total_credit'] },
  { table: 'journal_entry_lines', money: ['debit', 'credit'] },
  { table: 'fiscal_year_openings', money: ['debit', 'credit', 'balance'] },
  { table: 'customers', money: ['credit_limit', 'current_balance', 'total_purchases'] },
  { table: 'suppliers', money: ['current_balance', 'total_purchases'] },
  { table: 'employees', money: ['base_salary'] },
  { table: 'bank_accounts', money: ['opening_balance', 'current_balance'] },
  { table: 'cash_registers', money: ['current_balance'] },
  {
    table: 'cash_shifts',
    money: [
      'opening_balance', 'total_sales_cash', 'total_sales_card', 'total_sales_transfer',
      'total_customer_payments', 'total_supplier_payments', 'total_expenses',
      'total_refunds', 'expected_ending_cash', 'actual_ending_cash', 'cash_difference',
      'total_partner_inflows', 'total_partner_outflows',
    ],
  },
  {
    table: 'sales_invoices',
    money: [
      'subtotal', 'discount_amount', 'tax_amount', 'shipping_cost', 'extra_fees',
      'total_amount', 'paid_amount', 'remaining_amount', 'total_cost',
      'gross_profit', 'returned_amount',
    ],
  },
  {
    table: 'purchase_invoices',
    money: [
      'subtotal', 'discount_amount', 'tax_amount', 'shipping_cost', 'total_amount',
      'paid_amount', 'remaining_amount', 'landed_freight', 'landed_loading',
      'landed_customs_taxes', 'landed_insurance', 'landed_other',
      'price_variance_amount', 'qty_variance_amount',
    ],
  },
  { table: 'customer_payments', money: ['amount'] },
  { table: 'supplier_payments', money: ['amount'] },
  { table: 'expenses', money: ['amount'] },
  {
    table: 'orders',
    money: ['subtotal', 'discount_amount', 'tax_amount', 'shipping_cost', 'total_amount', 'paid_amount', 'remaining_amount'],
  },
  { table: 'quotations', money: ['subtotal', 'discount_amount', 'tax_amount', 'total_amount'] },
  { table: 'payroll_transactions', money: ['amount'] },
  {
    table: 'installment_plans',
    money: ['total_amount', 'down_payment', 'financed_amount', 'installment_amount', 'paid_amount', 'remaining_amount'],
  },
  { table: 'cheques', money: ['amount', 'bounce_fee'] },
  { table: 'commissions', money: ['base_amount', 'commission_amount'] },
  { table: 'sales_returns', money: ['total_amount', 'return_tax_amount', 'refunded_amount', 'remaining_to_balance'] },
  { table: 'customer_payment_promises', money: ['promised_amount'] },
  { table: 'receivables', money: ['amount'] },
  { table: 'stock_counts', money: ['total_variance_value'] },
  { table: 'deliveries', money: ['delivery_fee'], qty: ['total_quantity_m2'] },
  {
    table: 'sales_invoice_items',
    money: ['unit_price', 'original_unit_price', 'unit_cost', 'discount_amount', 'total_price', 'total_cost', 'profit'],
    qty: ['quantity_m2', 'quantity'],
  },
  {
    table: 'purchase_invoice_items',
    money: ['unit_cost', 'total_cost', 'landed_cost_share', 'effective_unit_cost', 'ordered_unit_cost'],
    qty: ['quantity_m2', 'quantity', 'grn_accepted_qty'],
  },
  {
    table: 'order_items',
    money: ['unit_price', 'discount_amount', 'total_price'],
    qty: ['quantity_m2', 'delivered_m2', 'invoiced_m2'],
  },
  { table: 'product_batches', money: ['cost_price'], qty: ['quantity_m2', 'quantity_remaining_m2'] },
  { table: 'inventory_cost_layers', money: ['original_unit_cost'] },
  { table: 'inventory_special_stocks', money: ['discounted_unit_price'] },
  { table: 'warehouse_stock', qty: ['quantity_m2', 'reserved_m2', 'quantity'] },
  { table: 'inventory_transactions', money: ['unit_cost', 'total_cost'], qty: ['quantity_m2'] },
  { table: 'stock_transfers', qty: ['total_shipped_m2', 'total_received_m2', 'total_lost_m2'] },
  { table: 'stock_count_items', qty: ['counted_quantity_m2'] },
];

function scalar(db: any, sql: string): number {
  const res = db.exec(sql)[0];
  return res && res.values.length ? Number(res.values[0][0]) : 0;
}

function columnExists(db: any, table: string, col: string): boolean {
  const res = db.exec(`PRAGMA table_info("${table}")`)[0];
  return !!res && res.values.some((r: any[]) => r[1] === col);
}

// Returns the list of column names that are clean (no violating rows).
function cleanColumns(db: any, table: string, cols: string[], scale: number): string[] {
  return cols.filter((col) => {
    if (!columnExists(db, table, col)) return false;
    const violations = scalar(
      db,
      `SELECT COUNT(*) FROM "${table}" WHERE "${col}" IS NOT NULL
         AND ABS("${col}" * ${scale} - ROUND("${col}" * ${scale})) >= 0.01`,
    );
    return violations === 0;
  });
}

function rebuildWithChecks(db: any, spec: PrecisionSpec): string {
  if (!tableExists(db, spec.table)) return 'missing';

  const moneyCols = cleanColumns(db, spec.table, spec.money || [], 100);
  const qtyCols = cleanColumns(db, spec.table, spec.qty || [], 1000);
  if (!moneyCols.length && !qtyCols.length) return 'no-clean-columns';

  const terms = [
    ...moneyCols.map((c) => `ABS("${c}" * 100 - ROUND("${c}" * 100)) < 0.01`),
    ...qtyCols.map((c) => `ABS("${c}" * 1000 - ROUND("${c}" * 1000)) < 0.01`),
  ];
  const checkSql = `,\n  CHECK(${terms.join(' AND ')})`;

  const createSql = db.exec(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${spec.table}'`,
  )[0]?.values[0]?.[0];
  if (!createSql) return 'missing-sql';

  const original = String(createSql);
  if (/CHECK\s*\(\s*ABS\("/.test(original)) return 'already-hardened';

  const tmp = `${spec.table}__precision`;
  let newSql = original;
  const insertAt = newSql.lastIndexOf(')');
  if (insertAt === -1) return 'unparseable-sql';
  newSql = `${newSql.slice(0, insertAt)}${checkSql}\n${newSql.slice(insertAt)}`;
  newSql = newSql.replace(
    /(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)"?[A-Za-z_][A-Za-z0-9_]*"?/i,
    `$1"${tmp}"`,
  );

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
  return `rebuilt:${moneyCols.length}m/${qtyCols.length}q`;
}

export const MIGRATION_PART_127: Migration = {
  id: '212_precision_check_constraints',
  description: 'Enforce cent (money) and milli-m2 (quantity) precision via CHECK constraints',
  disableForeignKeys: true,
  up: (db) => {
    for (const spec of SPECS) rebuildWithChecks(db, spec);
  },
};
