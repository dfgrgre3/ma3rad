import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { writeAuditLog } from '../../security/auditWriter';
import { CentralFeaturePermissionService } from '../../licensing/CentralFeaturePermissionService';
import type { User } from '../../../../types';
import {
  GRANULAR_LEGACY_ALIASES,
  GRANULAR_LEGACY_MAP,
  PAGE_VIEW_PERMISSIONS,
} from '../../../../config/permissionMatrix';
import {
  ALL,
  ROLE_DEFAULTS,
  EMPLOYEE_PERMISSION_ALIASES,
} from './catalog';

/** Alphabetical comparator backed by String.localeCompare for deterministic text sorts. */
const compareAlphabetically = (a: string, b: string) => a.localeCompare(b, 'ar');

export class PermissionChecker {
  public static cache: Map<string, { grants: Set<string>; denies: Set<string> }> | null = null;

  private static audit(
    actor: User | null | undefined,
    action: string,
    module: string,
    recordId: string | null,
    oldValues: unknown,
    newValues: unknown
  ): void {
    try {
      writeAuditLog({
        userId: actor?.id || 'system',
        userName: actor?.fullName || 'النظام',
        action,
        module,
        recordId: recordId || undefined,
        oldValues: oldValues == null ? undefined : JSON.stringify(oldValues),
        newValues: newValues == null ? undefined : JSON.stringify(newValues),
      });
    } catch {
      // auditing must never break the operation
    }
  }

  public static loadSets(user: User | null): { grants: Set<string>; denies: Set<string> } {
    if (!user) return { grants: new Set(), denies: new Set() };

    if (PermissionChecker.cache && PermissionChecker.cache.has(user.id)) {
      return PermissionChecker.cache.get(user.id)!;
    }

    // ADMIN always has everything and cannot be locked out.
    if (user.role === 'ADMIN') {
      const sets = { grants: new Set<string>(ALL), denies: new Set<string>() };
      PermissionChecker.cache = PermissionChecker.cache || new Map();
      PermissionChecker.cache.set(user.id, sets);
      return sets;
    }

    const db = DatabaseManager.getInstance();
    let roleCodes: string[] = [];
    let loadedFromDb = false;
    try {
      roleCodes = db
        .query<{ permissionCode: string }>(
          'SELECT permission_code AS permissionCode FROM role_permissions WHERE role_code = ?',
          [user.role]
        )
        .map((r) => r.permissionCode);
      loadedFromDb = true;
    } catch {
      // table may not exist in edge cases; fall back to built-in defaults
    }
    if (!loadedFromDb) {
      roleCodes = [...(ROLE_DEFAULTS[user.role] || [])];
    }

    const grants = new Set<string>(roleCodes);
    const denies = new Set<string>();
    try {
      const rows = db.query<{ code: string; effect: string }>(
        `SELECT permission_code AS code, COALESCE(effect, 'GRANT') AS effect
         FROM user_permissions WHERE user_id = ?`,
        [user.id]
      );
      for (const r of rows) {
        if (String(r.effect).toUpperCase() === 'DENY') denies.add(r.code);
        else grants.add(r.code);
      }
    } catch {
      // ignore — role defaults still apply
    }

    const sets = { grants, denies };
    PermissionChecker.cache = PermissionChecker.cache || new Map();
    PermissionChecker.cache.set(user.id, sets);
    return sets;
  }

  public static getEffectiveCodes(user: User | null): string[] {
    if (!user) return [];
    return Array.from(PermissionChecker.loadSets(user).grants).sort(compareAlphabetically);
  }

  public static can(user: User | null, required: string, scope?: string): boolean {
    if (!user) return false;
    // القيود المنشورة من منصة الإدارة المركزية تتقدّم على صلاحيات الأدوار،
    // فتُخفى الأزرار/الإجراءات تلقائياً في كل واجهة تعتمد على هذه الطبقة.
    if (!CentralFeaturePermissionService.allowsPermission(required, scope)) return false;
    return PermissionChecker.hasRoleGrant(user, required);
  }

