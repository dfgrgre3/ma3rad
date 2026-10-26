export const SCHEMA_PART_08 = String.raw`
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
  status TEXT DEFAULT 'REQUESTED' CHECK(status IN (
    'DRAFT', 'REQUESTED', 'APPROVED', 'PREPARING', 'IN_TRANSIT', 
    'RECEIVED_FULL', 'RECEIVED_PARTIAL', 'REJECTED', 'CANCELLED', 'COMPLETED'
  )),
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

`;
