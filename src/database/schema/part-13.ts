export const SCHEMA_PART_13 = String.raw`
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
`;
