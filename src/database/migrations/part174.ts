import type { Migration } from './support';
import { addColumn } from './support';

// Restaurant menu item details: per-branch category override, customer-facing
// description, spice level, allergens, featured flag, display ordering,
// channel availability, and an item-specific image override.
export const MIGRATION_273_RESTAURANT_MENU_ITEM_DETAILS: Migration = {
  id: '273_restaurant_menu_item_details',
  description: 'Restaurant menu item details: category override, description, spice, allergens, featured, sort, channels, image',
  up: (db) => {
    addColumn(db, 'restaurant_menu_items', 'menu_category_id', 'TEXT');
    addColumn(db, 'restaurant_menu_items', 'description', 'TEXT');
    addColumn(db, 'restaurant_menu_items', 'spice_level', 'INTEGER');
    addColumn(db, 'restaurant_menu_items', 'allergens', 'TEXT');
    addColumn(db, 'restaurant_menu_items', 'is_featured', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'restaurant_menu_items', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'restaurant_menu_items', 'channels', 'TEXT');
    addColumn(db, 'restaurant_menu_items', 'image_path', 'TEXT');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_restaurant_menu_items_category
        ON restaurant_menu_items(menu_category_id);
    `);
  },
};
