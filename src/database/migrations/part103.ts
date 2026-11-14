import type { Migration } from './support';
import { tableExists, addColumn } from './support';

export const MIGRATION_PART_103: Migration[] = [
  {
    id: '153_central_audit_tamper_evident_enhancements',
    description:
      'Extend platform_audit_logs with severity, actorType, tenantId, deviceId, ipAddress, oldValues, newValues, status, hash chaining, and append-only immutability.',
    disableForeignKeys: true,
    up: (db) => {
      if (tableExists(db, 'platform_audit_logs')) {
        addColumn(db, 'platform_audit_logs', 'severity', "TEXT NOT NULL DEFAULT 'INFO'");
        addColumn(db, 'platform_audit_logs', 'actor_type', "TEXT NOT NULL DEFAULT 'SUPER_ADMIN'");
        addColumn(db, 'platform_audit_logs', 'tenant_id', 'TEXT');
        addColumn(db, 'platform_audit_logs', 'device_id', 'TEXT');
        addColumn(db, 'platform_audit_logs', 'device_name', 'TEXT');
        addColumn(db, 'platform_audit_logs', 'ip_address', 'TEXT');
        addColumn(db, 'platform_audit_logs', 'user_agent', 'TEXT');
        addColumn(db, 'platform_audit_logs', 'old_values', 'TEXT');
        addColumn(db, 'platform_audit_logs', 'new_values', 'TEXT');
        addColumn(db, 'platform_audit_logs', 'status', "TEXT NOT NULL DEFAULT 'SUCCESS'");
        addColumn(db, 'platform_audit_logs', 'error_message', 'TEXT');
        addColumn(db, 'platform_audit_logs', 'prev_hash', 'TEXT');
        addColumn(db, 'platform_audit_logs', 'record_hash', 'TEXT');
      }

      // Add indexes for efficient multi-dimensional filtering
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_platform_audit_severity ON platform_audit_logs(severity);
        CREATE INDEX IF NOT EXISTS idx_platform_audit_tenant ON platform_audit_logs(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_platform_audit_status ON platform_audit_logs(status);
        CREATE INDEX IF NOT EXISTS idx_platform_audit_actor ON platform_audit_logs(actor_id, actor_type);

        -- Immutability Triggers (Append-Only Enforcement)
        DROP TRIGGER IF EXISTS trg_platform_audit_prevent_update;
        CREATE TRIGGER trg_platform_audit_prevent_update
        BEFORE UPDATE ON platform_audit_logs
        BEGIN
          SELECT RAISE(ABORT, 'Audit log entries are immutable and cannot be updated.');
        END;

        DROP TRIGGER IF EXISTS trg_platform_audit_prevent_delete;
        CREATE TRIGGER trg_platform_audit_prevent_delete
        BEFORE DELETE ON platform_audit_logs
        BEGIN
          SELECT RAISE(ABORT, 'Audit log entries are immutable and cannot be deleted directly.');
        END;

        -- Scheduled Exports and Retention Archive Table
        CREATE TABLE IF NOT EXISTS platform_audit_retention_archives (
          id TEXT PRIMARY KEY,
          archive_name TEXT NOT NULL,
          record_count INTEGER NOT NULL DEFAULT 0,
          date_from TEXT NOT NULL,
          date_to TEXT NOT NULL,
          file_path TEXT,
          checksum_sha256 TEXT,
          status TEXT NOT NULL DEFAULT 'COMPLETED',
          created_by TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    },
  },
];

