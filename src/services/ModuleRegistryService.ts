import { DatabaseManager } from '../database/db';
import { SettingsService } from './SettingsService';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { AuditService } from './AuditService';
import { parseBusinessConfiguration, parseEnabledModules } from '../config/businessProfiles';
import {
  MODULE_REGISTRY,
  getModuleDefinition,
  isKnownModule,
  validateModuleSelection,
  withModuleDependencies,
  type ModuleDefinition,
} from '../config/moduleRegistry';
import type { User } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Kept as a literal so the service layer does not import the React navigation tree.
const NAV_HIDDEN_SETTING_KEY = 'nav.hidden';
const ENABLED_MODULES_SETTING_KEY = 'enabledModules';

export type ModuleActivationAction = 'ACTIVATED' | 'DEACTIVATED';

export interface ModuleActivationEntry {
  id: string;
  moduleId: string;
  action: ModuleActivationAction;
  actorId: string | null;
  actorName: string | null;
  reason: string | null;
  createdAt: string;
}

export interface ModuleState extends ModuleDefinition {
  enabled: boolean;
  /** True when the module's dependency graph and business rules currently allow it. */
  available: boolean;
  unavailableReason?: string;
}

export interface ModuleChangeResult {
  enabled: string[];
  activated: string[];
  deactivated: string[];
  warnings: string[];
}

export class ModuleRegistryService {
  private static db() {
    return DatabaseManager.getInstance();
  }

  public static getDefinitions(): ModuleDefinition[] {
    return MODULE_REGISTRY;
  }

  public static getBusinessType(): string {
    return SettingsService.getValue('businessType') || 'ceramics';
  }

