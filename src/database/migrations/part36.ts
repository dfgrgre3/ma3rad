import type { Migration } from './support';
import { addColumn } from './support';

export const MIGRATION_PART_36: Migration[] = [
  {
    id: '147_hr_department_access_scope',
    description: 'Add explicit user-to-department access assignments for HR records',
    up: (db) => {
      addColumn(db, 'users', 'department_scope', "TEXT NOT NULL DEFAULT 'ALL' CHECK(department_scope IN ('ALL', 'ASSIGNED'))");
      db.exec(`
        CREATE TABLE IF NOT EXISTS users_departments (
          user_id TEXT NOT NULL,
          department_id TEXT NOT NULL,
          assigned_by TEXT NOT NULL,
          assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, department_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
          FOREIGN KEY (assigned_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_users_departments_department_user
          ON users_departments(department_id, user_id);
      `);
    },
  },
];
