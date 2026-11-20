import type { Database } from 'sql.js';
import type { Migration } from './support';
import { addColumn, tableExists } from './support';

/**
 * Migration 237: BOM routing templates — default operation sequences stored
 * on the BOM so production orders can auto-generate their operations.
 */
export const MIGRATION_237_BOM_OPERATIONS: Migration = {
  id: '237_bom_operations',
  description: 'Add BOM routing templates (work center + minutes per unit per operation)',
  up: (db: Database) => {
    if (!tableExists(db, 'bills_of_materials')) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS bom_operations (
        id TEXT PRIMARY KEY,
        bom_id TEXT NOT NULL,
        work_center_id TEXT NOT NULL,
        sequence INTEGER NOT NULL DEFAULT 0,
        minutes_per_unit REAL NOT NULL DEFAULT 0 CHECK(minutes_per_unit >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bom_id) REFERENCES bills_of_materials(id) ON DELETE CASCADE,
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id)
      );
      CREATE INDEX IF NOT EXISTS idx_bom_operations_bom
        ON bom_operations(bom_id, sequence);
    `);
  },
};

/**
 * Migration 238: equipment/operation downtime events for OEE and capacity
 * accounting on the shop floor.
 */
export const MIGRATION_238_MANUFACTURING_DOWNTIME: Migration = {
  id: '238_manufacturing_downtime',
  description: 'Add downtime events linked to work centers, operations and production orders',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS manufacturing_downtime (
        id TEXT PRIMARY KEY,
        work_center_id TEXT,
        operation_id TEXT,
        production_order_id TEXT,
        minutes REAL NOT NULL DEFAULT 0 CHECK(minutes >= 0),
        reason TEXT,
        started_at TEXT,
        ended_at TEXT,
        branch_id TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE SET NULL,
        FOREIGN KEY (operation_id) REFERENCES production_order_operations(id) ON DELETE SET NULL,
        FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE SET NULL,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mfg_downtime_wc ON manufacturing_downtime(work_center_id);
      CREATE INDEX IF NOT EXISTS idx_mfg_downtime_order ON manufacturing_downtime(production_order_id);
      CREATE INDEX IF NOT EXISTS idx_mfg_downtime_branch ON manufacturing_downtime(branch_id);
    `);
  },
};

/**
 * Migration 239: work-center overhead rate (stored in piastres like
 * cost_per_hour) and per-material reservation tracking on production orders.
 */
export const MIGRATION_239_MANUFACTURING_PHASE2_COLUMNS: Migration = {
  id: '239_manufacturing_phase2_columns',
  description: 'Add overhead_per_hour to work_centers and reserved_qty to production_order_materials',
  up: (db: Database) => {
    if (tableExists(db, 'work_centers')) {
      addColumn(db, 'work_centers', 'overhead_per_hour', 'REAL NOT NULL DEFAULT 0');
    }
    if (tableExists(db, 'production_order_materials')) {
      addColumn(db, 'production_order_materials', 'reserved_qty', 'REAL NOT NULL DEFAULT 0');
      db.exec(`
        UPDATE production_order_materials
        SET reserved_qty = 0
        WHERE reserved_qty IS NULL;
      `);
    }
  },
};
