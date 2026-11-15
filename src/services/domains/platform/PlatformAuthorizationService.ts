import type { PlatformStaff, PlatformStaffRole, PlatformStaffRoleDefinition } from './platformTypes';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import {
  PLATFORM_ROLE_DEFAULT_PERMISSIONS,
  PLATFORM_ALL_PERMISSION,
  PLATFORM_PERMISSION_SECTIONS,
} from './platformPermissionCatalog';

export const PLATFORM_ROLE_DEFINITIONS: Record<PlatformStaffRole, PlatformStaffRoleDefinition> = {
  SUPER_ADMIN: {
    role: 'SUPER_ADMIN',
    title: 'مالك المنصة (Platform Owner)',
    description: 'وصول مطلق لجميع شاشات وإعدادات المنصة وقواعد البيانات والاشتراكات والتراخيص وحسابات الموظفين.',
    allowedModules: ['*'],
    restrictedModules: [],
  },
  PLATFORM_ADMIN: {
    role: 'PLATFORM_ADMIN',
    title: 'مدير المنصة (Platform Administrator)',
    description: 'إدارة تشغيلية عليا للمنصة، إعدادات المنتجات، مراقبة الخوادم، دون صلاحية المساس بحساب المالك.',
    allowedModules: [
      'overview', 'tenants', 'subscriptions', 'licenses', 'plans', 'billing',
      'product', 'releases', 'audit', 'settings', 'activity', 'operations',
      'branding', 'customization', 'app-configuration', 'system-health',
      'platform-health', 'support', 'devices', 'admin-control', 'security-center',
      'analytics', 'sync', 'backups', 'integrations', 'notifications', 'policies',
      'emergency', 'customer-portal', 'staff'
    ],
    restrictedModules: ['staff.delete_owner', 'super-admin'],
  },
  SUPPORT_AGENT: {
    role: 'SUPPORT_AGENT',
    title: 'موظف دعم فني (Support Specialist)',
    description: 'استعراض والرد على تذاكر العملاء، تشغيل جلسات الوصول عن بعد بموافقة العميل، استعراض صحة الأجهزة.',
    allowedModules: [
      'overview', 'support', 'devices', 'system-health', 'platform-health',
      'tenants', 'sync', 'notifications', 'customer-portal'
    ],
    restrictedModules: [
      'billing', 'plans', 'licenses.issue', 'settings', 'staff',
      'releases', 'operations', 'security-center', 'emergency', 'policies', 'super-admin'
    ],
  },
  OPERATIONS_ENGINEER: {
    role: 'OPERATIONS_ENGINEER',
    title: 'مهندس عمليات وبنية تحتية (DevOps Engineer)',
    description: 'متابعة مهام العمليات، جداول الصيانة، المزامنة، الخوادم والنسخ الاحتياطي.',
    allowedModules: [
      'overview', 'operations', 'system-health', 'platform-health', 'devices',
      'app-configuration', 'sync', 'backups', 'integrations', 'notifications', 'emergency'
    ],
    restrictedModules: ['billing', 'plans', 'licenses.issue', 'staff', 'super-admin'],
  },
  BILLING_SPECIALIST: {
    role: 'BILLING_SPECIALIST',
    title: 'أخصائي الفواتير والاشتراكات (Billing & Subscriptions)',
    description: 'إدارة وتوليد الفواتير، متابعة المدفوعات، تحصيل المبالغ والاشتراكات دون صلاحية البنية التحتية.',
    allowedModules: [
      'overview', 'billing', 'plans', 'subscriptions', 'tenants', 'analytics', 'customer-portal'
    ],
    restrictedModules: [
      'operations', 'system-health', 'licenses.issue', 'staff', 'security-center',
      'backups', 'emergency', 'app-configuration', 'releases', 'super-admin'
    ],
  },
  LICENSE_MANAGER: {
    role: 'LICENSE_MANAGER',
    title: 'مسؤول التراخيص وتفعيل الأجهزة (License Administrator)',
    description: 'إصدار وتجديد التراخيص، إلغاء وربط مقاعد الأجهزة، كشف الاستنساخ.',
    allowedModules: [
      'overview', 'licenses', 'devices', 'tenants', 'subscriptions', 'sync'
    ],
    restrictedModules: [
      'billing', 'operations', 'staff', 'backups', 'security-center', 'emergency',
      'settings', 'super-admin'
    ],
  },
};

/**
 * Legacy route → module mapping (kept for backward compatibility).
 */