  /**
   * فحص صلاحية الدور فقط (بدون قيود الصفحة المركزية). يُستخدم في طبقة
   * الخدمات لأن قيود المنصة مرتبطة بمسار الواجهة الحالي، وربطها بعمليات
   * خلفية (مزامنة/تقارير) قد يمنع أعمالًا مشروعة.
   */
  public static hasRoleGrant(user: User | null, required: string): boolean {
    if (!user) return false;
    const { grants, denies } = PermissionChecker.loadSets(user);
    const [mod] = required.split('.');
    // A user-level DENY always wins — including over role wildcards
    // ('sales.*' or '*'), which are the broadest grants a role can carry.
    const legacyDenyCodes = [
      ...(GRANULAR_LEGACY_MAP[required] ? [GRANULAR_LEGACY_MAP[required]] : []),
      ...(GRANULAR_LEGACY_ALIASES[required] ?? []),
      ...(EMPLOYEE_PERMISSION_ALIASES[required] ?? []),
    ];
    if (
      denies.has(required)
      || denies.has(`${mod}.*`)
      || denies.has('*')
      || legacyDenyCodes.some((legacy) => denies.has(legacy) || denies.has(`${legacy.split('.')[0]}.*`))
    ) return false;
    if (grants.has(required)) return true;
    // توافق خلفي: الصلاحية الدقيقة الجديدة تُمنح إذا كان الدور يملك الكود
    // الأساسي المكافئ (قبل الترقية). DENY الصريح على الصلاحية الدقيقة يبقى
    // له الأولوية لأنه فُحص أعلاه.
    const legacyCodes = [
      ...(GRANULAR_LEGACY_MAP[required] ? [GRANULAR_LEGACY_MAP[required]] : []),
      ...(GRANULAR_LEGACY_ALIASES[required] ?? []),
      ...(EMPLOYEE_PERMISSION_ALIASES[required] ?? []),
    ];
    for (const legacy of legacyCodes) {
      if (grants.has(legacy)) return true;
      const legacyModule = legacy.split('.')[0];
      if (grants.has(`${legacyModule}.*`)) return true;
    }
    // wildcard support: 'sales.*' grants all sales.* permissions
    return grants.has(`${mod}.*`) || grants.has('*');
  }

  public static canAny(user: User | null, required: string[], scope?: string): boolean {
    return required.some((code) => PermissionChecker.can(user, code, scope));
  }

  /**
   * صلاحية «عرض الصفحة» الدقيقة المقابلة لمسار ما (إن وُجدت).
   * تدعم المسارات الديناميكية مثل /products/:id عبر مطابقة النمط.
   */
  public static getPagePermission(pathname: string): string | null {
    if (!pathname) return null;
    let best: { path: string; permission: string } | null = null;
    for (const [route, permission] of Object.entries(PAGE_VIEW_PERMISSIONS)) {
      let matched = route === pathname;
      if (!matched && route.includes(':')) {
        // مطابقة الأنماط الديناميكية: /products/:id أو /customers/:id/imported-products
        matched = new RegExp(`^${route.replace(/:[^/]+/g, '[^/]+')}$`).test(pathname);
      } else if (!matched) {
        matched = pathname.startsWith(`${route}/`);
      }
      if (!matched) continue;
      // نختار دائماً أدق مسار (الأطول) حتى يفوز /products/:id على /products.
      if (!best || route.length > best.path.length) best = { path: route, permission };
    }
    return best?.permission ?? null;
  }

  public static canAccessPage(user: User | null, pathname: string, scope?: string): boolean {
    const permission = PermissionChecker.getPagePermission(pathname);
    if (!permission) return true;
    return PermissionChecker.can(user, permission, scope ?? pathname);
  }

  public static requirePage(user: User | null, pathname: string): void {
    const permission = PermissionChecker.getPagePermission(pathname);
    if (permission) PermissionChecker.require(user, permission, pathname);
  }

  /** Server-side (service-layer) enforcement — never trust the UI. */
  public static require(user: User | null, required: string, scope?: string): void {
    const locallyAllowed = PermissionChecker.hasRoleGrant(user, required);
    const centrallyDisabled = CentralFeaturePermissionService.isPermissionDisabled(required);
    const pageAllowed = scope === undefined || CentralFeaturePermissionService.allowsPermission(required, scope);
    if (!locallyAllowed || centrallyDisabled || !pageAllowed) {
      PermissionChecker.audit(
        user,
        'محاولة وصول مرفوضة',
        'SECURITY',
        `perm:${required}`,
        null,
        { required, path: scope ?? null }
      );
      throw new Error(`غير مصرح لك بتنفيذ هذا الإجراء (الصلاحية المطلوبة: ${required}).`);
    }
  }

  /** Require any one of several permission codes (least-privilege alternatives). */
  public static requireAny(user: User | null, required: string[], scope?: string): void {
    if (required.length === 0) throw new Error('لم تُحدد صلاحية مطلوبة.');
    const allowed = required.some((code) =>
      PermissionChecker.hasRoleGrant(user, code)
      && !CentralFeaturePermissionService.isPermissionDisabled(code)
      && (scope === undefined || CentralFeaturePermissionService.allowsPermission(code, scope))
    );
    if (!allowed) {
      const codes = required.join(' أو ');
      PermissionChecker.audit(
        user,
        'محاولة وصول مرفوضة',
        'SECURITY',
        `perm:${codes}`,
        null,
        { required: codes, path: scope ?? null }
      );
      throw new Error(`غير مصرح لك بتنفيذ هذا الإجراء (الصلاحية المطلوبة: ${codes}).`);
    }
  }

  public static invalidate(user?: User): void {
    if (user && PermissionChecker.cache) PermissionChecker.cache.delete(user.id);
    else PermissionChecker.cache = null;
  }
}

