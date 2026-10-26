export const SCHEMA_PART_12 = String.raw`
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

`;
