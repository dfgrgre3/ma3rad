export const SCHEMA_PART_22 = String.raw`

-- 104. PER-TENANT USER DIRECTORY (managed by the platform owner)
CREATE TABLE IF NOT EXISTS platform_tenant_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  username TEXT,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'USER',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','INVITED')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_tenant_users_tenant ON platform_tenant_users(tenant_id, status);
`;
