import type { Migration } from './support';
import { addColumn, columnExists, tableExists } from './support';

export const MIGRATION_PART_77: Migration = {
  id: '194_platform_license_certificates',
  description: 'Add activation codes, certificates and activation history to platform licenses.',
  up: (db) => {
    if (tableExists(db, 'platform_licenses')) {
      const columns: Array<[string, string]> = [
        ['activation_code', 'TEXT'],
        ['certificate', 'TEXT'],
        ['transfer_count', 'INTEGER NOT NULL DEFAULT 0'],
      ];
      for (const [column, definition] of columns) {
        if (!columnExists(db, 'platform_licenses', column)) addColumn(db, 'platform_licenses', column, definition);
      }
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS platform_license_activations (
        id TEXT PRIMARY KEY,
        license_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        device_id TEXT,
        activation_code TEXT,
        mode TEXT NOT NULL DEFAULT 'ONLINE' CHECK(mode IN ('ONLINE','OFFLINE')),
        action TEXT NOT NULL CHECK(action IN ('ACTIVATE','DEACTIVATE','TRANSFER','RENEW','REVOKE')),
        status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK(status IN ('SUCCESS','FAILED','PENDING')),
        ip_address TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
      )
    `);
  },
};
