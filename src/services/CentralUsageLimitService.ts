import { DatabaseManager } from '../database/db';
import { CentralLicenseService } from './CentralLicenseService';

/**
 * الحدود التي تنشرها منصة الإدارة المركزية داخل حمولة التكوين الموقّعة
 * (`config.usageLimits`) وتُترجم هنا إلى عدّ فعلي محلي، حتى تُخفى الأزرار
 * والصفحات بالكامل عند بلوغ الحد.
 */
export type CentralUsageMetric =
  | 'maxUsers'
  | 'maxBranches'
  | 'maxWarehouses'
  | 'maxEmployees'
  | 'maxInvoices'
  | 'maxProducts'
  | 'maxFacilities'
  | 'maxPos'
  | 'storageGb';

export interface CentralUsageState {
  metric: CentralUsageMetric;
  /** يوجد سقف رقمي منشور من الإدارة المركزية. */
  limited: boolean;
  /** السقف المنشور من الإدارة، أو null عندما يكون غير محدود. */
  allowed: number | null;
  /** الاستخدام المحلي الحالي، أو null عندما يتعذّر قياسه. */
  used: number | null;
  /** بلوغ السقف => يجب إخفاء الإجراء بالكامل. */
  reached: boolean;
}

/** قيم نصية تعني "بلا حدود" في حمولة الإدارة المركزية. */
const UNLIMITED_TOKENS = new Set(['unlimited', 'plan', 'none', 'null', 'undefined', '']);

/** مفتاح الحد المركزي -> المفاتيح المقبولة من حمولات إصدارات سابقة. */
const METRIC_KEYS: Record<CentralUsageMetric, string[]> = {
  maxUsers: ['maxUsers'],
  maxBranches: ['maxBranches'],
  maxWarehouses: ['maxWarehouses'],
  maxEmployees: ['maxEmployees'],
  maxInvoices: ['maxInvoices', 'maxMonthlyInvoices'],
  maxProducts: ['maxProducts'],
  maxFacilities: ['maxFacilities', 'maxEstablishments'],
  maxPos: ['maxPos', 'maxPosTerminals'],
  storageGb: ['storageGb', 'maxStorageGb'],
};

/** كل مقياس يُقاس من قاعدة البيانات المحلية بمصدر واحد موثوق (عدّ صفوف). */
const COUNTERS: Record<Exclude<CentralUsageMetric, 'storageGb'>, string> = {
  maxUsers: 'SELECT COUNT(*) AS c FROM users WHERE is_active = 1',
  maxBranches: 'SELECT COUNT(*) AS c FROM branches WHERE is_active = 1',
  maxWarehouses: 'SELECT COUNT(*) AS c FROM warehouses WHERE is_active = 1',
  maxEmployees: 'SELECT COUNT(*) AS c FROM employees WHERE is_active = 1',
  maxInvoices: `SELECT COUNT(*) AS c FROM sales_invoices
                WHERE invoice_status <> 'VOID'
                  AND substr(date, 1, 7) = strftime('%Y-%m', 'now')`,
  maxProducts: 'SELECT COUNT(*) AS c FROM products WHERE is_active = 1',
  // «المنشآت» = الكيانات القانونية (companies) المحلية.
  maxFacilities: 'SELECT COUNT(*) AS c FROM companies WHERE is_active = 1',
  // «نقاط البيع» = صناديق/خزائن نقاط البيع المسجّلة محليًا.
  maxPos: 'SELECT COUNT(*) AS c FROM cash_registers WHERE is_active = 1',
};

const UNLIMITED_STATE = (metric: CentralUsageMetric): CentralUsageState => ({
  metric,
  limited: false,
  allowed: null,
  used: null,
  reached: false,
});

/** رسالة عربية واضحة لكل مقياس عند بلوغ الحد المركزي. */
const LIMIT_MESSAGES: Record<CentralUsageMetric, string> = {
  maxUsers: 'تم بلوغ الحد الأقصى للمستخدمين المسموح به في ترخيص المنصة المركزية.',
  maxBranches: 'تم بلوغ الحد الأقصى للفروع المسموح به في ترخيص المنصة المركزية.',
  maxWarehouses: 'تم بلوغ الحد الأقصى للمخازن المسموح به في ترخيص المنصة المركزية.',
  maxEmployees: 'تم بلوغ الحد الأقصى للموظفين المسموح به في ترخيص المنصة المركزية.',
  maxInvoices: 'تم بلوغ الحد الشهري الأقصى للفواتير في ترخيص المنصة المركزية.',
  maxProducts: 'تم بلوغ الحد الأقصى للمنتجات المسموح به في ترخيص المنصة المركزية.',
  maxFacilities: 'تم بلوغ الحد الأقصى للمنشآت/الكيانات القانونية المسموح به في ترخيص المنصة المركزية.',
  maxPos: 'تم بلوغ الحد الأقصى لنقاط البيع المسموح به في ترخيص المنصة المركزية.',
  storageGb: 'تم بلوغ الحد الأقصى لمساحة التخزين المسموح بها في ترخيص المنصة المركزية.',
};

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
