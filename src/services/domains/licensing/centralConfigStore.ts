/**
 * Read access to the cached central configuration.
 *
 * Feature-permission checks need the cached hidden menus / disabled
 * permissions, but must not import `CentralLicenseService` (which imports
 * `PermissionService` and would create a cycle). This module only reads
 * `localStorage` and has no service dependencies.
 */
const CONFIG_KEY = 'central_cached_config';

// The central config blob is re-read by every permission check, and a theme
// toggle re-renders the entire tree, so thousands of checks can run in one
// frame. Parsing the blob each time blocks the UI thread — memoize it and
// only re-parse when the stored string actually changed.
let cachedRaw: string | null = null;
let cachedConfig: any | null = null;

export function readCachedCentralConfig(): any | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw === cachedRaw) return cachedConfig;
    cachedRaw = raw;
    cachedConfig = raw ? JSON.parse(raw) : null;
    return cachedConfig;
  } catch {
    cachedRaw = null;
    cachedConfig = null;
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

export interface CachedPermissionLimit {
  permissionCode: string;
  maxAmount?: number | null;
  costVisible?: number | null;
  profitVisible?: number | null;
  disabled?: number;
}

/**
 * حدود صلاحيات المنصة الموقّعة لهذا المستأجر (tenant_permission_limits
 * مركزيًا). المنصة تقيّد ولا توسّع — تُفرض في AuthorizationService قبل
 * أي بُعد محلي.
 */
export function getCachedPermissionLimits(): CachedPermissionLimit[] {
  const value = readCachedCentralConfig()?.config?.permissionLimits;
  return Array.isArray(value) ? (value as CachedPermissionLimit[]) : [];
}

const CENTRAL_CONFIG_EVENT = 'central-config-updated';

/**
 * Notify all mounted listeners in the current window that `central_cached_config`
 * has been updated so UI guards, sidebars, and buttons re-evaluate immediately.
 */
export function notifyCentralConfigUpdated(): void {
  cachedRaw = null;
  cachedConfig = null;
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(CENTRAL_CONFIG_EVENT));
  }
}

/**
 * Subscribe to central config updates (both same-window dispatches and
 * cross-tab/cross-window `storage` events).
 */
export function subscribeCentralConfig(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = () => listener();
  const onStorage = (e: StorageEvent) => {
    if (e.key === CONFIG_KEY || e.key === null) {
      cachedRaw = null;
      cachedConfig = null;
      listener();
    }
  };
  window.addEventListener(CENTRAL_CONFIG_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CENTRAL_CONFIG_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
