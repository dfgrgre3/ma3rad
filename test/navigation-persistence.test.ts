import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPersistedLocation,
  getPersistedScrollPosition,
  saveNavigationLocation,
  saveNavigationScrollPosition,
} from '../src/router/navigationPersistence.ts';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

test('navigation state persists location and scroll position per user', () => {
  const storage = createStorage();
  saveNavigationLocation('user-1', '/products?category=tiles', storage);
  saveNavigationScrollPosition('user-1', '/products?category=tiles', 640, storage);
  saveNavigationLocation('user-2', '/dashboard', storage);

  assert.equal(getPersistedLocation('user-1', storage), '/products?category=tiles');
  assert.equal(getPersistedScrollPosition('user-1', '/products?category=tiles', storage), 640);
  assert.equal(getPersistedLocation('user-2', storage), '/dashboard');
  assert.equal(getPersistedScrollPosition('user-2', '/products?category=tiles', storage), 0);
});

test('navigation persistence ignores external locations and invalid scroll positions', () => {
  const storage = createStorage();
  saveNavigationLocation('user-1', '//example.com', storage);
  saveNavigationScrollPosition('user-1', '/products', Number.POSITIVE_INFINITY, storage);

  assert.equal(getPersistedLocation('user-1', storage), null);
  assert.equal(getPersistedScrollPosition('user-1', '/products', storage), 0);
});
