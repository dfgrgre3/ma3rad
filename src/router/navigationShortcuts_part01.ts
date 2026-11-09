export interface NavigationShortcuts {
  favorites: string[];
  recent: Array<{ path: string; visitedAt: number }>;
}

export type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

export const STORAGE_PREFIX = 'ceramisys_navigation_shortcuts_v1_';

export const MAX_RECENT_PAGES = 10;

export const PATH_ALIASES: Record<string, string> = {
  '/dashboard/executive': '/dashboard',
  '/tools': '/dashboard',
  '/products/catalog': '/products',
  '/inventory': '/inventory/hub',
  '/inventory/reservations': '/inventory/stock-reservations',
  '/crm': '/crm/dashboard',
  '/crm/hub': '/crm/dashboard',
  '/sales/reservations': '/sales/orders-deposits',
};

export const EMPTY_SHORTCUTS: NavigationShortcuts = { favorites: [], recent: [] };

export function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

export function getStorage(storage?: StoragePort): StoragePort | null {
  try {
    return storage ?? window.localStorage;
  } catch (error) {
    console.warn('Could not access navigation shortcuts storage:', error);
    return null;
  }
}

export function canonicalNavigationPath(pathname: string, accessiblePaths: string[]): string | null {
  const path = pathname.split(/[?#]/, 1)[0];
  const canonical = PATH_ALIASES[path] ?? path;
  return accessiblePaths.includes(canonical) ? canonical : null;
}

export function readShortcuts(userId: string, storage?: StoragePort): NavigationShortcuts {
  try {
    const raw = getStorage(storage)?.getItem(storageKey(userId));
    if (!raw) return { ...EMPTY_SHORTCUTS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_SHORTCUTS };

    const value = parsed as Partial<NavigationShortcuts>;
    const favorites = Array.isArray(value.favorites)
      ? value.favorites.filter((path): path is string => typeof path === 'string')
      : [];
    const recent = Array.isArray(value.recent)
      ? value.recent.filter((entry): entry is { path: string; visitedAt: number } =>
        Boolean(entry)
        && typeof entry === 'object'
        && typeof entry.path === 'string'
        && typeof entry.visitedAt === 'number'
        && Number.isFinite(entry.visitedAt)
      )
      : [];

    return { favorites, recent };
  } catch (error) {
    console.warn('Could not read navigation shortcuts:', error);
    return { ...EMPTY_SHORTCUTS };
  }
}