export const PLATFORM_ROUTE_MODULE_MAP: Record<string, string> = {
  '/platform': 'overview',
  '/platform/tenants': 'tenants',
  '/platform/subscriptions': 'subscriptions',
  '/platform/licenses': 'licenses',
  '/platform/billing': 'billing',
  '/platform/plans': 'plans',
  '/platform/staff': 'staff',
  '/platform/roles': 'staff',
  '/platform/releases': 'releases',
  '/platform/product': 'product',
  '/platform/audit': 'audit',
  '/platform/settings': 'settings',
  '/platform/activity': 'activity',
  '/platform/operations': 'operations',
  '/platform/branding': 'branding',
  '/platform/customization': 'customization',
  '/platform/app-configuration': 'app-configuration',
  '/platform/system-health': 'system-health',
  '/platform/platform-health': 'platform-health',
  '/platform/support': 'support',
  '/platform/devices': 'devices',
  '/platform/admin-control': 'admin-control',
  '/platform/security-center': 'security-center',
  '/platform/analytics': 'analytics',
  '/platform/sync': 'sync',
  '/platform/backups': 'backups',
  '/platform/integrations': 'integrations',
  '/platform/notifications': 'notifications',
  '/platform/policies': 'policies',
  '/platform/emergency': 'emergency',
  '/platform/customer-portal': 'customer-portal',
  '/platform/super-admin': 'super-admin',
};

/**
 * Route → required granular permission (page-level guard). Evaluated before the
 * legacy module mapping; anything unmapped falls back to `platform.${module}.view`
 * and ultimately to the legacy module rule, so access is never widened by accident.
 */
export const PLATFORM_ROUTE_PERMISSION_MAP: Record<string, string> = {
  '/platform': 'platform.overview.view',
  '/platform/tenants': 'platform.tenants.view',
  '/platform/subscriptions': 'platform.subscriptions.view',
  '/platform/licenses': 'platform.licenses.view',
  '/platform/billing': 'platform.billing.view',
  '/platform/plans': 'platform.plans.view',
  '/platform/staff': 'platform.staff.view',
  '/platform/roles': 'platform.staff.manage_permissions',
  '/platform/releases': 'platform.releases.view',
  '/platform/product': 'platform.product.view',
  '/platform/audit': 'platform.audit.view',
  '/platform/settings': 'platform.settings.view',
  '/platform/activity': 'platform.activity.view',
  '/platform/operations': 'platform.operations.view',
  '/platform/branding': 'platform.branding.view',
  '/platform/customization': 'platform.customization.view',
  '/platform/app-configuration': 'platform.app-configuration.view',
  '/platform/system-health': 'platform.system-health.view',
  '/platform/platform-health': 'platform.platform-health.view',
  '/platform/support': 'platform.support.view',
  '/platform/devices': 'platform.devices.view',
  '/platform/admin-control': 'platform.admin-control.view',
  '/platform/security-center': 'platform.security.view',
  '/platform/analytics': 'platform.analytics.view',
  '/platform/sync': 'platform.sync.view',
  '/platform/backups': 'platform.backups.view',
  '/platform/integrations': 'platform.integrations.view',
  '/platform/notifications': 'platform.notifications.view',
  '/platform/policies': 'platform.policies.view',
  '/platform/emergency': 'platform.emergency.view',
  '/platform/customer-portal': 'platform.customer-portal.view',
  '/platform/super-admin': 'platform.super-admin.view',
};

export const PLATFORM_PERMISSION_SECTIONS_FOR_UI = PLATFORM_PERMISSION_SECTIONS;

/** In-memory cache of role → permission codes; invalidated on writes. */
let rolePermissionsCache: Map<string, string[]> | null = null;

export function invalidatePlatformRolePermissionsCache(): void {
  rolePermissionsCache = null;
}

export class PlatformAuthorizationService {
  // ─── RBAC v2 (granular, database-backed matrix) ─────────────────────────────

  /** Read the stored permission codes for a platform role (from the matrix table). */
  public static getRolePermissions(role: string): string[] {
    if (rolePermissionsCache?.has(role)) {
      return rolePermissionsCache.get(role)!;
    }
    try {
      const db = DatabaseManager.getInstance();
      const rows = db.query<{ permissionCode: string }>(
        'SELECT permission_code AS permissionCode FROM platform_role_permissions WHERE role_code = ?',
        [role],
      );
      const codes = rows.map((r) => String(r.permissionCode));
      if (!rolePermissionsCache) rolePermissionsCache = new Map();
      rolePermissionsCache.set(role, codes);
      return codes;
    } catch {
      // Table not migrated yet — fall back to the built-in defaults so the app
      // keeps working before the migration runs (e.g. first boot).
      const fallback = PLATFORM_ROLE_DEFAULT_PERMISSIONS[role] ?? [];
      return [...fallback];
    }
  }

  /** True when the role holds the wildcard or the exact permission code. */
  public static roleHasPermission(role: string, permissionCode: string, permissionsOverride: string[] = []): boolean {
    if (role === 'SUPER_ADMIN') return true;
    const effective = new Set([...PlatformAuthorizationService.getRolePermissions(role), ...permissionsOverride]);
    return effective.has(PLATFORM_ALL_PERMISSION) || effective.has(permissionCode);
  }

