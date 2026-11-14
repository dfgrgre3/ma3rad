import type { Migration } from './support';

export const MIGRATION_PART_105: Migration[] = [
  {
    id: '155_platform_ops_center',
    description:
      'Add Operations Center tables: platform_ops_jobs, platform_maintenance_windows, platform_op_approvals, platform_sync_log.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_ops_jobs (
          id TEXT PRIMARY KEY,
          type TEXT,
          tenant_id TEXT,
          payload TEXT,
          status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','DONE','FAILED','CANCELLED')),
          priority INTEGER DEFAULT 5,
          retries INTEGER DEFAULT 0,
          max_retries INTEGER DEFAULT 3,
          error_message TEXT,
          scheduled_at TEXT,
          started_at TEXT,
          completed_at TEXT,
          created_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_ops_jobs_status ON platform_ops_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_ops_jobs_tenant ON platform_ops_jobs(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_ops_jobs_scheduled ON platform_ops_jobs(scheduled_at);

        CREATE TABLE IF NOT EXISTS platform_maintenance_windows (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          starts_at TEXT NOT NULL,
          ends_at TEXT NOT NULL,
          affected_services TEXT,
          status TEXT DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','ACTIVE','COMPLETED','CANCELLED')),
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_maintenance_status ON platform_maintenance_windows(status);

        CREATE TABLE IF NOT EXISTS platform_op_approvals (
          id TEXT PRIMARY KEY,
          op_type TEXT NOT NULL,
          op_payload TEXT,
          requested_by TEXT NOT NULL,
          approved_by TEXT,
          status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_op_approvals_status ON platform_op_approvals(status);

        CREATE TABLE IF NOT EXISTS platform_sync_log (
          id TEXT PRIMARY KEY,
          tenant_id TEXT,
          device_id TEXT,
          sync_type TEXT,
          status TEXT DEFAULT 'SUCCESS' CHECK(status IN ('SUCCESS','FAIL','PARTIAL')),
          records_synced INTEGER DEFAULT 0,
          error_detail TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_sync_log_tenant ON platform_sync_log(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_sync_log_created ON platform_sync_log(created_at);
      `);
    },
  },
];
