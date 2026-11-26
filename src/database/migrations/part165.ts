import type { Migration } from './support';
import { addColumn } from './support';

// Restaurant delivery/takeaway phase 3: capture delivery contact details and
// track an order-level dispatch status separate from the per-item kitchen flow.
export const MIGRATION_264_RESTAURANT_DELIVERY_TRACKING: Migration = {
  id: '264_restaurant_delivery_tracking',
  description:
    'Add delivery address, phone and dispatch status to restaurant orders',
  up: (db) => {
    addColumn(db, 'restaurant_orders', 'delivery_address', 'TEXT');
    addColumn(db, 'restaurant_orders', 'delivery_phone', 'TEXT');
    addColumn(
      db,
      'restaurant_orders',
      'delivery_status',
      "TEXT NOT NULL DEFAULT 'NONE' CHECK(delivery_status IN ('NONE', 'PENDING', 'OUT_FOR_DELIVERY', 'DELIVERED'))"
    );
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_restaurant_orders_delivery_status
        ON restaurant_orders(branch_id, service_mode, delivery_status)
        WHERE service_mode != 'DINE_IN';
    `);
  },
};
