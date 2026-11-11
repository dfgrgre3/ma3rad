import type { Migration } from './support';

export const MIGRATION_PART_54: Migration[] = [
  {
    id: '164_facility_management_crud_and_work_order_lifecycle',
    description: 'Add edit/archive/change-log support for facility locations and assets, and extend work orders with full lifecycle fields, attachments, and history.',
    up: (db) => {
      // --- Facility locations: archive + versioning ---
      db.exec(`
        ALTER TABLE facility_locations ADD COLUMN archived_at TEXT;
        ALTER TABLE facility_locations ADD COLUMN archived_by TEXT;
        ALTER TABLE facility_locations ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
        CREATE INDEX IF NOT EXISTS idx_facility_locations_archived ON facility_locations(archived_at);
      `);

      // --- Facility assets: full lifecycle fields ---
      db.exec(`
        ALTER TABLE facility_assets ADD COLUMN purchase_date TEXT;
        ALTER TABLE facility_assets ADD COLUMN supplier TEXT;
        ALTER TABLE facility_assets ADD COLUMN purchase_price REAL DEFAULT 0 CHECK(purchase_price >= 0);
        ALTER TABLE facility_assets ADD COLUMN installation_date TEXT;
        ALTER TABLE facility_assets ADD COLUMN useful_life_months INTEGER DEFAULT 0 CHECK(useful_life_months >= 0);
        ALTER TABLE facility_assets ADD COLUMN depreciation_rate REAL DEFAULT 0 CHECK(depreciation_rate >= 0);
        ALTER TABLE facility_assets ADD COLUMN replacement_date TEXT;
        ALTER TABLE facility_assets ADD COLUMN qr_code TEXT;
        ALTER TABLE facility_assets ADD COLUMN archived_at TEXT;
        ALTER TABLE facility_assets ADD COLUMN archived_by TEXT;
        ALTER TABLE facility_assets ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
        CREATE INDEX IF NOT EXISTS idx_facility_assets_qr_code ON facility_assets(qr_code);
        CREATE INDEX IF NOT EXISTS idx_facility_assets_archived ON facility_assets(archived_at);
      `);

      // --- Facility work orders: full lifecycle fields ---
      db.exec(`
        ALTER TABLE facility_work_orders ADD COLUMN work_hours REAL DEFAULT 0 CHECK(work_hours >= 0);
        ALTER TABLE facility_work_orders ADD COLUMN quality_checked INTEGER NOT NULL DEFAULT 0 CHECK(quality_checked IN (0, 1));
        ALTER TABLE facility_work_orders ADD COLUMN quality_checked_by TEXT;
        ALTER TABLE facility_work_orders ADD COLUMN quality_checked_at TEXT;
        ALTER TABLE facility_work_orders ADD COLUMN reopened_at TEXT;
        ALTER TABLE facility_work_orders ADD COLUMN reopened_by TEXT;
        ALTER TABLE facility_work_orders ADD COLUMN reopen_reason TEXT;
        ALTER TABLE facility_work_orders ADD COLUMN response_time_minutes INTEGER DEFAULT 0 CHECK(response_time_minutes >= 0);
        ALTER TABLE facility_work_orders ADD COLUMN resolution_time_minutes INTEGER DEFAULT 0 CHECK(resolution_time_minutes >= 0);
        ALTER TABLE facility_work_orders ADD COLUMN sla_target_minutes INTEGER DEFAULT 0 CHECK(sla_target_minutes >= 0);
        ALTER TABLE facility_work_orders ADD COLUMN sla_met INTEGER NOT NULL DEFAULT 0 CHECK(sla_met IN (0, 1));
        ALTER TABLE facility_work_orders ADD COLUMN archived_at TEXT;
        ALTER TABLE facility_work_orders ADD COLUMN archived_by TEXT;
        ALTER TABLE facility_work_orders ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
        CREATE INDEX IF NOT EXISTS idx_facility_work_orders_archived ON facility_work_orders(archived_at);
        CREATE INDEX IF NOT EXISTS idx_facility_work_orders_sla ON facility_work_orders(sla_met, status);
      `);

      // --- Work order change history log ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_work_order_logs (
          id TEXT PRIMARY KEY,
          work_order_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK(action IN (
            'CREATED', 'UPDATED', 'STATUS_CHANGED', 'ASSIGNED', 'UNASSIGNED',
            'STARTED', 'COMPLETED', 'REOPENED', 'ARCHIVED', 'RESTORED',
            'QUALITY_CHECKED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED'
          )),
          old_values TEXT,
          new_values TEXT,
          actor_id TEXT NOT NULL,
          actor_name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (work_order_id) REFERENCES facility_work_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (actor_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_work_order_logs_order ON facility_work_order_logs(work_order_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_facility_work_order_logs_actor ON facility_work_order_logs(actor_id);
      `);

      // --- Work order attachments ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_work_order_attachments (
          id TEXT PRIMARY KEY,
          work_order_id TEXT NOT NULL,
          file_name TEXT NOT NULL,
          mime_type TEXT,
          file_size INTEGER CHECK(file_size IS NULL OR file_size >= 0),
          storage_path TEXT NOT NULL,
          uploaded_by TEXT NOT NULL,
          uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (work_order_id) REFERENCES facility_work_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (uploaded_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_work_order_attachments_order ON facility_work_order_attachments(work_order_id);
      `);

      // --- Asset transfer history between branches/locations ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_asset_transfers (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          from_location_id TEXT,
          to_location_id TEXT NOT NULL,
          from_branch_id TEXT,
          to_branch_id TEXT NOT NULL,
          transferred_by TEXT NOT NULL,
          transferred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          reason TEXT,
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE CASCADE,
          FOREIGN KEY (from_location_id) REFERENCES facility_locations(id) ON DELETE SET NULL,
          FOREIGN KEY (to_location_id) REFERENCES facility_locations(id) ON DELETE RESTRICT,
          FOREIGN KEY (transferred_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_asset_transfers_asset ON facility_asset_transfers(asset_id, transferred_at);
      `);

      // --- Asset maintenance history ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_asset_maintenance_logs (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          work_order_id TEXT NOT NULL,
          maintenance_date TEXT NOT NULL,
          cost REAL NOT NULL DEFAULT 0 CHECK(cost >= 0),
          description TEXT,
          technician_id TEXT,
          technician_name TEXT,
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE CASCADE,
          FOREIGN KEY (work_order_id) REFERENCES facility_work_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_facility_asset_maintenance_logs_asset ON facility_asset_maintenance_logs(asset_id, maintenance_date DESC);
      `);
    },
  },
];
