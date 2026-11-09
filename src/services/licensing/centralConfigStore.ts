/**
 * Read access to the cached central configuration.
 *
 * Feature-permission checks need the cached hidden menus / disabled
 * permissions, but must not import `CentralLicenseService` (which imports
 * `PermissionService` and would create a cycle). This module only reads
 * `localStorage` and has no service dependencies.
 */
const CONFIG_KEY = 'central_cached_config';

export function readCachedCentralConfig(): any | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getCachedHiddenMenus(): string[] {
  const value = readCachedCentralConfig()?.config?.hiddenMenus;
  return Array.isArray(value) ? (value as string[]) : [];
}

export function getCachedFeaturePermissions(): any[] {
  const value = readCachedCentralConfig()?.config?.featurePermissions;
  return Array.isArray(value) ? value : [];
}

export function getCachedDisabledPermissions(): string[] {
  const value = readCachedCentralConfig()?.config?.disabledPermissions;
  return Array.isArray(value) ? (value as string[]) : [];
}

export function getCachedUsageLimits(): Record<string, any> {
  const value = readCachedCentralConfig()?.config?.usageLimits;
  return value && typeof value === 'object' ? value : {};
}
