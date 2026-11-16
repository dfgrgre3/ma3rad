export const SCHEMA_PART_25 = String.raw`

-- 107. RELEASE ROLLOUT TARGETS AND TRACKING
CREATE TABLE IF NOT EXISTS platform_release_targets (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SUCCESS','FAILED','SKIPPED')),
  applied_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (release_id) REFERENCES platform_releases(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_release_targets_release ON platform_release_targets(release_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_release_targets_tenant ON platform_release_targets(tenant_id, status);

-- 108. TENANT CONFIG PUSH HISTORY (for Remote Control tab)
CREATE TABLE IF NOT EXISTS platform_tenant_config_push (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  config_json TEXT NOT NULL,
  pushed_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','ACKNOWLEDGED','FAILED')),
  pushed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_tenant_config_push_tenant ON platform_tenant_config_push(tenant_id, pushed_at);
CREATE INDEX IF NOT EXISTS idx_platform_tenant_config_push_status ON platform_tenant_config_push(status);

-- 109. OUTBOX TABLE FOR EVENT-DRIVEN SYNC (Phase 1: PLAN_TENANTS_ENHANCEMENT)
CREATE TABLE IF NOT EXISTS platform_outbox (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('TENANT','LICENSE','SUBSCRIPTION','CONFIG','DEVICE')),
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_platform_outbox_status ON platform_outbox(status);
CREATE INDEX IF NOT EXISTS idx_platform_outbox_entity ON platform_outbox(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_platform_outbox_created ON platform_outbox(created_at);

-- 110. PLATFORM NOTIFICATIONS (Phase 5: LICENSE_MANAGEMENT_IMPLEMENTATION_PLAN)
CREATE TABLE IF NOT EXISTS platform_notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK(severity IN ('INFO','WARNING','CRITICAL')),
  channels TEXT NOT NULL DEFAULT '["IN_APP"]',
  metadata TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_notifications_tenant ON platform_notifications(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_notifications_type ON platform_notifications(type);
CREATE INDEX IF NOT EXISTS idx_platform_notifications_reference ON platform_notifications(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_platform_notifications_read ON platform_notifications(read_at);
`;
