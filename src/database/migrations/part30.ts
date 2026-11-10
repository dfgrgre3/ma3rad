import { addColumn } from './support';
import type { Migration } from './support';

export const MIGRATION_PART_30: Migration[] = [
  {
    id: '142_hr_employment_lifecycle',
    description: 'Add contract approval and renewal links, employee lifecycle and salary history, and final settlement snapshots.',
    up: (db) => {
      addColumn(db, 'employee_contracts', 'approved_by', 'TEXT');
      addColumn(db, 'employee_contracts', 'approved_at', 'TEXT');
      addColumn(db, 'employee_contracts', 'renewed_from_id', 'TEXT');
      addColumn(db, 'employee_contracts', 'salary_components_json', "TEXT NOT NULL DEFAULT '[]'");
      addColumn(db, 'employees', 'termination_reason', 'TEXT');
      db.exec(`
        UPDATE employee_contracts
        SET approved_by = COALESCE(approved_by, created_by),
            approved_at = COALESCE(approved_at, signed_date, created_at)
        WHERE status IN ('ACTIVE', 'TERMINATED');

        CREATE INDEX IF NOT EXISTS idx_employee_contract_renewal
          ON employee_contracts(renewed_from_id);

        CREATE TABLE employee_status_history (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          previous_status TEXT,
          next_status TEXT NOT NULL,
          effective_date TEXT NOT NULL,
          reason TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (actor_id) REFERENCES users(id)
        );
        CREATE INDEX idx_employee_status_history_employee
          ON employee_status_history(employee_id, effective_date DESC);

        CREATE TABLE employee_salary_history (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          previous_salary REAL,
          next_salary REAL NOT NULL,
          salary_type TEXT NOT NULL CHECK(salary_type IN ('MONTHLY', 'DAILY')),
          effective_date TEXT NOT NULL,
          source_type TEXT NOT NULL CHECK(source_type IN ('CONTRACT', 'MANUAL')),
          source_id TEXT,
          reason TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (actor_id) REFERENCES users(id)
        );
        CREATE INDEX idx_employee_salary_history_employee
          ON employee_salary_history(employee_id, effective_date DESC);

        CREATE TABLE employee_final_settlements (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          contract_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          termination_date TEXT NOT NULL,
          reason TEXT NOT NULL,
          salary_type TEXT NOT NULL CHECK(salary_type IN ('MONTHLY', 'DAILY')),
          base_salary REAL NOT NULL DEFAULT 0,
          earned_wages REAL NOT NULL DEFAULT 0,
          unused_annual_leave_days REAL NOT NULL DEFAULT 0,
          leave_payout REAL NOT NULL DEFAULT 0,
          total_amount REAL NOT NULL DEFAULT 0,
          details_json TEXT NOT NULL DEFAULT '{}',
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id),
          FOREIGN KEY (contract_id) REFERENCES employee_contracts(id),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          UNIQUE(contract_id)
        );
        CREATE INDEX idx_employee_final_settlements_employee
          ON employee_final_settlements(employee_id, termination_date DESC);
      `);
    },
  },
];
