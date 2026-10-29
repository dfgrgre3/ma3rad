export const SCHEMA_PART_18 = String.raw`

-- 99. OFFLINE-FIRST MULTI-BRANCH SYNCHRONIZATION FOUNDATION
CREATE TABLE IF NOT EXISTS sync_outbox (
  event_id TEXT PRIMARY KEY,
  tenant_id TEXT,
  branch_id TEXT NOT NULL,
  device_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK(operation_type IN ('CREATE','UPDATE','DELETE','UPSERT')),
  entity_version INTEGER NOT NULL DEFAULT 1,
  schema_version INTEGER NOT NULL DEFAULT 1,
  data_scope TEXT NOT NULL DEFAULT 'BRANCH' CHECK(data_scope IN ('TENANT','BRANCH')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivery_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(delivery_status IN ('PENDING','IN_FLIGHT','ACKNOWLEDGED','FAILED','DEAD_LETTER')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TEXT,
  acknowledged_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_created ON sync_outbox(delivery_status, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_branch ON sync_outbox(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_entity ON sync_outbox(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS sync_inbox (
  event_id TEXT PRIMARY KEY,
  tenant_id TEXT,
  source_branch_id TEXT,
  source_device_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  entity_version INTEGER NOT NULL DEFAULT 1,
  schema_version INTEGER NOT NULL DEFAULT 1,
  data_scope TEXT NOT NULL DEFAULT 'BRANCH' CHECK(data_scope IN ('TENANT','BRANCH')),
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  status TEXT NOT NULL DEFAULT 'RECEIVED'
    CHECK(status IN ('RECEIVED','APPLIED','DUPLICATE','FAILED','REJECTED')),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_inbox_status ON sync_inbox(status, received_at);
CREATE INDEX IF NOT EXISTS idx_sync_inbox_entity ON sync_inbox(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS sync_cursor (
  scope TEXT PRIMARY KEY,
  cursor TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_branches (
  branch_id TEXT PRIMARY KEY,
  tenant_id TEXT,
  name TEXT NOT NULL,
  base_url TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED','REVOKED')),
  is_verified INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0,1)),
  verified_at TEXT,
  last_contact_at TEXT,
  last_sync_at TEXT,
  authorized_by TEXT,
  device_type TEXT,
  activation_code TEXT UNIQUE,
  activated_device_id TEXT,
  activation_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_devices (
  device_id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  tenant_id TEXT,
  device_name TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED','REVOKED')),
  is_verified INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0,1)),
  verified_at TEXT,
  device_type TEXT,
  activation_code TEXT,
  activation_used_at TEXT,
  last_seen_at TEXT,
  last_contact_at TEXT,
  last_sync_at TEXT,
  authorized_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sync_branches(branch_id)
);

CREATE TABLE IF NOT EXISTS sync_tombstones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type, entity_id, branch_id)
);

CREATE TABLE IF NOT EXISTS sync_entity_versions (
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_version INTEGER NOT NULL,
  source_branch_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  source_branch_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  remote_version INTEGER NOT NULL,
  local_version INTEGER,
  remote_payload TEXT NOT NULL,
  local_payload TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED_LOCAL','RESOLVED_REMOTE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status_created
  ON sync_conflicts(status, created_at);

CREATE TABLE IF NOT EXISTS sync_bootstrap_progress (
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  cursor_id TEXT,
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, entity_type)
);

CREATE TABLE IF NOT EXISTS sync_audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  branch_id TEXT,
  device_id TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_audit_created ON sync_audit_log(created_at);
`;
