export const SCHEMA_PART_19 = String.raw`

-- 100. PLATFORM SUPER ADMIN (PLATFORM OWNER CONSOLE)
-- The platform owner is a single account that controls customers (tenants),
-- licenses, subscriptions, billing, plans and product configuration.
CREATE TABLE IF NOT EXISTS platform_tenants (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  country TEXT,
  city TEXT,
  address TEXT,
  business_type TEXT,
  status TEXT NOT NULL DEFAULT 'TRIAL'
    CHECK(status IN ('TRIAL','ACTIVE','SUSPENDED','EXPIRED','CANCELLED')),
  plan_id TEXT,
  subscription_started_at TEXT,
  subscription_expires_at TEXT,
  seats_limit INTEGER NOT NULL DEFAULT 1,
  branches_limit INTEGER NOT NULL DEFAULT 1,
  devices_limit INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_tenants_status ON platform_tenants(status);
CREATE INDEX IF NOT EXISTS idx_platform_tenants_expiry ON platform_tenants(subscription_expires_at);

CREATE TABLE IF NOT EXISTS platform_plans (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  billing_cycle TEXT NOT NULL DEFAULT 'YEARLY'
    CHECK(billing_cycle IN ('MONTHLY','QUARTERLY','YEARLY','LIFETIME')),
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EGP',
  seats_limit INTEGER NOT NULL DEFAULT 1,
  branches_limit INTEGER NOT NULL DEFAULT 1,
  devices_limit INTEGER NOT NULL DEFAULT 1,
  monthly_price REAL NOT NULL DEFAULT 0,
  yearly_price REAL NOT NULL DEFAULT 0,
  trial_days INTEGER NOT NULL DEFAULT 14,
  storage_limit_mb INTEGER NOT NULL DEFAULT 500,
  max_products INTEGER NOT NULL DEFAULT 1000,
  max_warehouses INTEGER NOT NULL DEFAULT 2,
  permissions TEXT NOT NULL DEFAULT '[]',
  included_modules TEXT NOT NULL DEFAULT '[]',
  features TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK(status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  seats INTEGER NOT NULL DEFAULT 1,
  price REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT 'YEARLY',
  auto_renew INTEGER NOT NULL DEFAULT 1 CHECK(auto_renew IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES platform_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_tenant ON platform_subscriptions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_end ON platform_subscriptions(end_date);

CREATE TABLE IF NOT EXISTS platform_licenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  subscription_id TEXT,
  plan_id TEXT,
  license_key TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK(status IN ('ISSUED','ACTIVE','SUSPENDED','REVOKED','EXPIRED')),
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TEXT,
  expires_at TEXT,
  seats INTEGER NOT NULL DEFAULT 1,
  device_limit INTEGER NOT NULL DEFAULT 1,
  hardware_id TEXT,
  activation_code TEXT,
  certificate TEXT,
  transfer_count INTEGER NOT NULL DEFAULT 0,
  modules TEXT NOT NULL DEFAULT '[]',
  features TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_licenses_tenant ON platform_licenses(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_licenses_expiry ON platform_licenses(expires_at);

CREATE TABLE IF NOT EXISTS platform_invoices (
  id TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  tenant_id TEXT NOT NULL,
  subscription_id TEXT,
  issue_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','SENT','PARTIAL','PAID','OVERDUE','VOID')),
  currency TEXT NOT NULL DEFAULT 'EGP',
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_invoices_tenant ON platform_invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_invoices_due ON platform_invoices(due_date);

CREATE TABLE IF NOT EXISTS platform_invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES platform_invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_invoice_items_invoice ON platform_invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS platform_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT,
  tenant_id TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'CASH'
    CHECK(method IN ('CASH','BANK','CARD','WALLET','OTHER')),
  reference TEXT,
  paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES platform_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_payments_tenant ON platform_payments(tenant_id, paid_at);

CREATE TABLE IF NOT EXISTS platform_modules (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
  min_plan_code TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_feature_flags (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
  rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK(rollout_percent BETWEEN 0 AND 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_releases (
  id TEXT PRIMARY KEY,
  version TEXT UNIQUE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'STABLE'
    CHECK(channel IN ('STABLE','BETA','NIGHTLY')),
  status TEXT NOT NULL DEFAULT 'PUBLISHED'
    CHECK(status IN ('DRAFT','PUBLISHED','DEPRECATED')),
  is_mandatory INTEGER NOT NULL DEFAULT 0 CHECK(is_mandatory IN (0,1)),
  min_version TEXT,
  rollout_group TEXT NOT NULL DEFAULT 'ALL',
  notes TEXT,
  released_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_platform_audit_entity ON platform_audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;
