import type { Migration } from './support';
import { addColumn } from './support';

// Restaurant operations gaps: delivery zone fees, order coupons, table
// waiter/cleaning state, reservation occasion & deposit, per-item menu hours.
export const MIGRATION_271_RESTAURANT_OPERATIONS_GAPS: Migration = {
  id: '271_restaurant_operations_gaps',
  description: 'Restaurant delivery fees, coupons, table staff state, reservation deposit, item availability windows',
  up: (db) => {
    addColumn(db, 'restaurant_orders', 'delivery_zone', 'TEXT');
    addColumn(db, 'restaurant_orders', 'delivery_fee', 'REAL NOT NULL DEFAULT 0');
    addColumn(db, 'restaurant_orders', 'coupon_code', 'TEXT');
    addColumn(db, 'restaurant_tables', 'waiter_name', 'TEXT');
    addColumn(db, 'restaurant_tables', 'needs_cleaning', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'restaurant_reservations', 'occasion', 'TEXT');
    addColumn(db, 'restaurant_reservations', 'deposit_amount', 'REAL NOT NULL DEFAULT 0');
    addColumn(db, 'restaurant_menu_items', 'available_from', 'TEXT');
    addColumn(db, 'restaurant_menu_items', 'available_until', 'TEXT');
  },
};
