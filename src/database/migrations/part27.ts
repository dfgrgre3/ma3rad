import type { Migration } from './support';
import { columnExists } from './support';

export const MIGRATION_PART_27: Migration[] = [
  {
    id: '139_payroll_runs',
    description: 'Add period-based payroll runs, itemized snapshots, and attendance minute tracking.',
    up: (db) => {
      if (!columnExists(db, 'attendance', 'late_minutes')) {
        db.exec('ALTER TABLE attendance ADD COLUMN late_minutes INTEGER NOT NULL DEFAULT 0');
      }
      if (!columnExists(db, 'attendance', 'overtime_minutes')) {
        db.exec('ALTER TABLE attendance ADD COLUMN overtime_minutes INTEGER NOT NULL DEFAULT 0');
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS payroll_runs (
          id TEXT PRIMARY KEY,
          period TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'DRAFT'
            CHECK(status IN ('DRAFT', 'APPROVED', 'PAID', 'CLOSED')),
          source_fingerprint TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          approved_by TEXT,
          approved_at TEXT,
          paid_by TEXT,
          paid_at TEXT,
          closed_by TEXT,
          closed_at TEXT,
          UNIQUE(period, branch_id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          FOREIGN KEY (approved_by) REFERENCES users(id),
          FOREIGN KEY (paid_by) REFERENCES users(id),
          FOREIGN KEY (closed_by) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS payroll_run_items (
          id TEXT PRIMARY KEY,
          payroll_run_id TEXT NOT NULL,
          employee_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          employee_name TEXT NOT NULL,
          salary_type TEXT NOT NULL,
          base_salary REAL NOT NULL DEFAULT 0,
          expected_workdays REAL NOT NULL DEFAULT 0,
          absent_days REAL NOT NULL DEFAULT 0,
          unpaid_leave_days REAL NOT NULL DEFAULT 0,
          late_minutes INTEGER NOT NULL DEFAULT 0,
          overtime_minutes INTEGER NOT NULL DEFAULT 0,
          base_amount REAL NOT NULL DEFAULT 0,
          overtime_amount REAL NOT NULL DEFAULT 0,
          bonus_amount REAL NOT NULL DEFAULT 0,
          commission_amount REAL NOT NULL DEFAULT 0,
          advance_amount REAL NOT NULL DEFAULT 0,
          manual_deduction_amount REAL NOT NULL DEFAULT 0,
          attendance_deduction_amount REAL NOT NULL DEFAULT 0,
          tax_amount REAL NOT NULL DEFAULT 0,
          gross_amount REAL NOT NULL DEFAULT 0,
          net_amount REAL NOT NULL DEFAULT 0,
          warning_json TEXT NOT NULL DEFAULT '[]',
          detail_json TEXT NOT NULL DEFAULT '{}',
          payout_transaction_id TEXT,
          FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
          FOREIGN KEY (employee_id) REFERENCES employees(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (payout_transaction_id) REFERENCES payroll_transactions(id),
          UNIQUE(payroll_run_id, employee_id)
        );
        CREATE INDEX IF NOT EXISTS idx_payroll_runs_branch_period
          ON payroll_runs(branch_id, period DESC);
        CREATE INDEX IF NOT EXISTS idx_payroll_run_items_employee
          ON payroll_run_items(employee_id, payroll_run_id);
      `);
      db.run(`INSERT OR IGNORE INTO chart_of_accounts
        (id, code, name, type, parent_code, balance, is_active)
        VALUES ('acc_2106', '2106', 'Payroll tax payable', 'LIABILITY', NULL, 0, 1)`);
    },
  },
];
