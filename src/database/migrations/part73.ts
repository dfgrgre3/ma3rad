import type { Migration } from './support';
import { addColumn, columnExists, tableExists } from './support';

/**
 * Adds the customer central-file fields and the tenant account table.
 *
 * The full table definition lives in the schema (`part-19` / `part-20`); this
 * migration keeps existing databases in sync without touching newer ones.
 */
export const MIGRATION_PART_73: Migration = {
  id: '191_platform_tenant_accounts',
  description: 'Add the tenant address field and tenant login accounts for the platform customer file.',
  up: (db) => {
    if (tableExists(db, 'platform_tenants') && !columnExists(db, 'platform_tenants', 'address')) {
      addColumn(db, 'platform_tenants', 'address', 'TEXT');
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS platform_tenant_accounts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL UNIQUE,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT,
        full_name TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
        activation_code TEXT,
        last_activated_at TEXT,
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
      )
    `);
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_platform_tenant_accounts_tenant
       ON platform_tenant_accounts(tenant_id)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_platform_tenant_accounts_username
       ON platform_tenant_accounts(username)`
    );
  },
};
