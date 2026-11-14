import type { Migration } from './support';
import { addColumn, columnExists, tableExists } from './support';

export const MIGRATION_PART_74: Migration = {
  id: '192_platform_dynamic_pricing',
  description: 'Add dynamic pricing, limits and permissions to platform plans, plus per-tenant overrides.',
  up: (db) => {
    if (tableExists(db, 'platform_plans')) {
      const columns: Array<[string, string]> = [
        ['monthly_price', 'REAL NOT NULL DEFAULT 0'],
        ['yearly_price', 'REAL NOT NULL DEFAULT 0'],
        ['trial_days', 'INTEGER NOT NULL DEFAULT 14'],
        ['storage_limit_mb', 'INTEGER NOT NULL DEFAULT 500'],
        ['max_products', 'INTEGER NOT NULL DEFAULT 1000'],
        ['max_warehouses', 'INTEGER NOT NULL DEFAULT 2'],
        ['permissions', "TEXT NOT NULL DEFAULT '[]'"],
      ];
      for (const [column, definition] of columns) {
        if (!columnExists(db, 'platform_plans', column)) addColumn(db, 'platform_plans', column, definition);
      }
      // Backfill monthly/yearly from the legacy single price when possible.
      db.run(`UPDATE platform_plans SET monthly_price = price WHERE monthly_price = 0 AND billing_cycle = 'MONTHLY'`);
      db.run(`UPDATE platform_plans SET yearly_price = price WHERE yearly_price = 0 AND billing_cycle = 'YEARLY'`);
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS platform_tenant_overrides (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('MODULE','FEATURE','LIMIT','PERMISSION')),
        code TEXT NOT NULL,
        value TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
        expires_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
      )
    `);
  },
};
