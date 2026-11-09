import { MAX_SAVED_SCROLL_POSITIONS, isAppLocation, readSnapshot, writeSnapshot } from './navigationPersistence_part01';
import type { StoragePort } from './navigationPersistence_part01';

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