  /**
   * Canonical authorization check for a single granular permission code.
   * SUPER_ADMIN always passes. Unknown codes only pass for SUPER_ADMIN or roles
   * holding the wildcard (deny-by-default).
   */
  public static canAccessPermission(role: string, permissionCode: string, permissionsOverride: string[] = []): boolean {
    return PlatformAuthorizationService.roleHasPermission(role, permissionCode, permissionsOverride);
  }

  /** Check against the route's required permission, falling back to legacy module rule. */
  public static canAccessRouteGranular(role: string, routePath: string, permissionsOverride: string[] = []): boolean {
    const required = PLATFORM_ROUTE_PERMISSION_MAP[routePath];
    if (required) {
      return PlatformAuthorizationService.canAccessPermission(role, required, permissionsOverride);
    }
    return PlatformAuthorizationService.canAccessRoute(role, routePath, permissionsOverride);
  }

  /** Matrix read/write for the RBAC administration UI. */
  public static listRolePermissionMatrix(): Record<string, string[]> {
    const matrix: Record<string, string[]> = {};
    for (const role of Object.keys(PLATFORM_ROLE_DEFAULT_PERMISSIONS)) {
      matrix[role] = PlatformAuthorizationService.getRolePermissions(role);
    }
    return matrix;
  }

  public static setRolePermissions(role: string, permissionCodes: string[]): void {
    if (!PLATFORM_ROLE_DEFAULT_PERMISSIONS[role]) {
      throw new Error('دور منصة غير معروف.');
    }
    if (role === 'SUPER_ADMIN') {
      // SUPER_ADMIN always keeps the wildcard; the matrix UI can render it as locked.
      permissionCodes = [PLATFORM_ALL_PERMISSION];
    }
    const db = DatabaseManager.getInstance();
    db.run('DELETE FROM platform_role_permissions WHERE role_code = ?', [role]);
    for (const code of permissionCodes) {
      db.run(
        'INSERT OR IGNORE INTO platform_role_permissions (role_code, permission_code) VALUES (?, ?)',
        [role, code],
      );
    }
    invalidatePlatformRolePermissionsCache();
  }

  // ─── Legacy module-level checks (kept for backward compatibility) ───────────

  /**
   * Check if a staff member or user has access to a specific platform module or permission.
   */
  public static canAccessModule(role: PlatformStaffRole | string, targetModule: string, permissionsOverride: string[] = []): boolean {
    if (role === 'SUPER_ADMIN') return true;

    // Exact granular codes pass through the new matrix as well.
    if (targetModule.startsWith('platform.')) {
      return PlatformAuthorizationService.canAccessPermission(role, targetModule, permissionsOverride);
    }

    const roleDef = PLATFORM_ROLE_DEFINITIONS[role as PlatformStaffRole];
    if (!roleDef) return false;

    // Explicitly restricted modules take highest priority unless overridden
    if (roleDef.restrictedModules.includes(targetModule)) {
      if (permissionsOverride.includes(targetModule) || permissionsOverride.includes('*')) {
        return true;
      }
      return false;
    }

    // Check wildcard access
    if (roleDef.allowedModules.includes('*') || permissionsOverride.includes('*')) {
      return true;
    }

    // Check specific module or permission override
    if (roleDef.allowedModules.includes(targetModule) || permissionsOverride.includes(targetModule)) {
      return true;
    }

    // A role that holds ANY granular permission for this module is allowed to open it.
    const modulePrefix = `platform.${targetModule}.`;
    const granted = PlatformAuthorizationService.getRolePermissions(role);
    if (granted.includes(PLATFORM_ALL_PERMISSION) || granted.some((code) => code.startsWith(modulePrefix))) {
      return true;
    }

    return false;
  }

  /**
   * Check if a staff member can access a given platform path.
   */
  public static canAccessRoute(role: PlatformStaffRole | string, routePath: string, permissionsOverride: string[] = []): boolean {
    const targetModule = PLATFORM_ROUTE_MODULE_MAP[routePath] || 'overview';
    return this.canAccessModule(role, targetModule, permissionsOverride);
  }

  /**
   * Retrieve platform staff profile for an email or user ID.
   */
  public static getStaffByEmail(email: string): PlatformStaff | null {
    const db = DatabaseManager.getInstance();
    const row = db.query<any>('SELECT * FROM platform_staff WHERE email = ? AND is_active = 1 AND deleted_at IS NULL', [email.toLowerCase().trim()])[0];
    if (!row) return null;
    return {
      id: String(row.id),
      fullName: String(row.fullName),
      email: String(row.email),
      phone: row.phone ?? null,
      role: row.role as PlatformStaffRole,
      permissionsOverride: row.permissionsOverride ? JSON.parse(row.permissionsOverride) : [],
      isActive: Boolean(row.isActive),
      lastLoginAt: row.lastLoginAt ?? null,
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    };
  }
}
