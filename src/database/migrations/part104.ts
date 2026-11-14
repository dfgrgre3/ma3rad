import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_104: Migration[] = [
  {
    id: '154_platform_tenant_activities_and_versions',
    description:
      'Add platform_tenant_activities and platform_tenant_activity_versions for independent per-tenant business activity profiles, customized modules, terminology, and snapshot rollbacks.',
    disableForeignKeys: true,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_tenant_activities (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL UNIQUE,
          activity_id TEXT NOT NULL,
          family_id TEXT,
          profile_id TEXT NOT NULL,
          enabled_modules TEXT NOT NULL DEFAULT '[]',
          custom_terminology TEXT NOT NULL DEFAULT '{}',
          navigation_overrides TEXT NOT NULL DEFAULT '[]',
          features_enabled TEXT NOT NULL DEFAULT '[]',
          custom_attributes TEXT NOT NULL DEFAULT '[]',
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tenant_activity_tenant ON platform_tenant_activities(tenant_id);

        CREATE TABLE IF NOT EXISTS platform_tenant_activity_versions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          activity_id TEXT NOT NULL,
          profile_id TEXT NOT NULL,
          config_snapshot TEXT NOT NULL,
          change_summary TEXT,
          created_by TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tenant_activity_versions ON platform_tenant_activity_versions(tenant_id, version);
      `);
    },
  },
];
