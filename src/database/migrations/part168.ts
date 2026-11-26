import type { Migration } from './support';
import { addColumn } from './support';

// BOM items gain a waste percentage so recipe costing can factor in
// preparation loss when estimating material cost.
export const MIGRATION_267_BOM_ITEM_WASTE: Migration = {
  id: '267_bom_item_waste_percent',
  description: 'Add waste percentage to BOM items for recipe costing',
  up: (db) => {
    addColumn(db, 'bom_items', 'waste_percent', 'REAL NOT NULL DEFAULT 0');
  },
};
