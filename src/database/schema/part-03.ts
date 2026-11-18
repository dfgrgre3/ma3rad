export const SCHEMA_PART_03 = String.raw`
CREATE TABLE IF NOT EXISTS sales_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  due_date TEXT,
  customer_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  project_id TEXT,
  shift_id TEXT,
  
  subtotal INTEGER NOT NULL,
  discount_percentage REAL DEFAULT 0,
  discount_amount INTEGER DEFAULT 0,
  tax_percentage REAL DEFAULT 0,
  tax_amount INTEGER DEFAULT 0,
  shipping_cost INTEGER DEFAULT 0,
  extra_fees INTEGER DEFAULT 0,
  total_amount INTEGER NOT NULL,
  
  paid_amount INTEGER NOT NULL DEFAULT 0,
  remaining_amount INTEGER NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL DEFAULT 'CASH',
  payment_status TEXT NOT NULL DEFAULT 'PAID',
  invoice_status TEXT NOT NULL DEFAULT 'COMPLETED',
  
  total_cost INTEGER NOT NULL DEFAULT 0,
  gross_profit INTEGER NOT NULL DEFAULT 0,
  
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
  
  unit_price INTEGER NOT NULL,
  original_unit_price INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL,
  
  discount_amount INTEGER DEFAULT 0,
  total_price INTEGER NOT NULL,
  total_cost INTEGER NOT NULL,
  profit INTEGER NOT NULL,
  
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
  total_amount INTEGER NOT NULL,
  return_tax_amount INTEGER,
  refunded_amount INTEGER NOT NULL DEFAULT 0,
  remaining_to_balance INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  request_fingerprint TEXT,
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
  unit_price INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL,
  total_refund INTEGER NOT NULL,
  FOREIGN KEY (return_id) REFERENCES sales_returns(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 12. PURCHASE INVOICES
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  supplier_invoice_number TEXT,
  date TEXT NOT NULL,
  due_date TEXT,
  supplier_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  
  subtotal INTEGER NOT NULL,
  discount_amount INTEGER DEFAULT 0,
  tax_amount INTEGER DEFAULT 0,
  shipping_cost INTEGER DEFAULT 0,
  total_amount INTEGER NOT NULL,
  
  paid_amount INTEGER NOT NULL DEFAULT 0,
  remaining_amount INTEGER NOT NULL DEFAULT 0,
  payment_type TEXT DEFAULT 'CASH',
  payment_status TEXT DEFAULT 'PAID',
  
  grn_id TEXT,
  purchase_order_id TEXT,
  landed_freight INTEGER DEFAULT 0,
  landed_loading INTEGER DEFAULT 0,
  landed_customs_taxes INTEGER DEFAULT 0,
  landed_insurance INTEGER DEFAULT 0,
  landed_other INTEGER DEFAULT 0,
  landed_allocation_method TEXT DEFAULT 'VALUE',
  is_no_number_supplier INTEGER DEFAULT 0,
  matching_status TEXT DEFAULT 'MATCHED',
  price_variance_amount INTEGER DEFAULT 0,
  qty_variance_amount INTEGER DEFAULT 0,

  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

`;
