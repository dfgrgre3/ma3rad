import type { Migration } from './support';
import { tableExists } from './support';

export const MIGRATION_PART_112: Migration = {
  id: '162_platform_security_center',
  description: 'Add central platform security tables: staff logins, active sessions, security incidents, and signing keys.',
  up: (db) => {
    // 1. Staff Logins Audit Table
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_staff_logins (
        id TEXT PRIMARY KEY,
        staff_id TEXT,
        email TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAILED', 'BLOCKED')),
        failure_reason TEXT,
        attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_staff_logins_email ON platform_staff_logins(email)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_staff_logins_status ON platform_staff_logins(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_staff_logins_time ON platform_staff_logins(attempted_at)`);

    // 2. Central Active Sessions Table
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_staff_sessions (
        id TEXT PRIMARY KEY,
        staff_id TEXT NOT NULL,
        staff_name TEXT NOT NULL,
        staff_role TEXT NOT NULL,
        ip_address TEXT,
        device_name TEXT,
        is_trusted_device INTEGER NOT NULL DEFAULT 0 CHECK(is_trusted_device IN (0,1)),
        is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_staff_sessions_staff ON platform_staff_sessions(staff_id)`);

    // 3. Central Security Incidents Table
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_security_incidents_log (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
        title TEXT NOT NULL,
        details TEXT,
        source_ip TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CONTAINED', 'RESOLVED')),
        containment_action TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT
      )
    `);

    // 4. Platform Cryptographic Signing Keys Table
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_signing_keys (
        id TEXT PRIMARY KEY,
        key_alias TEXT NOT NULL,
        algorithm TEXT NOT NULL DEFAULT 'HMAC-SHA256',
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'ROTATED', 'REVOKED')),
        rotated_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default signing key if empty
    const countKeys = Number(db.exec('SELECT COUNT(*) FROM platform_signing_keys')[0]?.values[0]?.[0] || 0);
    if (countKeys === 0) {
      db.run(`
        INSERT INTO platform_signing_keys (id, key_alias, algorithm, version, status)
        VALUES 
          ('key_master_license', 'central_license_signer', 'Ed25519', 1, 'ACTIVE'),
          ('key_master_config', 'platform_config_signer', 'HMAC-SHA256', 1, 'ACTIVE')
      `);
    }

    // Seed sample staff session
    const countSessions = Number(db.exec('SELECT COUNT(*) FROM platform_staff_sessions')[0]?.values[0]?.[0] || 0);
    if (countSessions === 0) {
      db.run(`
        INSERT INTO platform_staff_sessions (id, staff_id, staff_name, staff_role, ip_address, device_name, is_trusted_device, is_current)
        VALUES 
          ('sess_cur_owner', 'staff_super_admin', 'مالك المنصة (الرئيسي)', 'SUPER_ADMIN', '127.0.0.1', 'Chrome (Windows 11) - الإدارة المركزية', 1, 1),
          ('sess_sup_agent', 'staff_support_lead', 'أحمد كمال (دعم فني)', 'SUPPORT_AGENT', '192.168.1.45', 'Firefox (Ubuntu Desktop)', 1, 0)
      `);
    }
  },
};
