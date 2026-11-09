import { getModuleDefinition, isKnownModule, validateModuleSelection, withModuleDependencies } from './moduleRegistry';
import type { ModuleDefinition, ModuleActivationRules, ModuleSettingDefinition } from './moduleRegistry';
import { ACTION_REGISTRY, getActionDefinition, isKnownAction } from './actionRegistry';
export {
  getModuleDefinition,
  isKnownModule,
  validateModuleSelection,
  withModuleDependencies,
};
export type { ModuleDefinition, ModuleActivationRules, ModuleSettingDefinition };
export { ACTION_REGISTRY, getActionDefinition, isKnownAction };
export { FEATURE_REGISTRY } from './featureRegistry';
import './capabilityCatalog_part01';
import './capabilityCatalog_part02';
export type { CapabilityRequirements } from './capabilityCatalog_part01';
export type { CapabilitySettingDefinition } from './capabilityCatalog_part01';
export type { CapabilitySelectionOptions } from './capabilityCatalog_part01';
export type { CapabilitySelectionValidation } from './capabilityCatalog_part01';
export type { CapabilityDefinition } from './capabilityCatalog_part01';
export { CAPABILITY_CATALOG } from './capabilityCatalog_part01';
export { getCapabilityDefinition } from './capabilityCatalog_part01';
export { isKnownCapability } from './capabilityCatalog_part01';
export { isKnownScreen } from './capabilityCatalog_part01';
export { getCapabilityDependencyClosure } from './capabilityCatalog_part01';
export { withCapabilityDependencies } from './capabilityCatalog_part01';
export { validateCapabilitySelection } from './capabilityCatalog_part02';
export { getCapabilityPathOwner } from './capabilityCatalog_part02';
export { getManagedCapabilityPaths } from './capabilityCatalog_part02';
export { getHiddenCapabilityPaths } from './capabilityCatalog_part02';
