// SQLite Database Initialization & Schema Engine

export const SCHEMA_SQL = `
-- PRAGMAS
-- 1. USERS & ROLES
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
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
  product_type TEXT NOT NULL DEFAULT 'CERAMIC',
  custom_unit TEXT NOT NULL DEFAULT '',
  sku TEXT UNIQUE NOT NULL,
  barcode TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT 'GRADE_1' CHECK(grade IN ('GRADE_1', 'GRADE_2', 'GRADE_3', 'COMMERCIAL')),
  size TEXT NOT NULL,
  thickness REAL DEFAULT 0,
  color TEXT,
  tone TEXT NOT NULL DEFAULT '',
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
CREATE TABLE IF NOT EXISTS sales_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  due_date TEXT,
  customer_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  project_id TEXT,
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
  payment_group_id TEXT,
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

-- 18. BRANCHES
-- A showroom chain has several branches; warehouses, registers, invoices and
-- employees all hang off one. Existing tables gain branch_id via COLUMN_MIGRATIONS.
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT UNIQUE NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  manager_id TEXT,
  is_main INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  opened_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);

-- 19. HR: DEPARTMENTS, EMPLOYEES, ATTENDANCE, LEAVES
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  branch_id TEXT,
  manager_id TEXT,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  user_id TEXT,
  full_name TEXT NOT NULL,
  national_id TEXT,
  phone TEXT NOT NULL,
  phone2 TEXT,
  email TEXT,
  address TEXT,
  branch_id TEXT,
  department_id TEXT,
  job_title TEXT NOT NULL,
  employment_type TEXT DEFAULT 'FULL_TIME' CHECK(employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY')),
  hired_at TEXT NOT NULL,
  terminated_at TEXT,
  base_salary REAL DEFAULT 0,
  is_sales_rep INTEGER DEFAULT 0,
  commission_percentage REAL DEFAULT 0,
  monthly_target REAL DEFAULT 0,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_rep ON employees(is_sales_rep);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);

CREATE TABLE IF NOT EXISTS employee_attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  worked_minutes INTEGER DEFAULT 0,
  late_minutes INTEGER DEFAULT 0,
  overtime_minutes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'PRESENT' CHECK(status IN ('PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HOLIDAY', 'WEEKEND')),
  notes TEXT,
  recorded_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON employee_attendance(employee_id, date);

CREATE TABLE IF NOT EXISTS employee_leaves (
  id TEXT PRIMARY KEY,
  request_number TEXT UNIQUE NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type TEXT NOT NULL CHECK(leave_type IN ('ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY', 'MATERNITY', 'OTHER')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days_count REAL NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  decided_by TEXT,
  decided_at TEXT,
  decision_notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (decided_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_leaves_status ON employee_leaves(status);

-- 20. COMMISSIONS
CREATE TABLE IF NOT EXISTS commissions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('SALES_INVOICE', 'COLLECTION', 'PROJECT', 'MANUAL')),
  source_id TEXT,
  period_month TEXT NOT NULL,
  base_amount REAL NOT NULL DEFAULT 0,
  percentage REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'PAID', 'CANCELLED')),
  paid_at TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_commissions_emp ON commissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_commissions_period ON commissions(period_month);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);

-- 21. SALES ORDERS
-- An order is a commitment before the invoice: it reserves stock and can be
-- fulfilled partially. Distinct from sales_invoices, which are the financial record.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  branch_id TEXT,
  warehouse_id TEXT NOT NULL,
  project_id TEXT,
  quotation_id TEXT,
  sales_rep_id TEXT,
  expected_delivery_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  shipping_cost REAL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  remaining_amount REAL NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'PARTIAL', 'COMPLETED', 'CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL,
  FOREIGN KEY (sales_rep_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  boxes_count REAL NOT NULL DEFAULT 0,
  delivered_m2 REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL,
  discount_amount REAL DEFAULT 0,
  total_price REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- 22. PURCHASING PIPELINE: REQUEST -> ORDER -> RECEIPT -> RETURN
CREATE TABLE IF NOT EXISTS purchase_requests (
  id TEXT PRIMARY KEY,
  request_number TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  branch_id TEXT,
  warehouse_id TEXT,
  requested_by TEXT NOT NULL,
  needed_by TEXT,
  priority TEXT DEFAULT 'NORMAL' CHECK(priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'ORDERED', 'CANCELLED')),
  decided_by TEXT,
  decided_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (decided_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pur_req_status ON purchase_requests(status);

CREATE TABLE IF NOT EXISTS purchase_request_items (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  boxes_count REAL DEFAULT 0,
  estimated_unit_cost REAL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  request_id TEXT,
  expected_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  shipping_cost REAL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'SENT', 'CONFIRMED', 'PARTIAL', 'RECEIVED', 'CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pur_ord_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_pur_ord_supplier ON purchase_orders(supplier_id);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  boxes_count REAL DEFAULT 0,
  received_m2 REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL,
  total_cost REAL NOT NULL,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS purchase_order_receipts (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL,
  purchase_invoice_id TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS purchase_order_receipt_items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  order_item_id TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  FOREIGN KEY (receipt_id) REFERENCES purchase_order_receipts(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES purchase_order_items(id)
);

CREATE TABLE IF NOT EXISTS receivables (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'OTHER',
  responsible_name TEXT,
  phone TEXT,
  address TEXT,
  description TEXT,
  custom_fields_json TEXT NOT NULL DEFAULT '{}',
  quantity REAL,
  unit TEXT,
  amount REAL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  progress REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_receivables_status_due ON receivables(status, due_date);
CREATE TABLE IF NOT EXISTS receivable_updates (
  id TEXT PRIMARY KEY,
  receivable_id TEXT NOT NULL,
  update_type TEXT NOT NULL DEFAULT 'NOTE',
  details TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (receivable_id) REFERENCES receivables(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_receivable_updates_record ON receivable_updates(receivable_id, created_at);
CREATE TABLE IF NOT EXISTS receivable_attachments (
  id TEXT PRIMARY KEY,
  receivable_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data_url TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (receivable_id) REFERENCES receivables(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS customer_payment_promises (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  invoice_id TEXT,
  promised_amount REAL,
  promise_date TEXT,
  followup_date TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','KEPT','BROKEN','CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_customer_promises_due ON customer_payment_promises(status,promise_date,followup_date);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id TEXT PRIMARY KEY,
  return_number TEXT UNIQUE NOT NULL,
  original_purchase_id TEXT NOT NULL,
  original_invoice_number TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  date TEXT NOT NULL,
  total_amount REAL NOT NULL,
  refunded_amount REAL NOT NULL DEFAULT 0,
  remaining_to_balance REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (original_purchase_id) REFERENCES purchase_invoices(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  boxes_count REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL,
  total_refund REAL NOT NULL,
  FOREIGN KEY (return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 23. STOCK OPERATIONS AS DOCUMENTS
-- inventory_transactions stays the immutable ledger; these tables are the
-- headers/lines that produce those ledger rows, so a count or transfer can be
-- drafted, reviewed and only then posted.
CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  transfer_number TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  from_warehouse_id TEXT NOT NULL,
  to_warehouse_id TEXT NOT NULL,
  status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')),
  total_quantity_m2 REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  shipped_at TEXT,
  received_at TEXT,
  received_by TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (received_by) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_transfers_status ON stock_transfers(status);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  boxes_count REAL DEFAULT 0,
  received_m2 REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id TEXT PRIMARY KEY,
  count_number TEXT UNIQUE NOT NULL,
  warehouse_id TEXT NOT NULL,
  date TEXT NOT NULL,
  count_type TEXT DEFAULT 'FULL' CHECK(count_type IN ('FULL', 'PARTIAL', 'SPOT')),
  status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'COUNTING', 'REVIEW', 'POSTED', 'CANCELLED')),
  total_items INTEGER DEFAULT 0,
  items_with_variance INTEGER DEFAULT 0,
  total_variance_value REAL DEFAULT 0,
  posted_at TEXT,
  posted_by TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (posted_by) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_counts_status ON stock_counts(status);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id TEXT PRIMARY KEY,
  count_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  system_quantity_m2 REAL NOT NULL DEFAULT 0,
  counted_quantity_m2 REAL,
  variance_m2 REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  variance_value REAL NOT NULL DEFAULT 0,
  counted_by TEXT,
  counted_at TEXT,
  notes TEXT,
  UNIQUE(count_id, product_id),
  FOREIGN KEY (count_id) REFERENCES stock_counts(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id TEXT PRIMARY KEY,
  adjustment_number TEXT UNIQUE NOT NULL,
  warehouse_id TEXT NOT NULL,
  date TEXT NOT NULL,
  adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('ADD', 'SUBTRACT', 'DAMAGE', 'OPENING_BALANCE')),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'REJECTED', 'CANCELLED')),
  total_quantity_m2 REAL NOT NULL DEFAULT 0,
  total_value REAL NOT NULL DEFAULT 0,
  approved_by TEXT,
  approved_at TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_adjustments_status ON stock_adjustments(status);

CREATE TABLE IF NOT EXISTS stock_adjustment_items (
  id TEXT PRIMARY KEY,
  adjustment_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  boxes_count REAL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  total_value REAL NOT NULL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (adjustment_id) REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Soft holds on stock so an order/quotation can promise goods without
-- decrementing warehouse_stock.quantity_m2.
CREATE TABLE IF NOT EXISTS stock_reservations (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  reference_type TEXT NOT NULL CHECK(reference_type IN ('ORDER', 'QUOTATION', 'PROJECT', 'MANUAL')),
  reference_id TEXT,
  status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'RELEASED', 'CONSUMED', 'EXPIRED')),
  expires_at TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_reservations_prod ON stock_reservations(product_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON stock_reservations(status);

-- 24. PRODUCT EXTENSIONS: DYNAMIC ATTRIBUTES, VARIANTS, MEDIA
-- Ceramic-specific fields (size, grade, m2/box) live on products directly;
-- these tables carry everything the showroom sells that is NOT ceramic.
CREATE TABLE IF NOT EXISTS attributes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'TEXT' CHECK(data_type IN ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'DATE')),
  unit TEXT,
  is_required INTEGER DEFAULT 0,
  is_filterable INTEGER DEFAULT 1,
  applies_to_category_id TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (applies_to_category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attribute_options (
  id TEXT PRIMARY KEY,
  attribute_id TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(attribute_id, value),
  FOREIGN KEY (attribute_id) REFERENCES attributes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_attribute_values (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  attribute_id TEXT NOT NULL,
  value TEXT,
  UNIQUE(product_id, attribute_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (attribute_id) REFERENCES attributes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prod_attr_product ON product_attribute_values(product_id);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  parent_product_id TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  barcode TEXT UNIQUE,
  variant_name TEXT NOT NULL,
  color TEXT,
  size TEXT,
  grade TEXT,
  cost_price REAL DEFAULT 0,
  selling_price_m2 REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_variants_parent ON product_variants(parent_product_id);

CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  caption TEXT,
  is_primary INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_documents (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  document_type TEXT DEFAULT 'OTHER' CHECK(document_type IN ('DATASHEET', 'CERTIFICATE', 'WARRANTY', 'CATALOG', 'OTHER')),
  uploaded_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- 25. PRICING & PROMOTIONS
CREATE TABLE IF NOT EXISTS price_lists (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  customer_type TEXT DEFAULT 'RETAIL' CHECK(customer_type IN ('RETAIL', 'WHOLESALE', 'CONTRACTOR', 'VIP', 'PROJECT')),
  currency TEXT DEFAULT 'EGP',
  valid_from TEXT,
  valid_to TEXT,
  is_default INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_list_items (
  id TEXT PRIMARY KEY,
  price_list_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  price_m2 REAL NOT NULL,
  price_box REAL DEFAULT 0,
  min_quantity_m2 REAL DEFAULT 0,
  UNIQUE(price_list_id, product_id, min_quantity_m2),
  FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_items_list ON price_list_items(price_list_id);

CREATE TABLE IF NOT EXISTS customer_price_overrides (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  price_m2 REAL NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  approved_by TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, product_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS price_change_history (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value REAL,
  new_value REAL,
  reason TEXT,
  changed_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_price_hist_product ON price_change_history(product_id);

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  promotion_type TEXT NOT NULL CHECK(promotion_type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'BUY_X_GET_Y', 'BUNDLE_PRICE')),
  discount_percentage REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  buy_quantity REAL DEFAULT 0,
  get_quantity REAL DEFAULT 0,
  min_order_amount REAL DEFAULT 0,
  applies_to TEXT DEFAULT 'ALL' CHECK(applies_to IN ('ALL', 'PRODUCTS', 'CATEGORIES', 'BRANDS')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS promotion_targets (
  id TEXT PRIMARY KEY,
  promotion_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('PRODUCT', 'CATEGORY', 'BRAND')),
  target_id TEXT NOT NULL,
  UNIQUE(promotion_id, target_type, target_id),
  FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
);

-- 26. CRM: LEADS, PIPELINE, ACTIVITIES, CAMPAIGNS
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  channel TEXT DEFAULT 'OTHER' CHECK(channel IN ('WHATSAPP', 'SMS', 'EMAIL', 'PHONE', 'SOCIAL', 'WALK_IN', 'REFERRAL', 'OTHER')),
  starts_at TEXT,
  ends_at TEXT,
  budget REAL DEFAULT 0,
  target_audience TEXT,
  status TEXT DEFAULT 'PLANNED' CHECK(status IN ('PLANNED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone2 TEXT,
  email TEXT,
  city TEXT,
  address TEXT,
  source TEXT DEFAULT 'OTHER' CHECK(source IN ('WALK_IN', 'PHONE', 'WHATSAPP', 'REFERRAL', 'SOCIAL', 'CAMPAIGN', 'ENGINEER', 'CONTRACTOR', 'OTHER')),
  campaign_id TEXT,
  lead_type TEXT DEFAULT 'RETAIL' CHECK(lead_type IN ('RETAIL', 'WHOLESALE', 'CONTRACTOR', 'ENGINEER', 'PROJECT')),
  stage TEXT DEFAULT 'NEW' CHECK(stage IN ('NEW', 'CONTACTED', 'QUALIFIED', 'QUOTATION', 'NEGOTIATION', 'WON', 'LOST')),
  estimated_value REAL DEFAULT 0,
  probability INTEGER DEFAULT 0,
  assigned_to TEXT,
  next_follow_up TEXT,
  lost_reason TEXT,
  converted_customer_id TEXT,
  converted_at TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (converted_customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(next_follow_up);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);

-- One activity feed for leads AND customers: exactly one of the two ids is set.
CREATE TABLE IF NOT EXISTS crm_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  customer_id TEXT,
  activity_type TEXT NOT NULL CHECK(activity_type IN ('CALL', 'VISIT', 'WHATSAPP', 'EMAIL', 'MEETING', 'QUOTATION_SENT', 'SAMPLE_GIVEN', 'NOTE', 'STAGE_CHANGE')),
  subject TEXT NOT NULL,
  body TEXT,
  outcome TEXT,
  scheduled_at TEXT,
  completed_at TEXT,
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
  assigned_to TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CHECK ((lead_id IS NOT NULL AND customer_id IS NULL) OR (lead_id IS NULL AND customer_id IS NOT NULL)),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_crm_act_lead ON crm_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_act_customer ON crm_activities(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_act_scheduled ON crm_activities(scheduled_at, status);

-- 27. PROJECTS (CONTRACTORS & DEVELOPMENTS)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  branch_id TEXT,
  project_type TEXT DEFAULT 'BUILDING' CHECK(project_type IN ('BUILDING', 'VILLA', 'APARTMENT', 'COMPOUND', 'COMMERCIAL', 'OTHER')),
  contractor_name TEXT,
  contractor_phone TEXT,
  engineer_name TEXT,
  engineer_phone TEXT,
  address TEXT,
  city TEXT,
  start_date TEXT,
  expected_end_date TEXT,
  actual_end_date TEXT,
  contract_value REAL DEFAULT 0,
  total_sold REAL NOT NULL DEFAULT 0,
  total_paid REAL NOT NULL DEFAULT 0,
  outstanding_amount REAL NOT NULL DEFAULT 0,
  price_list_id TEXT,
  status TEXT DEFAULT 'PLANNED' CHECK(status IN ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- Self-referencing hierarchy: BUILDING > FLOOR > APARTMENT > ROOM.
-- One table instead of four keeps arbitrary depth and one set of queries.
CREATE TABLE IF NOT EXISTS project_units (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  unit_type TEXT NOT NULL CHECK(unit_type IN ('BUILDING', 'FLOOR', 'APARTMENT', 'ROOM')),
  name TEXT NOT NULL,
  area_m2 REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_PROGRESS', 'DELIVERED')),
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES project_units(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_units_project ON project_units(project_id);
CREATE INDEX IF NOT EXISTS idx_project_units_parent ON project_units(parent_id);

CREATE TABLE IF NOT EXISTS project_products (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  unit_id TEXT,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  planned_quantity_m2 REAL NOT NULL DEFAULT 0,
  delivered_quantity_m2 REAL NOT NULL DEFAULT 0,
  agreed_price_m2 REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id) REFERENCES project_units(id) ON DELETE SET NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_project_products_project ON project_products(project_id);

-- 28. DELIVERY: DRIVERS, VEHICLES, DELIVERY ORDERS
CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  employee_id TEXT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  national_id TEXT,
  license_number TEXT,
  license_expires_at TEXT,
  branch_id TEXT,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  plate_number TEXT UNIQUE NOT NULL,
  vehicle_type TEXT DEFAULT 'TRUCK' CHECK(vehicle_type IN ('TRUCK', 'PICKUP', 'VAN', 'TRAILER', 'OTHER')),
  make TEXT,
  model TEXT,
  year INTEGER,
  capacity_kg REAL DEFAULT 0,
  branch_id TEXT,
  assigned_driver_id TEXT,
  license_expires_at TEXT,
  insurance_expires_at TEXT,
  status TEXT DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE', 'ON_DELIVERY', 'MAINTENANCE', 'OUT_OF_SERVICE')),
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_driver_id) REFERENCES drivers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vehicle_maintenance (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  date TEXT NOT NULL,
  maintenance_type TEXT DEFAULT 'ROUTINE' CHECK(maintenance_type IN ('ROUTINE', 'REPAIR', 'TIRES', 'OIL', 'INSPECTION', 'OTHER')),
  odometer_km REAL,
  cost REAL NOT NULL DEFAULT 0,
  vendor TEXT,
  description TEXT,
  next_due_date TEXT,
  expense_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_maint_vehicle ON vehicle_maintenance(vehicle_id);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  delivery_number TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  invoice_id TEXT,
  order_id TEXT,
  project_id TEXT,
  branch_id TEXT,
  warehouse_id TEXT NOT NULL,
  driver_id TEXT,
  vehicle_id TEXT,
  recipient_name TEXT,
  recipient_phone TEXT,
  address TEXT NOT NULL,
  city TEXT,
  scheduled_at TEXT,
  dispatched_at TEXT,
  delivered_at TEXT,
  delivery_fee REAL DEFAULT 0,
  total_quantity_m2 REAL DEFAULT 0,
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SCHEDULED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED')),
  failure_reason TEXT,
  received_by_name TEXT,
  signature_path TEXT,
  proof_image_path TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_date ON deliveries(date);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);

CREATE TABLE IF NOT EXISTS delivery_items (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity_m2 REAL NOT NULL,
  boxes_count REAL DEFAULT 0,
  delivered_m2 REAL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery ON delivery_items(delivery_id);

-- 29. INSTALLMENTS
CREATE TABLE IF NOT EXISTS installment_plans (
  id TEXT PRIMARY KEY,
  plan_number TEXT UNIQUE NOT NULL,
  customer_id TEXT NOT NULL,
  invoice_id TEXT,
  project_id TEXT,
  total_amount REAL NOT NULL,
  down_payment REAL DEFAULT 0,
  financed_amount REAL NOT NULL,
  installments_count INTEGER NOT NULL,
  installment_amount REAL NOT NULL,
  frequency TEXT DEFAULT 'MONTHLY' CHECK(frequency IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY')),
  start_date TEXT NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  remaining_amount REAL NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_inst_plans_customer ON installment_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_inst_plans_status ON installment_plans(status);

CREATE TABLE IF NOT EXISTS installments (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  remaining_amount REAL NOT NULL DEFAULT 0,
  paid_at TEXT,
  payment_id TEXT,
  status TEXT DEFAULT 'UPCOMING' CHECK(status IN ('UPCOMING', 'DUE', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED')),
  notes TEXT,
  UNIQUE(plan_id, sequence_number),
  FOREIGN KEY (plan_id) REFERENCES installment_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES customer_payments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_installments_due ON installments(due_date, status);
CREATE INDEX IF NOT EXISTS idx_installments_plan ON installments(plan_id);

-- 30. APPROVALS
-- One inbox for every gate the prompt asks for: discounts, prices, returns,
-- inventory adjustments, purchases, expenses and credit limits.
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  request_number TEXT UNIQUE NOT NULL,
  request_type TEXT NOT NULL CHECK(request_type IN ('DISCOUNT', 'PRICE_CHANGE', 'SALES_RETURN', 'PURCHASE_RETURN', 'STOCK_ADJUSTMENT', 'PURCHASE_ORDER', 'EXPENSE', 'CREDIT_LIMIT', 'LEAVE', 'OTHER')),
  reference_type TEXT,
  reference_id TEXT,
  branch_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  requested_value REAL,
  current_value REAL,
  payload TEXT,
  priority TEXT DEFAULT 'NORMAL' CHECK(priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  decision_notes TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (decided_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approvals_type ON approval_requests(request_type);

-- 31. AUTH: ROLES, SESSIONS, LOGIN HISTORY
-- users.role stays as the coarse label; roles/role_permissions let an admin
-- define custom roles without a code change.
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_code TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  PRIMARY KEY (role_code, permission_code),
  FOREIGN KEY (role_code) REFERENCES roles(code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_label TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  end_reason TEXT CHECK(end_reason IN ('LOGOUT', 'EXPIRED', 'REVOKED', 'CRASH')),
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id, is_active);

CREATE TABLE IF NOT EXISTS login_history (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username_attempted TEXT NOT NULL,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  device_label TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_login_hist_user ON login_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_login_hist_created ON login_history(created_at);

-- 32. EMPLOYEES
-- The canonical employees table is defined earlier (with full_name, job_title,
-- hired_at, is_active). The legacy duplicate that used to live here was removed;
-- migration 010_employee_compat adds the compatibility columns the HR screens read.

-- 33. PAYROLL TRANSACTIONS (سُلف، مكافآت، خصومات، صرف رواتب)
CREATE TABLE IF NOT EXISTS payroll_transactions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('ADVANCE', 'BONUS', 'DEDUCTION', 'SALARY_PAYOUT')),
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll_transactions(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_date ON payroll_transactions(date);
CREATE INDEX IF NOT EXISTS idx_payroll_type ON payroll_transactions(type);

-- 34. ATTENDANCE
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PRESENT' CHECK(status IN ('PRESENT', 'LATE', 'ABSENT', 'LEAVE')),
  notes TEXT,
  recorded_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);

-- 35. CHEQUES (post-dated / received / issued cheques)
CREATE TABLE IF NOT EXISTS cheques (
  id TEXT PRIMARY KEY,
  cheque_number TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(type IN ('RECEIVED', 'ISSUED')),
  party_type TEXT NOT NULL DEFAULT 'OTHER' CHECK(party_type IN ('CUSTOMER', 'SUPPLIER', 'OTHER')),
  party_id TEXT,
  party_name TEXT NOT NULL,
  bank_name TEXT,
  amount REAL NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'CANCELLED')),
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cheques_due ON cheques(due_date);
CREATE INDEX IF NOT EXISTS idx_cheques_status ON cheques(status, type);

-- 36. FIXED ASSETS & DEPRECIATION
CREATE TABLE IF NOT EXISTS fixed_assets (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'OTHER',
  purchase_date TEXT NOT NULL,
  purchase_cost REAL NOT NULL DEFAULT 0,
  salvage_value REAL NOT NULL DEFAULT 0,
  useful_life_years REAL NOT NULL DEFAULT 5,
  accumulated_depreciation REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'DISPOSED', 'FULLY_DEPRECIATED')),
  location TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets(status);

-- 37. SCHEMA MIGRATIONS (applied-migration ledger; see migrations.ts)
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  description TEXT,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 38. Dynamic user-defined data catalog (independent of the ERP's fixed tables)
CREATE TABLE IF NOT EXISTS dynamic_entity_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  fields_json TEXT NOT NULL DEFAULT '[]',
  relations_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dynamic_records (
  id TEXT PRIMARY KEY,
  entity_type_id TEXT NOT NULL,
  values_json TEXT NOT NULL DEFAULT '{}',
  search_text TEXT NOT NULL DEFAULT '',
  source_batch_id TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_type_id) REFERENCES dynamic_entity_types(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dynamic_records_entity ON dynamic_records(entity_type_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dynamic_records_search ON dynamic_records(entity_type_id, search_text);
CREATE TABLE IF NOT EXISTS dynamic_import_batches (
  id TEXT PRIMARY KEY,
  entity_type_id TEXT,
  source_name TEXT NOT NULL DEFAULT '',
  source_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  imported_count INTEGER NOT NULL DEFAULT 0,
  raw_rows_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_type_id) REFERENCES dynamic_entity_types(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_dynamic_batches_created ON dynamic_import_batches(created_at);
`;
