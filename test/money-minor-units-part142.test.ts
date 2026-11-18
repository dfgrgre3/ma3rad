import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION_PART_142 } from '../src/database/migrations/part142.ts';

const SQL = await (globalThis as any).initSqlJs();

// Mirror of MONEY_TABLES in part142.ts — kept in sync manually.
const TABLES: Record<string, string[]> = {
  'promotions': ['discount_amount', 'min_order_amount'],
  'promotion_usage': ['discount_amount'],
  'campaigns': ['budget'],
  'leads': ['estimated_value'],
  'work_centers': ['cost_per_hour'],
  'restaurant_order_items': ['unit_price'],
  'payroll_runs': ['paid_total'],
  'employees': ['tax_exemption_amount'],
  'hr_workforce_plan_jobs': ['estimated_monthly_salary'],
  'hr_hiring_requisitions': ['estimated_monthly_salary'],
  'period_adjustments': ['amount'],
  'permission_amount_limits': ['max_amount'],
  'approval_policies': ['max_value'],
  'payroll_tax_rules': ['dependent_allowance'],
  'payroll_tax_brackets': ['lower_limit', 'upper_limit'],
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

  db.exec('CREATE INDEX "idx_promo_da" ON "promotions" ("discount_amount")');
  db.exec(`CREATE TRIGGER "pu_audit" AFTER UPDATE ON "promotion_usage"
           BEGIN UPDATE "promotion_usage" SET "discount_amount" = "discount_amount" WHERE id = 'none'; END`);
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

test('part142 converts REAL money columns to INTEGER piastres idempotently', () => {
  const db = new SQL.Database();
  createLegacySchema(db);

  MIGRATION_PART_142.up(db as any);

  for (const [table, cols] of Object.entries(TABLES)) {
    for (const col of cols) {
      assert.equal(columnType(db, table, col), 'INTEGER', `${table}.${col} should be INTEGER`);
      assert.equal(moneyValue(db, table, col), 11457, `${table}.${col} should hold 11457 piastres`);
    }
  }

  // NULLs backfilled to 0.
  const nullRes = db.exec(`SELECT "discount_amount" AS v FROM "promotions" WHERE id = 'r2'`)[0];
  assert.equal(Number(nullRes.values[0][0]), 0);

  // Index + trigger survived rebuilds.
  const idx = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_promo_da'`)[0];
  assert.equal(idx?.values.length, 1);
  const trg = db.exec(`SELECT name FROM sqlite_master WHERE type='trigger' AND name='pu_audit'`)[0];
  assert.equal(trg?.values.length, 1);

  // Idempotent: second run must not double-scale.
  MIGRATION_PART_142.up(db as any);
  assert.equal(moneyValue(db, 'promotions', 'discount_amount'), 11457);
  assert.equal(moneyValue(db, 'campaigns', 'budget'), 11457);
  assert.equal(moneyValue(db, 'payroll_tax_brackets', 'lower_limit'), 11457);

  db.close();
});
