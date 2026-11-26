import type { Migration } from './support';
import { addColumn } from './support';

// Restaurant operations suite: kitchen stations & 86'd availability on menu
// items, modifier groups, combo meals, per-channel price lists, online-order
// intake fields, and a manager signature on cash-shift closing.
export const MIGRATION_266_RESTAURANT_OPERATIONS_SUITE: Migration = {
  id: '266_restaurant_operations_suite',
  description:
    'Add restaurant stations, 86 availability, modifiers, combos, channel price lists, online orders, and shift manager signature',
  up: (db) => {
    addColumn(db, 'restaurant_menu_items', 'prep_station', 'TEXT');
    addColumn(db, 'restaurant_menu_items', 'prep_minutes', 'INTEGER');
    addColumn(db, 'restaurant_menu_items', 'unavailable_reason', 'TEXT');
    addColumn(db, 'restaurant_menu_items', 'unavailable_until', 'TEXT');

    addColumn(db, 'restaurant_orders', 'source', "TEXT NOT NULL DEFAULT 'POS'");
    addColumn(db, 'restaurant_orders', 'online_status', "TEXT NOT NULL DEFAULT 'NONE'");
    addColumn(db, 'restaurant_orders', 'rejection_reason', 'TEXT');
    addColumn(db, 'restaurant_orders', 'expected_ready_at', 'TEXT');
    addColumn(db, 'restaurant_orders', 'driver_name', 'TEXT');
    addColumn(db, 'restaurant_orders', 'driver_phone', 'TEXT');
    addColumn(db, 'restaurant_orders', 'eta_minutes', 'INTEGER');

    addColumn(db, 'cash_shifts', 'manager_name', 'TEXT');

    db.exec(`
      CREATE TABLE IF NOT EXISTS restaurant_modifier_groups (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        name TEXT NOT NULL,
        selection_type TEXT NOT NULL DEFAULT 'SINGLE' CHECK(selection_type IN ('SINGLE', 'MULTI')),
        required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0, 1)),
        min_select INTEGER NOT NULL DEFAULT 0,
        max_select INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_modifier_groups_branch
        ON restaurant_modifier_groups(branch_id, is_active);

      CREATE TABLE IF NOT EXISTS restaurant_modifiers (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        name TEXT NOT NULL,
        price_delta REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES restaurant_modifier_groups(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_modifiers_group
        ON restaurant_modifiers(group_id, is_active);

      CREATE TABLE IF NOT EXISTS restaurant_menu_item_groups (
        menu_item_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        PRIMARY KEY (menu_item_id, group_id),
        FOREIGN KEY (menu_item_id) REFERENCES restaurant_menu_items(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES restaurant_modifier_groups(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS restaurant_order_item_modifiers (
        id TEXT PRIMARY KEY,
        order_item_id TEXT NOT NULL,
        modifier_id TEXT,
        name TEXT NOT NULL,
        price_delta REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_item_id) REFERENCES restaurant_order_items(id) ON DELETE CASCADE,
        FOREIGN KEY (modifier_id) REFERENCES restaurant_modifiers(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_order_item_modifiers_item
        ON restaurant_order_item_modifiers(order_item_id);

      CREATE TABLE IF NOT EXISTS restaurant_combo_items (
        id TEXT PRIMARY KEY,
        combo_product_id TEXT NOT NULL,
        component_product_id TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1 CHECK(quantity > 0),
        choice_group TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(combo_product_id, component_product_id, choice_group),
        FOREIGN KEY (combo_product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (component_product_id) REFERENCES products(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_combo_items_combo
        ON restaurant_combo_items(combo_product_id);

      CREATE TABLE IF NOT EXISTS restaurant_order_item_components (
        id TEXT PRIMARY KEY,
        order_item_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        choice_group TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_item_id) REFERENCES restaurant_order_items(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_order_item_components_item
        ON restaurant_order_item_components(order_item_id);

      CREATE TABLE IF NOT EXISTS restaurant_price_lists (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        name TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'ALL'
          CHECK(channel IN ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'ALL')),
        starts_at TEXT,
        ends_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_restaurant_price_lists_branch
        ON restaurant_price_lists(branch_id, channel, is_active);

      CREATE TABLE IF NOT EXISTS restaurant_price_list_items (
        list_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        price REAL NOT NULL CHECK(price >= 0),
        PRIMARY KEY (list_id, product_id),
        FOREIGN KEY (list_id) REFERENCES restaurant_price_lists(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );
    `);
  },
};
