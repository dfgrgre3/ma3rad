export const SCHEMA_PART_15 = String.raw`
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

-- 39. WAREHOUSE LOCATIONS, SHELVES & BARCODES
CREATE TABLE IF NOT EXISTS warehouse_locations (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL,
  zone TEXT NOT NULL,
  aisle TEXT NOT NULL,
  shelf TEXT NOT NULL,
  bin TEXT NOT NULL,
  barcode TEXT UNIQUE NOT NULL,
  max_capacity_m2 REAL DEFAULT 0,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wh_locations_wh ON warehouse_locations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wh_locations_barcode ON warehouse_locations(barcode);

CREATE TABLE IF NOT EXISTS product_location_stock (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity_m2 REAL NOT NULL DEFAULT 0,
  last_moved_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(location_id, product_id),
  FOREIGN KEY (location_id) REFERENCES warehouse_locations(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prod_loc_stock ON product_location_stock(location_id, product_id);

-- 40. SPECIAL INVENTORY (DAMAGED, BROKEN, SAMPLES, NON-SELLABLE RETURNS, QUARANTINE)
CREATE TABLE IF NOT EXISTS inventory_special_stocks (
  id TEXT PRIMARY KEY,
  special_number TEXT UNIQUE NOT NULL,
  warehouse_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('DAMAGED', 'BROKEN', 'DISPLAY_SAMPLE', 'NON_SELLABLE_RETURN', 'QUARANTINE_INSPECTION')),
  quantity_m2 REAL NOT NULL,
  boxes_count REAL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'RECORDED' CHECK(status IN ('RECORDED', 'INSPECTED', 'DOWNGRADED_SALE', 'WRITTEN_OFF', 'RESTORED_TO_STOCK')),
  source_type TEXT,
  source_id TEXT,
  inspection_notes TEXT,
  inspected_by TEXT,
  inspected_at TEXT,
  resolution_notes TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_special_stocks_wh ON inventory_special_stocks(warehouse_id, category, status);

-- 41. INVENTORY VS COST LEDGER VS GENERAL LEDGER RECONCILIATION LOGS
`;
