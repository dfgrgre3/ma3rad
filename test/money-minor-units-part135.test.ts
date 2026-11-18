import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION_PART_135 } from '../src/database/migrations/part135.ts';

const SQL = await (globalThis as any).initSqlJs();

// Mirror of MONEY_TABLES in part135.ts — kept in sync manually.
const TABLES: Record<string, string[]> = {
  orders: ['subtotal', 'discount_amount', 'tax_amount', 'shipping_cost', 'total_amount', 'paid_amount', 'remaining_amount'],
  order_items: ['unit_price', 'discount_amount', 'total_price'],
  quotations: ['subtotal', 'discount_amount', 'tax_amount'],
  quotation_items: ['unit_price', 'total_price', 'discount_amount'],
  quotation_service_items: ['unit_price', 'discount_amount', 'total_price'],
  deliveries: ['delivery_fee'],
  installments: ['amount', 'paid_amount', 'remaining_amount'],
  installment_plans: ['total_amount', 'down_payment', 'financed_amount', 'installment_amount', 'paid_amount', 'remaining_amount'],
  sales_invoice_payments: ['amount'],
  order_deposits: ['amount'],
  order_deposit_refunds: ['amount'],
  receivables: ['amount'],
  cheques: ['amount', 'bounce_fee'],
  commissions: ['base_amount', 'commission_amount'],
  customer_payment_promises: ['promised_amount'],
  sales_return_reconciliations: ['invoice_returned_amount_before', 'stored_cash_amount', 'stored_balance_amount', 'calculated_tax_amount', 'confirmed_cash_amount', 'confirmed_balance_amount'],
  financial_calendar_events: ['amount', 'paid_amount'],
  financial_calendar_payments: ['amount'],
  bank_accounts: ['opening_balance', 'current_balance'],
  cash_shifts: ['opening_balance', 'total_sales_cash', 'total_sales_card', 'total_sales_transfer', 'total_customer_payments', 'total_supplier_payments', 'total_expenses', 'total_refunds', 'expected_ending_cash', 'actual_ending_cash', 'cash_difference', 'total_partner_inflows', 'total_partner_outflows'],
};

function createLegacySchema(db: any): void {
  for (const [table, cols] of Object.entries(TABLES)) {
    const defs = cols.map((c) => `"${c}" REAL`).join(', ');
    db.exec(`CREATE TABLE "${table}" (id TEXT PRIMARY KEY${defs ? ', ' + defs : ''})`);
    const placeholders = cols.map(() => '?').join(', ');
    const params = cols.map(() => 114.57);
    db.run(
      `INSERT INTO "${table}" (id${cols.length ? ', ' + cols.join(', ') : ''}) VALUES (?, ${placeholders})`,
      ['r1', ...params]
    );
    db.run(`INSERT INTO "${table}" (id) VALUES ('r2')`);
  }

  // Column added later via ALTER TABLE (absent from CREATE sql).
  db.exec('ALTER TABLE "cash_shifts" ADD COLUMN "late_fee" REAL');
  // not part of spec — exercises missing-column tolerance instead
  db.exec('ALTER TABLE "bank_accounts" ADD COLUMN "notes" TEXT');

  db.exec('CREATE INDEX "idx_orders_total" ON "orders" ("total_amount")');
  db.exec(`CREATE TRIGGER "orders_audit" AFTER UPDATE ON "orders"
           BEGIN UPDATE "order_items" SET "total_price" = "total_price" WHERE id = 'none'; END`);
}

function columnType(db: any, table: string, col: string): string {
  const res = db.exec(`PRAGMA table_info("${table}")`)[0];
  const idx = res.columns.indexOf('type');
  const row = res.values.find((r: any[]) => r[1] === col);
  return row ? String(row[idx]) : '';
}

function moneyValue(db: any, table: string, col: string, id = 'r1'): number {
  const res = db.exec(`SELECT "${col}" AS v FROM "${table}" WHERE id = '${id}'`)[0];
  return Number(res.values[0][0]);
}

test('part135 converts REAL money columns to INTEGER piastres idempotently', () => {
  const db = new SQL.Database();
  createLegacySchema(db);

  MIGRATION_PART_135.up(db as any);

  for (const [table, cols] of Object.entries(TABLES)) {
    for (const col of cols) {
      assert.equal(columnType(db, table, col), 'INTEGER', `${table}.${col} should be INTEGER`);
      assert.equal(moneyValue(db, table, col), 11457, `${table}.${col} should hold 11457 piastres`);
    }
  }

  // NULLs backfilled to 0.
  const nullRes = db.exec(`SELECT "amount" AS v FROM "cheques" WHERE id = 'r2'`)[0];
  assert.equal(Number(nullRes.values[0][0]), 0);

  // Index + trigger survived rebuilds.
  const idx = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_orders_total'`)[0];
  assert.equal(idx?.values.length, 1);
  const trg = db.exec(`SELECT name FROM sqlite_master WHERE type='trigger' AND name='orders_audit'`)[0];
  assert.equal(trg?.values.length, 1);

  // ALTER-added non-spec column survived.
  assert.equal(columnType(db, 'bank_accounts', 'notes'), 'TEXT');

  // Second run must not double-scale.
  MIGRATION_PART_135.up(db as any);
  assert.equal(moneyValue(db, 'orders', 'total_amount'), 11457);
  assert.equal(moneyValue(db, 'cash_shifts', 'opening_balance'), 11457);
  assert.equal(columnType(db, 'orders', 'total_amount'), 'INTEGER');
});
