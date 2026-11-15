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
    await db.exec('CREATE INDEX IF NOT EXISTS idx_platform_users_deleted ON platform_users(deleted_at)');
  }

  if (await tableExists('platform_roles')) {
    const roleColumns = (await db.all(`PRAGMA table_info('platform_roles')`)).map((col) => col.name);
    await addColumnIfMissing('platform_roles', roleColumns, 'code', `code TEXT`);
    await addColumnIfMissing('platform_roles', roleColumns, 'is_system', `is_system INTEGER NOT NULL DEFAULT 0`);
    await addColumnIfMissing('platform_roles', roleColumns, 'updated_at', `updated_at TEXT`);
    await db.exec('UPDATE platform_roles SET code = id WHERE code IS NULL');
    await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_roles_code ON platform_roles(code)');
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
      private_key TEXT NOT NULL,
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
