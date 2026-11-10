import { addColumn } from './support';
import type { Migration } from './support';

export const MIGRATION_PART_31: Migration[] = [
  {
    id: '143_hr_employee_profiles_and_organization',
    description: 'Extend employee profiles and add manageable HR job titles.',
    up: (db) => {
      addColumn(db, 'departments', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
      addColumn(db, 'employees', 'gender', 'TEXT');
      addColumn(db, 'employees', 'birth_date', 'TEXT');
      addColumn(db, 'employees', 'emergency_contact_name', 'TEXT');
      addColumn(db, 'employees', 'emergency_contact_phone', 'TEXT');
      addColumn(db, 'employees', 'manager_employee_id', 'TEXT REFERENCES employees(id) ON DELETE SET NULL');
      addColumn(db, 'employees', 'probation_start_date', 'TEXT');
      addColumn(db, 'employees', 'probation_end_date', 'TEXT');
      addColumn(db, 'employees', 'bank_account_number', 'TEXT');
      addColumn(db, 'employees', 'bank_name', 'TEXT');
      addColumn(db, 'employees', 'salary_payment_method', "TEXT NOT NULL DEFAULT 'CASH'");
      addColumn(db, 'employees', 'social_insurance_number', 'TEXT');
      addColumn(db, 'employees', 'tax_file_number', 'TEXT');
      addColumn(db, 'employees', 'education', 'TEXT');
      addColumn(db, 'employees', 'previous_experience', 'TEXT');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_employees_department
          ON employees(department_id, branch_id);
        CREATE INDEX IF NOT EXISTS idx_employees_manager
          ON employees(manager_employee_id);

        CREATE TABLE employee_job_titles (
          id TEXT PRIMARY KEY,
          department_id TEXT,
          title TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX idx_employee_job_titles_department
          ON employee_job_titles(department_id, is_active, title);
        CREATE UNIQUE INDEX idx_employee_job_titles_unique
          ON employee_job_titles(COALESCE(department_id, ''), lower(title));

        UPDATE departments SET is_active = 1 WHERE is_active IS NULL;
      `);
    },
  },
];
