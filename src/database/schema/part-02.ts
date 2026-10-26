export const SCHEMA_PART_02 = String.raw`
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id TEXT PRIMARY KEY,
  transaction_number TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK(type IN (
    'PURCHASE', 'SALE', 'PURCHASE_RETURN', 'SALES_RETURN', 
    'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB', 
    'DAMAGE', 'OPENING_BALANCE', 'STOCK_COUNT', 'VOID'
  )),
  product_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  boxes_count REAL DEFAULT 0,
  unit_cost REAL NOT NULL,
  total_cost REAL NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  notes TEXT,
  performed_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (performed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_prod ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created ON inventory_transactions(created_at);

-- 6. CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone2 TEXT,
  national_id TEXT,
  address TEXT,
  city TEXT,
  customer_type TEXT DEFAULT 'RETAIL',
  credit_limit REAL DEFAULT 0,
  payment_terms_days INTEGER DEFAULT 0,
  current_balance REAL DEFAULT 0,
  total_purchases REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

-- 7. SUPPLIERS
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  tax_number TEXT,
  commercial_record TEXT,
  address TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  current_balance REAL DEFAULT 0,
  total_purchases REAL DEFAULT 0,
  payment_terms_days INTEGER DEFAULT 30,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 8. CASH REGISTERS & SHIFTS
CREATE TABLE IF NOT EXISTS cash_registers (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  current_balance REAL DEFAULT 0,
  is_default INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cash_shifts (
  id TEXT PRIMARY KEY,
  shift_number TEXT UNIQUE NOT NULL,
  register_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,
  total_sales_cash REAL DEFAULT 0,
  total_sales_card REAL DEFAULT 0,
  total_sales_transfer REAL DEFAULT 0,
  total_customer_payments REAL DEFAULT 0,
  total_supplier_payments REAL DEFAULT 0,
  total_expenses REAL DEFAULT 0,
  total_refunds REAL DEFAULT 0,
  expected_ending_cash REAL DEFAULT 0,
  actual_ending_cash REAL,
  cash_difference REAL DEFAULT 0,
  status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED')),
  closing_notes TEXT,
  FOREIGN KEY (register_id) REFERENCES cash_registers(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 9. EXPENSES
CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  category_id TEXT,
  amount REAL NOT NULL,
  register_id TEXT NOT NULL,
  shift_id TEXT,
  payment_type TEXT DEFAULT 'CASH',
  date TEXT NOT NULL,
  recipient TEXT,
  description TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (register_id) REFERENCES cash_registers(id),
  FOREIGN KEY (shift_id) REFERENCES cash_shifts(id),
  FOREIGN KEY (performed_by) REFERENCES users(id)
);

-- 10. SALES INVOICES
`;
