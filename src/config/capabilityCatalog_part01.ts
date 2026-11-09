import { MODULE_REGISTRY, withModuleDependencies, getModuleDependencyClosure, getModulePathOwner, type ModuleSettingDefinition, type ModuleActivationRules, type ModuleSelectionOptions, type ModuleSelectionValidation } from './moduleRegistry';
import { ACTION_REGISTRY } from './actionRegistry';
import { FEATURE_REGISTRY } from './featureRegistry';

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

export const REGISTRY_BY_ID = new Map(CAPABILITY_CATALOG.map((capability) => [capability.id, capability]));

export const getCapabilityDefinition = (id: string): CapabilityDefinition | undefined => REGISTRY_BY_ID.get(id);

export const isKnownCapability = (id: string): boolean => REGISTRY_BY_ID.has(id);

/** True only for a screen path owned by a registered module. */
export const isKnownScreen = (pathname: string): boolean =>
  typeof pathname === 'string' && getModulePathOwner(pathname) !== undefined;

/** All capabilities a set of capabilities transitively depends on. */
export const getCapabilityDependencyClosure = (ids: string[]): string[] => getModuleDependencyClosure(ids);

/** Add missing dependencies (transitively) to a selection. Unknown ids survive so validation can report them. */
export const withCapabilityDependencies = (ids: string[]): string[] => withModuleDependencies(ids);
