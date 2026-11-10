import type { Migration } from './support';

export const MIGRATION_PART_29: Migration[] = [
  {
    id: '141_hr_leave_balances_and_attendance',
    description: 'Add auditable leave balance adjustments, optional annual type limits, and attendance links for approved leave.',
    up: (db) => {
      db.exec(`
        CREATE TABLE employee_leave_balance_transactions (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          leave_year INTEGER NOT NULL,
          days_delta REAL NOT NULL CHECK(days_delta != 0),
          transaction_type TEXT NOT NULL
            CHECK(transaction_type IN ('ALLOCATION', 'CARRYOVER', 'ADJUSTMENT')),
          effective_date TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX idx_leave_balance_employee_year
          ON employee_leave_balance_transactions(employee_id, leave_year, effective_date);

        CREATE TABLE employee_leave_type_policies (
          branch_id TEXT NOT NULL,
          leave_type TEXT NOT NULL
            CHECK(leave_type IN ('ANNUAL', 'SICK', 'UNPAID', 'OTHER')),
          max_days_per_year REAL CHECK(max_days_per_year IS NULL OR max_days_per_year >= 0),
          updated_by TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (branch_id, leave_type),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (updated_by) REFERENCES users(id)
        );

        CREATE TABLE employee_leave_attendance_links (
          id TEXT PRIMARY KEY,
          leave_request_id TEXT NOT NULL,
          attendance_id TEXT NOT NULL,
          previous_json TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (leave_request_id, attendance_id),
          FOREIGN KEY (leave_request_id) REFERENCES employee_leave_requests(id) ON DELETE CASCADE,
          FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX idx_leave_attendance_request
          ON employee_leave_attendance_links(leave_request_id);
      `);
    },
  },
];
