import type { Migration } from './support';
import { columnExists, tableExists } from './support';

// Removes the restaurant activity: drops every restaurant_* table, the
// restaurant_order_id link column on sales_invoices, and the seeded
// platform catalogue rows that offered the restaurant module/feature.
const RESTAURANT_TABLES = [
  'restaurant_order_item_modifiers',
  'restaurant_order_item_components',
  'restaurant_order_items',
  'restaurant_orders',
  'restaurant_reservations',
  'restaurant_waitlist',
  'restaurant_tables',
  'restaurant_menu_items',
  'restaurant_menu_item_groups',
  'restaurant_modifier_groups',
  'restaurant_modifiers',
  'restaurant_combo_items',
  'restaurant_price_list_items',
  'restaurant_price_lists',
  'restaurant_coupons',
  'restaurant_coupon_redemptions',
  'restaurant_loyalty_accounts',
  'restaurant_loyalty_transactions',
  'restaurant_feedback',
  'restaurant_driver_settlements',
];

export const MIGRATION_275_RESTAURANT_REMOVAL: Migration = {
  id: '275_restaurant_removal',
  description: 'Drop restaurant tables, sales_invoices.restaurant_order_id, and restaurant platform seeds',
  up: (db) => {
    for (const table of RESTAURANT_TABLES) {
      if (tableExists(db, table)) {
        db.exec(`DROP TABLE IF EXISTS "${table}"`);
      }
    }

    db.exec('DROP INDEX IF EXISTS idx_sales_invoices_restaurant_order');
    if (tableExists(db, 'sales_invoices') && columnExists(db, 'sales_invoices', 'restaurant_order_id')) {
      db.exec('ALTER TABLE sales_invoices DROP COLUMN restaurant_order_id');
    }

    if (tableExists(db, 'platform_modules')) {
      db.exec(`DELETE FROM platform_modules WHERE code = 'restaurant'`);
    }
    if (tableExists(db, 'platform_feature_flags')) {
      db.exec(`DELETE FROM platform_feature_flags WHERE code = 'restaurant_mode'`);
    }
    if (tableExists(db, 'platform_ui_profiles')) {
      db.exec(`DELETE FROM platform_ui_profiles WHERE id = 'uip_restaurant' OR business_type = 'restaurant'`);
    }
    if (tableExists(db, 'platform_config_templates')) {
      db.exec(`DELETE FROM platform_config_templates WHERE id = 'pct_restaurant' OR business_type = 'restaurant'`);
    }
    if (tableExists(db, 'platform_plans')) {
      // Strip the restaurant module/feature codes from plan JSON arrays without
      // producing empty elements: `,"restaurant"` covers middle/trailing and
      // `"restaurant",` covers a leading entry.
      db.exec(`
        UPDATE platform_plans SET included_modules =
          replace(replace(COALESCE(included_modules, '[]'), ',"restaurant"', ''), '"restaurant",', '')
        WHERE included_modules LIKE '%"restaurant"%';
        UPDATE platform_plans SET features =
          replace(replace(COALESCE(features, '[]'), ',"restaurant_mode"', ''), '"restaurant_mode",', '')
        WHERE features LIKE '%"restaurant_mode"%';
      `);
    }
  },
};
