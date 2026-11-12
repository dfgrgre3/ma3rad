import type { Role, User } from '../../../types';
import type { PermissionDef, PermissionEffect } from './permissions/types';
import {
  PERMISSIONS,
  BASE_PERMISSIONS,
  ROLE_DEFAULTS,
  ROLE_NAMES,
  EMPLOYEE_PERMISSION_ALIASES,
} from './permissions/catalog';
import { PermissionSeeder } from './permissions/permissionSeeder';
import { RolePermissionService } from './permissions/rolePermissionService';
import { UserPermissionService } from './permissions/userPermissionService';
import { PermissionChecker } from './permissions/permissionChecker';

// Re-export types and constants for backwards compatibility
export type { PermissionDef, PermissionEffect };
export { PERMISSIONS, BASE_PERMISSIONS, ROLE_DEFAULTS, ROLE_NAMES, EMPLOYEE_PERMISSION_ALIASES };

export class PermissionService {
  /** Idempotently populate the permissions catalog and seed built-in roles. */
  public static seed(): void {
    PermissionSeeder.seed();
    PermissionChecker.invalidate();
  }

  // ─── Catalog & roles ────────────────────────────────────────────────────────

  public static getCatalog(): PermissionDef[] {
    return PERMISSIONS;
  }

  public static getModules(): string[] {
    return Array.from(new Set(PERMISSIONS.map((p) => p.module)));
  }

