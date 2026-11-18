import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION_PART_141 } from '../src/database/migrations/part141.ts';

const SQL = await (globalThis as any).initSqlJs();

// Mirror of MONEY_TABLES in part141.ts — kept in sync manually.
const TABLES: Record<string, string[]> = {
  'platform_tenants': ['price'],
  'platform_plans': ['price', 'monthly_price', 'yearly_price'],
  'platform_plan_versions': ['price', 'monthly_price', 'yearly_price'],
  'platform_price_history': ['old_price', 'new_price'],
  'platform_subscription_price_locks': ['locked_price', 'locked_monthly_price', 'locked_yearly_price'],
  'platform_subscriptions': ['price', 'discount', 'locked_price'],
  'platform_invoices': ['subtotal', 'discount', 'tax', 'total', 'paid_amount'],
  'platform_invoice_items': ['unit_price', 'total'],
  'platform_payments': ['amount'],
  'platform_coupons': ['min_subtotal'],
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

  db.exec('CREATE INDEX "idx_pl_price" ON "platform_plans" ("price")');
  db.exec(`CREATE TRIGGER "pii_audit" AFTER UPDATE ON "platform_invoice_items"
           BEGIN UPDATE "platform_invoice_items" SET "total" = "total" WHERE id = 'none'; END`);
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

test('part141 converts REAL money columns to INTEGER piastres idempotently', () => {
  const db = new SQL.Database();
  createLegacySchema(db);

  MIGRATION_PART_141.up(db as any);

  for (const [table, cols] of Object.entries(TABLES)) {
    for (const col of cols) {
      assert.equal(columnType(db, table, col), 'INTEGER', `${table}.${col} should be INTEGER`);
      assert.equal(moneyValue(db, table, col), 11457, `${table}.${col} should hold 11457 piastres`);
    }
  }

  // NULLs backfilled to 0.
  const nullRes = db.exec(`SELECT "price" AS v FROM "platform_plans" WHERE id = 'r2'`)[0];
  assert.equal(Number(nullRes.values[0][0]), 0);

  // Index + trigger survived rebuilds.
  const idx = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pl_price'`)[0];
  assert.equal(idx?.values.length, 1);
  const trg = db.exec(`SELECT name FROM sqlite_master WHERE type='trigger' AND name='pii_audit'`)[0];
  assert.equal(trg?.values.length, 1);

  // Idempotent: second run must not double-scale.
  MIGRATION_PART_141.up(db as any);
  assert.equal(moneyValue(db, 'platform_plans', 'price'), 11457);
  assert.equal(moneyValue(db, 'platform_payments', 'amount'), 11457);
  assert.equal(moneyValue(db, 'platform_invoices', 'total'), 11457);

  db.close();
});
