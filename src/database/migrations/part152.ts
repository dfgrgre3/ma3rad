import type { Database } from 'sql.js';
import type { Migration } from './support';
import { addColumn, tableExists } from './support';

/**
 * Migration 240: production-order approval workflow columns.
 */
export const MIGRATION_240_PRODUCTION_ORDER_APPROVAL: Migration = {
  id: '240_production_order_approval',
  description: 'Add approval workflow columns to production_orders',
  up: (db: Database) => {
    if (!tableExists(db, 'production_orders')) return;
    addColumn(db, 'production_orders', 'approval_status', `TEXT NOT NULL DEFAULT 'NONE'`);
    addColumn(db, 'production_orders', 'approved_by', 'TEXT');
    addColumn(db, 'production_orders', 'approved_at', 'TEXT');
    addColumn(db, 'production_orders', 'rejection_reason', 'TEXT');
    db.exec(`
      UPDATE production_orders SET approval_status = 'NONE' WHERE approval_status IS NULL;
      CREATE INDEX IF NOT EXISTS idx_production_orders_approval ON production_orders(approval_status);
    `);
  },
};

/**
 * Migration 241: operator assignment per operation + production batch link.
 */
export const MIGRATION_241_PRODUCTION_OPERATOR_AND_BATCH: Migration = {
  id: '241_production_operator_and_batch',
  description: 'Add operator_id to production operations and production_order_id to product_batches',
  up: (db: Database) => {
    if (tableExists(db, 'production_order_operations')) {
      addColumn(db, 'production_order_operations', 'operator_id', 'TEXT');
    }
    if (tableExists(db, 'product_batches')) {
      addColumn(db, 'product_batches', 'production_order_id', 'TEXT');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_batches_production_order ON product_batches(production_order_id);
      `);
    }
  },
};
