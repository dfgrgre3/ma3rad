import type { Migration } from './support';

export const MIGRATION_PART_49: Migration[] = [
  {
    id: '161_unified_facility_management',
    description: 'Add facility locations, operational assets, maintenance work orders, contracts, and safety inspections.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_locations (
          id TEXT PRIMARY KEY,
          parent_id TEXT,
          branch_id TEXT NOT NULL,
          location_type TEXT NOT NULL CHECK(location_type IN ('BUILDING', 'FLOOR', 'ROOM', 'SHOWROOM', 'OFFICE', 'FACTORY', 'PRODUCTION_AREA', 'WAREHOUSE', 'OTHER')),
          name TEXT NOT NULL,
          code TEXT,
          address TEXT,
          manager_user_id TEXT,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (parent_id) REFERENCES facility_locations(id) ON DELETE RESTRICT,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
          FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_locations_branch
          ON facility_locations(branch_id, is_active, name);
        CREATE INDEX IF NOT EXISTS idx_facility_locations_parent
          ON facility_locations(parent_id, name);

        CREATE TABLE IF NOT EXISTS facility_assets (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'EQUIPMENT',
          location_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          fixed_asset_id TEXT,
          serial_number TEXT,
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED')),
          responsible_user_id TEXT,
          installed_at TEXT,
          warranty_expires_at TEXT,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE RESTRICT,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
          FOREIGN KEY (fixed_asset_id) REFERENCES fixed_assets(id) ON DELETE SET NULL,
          FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_assets_location
          ON facility_assets(location_id, status, name);
        CREATE INDEX IF NOT EXISTS idx_facility_assets_branch
          ON facility_assets(branch_id, status);

        CREATE TABLE IF NOT EXISTS facility_work_orders (
          id TEXT PRIMARY KEY,
          work_order_number TEXT NOT NULL UNIQUE,
          location_id TEXT NOT NULL,
          asset_id TEXT,
          request_type TEXT NOT NULL DEFAULT 'CORRECTIVE' CHECK(request_type IN ('PREVENTIVE', 'CORRECTIVE', 'PREDICTIVE')),
          title TEXT NOT NULL,
          description TEXT,
          priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
          requested_by TEXT NOT NULL,
          assigned_to TEXT,
          vendor_name TEXT,
          scheduled_date TEXT,
          completed_date TEXT,
          next_maintenance_date TEXT,
          labor_cost REAL NOT NULL DEFAULT 0 CHECK(labor_cost >= 0),
          parts_cost REAL NOT NULL DEFAULT 0 CHECK(parts_cost >= 0),
          service_cost REAL NOT NULL DEFAULT 0 CHECK(service_cost >= 0),
          expense_reference TEXT,
          stock_issue_reference TEXT,
          resolution_notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE RESTRICT,
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE SET NULL,
          FOREIGN KEY (requested_by) REFERENCES users(id),
          FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_facility_work_orders_status
          ON facility_work_orders(status, priority, scheduled_date);
        CREATE INDEX IF NOT EXISTS idx_facility_work_orders_asset
          ON facility_work_orders(asset_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS facility_contracts (
          id TEXT PRIMARY KEY,
          contract_number TEXT NOT NULL UNIQUE,
          location_id TEXT NOT NULL,
          contract_type TEXT NOT NULL CHECK(contract_type IN ('LEASE', 'MAINTENANCE', 'CLEANING', 'SECURITY', 'UTILITY', 'OTHER')),
          title TEXT NOT NULL,
          vendor_name TEXT NOT NULL,
          starts_at TEXT,
          ends_at TEXT,
          next_payment_date TEXT,
          payment_amount REAL NOT NULL DEFAULT 0 CHECK(payment_amount >= 0),
          payment_cycle TEXT NOT NULL DEFAULT 'MONTHLY' CHECK(payment_cycle IN ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY')),
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
          expense_reference TEXT,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE RESTRICT,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_contracts_dates
          ON facility_contracts(status, ends_at, next_payment_date);

        CREATE TABLE IF NOT EXISTS facility_safety_records (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          asset_id TEXT,
          record_type TEXT NOT NULL CHECK(record_type IN ('INSPECTION', 'INCIDENT', 'RISK')),
          title TEXT NOT NULL,
          checklist_name TEXT,
          result TEXT NOT NULL DEFAULT 'OPEN' CHECK(result IN ('PASS', 'OBSERVATION', 'FAIL', 'OPEN', 'CLOSED')),
          risk_level TEXT CHECK(risk_level IS NULL OR risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
          observations TEXT,
          corrective_action TEXT,
          due_date TEXT,
          closed_at TEXT,
          recorded_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE RESTRICT,
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE SET NULL,
          FOREIGN KEY (recorded_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_safety_records_followup
          ON facility_safety_records(result, due_date, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_facility_safety_records_location
          ON facility_safety_records(location_id, record_type, created_at DESC);
      `);
    },
  },
];