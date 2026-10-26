export const SCHEMA_PART_09 = String.raw`
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

`;
