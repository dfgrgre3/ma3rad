export const SCHEMA_PART_16 = String.raw`
CREATE TABLE IF NOT EXISTS inventory_reconciliation_logs (
  id TEXT PRIMARY KEY,
  reconciliation_date TEXT NOT NULL,
  warehouse_id TEXT,
  total_physical_cost REAL NOT NULL,
  total_fifo_layer_cost REAL NOT NULL,
  total_gl_inventory_cost REAL NOT NULL,
  variance_physical_vs_fifo REAL NOT NULL,
  variance_fifo_vs_gl REAL NOT NULL,
  status TEXT DEFAULT 'BALANCED' CHECK(status IN ('BALANCED', 'DISCREPANCY_DETECTED', 'RESOLVED')),
  notes TEXT,
  performed_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (performed_by) REFERENCES users(id)
);

CREATE TRIGGER IF NOT EXISTS trg_prevent_update_inv_tx BEFORE UPDATE ON inventory_transactions
BEGIN
  SELECT RAISE(ABORT, 'Inventory ledger is immutable. Update is prohibited.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_inv_tx BEFORE DELETE ON inventory_transactions
BEGIN
  SELECT RAISE(ABORT, 'Inventory ledger is immutable. Delete is prohibited.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_excess_reservation_insert BEFORE INSERT ON warehouse_stock
WHEN (ROUND(NEW.reserved_m2, 3) > ROUND(NEW.quantity_m2, 3))
BEGIN
  SELECT RAISE(ABORT, 'Reserved stock cannot exceed total physical stock.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_excess_reservation_update BEFORE UPDATE ON warehouse_stock
WHEN (ROUND(NEW.reserved_m2, 3) > ROUND(NEW.quantity_m2, 3))
BEGIN
  SELECT RAISE(ABORT, 'Reserved stock cannot exceed total physical stock.');
END;

-- 41b. GENERAL LEDGER & CHART OF ACCOUNTS
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  parent_code TEXT,
  balance REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  entry_number TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  total_debit REAL NOT NULL,
  total_credit REAL NOT NULL,
  is_posted INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  debit REAL NOT NULL,
  credit REAL NOT NULL,
  description TEXT,
  cost_center_id TEXT,
  FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
);

-- 42. ENTERPRISE ACCOUNTING: FISCAL YEARS, PERIODS & CLOSING
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

-- 43. BANK ACCOUNTS & RECONCILIATIONS
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

`;
