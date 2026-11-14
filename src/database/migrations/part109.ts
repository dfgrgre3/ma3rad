import type { Migration } from './support';

export const MIGRATION_PART_109: Migration[] = [
  {
    id: '159_platform_system_health',
    description:
      'Add platform_server_telemetry, platform_central_backups, and platform_service_incidents for central server diagnostics, resource monitoring, backup verification, and incident management.',
    disableForeignKeys: true,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_server_telemetry (
          id TEXT PRIMARY KEY,
          cpu_usage REAL NOT NULL,
          memory_usage REAL NOT NULL,
          disk_usage REAL NOT NULL,
          api_latency_ms INTEGER NOT NULL,
          api_error_rate REAL NOT NULL,
          redis_status TEXT DEFAULT 'CONNECTED',
          active_connections INTEGER DEFAULT 0,
          recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_telemetry_recorded ON platform_server_telemetry(recorded_at);

        CREATE TABLE IF NOT EXISTS platform_central_backups (
          id TEXT PRIMARY KEY,
          filename TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          storage_location TEXT NOT NULL,
          status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('IN_PROGRESS','COMPLETED','FAILED','VERIFIED')),
          integrity_check_passed INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          verified_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_central_backups_created ON platform_central_backups(created_at);

        CREATE TABLE IF NOT EXISTS platform_service_incidents (
          id TEXT PRIMARY KEY,
          service_name TEXT NOT NULL,
          severity TEXT CHECK(severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN','INVESTIGATING','RESOLVED')),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          resolved_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_incidents_status ON platform_service_incidents(status);

        -- Seed initial healthy telemetry row and sample verified backup
        INSERT OR IGNORE INTO platform_server_telemetry (id, cpu_usage, memory_usage, disk_usage, api_latency_ms, api_error_rate, redis_status, active_connections)
        VALUES ('tel_init', 18.5, 42.0, 36.4, 45, 0.05, 'CONNECTED', 128);

        INSERT OR IGNORE INTO platform_central_backups (id, filename, size_bytes, storage_location, status, integrity_check_passed, verified_at)
        VALUES ('bk_init', 'ceramisys_central_backup_nightly_enc.tar.gz', 104857600, 's3://ceramisys-cloud-vault/backups/central/', 'VERIFIED', 1, CURRENT_TIMESTAMP);
      `);
    },
  },
];
