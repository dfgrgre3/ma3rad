export const SCHEMA_PART_06 = String.raw`
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
  estimated_total REAL DEFAULT 0,
  approval_tier TEXT DEFAULT 'LEVEL_1',
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

-- 22b. SUPPLIER RFQS & QUOTATION COMPARISON
`;
