/**
 * In-memory cache for small, frequently reused application values.
 */

interface CacheItem<T> {
  data: T;
  expiresAt: number;
  size: number;
  hits: number;
  tags: Set<string>;
}

export interface CacheOptions {
  maxEntries?: number;
  maxLifetimeMs?: number;
  maxSizeBytes?: number;
  epsilon?: number;
}

type CacheKey = string | number | boolean;

class LocalCacheService {
  private static instance: LocalCacheService;
  private cache = new Map<string, CacheItem<unknown>>();
  private maxEntries = 100;
  private maxLifetimeMs = 5 * 60 * 1000;
  private maxSizeBytes = 50 * 1024 * 1024;
  private epsilon = 0.01;
  private hits = 0;
  private misses = 0;

  private constructor(options?: CacheOptions) {
    if (options) Object.assign(this, options);
  }

  static getInstance(options?: CacheOptions): LocalCacheService {
    if (!LocalCacheService.instance) {
      LocalCacheService.instance = new LocalCacheService(options);
    }
    return LocalCacheService.instance;
  }

  private calculateSize(data: unknown): number {
    try {
      const serialized = JSON.stringify(data);
      return (serialized ?? String(data)).length * 2;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  private remove(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Store an item until its individual lifetime expires.
   */
  set<K extends CacheKey>(key: K, data: unknown, lifetimeMs?: number): void {
    const keyStr = String(key);
    const size = this.calculateSize(data);
    const tags = this.cache.get(keyStr)?.tags ?? new Set<string>();
    this.remove(keyStr);
    if (!Number.isFinite(size) || size > this.maxSizeBytes) return;

    const now = Date.now();
    this.cache.set(keyStr, {
      data,
      expiresAt: now + Math.max(0, lifetimeMs ?? this.maxLifetimeMs),
      size,
      hits: 0,
      tags,
    });
    this.expire();
  }

  /**
   * Return a cached item, or null when it is missing or expired.
   */
  get<K extends CacheKey, T = unknown>(key: K): T | null {
    const keyStr = String(key);
    const entry = this.cache.get(keyStr);
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) this.remove(keyStr);
      this.misses++;
      return null;
    }

    this.hits++;
    entry.hits++;
    this.cache.delete(keyStr);
    this.cache.set(keyStr, entry);
    return entry.data as T;
  }

  delete(key: CacheKey): void {
    this.remove(String(key));
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Remove expired entries and evict least-recently-used entries when bounded
   * cache limits are exceeded.
   */
  expire(_force = false): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.remove(key);
    }

    let totalSize = 0;
    for (const entry of this.cache.values()) totalSize += entry.size;
    while (this.cache.size > this.maxEntries || totalSize > this.maxSizeBytes) {
      const oldest = this.cache.entries().next();
      if (oldest.done) break;
      totalSize -= oldest.value[1].size;
      this.remove(oldest.value[0]);
    }
  }

  getMultiple<T = unknown>(
    keys: readonly CacheKey[],
    loadCallback: (key: CacheKey) => T | null
  ): Map<CacheKey, T> {
    const result = new Map<CacheKey, T>();
    for (const key of keys) {
      const value = this.get<CacheKey, T>(key);
      if (value !== null) {
        result.set(key, value);
        continue;
      }

      const loaded = loadCallback(key);
      if (loaded !== null) {
        this.set(key, loaded);
        result.set(key, loaded);
      }
    }
    return result;
  }

  getStats(): {
    count: number;
    sizeBytes: number;
    maxEntries: number;
    maxSizeBytes: number;
    hitRate: number;
  } {
    this.expire();
    let sizeBytes = 0;
    for (const entry of this.cache.values()) sizeBytes += entry.size;
    const requests = this.hits + this.misses;
    return {
      count: this.cache.size,
      sizeBytes,
      maxEntries: this.maxEntries,
      maxSizeBytes: this.maxSizeBytes,
      hitRate: requests > 0 ? (this.hits / requests) * 100 : 0,
    };
  }

  resetEpsilon(epsilon?: number): void {
    this.epsilon = epsilon ?? 0.01;
  }

  taggedSet(tag: string, key: CacheKey, data: unknown, lifetimeMs?: number): void {
    this.set(key, data, lifetimeMs);
    this.cache.get(String(key))?.tags.add(tag);
  }

  getTagged<T = unknown>(tag: string): T[] {
    this.expire();
    const result: T[] = [];
    for (const entry of this.cache.values()) {
      if (entry.tags.has(tag)) result.push(entry.data as T);
    }
    return result;
  }

  purgeByTag(tag: string): void {
    for (const [key, entry] of this.cache) {
      if (entry.tags.has(tag)) this.remove(key);
    }
  }
}

export const localCache = LocalCacheService.getInstance();
