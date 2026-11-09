import { DatabaseManager } from '../../database/repositories/databaseManager';
import { CentralLicenseService } from './CentralLicenseService';
import { COUNTERS, LIMIT_MESSAGES, METRIC_KEYS, UNLIMITED_STATE, UNLIMITED_TOKENS } from './CentralUsageLimitService_part01';
import type { CentralUsageMetric, CentralUsageState } from './CentralUsageLimitService_part01';

export class CentralUsageLimitService {
  /** كل المقاييس المدعومة محليًا. */
  static metrics(): CentralUsageMetric[] {
    return Object.keys(METRIC_KEYS) as CentralUsageMetric[];
  }

  static getState(metric: CentralUsageMetric): CentralUsageState {
    const allowed = CentralUsageLimitService.readAllowed(metric);
    if (allowed === null) return UNLIMITED_STATE(metric);
    const used = CentralUsageLimitService.count(metric);
    // قياس فاشل أو غير متوفر = لا نمنع العمل أبدًا.
    if (used === null) return { metric, limited: true, allowed, used: null, reached: false };
    return { metric, limited: true, allowed, used, reached: used >= allowed };
  }

  /** بلوغ الحد => إخفاء الإجراء المرتبط بالكامل. */
  static isReached(metric: CentralUsageMetric): boolean {
    return CentralUsageLimitService.getState(metric).reached;
  }

  /**
   * حارس على مستوى طبقة الخدمات: يمنع إضافة سجل جديد عند بلوغ الحد المركزي،
   * حتى لو تجاوز المستخدم الواجهة أو استُدعيت الخدمة من مسار آخر.
   * فشل القياس لا يمنع العمل (استمرارية الأعمال أولًا).
   */
  static assertWithin(metric: CentralUsageMetric): void {
    if (CentralUsageLimitService.isReached(metric)) {
      throw new Error(LIMIT_MESSAGES[metric]);
    }
  }

  static listAll(): CentralUsageState[] {
    return CentralUsageLimitService.metrics().map((m) => CentralUsageLimitService.getState(m));
  }

  private static readAllowed(metric: CentralUsageMetric): number | null {
    const limits = CentralLicenseService.getUsageLimits();
    for (const key of METRIC_KEYS[metric]) {
      if (limits[key] === undefined || limits[key] === null) continue;
      return CentralUsageLimitService.toAllowed(limits[key]);
    }
    return null;
  }

  private static toAllowed(raw: unknown): number | null {
    if (typeof raw === 'string') {
      const token = raw.trim().toLowerCase();
      if (UNLIMITED_TOKENS.has(token)) return null;
      const numeric = Number(token.replace(/[^0-9.]/g, ''));
      return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  private static count(metric: CentralUsageMetric): number | null {
    try {
      if (metric === 'storageGb') return CentralUsageLimitService.storageGb();
      const rows = DatabaseManager.getInstance().query<{ c: number }>(COUNTERS[metric]);
      const value = Number(rows[0]?.c);
      return Number.isFinite(value) ? value : null;
    } catch {
      // قاعدة البيانات غير جاهزة أو الاستعلام غير مدعوم => لا نفرض حدًا.
      return null;
    }
  }

  /** حجم قاعدة البيانات الحالي بالجيجابايت (pageCount × pageSize). */
  private static storageGb(): number | null {
    try {
      const db = DatabaseManager.getInstance();
      // ملاحظة: query() يمرّر الأعمدة عبر snakeToCamelKeys، لذا المفتاح pageCount لا page_count.
      const pageCount = Number(db.query<Record<string, unknown>>('PRAGMA page_count')[0]?.pageCount);
      const pageSize = Number(db.query<Record<string, unknown>>('PRAGMA page_size')[0]?.pageSize);
      if (!Number.isFinite(pageCount) || !Number.isFinite(pageSize) || pageSize <= 0) return null;
      return (pageCount * pageSize) / (1024 * 1024 * 1024);
    } catch {
      return null;
    }
  }
}
