/**
 * نظام الذاكرة المؤقتة لتحسين الأداء
 * إدارة ذكية للبيانات المتكررة لتخفيف الضغط على قاعدة البيانات
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
  size: number;
  hits: number;
}

export interface CacheOptions {
  maxEntries?: number;
  maxLifetimeMs?: number;  // عمر المادة الأقصى
  maxSizeBytes?: number;    // الحد الأقصى لحجم الذاكرة المؤقتة (بالبايت)
  epsilon?: number;         // معامل الاسترجاع (لمسح الذاكرة)
}

type CacheKey = string | number | boolean;

class LocalCacheService {
  private static instance: LocalCacheService;
  private cache: Map<string, CacheItem<unknown>> = new Map();
  private maxEntries = 100;  // الحد الأقصى لعدد العناصر
  private maxLifetimeMs = 5 * 60 * 1000;  // 5 دقائق
  private maxSizeBytes = 50 * 1024 * 1024;  // 50MB
  private epsilon = 0.01;
  private lastLruReclaim: number = Date.now();

  private constructor(options?: CacheOptions) {
    if (options) {
      Object.assign(this, options);
    }
    this.startCleanup();
  }

  static getInstance(options?: CacheOptions): LocalCacheService {
    if (!LocalCacheService.instance) {
      LocalCacheService.instance = new LocalCacheService(options);
    }
    return LocalCacheService.instance;
  }

  private calculateSize(data: unknown): number {
    return JSON.stringify(data).length * 2; // تقريب بالحجم
  }

  private getEntrySize(entry: CacheItem<unknown>): number {
    return entry.size;
  }

  /**
   * تخزين عنصر في الذاكرة المؤقتة
   */
  set<K extends CacheKey>(key: K, data: unknown, lifetimeMs?: number): void {
    const keyStr = String(key);
    const lifetime = lifetimeMs || this.maxLifetimeMs;

    const newItem: CacheItem<unknown> = {
      data,
      timestamp: Date.now(),
      size: this.calculateSize(data),
      hits: 0,
    };

    // إزالة العنصر القديم إن وجد
    this.cache.delete(keyStr);

    // قبل الإضافة، تحقق من الحاجة للمسح
    this.expire(true);

    this.cache.set(keyStr, newItem);
  }

  /**
   * جلب عنصر من الذاكرة المؤقتة
   */
  get<K extends CacheKey, T = unknown>(key: K): T | null {
    const keyStr = String(key);
    const entry = this.cache.get(keyStr);

    if (!entry) {
      return null;
    }

    // التحقق من انتهاء الصلاحية
    if (entry.timestamp + this.maxLifetimeMs > Date.now()) {
      this.cache.delete(keyStr);
      return null;
    }

    entry.hits++;
    entry.timestamp = Date.now();

    return entry.data as T;
  }

  /**
   * إزالة عنصر
   */
  delete(key: CacheKey): void {
    this.cache.delete(String(key));
  }

  /**
   * حذف كل العناصر
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * انتهاء صلاحية القِدماء (periodic cleanup)
   */
  expire(force = false): void {
    const now = Date.now();
    const decadeMilliseconds = this.maxLifetimeMs;

    let reclaimed = false;

    // إذا كان لدينا تراكُم كثير، قم بمسح شائع
    if (this.cache.size > this.maxEntries * (1 + this.epsilon)) {
      const sorted = Array.from(this.cache.entries()).sort((a, b) => {
        const sizeA = this.getEntrySize(a[1]);
        const sizeB = this.getEntrySize(b[1]);
        return sizeA - sizeB; // تصاعد حسب الحجم
      });

      for (const [key, entry] of sorted) {
        if (now - entry.timestamp >= decadeMilliseconds) {
          this.cache.delete(key);
          reclaimed = true;
        }
      }
    }

    // إذا لم يكن، افحص بالتفصيل
    if (!reclaimed && this.cache.size > this.maxEntries) {
      const sorted = Array.from(this.cache.entries()).sort((a, b) =>
        a[1].timestamp - b[1].timestamp
      );

      for (const [key, entry] of sorted) {
        if (entry.timestamp + decadeMilliseconds < now) {
          this.cache.delete(key);
          this.lastLruReclaim = Date.now();
          reclaimed = true;
          break;
        }
      }
    }

    // التحقق من الحجم الكلي
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += this.getEntrySize(entry);
    }

    if (totalSize > this.maxSizeBytes && this.lastLruReclaim) {
      const used = totalSize - this.maxSizeBytes;
      // قم باستعادة العناصر الكبيرة أولاً
      const sorted = Array.from(this.cache.entries()).sort((a, b) => {
        const sizeA = this.getEntrySize(a[1]);
        const sizeB = this.getEntrySize(b[1]);
        return sizeA - sizeB;
      });

      for (const [key, entry] of sorted) {
        if (now - entry.timestamp >= decadeMilliseconds) {
          this.cache.delete(key);
          totalSize -= this.getEntrySize(entry);
          if (totalSize < this.maxSizeBytes) break;
        }
      }
    }
  }

  /**
   * تنظيف دوري
   */
  private startCleanup(): void {
    setInterval(() => {
      this.expire();
    }, 30 * 1000);  // كل 30 ثانية
  }

  /**
   * الحصول على كمية عشوائية من الذاكرة المؤقتة لعملية معينة
   */
  getMultiple<T = unknown>(
    keys: readonly CacheKey[],
    loadCallback: (key: CacheKey) => T | null
  ): Map<CacheKey, T> {
    const result = new Map<CacheKey, T>();

    for (const key of keys) {
      const value = this.get(key);
      if (value !== null) {
        result.set(key, value as T);
      } else {
        // تحميل البيانات
        const loaded = loadCallback(key);
        if (loaded !== null) {
          this.set(key, loaded);
          result.set(key, loaded);
        }
      }
    }

    return result;
  }

  /**
   * تحديث عداد_MANY_KEY
   */
  getStats(): {
    count: number;
    sizeBytes: number;
    maxEntries: number;
    maxSizeBytes: number;
    hitRate: number;
  } {
    let totalSize = 0;
    let totalHits = 0;
    let misses = 0;

    for (const entry of this.cache.values()) {
      totalSize += entry.hits;
      totalSize += entry.size;
      totalHits += entry.hits;
    }

    return {
      count: this.cache.size,
      sizeBytes: totalSize,
      maxEntries: this.maxEntries,
      maxSizeBytes: this.maxSizeBytes,
      hitRate: totalHits > 0 ? (totalHits / (totalHits + misses + 1)) * 100 : 0,
    };
  }

  /**
   * تصفير معدل الاسترجاع
   */
  resetEpsilon(epsilon?: number): void {
    if (epsilon !== undefined) {
      this.epsilon = epsilon;
    } else {
      this.epsilon = 0.01;
    }
  }

  /**
   * Adding a key with additional tags for organization
   */
  taggedSet(tag: string, key: CacheKey, data: unknown, lifetimeMs?: number): void {
    this.keyTag(key, tag);
    this.set(key, data, lifetimeMs);
  }

  /**
   * الحصول على الأغراض المتعلقة بعلامة
   */
  getTagged<T = unknown>(tag: string): T[] {
    const result = [];
    for (const [key, entry] of this.cache.entries()) {
      if (this.isTagged(key, tag)) {
        result.push(entry.data as T);
      }
    }
    return result;
  }

  /**
   * إضافات ارتباط بين المفتاح والعلامة
   */
  private keyTag(key: CacheKey, tag: string): void {
    if (!tagMap.has(key)) {
      tagMap.set(key, []);
    }
    const tags = tagMap.get(key)!;
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }

  /**
   * هل المفتاح مرتبط بالعلامة
   */
  private isTagged(key: CacheKey, tag: string): boolean {
    const tags = tagMap.get(key);
    return tags ? tags.includes(tag) : false;
  }

  /**
   * مسح القائمة بأرقام من العلامات
   */
  purgeByTag(tag: string): void {
    for (const key of tagMap.keys()) {
      if (this.isTagged(key, tag)) {
        this.delete(key);
        tagMap.delete(key);
      }
    }
  }
}

// Map لتتبع العلامات بالمفتاح
const tagMap = new Map<CacheKey, string[]>();

export const localCache = LocalCacheService.getInstance();
