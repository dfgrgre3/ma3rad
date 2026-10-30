CREATE TABLE IF NOT EXISTS sync_events (
  sequence BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('CREATE', 'UPDATE', 'DELETE', 'UPSERT')),
  entity_version INTEGER NOT NULL CHECK (entity_version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  data_scope TEXT NOT NULL CHECK (data_scope IN ('TENANT', 'BRANCH')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_events_tenant_sequence
  ON sync_events (tenant_id, sequence);

CREATE INDEX IF NOT EXISTS idx_sync_events_branch_sequence
  ON sync_events (tenant_id, branch_id, sequence);

CREATE TABLE IF NOT EXISTS sync_entity_policies (
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  outbound_enabled BOOLEAN NOT NULL,
  inbound_enabled BOOLEAN NOT NULL,
  data_scope TEXT NOT NULL CHECK (data_scope IN ('TENANT', 'BRANCH')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, entity_type)
);

CREATE TABLE IF NOT EXISTS sync_peer_cursors (
  tenant_id TEXT NOT NULL,
  peer_id TEXT NOT NULL,
  cursor BIGINT NOT NULL DEFAULT 0 CHECK (cursor >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, peer_id)
);
