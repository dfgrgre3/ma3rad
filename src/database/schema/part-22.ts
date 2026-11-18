export const SCHEMA_PART_22 = String.raw`

-- 104. PER-TENANT USER DIRECTORY (managed by the platform owner)
-- This is a directory/provisioning record. It is NOT by itself a real login
-- account in the tenant's identity system. Real account creation/invitation is
-- tracked via provisioning_* and identity_user_id fields.
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
  provisioning_status TEXT NOT NULL DEFAULT 'NOT_REQUESTED'
    CHECK(provisioning_status IN ('NOT_REQUESTED','PENDING','INVITED','PROVISIONED','FAILED','DIRECTORY_ONLY')),
  provisioning_mode TEXT CHECK(provisioning_mode IN ('INVITE','DIRECT_CREATE')),
  identity_user_id TEXT,
  scope TEXT,
  invite_code TEXT,
  temporary_password TEXT,
  invite_expires_at TEXT,
  provisioned_at TEXT,
  last_error TEXT,
  password_hash TEXT,
  activation_code TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  provisioned INTEGER NOT NULL DEFAULT 0 CHECK(provisioned IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_tenant_users_tenant ON platform_tenant_users(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_tenant_users_identity ON platform_tenant_users(tenant_id, identity_user_id);
`;