  public static isInventoryTracked(): boolean {
    const type = ModuleRegistryService.getBusinessType();
    return parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), type).trackInventory;
  }

  /**
   * Effective enabled modules, derived from profile defaults when the
   * administrator has never saved a selection. Dependencies are always
   * included so a legacy selection cannot leave a half-broken navigation tree.
   */
  public static getEnabledModuleIds(): string[] {
    const type = ModuleRegistryService.getBusinessType();
    const stored = parseEnabledModules(SettingsService.getValue(ENABLED_MODULES_SETTING_KEY), type);
    const trackInventory = ModuleRegistryService.isInventoryTracked();
    const validation = validateModuleSelection(stored, { trackInventory });
    return validation.enabled.filter((id) => id !== 'inventory' || trackInventory);
  }

  public static isModuleEnabled(moduleId: string): boolean {
    return ModuleRegistryService.getEnabledModuleIds().includes(moduleId);
  }

  /** Service-layer guard: call before mutating data owned by an optional module. */
  public static assertModuleEnabled(moduleId: string): void {
    const definition = getModuleDefinition(moduleId);
    if (!definition) {
      throw new Error(`وحدة غير معروفة: ${moduleId}`);
    }
    if (!ModuleRegistryService.isModuleEnabled(moduleId)) {
      throw new Error(`الوحدة «${definition.label}» غير مفعّلة لهذه المنشأة.`);
    }
  }

  public static getModuleState(): ModuleState[] {
    const enabled = new Set(ModuleRegistryService.getEnabledModuleIds());
    const trackInventory = ModuleRegistryService.isInventoryTracked();
    return MODULE_REGISTRY.map((definition) => {
      const requiresInventory = definition.activation.requiresInventoryTracking === true;
      const available = !requiresInventory || trackInventory;
      return {
        ...definition,
        enabled: enabled.has(definition.id),
        available,
        unavailableReason: available ? undefined : 'تتطلب تفعيل تتبع المخزون في إعدادات النشاط.',
      };
    });
  }

  public static validate(ids: string[]): { enabled: string[]; errors: string[]; warnings: string[] } {
    return validateModuleSelection(ids, { trackInventory: ModuleRegistryService.isInventoryTracked() });
  }

  /** Add every transitive dependency to a requested selection (used by the UI toggle). */
  public static withDependencies(ids: string[]): string[] {
    return withModuleDependencies(ids.filter(isKnownModule));
  }

  /**
   * Reason a module cannot be deactivated right now, or null when it can.
   *
   * Deactivation never deletes history — these guards only protect live work
   * and the dependency graph.
   */
  public static getDeactivationBlocker(moduleId: string, nextEnabled: string[]): string | null {
    const definition = getModuleDefinition(moduleId);
    if (!definition) return null;
    if (!isKnownModule(moduleId)) return 'وحدة غير معروفة.';

    const dependents = nextEnabled
      .filter((id) => id !== moduleId)
      .filter((id) => getModuleDefinition(id)?.dependencies.includes(moduleId));
    if (dependents.length > 0) {
      const labels = dependents.map((id) => getModuleDefinition(id)?.label || id).join('، ');
      return `لا يمكن تعطيل «${definition.label}» لأن الوحدات التالية تعتمد عليها: ${labels}.`;
    }

    const liveRecords = ModuleRegistryService.countLiveRecords(moduleId);
    if (liveRecords !== null && liveRecords > 0) {
      return `لا يمكن تعطيل «${definition.label}» مع وجود ${liveRecords} عملية جارية مرتبطة بها. أكملها أو ألغها أولًا.`;
    }

    return null;
  }

  /**
   * Count live (non-terminal) business records for modules that hold pending
   * work. Returns null for modules without a live-work concept.
   */
  private static countLiveRecords(moduleId: string): number | null {
    const db = ModuleRegistryService.db();
    try {
      if (moduleId === 'approvals') {
        return Number(db.query<{ count: number }>(
          `SELECT COUNT(*) AS count FROM approval_requests WHERE status = 'PENDING'`
        )[0]?.count || 0);
      }
      return null;
    } catch {
      // A missing table means the module has no live-work guard on this schema.
      return null;
    }
  }

  /**
   * Persist an enabled-module selection.
   *
   * - Requires `modules.manage`.
   * - Validates dependencies and business rules before writing anything.
   * - Writes settings + navigation visibility atomically.
   * - Records an append-only activation log and an audit entry per change.
   * - Disabling a module hides its screens but never deletes its data.
   */
  public static setEnabledModules(ids: string[], actor?: User | null, reason?: string): ModuleChangeResult {
    const user = actor ?? AuthService.getCurrentUser();
    PermissionService.require(user, 'modules.manage');

    // Explicitly requested modules must carry their dependencies. Auto-adding
    // here would silently undo an administrator's deactivation request.
    const requestedKnown = new Set(ids.filter(isKnownModule));
    for (const definition of MODULE_REGISTRY) {
      if (!requestedKnown.has(definition.id)) continue;
      const missingDependency = definition.dependencies.find((dependency) => !requestedKnown.has(dependency));
      if (missingDependency) {
        const dependencyLabel = getModuleDefinition(missingDependency)?.label || missingDependency;
        throw new Error(`لا يمكن تعطيل «${dependencyLabel}» لأن الوحدة «${definition.label}» تعتمد عليها.`);
      }
    }

    const validation = ModuleRegistryService.validate(ids);
    if (validation.errors.length > 0) {
      throw new Error(validation.errors.join(' '));
    }

    const current = ModuleRegistryService.getEnabledModuleIds();
    const activated = validation.enabled.filter((id) => !current.includes(id));
    const deactivated = current.filter((id) => !validation.enabled.includes(id));

    for (const moduleId of deactivated) {
      const blocker = ModuleRegistryService.getDeactivationBlocker(moduleId, validation.enabled);
      if (blocker) throw new Error(blocker);
    }

    const enabledJson = JSON.stringify(validation.enabled);
    // Navigation visibility must match the module selection. Preserve other
    // hidden paths and only add/remove module-owned ones.
    const modulePaths = new Set(MODULE_REGISTRY.flatMap((module) => module.paths));
    const hiddenPathList = new Set<string>();
    for (const module of MODULE_REGISTRY) {
      if (!validation.enabled.includes(module.id)) {
        for (const path of module.paths) hiddenPathList.add(path);
      }
    }
    const preservedHidden = (() => {
      try {
        const raw = SettingsService.getValue(NAV_HIDDEN_SETTING_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [] as string[];
        return parsed.filter((path): path is string => typeof path === 'string' && !modulePaths.has(path));
      } catch {
        return [] as string[];
      }
    })();
    const hiddenJson = JSON.stringify([...new Set([...preservedHidden, ...hiddenPathList])]);

    const db = ModuleRegistryService.db();
    const now = new Date().toISOString();
    db.executeTransaction((tx) => {
      tx.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [ENABLED_MODULES_SETTING_KEY, enabledJson]);
      tx.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [NAV_HIDDEN_SETTING_KEY, hiddenJson]);
      for (const moduleId of [...activated.map((id) => ({ moduleId: id, action: 'ACTIVATED' as const })), ...deactivated.map((id) => ({ moduleId: id, action: 'DEACTIVATED' as const }))]) {
        tx.run(
          `INSERT INTO module_activation_log (id, module_id, action, actor_id, actor_name, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `mal_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
            moduleId.moduleId,
            moduleId.action,
            user?.id || 'system',
            user?.fullName || 'النظام',
            reason?.trim() || null,
            now,
          ]
        );
      }
    });

    try {
      new AuditService().log({
        userId: user?.id,
        userName: user?.fullName,
        action: 'تعديل الوحدات المفعّلة',
        module: 'SETTINGS',
        oldValues: JSON.stringify({ enabledModules: current }),
        newValues: JSON.stringify({ enabledModules: validation.enabled, activated, deactivated }),
      });
    } catch {
      // Audit failure must not roll back a validated configuration change.
    }

    return { enabled: validation.enabled, activated, deactivated, warnings: validation.warnings };
  }

  public static activate(moduleId: string, actor?: User | null, reason?: string): ModuleChangeResult {
    if (!isKnownModule(moduleId)) throw new Error(`وحدة غير معروفة: ${moduleId}`);
    const next = ModuleRegistryService.withDependencies([...ModuleRegistryService.getEnabledModuleIds(), moduleId]);
    return ModuleRegistryService.setEnabledModules(next, actor, reason);
  }

  public static deactivate(moduleId: string, actor?: User | null, reason?: string): ModuleChangeResult {
    if (!isKnownModule(moduleId)) throw new Error(`وحدة غير معروفة: ${moduleId}`);
    const next = ModuleRegistryService.getEnabledModuleIds().filter((id) => id !== moduleId);
    return ModuleRegistryService.setEnabledModules(next, actor, reason);
  }

  public static getActivationLog(limit = 100): ModuleActivationEntry[] {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 100, 1), 500);
    return ModuleRegistryService.db().query<ModuleActivationEntry>(
      `SELECT id, module_id AS moduleId, action, actor_id AS actorId, actor_name AS actorName,
              reason, created_at AS createdAt
       FROM module_activation_log
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [safeLimit]
    );
  }

  /** Per-module configuration values, falling back to registry defaults. */
  public static getModuleSettings(moduleId: string): Record<string, string | number | boolean> {
    const definition = getModuleDefinition(moduleId);
    if (!definition) throw new Error(`وحدة غير معروفة: ${moduleId}`);
    const stored = new Map(
      ModuleRegistryService.db()
        .query<{ key: string; value: string }>('SELECT key, value FROM module_settings WHERE module_id = ?', [moduleId])
        .map((row) => [row.key, row.value])
    );
    const result: Record<string, string | number | boolean> = {};
    for (const setting of definition.settings) {
      const raw = stored.get(setting.key);
      if (raw === undefined) {
        result[setting.key] = setting.defaultValue;
      } else if (setting.type === 'boolean') {
        result[setting.key] = raw === '1' || raw === 'true';
      } else if (setting.type === 'number') {
        const value = Number(raw);
        result[setting.key] = Number.isFinite(value) ? value : setting.defaultValue;
      } else {
        result[setting.key] = raw;
      }
    }
    return result;
  }

  public static setModuleSetting(moduleId: string, key: string, value: string | number | boolean, actor?: User | null): void {
    const definition = getModuleDefinition(moduleId);
    if (!definition) throw new Error(`وحدة غير معروفة: ${moduleId}`);
    const setting = definition.settings.find((item) => item.key === key);
    if (!setting) throw new Error(`إعداد غير معروف للوحدة ${moduleId}: ${key}`);

    const user = actor ?? AuthService.getCurrentUser();
    PermissionService.require(user, 'modules.manage');

    let serialized: string;
    if (setting.type === 'boolean') {
      serialized = value ? '1' : '0';
    } else if (setting.type === 'number') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) throw new Error(`قيمة غير صالحة للإعداد ${setting.label}.`);
      serialized = String(numeric);
    } else if (setting.type === 'enum') {
      if (!setting.options?.includes(String(value))) {
        throw new Error(`قيمة غير صالحة للإعداد ${setting.label}.`);
      }
      serialized = String(value);
    } else {
      serialized = String(value);
    }

    ModuleRegistryService.db().run(
      `INSERT INTO module_settings (module_id, key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(module_id, key) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      [moduleId, key, serialized, new Date().toISOString(), user?.id || 'system']
    );
  }
}
