interface NavigationSnapshot {
  version: 1;
  lastLocation: string | null;
  scrollPositions: Record<string, number>;
}

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_PREFIX = 'ceramisys_navigation_v1_';
const MAX_SAVED_SCROLL_POSITIONS = 50;

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

function isAppLocation(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

function getStorage(storage?: StoragePort): StoragePort | null {
  try {
    return storage ?? window.localStorage;
  } catch (error) {
    console.warn('Could not access persisted navigation storage:', error);
    return null;
  }
}

function readSnapshot(userId: string, storage?: StoragePort): NavigationSnapshot {
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

function writeSnapshot(userId: string, snapshot: NavigationSnapshot, storage?: StoragePort): void {
  try {
    getStorage(storage)?.setItem(storageKey(userId), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Could not save persisted navigation state:', error);
  }
}

export function getPersistedLocation(userId: string, storage?: StoragePort): string | null {
  return readSnapshot(userId, storage).lastLocation;
}

export function saveNavigationLocation(userId: string, location: string, storage?: StoragePort): void {
  if (!isAppLocation(location)) return;
  const snapshot = readSnapshot(userId, storage);
  snapshot.lastLocation = location;
  writeSnapshot(userId, snapshot, storage);
}

export function getPersistedScrollPosition(
  userId: string,
  location: string,
  storage?: StoragePort
): number {
  return readSnapshot(userId, storage).scrollPositions[location] ?? 0;
}

export function saveNavigationScrollPosition(
  userId: string,
  location: string,
  position: number,
  storage?: StoragePort
): void {
  if (!isAppLocation(location) || !Number.isFinite(position) || position < 0) return;
  const snapshot = readSnapshot(userId, storage);
  snapshot.scrollPositions[location] = position;

  const savedLocations = Object.keys(snapshot.scrollPositions);
  while (savedLocations.length > MAX_SAVED_SCROLL_POSITIONS) {
    delete snapshot.scrollPositions[savedLocations.shift()!];
  }

  writeSnapshot(userId, snapshot, storage);
}
