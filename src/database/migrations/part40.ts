import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_40: Migration[] = [
  {
    id: '152_hr_onboarding_offboarding_probation',
    description: 'Add onboarding checklists, custody items and probation reviews for employee lifecycle procedures.',
    disableForeignKeys: true,
    up: (db) => {
      if (!tableExists(db, 'employee_onboarding_tasks')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS employee_onboarding_tasks (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            task_name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'GENERAL',
            due_date TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED','CANCELLED')),
            completed_at TEXT,
            completed_by TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_onboarding_employee ON employee_onboarding_tasks(employee_id, status);
        `);
      }

      if (!tableExists(db, 'employee_custody_items')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS employee_custody_items (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            item_name TEXT NOT NULL,
            item_type TEXT NOT NULL DEFAULT 'EQUIPMENT',
            serial_number TEXT,
            assigned_at TEXT NOT NULL,
            returned_at TEXT,
            status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK(status IN ('ASSIGNED','RETURNED','LOST')),
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_custody_employee ON employee_custody_items(employee_id, status);
        `);
      }

      if (!tableExists(db, 'employee_probation_reviews')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS employee_probation_reviews (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            review_date TEXT NOT NULL,
            reviewer_id TEXT,
            score REAL NOT NULL DEFAULT 0,
            rating TEXT NOT NULL DEFAULT 'SATISFACTORY',
            recommendation TEXT NOT NULL DEFAULT 'CONTINUE',
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','APPROVED')),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_probation_employee ON employee_probation_reviews(employee_id, review_date);
        `);
      }
    },
  },
];
