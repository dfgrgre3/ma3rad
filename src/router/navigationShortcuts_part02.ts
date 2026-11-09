import { MAX_RECENT_PAGES, canonicalNavigationPath, getStorage, readShortcuts, storageKey } from './navigationShortcuts_part01';
import type { NavigationShortcuts, StoragePort } from './navigationShortcuts_part01';

export function writeShortcuts(userId: string, shortcuts: NavigationShortcuts, storage?: StoragePort): void {
  try {
    getStorage(storage)?.setItem(storageKey(userId), JSON.stringify(shortcuts));
  } catch (error) {
    console.warn('Could not save navigation shortcuts:', error);
  }
}

export function accessibleShortcuts(shortcuts: NavigationShortcuts, accessiblePaths: string[]): NavigationShortcuts {
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
