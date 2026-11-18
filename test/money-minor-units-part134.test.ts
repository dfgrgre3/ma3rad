import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION_PART_134 } from '../src/database/migrations/part134.ts';

const SQL = await (globalThis as any).initSqlJs();

// Mirror of MONEY_TABLES in part134.ts — kept in sync manually.
const TABLES: Record<string, string[]> = {
  products: ['cost_price', 'selling_price_m2', 'selling_price_box', 'wholesale_price_m2', 'min_selling_price_m2'],
  product_batches: ['cost_price'],
  product_variants: ['cost_price', 'selling_price_m2'],
  price_list_items: ['price_m2', 'price_box'],
  customer_price_overrides: ['price_m2'],
  inventory_transactions: ['unit_cost', 'total_cost'],
  inventory_cost_layers: ['unit_cost'],
  inventory_cost_allocations: ['unit_cost'],
  inventory_special_stocks: ['unit_cost', 'total_cost'],
  stock_transfers: ['total_cost'],
  stock_transfer_items: ['unit_cost', 'total_cost'],
  stock_transfer_batch_allocations: ['unit_cost'],
  stock_counts: ['total_variance_value'],
  stock_count_items: ['unit_cost', 'variance_value'],
  stock_adjustments: ['total_value'],
  stock_adjustment_items: ['unit_cost', 'total_value'],
  inventory_reconciliation_logs: ['total_physical_cost', 'total_fifo_layer_cost', 'total_gl_inventory_cost', 'variance_physical_vs_fifo', 'variance_fifo_vs_gl'],
  price_change_history: ['old_value', 'new_value'],
  electronic_invoices: ['total_tax', 'total_amount'],
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
    // NULL row must be backfilled to 0 without breaking the copy.
    db.run(
      `INSERT INTO "${table}" (id) VALUES ('r2')`,
    );
  }

  // Columns added later via ALTER TABLE (absent from CREATE sql) — exercises
  // the missingDefs path in convertTableColumns.
  db.exec('ALTER TABLE "inventory_cost_layers" ADD COLUMN "original_unit_cost" REAL');
  db.exec('ALTER TABLE "inventory_cost_layers" ADD COLUMN "landed_cost_share" REAL');
  db.exec('ALTER TABLE "inventory_special_stocks" ADD COLUMN "discounted_unit_price" REAL');
  db.run('UPDATE "inventory_cost_layers" SET "original_unit_cost" = 114.57, "landed_cost_share" = 114.57 WHERE id = \'r1\'');
  db.run('UPDATE "inventory_special_stocks" SET "discounted_unit_price" = 114.57 WHERE id = \'r1\'');

  // Index + trigger on a converted table must survive the rebuild.
  db.exec('CREATE INDEX "idx_products_cost" ON "products" ("cost_price")');
  db.exec(`CREATE TRIGGER "products_audit" AFTER UPDATE ON "products"
           BEGIN UPDATE "stock_adjustments" SET "total_value" = "total_value" WHERE id = 'none'; END`);
}

function columnType(db: any, table: string, col: string): string {
  const res = db.exec(`PRAGMA table_info("${table}")`)[0];
  const idx = res.columns.indexOf('type');
  const row = res.values.find((r: any[]) => r[1] === col);
  return row ? String(row[idx]) : '';
}

function moneyValue(db: any, table: string, col: string): number {
  const res = db.exec(`SELECT "${col}" AS v FROM "${table}" WHERE id = 'r1'`)[0];
  return Number(res.values[0][0]);
}

test('part134 converts REAL money columns to INTEGER piastres idempotently', () => {
  const db = new SQL.Database();
  createLegacySchema(db);

  MIGRATION_PART_134.up(db as any);

  // Every declared money column is now INTEGER and holds piastres.
  for (const [table, cols] of Object.entries(TABLES)) {
    for (const col of cols) {
      assert.equal(columnType(db, table, col), 'INTEGER', `${table}.${col} should be INTEGER`);
      assert.equal(moneyValue(db, table, col), 11457, `${table}.${col} should hold 11457 piastres`);
    }
  }

  // ALTER-added money columns also converted.
  for (const col of ['original_unit_cost', 'landed_cost_share']) {
    assert.equal(columnType(db, 'inventory_cost_layers', col), 'INTEGER');
    assert.equal(moneyValue(db, 'inventory_cost_layers', col), 11457);
  }
  assert.equal(columnType(db, 'inventory_special_stocks', 'discounted_unit_price'), 'INTEGER');
  assert.equal(moneyValue(db, 'inventory_special_stocks', 'discounted_unit_price'), 11457);

  // NULLs backfilled to 0.
  const nullRes = db.exec(`SELECT "cost_price" AS v FROM "products" WHERE id = 'r2'`)[0];
  assert.equal(Number(nullRes.values[0][0]), 0);

  // Index + trigger survived the products rebuild.
  const idx = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_products_cost'`)[0];
  assert.equal(idx?.values.length, 1);
  const trg = db.exec(`SELECT name FROM sqlite_master WHERE type='trigger' AND name='products_audit'`)[0];
  assert.equal(trg?.values.length, 1);

  // Second run must not double-scale.
  MIGRATION_PART_134.up(db as any);
  assert.equal(moneyValue(db, 'products', 'cost_price'), 11457);
  assert.equal(moneyValue(db, 'inventory_cost_layers', 'original_unit_cost'), 11457);
  assert.equal(columnType(db, 'products', 'cost_price'), 'INTEGER');
});
