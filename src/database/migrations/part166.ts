import type { Migration } from './support';
import { addColumn } from './support';

// Restaurant POS phase: guest count & tax/service charges on orders,
// suspended (parked) orders for the cashier screen, and cash-drawer
// denomination counts captured when a shift closes.
export const MIGRATION_265_RESTAURANT_POS: Migration = {
  id: '265_restaurant_pos',
  description:
    'Add POS fields to restaurant orders and denomination counts to cash shifts',
  up: (db) => {
    addColumn(db, 'restaurant_orders', 'guest_count', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'restaurant_orders', 'is_suspended', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'restaurant_orders', 'suspended_at', 'TEXT');
    addColumn(db, 'restaurant_orders', 'tax_amount', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'restaurant_orders', 'service_charge', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'cash_shifts', 'denomination_counts', 'TEXT');
    addColumn(db, 'cash_shifts', 'cash_in_total', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'cash_shifts', 'cash_out_total', 'INTEGER NOT NULL DEFAULT 0');
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_movements (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL,
        register_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('IN', 'OUT')),
        amount INTEGER NOT NULL,
        notes TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_cash_movements_shift
        ON cash_movements(shift_id, created_at);
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_restaurant_orders_suspended
        ON restaurant_orders(branch_id, is_suspended, suspended_at DESC)
        WHERE is_suspended = 1;
    `);
  },
};
