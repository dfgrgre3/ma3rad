import { SettingsService } from './SettingsService';
import { PermissionService } from './PermissionService';
import { AuthService } from './AuthService';
import { ModuleRegistryService } from './ModuleRegistryService';
import type { User } from '../types';

export interface FeatureDefinition {
  id: string;
  label: string;
  module?: string;
  /** Permission codes that grant access. Empty means no permission gate. */
  permissions: string[];
  /** Feature flags default to available; entitlements default to true. */
  defaultEntitled?: boolean;
}

export interface FeatureResolution {
  id: string;
  label: string;
  available: boolean;
  entitled: boolean;
  enabled: boolean;
  permitted: boolean;
  allowed: boolean;
  reason: string;
}

export const FEATURE_REGISTRY: readonly FeatureDefinition[] = [
  { id: 'core.erp', label: 'النظام الأساسي', permissions: ['dashboard.view'] },
  { id: 'module.sales', label: 'المبيعات', module: 'sales', permissions: ['sales.view'] },
  { id: 'module.inventory', label: 'المخزون', module: 'inventory', permissions: ['inventory.view'] },
  { id: 'module.customers', label: 'العملاء', module: 'customers', permissions: ['customers.view'] },
  { id: 'module.purchasing', label: 'المشتريات', module: 'purchasing', permissions: ['purchases.view'] },
  { id: 'module.finance', label: 'الحسابات', module: 'finance', permissions: ['finance.view'] },
  { id: 'module.operations', label: 'العمليات', module: 'operations', permissions: ['operations.view'] },
  { id: 'module.manufacturing', label: 'التصنيع', module: 'manufacturing', permissions: ['manufacturing.view'] },
  { id: 'module.approvals', label: 'الموافقات', module: 'approvals', permissions: ['approvals.view'] },
  { id: 'module.crm', label: 'علاقات العملاء', module: 'crm', permissions: ['crm.view'] },
  { id: 'module.projects', label: 'المشاريع', module: 'projects', permissions: ['projects.view'] },
  { id: 'module.restaurant', label: 'المطعم', module: 'restaurant', permissions: ['sales.view'] },
  { id: 'feature.pos.offline', label: 'نقطة بيع غير متصلة', module: 'sales', permissions: ['sales.create'], defaultEntitled: true },
  { id: 'feature.reports.export', label: 'تصدير التقارير', permissions: ['reports.export'], defaultEntitled: true },
  { id: 'feature.branch.sync', label: 'مزامنة الفروع', permissions: ['admin.view'], defaultEntitled: true },
] as const;

export class FeatureService {
  private static readEntitlements(): Record<string, boolean> {
    try {
      const raw = SettingsService.getValue('featureEntitlements');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const result: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(parsed)) {
        result[String(key)] = value === true || value === 1 || value === '1' || value === 'true';
      }
      return result;
    } catch {
      return {};
    }
  }

  private static writeEntitlements(next: Record<string, boolean>, actor?: User | null): void {
    const user = actor ?? AuthService.requireAuth();
    PermissionService.require(user, 'settings.update');
    SettingsService.update({ featureEntitlements: JSON.stringify(next) } as any, user);
  }

  public static getDefinition(id: string): FeatureDefinition | undefined {
    return FEATURE_REGISTRY.find((feature) => feature.id === id);
  }

  public static list(): FeatureDefinition[] {
    return [...FEATURE_REGISTRY];
  }

  public static setEntitled(id: string, entitled: boolean, actor?: User | null): void {
    if (!FeatureService.getDefinition(id)) throw new Error('ميزة غير مسجلة: ' + id);
    const current = FeatureService.readEntitlements();
    current[id] = entitled;
    FeatureService.writeEntitlements(current, actor);
  }

  public static resolve(id: string, user?: User | null, context?: { branchId?: string } | null): FeatureResolution {
    const definition = FeatureService.getDefinition(id);
    const subject = user ?? AuthService.getCurrentUser();
    if (!definition) {
      return {
        id, label: id, available: false, entitled: false, enabled: false, permitted: false, allowed: false,
        reason: 'ميزة غير مسجلة.',
      };
    }
    const available = definition.module ? ModuleRegistryService.isModuleEnabled(definition.module) : true;
    const entitlements = FeatureService.readEntitlements();
    const entitled = entitlements[id] === undefined
      ? (definition.defaultEntitled ?? true)
      : entitlements[id] === true;
    const permitted = definition.permissions.length === 0
      || definition.permissions.every((permission) => PermissionService.can(subject, permission));
    const enabled = available && entitled && permitted;
    let reason = '';
    if (!available) reason = 'الوحدة المرتبطة غير مفعّلة.';
    else if (!entitled) reason = 'الميزة غير متاحة في الترخيص (الاشتراك).';
    else if (!permitted) reason = 'لا توجد صلاحية لاستخدام هذه الميزة.';
    return {
      id,
      label: definition.label,
      available,
      entitled,
      enabled,
      permitted,
      allowed: enabled,
      reason,
    };
  }

  public static isAllowed(id: string, user?: User | null): boolean {
    return FeatureService.resolve(id, user).allowed;
  }
}
