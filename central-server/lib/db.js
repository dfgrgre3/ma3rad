'use strict';

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const {
  PLATFORM_PERMISSION_CATALOG,
  PLATFORM_ROLE_DEFAULT_PERMISSIONS,
} = require('../platformPermissionCatalog');

let db = null;

function getDb() {
  if (!db) {
    throw new Error('Central database has not been initialized. Call initDatabase() before using the API.');
  }
  return db;
}

function setDb(connection) {
  db = connection;
}

async function initDatabase(options = {}) {
  const filename = options.filename || process.env.CENTRAL_DB_PATH || './central.db';
  db = await open({ filename, driver: sqlite3.Database });

  await db.exec('PRAGMA foreign_keys = ON');
  await db.exec('PRAGMA journal_mode = WAL');
  await db.exec('PRAGMA busy_timeout = 5000');

  await migratePlatformIdentityTables();
  await createTables();
  await migrateAuditChain();

  const swept = await db.run('DELETE FROM platform_sessions WHERE expires_at <= CURRENT_TIMESTAMP');
  if (swept?.changes) console.log(`Swept ${swept.changes} expired platform session(s)`);

  return db;
}

/**
 * Rename legacy platform identity tables to the unified platform_users naming:
 *   platform_admins         -> platform_users
 *   platform_admin_sessions -> platform_sessions (column admin_id -> user_id)
 * Idempotent: safe to run on every boot and on fresh databases.
 */
