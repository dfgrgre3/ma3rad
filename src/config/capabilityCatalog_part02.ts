import { validateModuleSelection, getModulePathOwner, getManagedModulePaths, getHiddenModulePaths } from './moduleRegistry';
import type { CapabilitySelectionOptions, CapabilitySelectionValidation } from './capabilityCatalog_part01';

export const validateCapabilitySelection = (
  ids: string[],
  options: CapabilitySelectionOptions
): CapabilitySelectionValidation => validateModuleSelection(ids, options);

/** Resolve the capability that owns a route/screen path, using the longest matching prefix. */
export const getCapabilityPathOwner = (pathname: string): string | undefined => getModulePathOwner(pathname);

export const getManagedCapabilityPaths = (): Set<string> => getManagedModulePaths();

export const getHiddenCapabilityPaths = (enabledCapabilityIds: string[]): string[] =>
  getHiddenModulePaths(enabledCapabilityIds);
