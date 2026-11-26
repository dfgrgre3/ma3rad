import type { Migration } from './support';
import { addColumn } from './support';

// Restaurant floor designer: drag-and-drop table positions on a canvas.
export const MIGRATION_270_RESTAURANT_TABLE_LAYOUT: Migration = {
  id: '270_restaurant_table_layout',
  description: 'Add canvas position columns to restaurant tables',
  up: (db) => {
    addColumn(db, 'restaurant_tables', 'pos_x', 'REAL');
    addColumn(db, 'restaurant_tables', 'pos_y', 'REAL');
  },
};
