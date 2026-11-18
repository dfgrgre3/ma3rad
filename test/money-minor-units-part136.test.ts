import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION_PART_136 } from '../src/database/migrations/part136.ts';

const SQL = await (globalThis as any).initSqlJs();

// Mirror of MONEY_TABLES in part135.ts — kept in sync manually.
const TABLES: Record<string, string[]> = {
  purchase_requests: ['estimated_total'],
  purchase_request_items: ['estimated_unit_cost'],
  purchase_orders: ['subtotal','discount_amount','tax_amount','shipping_cost','total_amount'],
  purchase_order_items: ['unit_cost','total_cost'],
  supplier_quotations: ['total_amount'],
  supplier_quotation_items: ['unit_cost','total_cost'],
  goods_receipt_note_items: ['unit_cost'],
  supplier_claims: ['claimed_amount','agreed_amount'],
  supplier_claim_items: ['unit_cost','total_amount'],
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
  db.exec('ALTER TABLE "purchase_orders" ADD COLUMN "notes2" TEXT');
  // not part of spec — exercises missing-column tolerance instead
  

  db.exec('CREATE INDEX "idx_po_total" ON "purchase_orders" ("total_amount")');
  db.exec(`CREATE TRIGGER "po_audit" AFTER UPDATE ON "purchase_orders"
           BEGIN UPDATE "purchase_order_items" SET "total_cost" = "total_price" WHERE id = 'none'; END`);
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

test('part136 converts REAL money columns to INTEGER piastres idempotently', () => {
  const db = new SQL.Database();
  createLegacySchema(db);

  MIGRATION_PART_136.up(db as any);

  for (const [table, cols] of Object.entries(TABLES)) {
    for (const col of cols) {
      assert.equal(columnType(db, table, col), 'INTEGER', `${table}.${col} should be INTEGER`);
      assert.equal(moneyValue(db, table, col), 11457, `${table}.${col} should hold 11457 piastres`);
    }
  }

  // NULLs backfilled to 0.
  const nullRes = db.exec(`SELECT "claimed_amount" AS v FROM "supplier_claims" WHERE id = 'r2'`)[0];
  assert.equal(Number(nullRes.values[0][0]), 0);

  // Index + trigger survived rebuilds.
  const idx = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_po_total'`)[0];
  assert.equal(idx?.values.length, 1);
  const trg = db.exec(`SELECT name FROM sqlite_master WHERE type='trigger' AND name='po_audit'`)[0];
  assert.equal(trg?.values.length, 1);

  // ALTER-added non-spec column survived.
  assert.equal(columnType(db, 'purchase_orders', 'notes2'), 'TEXT');

  // Second run must not double-scale.
  MIGRATION_PART_136.up(db as any);
  assert.equal(moneyValue(db, 'purchase_orders', 'total_amount'), 11457);
  assert.equal(moneyValue(db, 'purchase_orders', 'subtotal'), 11457);
  assert.equal(columnType(db, 'purchase_orders', 'total_amount'), 'INTEGER');
});
