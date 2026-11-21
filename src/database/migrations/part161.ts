import type { Migration } from './support';
import { tableExists } from './support';

function tableSql(db: any, table: string): string {
  return String(
    db.exec(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${table}'`)[0]?.values[0]?.[0] ?? ''
  );
}

// platform_license_changes.change_type CHECK was missing UPDATE/REACTIVATE/UNBIND,
// so admin license edits/reactivations/unbinds could not be recorded. SQLite
// cannot alter a CHECK constraint — rebuild the table preserving all rows.
function rebuildLicenseChanges(db: any): void {
  if (!tableExists(db, 'platform_license_changes')) return;
  const sql = tableSql(db, 'platform_license_changes');
  if (!sql || sql.includes("'UNBIND'")) return;

  db.exec(`
    CREATE TABLE platform_license_changes__new (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL,
      subscription_id TEXT,
      change_type TEXT NOT NULL
        CHECK(change_type IN ('ISSUE','RENEW','SUSPEND','REVOKE','TRANSFER','MODULE_CHANGE','LIMIT_CHANGE','COUPLING_CHANGE','STATUS_CHANGE','UPDATE','REACTIVATE','UNBIND')),
      old_values TEXT,
      new_values TEXT,
      actor_id TEXT,
      actor_name TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE SET NULL
    );
    INSERT INTO platform_license_changes__new
      (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason, created_at)
      SELECT id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason, created_at
      FROM platform_license_changes;
    DROP TABLE platform_license_changes;
    ALTER TABLE platform_license_changes__new RENAME TO platform_license_changes;
    CREATE INDEX IF NOT EXISTS idx_platform_license_changes_license ON platform_license_changes(license_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_license_changes_type ON platform_license_changes(change_type);
  `);
}

// platform_devices.status CHECK lacked RELEASED/INACTIVE, which
// releaseDevice/deactivateLicenseDevice write — those calls used to throw.
function rebuildDevices(db: any): void {
  if (!tableExists(db, 'platform_devices')) return;
  const sql = tableSql(db, 'platform_devices');
  if (!sql || sql.includes("'RELEASED'")) return;

  db.exec(`
    CREATE TABLE platform_devices__new (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      license_id TEXT,
      hardware_id TEXT NOT NULL,
      name TEXT,
      os TEXT,
      app_version TEXT,
      ip_address TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','REVOKED','OFFLINE','RELEASED','INACTIVE')),
      first_activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT,
      clone_suspected INTEGER NOT NULL DEFAULT 0 CHECK(clone_suspected IN (0,1)),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE SET NULL
    );
    INSERT INTO platform_devices__new
      (id, tenant_id, license_id, hardware_id, name, os, app_version, ip_address, status,
       first_activated_at, last_seen_at, clone_suspected, notes, created_at, updated_at)
      SELECT id, tenant_id, license_id, hardware_id, name, os, app_version, ip_address, status,
             first_activated_at, last_seen_at, clone_suspected, notes, created_at, updated_at
      FROM platform_devices;
    DROP TABLE platform_devices;
    ALTER TABLE platform_devices__new RENAME TO platform_devices;
    CREATE INDEX IF NOT EXISTS idx_platform_devices_tenant ON platform_devices(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_platform_devices_hardware ON platform_devices(hardware_id);
  `);
}

export const MIGRATION_260_LICENSE_DEVICE_CHECK_FIXES: Migration = {
  id: '260_license_device_check_fixes',
  description:
    'Expand CHECK constraints on platform_license_changes.change_type and platform_devices.status so license edits/reactivations/unbinds and device release/deactivate can be recorded',
  disableForeignKeys: true,
  up: (db) => {
    rebuildLicenseChanges(db);
    rebuildDevices(db);
  },
};
