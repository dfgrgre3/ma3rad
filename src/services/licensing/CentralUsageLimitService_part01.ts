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

export /** قيم نصية تعني "بلا حدود" في حمولة الإدارة المركزية. */
const UNLIMITED_TOKENS = new Set(['unlimited', 'plan', 'none', 'null', 'undefined', '']);

export /** مفتاح الحد المركزي -> المفاتيح المقبولة من حمولات إصدارات سابقة. */
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

export /** كل مقياس يُقاس من قاعدة البيانات المحلية بمصدر واحد موثوق (عدّ صفوف). */
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

export const UNLIMITED_STATE = (metric: CentralUsageMetric): CentralUsageState => ({
  metric,
  limited: false,
  allowed: null,
  used: null,
  reached: false,
});

export /** رسالة عربية واضحة لكل مقياس عند بلوغ الحد المركزي. */
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
