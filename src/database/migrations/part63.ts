import type { Migration } from './support';

export const MIGRATION_PART_63: Migration[] = [
  {
    id: '174_facility_cleaning_services',
    description: 'Add cleaning services management: cleaning schedules, cleaning staff assignments, cleaning checklists, task execution tracking, before/after photos, and cleaning supply inventory.',
    up: (db) => {
      // --- Cleaning schedules (templates for recurring cleaning tasks) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_cleaning_schedules (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          schedule_code TEXT NOT NULL UNIQUE,
          schedule_name TEXT NOT NULL,
          frequency TEXT NOT NULL CHECK(frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'OTHER')),
          cleaning_type TEXT NOT NULL CHECK(cleaning_type IN ('GENERAL', 'DEEP', 'DISINFECTION', 'GLASS', 'CARPET', 'RESTROOM', 'OTHER')),
          assigned_worker_id TEXT,
          assigned_worker_name TEXT,
          start_time TEXT,
          end_time TEXT,
          estimated_duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK(estimated_duration_minutes >= 0),
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          next_due_date TEXT,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (assigned_worker_id) REFERENCES employees(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_location ON facility_cleaning_schedules(location_id, is_active);
        CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_due ON facility_cleaning_schedules(next_due_date, is_active);
        CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_worker ON facility_cleaning_schedules(assigned_worker_id);
      `);

      // --- Cleaning checklists (checklist items per cleaning type) ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_cleaning_checklists (
          id TEXT PRIMARY KEY,
          cleaning_type TEXT NOT NULL CHECK(cleaning_type IN ('GENERAL', 'DEEP', 'DISINFECTION', 'GLASS', 'CARPET', 'RESTROOM', 'OTHER')),
          item_name TEXT NOT NULL,
          item_description TEXT,
          is_critical INTEGER NOT NULL DEFAULT 0 CHECK(is_critical IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_cleaning_checklists_type ON facility_cleaning_checklists(cleaning_type, is_active, sort_order);
      `);

      // --- Cleaning task execution records ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_cleaning_tasks (
          id TEXT PRIMARY KEY,
          schedule_id TEXT NOT NULL,
          location_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          worker_id TEXT NOT NULL,
          worker_name TEXT NOT NULL,
          task_date TEXT NOT NULL,
          planned_start TEXT,
          actual_start TEXT,
          actual_end TEXT,
          duration_minutes INTEGER DEFAULT 0 CHECK(duration_minutes >= 0),
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED')),
          quality_score INTEGER CHECK(quality_score >= 0 AND quality_score <= 100),
          before_photo_path TEXT,
          after_photo_path TEXT,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (schedule_id) REFERENCES facility_cleaning_schedules(id) ON DELETE CASCADE,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (worker_id) REFERENCES employees(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_schedule ON facility_cleaning_tasks(schedule_id, task_date);
        CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_worker ON facility_cleaning_tasks(worker_id, task_date);
        CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_status ON facility_cleaning_tasks(status, task_date);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_cleaning_task_items (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          checklist_item_id TEXT,
          item_name TEXT NOT NULL,
          result TEXT NOT NULL CHECK(result IN ('PASS', 'FAIL', 'N_A')),
          observation TEXT,
          corrective_action TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (task_id) REFERENCES facility_cleaning_tasks(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_cleaning_task_items_task ON facility_cleaning_task_items(task_id, result);
      `);

      // --- Cleaning supplies inventory ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_cleaning_supplies (
          id TEXT PRIMARY KEY,
          supply_code TEXT NOT NULL UNIQUE,
          supply_name TEXT NOT NULL,
          supply_type TEXT NOT NULL CHECK(supply_type IN ('DETERGENT', 'DISINFECTANT', 'PAPER_PRODUCTS', 'TOOLS', 'PPE', 'OTHER')),
          unit_of_measure TEXT NOT NULL DEFAULT 'unit' CHECK(unit_of_measure IN ('unit', 'liter', 'kg', 'piece', 'box', 'OTHER')),
          quantity_on_hand REAL NOT NULL DEFAULT 0 CHECK(quantity_on_hand >= 0),
          minimum_threshold REAL NOT NULL DEFAULT 0 CHECK(minimum_threshold >= 0),
          reorder_quantity REAL NOT NULL DEFAULT 0 CHECK(reorder_quantity >= 0),
          location_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          supplier_id TEXT,
          unit_cost REAL DEFAULT 0 CHECK(unit_cost >= 0),
          expiry_date TEXT,
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'LOW_STOCK', 'EXPIRED', 'RETIRED')),
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (location_id) REFERENCES facility_locations(id) ON DELETE CASCADE,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_cleaning_supplies_location ON facility_cleaning_supplies(location_id, status);
        CREATE INDEX IF NOT EXISTS idx_cleaning_supplies_threshold ON facility_cleaning_supplies(quantity_on_hand, minimum_threshold);
        CREATE INDEX IF NOT EXISTS idx_cleaning_supplies_expiry ON facility_cleaning_supplies(expiry_date, status);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS facility_cleaning_supply_usage (
          id TEXT PRIMARY KEY,
          supply_id TEXT NOT NULL,
          worker_id TEXT NOT NULL,
          worker_name TEXT NOT NULL,
          usage_date TEXT NOT NULL,
          quantity_used REAL NOT NULL DEFAULT 0 CHECK(quantity_used >= 0),
          purpose TEXT,
          task_id TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (supply_id) REFERENCES facility_cleaning_supplies(id) ON DELETE CASCADE,
          FOREIGN KEY (worker_id) REFERENCES employees(id) ON DELETE SET NULL,
          FOREIGN KEY (task_id) REFERENCES facility_cleaning_tasks(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_cleaning_supply_usage_supply ON facility_cleaning_supply_usage(supply_id, usage_date);
        CREATE INDEX IF NOT EXISTS idx_cleaning_supply_usage_worker ON facility_cleaning_supply_usage(worker_id, usage_date);
      `);
    },
  },
];