  /** تجميع الكتالوج حسب الوحدة ثم الصفحة — يخدم مصفوفة الأدوار الضخمة. */
  public static getCatalogGroups(): Array<{
    module: string;
    groups: Array<{ name: string; permissions: PermissionDef[] }>;
  }> {
    const modules = new Map<string, Map<string, PermissionDef[]>>();
    for (const permission of PERMISSIONS) {
      const groupName = permission.group || permission.module;
      const groups = modules.get(permission.module) ?? new Map<string, PermissionDef[]>();
      const list = groups.get(groupName) ?? [];
      list.push(permission);
      groups.set(groupName, list);
      modules.set(permission.module, groups);
    }
    return Array.from(modules.entries()).map(([module, groups]) => ({
      module,
      groups: Array.from(groups.entries())
        .map(([name, permissions]) => ({
          name,
          permissions: [...permissions].sort((a, b) => a.code.localeCompare(b.code)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    }));
  }

  public static getPermission(code: string): PermissionDef | undefined {
    return PERMISSIONS.find((permission) => permission.code === code);
  }

  public static isKnownPermission(code: string): boolean {
    return PermissionService.getPermission(code) !== undefined;
  }

  /** عدد الصلاحيات الكلي في الكتالوج (أساسية + دقيقة). */
  public static getCatalogSize(): number {
    return PERMISSIONS.length;
  }

  /** أسماء عربية مقروءة لوحدات الصلاحيات، تُستخدم في مصفوفة الأدوار. */
  public static getModuleLabels(): Record<string, string> {
    return {
      DASHBOARD: 'لوحة المعلومات',
      PRODUCTS: 'المنتجات',
      CATEGORIES: 'التصنيفات',
      BRANDS: 'الماركات',
      INVENTORY: 'المخزون',
      SALES: 'المبيعات ونقطة البيع',
      QUOTATIONS: 'عروض الأسعار',
      ORDERS: 'طلبات البيع',
      RETURNS: 'المرتجعات',
      PURCHASES: 'المشتريات',
      CUSTOMERS: 'العملاء',
      SUPPLIERS: 'الموردون',
      CASHIER: 'الخزينة والكاشير',
      FINANCE: 'المالية والمحاسبة',
      REPORTS: 'التقارير',
      CRM: 'علاقات العملاء',
      MANUFACTURING: 'التصنيع',
      PROJECTS: 'المشاريع',
      PRICING: 'التسعير',
      PROMOTIONS: 'العروض والخصومات',
      OPERATIONS: 'العمليات',
      BRANCHES: 'الفروع',
      WAREHOUSES: 'المخازن',
      EMPLOYEES: 'الموظفون والرواتب',
      DELIVERIES: 'التوصيل',
      DRIVERS: 'السائقون',
      VEHICLES: 'المركبات',
      APPROVALS: 'الموافقات',
      NOTIFICATIONS: 'الإشعارات',
      USERS: 'المستخدمون',
      ROLES: 'الأدوار والصلاحيات',
      SESSIONS: 'الجلسات',
      SECURITY: 'الأمان',
      SETTINGS: 'الإعدادات',
      AUDIT: 'سجل التدقيق',
      ADMIN: 'الإدارة والنظام',
      E_INVOICING: 'الفاتورة الإلكترونية',
      LOYALTY: 'برنامج الولاء',
      ANALYTICS: 'التحليلات',
      MODULES: 'وحدات الأعمال',
      COMPANIES: 'الشركات',
      DOCUMENTS: 'المستندات',
      CONTRACTS: 'العقود',
      HR: 'الموارد البشرية',
    };
  }

  public static getRoles(): Role[] {
    return RolePermissionService.getRoles();
  }

  public static getRolePermissions(roleCode: string): string[] {
    return RolePermissionService.getRolePermissions(roleCode);
  }

  public static setRolePermissions(roleCode: string, codes: string[], actor?: User | null): void {
    RolePermissionService.setRolePermissions(
      roleCode,
      codes,
      actor,
      () => PermissionChecker.invalidate(),
      (a, c) => PermissionChecker.require(a, c)
    );
  }

  public static createRole(input: { code: string; name: string; description?: string }, actor?: User | null): Role {
    return RolePermissionService.createRole(
      input,
      actor,
      (a, c) => PermissionChecker.require(a, c)
    );
  }

  public static updateRole(id: string, patch: { name?: string; description?: string }, actor?: User | null): void {
    RolePermissionService.updateRole(
      id,
      patch,
      actor,
      (a, c) => PermissionChecker.require(a, c)
    );
  }

  public static deleteRole(id: string, actor?: User | null): void {
    RolePermissionService.deleteRole(
      id,
      actor,
      () => PermissionChecker.invalidate(),
      (a, c) => PermissionChecker.require(a, c)
    );
  }

  // ─── Per-user overrides ─────────────────────────────────────────────────────

  public static getUserOverrides(userId: string): { code: string; effect: PermissionEffect }[] {
    return UserPermissionService.getUserOverrides(userId);
  }

  public static setUserOverride(
    userId: string,
    permissionCode: string,
    effect: PermissionEffect | null,
    actor?: User | null
  ): void {
    UserPermissionService.setUserOverride(
      userId,
      permissionCode,
      effect,
      actor,
      () => PermissionChecker.invalidate(),
      (a, c) => PermissionChecker.require(a, c)
    );
  }

  public static clearUserOverrides(userId: string, actor?: User | null): void {
    UserPermissionService.clearUserOverrides(
      userId,
      actor,
      () => PermissionChecker.invalidate(),
      (a, c) => PermissionChecker.require(a, c)
    );
  }

  // ─── Effective permission resolution ────────────────────────────────────────

  public static getEffectiveCodes(user: User | null): string[] {
    return PermissionChecker.getEffectiveCodes(user);
  }

  public static can(user: User | null, required: string, scope?: string): boolean {
    return PermissionChecker.can(user, required, scope);
  }

  public static hasRoleGrant(user: User | null, required: string): boolean {
    return PermissionChecker.hasRoleGrant(user, required);
  }

  public static canAny(user: User | null, required: string[], scope?: string): boolean {
    return PermissionChecker.canAny(user, required, scope);
  }

  public static getPagePermission(pathname: string): string | null {
    return PermissionChecker.getPagePermission(pathname);
  }

  public static canAccessPage(user: User | null, pathname: string, scope?: string): boolean {
    return PermissionChecker.canAccessPage(user, pathname, scope);
  }

  public static requirePage(user: User | null, pathname: string): void {
    PermissionChecker.requirePage(user, pathname);
  }

  public static require(user: User | null, required: string, scope?: string): void {
    PermissionChecker.require(user, required, scope);
  }

  public static requireAny(user: User | null, required: string[], scope?: string): void {
    PermissionChecker.requireAny(user, required, scope);
  }

  public static invalidate(user?: User): void {
    PermissionChecker.invalidate(user);
  }
}
