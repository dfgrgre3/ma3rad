export const SCHEMA_PART_04 = String.raw`
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
  landed_cost_share REAL DEFAULT 0,
  effective_unit_cost REAL DEFAULT 0,
  ordered_unit_cost REAL DEFAULT 0,
  grn_accepted_qty REAL DEFAULT 0,
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
`;
