export const SCHEMA_PART_01 = String.raw`

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

-- 4b. CERAMIC BATCHES / LOTS / SHADES / CALIBERS
-- Each row represents a received shipment of a product, identified by tone/shade & caliber.
-- quantity_remaining_m2 tracks how much of this batch is still unallocated.
CREATE TABLE IF NOT EXISTS product_batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  tone_shade TEXT NOT NULL DEFAULT '',
  caliber TEXT DEFAULT '0',
  production_date TEXT,
  received_date TEXT,
  supplier_id TEXT,
  cost_price REAL NOT NULL DEFAULT 0,
  quantity_m2 REAL NOT NULL DEFAULT 0,
  quantity_remaining_m2 REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_batches_product_wh ON product_batches(product_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_batches_tone ON product_batches(tone_shade, caliber);

-- 5. INVENTORY TRANSACTIONS (IMMUTABLE AUDIT TRAIL)
`;
