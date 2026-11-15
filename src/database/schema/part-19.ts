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
  /** Default offline grace period in days for licenses issued under this plan. */
  offline_grace_period_days INTEGER NOT NULL DEFAULT 14,
  /** الإ aktuelli الإصدار الساري للخطة (يزداد عند كل إصدار جديد). */
  current_version INTEGER NOT NULL DEFAULT 1,
  /** إذا كانت الخطة تسمح بنسخ الأسعار مع تاريخ سريان (versioning). */
  versioned INTEGER NOT NULL DEFAULT 0 CHECK(versioned IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_plan_versions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  billing_cycle TEXT NOT NULL DEFAULT 'YEARLY',
  price REAL NOT NULL DEFAULT 0,
  monthly_price REAL NOT NULL DEFAULT 0,
  yearly_price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EGP',
  seats_limit INTEGER NOT NULL DEFAULT 1,
  branches_limit INTEGER NOT NULL DEFAULT 1,
  devices_limit INTEGER NOT NULL DEFAULT 1,
  storage_limit_mb INTEGER NOT NULL DEFAULT 500,
  max_products INTEGER NOT NULL DEFAULT 1000,
  max_warehouses INTEGER NOT NULL DEFAULT 2,
  trial_days INTEGER NOT NULL DEFAULT 14,
  included_modules TEXT NOT NULL DEFAULT '[]',
  features TEXT NOT NULL DEFAULT '[]',
  permissions TEXT NOT NULL DEFAULT '[]',
  offline_grace_period_days INTEGER NOT NULL DEFAULT 14,
  /** تاريخ بدء سريان هذا الإصدار (ISO). الأسعار الجديدة تسري من هذا التاريخ للعملاء الجدد فقط. */
  effective_from TEXT NOT NULL,
  /** إذا كان هذا الإصدار هو الساري حالياً للخطة الأساسية. */
  is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
  /** ملاحظة administrators حول التغيير في هذا الإصدار. */
  change_note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES platform_plans(id) ON DELETE CASCADE,
  UNIQUE(plan_id, version)
);

