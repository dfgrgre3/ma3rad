import { addColumn } from './support';
import type { Migration } from './support';

export const MIGRATION_PART_33: Migration[] = [
  {
    id: '145_hr_configurable_leave_accrual',
    description: 'Add branch and employee leave accrual policies with auditable generated balance transactions.',
    up: (db) => {
      addColumn(db, 'employee_leave_balance_transactions', 'source_key', 'TEXT');
      db.exec(`
        CREATE UNIQUE INDEX idx_leave_balance_source
          ON employee_leave_balance_transactions(employee_id, source_key)
          WHERE source_key IS NOT NULL;

        CREATE TABLE employee_leave_accrual_policies (
          id TEXT PRIMARY KEY,
          branch_id TEXT NOT NULL,
          employee_id TEXT,
          scope_key TEXT NOT NULL,
          effective_from TEXT NOT NULL,
          annual_entitlement_days REAL,
          carryover_limit_days REAL,
          prorate_on_service INTEGER,
          updated_by TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK(scope_key = COALESCE(employee_id, 'BRANCH')),
          CHECK(
            (employee_id IS NULL AND annual_entitlement_days IS NOT NULL
              AND carryover_limit_days IS NOT NULL AND prorate_on_service IS NOT NULL)
            OR (employee_id IS NOT NULL AND (
              (annual_entitlement_days IS NULL AND carryover_limit_days IS NULL AND prorate_on_service IS NULL)
              OR (annual_entitlement_days IS NOT NULL
                AND carryover_limit_days IS NOT NULL AND prorate_on_service IS NOT NULL)
            ))
          ),
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (updated_by) REFERENCES users(id),
          UNIQUE (branch_id, scope_key, effective_from)
        );
        CREATE INDEX idx_leave_accrual_policy_effective
          ON employee_leave_accrual_policies(branch_id, scope_key, effective_from DESC);
      `);
    },
  },
];
