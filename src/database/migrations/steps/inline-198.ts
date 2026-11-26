import type { Database } from 'sql.js';
import type { Migration } from '../support';
import { addColumn } from '../support';

export const MIGRATION_198_PRODUCT_SERIALS: Migration = {
    id: '198_product_serials',
    description: 'Per-unit serial/IMEI tracking: product_serials ledger plus products.track_serials flag.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_serials (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          serial_number TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'IN_STOCK'
            CHECK(status IN ('IN_STOCK', 'SOLD', 'DAMAGED', 'RETURNED')),
          warehouse_id TEXT REFERENCES warehouses(id) ON DELETE SET NULL,
          branch_id TEXT,
          purchase_invoice_id TEXT,
          sale_invoice_id TEXT,
          sale_invoice_item_id TEXT,
          return_invoice_id TEXT,
          received_at TEXT,
          sold_at TEXT,
          returned_at TEXT,
          notes TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(product_id, serial_number)
        );
        CREATE INDEX IF NOT EXISTS idx_product_serials_product_status
          ON product_serials(product_id, status);
        CREATE INDEX IF NOT EXISTS idx_product_serials_serial
          ON product_serials(serial_number);
        CREATE INDEX IF NOT EXISTS idx_product_serials_sale_invoice
          ON product_serials(sale_invoice_id);
        CREATE INDEX IF NOT EXISTS idx_product_serials_sale_item
          ON product_serials(sale_invoice_item_id);
        CREATE INDEX IF NOT EXISTS idx_product_serials_purchase_invoice
          ON product_serials(purchase_invoice_id);
      `);
      addColumn(db, 'products', 'track_serials', 'INTEGER NOT NULL DEFAULT 0');
    },
};
