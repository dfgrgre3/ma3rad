export const SCHEMA_PART_10 = String.raw`
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

-- 26. ELECTRONIC INVOICING (E-INVOICING)
CREATE TABLE IF NOT EXISTS electronic_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  sales_invoice_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
  xml_file_path TEXT,
  pdf_file_path TEXT,
  submission_date TEXT,
  accepted_date TEXT,
  rejection_reason TEXT,
  tax_authority_reference TEXT,
  total_tax REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_electronic_invoices_sales ON electronic_invoices(sales_invoice_id);
CREATE INDEX IF NOT EXISTS idx_electronic_invoices_status ON electronic_invoices(status);

-- 27. LOYALTY PROGRAM (نقاط الولاء)
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_points INTEGER NOT NULL DEFAULT 0,
  discount_percentage REAL NOT NULL DEFAULT 0,
  benefits TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_loyalty (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  current_points INTEGER NOT NULL DEFAULT 0,
  total_points_earned INTEGER NOT NULL DEFAULT 0,
  total_points_redeemed INTEGER NOT NULL DEFAULT 0,
  tier_id TEXT,
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (tier_id) REFERENCES loyalty_tiers(id)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('EARN', 'REDEEM', 'EXPIRE', 'ADJUST')),
  points INTEGER NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  description TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_loyalty_customer ON customer_loyalty(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON loyalty_transactions(customer_id);

-- 28. MULTI-BRANCH (إدارة الفروع المتعددة)
-- The branches table itself is defined once, in section 18 above.
`;
