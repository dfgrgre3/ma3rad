import { addColumn } from './support';
import type { Migration } from './support';

export const MIGRATION_PART_51: Migration[] = [
  {
    id: '163_facility_maintenance_linkage_and_schedules',
    description: 'Link facility work orders to posted expense and inventory records and add recurring preventive maintenance schedules.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_maintenance_schedules (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          asset_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          interval_days INTEGER NOT NULL CHECK(interval_days > 0),
          next_due_date TEXT NOT NULL,
          assigned_to TEXT,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE RESTRICT,
          FOREIGN KEY (asset_id) REFERENCES facility_assets(id) ON DELETE SET NULL,
          FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facility_maintenance_schedules_due
          ON facility_maintenance_schedules(is_active, next_due_date);
        CREATE INDEX IF NOT EXISTS idx_facility_maintenance_schedules_location
          ON facility_maintenance_schedules(location_id, asset_id);
      `);

      addColumn(db, 'facility_work_orders', 'expense_id', 'TEXT REFERENCES expenses(id) ON DELETE SET NULL');
      addColumn(db, 'facility_work_orders', 'inventory_transaction_id', 'TEXT REFERENCES inventory_transactions(id) ON DELETE SET NULL');
      addColumn(db, 'facility_work_orders', 'maintenance_schedule_id', 'TEXT REFERENCES facility_maintenance_schedules(id) ON DELETE SET NULL');
      addColumn(db, 'facility_work_orders', 'schedule_due_date', 'TEXT');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_facility_work_orders_expense ON facility_work_orders(expense_id);
        CREATE INDEX IF NOT EXISTS idx_facility_work_orders_inventory_tx ON facility_work_orders(inventory_transaction_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_facility_work_orders_schedule_due
          ON facility_work_orders(maintenance_schedule_id, schedule_due_date);
      `);
    },
  },
];