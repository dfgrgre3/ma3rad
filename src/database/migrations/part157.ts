import type { Database } from 'sql.js';
import type { Migration } from './support';

/**
 * Migration 252: ceramics showroom depth.
 *
 * Adds persistence for the ceramics/porcelain vertical:
 *  - ceramic_area_quotes: saved "area takeoffs" (مقاييسات مساحة) produced by
 *    the showroom calculator — customer + tile design + net area + waste %
 *    resolved into boxes/pieces and priced per m² or per box.
 */
export const MIGRATION_252_CERAMIC_AREA_QUOTES: Migration = {
  id: '252_ceramic_area_quotes',
  description: 'Add ceramic_area_quotes table for showroom area takeoffs',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ceramic_area_quotes (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        quote_number TEXT NOT NULL,
        customer_id TEXT,
        customer_name TEXT,
        product_id TEXT,
        product_name TEXT,
        area_m2 REAL NOT NULL,
        waste_percent REAL NOT NULL DEFAULT 10,
        required_m2 REAL NOT NULL,
        boxes_needed REAL NOT NULL,
        meters_per_box REAL,
        pieces_per_box INTEGER,
        unit_price_m2 REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'DRAFT'
          CHECK(status IN ('DRAFT','SENT','ACCEPTED','REJECTED')),
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ceramic_quotes_branch ON ceramic_area_quotes(branch_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_ceramic_quotes_status ON ceramic_area_quotes(status);
      CREATE INDEX IF NOT EXISTS idx_ceramic_quotes_product ON ceramic_area_quotes(product_id);
    `);
  },
};
