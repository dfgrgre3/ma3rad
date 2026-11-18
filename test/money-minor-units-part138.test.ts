import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION_PART_138 } from '../src/database/migrations/part138.ts';

const SQL = await (globalThis as any).initSqlJs();

// Mirror of MONEY_TABLES in part138.ts — kept in sync manually.
const TABLES: Record<string, string[]> = {
  projects: ['contract_value','total_sold','total_paid','outstanding_amount'],
  project_products: ['agreed_price_m2'],
  project_actual_cost_entries: ['amount'],
  project_apartment_estimates: ['total_amount'],
  project_budget_lines: ['planned_amount','actual_amount'],
  project_change_requests: ['cost_impact'],
  project_estimate_contracts: ['contract_value'],
  project_payment_certificates: ['requested_amount','approved_amount','paid_amount'],
  enterprise_contracts: ['value'],
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

  db.exec('CREATE INDEX "idx_ppc_paid" ON "project_payment_certificates" ("paid_amount")');
  db.exec(`CREATE TRIGGER "ppc_audit" AFTER UPDATE ON "project_payment_certificates"
           BEGIN UPDATE "project_payment_certificates" SET "approved_amount" = "requested_amount" WHERE id = 'none'; END`);
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

test('part138 converts REAL money columns to INTEGER piastres idempotently', () => {
  const db = new SQL.Database();
  createLegacySchema(db);

  MIGRATION_PART_138.up(db as any);

  for (const [table, cols] of Object.entries(TABLES)) {
    for (const col of cols) {
      assert.equal(columnType(db, table, col), 'INTEGER', `${table}.${col} should be INTEGER`);
      assert.equal(moneyValue(db, table, col), 11457, `${table}.${col} should hold 11457 piastres`);
    }
  }

  // NULLs backfilled to 0.
  const nullRes = db.exec(`SELECT "value" AS v FROM "enterprise_contracts" WHERE id = 'r2'`)[0];
  assert.equal(Number(nullRes.values[0][0]), 0);

  // Index + trigger survived rebuilds.
  const idx = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_ppc_paid'`)[0];
  assert.equal(idx?.values.length, 1);
  const trg = db.exec(`SELECT name FROM sqlite_master WHERE type='trigger' AND name='ppc_audit'`)[0];
  assert.equal(trg?.values.length, 1);

  // Idempotent: second run must not double-scale.
  MIGRATION_PART_138.up(db as any);
  assert.equal(moneyValue(db, 'projects', 'contract_value'), 11457);
  assert.equal(moneyValue(db, 'project_payment_certificates', 'paid_amount'), 11457);

  db.close();
});
