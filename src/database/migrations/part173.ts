import type { Migration } from './support';
import { addColumn } from './support';

// POS line-level discounts: a per-item discount sits beside the order-level
// discount so cashiers can discount a single dish without touching the bill.
export const MIGRATION_272_RESTAURANT_ITEM_DISCOUNT: Migration = {
  id: '272_restaurant_item_discount',
  description: 'Restaurant order item level discount amount',
  up: (db) => {
    addColumn(db, 'restaurant_order_items', 'discount_amount', 'INTEGER NOT NULL DEFAULT 0');
  },
};
