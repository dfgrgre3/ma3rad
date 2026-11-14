export const SCHEMA_PART_21 = String.raw`

-- 102. PER-TENANT FEATURE OVERRIDES (without changing the base plan)
CREATE TABLE IF NOT EXISTS platform_tenant_overrides (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('MODULE','FEATURE','LIMIT','PERMISSION')),
  code TEXT NOT NULL,
  value TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
  expires_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_tenant_overrides_tenant ON platform_tenant_overrides(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_tenant_overrides_kind ON platform_tenant_overrides(kind, code);
`;
