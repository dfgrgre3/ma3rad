import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION_PART_139 } from '../src/database/migrations/part139.ts';

const SQL = await (globalThis as any).initSqlJs();

// Mirror of MONEY_TABLES in part139.ts — kept in sync manually.
const TABLES: Record<string, string[]> = {
  fixed_assets: ['purchase_cost', 'salvage_value', 'accumulated_depreciation'],
  fixed_asset_depreciation_periods: ['amount'],
  fixed_asset_depreciation_requests: ['amount'],
  fixed_asset_disposals: ['sale_proceeds', 'expenses', 'accumulated_depreciation', 'book_value', 'gain_loss'],
  fixed_asset_maintenance: ['cost'],
  facility_assets: ['purchase_price'],
  facility_asset_maintenance_logs: ['cost'],
  facility_cleaning_supplies: ['unit_cost'],
  facility_contracts: ['payment_amount', 'sla_penalty_per_delay'],
  facility_contract_payments: ['amount_due', 'amount_paid'],
  facility_contract_renewals: ['new_payment_amount'],
  facility_utility_bills: ['amount_due', 'amount_paid'],
  facility_utility_meters: ['tariff_per_unit', 'fixed_monthly_fee'],
  facility_utility_readings: ['cost'],
  facility_work_orders: ['labor_cost', 'parts_cost', 'service_cost'],
  vehicle_maintenance: ['cost'],
  manufacturing_maintenance: ['cost'],
  operation_shift_handovers: ['expected_cash', 'actual_cash', 'cash_difference', 'cash_delivered'],
  warranty_claim_executions: ['amount'],
  business_partners: ['capital_amount'],
  partner_account_transactions: ['amount', 'balance_effect'],
  partner_capital_history: ['old_amount', 'new_amount'],
  finance_subledger_control_baselines: ['balance'],
  finance_subledger_control_baselines_company: ['balance'],
  finance_subledger_party_baselines: ['balance'],
  finance_subledger_party_baselines_company: ['balance'],
  finance_subledger_manual_reconciliations: ['verified_subledger_balance', 'control_balance'],
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

  db.exec('CREATE INDEX "idx_fa_cost" ON "fixed_assets" ("purchase_cost")');
  db.exec(`CREATE TRIGGER "fa_audit" AFTER UPDATE ON "fixed_assets"
           BEGIN UPDATE "fixed_assets" SET "salvage_value" = "salvage_value" WHERE id = 'none'; END`);

  // Column added later via ALTER TABLE (absent from CREATE sql).
  db.exec('ALTER TABLE "facility_contracts" ADD COLUMN "late_fee" REAL DEFAULT 0');
  db.run(`INSERT INTO "facility_contracts" (id, late_fee) VALUES ('r3', 55.5)`);
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

test('part139 converts REAL money columns to INTEGER piastres idempotently', () => {
  const db = new SQL.Database();
  createLegacySchema(db);

  MIGRATION_PART_139.up(db as any);

  for (const [table, cols] of Object.entries(TABLES)) {
    for (const col of cols) {
      assert.equal(columnType(db, table, col), 'INTEGER', `${table}.${col} should be INTEGER`);
      assert.equal(moneyValue(db, table, col), 11457, `${table}.${col} should hold 11457 piastres`);
    }
  }

  // NULLs backfilled to 0.
  const nullRes = db.exec(`SELECT "capital_amount" AS v FROM "business_partners" WHERE id = 'r2'`)[0];
  assert.equal(Number(nullRes.values[0][0]), 0);

  // Index + trigger survived rebuilds.
  const idx = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_fa_cost'`)[0];
  assert.equal(idx?.values.length, 1);
  const trg = db.exec(`SELECT name FROM sqlite_master WHERE type='trigger' AND name='fa_audit'`)[0];
  assert.equal(trg?.values.length, 1);

  // ALTER-added column survived the rebuild.
  const lateRes = db.exec(`SELECT "late_fee" AS v FROM "facility_contracts" WHERE id = 'r3'`)[0];
  assert.equal(Number(lateRes.values[0][0]), 55.5);

  // Idempotent: second run must not double-scale.
  MIGRATION_PART_139.up(db as any);
  assert.equal(moneyValue(db, 'fixed_assets', 'purchase_cost'), 11457);
  assert.equal(moneyValue(db, 'partner_account_transactions', 'amount'), 11457);
  assert.equal(moneyValue(db, 'operation_shift_handovers', 'cash_delivered'), 11457);

  db.close();
});
