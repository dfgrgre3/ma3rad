import type { Migration } from './support';
import { addColumn } from './support';

// Restaurant menu categories: bilingual name, image/icon, manual ordering,
// channel visibility and a daily time window for POS display.
export const MIGRATION_268_MENU_CATEGORY_FIELDS: Migration = {
  id: '268_menu_category_fields',
  description: 'Add restaurant display fields to categories (name_en, image, icon, sort, channels, time window, active)',
  up: (db) => {
    addColumn(db, 'categories', 'name_en', 'TEXT');
    addColumn(db, 'categories', 'image_path', 'TEXT');
    addColumn(db, 'categories', 'icon', 'TEXT');
    addColumn(db, 'categories', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'categories', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
    addColumn(db, 'categories', 'channels', 'TEXT');
    addColumn(db, 'categories', 'available_from', 'TEXT');
    addColumn(db, 'categories', 'available_until', 'TEXT');
  },
};
