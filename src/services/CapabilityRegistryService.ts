import { ModuleRegistryService } from './ModuleRegistryService';
import {
  CAPABILITY_CATALOG,
  getCapabilityDefinition,
  isKnownCapability,
  withCapabilityDependencies,
  validateCapabilitySelection,
  getCapabilityPathOwner,
  getManagedCapabilityPaths,
  getHiddenCapabilityPaths,
  type CapabilityDefinition,
} from '../config/capabilityCatalog';
import type { User } from '../types';

export type CapabilityActivationAction = 'ACTIVATED' | 'DEACTIVATED';
export type CapabilityActivationEntry = {
  id: string;
  capabilityId: string;
  action: CapabilityActivationAction;
  actorId: string | null;
  actorName: string | null;
  reason: string | null;
  createdAt: string;
};

export interface CapabilityState extends CapabilityDefinition {
  enabled: boolean;
  available: boolean;
  unavailableReason?: string;
}

export interface CapabilityChangeResult {
  enabled: string[];
  activated: string[];
  deactivated: string[];
  warnings: string[];
}

/**
 * Central capability registry service.
 *
 * Capabilities are backed by the existing module registry (1:1 today), so all
 * activation, dependency, audit and settings behaviour is inherited. The
 * capability vocabulary is exposed alongside the module vocabulary so central
 * administration and Setup can reason in terms of "capabilities" rather than
 * only "modules".
 */
export class CapabilityRegistryService extends ModuleRegistryService {
  public static getCapabilityDefinitions(): CapabilityDefinition[] {
    return CAPABILITY_CATALOG;
  }

  public static getCapabilities(): CapabilityDefinition[] {
    return CAPABILITY_CATALOG;
  }

  // Override the inherited module definitions with the capability catalog so
  // callers that ask for "definitions" receive the capability shape.
  public static getDefinitions(): CapabilityDefinition[] {
    return CAPABILITY_CATALOG;
  }

  public static getCapabilityDefinition(id: string): CapabilityDefinition | undefined {
    return getCapabilityDefinition(id);
  }

  public static isKnownCapability(id: string): boolean {
    return isKnownCapability(id);
  }

  public static getEnabledCapabilityIds(): string[] {
    return CapabilityRegistryService.getEnabledModuleIds();
  }

  public static isCapabilityEnabled(id: string): boolean {
    return CapabilityRegistryService.isModuleEnabled(id);
  }

  public static assertCapabilityEnabled(id: string): void {
    return CapabilityRegistryService.assertModuleEnabled(id);
  }

  public static getCapabilityState(): CapabilityState[] {
    const enabled = new Set(CapabilityRegistryService.getEnabledCapabilityIds());
    const trackInventory = CapabilityRegistryService.isInventoryTracked();
    return CAPABILITY_CATALOG.map((definition) => {
      const requiresInventory = definition.requirements.requiresInventoryTracking === true;
      const available = !requiresInventory || trackInventory;
      return {
        ...definition,
        enabled: enabled.has(definition.id),
        available,
        unavailableReason: available ? undefined : 'تتطلب تفعيل تتبع المخزون في إعدادات النشاط.',
      };
    });
  }

  public static validateCapabilities(
    ids: string[],
    options: { trackInventory?: boolean } = {}
  ): { enabled: string[]; errors: string[]; warnings: string[] } {
    return validateCapabilitySelection(ids, {
      trackInventory: options.trackInventory ?? CapabilityRegistryService.isInventoryTracked(),
    });
  }

  public static withCapabilityDependencies(ids: string[]): string[] {
    return withCapabilityDependencies(ids.filter(isKnownCapability));
  }

  public static getCapabilityPathOwner(pathname: string): string | undefined {
    return getCapabilityPathOwner(pathname);
  }

  public static getCapabilityScreenOwner(pathname: string): string | undefined {
    return getCapabilityPathOwner(pathname);
  }

  public static getManagedCapabilityPaths(): Set<string> {
    return getManagedCapabilityPaths();
  }

  public static getManagedCapabilityScreens(): Set<string> {
    return getManagedCapabilityPaths();
  }

  public static getHiddenCapabilityPaths(enabledCapabilityIds: string[]): string[] {
    return getHiddenCapabilityPaths(enabledCapabilityIds);
  }

  public static getHiddenCapabilityScreens(enabledCapabilityIds: string[]): string[] {
    return getHiddenCapabilityPaths(enabledCapabilityIds);
  }

  public static setEnabledCapabilities(
    ids: string[],
    actor?: User | null,
    reason?: string,
    options: { trackInventory?: boolean } = {}
  ): CapabilityChangeResult {
    return CapabilityRegistryService.setEnabledModules(ids, actor, reason, options);
  }

  public static activateCapability(id: string, actor?: User | null, reason?: string): CapabilityChangeResult {
    return CapabilityRegistryService.activate(id, actor, reason);
  }

  public static deactivateCapability(id: string, actor?: User | null, reason?: string): CapabilityChangeResult {
    return CapabilityRegistryService.deactivate(id, actor, reason);
  }

  // Settings aliases
  public static getCapabilitySettings(id: string): Record<string, string | number | boolean> {
    return CapabilityRegistryService.getModuleSettings(id);
  }

  public static setCapabilitySetting(
    id: string,
    key: string,
    value: string | number | boolean,
    actor?: User | null
  ): void {
    return CapabilityRegistryService.setModuleSetting(id, key, value, actor);
  }
}

export { CapabilityRegistryService as CapabilityCatalog };
export { CapabilityRegistryService as Capabilities };
export { CapabilityRegistryService as Capability };
export { CapabilityRegistryService as CapabilityRegistry };
export { CapabilityRegistryService as CapabilityService };
export { CapabilityRegistryService as CapabilitiesService };
export { CapabilityRegistryService as CapabilityCatalogService };
export { CapabilityRegistryService as CapabilityManager };
// Alias service names are provided by dedicated files in this directory.