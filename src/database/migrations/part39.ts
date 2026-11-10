import type { Migration } from './support';
import { addColumn, tableExists } from './support';

/**
 * Organizational structure and employee lifecycle foundation.
 *
 * Departments already existed as a flat list. This migration adds the
 * hierarchy (parent department, department manager, required headcount),
 * job grades, cost centers, employee transfers and a generic lifecycle event
 * log so hiring, promotion, transfer, salary change, termination and
 * offboarding can be audited in one place.
 */
export const MIGRATION_PART_39: Migration[] = [
  {
    id: '151_hr_organization_and_lifecycle',
    description: 'Add department hierarchy, job grades, cost centers, employee transfers and lifecycle events.',
    disableForeignKeys: true,
    up: (db) => {
      if (tableExists(db, 'departments')) {
        addColumn(db, 'departments', 'parent_department_id', 'TEXT');
        addColumn(db, 'departments', 'manager_employee_id', 'TEXT');
        addColumn(db, 'departments', 'required_headcount', 'INTEGER NOT NULL DEFAULT 0');
        addColumn(db, 'departments', 'cost_center_id', 'TEXT');
      }

      if (!tableExists(db, 'job_grades')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS job_grades (
            id TEXT PRIMARY KEY,
            branch_id TEXT,
            company_id TEXT,
            name TEXT NOT NULL,
            level INTEGER NOT NULL DEFAULT 1,
            min_salary REAL NOT NULL DEFAULT 0,
            max_salary REAL NOT NULL DEFAULT 0,
            description TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_job_grades_branch ON job_grades(branch_id, is_active);
        `);
      }

      if (!tableExists(db, 'cost_centers')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS cost_centers (
            id TEXT PRIMARY KEY,
            branch_id TEXT,
            company_id TEXT,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_cost_centers_branch ON cost_centers(branch_id, is_active);
        `);
      }

      if (!tableExists(db, 'employee_transfers')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS employee_transfers (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            from_branch_id TEXT,
            to_branch_id TEXT,
            from_department_id TEXT,
            to_department_id TEXT,
            from_job_title TEXT,
            to_job_title TEXT,
            from_grade_id TEXT,
            to_grade_id TEXT,
            transfer_date TEXT NOT NULL,
            reason TEXT,
            status TEXT NOT NULL DEFAULT 'APPROVED',
            approved_by TEXT,
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_employee_transfers_employee ON employee_transfers(employee_id, transfer_date);
        `);
      }

      if (!tableExists(db, 'employee_lifecycle_events')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS employee_lifecycle_events (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            event_date TEXT NOT NULL,
            from_value TEXT,
            to_value TEXT,
            notes TEXT,
            actor_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_employee_lifecycle_employee ON employee_lifecycle_events(employee_id, event_date);
        `);
      }

      if (tableExists(db, 'employees')) {
        addColumn(db, 'employees', 'job_grade_id', 'TEXT');
        addColumn(db, 'employees', 'cost_center_id', 'TEXT');
      }
    },
  },
];
