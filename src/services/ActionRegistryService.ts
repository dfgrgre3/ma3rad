import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { ModuleRegistryService } from './ModuleRegistryService';
import { FeatureService } from './FeatureService';
import { AppConfigService } from './AppConfigService';
import { ACTION_REGISTRY, getActionDefinition, isKnownAction, type ActionDefinition } from '../config/actionRegistry';
import type { User } from '../types';

export interface ResolvedAction {
  id: string;
  label: string;
  visible: boolean;
  enabled: boolean;
  allowed: boolean;
  reason: string;
  confirm: boolean;
  sensitive: boolean;
  definition: ActionDefinition | undefined;
}

export class ActionRegistryService {
  public static list(): ActionDefinition[] {
    return [...ACTION_REGISTRY];
  }

  public static resolve(id: string, user?: User | null): ResolvedAction {
    const definition = getActionDefinition(id);
    const subject = user ?? AuthService.getCurrentUser();
    if (!definition) {
      return {
        id, label: id, visible: false, enabled: false, allowed: false,
        reason: 'إجراء غير مسجل.', confirm: false, sensitive: true, definition: undefined,
      };
    }

    const entry = AppConfigService.getEntry('action', id);
    const visible = entry ? entry.enabled : true;
    const label = entry && entry.label ? entry.label : definition.label;

    const extraPermissions = Array.isArray(entry?.props?.permissions)
      ? (entry!.props.permissions as unknown[]).map(String)
      : [];
    const extraRoles = Array.isArray(entry?.props?.roles)
      ? (entry!.props.roles as unknown[]).map(String)
      : [];
    const requiredModule = typeof entry?.props?.module === 'string' && entry.props.module.trim()
      ? entry.props.module.trim()
      : definition.module;
    const featureId = typeof entry?.props?.featureId === 'string' && entry.props.featureId.trim()
      ? entry.props.featureId.trim()
      : definition.featureId;

    const moduleEnabled = requiredModule ? ModuleRegistryService.isModuleEnabled(requiredModule) : true;
    const featureAllowed = featureId ? FeatureService.isAllowed(featureId, subject) : true;
    const permissionAllowed = [...definition.permissions, ...extraPermissions]
      .every((permission) => PermissionService.can(subject, permission));
    const roleAllowed = extraRoles.length === 0 || extraRoles.includes(String(subject?.role ?? ''));
    const confirm = entry?.props?.confirm === undefined
      ? (definition.confirmByDefault ?? false)
      : entry.props.confirm === true || entry.props.confirm === 'true' || entry.props.confirm === 1;
    const sensitive = definition.sensitive ?? false;

    let reason = '';
    if (!visible) reason = 'الإجراء مخفي من التكوين.';
    else if (!moduleEnabled) reason = 'الوحدة المرتبطة غير مفعّلة.';
    else if (!featureAllowed) reason = 'الميزة غير متاحة (ترخيص أو صلاحيات).';
    else if (!permissionAllowed) reason = 'لا توجد صلاحية لتنفيذ هذا الإجراء.';
    else if (!roleAllowed) reason = 'الدور الحالي غير مخوّل لتنفيذ هذا الإجراء.';

    const enabled = visible && moduleEnabled && featureAllowed && permissionAllowed && roleAllowed;
    return {
      id,
      label,
      visible,
      enabled,
      allowed: enabled,
      reason,
      confirm,
      sensitive,
      definition,
    };
  }

  /**
   * Authoritative enforcement. Always call this before executing a sensitive
   * action, even when the UI has already hidden the button.
   */
  public static assertAllowed(id: string, actor?: User | null): void {
    const subject = actor ?? AuthService.getCurrentUser();
    const resolved = ActionRegistryService.resolve(id, subject);
    if (!resolved.visible) {
      throw new Error('الإجراء غير متاح في التكوين (مخفي).');
    }
    if (!resolved.enabled) {
      throw new Error(resolved.reason || 'الإجراء غير مسموح.');
    }
    if (resolved.sensitive) {
      const definition = resolved.definition;
      if (definition) {
        for (const permission of definition.permissions) {
          PermissionService.require(subject, permission);
        }
      }
    }
  }

  public static isVisible(id: string, user?: User | null): boolean {
    return ActionRegistryService.resolve(id, user).visible;
  }

  public static isEnabled(id: string, user?: User | null): boolean {
    return ActionRegistryService.resolve(id, user).enabled;
  }
}

// Re-export for convenience.
export { getActionDefinition, isKnownAction } from '../config/actionRegistry';
export { ACTION_REGISTRY } from '../config/actionRegistry';
