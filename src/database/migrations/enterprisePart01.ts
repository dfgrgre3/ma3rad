import type { Database } from 'sql.js';
import { addColumn } from '../migrationSupport';

export function runEnterprisePart1(db: Database): void {
  // 1. Fiscal Years & Periods
  db.run(`
    CREATE TABLE IF NOT EXISTS fiscal_years (
      id TEXT PRIMARY KEY,
      year_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED', 'LOCKED')),
      closed_at TEXT,
      closed_by TEXT,
      closing_entry_id TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (closed_by) REFERENCES users(id)
    );
  
    CREATE TABLE IF NOT EXISTS fiscal_periods (
      id TEXT PRIMARY KEY,
      fiscal_year_id TEXT NOT NULL,
      period_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED', 'LOCKED')),
      closed_at TEXT,
      closed_by TEXT,
      closing_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(fiscal_year_id, period_number),
      FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE CASCADE,
      FOREIGN KEY (closed_by) REFERENCES users(id)
    );
  
    CREATE INDEX IF NOT EXISTS idx_fiscal_periods_dates ON fiscal_periods(start_date, end_date, status);
  `);
}

export function runEnterprisePart2(db: Database): void {
  // 2. Bank Accounts & Bank Reconciliations
  db.run(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      account_name TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      account_number TEXT UNIQUE NOT NULL,
      iban TEXT,
      swift_code TEXT,
      currency TEXT DEFAULT 'EGP',
      opening_balance REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      gl_account_id TEXT NOT NULL,
      branch_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
  
    CREATE TABLE IF NOT EXISTS bank_reconciliations (
      id TEXT PRIMARY KEY,
      reconciliation_number TEXT UNIQUE NOT NULL,
      bank_account_id TEXT NOT NULL,
      statement_date TEXT NOT NULL,
      statement_balance REAL NOT NULL,
      book_balance REAL NOT NULL,
      unreconciled_difference REAL NOT NULL,
      cleared_deposits REAL DEFAULT 0,
      cleared_withdrawals REAL DEFAULT 0,
      status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'RECONCILED', 'APPROVED', 'CANCELLED')),
      reconciled_by TEXT NOT NULL,
      approved_by TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id),
      FOREIGN KEY (reconciled_by) REFERENCES users(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    );
  
    CREATE TABLE IF NOT EXISTS bank_reconciliation_lines (
      id TEXT PRIMARY KEY,
      reconciliation_id TEXT NOT NULL,
      journal_line_id TEXT,
      cheque_id TEXT,
      transaction_date TEXT NOT NULL,
      reference TEXT,
      description TEXT,
      type TEXT CHECK(type IN ('DEPOSIT', 'WITHDRAWAL')),
      amount REAL NOT NULL,
      is_cleared INTEGER DEFAULT 0,
      cleared_date TEXT,
      notes TEXT,
      FOREIGN KEY (reconciliation_id) REFERENCES bank_reconciliations(id) ON DELETE CASCADE
    );
  `);
}

export function runEnterprisePart3(db: Database): void {
  // 3. Cheque status history & enhancements
  db.run(`
    CREATE TABLE IF NOT EXISTS cheque_status_history (
      id TEXT PRIMARY KEY,
      cheque_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      changed_by TEXT NOT NULL,
      journal_entry_id TEXT,
      notes TEXT,
      FOREIGN KEY (cheque_id) REFERENCES cheques(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id)
    );
  `);
  
  // Add columns to cheques if missing
  addColumn(db, 'cheques', 'bank_account_id', 'TEXT');
  addColumn(db, 'cheques', 'deposited_at', 'TEXT');
  addColumn(db, 'cheques', 'cleared_at', 'TEXT');
  addColumn(db, 'cheques', 'bounced_at', 'TEXT');
  addColumn(db, 'cheques', 'bounce_reason', 'TEXT');
  addColumn(db, 'cheques', 'bounce_fee', 'REAL DEFAULT 0');
  addColumn(db, 'cheques', 'journal_entry_id', 'TEXT');
  addColumn(db, 'cheques', 'clearing_entry_id', 'TEXT');
  addColumn(db, 'cheques', 'bounce_entry_id', 'TEXT');
}
