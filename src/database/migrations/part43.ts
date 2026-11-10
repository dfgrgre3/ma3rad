import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_43: Migration[] = [
  {
    id: '155_hr_training_expenses',
    description: 'Add training expense records and a dedicated training expense account.',
    disableForeignKeys: true,
    up: (db) => {
      db.run(`INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
        VALUES ('acc_5208', '5208', 'مصروفات التدريب والتطوير', 'EXPENSE', '52', 0, 1)`);
      if (!tableExists(db, 'training_expenses')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS training_expenses (
            id TEXT PRIMARY KEY,
            course_id TEXT,
            employee_id TEXT,
            amount REAL NOT NULL,
            expense_date TEXT NOT NULL,
            description TEXT,
            payment_method TEXT NOT NULL DEFAULT 'CASH',
            ledger_reference_id TEXT,
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_training_expenses_course ON training_expenses(course_id);
        `);
      }
    },
  },
];
