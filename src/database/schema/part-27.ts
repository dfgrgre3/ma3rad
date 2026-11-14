export const SCHEMA_PART_27 = String.raw`

-- 109. PER-TENANT API KEYS
CREATE TABLE IF NOT EXISTS platform_api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  expires_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_api_keys_tenant ON platform_api_keys(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_platform_api_keys_prefix ON platform_api_keys(key_prefix);
`;
