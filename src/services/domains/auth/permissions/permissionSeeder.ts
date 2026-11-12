import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { GRANULAR_PERMISSIONS } from '../../../../config/permissionMatrix';
import {
  PERMISSIONS,
  ROLE_NAMES,
  ROLE_DEFAULTS,
  RECEIVABLE_PERMISSION_BACKFILL,
  PERMISSION_BACKFILL_SOURCES,
  EXPORT_PERMISSION_SOURCES,
  MANAGER_RESTRICTED,
  ALL,
} from './catalog';

export class PermissionSeeder {
  /** Idempotently populate the permissions catalog and seed built-in roles. */
  public static seed(): void {
    const db = DatabaseManager.getInstance();
    PermissionSeeder.seedPermissionCatalog(db);
    PermissionSeeder.seedBuiltInRoles(db);
    PermissionSeeder.seedRoleDefaults(db);
    // الأدوار المخصصة التي أُنشئت قبل الترقية تحتاج أيضاً إلى الصلاحيات الدقيقة.
    PermissionSeeder.backfillAllRolesGranular(db);
  }

  public static seedPermissionCatalog(db: DatabaseManager): void {
    const existing = new Set(db.query<{ code: string }>('SELECT code FROM permissions').map((r) => r.code));
    for (const p of PERMISSIONS) {
      if (!existing.has(p.code)) {
        db.run(
          'INSERT INTO permissions (id, code, name, module, description) VALUES (?, ?, ?, ?, ?)',
          [`perm_${p.code}`, p.code, p.name, p.module, '']
        );
      }
    }
  }

  public static seedBuiltInRoles(db: DatabaseManager): void {
    for (const [code, name] of Object.entries(ROLE_NAMES)) {
      db.run(
        `INSERT OR IGNORE INTO roles (id, code, name, description, is_system)
         VALUES (?, ?, ?, ?, 1)`,
        [`role_${code.toLowerCase()}`, code, name, '']
      );
    }
  }

