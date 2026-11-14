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
`;
