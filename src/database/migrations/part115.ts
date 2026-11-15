import type { Migration } from './support';
import { tableExists } from './support';
import {
  PLATFORM_PERMISSION_CATALOG,
  PLATFORM_ROLE_DEFAULT_PERMISSIONS,
} from '../../services/domains/platform/platformPermissionCatalog';

/**
 * Platform RBAC v2 (Super Admin hardening):
 *  - platform_permissions / platform_role_permissions: granular, database-backed
 *    role → permission matrix (page/button-level enforcement).
 *  - platform_staff: must_change_password, logical-delete (deleted_at),
 *    data_scope, invited_by.
 *  - platform_staff_invites: time-limited staff invitation tokens.
 *  - platform_trusted_devices: per-staff trusted device registry.
 *  - platform_staff_scopes: per-staff tenant data scope when data_scope='LIMITED'.
 *  - platform_settings seeds: platform_mfa_enforcement ('off' | 'optional' | 'required').
 *
 * Idempotent: safe to re-run on existing databases. Default matrices reproduce
 * the pre-existing effective capabilities of each built-in role.
 */
export const MIGRATION_PART_115: Migration = {
  id: '200_platform_rbac_v2',
  description: 'Granular platform RBAC matrix, staff security (MFA/invites/devices/data-scope/soft-delete) and RBAC catalog seed.',
  up: (db) => {
    // ── 1. Granular permission catalog ─────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_permissions (
        code        TEXT PRIMARY KEY,
        module      TEXT NOT NULL,
        action      TEXT NOT NULL,
        name        TEXT NOT NULL,
        is_special  INTEGER NOT NULL DEFAULT 0 CHECK(is_special IN (0, 1)),
        sort_order  INTEGER NOT NULL DEFAULT 0
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS platform_role_permissions (
        role_code       TEXT NOT NULL,
        permission_code TEXT NOT NULL,
        PRIMARY KEY (role_code, permission_code)
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_platform_role_permissions_code ON platform_role_permissions(permission_code)`);

    for (let i = 0; i < PLATFORM_PERMISSION_CATALOG.length; i += 1) {
      const permission = PLATFORM_PERMISSION_CATALOG[i];
      db.run(
        `INSERT OR IGNORE INTO platform_permissions (code, module, action, name, is_special, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [permission.code, permission.module, permission.action, permission.name, permission.special ? 1 : 0, i],
      );
    }

    // Seed the built-in role matrices only when missing, so operator edits made
    // through the RBAC matrix UI are never overwritten by a re-run.
    for (const [roleCode, permissions] of Object.entries(PLATFORM_ROLE_DEFAULT_PERMISSIONS)) {
      const existing = db.exec(
        `SELECT COUNT(*) FROM platform_role_permissions WHERE role_code = ?`,
        [roleCode],
      )[0]?.values?.[0]?.[0];
      if (Number(existing ?? 0) > 0) continue;
      for (const permissionCode of permissions) {
        db.run(
          `INSERT OR IGNORE INTO platform_role_permissions (role_code, permission_code) VALUES (?, ?)`,
          [roleCode, permissionCode],
        );
      }
    }

    // ── 2. platform_staff extensions ───────────────────────────────────────────
    const staffColumns = db.exec(`PRAGMA table_info('platform_staff')`)[0]?.values || [];
    const staffHas = (column: string) => staffColumns.some((col) => col[1] === column);
    if (!staffHas('must_change_password')) {
      db.run(`ALTER TABLE platform_staff ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`);
    }
    if (!staffHas('deleted_at')) {
      db.run(`ALTER TABLE platform_staff ADD COLUMN deleted_at TEXT`);
    }
    if (!staffHas('data_scope')) {
      db.run(`ALTER TABLE platform_staff ADD COLUMN data_scope TEXT NOT NULL DEFAULT 'ALL'`);
    }
    if (!staffHas('invited_by')) {
      db.run(`ALTER TABLE platform_staff ADD COLUMN invited_by TEXT`);
    }
    db.run(`CREATE INDEX IF NOT EXISTS idx_platform_staff_deleted ON platform_staff(deleted_at)`);

    // ── 3. Staff invitations ───────────────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_staff_invites (
        id           TEXT PRIMARY KEY,
        email        TEXT NOT NULL,
        full_name    TEXT NOT NULL,
        phone        TEXT,
        role         TEXT NOT NULL DEFAULT 'SUPPORT_AGENT'
                     CHECK(role IN ('SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER')),
        token_hash   TEXT NOT NULL,
        expires_at   TEXT NOT NULL,
        invited_by   TEXT,
        accepted_at  TEXT,
        revoked_at   TEXT,
        created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_platform_staff_invites_email ON platform_staff_invites(email)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_platform_staff_invites_expiry ON platform_staff_invites(expires_at)`);

    // ── 4. Trusted devices ─────────────────────────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_trusted_devices (
        id           TEXT PRIMARY KEY,
        staff_id     TEXT NOT NULL,
        device_name  TEXT,
        fingerprint  TEXT NOT NULL,
        last_seen_at TEXT,
        revoked_at   TEXT,
        created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (staff_id, fingerprint)
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_platform_trusted_devices_staff ON platform_trusted_devices(staff_id)`);

    // ── 5. Tenant data scope per staff member ──────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_staff_scopes (
        staff_id  TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        PRIMARY KEY (staff_id, tenant_id)
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_platform_staff_scopes_tenant ON platform_staff_scopes(tenant_id)`);

    // ── 6. MFA enforcement policy (off | optional | required) ──────────────────
    const mfaRow = db.exec(`SELECT value FROM platform_settings WHERE key = 'platform_mfa_enforcement'`)[0]?.values?.[0]?.[0];
    if (mfaRow === undefined || mfaRow === null) {
      db.run(
        `INSERT OR IGNORE INTO platform_settings (key, value) VALUES ('platform_mfa_enforcement', 'off')`,
      );
    }

    // ── 7. Seed legacy manage-style platform permission codes still used by ────
    // older rows/role_permissions (kept for backward compatibility, not listed
    // in the matrix).
    if (tableExists(db, 'platform_permissions')) {
      const legacyCodes: Array<[string, string, string, string]> = [
        ['platform.tenants.manage', 'tenants', 'manage', 'إدارة عملاء المنصة'],
        ['platform.licenses.manage', 'licenses', 'manage', 'إصدار وإدارة التراخيص'],
        ['platform.billing.manage', 'billing', 'manage', 'إدارة الفواتير والمدفوعات'],
        ['platform.plans.manage', 'plans', 'manage', 'إدارة خطط الاشتراك'],
        ['platform.product.manage', 'product', 'manage', 'إدارة وحدات ومزايا المنتج'],
        ['platform.settings.manage', 'settings', 'manage', 'إدارة إعدادات المنصة'],
      ];
      for (const [code, module, action, name] of legacyCodes) {
        db.run(
          `INSERT OR IGNORE INTO platform_permissions (code, module, action, name, is_special, sort_order)
           VALUES (?, ?, ?, ?, 1, 9999)`,
          [code, module, action, name],
        );
      }
    }
  },
};
