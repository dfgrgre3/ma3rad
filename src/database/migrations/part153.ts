import type { Database } from 'sql.js';
import type { Migration } from './support';
import { addColumn, tableExists } from './support';

/**
 * Migration 242: AQL sampling-plan columns on quality checks plus a defect-code
 * catalog and per-check defect quantities.
 */
export const MIGRATION_242_QUALITY_AQL_AND_DEFECTS: Migration = {
  id: '242_quality_aql_and_defects',
  description: 'Add AQL sample plan columns to quality checks and defect code tracking',
  up: (db: Database) => {
    if (tableExists(db, 'manufacturing_quality_checks')) {
      addColumn(db, 'manufacturing_quality_checks', 'sample_size', 'REAL');
      addColumn(db, 'manufacturing_quality_checks', 'accept_number', 'REAL');
      addColumn(db, 'manufacturing_quality_checks', 'reject_number', 'REAL');
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS manufacturing_defect_codes (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        branch_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mfg_defect_codes_branch
        ON manufacturing_defect_codes(branch_id, is_active);
      CREATE TABLE IF NOT EXISTS manufacturing_quality_check_defects (
        id TEXT PRIMARY KEY,
        quality_check_id TEXT NOT NULL,
        defect_code_id TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0 CHECK(quantity > 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quality_check_id) REFERENCES manufacturing_quality_checks(id) ON DELETE CASCADE,
        FOREIGN KEY (defect_code_id) REFERENCES manufacturing_defect_codes(id)
      );
      CREATE INDEX IF NOT EXISTS idx_mfg_check_defects_check
        ON manufacturing_quality_check_defects(quality_check_id);
    `);
  },
};

/**
 * Migration 243: BOM-level final-inspection flag plus a dedicated QC hold
 * table. When the flag is set, produced output is received into
 * production_qc_holds instead of becoming sellable stock until a FINAL
 * quality disposition accepts, scraps or reworks it.
 */
export const MIGRATION_243_BOM_REQUIRES_FINAL_QC: Migration = {
  id: '243_bom_requires_final_qc',
  description: 'Add requires_final_qc flag to BOMs and production_qc_holds table for QC-gated receipts',
  up: (db: Database) => {
    if (tableExists(db, 'bills_of_materials')) {
      addColumn(db, 'bills_of_materials', 'requires_final_qc', 'INTEGER NOT NULL DEFAULT 0');
      db.exec(`UPDATE bills_of_materials SET requires_final_qc = 0 WHERE requires_final_qc IS NULL;`);
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS production_qc_holds (
        id TEXT PRIMARY KEY,
        production_order_id TEXT NOT NULL,
        product_batch_id TEXT,
        warehouse_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity_m2 REAL NOT NULL CHECK(quantity_m2 >= 0),
        unit_cost INTEGER NOT NULL DEFAULT 0,
        total_cost INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'HELD'
          CHECK(status IN ('HELD', 'ACCEPTED', 'SCRAPPED', 'REWORKED')),
        resolved_at TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_batch_id) REFERENCES product_batches(id) ON DELETE SET NULL,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_qc_holds_order
        ON production_qc_holds(production_order_id, status);
      CREATE INDEX IF NOT EXISTS idx_qc_holds_wh
        ON production_qc_holds(warehouse_id, product_id, status);
    `);
  },
};
