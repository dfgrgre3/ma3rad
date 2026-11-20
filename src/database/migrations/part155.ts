import type { Database } from 'sql.js';
import type { Migration } from './support';
import { addColumn, tableExists } from './support';

/**
 * Migration 245: per-operation labor log (job-ticket minutes keyed by work
 * date so they can be reconciled against HR attendance punches) plus a
 * recurrence interval on preventive maintenance records so completing one
 * can auto-generate the next scheduled occurrence.
 */
export const MIGRATION_245_OPERATION_LABOR_AND_PM_RECURRENCE: Migration = {
  id: '245_operation_labor_and_pm_recurrence',
  description: 'Add production_operation_labor table and maintenance recurrence interval',
  up: (db: Database) => {
    if (tableExists(db, 'manufacturing_maintenance')) {
      addColumn(db, 'manufacturing_maintenance', 'recurrence_interval_days', 'INTEGER');
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS production_operation_labor (
        id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL,
        employee_id TEXT,
        work_date TEXT NOT NULL,
        minutes REAL NOT NULL DEFAULT 0 CHECK(minutes >= 0),
        source TEXT NOT NULL DEFAULT 'OPERATION',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (operation_id) REFERENCES production_order_operations(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_op_labor_operation
        ON production_operation_labor(operation_id);
      CREATE INDEX IF NOT EXISTS idx_op_labor_employee_date
        ON production_operation_labor(employee_id, work_date);
    `);
  },
};

/**
 * Migration 246: master production schedule (MPS) demand entries —
 * independent (non-sales-order) production demand exploded by the
 * time-phased MRP — plus the work-in-progress ledger account used by the
 * automatic production cost-transfer postings (materials → WIP → finished
 * goods).
 */
export const MIGRATION_246_MPS_AND_WIP_ACCOUNT: Migration = {
  id: '246_mps_entries_and_wip_account',
  description: 'Add manufacturing_mps_entries table and WIP chart account 1205',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS manufacturing_mps_entries (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        bom_id TEXT,
        quantity REAL NOT NULL CHECK(quantity > 0),
        warehouse_id TEXT,
        branch_id TEXT,
        need_date TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'MANUAL',
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CANCELLED')),
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mps_entries_status_date
        ON manufacturing_mps_entries(status, need_date);
    `);
    db.run(
      `INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
       VALUES ('acc_1205', '1205', 'أعمال تحت التنفيذ - مخزون نصف مصنّع (WIP)', 'ASSET', NULL, 0, 1)`
    );
  },
};

/**
 * Migration 248: material_issue_lots — lot genealogy. Every FIFO allocation
 * consumed by a production order records which cost layer (and through it
 * which goods receipt / supplier / raw batch) fed the order, and which
 * produced batch it ended up in. Enables forward traceability
 * (finished batch → raw supplier) and backward traceability
 * (raw receipt → finished batches/customers).
 */
export const MIGRATION_248_MATERIAL_ISSUE_LOTS: Migration = {
  id: '248_material_issue_lots',
  description: 'Add material_issue_lots table for production lot genealogy',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS material_issue_lots (
        id TEXT PRIMARY KEY,
        production_order_id TEXT NOT NULL,
        order_material_id TEXT,
        inventory_transaction_id TEXT,
        component_product_id TEXT NOT NULL,
        quantity REAL NOT NULL CHECK(quantity > 0),
        unit_cost REAL,
        cost_layer_id TEXT,
        goods_receipt_id TEXT,
        purchase_id TEXT,
        supplier_id TEXT,
        produced_batch_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (component_product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (produced_batch_id) REFERENCES product_batches(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mil_order ON material_issue_lots(production_order_id);
      CREATE INDEX IF NOT EXISTS idx_mil_produced_batch ON material_issue_lots(produced_batch_id);
      CREATE INDEX IF NOT EXISTS idx_mil_grn ON material_issue_lots(goods_receipt_id);
      CREATE INDEX IF NOT EXISTS idx_mil_supplier ON material_issue_lots(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_mil_layer ON material_issue_lots(cost_layer_id);
    `);
  },
};
