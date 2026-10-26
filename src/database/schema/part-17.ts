export const SCHEMA_PART_17 = String.raw`
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

-- 44. COST CENTERS & BUDGETS
CREATE TABLE IF NOT EXISTS cost_centers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  branch_id TEXT,
  manager_id TEXT,
  is_active INTEGER DEFAULT 1,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  budget_code TEXT UNIQUE NOT NULL,
  fiscal_year_id TEXT NOT NULL,
  cost_center_id TEXT,
  name TEXT NOT NULL,
  total_allocated REAL NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'APPROVED', 'REVISED', 'CLOSED')),
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id),
  FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS budget_items (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  allocated_amount REAL NOT NULL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
);

-- 45. CASH FLOW FORECASTING
CREATE TABLE IF NOT EXISTS cash_forecast_items (
  id TEXT PRIMARY KEY,
  forecast_date TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('INFLOW', 'OUTFLOW')),
  source_type TEXT NOT NULL,
  source_id TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  probability REAL DEFAULT 1.0,
  status TEXT DEFAULT 'PROJECTED' CHECK(status IN ('PROJECTED', 'REALIZED', 'CANCELLED')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cash_forecast_date ON cash_forecast_items(forecast_date, type);

-- 46. E-PAYMENT GATEWAYS & SETTLEMENTS
CREATE TABLE IF NOT EXISTS payment_gateways (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  gl_account_id TEXT NOT NULL,
  commission_rate REAL DEFAULT 0,
  fixed_fee REAL DEFAULT 0,
  settlement_period_days INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  config_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id)
);

CREATE TABLE IF NOT EXISTS payment_gateway_settlements (
  id TEXT PRIMARY KEY,
  settlement_number TEXT UNIQUE NOT NULL,
  gateway_id TEXT NOT NULL,
  settlement_date TEXT NOT NULL,
  gross_amount REAL NOT NULL,
  commission_amount REAL NOT NULL,
  tax_deduction REAL DEFAULT 0,
  net_amount REAL NOT NULL,
  bank_account_id TEXT NOT NULL,
  journal_entry_id TEXT,
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SETTLED', 'DISPUTED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gateway_id) REFERENCES payment_gateways(id),
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 47. MULTI-CURRENCY & EXCHANGE RATES
CREATE TABLE IF NOT EXISTS currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  exchange_rate REAL NOT NULL DEFAULT 1.0,
  is_base INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS currency_exchange_rates (
  id TEXT PRIMARY KEY,
  currency_code TEXT NOT NULL,
  rate_date TEXT NOT NULL,
  rate REAL NOT NULL,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
);

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_coa_with_entries BEFORE DELETE ON chart_of_accounts
BEGIN
  SELECT RAISE(ABORT, 'لا يمكن حذف حساب مرتبط بقيود يومية أو حركات محاسبية.')
  WHERE (SELECT COUNT(*) FROM journal_entry_lines WHERE account_id = OLD.id) > 0;
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_coa_with_children BEFORE DELETE ON chart_of_accounts
BEGIN
  SELECT RAISE(ABORT, 'لا يمكن حذف حساب أب يتبعه حسابات فرعية نشطة.')
  WHERE (SELECT COUNT(*) FROM chart_of_accounts WHERE parent_code = OLD.code) > 0;
END;
`;
