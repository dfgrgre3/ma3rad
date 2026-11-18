import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION_PART_137 } from '../src/database/migrations/part137.ts';

const SQL = await (globalThis as any).initSqlJs();

// Mirror of MONEY_TABLES in part137.ts — kept in sync manually.
const TABLES: Record<string, string[]> = {
  employees: ['base_salary','monthly_target'],
  employee_contracts: ['salary'],
  employee_salary_history: ['previous_salary','next_salary'],
  job_grades: ['min_salary','max_salary'],
  hr_candidate_offers: ['salary'],
  payroll_transactions: ['amount'],
  payroll_run_items: ['base_salary','base_amount','overtime_amount','bonus_amount','commission_amount','advance_amount','manual_deduction_amount','attendance_deduction_amount','tax_amount','gross_amount','net_amount','paid_amount','allowance_amount','loan_deduction_amount','social_insurance_base','social_insurance_employee_share','social_insurance_employer_share','social_insurance_total','end_of_service_benefit'],
  payroll_social_insurance_contributions: ['contribution_base','employee_share_amount','employer_share_amount','total_amount'],
  payroll_social_insurance_rules: ['contribution_ceiling','minimum_contribution_base','maximum_contribution_base'],
  payroll_end_of_service_settlements: ['last_monthly_salary','benefit_amount'],
  employee_final_settlements: ['base_salary','earned_wages','leave_payout','total_amount'],
  hr_leave_settlements: ['amount'],
  hr_loans: ['principal','installment_amount','remaining_balance'],
  hr_loan_installments: ['amount'],
  hr_allowances: ['amount'],
  hr_benefits: ['amount'],
  hr_penalties: ['amount'],
  hr_workforce_plans: ['approved_recruitment_budget','expected_employee_cost'],
  performance_rewards: ['amount'],
  training_courses: ['cost'],
  training_expenses: ['amount'],
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
  db.exec('ALTER TABLE "payroll_run_items" ADD COLUMN "notes_late" TEXT');

  db.exec('CREATE INDEX "idx_pri_net" ON "payroll_run_items" ("net_amount")');
  db.exec(`CREATE TRIGGER "pri_audit" AFTER UPDATE ON "payroll_run_items"
           BEGIN UPDATE "payroll_run_items" SET "gross_amount" = "net_amount" WHERE id = 'none'; END`);
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

test('part137 converts REAL money columns to INTEGER piastres idempotently', () => {
  const db = new SQL.Database();
  createLegacySchema(db);

  MIGRATION_PART_137.up(db as any);

  for (const [table, cols] of Object.entries(TABLES)) {
    for (const col of cols) {
      assert.equal(columnType(db, table, col), 'INTEGER', `${table}.${col} should be INTEGER`);
      assert.equal(moneyValue(db, table, col), 11457, `${table}.${col} should hold 11457 piastres`);
    }
  }

  // NULLs backfilled to 0.
  const nullRes = db.exec(`SELECT "amount" AS v FROM "hr_penalties" WHERE id = 'r2'`)[0];
  assert.equal(Number(nullRes.values[0][0]), 0);

  // Index + trigger survived rebuilds.
  const idx = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pri_net'`)[0];
  assert.equal(idx?.values.length, 1);
  const trg = db.exec(`SELECT name FROM sqlite_master WHERE type='trigger' AND name='pri_audit'`)[0];
  assert.equal(trg?.values.length, 1);

  // ALTER-added non-spec column survived.
  assert.equal(columnType(db, 'payroll_run_items', 'notes_late'), 'TEXT');

  // Idempotent: second run must not double-scale.
  MIGRATION_PART_137.up(db as any);
  assert.equal(moneyValue(db, 'employees', 'base_salary'), 11457);
  assert.equal(moneyValue(db, 'payroll_run_items', 'net_amount'), 11457);

  db.close();
});
