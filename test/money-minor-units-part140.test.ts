import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION_PART_140 } from '../src/database/migrations/part140.ts';

const SQL = await (globalThis as any).initSqlJs();

// Mirror of MONEY_TABLES in part140.ts — kept in sync manually.
const TABLES: Record<string, string[]> = {
  bank_reconciliations: ['statement_balance', 'book_balance', 'unreconciled_difference', 'cleared_deposits', 'cleared_withdrawals'],
  bank_reconciliation_lines: ['amount'],
  budgets: ['total_allocated'],
  budget_items: ['allocated_amount'],
  cash_forecast_items: ['amount'],
  payment_gateways: ['fixed_fee'],
  payment_gateway_settlements: ['gross_amount', 'commission_amount', 'tax_deduction', 'net_amount'],
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

  db.exec('CREATE INDEX "idx_br_stmt" ON "bank_reconciliations" ("statement_balance")');
  db.exec(`CREATE TRIGGER "brl_audit" AFTER UPDATE ON "bank_reconciliation_lines"
           BEGIN UPDATE "bank_reconciliation_lines" SET "amount" = "amount" WHERE id = 'none'; END`);
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

test('part140 converts REAL money columns to INTEGER piastres idempotently', () => {
  const db = new SQL.Database();
  createLegacySchema(db);

  MIGRATION_PART_140.up(db as any);

  for (const [table, cols] of Object.entries(TABLES)) {
    for (const col of cols) {
      assert.equal(columnType(db, table, col), 'INTEGER', `${table}.${col} should be INTEGER`);
      assert.equal(moneyValue(db, table, col), 11457, `${table}.${col} should hold 11457 piastres`);
    }
  }

  // NULLs backfilled to 0.
  const nullRes = db.exec(`SELECT "allocated_amount" AS v FROM "budget_items" WHERE id = 'r2'`)[0];
  assert.equal(Number(nullRes.values[0][0]), 0);

  // Index + trigger survived rebuilds.
  const idx = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_br_stmt'`)[0];
  assert.equal(idx?.values.length, 1);
  const trg = db.exec(`SELECT name FROM sqlite_master WHERE type='trigger' AND name='brl_audit'`)[0];
  assert.equal(trg?.values.length, 1);

  // Idempotent: second run must not double-scale.
  MIGRATION_PART_140.up(db as any);
  assert.equal(moneyValue(db, 'bank_reconciliations', 'statement_balance'), 11457);
  assert.equal(moneyValue(db, 'payment_gateway_settlements', 'net_amount'), 11457);
  assert.equal(moneyValue(db, 'budgets', 'total_allocated'), 11457);

  db.close();
});
