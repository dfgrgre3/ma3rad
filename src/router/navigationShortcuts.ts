export interface NavigationShortcuts {
  favorites: string[];
  recent: Array<{ path: string; visitedAt: number }>;
}

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_PREFIX = 'ceramisys_navigation_shortcuts_v1_';
const MAX_RECENT_PAGES = 10;

const PATH_ALIASES: Record<string, string> = {
  '/dashboard/executive': '/dashboard',
  '/tools': '/dashboard',
  '/products/catalog': '/products',
  '/inventory': '/inventory/hub',
  '/inventory/reservations': '/inventory/stock-reservations',
  '/crm': '/crm/dashboard',
  '/crm/hub': '/crm/dashboard',
  '/sales/reservations': '/sales/orders-deposits',
};

const EMPTY_SHORTCUTS: NavigationShortcuts = { favorites: [], recent: [] };

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

function getStorage(storage?: StoragePort): StoragePort | null {
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

function readShortcuts(userId: string, storage?: StoragePort): NavigationShortcuts {
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

function writeShortcuts(userId: string, shortcuts: NavigationShortcuts, storage?: StoragePort): void {
  try {
    getStorage(storage)?.setItem(storageKey(userId), JSON.stringify(shortcuts));
  } catch (error) {
    console.warn('Could not save navigation shortcuts:', error);
  }
}

function accessibleShortcuts(shortcuts: NavigationShortcuts, accessiblePaths: string[]): NavigationShortcuts {
  const favorites = [...new Set(shortcuts.favorites
    .map((path) => canonicalNavigationPath(path, accessiblePaths))
    .filter((path): path is string => path !== null))];
  const recentByPath = new Map<string, number>();
  for (const entry of shortcuts.recent) {
    const path = canonicalNavigationPath(entry.path, accessiblePaths);
    if (path) recentByPath.set(path, Math.max(recentByPath.get(path) ?? 0, entry.visitedAt));
  }
  const recent = [...recentByPath]
    .map(([path, visitedAt]) => ({ path, visitedAt }))
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, MAX_RECENT_PAGES);
  return { favorites, recent };
}

export function getNavigationShortcuts(
  userId: string,
  accessiblePaths: string[],
  storage?: StoragePort
): NavigationShortcuts {
  return accessibleShortcuts(readShortcuts(userId, storage), accessiblePaths);
}

export function toggleNavigationFavorite(
  userId: string,
  pathname: string,
  accessiblePaths: string[],
  storage?: StoragePort
): NavigationShortcuts {
  const shortcuts = getNavigationShortcuts(userId, accessiblePaths, storage);
  const path = canonicalNavigationPath(pathname, accessiblePaths);
  if (!path) return shortcuts;
  const favorites = shortcuts.favorites.includes(path)
    ? shortcuts.favorites.filter((favorite) => favorite !== path)
    : [...shortcuts.favorites, path];
  const next = { ...shortcuts, favorites };
  writeShortcuts(userId, next, storage);
  return next;
}

export function recordRecentNavigation(
  userId: string,
  pathname: string,
  accessiblePaths: string[],
  storage?: StoragePort,
  visitedAt = Date.now()
): NavigationShortcuts {
  const shortcuts = getNavigationShortcuts(userId, accessiblePaths, storage);
  const path = canonicalNavigationPath(pathname, accessiblePaths);
  if (!path || !Number.isFinite(visitedAt)) return shortcuts;
  const recent = [
    { path, visitedAt },
    ...shortcuts.recent.filter((entry) => entry.path !== path),
  ].slice(0, MAX_RECENT_PAGES);
  const next = { ...shortcuts, recent };
  writeShortcuts(userId, next, storage);
  return next;
}
