import type { Migration } from './support';
import { addColumn } from './support';

/**
 * Migration 228: sales representative branch coverage.
 *
 * employees.branch_id remains the employee's home branch. Sales reps
 * (is_sales_rep = 1) can additionally serve other branches through
 * employee_branch_assignments — a soft, many-to-many coverage model.
 *
 * The rep columns are added defensively: fresh databases already get them
 * from the declarative schema, while older databases may predate them.
 */
export const MIGRATION_PART_144: Migration = {
  id: '228_employee_sales_rep_branch_assignments',
  description: 'Add sales rep flag, commission/target fields and employee branch assignments',
  up: (db) => {
    addColumn(db, 'employees', 'is_sales_rep', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'employees', 'commission_percentage', 'REAL NOT NULL DEFAULT 0');
    addColumn(db, 'employees', 'monthly_target', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'employees', 'company_id', 'TEXT');

    db.exec(`
      CREATE TABLE IF NOT EXISTS employee_branch_assignments (
        employee_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (employee_id, branch_id),
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_eba_branch ON employee_branch_assignments(branch_id);
      CREATE INDEX IF NOT EXISTS idx_eba_employee ON employee_branch_assignments(employee_id);
    `);
  },
};
