import type { Migration } from './support';
import { addColumn } from './support';

// Restaurant floor operations phase 2: table zones, per-branch menu price
// overrides, order-level discounts, cancellable order items with kitchen
// timestamps, and dine-in table reservations.
export const MIGRATION_263_RESTAURANT_OPERATIONS_PHASE2: Migration = {
  id: '263_restaurant_operations_phase2',
  description:
    'Add restaurant table zones, menu price overrides, order discounts, item cancellation timestamps, and table reservations',
  up: (db) => {
    addColumn(db, 'restaurant_tables', 'zone', 'TEXT');
    addColumn(db, 'restaurant_menu_items', 'custom_price', 'REAL');
    addColumn(db, 'restaurant_orders', 'discount_amount', 'REAL NOT NULL DEFAULT 0');
    addColumn(db, 'restaurant_orders', 'discount_note', 'TEXT');
    addColumn(db, 'restaurant_order_items', 'is_cancelled', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'restaurant_order_items', 'preparing_at', 'TEXT');
    addColumn(db, 'restaurant_order_items', 'ready_at', 'TEXT');
    addColumn(db, 'restaurant_order_items', 'served_at', 'TEXT');
    addColumn(db, 'restaurant_order_items', 'cancelled_at', 'TEXT');
    addColumn(db, 'restaurant_order_items', 'cancelled_by', 'TEXT');

    db.exec(`
      CREATE TABLE IF NOT EXISTS restaurant_reservations (
        id TEXT PRIMARY KEY,
        reservation_number TEXT NOT NULL UNIQUE,
        branch_id TEXT NOT NULL,
        table_id TEXT,
        customer_id TEXT NOT NULL,
        guest_count INTEGER NOT NULL DEFAULT 2 CHECK(guest_count > 0),
        reserved_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK(status IN ('PENDING', 'SEATED', 'CANCELLED', 'NO_SHOW')),
        notes TEXT,
        seated_at TEXT,
        cancelled_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
        FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE SET NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_reservations_branch_status
        ON restaurant_reservations(branch_id, status, reserved_at);
      CREATE INDEX IF NOT EXISTS idx_restaurant_reservations_table
        ON restaurant_reservations(table_id, reserved_at);
    `);
  },
};
