import type { DatabaseManager } from '../databaseManager';
import { LEGACY_X86_BUILD } from './constants';
import type { DatabaseManagerInternals } from './internals';
import { forwardMutation, markDirty } from './mutationSync';

/**
 * Query execution, result mapping, query cache and query statistics.
 * Extracted from databaseManager.ts; behaviour is identical.
 */

// sql.js returns rows keyed by raw DB column names (snake_case). The service
// layer and the TypeScript interfaces use camelCase, so normalize row keys here.
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_match, c: string) => c.toUpperCase());
}

function snakeToCamelKeys<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const camel = snakeToCamel(key);
    out[camel] = row[key];
    // Some platform-domain mappers still read the raw snake_case key; keep it
    // alongside the camelCase alias so both access styles resolve.
    if (camel !== key) out[key] = row[key];
  }
  return out as T;
}

export function trackQuery<T>(host: DatabaseManager, sql: string, operation: () => T): T {
  const h = host as unknown as DatabaseManagerInternals;
  const startedAt = performance.now();
  h.totalQueries++;
  try {
    return operation();
  } catch (error) {
    h.failedQueries++;
    throw error;
  } finally {
    const durationMs = Math.max(0, performance.now() - startedAt);
    if (durationMs >= h.slowQueryThresholdMs) {
      h.slowQueryCount++;
      h.slowestQueryMs = Math.max(h.slowestQueryMs, durationMs);
      const statement = sql
        .replace(/'(?:''|[^'])*'/g, '?')
        .replace(/\b\d+\b/g, '?')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
      h.recentSlowQueries.push({
        timestamp: new Date().toISOString(),
        durationMs: Math.round(durationMs * 100) / 100,
        statement,
      });
      const slowQueryHistoryLimit = LEGACY_X86_BUILD ? 10 : 50;
      if (h.recentSlowQueries.length > slowQueryHistoryLimit) h.recentSlowQueries.shift();
    }
  }
}

export function query<T = any>(host: DatabaseManager, sql: string, params: any[] = []): T[] {
  return trackQuery(host, sql, () => {
    const cacheKey = createQueryCacheKey(host, sql, params);
    if (cacheKey) {
      const cached = getCachedQuery<T[]>(host, `query:${cacheKey}`);
      if (cached !== undefined) return cached;
    }

    const db = host.getDatabase();
    const stmt = db.prepare(sql);
    const results: Record<string, unknown>[] = [];
    try {
      stmt.bind(params);
      while (stmt.step()) {
        results.push(snakeToCamelKeys(stmt.getAsObject()));
      }
    } finally {
      stmt.free();
    }
    if (cacheKey) setCachedQuery(host, `query:${cacheKey}`, results);
    return results as T[];
  });
}

export function run(host: DatabaseManager, sql: string, params: any[] = []): void {
  const h = host as unknown as DatabaseManagerInternals;
  trackQuery(host, sql, () => {
    clearQueryCache(host);
    const db = h.db;
    if (!db) {
      throw new Error('Database not initialized! Call DatabaseManager.getInstance().initialize() first.');
    }
    db.run(sql, params);
    markDirty(host);
    forwardMutation(host, 'run', sql, params);
    // Debounce writes outside transactions so sequential queries don't export full snapshots repeatedly
    if (h.transactionDepth === 0) {
      host.scheduleDebouncedSave();
    }
  });
}

/** Execute a bounded list query and its count query without loading all rows. */
export function queryPage<T = any>(
  host: DatabaseManager,
  dataSql: string,
  countSql: string,
  params: any[] = [],
  page = 1,
  pageSize = 25,
  countParams: any[] = params,
): { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number } {
  const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 25, 1), 100);
  const totalItems = Number(query<any>(host, countSql, countParams)[0]?.totalItems ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.min(Math.max(Math.floor(page) || 1, 1), totalPages);
  const items = query<T>(host, `${dataSql} LIMIT ? OFFSET ?`, [...params, safePageSize, (safePage - 1) * safePageSize]);
  return { items, page: safePage, pageSize: safePageSize, totalItems, totalPages };
}

export function getQueryStats(host: DatabaseManager): {
  totalQueries: number;
  failedQueries: number;
  slowQueryCount: number;
  slowestQueryMs: number;
} {
  const h = host as unknown as DatabaseManagerInternals;
  return {
    totalQueries: h.totalQueries,
    failedQueries: h.failedQueries,
    slowQueryCount: h.slowQueryCount,
    slowestQueryMs: h.slowestQueryMs,
  };
}

