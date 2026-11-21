import type { Migration } from './support';
import { tableExists } from './support';

// PlatformStaffService/PlatformHealthService query `platform_security_incidents`,
// but the original security-center migration created the table under the name
// `platform_security_incidents_log` with a narrower column set — every local
// security-center load failed with "no such table: platform_security_incidents".
// Create the table the services actually use and carry over any rows recorded
// in the legacy `_log` table.
export const MIGRATION_261_PLATFORM_SECURITY_INCIDENTS: Migration = {
  id: '261_platform_security_incidents',
  description:
    'Create platform_security_incidents (the table security services query) and migrate rows from the legacy platform_security_incidents_log table',
  up: (db) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_security_incidents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
        title TEXT NOT NULL,
        description TEXT,
        details TEXT,
        source_ip TEXT,
        ip_address TEXT,
        tenant_id TEXT,
        staff_id TEXT,
        device_id TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED')),
        response TEXT,
        containment_action TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT,
        resolved_at TEXT
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_platform_security_incidents_status ON platform_security_incidents(status, created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_platform_security_incidents_severity ON platform_security_incidents(severity)`);

    if (!tableExists(db, 'platform_security_incidents_log')) return;

    const targetCount = Number(
      db.exec('SELECT COUNT(*) FROM platform_security_incidents')[0]?.values[0]?.[0] || 0
    );
    if (targetCount > 0) return;

    db.exec(`
      INSERT INTO platform_security_incidents
        (id, type, severity, title, details, source_ip, ip_address, status, containment_action, created_at, updated_at, resolved_at)
      SELECT
        id, type, severity, title, details, source_ip, source_ip, status, containment_action, created_at, created_at, resolved_at
      FROM platform_security_incidents_log
    `);
  },
};
