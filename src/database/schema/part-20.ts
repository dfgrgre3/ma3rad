export const SCHEMA_PART_20 = String.raw`

-- 101. PLATFORM TENANT ACCOUNTS
-- The login identity the platform owner issues for a customer (tenant). The
-- password is stored hashed; the activation code lets the owner hand the
-- credentials over to the customer and lets the customer confirm activation.
CREATE TABLE IF NOT EXISTS platform_tenant_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  full_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  activation_code TEXT,
  last_activated_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_tenant_accounts_tenant ON platform_tenant_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_tenant_accounts_username ON platform_tenant_accounts(username);
`;
