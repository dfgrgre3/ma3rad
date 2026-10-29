import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { localCache } from '../src/services/localCacheService.ts';

test('local cache honors item lifetimes, tracks hits, and purges tagged entries', async () => {
  localCache.clear();
  localCache.set('short-lived', { value: 1 }, 30);
  assert.deepEqual(localCache.get('short-lived'), { value: 1 });
  assert.deepEqual(localCache.get('short-lived'), { value: 1 });
  assert.equal(localCache.getStats().hitRate, 100);

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(localCache.get('short-lived'), null);

  localCache.taggedSet('products', 'product-list', ['tile']);
  assert.deepEqual(localCache.getTagged('products'), [['tile']]);
  localCache.purgeByTag('products');
  assert.deepEqual(localCache.getTagged('products'), []);
  localCache.clear();
});

test('database query cache reuses safe reads and invalidates on direct SQL writes', async () => {
  const database = DatabaseManager.getInstance();
  await database.initialize();
  database.run('CREATE TEMP TABLE cache_test_fixture (value INTEGER)');
  database.run('INSERT INTO cache_test_fixture (value) VALUES (?)', [7]);

  const sql = 'SELECT value FROM cache_test_fixture';
  const previousHits = database.getQueryCacheStats().hits;
  const first = database.query<{ value: number }>(sql);
  first[0].value = 99;

  assert.equal(database.query<{ value: number }>(sql)[0].value, 7);
  assert.ok(database.getQueryCacheStats().hits > previousHits);

  database.getDatabase().run('UPDATE cache_test_fixture SET value = ?', [8]);
  assert.equal(database.query<{ value: number }>(sql)[0].value, 8);

  const rawSql = 'SELECT value FROM cache_test_fixture';
  const previousRawHits = database.getQueryCacheStats().hits;
  assert.equal(database.getDatabase().exec(rawSql)[0].values[0][0], 8);
  assert.equal(database.getDatabase().exec(rawSql)[0].values[0][0], 8);
  assert.ok(database.getQueryCacheStats().hits > previousRawHits);

  database.getDatabase().exec('UPDATE cache_test_fixture SET value = 9');
  assert.equal(database.getDatabase().exec(rawSql)[0].values[0][0], 9);

  database.run('DROP TABLE cache_test_fixture');
  await database.flush();
});