async function migratePlatformIdentityTables() {
  const tableExists = async (name) =>
    Boolean(await db.get(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [name]));

  if (await tableExists('platform_admins') && !(await tableExists('platform_users'))) {
    await db.exec('ALTER TABLE platform_admins RENAME TO platform_users');
    console.log('Migrated table platform_admins -> platform_users');
  }
  if (await tableExists('platform_admin_sessions') && !(await tableExists('platform_sessions'))) {
    await db.exec('ALTER TABLE platform_admin_sessions RENAME TO platform_sessions');
    console.log('Migrated table platform_admin_sessions -> platform_sessions');
  }

  const sessionColumns = (await db.all(`PRAGMA table_info('platform_sessions')`)).map((col) => col.name);
  if (sessionColumns.includes('admin_id')) {
    try {
      await db.exec('ALTER TABLE platform_sessions RENAME COLUMN admin_id TO user_id');
    } catch (err) {
      // Fallback for older SQLite builds: rebuild the sessions table.
      console.warn('RENAME COLUMN not supported, rebuilding platform_sessions table:', err.message);
      await db.exec(`
        CREATE TABLE platform_sessions_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token TEXT UNIQUE NOT NULL,
          expires_at TEXT NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_activity_at TEXT,
          FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
        );
        INSERT INTO platform_sessions_new (id, user_id, token, expires_at, ip_address, user_agent, created_at, last_activity_at)
          SELECT id, admin_id, token, expires_at, ip_address, user_agent, created_at, NULL FROM platform_sessions;
        DROP TABLE platform_sessions;
        ALTER TABLE platform_sessions_new RENAME TO platform_sessions;
      `);
    }
    console.log('Migrated column platform_sessions.admin_id -> user_id');
  }

  const sessionColumnsAfter = (await db.all(`PRAGMA table_info('platform_sessions')`)).map((col) => col.name);
  if (sessionColumnsAfter.length > 0 && !sessionColumnsAfter.includes('last_activity_at')) {
    await db.exec('ALTER TABLE platform_sessions ADD COLUMN last_activity_at TEXT');
    console.log('Migrated platform_sessions: added column last_activity_at');
  }
  if (sessionColumnsAfter.length > 0) {
    await db.run('UPDATE platform_sessions SET last_activity_at = created_at WHERE last_activity_at IS NULL');
  }

  const addColumnIfMissing = async (table, columns, name, ddl) => {
    if (!columns.includes(name)) {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
      console.log(`Migrated ${table}: added column ${name}`);
    }
  };

  if (await tableExists('platform_users')) {
    const userColumns = (await db.all(`PRAGMA table_info('platform_users')`)).map((col) => col.name);
    await addColumnIfMissing('platform_users', userColumns, 'data_scope', `data_scope TEXT NOT NULL DEFAULT 'ALL'`);
    await addColumnIfMissing('platform_users', userColumns, 'must_change_password', `must_change_password INTEGER NOT NULL DEFAULT 0`);
    await addColumnIfMissing('platform_users', userColumns, 'failed_login_attempts', `failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
    await addColumnIfMissing('platform_users', userColumns, 'locked_until', `locked_until TEXT`);
    await addColumnIfMissing('platform_users', userColumns, 'deleted_at', `deleted_at TEXT`);
    await addColumnIfMissing('platform_users', userColumns, 'phone', `phone TEXT`);
    await db.exec('CREATE INDEX IF NOT EXISTS idx_platform_users_deleted ON platform_users(deleted_at)');
  }

  if (await tableExists('platform_roles')) {
    const roleColumns = (await db.all(`PRAGMA table_info('platform_roles')`)).map((col) => col.name);
    await addColumnIfMissing('platform_roles', roleColumns, 'code', `code TEXT`);
    await addColumnIfMissing('platform_roles', roleColumns, 'is_system', `is_system INTEGER NOT NULL DEFAULT 0`);
    await addColumnIfMissing('platform_roles', roleColumns, 'updated_at', `updated_at TEXT`);

    const flagColumns = (await db.all(`PRAGMA table_info('platform_feature_flags')`)).map((col) => col.name);
    await addColumnIfMissing('platform_feature_flags', flagColumns, 'page_paths', `page_paths TEXT`);
    await db.exec('UPDATE platform_roles SET code = id WHERE code IS NULL');
    await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_roles_code ON platform_roles(code)');
  }

  if (await tableExists('platform_devices')) {
    const deviceColumns = (await db.all(`PRAGMA table_info('platform_devices')`)).map((col) => col.name);
    await addColumnIfMissing('platform_devices', deviceColumns, 'credential_hash', `credential_hash TEXT`);
  }
}

async function createTables() {
  await db.exec(`
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
      offline_grace_period_days INTEGER NOT NULL DEFAULT 14,
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
      branches_limit INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES platform_plans(id)
    );

    CREATE TABLE IF NOT EXISTS platform_licenses (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      subscription_id TEXT,
      plan_id TEXT,
      license_key TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK(status IN ('ISSUED','ACTIVE','SUSPENDED','REVOKED','EXPIRED')),
      issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      starts_at TEXT,
      activated_at TEXT,
      expires_at TEXT,
      seats INTEGER NOT NULL DEFAULT 1,
      device_limit INTEGER NOT NULL DEFAULT 1,
      branches_limit INTEGER NOT NULL DEFAULT 1,
      hardware_id TEXT,
      activation_code TEXT,
      certificate TEXT,
      transfer_count INTEGER NOT NULL DEFAULT 0,
      modules TEXT NOT NULL DEFAULT '[]',
      features TEXT NOT NULL DEFAULT '[]',
      offline_grace_period_days INTEGER,
      coupling_mode TEXT DEFAULT 'FULL' CHECK(coupling_mode IN ('FULL','EXPIRY_ONLY','NONE')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS platform_license_activations (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      device_id TEXT,
      activation_code TEXT,
      mode TEXT NOT NULL DEFAULT 'ONLINE' CHECK(mode IN ('ONLINE','OFFLINE')),
      action TEXT NOT NULL CHECK(action IN ('ACTIVATE','DEACTIVATE','TRANSFER','RENEW','REVOKE')),
      status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK(status IN ('SUCCESS','FAILED','PENDING')),
      ip_address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS platform_devices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      license_id TEXT,
      hardware_id TEXT NOT NULL,
      name TEXT,
      os TEXT,
      app_version TEXT,
      ip_address TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','REVOKED','OFFLINE')),
      first_activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT,
      clone_suspected INTEGER NOT NULL DEFAULT 0 CHECK(clone_suspected IN (0,1)),
      credential_hash TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS platform_license_changes (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL,
      subscription_id TEXT,
      change_type TEXT NOT NULL
        CHECK(change_type IN ('ISSUE','RENEW','SUSPEND','REVOKE','TRANSFER','MODULE_CHANGE','LIMIT_CHANGE','COUPLING_CHANGE','STATUS_CHANGE','UPDATE','REACTIVATE','UNBIND')),
      old_values TEXT,
      new_values TEXT,
      actor_id TEXT,
      actor_name TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE SET NULL
    );

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

    CREATE TABLE IF NOT EXISTS platform_roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      permissions TEXT NOT NULL DEFAULT '[]',
      code TEXT,
      is_system INTEGER NOT NULL DEFAULT 0 CHECK(is_system IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS platform_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      email TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
      permissions TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      last_login_at TEXT,
      data_scope TEXT NOT NULL DEFAULT 'ALL',
      must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0,1)),
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      last_activity_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS platform_permissions (
      code TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      name TEXT NOT NULL,
      is_special INTEGER NOT NULL DEFAULT 0 CHECK(is_special IN (0,1)),
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS platform_role_permissions (
      role_code TEXT NOT NULL,
      permission_code TEXT NOT NULL,
      PRIMARY KEY (role_code, permission_code)
    );
    CREATE INDEX IF NOT EXISTS idx_platform_role_permissions_code ON platform_role_permissions(permission_code);

    CREATE TABLE IF NOT EXISTS platform_user_roles (
      user_id TEXT NOT NULL,
      role_code TEXT NOT NULL,
      PRIMARY KEY (user_id, role_code),
      FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_user_roles_role ON platform_user_roles(role_code);

    CREATE TABLE IF NOT EXISTS platform_user_permissions (
      user_id TEXT NOT NULL,
      permission_code TEXT NOT NULL,
      effect TEXT NOT NULL DEFAULT 'GRANT' CHECK(effect IN ('GRANT','DENY')),
      PRIMARY KEY (user_id, permission_code),
      FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS platform_scopes (
      user_id TEXT NOT NULL,
      scope_type TEXT NOT NULL CHECK(scope_type IN ('TENANT')),
      scope_id TEXT NOT NULL,
      PRIMARY KEY (user_id, scope_type, scope_id),
      FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS platform_mfa (
      user_id TEXT PRIMARY KEY,
      method TEXT NOT NULL DEFAULT 'TOTP' CHECK(method IN ('TOTP')),
      secret TEXT NOT NULL,
      backup_codes TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      verified_at TEXT,
      FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS platform_login_attempts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      user_id TEXT,
      success INTEGER NOT NULL DEFAULT 0 CHECK(success IN (0,1)),
      failure_reason TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_platform_login_attempts_user ON platform_login_attempts(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_login_attempts_lookup ON platform_login_attempts(username, ip_address, created_at);

    CREATE TABLE IF NOT EXISTS platform_approval_policies (
      id TEXT PRIMARY KEY,
      operation_code TEXT UNIQUE NOT NULL,
      mode TEXT NOT NULL DEFAULT 'APPROVAL' CHECK(mode IN ('DIRECT','APPROVAL','DISABLED')),
      min_approvals INTEGER NOT NULL DEFAULT 1 CHECK(min_approvals >= 1),
      approver_roles TEXT NOT NULL DEFAULT '[]',
      allow_self_approval INTEGER NOT NULL DEFAULT 0 CHECK(allow_self_approval IN (0,1)),
      expires_after_hours INTEGER,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_audit_events (
      id TEXT PRIMARY KEY,
      sequence INTEGER,
      actor_type TEXT NOT NULL DEFAULT 'PLATFORM' CHECK(actor_type IN ('PLATFORM','TENANT','SYSTEM')),
      actor_id TEXT,
      actor_name TEXT,
      tenant_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      before_data TEXT,
      after_data TEXT,
      ip_address TEXT,
      user_agent TEXT,
      prev_hash TEXT,
      record_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_platform_audit_events_created ON platform_audit_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_audit_events_actor ON platform_audit_events(actor_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_audit_events_tenant ON platform_audit_events(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_audit_events_action ON platform_audit_events(action, created_at);

    CREATE TABLE IF NOT EXISTS platform_rbac_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_signing_keys (
      id TEXT PRIMARY KEY,
      key_id TEXT UNIQUE NOT NULL,
      private_key TEXT,
      public_key TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_platform_tenants_status ON platform_tenants(status);
    CREATE INDEX IF NOT EXISTS idx_platform_tenants_expiry ON platform_tenants(subscription_expires_at);
    CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_tenant ON platform_subscriptions(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_end ON platform_subscriptions(end_date);
    CREATE INDEX IF NOT EXISTS idx_platform_licenses_tenant ON platform_licenses(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_platform_licenses_expiry ON platform_licenses(expires_at);
    CREATE INDEX IF NOT EXISTS idx_platform_license_activations_license ON platform_license_activations(license_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_license_activations_tenant ON platform_license_activations(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_devices_tenant ON platform_devices(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_platform_devices_hardware ON platform_devices(hardware_id);
    CREATE INDEX IF NOT EXISTS idx_platform_users_deleted ON platform_users(deleted_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_roles_code ON platform_roles(code);
    CREATE INDEX IF NOT EXISTS idx_platform_license_changes_license ON platform_license_changes(license_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_subscription_changes_sub ON platform_subscription_changes(subscription_id, created_at);

    CREATE TABLE IF NOT EXISTS platform_invoices (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      subscription_id TEXT,
      issue_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_platform_invoices_tenant ON platform_invoices(tenant_id, status);

    CREATE TABLE IF NOT EXISTS platform_invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES platform_invoices(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_invoice_items_invoice ON platform_invoice_items(invoice_id);

    CREATE TABLE IF NOT EXISTS platform_tenant_accounts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      email TEXT,
      full_name TEXT,
      password_hash TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      activation_code TEXT,
      last_activated_at TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS platform_tenant_users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      username TEXT,
      full_name TEXT NOT NULL,
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
      origin TEXT NOT NULL DEFAULT 'PLATFORM',
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_tenant_users_tenant ON platform_tenant_users(tenant_id, status);

    -- Delivery queue between the platform console and tenant ERP devices.
    -- One row per identity mutation; a device claims PENDING jobs, applies them
    -- to its local users table, then reports the outcome via /result.
    CREATE TABLE IF NOT EXISTS platform_tenant_provisioning_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      tenant_user_id TEXT NOT NULL,
      event TEXT NOT NULL
        CHECK(event IN ('PROVISION','UPDATE','STATUS','DELETE')),
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(status IN ('PENDING','CLAIMED','DONE','FAILED','CANCELLED')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 8,
      last_error TEXT,
      claimed_by_device_id TEXT,
      claimed_at TEXT,
      result_identity_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_prov_jobs_tenant_status ON platform_tenant_provisioning_jobs(tenant_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_prov_jobs_user ON platform_tenant_provisioning_jobs(tenant_user_id, status);

    CREATE TABLE IF NOT EXISTS platform_tenant_overrides (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'MODULE',
      code TEXT NOT NULL,
      value TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_tenant_overrides_tenant ON platform_tenant_overrides(tenant_id);

    CREATE TABLE IF NOT EXISTS platform_tenant_branches (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      city TEXT,
      country TEXT,
      address TEXT,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK(status IN ('ACTIVE','SUSPENDED','CLOSED')),
      seats_limit INTEGER NOT NULL DEFAULT 1,
      devices_limit INTEGER NOT NULL DEFAULT 1,
      is_main INTEGER NOT NULL DEFAULT 0 CHECK(is_main IN (0,1)),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, code),
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_tenant_branches_tenant ON platform_tenant_branches(tenant_id);

    CREATE TABLE IF NOT EXISTS platform_payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT,
      tenant_id TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      method TEXT NOT NULL DEFAULT 'CASH',
      reference TEXT,
      notes TEXT,
      paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES platform_invoices(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_platform_payments_tenant ON platform_payments(tenant_id);

    CREATE TABLE IF NOT EXISTS platform_remote_config (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      config_key TEXT NOT NULL,
      config_value TEXT,
      scope TEXT NOT NULL DEFAULT 'TENANT',
      target_device_ids TEXT,
      status TEXT NOT NULL DEFAULT 'APPLIED',
      applied_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_remote_config_tenant ON platform_remote_config(tenant_id);

    CREATE TABLE IF NOT EXISTS platform_ops_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(status IN ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
      payload TEXT,
      result TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      run_at TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_platform_ops_jobs_status ON platform_ops_jobs(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_ops_jobs_tenant ON platform_ops_jobs(tenant_id);

    CREATE TABLE IF NOT EXISTS platform_webhook_endpoints (id TEXT PRIMARY KEY, url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS platform_notification_templates (id TEXT PRIMARY KEY, name TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

    CREATE TABLE IF NOT EXISTS platform_backups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      name TEXT,
      type TEXT NOT NULL DEFAULT 'FULL'
        CHECK(type IN ('FULL','INCREMENTAL','PRE_RESTORE')),
      status TEXT NOT NULL DEFAULT 'REQUESTED'
        CHECK(status IN ('REQUESTED','IN_PROGRESS','COMPLETED','FAILED','EXPIRED')),
      size_bytes INTEGER,
      storage_uri TEXT,
      trigger_source TEXT NOT NULL DEFAULT 'MANUAL'
        CHECK(trigger_source IN ('MANUAL','SCHEDULED','PRE_UPDATE','PRE_RESTORE')),
      triggered_by TEXT,
      notes TEXT,
      error TEXT,
      checksum TEXT,
      completed_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_backups_tenant ON platform_backups(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_backups_status ON platform_backups(status);

    CREATE TABLE IF NOT EXISTS platform_backup_restores (
      id TEXT PRIMARY KEY,
      backup_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'REQUESTED'
        CHECK(status IN ('REQUESTED','IN_PROGRESS','COMPLETED','FAILED','ROLLED_BACK')),
      requested_by TEXT,
      notes TEXT,
      error TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (backup_id) REFERENCES platform_backups(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_backup_restores_tenant ON platform_backup_restores(tenant_id, created_at);

    -- Tenant application (ERP) database snapshots uploaded by licensed devices.
    -- The artifact is the device's own encrypted .sqlite.enc file: the central
    -- server stores it opaquely and can never read the tenant's business data.
    CREATE TABLE IF NOT EXISTS platform_app_backups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      device_id TEXT,
      name TEXT,
      type TEXT NOT NULL DEFAULT 'FULL'
        CHECK(type IN ('FULL','INCREMENTAL','MANUAL')),
      status TEXT NOT NULL DEFAULT 'COMPLETED'
        CHECK(status IN ('REQUESTED','IN_PROGRESS','COMPLETED','FAILED')),
      size_bytes INTEGER,
      checksum TEXT NOT NULL,
      storage_uri TEXT NOT NULL,
      notes TEXT,
      restore_status TEXT NOT NULL DEFAULT 'NONE'
        CHECK(restore_status IN ('NONE','REQUESTED','IN_PROGRESS','COMPLETED','FAILED')),
      restore_requested_by TEXT,
      restore_requested_at TEXT,
      restore_error TEXT,
      restore_completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_app_backups_tenant ON platform_app_backups(tenant_id, created_at);

    CREATE TABLE IF NOT EXISTS platform_error_reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      device_id TEXT,
      fingerprint TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      stack TEXT,
      issue_type TEXT,
      severity TEXT NOT NULL DEFAULT 'medium'
        CHECK(severity IN ('low','medium','high','critical')),
      app_version TEXT,
      os TEXT,
      occurrences INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED','IGNORED')),
      acknowledged_by TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_error_reports_status ON platform_error_reports(status, last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_platform_error_reports_tenant ON platform_error_reports(tenant_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_error_reports_fingerprint ON platform_error_reports(fingerprint);

    CREATE TABLE IF NOT EXISTS platform_support_tickets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'GENERAL',
      priority TEXT NOT NULL DEFAULT 'NORMAL'
        CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
      status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK(status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED')),
      requester_name TEXT,
      requester_email TEXT,
      requester_phone TEXT,
      assignee_id TEXT,
      assignee_name TEXT,
      remote_access_requested INTEGER NOT NULL DEFAULT 0,
      remote_access_approved INTEGER NOT NULL DEFAULT 0,
      remote_access_requested_at TEXT,
      remote_access_approved_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_message_at TEXT,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_support_tickets_tenant ON platform_support_tickets(tenant_id, status);

    CREATE TABLE IF NOT EXISTS platform_remote_sessions (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      staff_id TEXT,
      technician_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ENDED','EXPIRED')),
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT,
      duration_minutes INTEGER,
      expires_at TEXT,
      summary TEXT,
      FOREIGN KEY (ticket_id) REFERENCES platform_support_tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_remote_sessions_ticket ON platform_remote_sessions(ticket_id);

    CREATE TABLE IF NOT EXISTS platform_support_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      author_type TEXT NOT NULL CHECK(author_type IN ('STAFF','CUSTOMER','SYSTEM')),
      author_id TEXT,
      author_name TEXT,
      body TEXT NOT NULL,
      internal INTEGER NOT NULL DEFAULT 0 CHECK(internal IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES platform_support_tickets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_support_messages_ticket ON platform_support_messages(ticket_id, created_at);

    CREATE TABLE IF NOT EXISTS platform_releases (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'STABLE'
        CHECK(channel IN ('STABLE','BETA','ALPHA')),
      status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK(status IN ('DRAFT','PUBLISHED','ROLLED_BACK','ARCHIVED')),
      rollout_strategy TEXT NOT NULL DEFAULT 'FULL'
        CHECK(rollout_strategy IN ('FULL','PHASED')),
      rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK(rollout_percent BETWEEN 0 AND 100),
      target_tenant_ids TEXT,
      download_url TEXT,
      checksum TEXT,
      release_notes TEXT,
      min_required_version TEXT,
      is_mandatory INTEGER NOT NULL DEFAULT 0 CHECK(is_mandatory IN (0,1)),
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_platform_releases_status ON platform_releases(status, channel, created_at);

    CREATE TABLE IF NOT EXISTS platform_policies (id TEXT PRIMARY KEY, slug TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

    -- Policies & Compliance: versioned policy documents with a
    -- draft → pending-approval → published workflow. Mirrors the desktop
    -- schema (src/database/migrations/part163.ts).
    CREATE TABLE IF NOT EXISTS platform_policy_documents (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','PUBLISHED')),
      draft_content TEXT NOT NULL DEFAULT '',
      draft_change_summary TEXT,
      draft_updated_by TEXT,
      draft_updated_at TEXT,
      submitted_by TEXT,
      submitted_at TEXT,
      current_version_id TEXT,
      published_at TEXT,
      published_by TEXT,
      review_note TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_platform_policy_documents_status ON platform_policy_documents(status, updated_at);

    CREATE TABLE IF NOT EXISTS platform_policy_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      change_summary TEXT,
      created_by TEXT,
      created_by_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_by TEXT,
      approved_by_name TEXT,
      approved_at TEXT,
      is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
      FOREIGN KEY (document_id) REFERENCES platform_policy_documents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_policy_versions_doc ON platform_policy_versions(document_id, version);

    CREATE TABLE IF NOT EXISTS platform_notifications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      audience TEXT NOT NULL DEFAULT 'ALL',
      channel TEXT NOT NULL,
      template_id TEXT,
      subject TEXT NOT NULL,
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'QUEUED'
        CHECK(status IN ('QUEUED','PROCESSING','SENT','FAILED','CANCELLED','DELIVERED')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_platform_notifications_tenant ON platform_notifications(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_notifications_status ON platform_notifications(status);

    CREATE TABLE IF NOT EXISTS platform_notification_deliveries (
      id TEXT PRIMARY KEY,
      notification_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(status IN ('PENDING','SENT','FAILED','DELIVERED')),
      provider TEXT,
      external_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_platform_notification_deliveries_notification ON platform_notification_deliveries(notification_id, created_at);

    -- IP-level bans enforced globally by middleware/ipBan.js. A ban blocks every
    -- /api/v1 request originating from the address (exact IP or IPv4 CIDR),
    -- which effectively cuts the whole device off from the central platform.
    CREATE TABLE IF NOT EXISTS platform_ip_bans (
      id TEXT PRIMARY KEY,
      ip_address TEXT NOT NULL,
      reason TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      expires_at TEXT,
      banned_by TEXT,
      banned_by_name TEXT,
      lifted_at TEXT,
      lifted_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_ip_bans_active_address ON platform_ip_bans(ip_address) WHERE is_active = 1;
    CREATE INDEX IF NOT EXISTS idx_platform_ip_bans_active ON platform_ip_bans(is_active);

    -- Scheduled maintenance windows announced to tenant admins. The stored
    -- status only persists CANCELLED; SCHEDULED/ACTIVE/COMPLETED are derived
    -- from the start/end timestamps at read time.
    CREATE TABLE IF NOT EXISTS platform_maintenance_windows (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      affected_services TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      created_by TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_platform_maintenance_windows_status ON platform_maintenance_windows(status, starts_at);

    -- Per-target feature flag overrides (TENANT / PLAN / STAGING_GROUP).
    CREATE TABLE IF NOT EXISTS platform_feature_flag_overrides (
      id TEXT PRIMARY KEY,
      feature_flag_id TEXT NOT NULL,
      target_type TEXT NOT NULL
        CHECK(target_type IN ('TENANT','PLAN','STAGING_GROUP')),
      target_id TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
      custom_rollout_percent INTEGER,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(feature_flag_id, target_type, target_id),
      FOREIGN KEY (feature_flag_id) REFERENCES platform_feature_flags(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_ff_overrides_flag ON platform_feature_flag_overrides(feature_flag_id);

    -- Per-tenant rollout status for a release.
    CREATE TABLE IF NOT EXISTS platform_release_targets (
      id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(status IN ('PENDING','SUCCESS','FAILED','SKIPPED')),
      error TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      applied_at TEXT,
      deployed_at TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(release_id, tenant_id),
      FOREIGN KEY (release_id) REFERENCES platform_releases(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_platform_release_targets_release ON platform_release_targets(release_id);
    CREATE INDEX IF NOT EXISTS idx_platform_release_targets_tenant ON platform_release_targets(tenant_id);
  `);

  // Plan versioning, price history and upgrade rules — mirrors the desktop
  // schema (src/database/schema/part-19.ts + migrations/part101.ts).
  await db.exec(`
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
      effective_from TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
      change_note TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES platform_plans(id) ON DELETE CASCADE,
      UNIQUE(plan_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_plan_versions_plan ON platform_plan_versions(plan_id);
    CREATE INDEX IF NOT EXISTS idx_plan_versions_effective ON platform_plan_versions(effective_from);

    CREATE TABLE IF NOT EXISTS platform_price_history (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
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

    CREATE TABLE IF NOT EXISTS platform_plan_upgrade_rules (
      id TEXT PRIMARY KEY,
      from_plan_id TEXT NOT NULL,
      to_plan_id TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 1 CHECK(allowed IN (0,1)),
      upgrade_fee_percent REAL NOT NULL DEFAULT 0,
      requires_approval INTEGER NOT NULL DEFAULT 0 CHECK(requires_approval IN (0,1)),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_plan_id) REFERENCES platform_plans(id),
      FOREIGN KEY (to_plan_id) REFERENCES platform_plans(id),
      UNIQUE(from_plan_id, to_plan_id)
    );
    CREATE INDEX IF NOT EXISTS idx_upgrade_rules_from ON platform_plan_upgrade_rules(from_plan_id);
    CREATE INDEX IF NOT EXISTS idx_upgrade_rules_to ON platform_plan_upgrade_rules(to_plan_id);
  `);

  // Upgrade stub tables created by earlier versions (CREATE IF NOT EXISTS
  // does not add columns to existing tables).
  const ensureColumns = async (table, additions) => {
    const cols = (await db.all(`PRAGMA table_info('${table}')`)).map((c) => c.name);
    for (const [name, ddl] of additions) {
      if (!cols.includes(name)) {
        await db.exec(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
      }
    }
  };
  await ensureColumns('platform_ops_jobs', [
    ['tenant_id', 'tenant_id TEXT'],
    ['payload', 'payload TEXT'],
    ['result', 'result TEXT'],
    ['error', 'error TEXT'],
    ['attempts', 'attempts INTEGER NOT NULL DEFAULT 0'],
    ['run_at', 'run_at TEXT'],
    ['started_at', 'started_at TEXT'],
    ['finished_at', 'finished_at TEXT'],
    ['updated_at', 'updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP'],
  ]);
  await ensureColumns('platform_backups', [
    ['tenant_id', 'tenant_id TEXT'],
    ['name', 'name TEXT'],
    ['type', "type TEXT NOT NULL DEFAULT 'FULL'"],
    ['status', "status TEXT NOT NULL DEFAULT 'REQUESTED'"],
    ['size_bytes', 'size_bytes INTEGER'],
    ['storage_uri', 'storage_uri TEXT'],
    ['trigger_source', "trigger_source TEXT NOT NULL DEFAULT 'MANUAL'"],
    ['triggered_by', 'triggered_by TEXT'],
    ['notes', 'notes TEXT'],
    ['error', 'error TEXT'],
    ['checksum', 'checksum TEXT'],
    ['completed_at', 'completed_at TEXT'],
    ['expires_at', 'expires_at TEXT'],
    ['updated_at', 'updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP'],
  ]);
  await ensureColumns('platform_tenant_users', [
    ['origin', "origin TEXT NOT NULL DEFAULT 'PLATFORM'"],
  ]);
  await ensureColumns('platform_app_backups', [
    ['restore_status', "restore_status TEXT NOT NULL DEFAULT 'NONE'"],
    ['restore_requested_by', 'restore_requested_by TEXT'],
    ['restore_requested_at', 'restore_requested_at TEXT'],
    ['restore_error', 'restore_error TEXT'],
    ['restore_completed_at', 'restore_completed_at TEXT'],
  ]);
  await ensureColumns('platform_support_tickets', [
    ['remote_access_requested', 'remote_access_requested INTEGER NOT NULL DEFAULT 0'],
    ['remote_access_approved', 'remote_access_approved INTEGER NOT NULL DEFAULT 0'],
    ['remote_access_requested_at', 'remote_access_requested_at TEXT'],
    ['remote_access_approved_at', 'remote_access_approved_at TEXT'],
    ['remote_access_duration_minutes', 'remote_access_duration_minutes INTEGER'],
    ['rating', 'rating INTEGER'],
    ['feedback', 'feedback TEXT'],
    ['rated_at', 'rated_at TEXT'],
  ]);
  await ensureColumns('platform_remote_sessions', [
    ['expires_at', 'expires_at TEXT'],
  ]);
  await ensureColumns('platform_plans', [
    ['versioned', 'versioned INTEGER NOT NULL DEFAULT 0'],
    ['current_version', 'current_version INTEGER NOT NULL DEFAULT 1'],
  ]);
  // platform_signing_keys.private_key becomes nullable so externally managed
  // keys (PLATFORM_SIGNING_PRIVATE_KEY / PLATFORM_SIGNING_KEY_FILE) keep only
  // public metadata in the database. SQLite cannot drop NOT NULL via ALTER
  // TABLE, so rebuild the table when the legacy constraint is still present.
  const signingKeyColumns = await db.all(`PRAGMA table_info('platform_signing_keys')`);
  const privateKeyColumn = signingKeyColumns.find((col) => col.name === 'private_key');
  if (privateKeyColumn && privateKeyColumn.notnull) {
    try {
      await db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE platform_signing_keys_new (
          id TEXT PRIMARY KEY,
          key_id TEXT UNIQUE NOT NULL,
          private_key TEXT,
          public_key TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT
        );
        INSERT INTO platform_signing_keys_new (id, key_id, private_key, public_key, is_active, created_at, expires_at)
          SELECT id, key_id, private_key, public_key, is_active, created_at, expires_at FROM platform_signing_keys;
        DROP TABLE platform_signing_keys;
        ALTER TABLE platform_signing_keys_new RENAME TO platform_signing_keys;
        COMMIT;
      `);
    } catch (err) {
      try { await db.exec('ROLLBACK'); } catch { /* no open transaction */ }
      throw err;
    }
    console.log('Migrated platform_signing_keys: private_key is now nullable for externally managed keys');
  }

  // platform_license_changes.change_type CHECK must accept every type the admin
  // routes record (UPDATE/REACTIVATE/UNBIND were missing, making PATCH /
  // reactivate / unbind fail with SQLITE_CONSTRAINT). SQLite cannot alter a
  // CHECK, so rebuild the table when the legacy constraint is still present.
  const licenseChangesSql = (await db.get(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'platform_license_changes'`
  ))?.sql ?? '';
  if (licenseChangesSql && !licenseChangesSql.includes("'UNBIND'")) {
    try {
      await db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE platform_license_changes_new (
          id TEXT PRIMARY KEY,
          license_id TEXT NOT NULL,
          subscription_id TEXT,
          change_type TEXT NOT NULL
            CHECK(change_type IN ('ISSUE','RENEW','SUSPEND','REVOKE','TRANSFER','MODULE_CHANGE','LIMIT_CHANGE','COUPLING_CHANGE','STATUS_CHANGE','UPDATE','REACTIVATE','UNBIND')),
          old_values TEXT,
          new_values TEXT,
          actor_id TEXT,
          actor_name TEXT,
          reason TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE CASCADE,
          FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE SET NULL
        );
        INSERT INTO platform_license_changes_new
          (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason, created_at)
          SELECT id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason, created_at
          FROM platform_license_changes;
        DROP TABLE platform_license_changes;
        ALTER TABLE platform_license_changes_new RENAME TO platform_license_changes;
        COMMIT;
      `);
    } catch (err) {
      try { await db.exec('ROLLBACK'); } catch { /* no open transaction */ }
      throw err;
    }
    await db.exec('CREATE INDEX IF NOT EXISTS idx_platform_license_changes_license ON platform_license_changes(license_id, created_at)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_platform_license_changes_type ON platform_license_changes(change_type)');
    console.log('Migrated platform_license_changes: expanded change_type CHECK constraint');
  }

  await db.exec('CREATE INDEX IF NOT EXISTS idx_platform_ops_jobs_status ON platform_ops_jobs(status, created_at)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_platform_ops_jobs_tenant ON platform_ops_jobs(tenant_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_platform_backups_tenant ON platform_backups(tenant_id, created_at)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_platform_backups_status ON platform_backups(status)');

  await db.exec(`
-- 
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT
    );
-- 
    CREATE TABLE IF NOT EXISTS platform_modules (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_feature_flags (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      rollout_percentage INTEGER NOT NULL DEFAULT 0,
      target_tenants TEXT,
      page_paths TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
-- 
    CREATE TABLE IF NOT EXISTS platform_staff_sessions (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      device_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_activity_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_platform_staff_sessions_staff ON platform_staff_sessions(staff_id);

    CREATE TABLE IF NOT EXISTS platform_staff_devices (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      device_name TEXT,
      fingerprint TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      is_trusted INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(staff_id, fingerprint)
    );
    CREATE INDEX IF NOT EXISTS idx_platform_staff_devices_staff ON platform_staff_devices(staff_id);

    CREATE TABLE IF NOT EXISTS platform_staff_invites (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'SUPPORT_AGENT',
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      invited_by TEXT,
      accepted_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_platform_staff_invites_email ON platform_staff_invites(email);
-- 
    CREATE TABLE IF NOT EXISTS platform_security_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'INFO',
      actor_id TEXT,
      actor_name TEXT,
      tenant_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_platform_security_events_type ON platform_security_events(event_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_security_events_severity ON platform_security_events(severity, created_at);

    CREATE TABLE IF NOT EXISTS platform_api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      prefix TEXT,
      scopes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_used_at TEXT,
      expires_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT
    );
-- 
    CREATE TABLE IF NOT EXISTS platform_analytics_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      actor_id TEXT,
      tenant_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_platform_analytics_events_type ON platform_analytics_events(event_type, created_at);
-- 
    CREATE TABLE IF NOT EXISTS platform_emergency_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      severity TEXT NOT NULL DEFAULT 'MEDIUM',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      affected_tenants TEXT,
      actions_taken TEXT,
      resolved_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
-- 
    CREATE TABLE IF NOT EXISTS platform_sync_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      payload TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_platform_sync_events_tenant ON platform_sync_events(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_sync_events_status ON platform_sync_events(status);
-- 
    CREATE TABLE IF NOT EXISTS platform_branding (
      id TEXT PRIMARY KEY DEFAULT 'default',
      logo_url TEXT,
      primary_color TEXT,
      secondary_color TEXT,
      font_family TEXT,
      custom_css TEXT,
      login_bg_url TEXT,
      invoice_template TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS platform_customization (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      page_key TEXT NOT NULL,
      element_key TEXT NOT NULL,
      is_visible INTEGER NOT NULL DEFAULT 1,
      custom_label TEXT,
      custom_order INTEGER,
      metadata TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_platform_customization_tenant ON platform_customization(tenant_id, page_key);

    CREATE TABLE IF NOT EXISTS platform_app_config (
      id TEXT PRIMARY KEY,
      config_key TEXT NOT NULL UNIQUE,
      config_value TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS platform_activity_settings (
      id TEXT PRIMARY KEY,
      activity_type TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      settings TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
-- 
    CREATE TABLE IF NOT EXISTS platform_payment_providers (
      id TEXT PRIMARY KEY,
      provider_code TEXT NOT NULL UNIQUE,
      provider_name TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      config TEXT,
      credentials_ref TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_sms_providers (
      id TEXT PRIMARY KEY,
      provider_code TEXT NOT NULL UNIQUE,
      provider_name TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      sender_id TEXT,
      config TEXT,
      credentials_ref TEXT,
      daily_quota INTEGER NOT NULL DEFAULT 5000,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
-- 
    CREATE TABLE IF NOT EXISTS platform_admin_actions (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      executed_by TEXT,
      executed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_health_metrics (
      id TEXT PRIMARY KEY,
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL DEFAULT 0,
      metric_unit TEXT,
      status TEXT NOT NULL DEFAULT 'OK',
      details TEXT,
      recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_platform_health_metrics_recorded ON platform_health_metrics(recorded_at);

`);

  // Device-reported metrics (POST /api/v1/telemetry/metrics) are tagged with
  // the resolved tenant/device; stub tables created by earlier versions lack
  // these columns.
  await ensureColumns('platform_health_metrics', [
    ['tenant_id', 'tenant_id TEXT'],
    ['device_id', 'device_id TEXT'],
    ['device_name', 'device_name TEXT'],
  ]);
  // Tenant-scoped API keys: tenant_id NULL/'' = platform staff key (legacy
  // behaviour); a tenant id scopes the key to that customer's data only.
  await ensureColumns('platform_api_keys', [
    ['tenant_id', 'tenant_id TEXT'],
    ['key_type', "key_type TEXT NOT NULL DEFAULT 'STAFF'"],
  ]);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_platform_api_keys_tenant ON platform_api_keys(tenant_id)');
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_platform_health_metrics_device
      ON platform_health_metrics(device_id, metric_name, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_platform_health_metrics_tenant
      ON platform_health_metrics(tenant_id, metric_name, recorded_at);
  `);

  await db.exec(`

    -- ── Tenant Branding (versioned) ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS platform_tenant_branding (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      company_name TEXT,
      logo_url TEXT,
      logo_dark_url TEXT,
      favicon_url TEXT,
      primary_color TEXT,
      secondary_color TEXT,
      accent_color TEXT,
      font_family TEXT,
      invoice_template TEXT,
      login_background_url TEXT,
      login_welcome_title TEXT,
      login_welcome_subtitle TEXT,
      email_header_logo TEXT,
      email_footer_text TEXT,
      custom_subdomain TEXT,
      allowed_customizations TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT,
      UNIQUE(tenant_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_platform_tenant_branding_tenant ON platform_tenant_branding(tenant_id, version DESC);

    -- ── Tenant UI Customization (versioned) ────────────────────────────────
    CREATE TABLE IF NOT EXISTS platform_ui_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      hidden_pages TEXT,
      hidden_actions TEXT,
      custom_labels TEXT,
      form_field_rules TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_tenant_ui_customization (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      profile_id TEXT,
      hidden_pages TEXT,
      hidden_actions TEXT,
      custom_labels TEXT,
      form_field_rules TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT,
      UNIQUE(tenant_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_platform_tenant_ui_tenant ON platform_tenant_ui_customization(tenant_id, version DESC);

    -- ── Tenant App Configuration (versioned + templates + rollouts) ────────
    CREATE TABLE IF NOT EXISTS platform_config_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      config_payload TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_tenant_config (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      template_id TEXT,
      config_payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT,
      UNIQUE(tenant_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_platform_tenant_config_tenant ON platform_tenant_config(tenant_id, version DESC);

    CREATE TABLE IF NOT EXISTS platform_config_rollouts (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      target_tenants TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_config_acks (
      id TEXT PRIMARY KEY,
      rollout_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      device_id TEXT,
      acked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      config_version INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_platform_config_acks_rollout ON platform_config_acks(rollout_id, tenant_id);

    -- ── Tenant Activity Settings (versioned) ───────────────────────────────
    CREATE TABLE IF NOT EXISTS platform_tenant_activity (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      activity_id TEXT NOT NULL,
      enabled_modules TEXT,
      custom_terminology TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT,
      UNIQUE(tenant_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_platform_tenant_activity_tenant ON platform_tenant_activity(tenant_id, version DESC);

    -- ── Platform Staff (extended for admin control) ────────────────────────
    CREATE TABLE IF NOT EXISTS platform_staff_extended (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'SUPPORT_AGENT',
      is_active INTEGER NOT NULL DEFAULT 1,
      permissions TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    -- ── Analytics Aggregates (materialized views for performance) ──────────
    CREATE TABLE IF NOT EXISTS platform_analytics_daily (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      metric_type TEXT NOT NULL,
      metric_value REAL NOT NULL,
      dimensions TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, metric_type, dimensions)
    );
`);

  console.log('Tables created successfully');
}

const BUILT_IN_PLATFORM_ROLES = {
  SUPER_ADMIN: {
    name: 'مالك المنصة (Platform Owner)',
    description: 'وصول مطلق لجميع شاشات وإعدادات وقواعد بيانات المنصة.',
  },
  PLATFORM_ADMIN: {
    name: 'مدير المنصة (Platform Administrator)',
    description: 'إدارة تشغيلية عليا للمنصة دون المساس بحساب المالك.',
  },
  SUPPORT_AGENT: {
    name: 'موظف دعم فني (Support Specialist)',
    description: 'متابعة تذاكر العملاء والوصول عن بُعد بإذن العميل وصحة الأجهزة.',
  },
  OPERATIONS_ENGINEER: {
    name: 'مهندس عمليات وبنية تحتية (DevOps Engineer)',
    description: 'مهام العمليات والصيانة والنسخ الاحتياطي والمزامنة والخوادم.',
  },
  BILLING_SPECIALIST: {
    name: 'أخصائي الفواتير والاشتراكات (Billing & Subscriptions)',
    description: 'إدارة وتوليد الفواتير ومتابعة المدفوعات والاشتراكات.',
  },
  LICENSE_MANAGER: {
    name: 'مسؤول التراخيص وتفعيل الأجهزة (License Administrator)',
    description: 'إصدار وتجديد التراخيص وإلغاء وربط مقاعد الأجهزة وكشف الاستنساخ.',
  },
};

/**
 * Seed the permission catalog, built-in roles, default matrices and one-off
 * backfills. Idempotent; operator edits made through the RBAC matrix UI are
 * never overwritten (a role's matrix is only seeded while it is empty).
 */
async function seedPlatformRBAC() {
  for (let i = 0; i < PLATFORM_PERMISSION_CATALOG.length; i += 1) {
    const permission = PLATFORM_PERMISSION_CATALOG[i];
    await db.run(
      `INSERT INTO platform_permissions (code, module, action, name, is_special, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         module = excluded.module,
         action = excluded.action,
         name = excluded.name,
         is_special = excluded.is_special,
         sort_order = excluded.sort_order`,
      [permission.code, permission.module, permission.action, permission.name, permission.special ? 1 : 0, i]
    );
  }

  const legacyCodes = [
    ['staff:read', 'staff', 'read', 'عرض موظفي المنصة (صلاحية قديمة)'],
    ['staff:manage', 'staff', 'manage', 'إدارة موظفي المنصة (صلاحية قديمة)'],
    ['platform.tenants.manage', 'tenants', 'manage', 'إدارة عملاء المنصة (صلاحية قديمة)'],
    ['platform.licenses.manage', 'licenses', 'manage', 'إصدار وإدارة التراخيص (صلاحية قديمة)'],
    ['platform.billing.manage', 'billing', 'manage', 'إدارة الفواتير والمدفوعات (صلاحية قديمة)'],
    ['platform.plans.manage', 'plans', 'manage', 'إدارة خطط الاشتراك (صلاحية قديمة)'],
    ['platform.product.manage', 'product', 'manage', 'إدارة وحدات ومزايا المنتج (صلاحية قديمة)'],
    ['platform.settings.manage', 'settings', 'manage', 'إدارة إعدادات المنصة (صلاحية قديمة)'],
  ];
  for (const [code, module, action, name] of legacyCodes) {
    await db.run(
      `INSERT OR IGNORE INTO platform_permissions (code, module, action, name, is_special, sort_order)
       VALUES (?, ?, ?, ?, 1, 9999)`,
      [code, module, action, name]
    );
  }

  for (const [code, def] of Object.entries(BUILT_IN_PLATFORM_ROLES)) {
    await db.run(
      `INSERT INTO platform_roles (id, code, name, description, is_system, updated_at)
       VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(code) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         is_system = 1,
         updated_at = CURRENT_TIMESTAMP`,
      [code, code, def.name, def.description]
    );
  }

  const defaultMatrices = { ...PLATFORM_ROLE_DEFAULT_PERMISSIONS };
  if (Array.isArray(defaultMatrices.PLATFORM_ADMIN)) {
    defaultMatrices.PLATFORM_ADMIN = [...defaultMatrices.PLATFORM_ADMIN, 'staff:read', 'staff:manage'];
  }
  for (const [roleCode, permissions] of Object.entries(defaultMatrices)) {
    const row = await db.get('SELECT COUNT(*) AS count FROM platform_role_permissions WHERE role_code = ?', [roleCode]);
    if (Number(row?.count || 0) > 0) continue;
    for (const permissionCode of permissions) {
      await db.run(
        'INSERT OR IGNORE INTO platform_role_permissions (role_code, permission_code) VALUES (?, ?)',
        [roleCode, permissionCode]
      );
    }
  }

  await db.run(
    `INSERT OR IGNORE INTO platform_user_roles (user_id, role_code)
     SELECT id, role FROM platform_users
     WHERE role IS NOT NULL AND role IN (SELECT code FROM platform_roles)`
  );

  const backfillMarker = await db.get(`SELECT value FROM platform_rbac_meta WHERE key = 'user_permissions_backfill_v1'`);
  if (!backfillMarker) {
    const users = await db.all('SELECT id, permissions FROM platform_users');
    let migrated = 0;
    for (const user of users) {
      let legacyList = [];
      try {
        legacyList = JSON.parse(user.permissions || '[]');
      } catch {
        continue;
      }
      if (!Array.isArray(legacyList)) continue;
      for (const permissionCode of legacyList) {
        if (permissionCode === '*') continue;
        await db.run(
          `INSERT OR IGNORE INTO platform_user_permissions (user_id, permission_code, effect) VALUES (?, ?, 'GRANT')`,
          [user.id, String(permissionCode)]
        );
        migrated += 1;
      }
    }
    await db.run(`INSERT OR REPLACE INTO platform_rbac_meta (key, value) VALUES ('user_permissions_backfill_v1', ?)`, [String(migrated)]);
    console.log(`Backfilled ${migrated} individual permission exception(s) from legacy JSON`);
  }

  const counts = await db.get(
    `SELECT
       (SELECT COUNT(*) FROM platform_permissions) AS permissions,
       (SELECT COUNT(*) FROM platform_role_permissions) AS role_permissions,
       (SELECT COUNT(*) FROM platform_roles) AS roles,
       (SELECT COUNT(*) FROM platform_user_roles) AS user_roles`
  );
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_feature_config (
      tenant_id TEXT,
      plan_id TEXT,
      hidden_menus TEXT NOT NULL DEFAULT '[]',
      disabled_permissions TEXT NOT NULL DEFAULT '[]',
      feature_permissions TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, plan_id)
    );
  `);
  await db.exec(`
    -- حدود صلاحيات على مستوى المنصة لكل مستأجر (المرحلة 4 من توحيد الصلاحيات).
    -- المنصة تقيّد ولا توسّع: disabled=1 يمنع كليًا، max_amount سقف صلب
    -- لا يمكن تجاوزه حتى باعتماد محلي، وcost_visible/profit_visible=0
    -- يمنع كشف البيانات الحساسة مهما مُنحت الصلاحية محليًا.
    CREATE TABLE IF NOT EXISTS tenant_permission_limits (
      tenant_id TEXT NOT NULL,
      permission_code TEXT NOT NULL,
      max_amount REAL,
      cost_visible INTEGER,
      profit_visible INTEGER,
      disabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, permission_code)
    );
  `);

  console.log(
    `Platform RBAC seeded: ${counts.permissions} permissions, ${counts.roles} roles, ` +
    `${counts.role_permissions} role→permission grants, ${counts.user_roles} user→role assignments`
  );
}

const AUDIT_GENESIS_HASH = 'GENESIS_ZERO_HASH_00000000000000000000000000000000';

function computeAuditHash(row) {
  const crypto = require('crypto');
  const payload = [
    row.prevHash,
    row.id,
    row.sequence,
    row.actorType || '',
    row.actorId || '',
    row.actorName || '',
    row.tenantId || '',
    row.action,
    row.resourceType || '',
    row.resourceId || '',
    row.beforeData || '',
    row.afterData || '',
    row.createdAt,
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Upgrade the central audit table to an append-only, tamper-evident hash chain.
 * Runs before triggers are re-created so legacy rows can be backfilled once.
 */
async function migrateAuditChain() {
  const tableExists = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'platform_audit_events'`
  );
  if (!tableExists) return;

  await db.exec('DROP TRIGGER IF EXISTS platform_audit_events_no_update');
  await db.exec('DROP TRIGGER IF EXISTS platform_audit_events_no_delete');

  const columns = (await db.all(`PRAGMA table_info('platform_audit_events')`)).map((col) => col.name);
  const addColumn = async (name, ddl) => {
    if (!columns.includes(name)) {
      await db.exec(`ALTER TABLE platform_audit_events ADD COLUMN ${ddl}`);
      console.log(`Migrated platform_audit_events: added column ${name}`);
    }
  };
  await addColumn('sequence', 'sequence INTEGER');
  await addColumn('prev_hash', 'prev_hash TEXT');
  await addColumn('record_hash', 'record_hash TEXT');

  const rows = await db.all(
    `SELECT id, sequence, actor_type, actor_id, actor_name, tenant_id, action,
            resource_type, resource_id, before_data, after_data, created_at, prev_hash, record_hash
     FROM platform_audit_events
     ORDER BY created_at ASC, id ASC`
  );

  let previousHash = AUDIT_GENESIS_HASH;
  let sequence = 0;
  let backfilled = 0;
  for (const row of rows) {
    sequence += 1;
    if (!row.record_hash) {
      const next = {
        id: row.id,
        sequence,
        actorType: row.actor_type,
        actorId: row.actor_id,
        actorName: row.actor_name,
        tenantId: row.tenant_id,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        beforeData: row.before_data,
        afterData: row.after_data,
        createdAt: row.created_at,
        prevHash: previousHash,
      };
      next.recordHash = computeAuditHash(next);
      await db.run(
        `UPDATE platform_audit_events
         SET sequence = ?, prev_hash = ?, record_hash = ?
         WHERE id = ?`,
        [sequence, previousHash, next.recordHash, row.id]
      );
      previousHash = next.recordHash;
      backfilled += 1;
    } else {
      previousHash = row.record_hash;
      if (row.sequence && row.sequence > sequence) sequence = row.sequence;
    }
  }
  if (backfilled) console.log(`Backfilled audit hash chain for ${backfilled} legacy event(s)`);

  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_audit_events_sequence ON platform_audit_events(sequence)`);
  await db.exec(`
    CREATE TRIGGER platform_audit_events_no_update
    BEFORE UPDATE ON platform_audit_events
    BEGIN
      SELECT RAISE(ABORT, 'platform_audit_events is append-only');
    END;
  `);
  await db.exec(`
    CREATE TRIGGER platform_audit_events_no_delete
    BEFORE DELETE ON platform_audit_events
    BEGIN
      SELECT RAISE(ABORT, 'platform_audit_events is append-only');
    END;
  `);
}

/**
 * Development-only bootstrap: first platform user and a default plan.
 * Production requires secure onboarding instead of a default credential.
 */
async function bootstrapDefaults(options = {}) {
  const userCount = await db.get('SELECT COUNT(*) as count FROM platform_users');
  if (userCount.count === 0) {
    if (process.env.NODE_ENV !== 'production') {
      const initialPassword = options.initialPassword || process.env.INITIAL_ADMIN_PASSWORD || 'admin123';
      const userId = `usr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const passwordHash = await bcrypt.hash(initialPassword, 10);
      await db.run(
        `INSERT INTO platform_users (id, username, password_hash, full_name, email, role) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, 'admin', passwordHash, 'System Administrator', 'admin@ceramisys.local', 'SUPER_ADMIN']
      );
      console.warn(`[SECURITY WARNING] Initial platform user created in non-production mode (${initialPassword === 'admin123' ? 'default password used' : 'custom password'}). Set INITIAL_ADMIN_PASSWORD in production.`);
    } else {
      console.warn('[SECURITY NOTICE] platform_users table is empty. Bootstrap required via secure onboarding.');
    }
  }

  const planCount = await db.get('SELECT COUNT(*) as count FROM platform_plans');
  if (planCount.count === 0) {
    const planId = `plan_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    await db.run(
      `INSERT INTO platform_plans
        (id, code, name, description, billing_cycle, price, monthly_price, yearly_price, currency, seats_limit, branches_limit,
         devices_limit, storage_limit_mb, max_products, max_warehouses, trial_days, included_modules, features, permissions,
         offline_grace_period_days, is_active, is_default, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [planId, 'STANDARD', 'الخطة القياسية', 'خطة اشتراك قياسية للمعارض الصغيرة والمتوسطة', 'YEARLY', 5000, 500, 5000, 'EGP', 5, 3, 5, 1000, 10000, 5, 14, '["sales","inventory","pos"]', '["reports","dashboard"]', '[]', 14, 1, 1, 10]
    );
    console.log('Created default plan: STANDARD');
  }
}

module.exports = {
  getDb,
  setDb,
  initDatabase,
  createTables,
  migratePlatformIdentityTables,
  migrateAuditChain,
  seedPlatformRBAC,
  bootstrapDefaults,
  BUILT_IN_PLATFORM_ROLES,
  AUDIT_GENESIS_HASH,
  computeAuditHash,
};
