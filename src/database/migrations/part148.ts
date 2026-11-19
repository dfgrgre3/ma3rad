import type { Migration } from './support';

/**
 * Migration 232: link production orders back to the sales order / order item
 * that triggered them (make-to-order), and add free-form notes.
 *
 * Columns are nullable so existing production orders are unaffected. The
 * order_item_id is unique-ish in practice (one production order per sales
 * item) but not enforced by a UNIQUE constraint because partial production
 * and rework flows may legitimately create follow-up orders later.
 */
export const MIGRATION_PART_148: Migration = {
  id: '232_production_orders_sales_link',
  description: 'Add sales order link and notes columns to production_orders',
  up: (db) => {
    const addColumn = (column: string, ddl: string) => {
      try {
        db.exec(`ALTER TABLE production_orders ADD COLUMN ${column} ${ddl};`);
      } catch { /* column already exists */ }
    };
    addColumn('sales_order_id', 'TEXT');
    addColumn('order_item_id', 'TEXT');
    addColumn('customer_id', 'TEXT');
    addColumn('notes', 'TEXT');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_production_orders_sales_order ON production_orders(sales_order_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_production_orders_order_item ON production_orders(order_item_id);`);
  },
};