export function getSlowQueryStats(host: DatabaseManager): {
  thresholdMs: number;
  count: number;
  slowestQueryMs: number;
  recent: Array<{ timestamp: string; durationMs: number; statement: string }>;
} {
  const h = host as unknown as DatabaseManagerInternals;
  return {
    thresholdMs: h.slowQueryThresholdMs,
    count: h.slowQueryCount,
    slowestQueryMs: h.slowestQueryMs,
    recent: h.recentSlowQueries.map((query) => ({ ...query })),
  };
}

export function getQueryCacheStats(host: DatabaseManager): {
  entries: number;
  sizeBytes: number;
  hits: number;
  misses: number;
  hitRate: number;
} {
  const h = host as unknown as DatabaseManagerInternals;
  expireQueryCache(host);
  const requests = h.queryCacheHits + h.queryCacheMisses;
  return {
    entries: h.queryCache.size,
    sizeBytes: h.queryCacheSizeBytes,
    hits: h.queryCacheHits,
    misses: h.queryCacheMisses,
    hitRate: requests > 0 ? (h.queryCacheHits / requests) * 100 : 0,
  };
}

export function createQueryCacheKey(host: DatabaseManager, sql: string, params: unknown[]): string | null {
  const h = host as unknown as DatabaseManagerInternals;
  if (
    h.transactionDepth > 0
    || !/^\s*SELECT\b/i.test(sql)
    || /\b(random|randomblob|changes|last_insert_rowid|current_time|current_date|current_timestamp)\b/i.test(sql)
    || /\b(date|datetime|julianday|unixepoch|strftime)\s*\([^)]*['"]now['"]/i.test(sql)
    || !params.every((value) =>
      value === null
      || typeof value === 'string'
      || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))
    )
  ) {
    return null;
  }

  try {
    return JSON.stringify([sql, params]);
  } catch {
    return null;
  }
}

export function getCachedQuery<T>(host: DatabaseManager, key: string): T | undefined {
  const h = host as unknown as DatabaseManagerInternals;
  const entry = h.queryCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) {
      h.queryCache.delete(key);
      h.queryCacheSizeBytes -= entry.sizeBytes;
    }
    h.queryCacheMisses++;
    return undefined;
  }

  h.queryCacheHits++;
  h.queryCache.delete(key);
  h.queryCache.set(key, entry);
  return cloneCachedValue(entry.value) as T;
}

export function setCachedQuery(host: DatabaseManager, key: string, value: unknown): void {
  const h = host as unknown as DatabaseManagerInternals;
  if (!isCacheSafeValue(value)) return;
  let sizeBytes: number;
  try {
    sizeBytes = JSON.stringify(value).length * 2;
  } catch {
    return;
  }
  if (sizeBytes > h.queryCacheMaxEntryBytes) return;

  const previous = h.queryCache.get(key);
  if (previous) h.queryCacheSizeBytes -= previous.sizeBytes;
  h.queryCache.delete(key);
  h.queryCache.set(key, {
    expiresAt: Date.now() + h.queryCacheTtlMs,
    sizeBytes,
    value: cloneCachedValue(value),
  });
  h.queryCacheSizeBytes += sizeBytes;
  expireQueryCache(host);
}

function cloneCachedValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall back to JSON serialization if object contains non-cloneable items
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function isCacheSafeValue(value: unknown): boolean {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) return true;
  if (Array.isArray(value)) return value.every((item) => isCacheSafeValue(item));
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every((item) => isCacheSafeValue(item));
}

function expireQueryCache(host: DatabaseManager): void {
  const h = host as unknown as DatabaseManagerInternals;
  const now = Date.now();
  for (const [key, entry] of h.queryCache) {
    if (entry.expiresAt <= now) {
      h.queryCache.delete(key);
      h.queryCacheSizeBytes -= entry.sizeBytes;
    }
  }

  while (
    h.queryCache.size > h.queryCacheMaxEntries
    || h.queryCacheSizeBytes > h.queryCacheMaxSizeBytes
  ) {
    const oldest = h.queryCache.entries().next();
    if (oldest.done) break;
    h.queryCache.delete(oldest.value[0]);
    h.queryCacheSizeBytes -= oldest.value[1].sizeBytes;
  }
}

export function isMutatingSql(sql: string): boolean {
  if (/\b(insert|update|delete|replace|create|drop|alter|vacuum|reindex|attach|detach)\b/i.test(sql)) {
    return true;
  }
  return !/^\s*(select|explain|pragma|begin|commit|savepoint|release|rollback)\b/i.test(sql);
}

export function clearQueryCache(host: DatabaseManager): void {
  const h = host as unknown as DatabaseManagerInternals;
  h.queryCache.clear();
  h.queryCacheSizeBytes = 0;
}
