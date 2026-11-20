import type { Migration } from './support';
import { addColumn, tableExists } from './support';

/**
 * Migration 234: manufacturing phase-1 integrity.
 *
 *  - production_orders.produced_qty tracks actual finished output so orders
 *    can be received in batches instead of only all-at-once completion.
 *    Existing COMPLETED orders are backfilled to their full quantity.
 *  - Enforce a single ACTIVE bill of materials per product: older duplicates
 *    are archived (keeping the most recently updated one) and a partial
 *    unique index prevents future duplicates.
 */
export const MIGRATION_PART_150: Migration[] = [
  {
    id: '234_production_orders_produced_qty',
    description: 'Track produced quantity on production orders for partial completions',
    up: (db) => {
      if (tableExists(db, 'production_orders')) {
        addColumn(db, 'production_orders', 'produced_qty', 'REAL NOT NULL DEFAULT 0');
        db.exec(`
          UPDATE production_orders
          SET produced_qty = quantity
          WHERE status = 'COMPLETED' AND COALESCE(produced_qty, 0) = 0;
        `);
      }
    },
  },
  {
    id: '235_single_active_bom_per_product',
    description: 'Keep at most one ACTIVE BOM per product and enforce it with a partial unique index',
    up: (db) => {
      if (!tableExists(db, 'bills_of_materials')) return;
      // Archive every ACTIVE BOM that has a newer ACTIVE sibling for the same
      // product. Deterministic: the survivor is the most recently updated one.
      db.exec(`
        UPDATE bills_of_materials
        SET status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'ACTIVE'
          AND EXISTS (
            SELECT 1 FROM bills_of_materials newer
            WHERE newer.product_id = bills_of_materials.product_id
              AND newer.status = 'ACTIVE'
              AND (
                newer.updated_at > bills_of_materials.updated_at
                OR (newer.updated_at = bills_of_materials.updated_at
                    AND newer.created_at > bills_of_materials.created_at)
                OR (newer.updated_at = bills_of_materials.updated_at
                    AND newer.created_at = bills_of_materials.created_at
                    AND newer.id > bills_of_materials.id)
              )
          );
      `);
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_of_materials_one_active_per_product
        ON bills_of_materials(product_id)
        WHERE status = 'ACTIVE';
      `);
    },
  },
  {
    id: '236_bom_items_unit_base_normalization',
    description: 'Normalize bom_items.unit to each component\'s base stock unit (quantities are already stored in base units)',
    up: (db) => {
      if (!tableExists(db, 'bom_items') || !tableExists(db, 'products')) return;
      db.exec(`
        UPDATE bom_items
        SET unit = (
          SELECT COALESCE(NULLIF(p.base_unit, ''), 'PIECE')
          FROM products p WHERE p.id = bom_items.component_product_id
        )
        WHERE unit IS NULL OR unit = '' OR unit != (
          SELECT COALESCE(NULLIF(p.base_unit, ''), 'PIECE')
          FROM products p WHERE p.id = bom_items.component_product_id
        );
      `);
    },
  },
];
