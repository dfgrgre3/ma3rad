import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_46: Migration[] = [
  {
    id: '158_hr_benefits_allowances_loans',
    description: 'Add allowances, benefits, loans, installments and leave settlements.',
    disableForeignKeys: true,
    up: (db) => {
      if (!tableExists(db, 'hr_allowances')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS hr_allowances (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            allowance_type TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            frequency TEXT NOT NULL DEFAULT 'MONTHLY' CHECK(frequency IN ('MONTHLY','ONE_TIME')),
            effective_from TEXT NOT NULL,
            effective_to TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'hr_benefits')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS hr_benefits (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            benefit_type TEXT NOT NULL,
            provider TEXT,
            policy_number TEXT,
            start_date TEXT NOT NULL,
            end_date TEXT,
            amount REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXPIRED','CANCELLED')),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'hr_loans')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS hr_loans (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            principal REAL NOT NULL,
            installment_amount REAL NOT NULL,
            start_date TEXT NOT NULL,
            remaining_balance REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','CANCELLED')),
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      if (!tableExists(db, 'hr_loan_installments')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS hr_loan_installments (
            id TEXT PRIMARY KEY,
            loan_id TEXT NOT NULL,
            due_date TEXT NOT NULL,
            amount REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','SKIPPED')),
            payroll_transaction_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_loan_installments_loan ON hr_loan_installments(loan_id, due_date);
        `);
      }
      if (!tableExists(db, 'hr_leave_settlements')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS hr_leave_settlements (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            leave_days REAL NOT NULL,
            amount REAL NOT NULL,
            settlement_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','PAID')),
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
    },
  },
];
