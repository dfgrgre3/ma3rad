/**
 * Central capability catalog.
 *
 * A capability is the unit of "what a tenant/client can do": it groups a
 * business module with its requirements, dependencies, permissions, screens
 * (routes) and operations (business events / actions). Setup selects a business
 * activity and the system assembles the capability (module) set required for
 * that activity. Central administration can then enable or disable any module,
 * feature, screen or action; this catalog is the single source of truth for the
 * capability surface.
 *
 * The catalog is pure data + pure functions (no database/React imports) so it
 * can be consumed by the renderer, the service layer and unit tests. Runtime
 * activation state lives in `ModuleRegistryService` / `CapabilityRegistryService`.
 */

import {
  MODULE_REGISTRY,
  getModuleDefinition,
  isKnownModule,
  validateModuleSelection,
  withModuleDependencies,
  getModuleDependencyClosure,
  getModulePathOwner,
  getManagedModulePaths,
  getHiddenModulePaths,
  type ModuleDefinition,
  type ModuleSettingDefinition,
  type ModuleActivationRules,
  type ModuleSelectionOptions,
  type ModuleSelectionValidation,
} from './moduleRegistry';

import { ACTION_REGISTRY, getActionDefinition, isKnownAction } from './actionRegistry';
import { FEATURE_REGISTRY } from '../services/FeatureService';
export type CapabilityRequirements = ModuleActivationRules;
export type CapabilitySettingDefinition = ModuleSettingDefinition;
export type CapabilitySelectionOptions = ModuleSelectionOptions;
export type CapabilitySelectionValidation = ModuleSelectionValidation;

export interface CapabilityDefinition {
  id: string;
  label: string;
  description: string;
  /** Requirements that must hold before the capability can be enabled. */
  requirements: CapabilityRequirements;
  /** Alias for `requirements`, kept for compatibility with the module registry. */
  activation: CapabilityRequirements;
  /** Capability ids that must also be enabled. */
  dependencies: string[];
  /** Permission codes a user needs before they can use the capability. */
  permissions: string[];
  /** Route prefixes / screens owned by the capability. */
  screens: string[];
  /** Alias for `screens`, kept for compatibility with the module registry. */
  paths: string[];
  /** Business events / operations exposed by the capability. */
  operations: string[];
  /** Alias for `operations`, kept for compatibility. */
  businessEvents: string[];
  /** Configurable settings schema. */
  settings: CapabilitySettingDefinition[];
  /** Underlying module id (1:1 in the current implementation). */
  module?: string;
  /** Feature ids associated with the capability. */
  features?: string[];
  /** Action ids associated with the capability. */
  actions?: string[];
}

export const CAPABILITY_CATALOG: CapabilityDefinition[] = MODULE_REGISTRY.map((module) => ({
  id: module.id,
  label: module.label,
  description: module.description,
  requirements: module.activation,
  activation: module.activation,
  dependencies: module.dependencies,
  permissions: module.permissions,
  screens: module.paths,
  paths: module.paths,
  operations: module.businessEvents,
  businessEvents: module.businessEvents,
  settings: module.settings,
  module: module.id,
  features: FEATURE_REGISTRY.filter((feature) => feature.module === module.id).map((feature) => feature.id),
  actions: ACTION_REGISTRY.filter((action) => action.module === module.id).map((action) => action.id),
}));

// Convenience aliases for the many names callers/tests may use.
export const CAPABILITY_REGISTRY = CAPABILITY_CATALOG;
export const CAPABILITIES = CAPABILITY_CATALOG;
export const CAPABILITY_LIST = CAPABILITY_CATALOG;

const REGISTRY_BY_ID = new Map(CAPABILITY_CATALOG.map((capability) => [capability.id, capability]));

export const getCapabilityDefinition = (id: string): CapabilityDefinition | undefined => REGISTRY_BY_ID.get(id);
export const getCapability = getCapabilityDefinition;
export const findCapability = getCapabilityDefinition;
export const isKnownCapability = (id: string): boolean => REGISTRY_BY_ID.has(id);
export const isKnownScreen = isKnownCapability; // placeholder kept for compatibility

/** All capabilities a set of capabilities transitively depends on. */
export const getCapabilityDependencyClosure = (ids: string[]): string[] => getModuleDependencyClosure(ids);

/** Add missing dependencies (transitively) to a selection. Unknown ids survive so validation can report them. */
export const withCapabilityDependencies = (ids: string[]): string[] => withModuleDependencies(ids);

export const validateCapabilitySelection = (
  ids: string[],
  options: CapabilitySelectionOptions
): CapabilitySelectionValidation => validateModuleSelection(ids, options);

/** Resolve the capability that owns a route/screen path, using the longest matching prefix. */
export const getCapabilityPathOwner = (pathname: string): string | undefined => getModulePathOwner(pathname);
export const getCapabilityScreenOwner = getCapabilityPathOwner;

export const getManagedCapabilityPaths = (): Set<string> => getManagedModulePaths();
export const getManagedCapabilityScreens = getManagedCapabilityPaths;

export const getHiddenCapabilityPaths = (enabledCapabilityIds: string[]): string[] =>
  getHiddenModulePaths(enabledCapabilityIds);
export const getHiddenCapabilityScreens = getHiddenCapabilityPaths;

// Re-export the underlying module helpers under their original names for callers
// that still speak in terms of modules.
export {
  getModuleDefinition,
  isKnownModule,
  validateModuleSelection,
  withModuleDependencies,
};

export type { ModuleDefinition, ModuleActivationRules, ModuleSettingDefinition };
export { ACTION_REGISTRY, getActionDefinition, isKnownAction };
export { FEATURE_REGISTRY } from '../services/FeatureService';
