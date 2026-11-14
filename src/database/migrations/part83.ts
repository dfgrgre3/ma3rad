import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_83: Migration = {
  id: '199_platform_coupons',
  description: 'Add discount coupons for platform billing.',
  up: (db) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_coupons (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        discount_type TEXT NOT NULL CHECK(discount_type IN ('PERCENT','FIXED')),
        discount_value REAL NOT NULL DEFAULT 0,
        max_uses INTEGER,
        used_count INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },
};
