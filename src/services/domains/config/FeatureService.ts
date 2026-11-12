import { SettingsService } from './SettingsService';
import { PermissionService } from '../auth/PermissionService';
import { AuthService } from '../auth/AuthService';
import { ModuleRegistryService } from './ModuleRegistryService';
import { FEATURE_REGISTRY, type FeatureDefinition } from '../../../config/featureRegistry';
import type { User } from '../../../types';

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

  public static resolve(id: string, user?: User | null, _context?: { branchId?: string } | null): FeatureResolution {
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
