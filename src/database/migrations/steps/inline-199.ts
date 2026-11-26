import type { Database } from 'sql.js';
import type { Migration } from '../support';

export const MIGRATION_199_POS_INVOICE_DRAFTS: Migration = {
    id: '199_pos_invoice_drafts',
    description: 'Live POS invoice drafts: structured auto-saved cart snapshots per cashier, queryable and expirable.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pos_invoice_drafts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          customer_id TEXT,
          customer_name TEXT,
          warehouse_id TEXT,
          item_count INTEGER NOT NULL DEFAULT 0,
          total_amount REAL NOT NULL DEFAULT 0,
          payload TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_pos_invoice_drafts_user
          ON pos_invoice_drafts(user_id, updated_at DESC);
      `);
    },
};