CREATE INDEX IF NOT EXISTS idx_plan_versions_plan ON platform_plan_versions(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_versions_effective ON platform_plan_versions(effective_from);

-- سجل تغييرات الأسعار بمرور الوقت (لتتبع السعر المطبق لكل عميل وللتدقيق).
CREATE TABLE IF NOT EXISTS platform_price_history (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  old_price REAL,
  new_price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EGP',
  effective_from TEXT NOT NULL,
  reason TEXT,
  actor_id TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES platform_plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_history_plan ON platform_price_history(plan_id, effective_from);

-- قفل الأسعار للعملاء الحاليين عند تغيير الخطة (يحافظ على السعر القديم للعملاء الحاليين).
CREATE TABLE IF NOT EXISTS platform_subscription_price_locks (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  locked_price REAL NOT NULL,
  locked_monthly_price REAL NOT NULL DEFAULT 0,
  locked_yearly_price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EGP',
  /** التاريخ الذي ينتهي عنده القفل (null = قفل دائم ما لم يتم تغيير الاشتراك). */
  expires_at TEXT,
  /** إذا كان السعر مقفلاً من خطة سابقة عند الترقية/التخفيض. */
  is_grandfathered INTEGER NOT NULL DEFAULT 0 CHECK(is_grandfathered IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES platform_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_price_locks_subscription ON platform_subscription_price_locks(subscription_id);

-- قواعد الترقية والتخفيض بين الخطط.
CREATE TABLE IF NOT EXISTS platform_plan_upgrade_rules (
  id TEXT PRIMARY KEY,
  from_plan_id TEXT NOT NULL,
  to_plan_id TEXT NOT NULL,
  /** هل يسمح بالترقية من هذه الخطة إلى تلك؟ */
  allowed INTEGER NOT NULL DEFAULT 1 CHECK(allowed IN (0,1)),
  /** نسبتها من الفرق يتم احتسابها كرسوم ترقية (0-100). */
  upgrade_fee_percent REAL NOT NULL DEFAULT 0,
  /** هل يتطلب موافقة يدوية؟ */
  requires_approval INTEGER NOT NULL DEFAULT 0 CHECK(requires_approval IN (0,1)),
  /** ملاحظة around the rule. */
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_plan_id) REFERENCES platform_plans(id),
  FOREIGN KEY (to_plan_id) REFERENCES platform_plans(id),
  UNIQUE(from_plan_id, to_plan_id)
);

CREATE INDEX IF NOT EXISTS idx_upgrade_rules_from ON platform_plan_upgrade_rules(from_plan_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_rules_to ON platform_plan_upgrade_rules(to_plan_id);

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
  /** Maximum number of branches allowed by this subscription. */
  branches_limit INTEGER NOT NULL DEFAULT 1,
  /** السعر المقفل لهذا الاشتراك (للحفاظ على السعر القديم عند تغيير الخطة). */
  locked_price REAL,
  /** العملة المقفلة. */
  locked_currency TEXT DEFAULT 'EGP',
  /** رمز الكوبون المطبق على هذا الاشتراك (إن وجد). */
  coupon_code TEXT,
  /** تاريخ سريان التغيير الأخير للخطة (للإصدارات الجديدة). */
  plan_version INTEGER DEFAULT 1,
  /** نوع التغيير الأخير: upgrade / downgrade / same. */
  last_change_type TEXT,
  /** تاريخ انتهاء الفترة التجريبية المجانية. */
  trial_ends_at TEXT,
  /** هل هذه فترة تجريبية مجانية. */
  is_trial INTEGER NOT NULL DEFAULT 0 CHECK(is_trial IN (0,1)),
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
  /** License effective start date (may differ from issued_at for future-dated licenses). */
  starts_at TEXT,
  activated_at TEXT,
  expires_at TEXT,
  seats INTEGER NOT NULL DEFAULT 1,
  device_limit INTEGER NOT NULL DEFAULT 1,
  /** Maximum number of branches allowed by this license. */
  branches_limit INTEGER NOT NULL DEFAULT 1,
  hardware_id TEXT,
  activation_code TEXT,
  certificate TEXT,
  transfer_count INTEGER NOT NULL DEFAULT 0,
  modules TEXT NOT NULL DEFAULT '[]',
  features TEXT NOT NULL DEFAULT '[]',
  /** Offline grace period in days (overrides plan default if set). */
  offline_grace_period_days INTEGER,
  /** Subscription-license coupling mode: FULL | EXPIRY_ONLY | NONE */
  coupling_mode TEXT DEFAULT 'FULL' CHECK(coupling_mode IN ('FULL','EXPIRY_ONLY','NONE')),
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
  actor_type TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
  tenant_id TEXT,
  device_id TEXT,
  device_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  severity TEXT NOT NULL DEFAULT 'INFO',
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  details TEXT,
  old_values TEXT,
  new_values TEXT,
  error_message TEXT,
  prev_hash TEXT,
  record_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_platform_audit_entity ON platform_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_severity ON platform_audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_platform_audit_tenant ON platform_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_status ON platform_audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_platform_audit_actor ON platform_audit_logs(actor_id, actor_type);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 100b. PER-TENANT ACTIVITY CUSTOMIZATION AND VERSION ARCHIVE
CREATE TABLE IF NOT EXISTS platform_tenant_activities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  activity_id TEXT NOT NULL,
  family_id TEXT,
  profile_id TEXT NOT NULL,
  enabled_modules TEXT NOT NULL DEFAULT '[]',
  custom_terminology TEXT NOT NULL DEFAULT '{}',
  navigation_overrides TEXT NOT NULL DEFAULT '[]',
  features_enabled TEXT NOT NULL DEFAULT '[]',
  custom_attributes TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_activity_tenant ON platform_tenant_activities(tenant_id);

CREATE TABLE IF NOT EXISTS platform_tenant_activity_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  activity_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  config_snapshot TEXT NOT NULL,
  change_summary TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_activity_versions ON platform_tenant_activity_versions(tenant_id, version);

-- 101. LICENSE CHANGE LOG (immutable audit trail)
CREATE TABLE IF NOT EXISTS platform_license_changes (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  subscription_id TEXT,
  change_type TEXT NOT NULL
    CHECK(change_type IN ('ISSUE','RENEW','SUSPEND','REVOKE','TRANSFER','MODULE_CHANGE','LIMIT_CHANGE','COUPLING_CHANGE','STATUS_CHANGE')),
  old_values TEXT,
  new_values TEXT,
  actor_id TEXT,
  actor_name TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_license_changes_license ON platform_license_changes(license_id, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_license_changes_type ON platform_license_changes(change_type);

-- 102. SUBSCRIPTION CHANGE LOG (immutable audit trail)
CREATE TABLE IF NOT EXISTS platform_subscription_changes (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  change_type TEXT NOT NULL
    CHECK(change_type IN ('CREATE','RENEW','SUSPEND','CANCEL','EXPIRE','PLAN_CHANGE','LIMIT_CHANGE','SEATS_CHANGE','BRANCHES_CHANGE')),
  old_values TEXT,
  new_values TEXT,
  actor_id TEXT,
  actor_name TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_subscription_changes_sub ON platform_subscription_changes(subscription_id, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_subscription_changes_type ON platform_subscription_changes(change_type);

-- 103. OPERATIONS CENTER
CREATE TABLE IF NOT EXISTS platform_ops_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  tenant_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','RUNNING','DONE','FAILED','CANCELLED')),
  priority INTEGER NOT NULL DEFAULT 5,
  retries INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_ops_jobs_status ON platform_ops_jobs(status);
CREATE INDEX IF NOT EXISTS idx_platform_ops_jobs_tenant ON platform_ops_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_ops_jobs_scheduled ON platform_ops_jobs(scheduled_at);

CREATE TABLE IF NOT EXISTS platform_maintenance_windows (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  affected_services TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'SCHEDULED'
    CHECK(status IN ('SCHEDULED','ACTIVE','COMPLETED','CANCELLED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_maintenance_windows_status ON platform_maintenance_windows(status);
CREATE INDEX IF NOT EXISTS idx_platform_maintenance_windows_starts ON platform_maintenance_windows(starts_at);

CREATE TABLE IF NOT EXISTS platform_op_approvals (
  id TEXT PRIMARY KEY,
  op_type TEXT NOT NULL,
  op_payload TEXT NOT NULL DEFAULT '{}',
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_op_approvals_status ON platform_op_approvals(status);
CREATE INDEX IF NOT EXISTS idx_platform_op_approvals_requested_by ON platform_op_approvals(requested_by);

CREATE TABLE IF NOT EXISTS platform_sync_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  device_id TEXT,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUCCESS'
    CHECK(status IN ('SUCCESS','FAIL','PARTIAL')),
  records_synced INTEGER NOT NULL DEFAULT 0,
  error_detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_sync_log_tenant ON platform_sync_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_sync_log_device ON platform_sync_log(device_id);
CREATE INDEX IF NOT EXISTS idx_platform_sync_log_status ON platform_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_platform_sync_log_created ON platform_sync_log(created_at);

-- 104. PLATFORM BRANDING & WHITE-LABELING
CREATE TABLE IF NOT EXISTS platform_tenant_branding (
  id TEXT PRIMARY KEY,
  tenant_id TEXT UNIQUE,
  company_name TEXT,
  logo_url TEXT,
  logo_dark_url TEXT,
  favicon_url TEXT,
  primary_color TEXT DEFAULT '#10b981',
  secondary_color TEXT DEFAULT '#064e3b',
  accent_color TEXT DEFAULT '#3b82f6',
  font_family TEXT DEFAULT 'Tajawal',
  invoice_template TEXT DEFAULT 'classic' CHECK(invoice_template IN ('classic','modern','minimal','thermal_pos')),
  login_background_url TEXT,
  login_welcome_title TEXT,
  login_welcome_subtitle TEXT,
  email_header_logo TEXT,
  email_footer_text TEXT,
  custom_subdomain TEXT,
  allowed_customizations TEXT DEFAULT '{"canChangeLogo":true,"canChangeColors":true,"canChangeInvoiceTemplate":true,"canChangeLogin":false}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_tenant_branding_tenant ON platform_tenant_branding(tenant_id);

CREATE TABLE IF NOT EXISTS platform_tenant_branding_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  version INTEGER NOT NULL,
  branding_snapshot TEXT NOT NULL,
  change_summary TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_tenant_branding_versions ON platform_tenant_branding_versions(tenant_id, version);

-- 105. PLATFORM UI CUSTOMIZATIONS & PROFILES
CREATE TABLE IF NOT EXISTS platform_ui_profiles (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  business_type TEXT,
  hidden_pages TEXT DEFAULT '[]',
  hidden_actions TEXT DEFAULT '[]',
  custom_labels TEXT DEFAULT '{}',
  nav_order TEXT DEFAULT '[]',
  form_field_rules TEXT DEFAULT '{}',
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_tenant_ui_customizations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT UNIQUE NOT NULL,
  profile_id TEXT,
  hidden_pages TEXT DEFAULT '[]',
  hidden_actions TEXT DEFAULT '[]',
  custom_labels TEXT DEFAULT '{}',
  nav_order TEXT DEFAULT '[]',
  form_field_rules TEXT DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_tenant_ui_tenant ON platform_tenant_ui_customizations(tenant_id);

CREATE TABLE IF NOT EXISTS platform_tenant_ui_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  config_snapshot TEXT NOT NULL,
  change_summary TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_tenant_ui_versions ON platform_tenant_ui_versions(tenant_id, version);

-- 106. PLATFORM APP CONFIGURATION & ROLLOUTS
CREATE TABLE IF NOT EXISTS platform_config_templates (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  business_type TEXT,
  plan_id TEXT,
  config_payload TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_tenant_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT UNIQUE NOT NULL,
  template_id TEXT,
  config_payload TEXT NOT NULL DEFAULT '{}',
  signature TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('DRAFT','ACTIVE','DEPRECATED')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_tenant_config_tenant ON platform_tenant_configs(tenant_id);

CREATE TABLE IF NOT EXISTS platform_tenant_config_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  config_payload TEXT NOT NULL,
  signature TEXT,
  change_summary TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_tenant_config_versions ON platform_tenant_config_versions(tenant_id, version);

CREATE TABLE IF NOT EXISTS platform_config_rollouts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('ALL','ACTIVITY','PLAN','CANARY_PERCENT','SPECIFIC_TENANTS')),
  target_filter TEXT DEFAULT '{}',
  config_snapshot TEXT NOT NULL,
  signature TEXT NOT NULL,
  status TEXT DEFAULT 'IN_PROGRESS' CHECK(status IN ('DRAFT','IN_PROGRESS','COMPLETED','ROLLED_BACK')),
  total_tenants INTEGER DEFAULT 0,
  received_count INTEGER DEFAULT 0,
  applied_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS platform_tenant_config_ack (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  device_id TEXT,
  rollout_id TEXT,
  version INTEGER NOT NULL,
  status TEXT DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','APPLIED','FAILED')),
  error_message TEXT,
  acknowledged_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_config_ack_tenant ON platform_tenant_config_ack(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_config_ack_rollout ON platform_tenant_config_ack(rollout_id);

-- 107. PLATFORM SYSTEM HEALTH & CENTRAL DIAGNOSTICS
CREATE TABLE IF NOT EXISTS platform_server_telemetry (
  id TEXT PRIMARY KEY,
  cpu_usage REAL NOT NULL,
  memory_usage REAL NOT NULL,
  disk_usage REAL NOT NULL,
  api_latency_ms INTEGER NOT NULL,
  api_error_rate REAL NOT NULL,
  redis_status TEXT DEFAULT 'CONNECTED',
  active_connections INTEGER DEFAULT 0,
  recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_telemetry_recorded ON platform_server_telemetry(recorded_at);

CREATE TABLE IF NOT EXISTS platform_central_backups (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_location TEXT NOT NULL,
  status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('IN_PROGRESS','COMPLETED','FAILED','VERIFIED')),
  integrity_check_passed INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_platform_central_backups_created ON platform_central_backups(created_at);

CREATE TABLE IF NOT EXISTS platform_service_incidents (
  id TEXT PRIMARY KEY,
  service_name TEXT NOT NULL,
  severity TEXT CHECK(severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN','INVESTIGATING','RESOLVED')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_platform_incidents_status ON platform_service_incidents(status);

CREATE TABLE IF NOT EXISTS platform_support_canned_replies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'GENERAL',
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_remote_sessions (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  technician_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  actions_summary TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'TERMINATED'))
);

CREATE INDEX IF NOT EXISTS idx_remote_sessions_ticket ON platform_remote_sessions(ticket_id);

CREATE TABLE IF NOT EXISTS platform_staff (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER')),
  password_hash TEXT,
  salt TEXT,
  permissions_override TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_staff_role ON platform_staff(role);

CREATE TABLE IF NOT EXISTS platform_staff_logins (
  id TEXT PRIMARY KEY,
  staff_id TEXT,
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAILED', 'BLOCKED')),
  failure_reason TEXT,
  attempted_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_staff_sessions (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  staff_role TEXT NOT NULL,
  ip_address TEXT,
  device_name TEXT,
  is_trusted_device INTEGER DEFAULT 0,
  is_current INTEGER DEFAULT 0,
  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_security_incidents_log (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT CHECK(severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  title TEXT NOT NULL,
  details TEXT,
  source_ip TEXT,
  status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CONTAINED', 'RESOLVED')),
  containment_action TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS platform_signing_keys (
  id TEXT PRIMARY KEY,
  key_alias TEXT NOT NULL,
  algorithm TEXT DEFAULT 'HMAC-SHA256',
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'ROTATED', 'REVOKED')),
  rotated_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;
