import type { Database } from 'sql.js';
import type { Migration } from './support';
import { addColumn, tableExists } from './support';

/**
 * Migration 244: rework-order lineage on production orders. A REWORK quality
 * disposition can spawn a follow-up PLANNED order that re-produces the
 * rejected quantity; these columns link it back to the source order and the
 * quality check that triggered it.
 */
export const MIGRATION_244_PRODUCTION_REWORK_ORDER: Migration = {
  id: '244_production_rework_order',
  description: 'Add rework lineage columns to production_orders',
  up: (db: Database) => {
    if (tableExists(db, 'production_orders')) {
      addColumn(db, 'production_orders', 'rework_of_order_id', 'TEXT');
      addColumn(db, 'production_orders', 'source_quality_check_id', 'TEXT');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_po_rework_of
          ON production_orders(rework_of_order_id);
      `);
    }
  },
};
