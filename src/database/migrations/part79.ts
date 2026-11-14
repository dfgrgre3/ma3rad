import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_79: Migration = {
  id: '195_platform_devices',
  description: 'Add a per-device registry for platform tenants.',
  up: (db) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_devices (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        license_id TEXT,
        hardware_id TEXT NOT NULL,
        name TEXT,
        os TEXT,
        app_version TEXT,
        ip_address TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','REVOKED','OFFLINE')),
        first_activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT,
        clone_suspected INTEGER NOT NULL DEFAULT 0 CHECK(clone_suspected IN (0,1)),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE SET NULL
      )
    `);
  },
};