  public static seedRoleDefaults(db: DatabaseManager): void {
    // Seed built-in role defaults exactly once. A persistent marker (not the
    // row count) is used so an admin can intentionally clear every permission
    // from a role without the defaults coming back on the next boot.
    for (const [roleCode, defaults] of Object.entries(ROLE_DEFAULTS)) {
      const markerKey = `rbac.seeded.${roleCode}`;
      const seeded = db.query('SELECT value FROM system_settings WHERE key = ?', [markerKey]);
      if (seeded.length > 0) {
        PermissionSeeder.reconcileSeededRole(db, roleCode, defaults);
        continue;
      }
      for (const perm of defaults) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          [roleCode, perm]
        );
      }
      db.run(
        `INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, '1')`,
        [markerKey]
      );
      PermissionSeeder.backfillPartnerPermissions(db, roleCode);
    }
  }

  public static reconcileSeededRole(db: DatabaseManager, roleCode: string, defaults: string[]): void {
    if (roleCode === 'ADMIN') {
      PermissionSeeder.ensureAdminDataPermissions(db);
    }
    if (roleCode === 'MANAGER') {
      PermissionSeeder.reconcileManagerPermissions(db, defaults);
      PermissionSeeder.backfillInventoryCountApproval(db);
    }
    PermissionSeeder.backfillRecruitmentPermissions(db, roleCode);
    PermissionSeeder.backfillExportPermissions(db, roleCode);
    PermissionSeeder.backfillReceivablesPermissions(db, roleCode);
    PermissionSeeder.backfillPermissionMappings(db, roleCode);
    PermissionSeeder.backfillPartnerPermissions(db, roleCode);
    PermissionSeeder.backfillGranularPermissions(db, roleCode);
  }

  /**
   * ترقية غير هدّامة: كل دور يملك صلاحية أساسية قديمة يحصل تلقائياً على
   * الصلاحيات الدقيقة المشتقة منها (عرض صفحة/قسم/زر). الصلاحيات التدميرية
   * لا تُمنح تلقائياً أبداً خارج ADMIN، وتبقى قراراً صريحاً من المدير.
   */
  public static backfillGranularPermissions(db: DatabaseManager, roleCode: string): void {
    const markerKey = `rbac.granular.v1.${roleCode}`;
    if (db.query('SELECT 1 FROM system_settings WHERE key = ?', [markerKey]).length) return;

    if (roleCode === 'ADMIN') {
      for (const permission of GRANULAR_PERMISSIONS) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          [roleCode, permission.code]
        );
      }
      db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
      return;
    }

    const current = new Set(
      db.query<{ permissionCode: string }>(
        'SELECT permission_code AS permissionCode FROM role_permissions WHERE role_code = ?',
        [roleCode]
      ).map((row) => row.permissionCode)
    );

    for (const permission of GRANULAR_PERMISSIONS) {
      if (permission.destructive) continue;
      const matched = (permission.legacy && current.has(permission.legacy))
        || (permission.legacyAliases ?? []).some((alias) => current.has(alias));
      if (matched) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          [roleCode, permission.code]
        );
      }
    }

    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
  }

  /** يطبّق ترقية الصلاحيات الدقيقة على كل الأدوار الموجودة (بما فيها المخصصة). */
  public static backfillAllRolesGranular(db: DatabaseManager): void {
    const roles = db.query<{ code: string }>('SELECT code FROM roles');
    for (const role of roles) {
      PermissionSeeder.backfillGranularPermissions(db, role.code);
    }
  }

  public static backfillPartnerPermissions(db: DatabaseManager, roleCode: string): void {
    const markerKey = `rbac.partnerPermissions.v2.${roleCode}`;
    if (db.query('SELECT 1 FROM system_settings WHERE key = ?', [markerKey]).length) return;
    const sources: Record<string, string[]> = {
      'partners.view': ['finance.view'],
      'partners.manage': ['finance.approve'],
      'partners.transactions': ['finance.approve'],
      'partners.profits.distribute': ['finance.approve'],
      'partners.adjust': ['finance.approve'],
      'partners.reverse': ['finance.approve'],
      'partners.export': ['finance.view'],
      'partners.print': ['finance.view'],
    };
    for (const [permission, required] of Object.entries(sources)) {
      const granted = roleCode === 'ADMIN' || required.some((source) =>
        db.query(
          'SELECT 1 FROM role_permissions WHERE role_code = ? AND permission_code = ?',
          [roleCode, source]
        ).length > 0
      );
      if (granted) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          [roleCode, permission]
        );
      }
    }
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
  }

  public static backfillReceivablesPermissions(db: DatabaseManager, roleCode: string): void {
    const markerKey = `rbac.receivablesPermissions.v1.${roleCode}`;
    if (db.query('SELECT 1 FROM system_settings WHERE key = ?', [markerKey]).length) return;
    for (const permission of RECEIVABLE_PERMISSION_BACKFILL[roleCode] || []) {
      db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', [roleCode, permission]);
    }
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
  }

  public static backfillPermissionMappings(db: DatabaseManager, roleCode: string): void {
    const markerKey = `rbac.permissionMappings.v1.${roleCode}`;
    if (db.query('SELECT 1 FROM system_settings WHERE key = ?', [markerKey]).length) return;
    for (const [newPermission, sources] of Object.entries(PERMISSION_BACKFILL_SOURCES)) {
      // Destructive (delete) grants are full-access capabilities and must never
      // be propagated through legacy coarse-grained sources for built-in roles.
      if (MANAGER_RESTRICTED.has(newPermission)) continue;
      const hasSource = sources.length === 0
        ? false
        : sources.some((source) => db.query('SELECT 1 FROM role_permissions WHERE role_code = ? AND permission_code = ?', [roleCode, source]).length > 0);
      if (hasSource) {
        db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', [roleCode, newPermission]);
      }
    }
    if (roleCode === 'ADMIN') {
      for (const permission of Object.keys(PERMISSION_BACKFILL_SOURCES)) {
        db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', [roleCode, permission]);
      }
    }
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
  }

  public static backfillExportPermissions(db: DatabaseManager, roleCode: string): void {
    const markerKey = `rbac.exportBackfill.v2.${roleCode}`;
    const done = db.query('SELECT value FROM system_settings WHERE key = ?', [markerKey]);
    if (done.length > 0) return;
    for (const [exportCode, viewCode] of Object.entries(EXPORT_PERMISSION_SOURCES)) {
      const hasView = db.query(
        'SELECT 1 FROM role_permissions WHERE role_code = ? AND permission_code = ?',
        [roleCode, viewCode]
      ).length > 0;
      if (hasView) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          [roleCode, exportCode]
        );
      }
    }
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
  }

  public static ensureAdminDataPermissions(db: DatabaseManager): void {
    for (const permission of [
      'admin.data.export', 'admin.data.delete', 'inventory.count.approve',
      'inventory.adjustment.approve', 'inventory.adjustment.post',
      'inventory.transfer.workflow.approve', 'inventory.transfer.execute', 'inventory.transfer.receive',
    ]) {
      db.run(
        'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
        ['ADMIN', permission]
      );
    }
  }

  public static backfillRecruitmentPermissions(db: DatabaseManager, roleCode: string): void {
    const markerKey = `rbac.recruitmentPermissions.v1.${roleCode}`;
    if (db.query('SELECT 1 FROM system_settings WHERE key = ?', [markerKey]).length) return;
    if (roleCode === 'ADMIN') {
      db.run(
        'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
        ['ADMIN', 'hr.recruitment.view']
      );
      db.run(
        'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
        ['ADMIN', 'hr.recruitment.manage']
      );
    } else if (roleCode === 'MANAGER') {
      const current = new Set(db.query<{ permissionCode: string }>(
        'SELECT permission_code AS permissionCode FROM role_permissions WHERE role_code = ?',
        [roleCode]
      ).map((row) => row.permissionCode));
      if (current.has('employees.view')) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          ['MANAGER', 'hr.recruitment.view']
        );
      }
      if (current.has('employees.manage')) {
        db.run(
          'INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
          ['MANAGER', 'hr.recruitment.manage']
        );
      }
    }
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
  }

  public static backfillInventoryCountApproval(db: DatabaseManager): void {
    const markerKey = 'rbac.inventoryCountApprovalBackfill.v1';
    if (db.query('SELECT 1 FROM system_settings WHERE key = ?', [markerKey]).length) return;
    const qualified = ['inventory.count', 'inventory.adjust', 'approvals.view'].every((permission) =>
      db.query('SELECT 1 FROM role_permissions WHERE role_code = ? AND permission_code = ?', ['MANAGER', permission]).length > 0
    );
    if (qualified) db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', ['MANAGER', 'inventory.count.approve']);
    db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [markerKey, '1']);
  }

  public static reconcileManagerPermissions(db: DatabaseManager, defaults: string[]): void {
    const roleCode = 'MANAGER';
    const current = db.query<{ permissionCode: string }>(
      'SELECT permission_code AS permissionCode FROM role_permissions WHERE role_code = ?',
      [roleCode]
    ).map((row) => row.permissionCode);
    const legacyPermissions = ALL.filter((permission) =>
      permission !== 'admin.data.export' && permission !== 'admin.data.delete'
    );
    const retainsOriginalFullGrant =
      (current.length === ALL.length && ALL.every((permission) => current.includes(permission))) ||
      (current.length === legacyPermissions.length && legacyPermissions.every((permission) => current.includes(permission)));
    db.executeTransaction(() => {
      if (retainsOriginalFullGrant) {
        db.run('DELETE FROM role_permissions WHERE role_code = ?', [roleCode]);
        // أعد اشتقاق الصلاحيات الدقيقة بعد إعادة الضبط حتى يبقى المدير على
        // الصلاحيات الأساسية + ما يُشتق منها فقط.
        db.run('DELETE FROM system_settings WHERE key = ?', [`rbac.granular.v1.${roleCode}`]);
        for (const permission of defaults) {
          db.run(
            'INSERT INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
            [roleCode, permission]
          );
        }
      } else {
        // Keep view/export grants for customized managers, but strip deletion.
        db.run('DELETE FROM role_permissions WHERE role_code = ? AND permission_code = ?', [roleCode, 'admin.data.delete']);
        db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', [roleCode, 'admin.data']);
        db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', [roleCode, 'admin.data.export']);
      }
    });
  }
}

