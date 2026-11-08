import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getNavigationShortcuts,
  recordRecentNavigation,
  toggleNavigationFavorite,
} from '../src/router/navigationShortcuts.ts';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

test('favorites and recent visits are user-scoped and restricted to accessible destinations', () => {
  const storage = createStorage();
  const accessible = ['/dashboard', '/crm/dashboard', '/sales/orders-deposits'];

  toggleNavigationFavorite('user-1', '/crm/hub', accessible, storage);
  toggleNavigationFavorite('user-1', '/customers', accessible, storage);
  recordRecentNavigation('user-1', '/sales/reservations?tab=all', accessible, storage, 20);
  recordRecentNavigation('user-1', '/sales/orders-deposits', accessible, storage, 30);

  assert.deepEqual(getNavigationShortcuts('user-1', accessible, storage), {
    favorites: ['/crm/dashboard'],
    recent: [{ path: '/sales/orders-deposits', visitedAt: 30 }],
  });
  assert.deepEqual(getNavigationShortcuts('user-2', accessible, storage), {
    favorites: [],
    recent: [],
  });
  assert.deepEqual(getNavigationShortcuts('user-1', ['/dashboard'], storage), {
    favorites: [],
    recent: [],
  });
});

test('favorites can be removed and canonical aliases are deduplicated', () => {
  const storage = createStorage();
  const accessible = ['/dashboard', '/products'];

  toggleNavigationFavorite('user-1', '/products/catalog', accessible, storage);
  toggleNavigationFavorite('user-1', '/products', accessible, storage);
  recordRecentNavigation('user-1', '/tools', accessible, storage, 10);
  recordRecentNavigation('user-1', '/dashboard', accessible, storage, 20);

  assert.deepEqual(getNavigationShortcuts('user-1', accessible, storage), {
    favorites: [],
    recent: [
      { path: '/dashboard', visitedAt: 20 },
    ],
  });
});
