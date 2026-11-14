import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_76: Migration = {
  id: '193_platform_tenant_users',
  description: 'Add a per-tenant user directory managed by the platform owner.',
  up: (db) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_tenant_users (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        full_name TEXT NOT NULL,
        username TEXT,
        email TEXT,
        phone TEXT,
        role TEXT NOT NULL DEFAULT 'USER',
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','INVITED')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_platform_tenant_users_tenant ON platform_tenant_users(tenant_id, status)`);
  },
};
