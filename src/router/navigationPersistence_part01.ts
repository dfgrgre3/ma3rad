export interface NavigationSnapshot {
  version: 1;
  lastLocation: string | null;
  scrollPositions: Record<string, number>;
}

export type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

export const STORAGE_PREFIX = 'ceramisys_navigation_v1_';

export const MAX_SAVED_SCROLL_POSITIONS = 50;

export function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

export function isAppLocation(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

export function getStorage(storage?: StoragePort): StoragePort | null {
  try {
    return storage ?? window.localStorage;
  } catch (error) {
    console.warn('Could not access persisted navigation storage:', error);
    return null;
  }
}

export function readSnapshot(userId: string, storage?: StoragePort): NavigationSnapshot {
  try {
    const raw = getStorage(storage)?.getItem(storageKey(userId));
    if (!raw) return { version: 1, lastLocation: null, scrollPositions: {} };

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { version: 1, lastLocation: null, scrollPositions: {} };
    }

    const value = parsed as Partial<NavigationSnapshot>;
    const scrollPositions: Record<string, number> = {};
    if (value.scrollPositions && typeof value.scrollPositions === 'object') {
      for (const [location, position] of Object.entries(value.scrollPositions)) {
        if (isAppLocation(location) && typeof position === 'number' && Number.isFinite(position) && position >= 0) {
          scrollPositions[location] = position;
        }
      }
    }

    return {
      version: 1,
      lastLocation: isAppLocation(value.lastLocation) ? value.lastLocation : null,
      scrollPositions,
    };
  } catch (error) {
    console.warn('Could not read persisted navigation state:', error);
    return { version: 1, lastLocation: null, scrollPositions: {} };
  }
}

export function writeSnapshot(userId: string, snapshot: NavigationSnapshot, storage?: StoragePort): void {
  try {
    getStorage(storage)?.setItem(storageKey(userId), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Could not save persisted navigation state:', error);
  }
}

export function getPersistedLocation(userId: string, storage?: StoragePort): string | null {
  return readSnapshot(userId, storage).lastLocation;
}
