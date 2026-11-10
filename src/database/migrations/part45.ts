import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_45: Migration[] = [
  {
    id: '157_hr_discipline_complaints',
    description: 'Add violations, warnings, penalties, complaints, appeals and case attachments.',
    disableForeignKeys: true,
    up: (db) => {
      if (!tableExists(db, 'hr_violations')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS hr_violations (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            violation_type TEXT NOT NULL,
            description TEXT,
            occurred_at TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'MINOR' CHECK(severity IN ('MINOR','MODERATE','MAJOR','CRITICAL')),
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','UNDER_REVIEW','CLOSED')),
            reported_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_hr_violations_employee ON hr_violations(employee_id, occurred_at);
        `);
      }
      if (!tableExists(db, 'hr_warnings')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS hr_warnings (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            violation_id TEXT,
            warning_type TEXT NOT NULL DEFAULT 'WRITTEN',
            issued_at TEXT NOT NULL,
            issued_by TEXT,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED','CANCELLED')),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'hr_penalties')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS hr_penalties (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            violation_id TEXT,
            penalty_type TEXT NOT NULL DEFAULT 'FINANCIAL',
            amount REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','POSTED','CANCELLED')),
            approved_by TEXT,
            approved_at TEXT,
            payroll_transaction_id TEXT,
            notes TEXT,
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'hr_complaints')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS hr_complaints (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            subject TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED')),
            submitted_at TEXT NOT NULL,
            resolved_at TEXT,
            resolution TEXT,
            assigned_to TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'hr_appeals')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS hr_appeals (
            id TEXT PRIMARY KEY,
            reference_type TEXT NOT NULL,
            reference_id TEXT NOT NULL,
            employee_id TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','APPROVED','REJECTED')),
            decided_by TEXT,
            decided_at TEXT,
            decision TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'hr_case_attachments')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS hr_case_attachments (
            id TEXT PRIMARY KEY,
            reference_type TEXT NOT NULL,
            reference_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_path TEXT,
            uploaded_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
    },
  },
];
