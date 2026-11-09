import type { Database } from 'sql.js';

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
