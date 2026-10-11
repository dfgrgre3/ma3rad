// SQLite Database Initialization & Schema Engine

export const SCHEMA_SQL = `
-- PRAGMAS
PRAGMA foreign_keys = ON;

-- 1. USERS & ROLES
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'MANAGER', 'CASHIER', 'SALES', 'WAREHOUSE', 'ACCOUNTANT')),
  phone TEXT,
  pin_code TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  module TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  PRIMARY KEY (user_id, permission_code),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2. CATEGORIES & BRANDS
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  parent_id TEXT,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  country TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 3. PRODUCTS (SPECIALIZED CERAMICS)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  barcode TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT 'GRADE_1' CHECK(grade IN ('GRADE_1', 'GRADE_2', 'GRADE_3', 'COMMERCIAL')),
  size TEXT NOT NULL,
  thickness REAL DEFAULT 0,
  color TEXT,
  finish TEXT,
  surface_location TEXT DEFAULT 'FLOOR',
  
  base_unit TEXT DEFAULT 'M2',
  sell_unit TEXT DEFAULT 'M2',
  pieces_per_box INTEGER NOT NULL DEFAULT 4,
  meters_per_box REAL NOT NULL DEFAULT 1.44,
  weight_per_box REAL DEFAULT 0,
  
  cost_price REAL NOT NULL DEFAULT 0,
  selling_price_m2 REAL NOT NULL DEFAULT 0,
  selling_price_box REAL NOT NULL DEFAULT 0,
  wholesale_price_m2 REAL NOT NULL DEFAULT 0,
  min_selling_price_m2 REAL NOT NULL DEFAULT 0,
  
  min_stock_level REAL DEFAULT 10,
  max_stock_level REAL,
  
  image_path TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (brand_id) REFERENCES brands(id)
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_grade ON products(grade);

-- 4. WAREHOUSES & STOCK
CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  location TEXT,
  is_default INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warehouse_stock (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity_m2 REAL NOT NULL DEFAULT 0,
  reserved_m2 REAL NOT NULL DEFAULT 0,
  location_in_warehouse TEXT,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(warehouse_id, product_id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stock_prod_wh ON warehouse_stock(product_id, warehouse_id);

-- 5. INVENTORY TRANSACTIONS (IMMUTABLE AUDIT TRAIL)
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
CREATE TABLE IF NOT EXISTS sales_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  shift_id TEXT,
  
  subtotal REAL NOT NULL,
  discount_percentage REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  tax_percentage REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  shipping_cost REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  
  paid_amount REAL NOT NULL DEFAULT 0,
  remaining_amount REAL NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL DEFAULT 'CASH',
  payment_status TEXT NOT NULL DEFAULT 'PAID',
  invoice_status TEXT NOT NULL DEFAULT 'COMPLETED',
  
  total_cost REAL NOT NULL DEFAULT 0,
  gross_profit REAL NOT NULL DEFAULT 0,
  
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (shift_id) REFERENCES cash_shifts(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sales_inv_number ON sales_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_inv_date ON sales_invoices(date);
CREATE INDEX IF NOT EXISTS idx_sales_inv_customer ON sales_invoices(customer_id);

CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  product_grade TEXT NOT NULL,
  size TEXT NOT NULL,
  
  sold_by TEXT NOT NULL DEFAULT 'M2',
  quantity_m2 REAL NOT NULL,
  boxes_count REAL NOT NULL,
  pieces_count INTEGER NOT NULL,
  
  unit_price REAL NOT NULL,
  original_unit_price REAL NOT NULL,
  unit_cost REAL NOT NULL,
  
  discount_amount REAL DEFAULT 0,
  total_price REAL NOT NULL,
  total_cost REAL NOT NULL,
  profit REAL NOT NULL,
  
  meters_per_box REAL NOT NULL,
  pieces_per_box INTEGER NOT NULL,
  
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_sales_item_invoice ON sales_invoice_items(invoice_id);

-- 11. SALES RETURNS
CREATE TABLE IF NOT EXISTS sales_returns (
  id TEXT PRIMARY KEY,
  return_number TEXT UNIQUE NOT NULL,
  original_invoice_id TEXT NOT NULL,
  original_invoice_number TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  date TEXT NOT NULL,
  total_amount REAL NOT NULL,
  refunded_amount REAL NOT NULL DEFAULT 0,
  remaining_to_balance REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (original_invoice_id) REFERENCES sales_invoices(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sales_return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  boxes_count REAL NOT NULL,
  unit_price REAL NOT NULL,
  unit_cost REAL NOT NULL,
  total_refund REAL NOT NULL,
  FOREIGN KEY (return_id) REFERENCES sales_returns(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 12. PURCHASE INVOICES
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  supplier_invoice_number TEXT,
  date TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  
  subtotal REAL NOT NULL,
  discount_amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  shipping_cost REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  
  paid_amount REAL NOT NULL DEFAULT 0,
  remaining_amount REAL NOT NULL DEFAULT 0,
  payment_type TEXT DEFAULT 'CASH',
  payment_status TEXT DEFAULT 'PAID',
  
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  boxes_count REAL NOT NULL,
  unit_cost REAL NOT NULL,
  total_cost REAL NOT NULL,
  meters_per_box REAL NOT NULL,
  pieces_per_box INTEGER NOT NULL,
  FOREIGN KEY (purchase_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 13. CUSTOMER & SUPPLIER PAYMENTS
CREATE TABLE IF NOT EXISTS customer_payments (
  id TEXT PRIMARY KEY,
  receipt_number TEXT UNIQUE NOT NULL,
  customer_id TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'CASH',
  date TEXT NOT NULL,
  register_id TEXT,
  shift_id TEXT,
  notes TEXT,
  performed_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (register_id) REFERENCES cash_registers(id),
  FOREIGN KEY (shift_id) REFERENCES cash_shifts(id),
  FOREIGN KEY (performed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  receipt_number TEXT UNIQUE NOT NULL,
  supplier_id TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'CASH',
  date TEXT NOT NULL,
  register_id TEXT,
  notes TEXT,
  performed_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (register_id) REFERENCES cash_registers(id),
  FOREIGN KEY (performed_by) REFERENCES users(id)
);

-- 14. QUOTATIONS
CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  quotation_number TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  subtotal REAL NOT NULL,
  discount_amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'CONVERTED', 'EXPIRED', 'CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  boxes_count REAL NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 15. AUDIT LOGS & SETTINGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  record_id TEXT,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_history (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  backup_type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 16. SEQUENCE COUNTERS (collision-proof document numbering)
CREATE TABLE IF NOT EXISTS sequence_counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- 17. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  reference_type TEXT,
  reference_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
`;
