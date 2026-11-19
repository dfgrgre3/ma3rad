import type { Database } from 'sql.js';
import type { DatabaseManager } from '../databaseManager';
import { getDatabaseManagerState } from './constants';
import type { DatabaseManagerInternals } from './internals';
import { forwardMutation, markDirty } from './mutationSync';
import {
  clearQueryCache,
  createQueryCacheKey,
  getCachedQuery,
  isMutatingSql,
  setCachedQuery,
  trackQuery,
} from './queries';

/**
 * The proxied Database facade (mutation tracking + query cache + worker
 * forwarding) and the sequential document number generator.
 * Extracted from databaseManager.ts; behaviour is identical.
 */

export function getDatabase(host: DatabaseManager): Database {
  const h = host as unknown as DatabaseManagerInternals;
  if (!h.db) {
    throw new Error('Database not initialized! Call DatabaseManager.getInstance().initialize() first.');
  }
  if (h.databaseFacadeTarget !== h.db || !h.databaseFacade) {
    const database = h.db;
    h.databaseFacadeTarget = database;
    h.databaseFacade = new Proxy(database, {
      get: (target, property) => {
        const value = Reflect.get(target, property, target);
        if (property === 'run' || property === 'exec') {
          return (...args: unknown[]) => {
            const sql = args[0];
            const applyAndForward = () => {
              try {
                const result = Reflect.apply(value, target, args);
                forwardMutation(
                  host,
                  property,
                  typeof sql === 'string' ? sql : '',
                  Array.isArray(args[1]) ? args[1] : [],
                );
                return result;
              } catch (error) {
                // exec() can apply several statements before failing, so a
                // failed exec may still have mutated the database. Mirror it
                // to the worker replica as well — it will fail identically
                // and its error response triggers a resync if needed. A
                // failed run() is a no-op on both sides, so it is skipped.
                if (property === 'exec') {
                  forwardMutation(
                    host,
                    'exec',
                    typeof sql === 'string' ? sql : '',
                    Array.isArray(args[1]) ? args[1] : [],
                  );
                }
                throw error;
              }
            };
            return trackQuery(host, typeof sql === 'string' ? sql : '', () => {
              if (typeof sql !== 'string' || isMutatingSql(sql)) {
                clearQueryCache(host);
                markDirty(host);
              }
              if (property === 'exec' && typeof sql === 'string') {
                const params = Array.isArray(args[1]) ? args[1] : [];
                const cacheKey = createQueryCacheKey(host, sql, params);
                if (cacheKey) {
                  const key = `exec:${cacheKey}`;
                  const cached = getCachedQuery<unknown>(host, key);
                  if (cached !== undefined) return cached;
                  const result = applyAndForward();
                  setCachedQuery(host, key, result);
                  return result;
                }
              }
              return applyAndForward();
            });
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  return h.databaseFacade;
}

/**
 * Collision-proof, transaction-safe sequential document number generator.
 * Example: nextNumber('INV') -> 'INV-2026-000001'
 * Must be called INSIDE an executeTransaction() callback so the counter
 * is atomically incremented with the document it names (prevents gaps/duplicates).
 */
export function nextNumber(host: DatabaseManager, prefix: string): string {
  host.run('INSERT OR IGNORE INTO sequence_counters (name, value) VALUES (?, 0)', [prefix]);
  const row = host.query<{ value: number }>('SELECT value FROM sequence_counters WHERE name = ?', [prefix])[0];
  const next = (row?.value ?? 0) + 1;
  host.run('UPDATE sequence_counters SET value = ? WHERE name = ?', [next, prefix]);
  const year = new Date().getFullYear();
  const custom = getDatabaseManagerState().numberFormatter?.(prefix, next, new Date());
  if (custom) return custom;
  return `${prefix}-${year}-${String(next).padStart(6, '0')}`;
}
