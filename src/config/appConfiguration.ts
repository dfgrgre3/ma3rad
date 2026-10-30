/**
 * Dynamic Application Configuration Engine — shared schema.
 *
 * The engine stores administrator overrides for page/section/field visibility,
 * labels, text values, policies, document numbering and print templates.
 * Definitions in this file are pure and safe to import from services, React
 * components and tests. No database or React dependency belongs here.
 */

export const APP_CONFIG_SCHEMA_VERSION = 1 as const;

export type AppConfigDomain =
  | 'page'
  | 'section'
  | 'field'
  | 'text'
  | 'module'
  | 'action'
  | 'feature'
  | 'policy'
  | 'numbering'
  | 'print';

export const APP_CONFIG_DOMAINS: readonly AppConfigDomain[] = [
  'page', 'section', 'field', 'text', 'module', 'action', 'feature',
  'policy', 'numbering', 'print',
] as const;

export const APP_CONFIG_DOMAIN_LABELS: Record<AppConfigDomain, string> = {
  page: 'الصفحات',
  section: 'أقسام الصفحات',
  field: 'الحقول',
  text: 'النصوص',
  module: 'الوحدات',
  action: 'الأزرار والإجراءات',
  feature: 'أعلام الميزات',
  policy: 'السياسات',
  numbering: 'ترقيم المستندات',
  print: 'قوالب الطباعة',
};

export interface AppConfigEntry {
  domain: AppConfigDomain;
  key: string;
  /** Visibility switch. Defaults to true when no entry exists. */
  enabled: boolean;
  /** Display label override (page, section, field, text title). */
  label: string;
  /** Text/policy/numbering/print value. */
  value: string;
  /** Optional ordering index inside its container. */
  order?: number;
  /** Makes a configured field required. */
  required?: boolean;
  /** Extra typed options (numbering template, policy type, selector, ...). */
  props: Record<string, unknown>;
}

export type AppConfigRuleAction = 'hide' | 'show' | 'text';

export interface AppConfigRule {
  id: string;
  /** `selector` targets a DOM element; `text` replaces an exact visible string. */
  kind: 'selector' | 'text';
  /** Page path the rule applies to, or `*` for every page. */
  pagePath: string;
  selector?: string;
  matchText?: string;
  replacementText?: string;
  action: AppConfigRuleAction;
  enabled: boolean;
  note?: string;
}

export interface AppConfigSnapshot {
  schemaVersion: typeof APP_CONFIG_SCHEMA_VERSION;
  entries: AppConfigEntry[];
  rules: AppConfigRule[];
}

export interface AppConfigNumbering {
  prefix: string;
  template: string;
  /** Reset the sequence each calendar year (informational for callers). */
  resetYearly: boolean;
}

export const DEFAULT_NUMBER_TEMPLATE = '{prefix}-{year}-{seq:6}';

export const APP_CONFIG_TEXT_CATALOG: Array<{ key: string; label: string; value: string }> = [
  { key: 'shell.status.database', label: 'حالة الاتصال بقاعدة البيانات', value: 'قاعدة البيانات متصلة' },
  { key: 'shell.brand.name', label: 'اسم العلامة في شريط الحالة', value: 'سيراميسيس' },
  { key: 'shell.loading', label: 'نص التحميل', value: 'جاري التحميل...' },
  { key: 'shell.footer.today', label: 'تسمية تاريخ اليوم', value: 'اليوم' },
  { key: 'common.save', label: 'حفظ', value: 'حفظ التغييرات' },
  { key: 'common.cancel', label: 'إلغاء', value: 'إلغاء' },
  { key: 'common.search', label: 'بحث', value: 'بحث' },
];

export const APP_CONFIG_POLICY_CATALOG: Array<{
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  fallback: string;
  description: string;
}> = [
  {
    key: 'sales.discountApprovalThreshold',
    label: 'حد الموافقة على الخصم (%)',
    type: 'number',
    fallback: '',
    description: 'الخصومات التي تتجاوز هذه النسبة تتطلب موافقة. اتركه فارغًا لاستخدام إعدادات النظام.',
  },
  {
    key: 'pricing.requirePriceChangeApproval',
    label: 'اعتماد تغيير الأسعار',
    type: 'boolean',
    fallback: '',
    description: 'يتجاوز إعداد «طلب موافقة على تغيير الأسعار» العام.',
  },
  {
    key: 'inventory.requireStockAdjustmentApproval',
    label: 'اعتماد تسويات المخزون',
    type: 'boolean',
    fallback: '',
    description: 'يتجاوز إعداد «طلب موافقة على تسويات المخزون» العام.',
  },
  {
    key: 'security.sessionTimeoutMinutes',
    label: 'مهلة الخمول بالدقائق',
    type: 'number',
    fallback: '',
    description: 'تسجيل خروج تلقائي بعد هذه المدة بلا نشاط. اتركه فارغًا لاستخدام إعدادات النظام.',
  },
  {
    key: 'inventory.lowStockThreshold',
    label: 'حد التنبيه للمخزون المنخفض',
    type: 'number',
    fallback: '',
    description: 'يتجاوز حد التنبيه العام للمخزون.',
  },
  {
    key: 'sales.defaultDeliveryFee',
    label: 'رسوم التوصيل الافتراضية',
    type: 'number',
    fallback: '',
    description: 'رسوم التوصيل المقترحة في الفواتير الجديدة.',
  },
];

export const APP_CONFIG_NUMBERING_CATALOG: Array<{ key: string; label: string }> = [
  { key: 'INV', label: 'فواتير البيع' },
  { key: 'PUR', label: 'فواتير الشراء' },
  { key: 'QUO', label: 'عروض الأسعار' },
  { key: 'SO', label: 'أوامر البيع' },
  { key: 'PO', label: 'أوامر الشراء' },
  { key: 'RET', label: 'مرتجعات البيع' },
  { key: 'PRET', label: 'مرتجعات الشراء' },
  { key: 'REC', label: 'سندات الاستلام' },
  { key: 'PAY', label: 'سندات الصرف' },
  { key: 'TX', label: 'الحركات المخزنية' },
  { key: 'JRN', label: 'القيود اليومية' },
  { key: 'CNT', label: 'الجرد' },
];

export const APP_CONFIG_PRINT_CATALOG: Array<{ key: string; label: string }> = [
  { key: 'sales.invoice.a4', label: 'فاتورة بيع A4 — عنوان المستند' },
  { key: 'sales.invoice.a4.footer', label: 'فاتورة بيع A4 — التذييل' },
  { key: 'sales.invoice.receipt', label: 'إيصال بيع حراري — عنوان المستند' },
  { key: 'sales.invoice.receipt.footer', label: 'إيصال بيع حراري — التذييل' },
  { key: 'purchase.invoice.a4', label: 'فاتورة شراء A4 — عنوان المستند' },
  { key: 'quotation.a4', label: 'عرض سعر A4 — عنوان المستند' },
  { key: 'quotation.a4.footer', label: 'عرض سعر A4 — التذييل' },
  { key: 'statement.customer', label: 'كشف حساب عميل — عنوان المستند' },
  { key: 'statement.supplier', label: 'كشف حساب مورد — عنوان المستند' },
];

const PAGE_KEY_PATTERN = /^\/[A-Za-z0-9_\-./:*?]*$/;
const ENTRY_KEY_PATTERN = /^\/?[A-Za-z0-9\u0600-\u06FF][A-Za-z0-9\u0600-\u06FF_.:/#@-]{0,199}$/;
const DOMAIN_SET = new Set<string>(APP_CONFIG_DOMAINS);

export function normalizePagePath(input: unknown): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw || raw === '*') return '*';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const collapsed = withSlash.replace(/\/{2,}/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : '/';
}

export function normalizeConfigKey(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

export function entryId(domain: AppConfigDomain, key: string): string {
  return `${domain}:${key}`;
}

export function isAppConfigDomain(value: unknown): value is AppConfigDomain {
  return typeof value === 'string' && DOMAIN_SET.has(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedString(
  value: unknown,
  label: string,
  maxLength: number,
  { allowEmpty = true }: { allowEmpty?: boolean } = {},
): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new Error(`${label} يجب أن يكون نصًا.`);
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) throw new Error(`${label} مطلوب.`);
  if (trimmed.length > maxLength) throw new Error(`${label} أطول من الحد المسموح (${maxLength} حرف).`);
  return trimmed;
}

function boundedInteger(value: unknown, label: string, min: number, max: number): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${label} يجب أن يكون رقمًا.`);
  const integer = Math.trunc(numeric);
  if (integer < min || integer > max) throw new Error(`${label} يجب أن يكون بين ${min} و${max}.`);
  return integer;
}

export function validateAppConfigEntry(input: unknown): AppConfigEntry {
  const record = asRecord(input);
  if (!isAppConfigDomain(record.domain)) throw new Error('نوع هدف التكوين غير معروف.');
  const key = normalizeConfigKey(record.key);
  if (!key || !ENTRY_KEY_PATTERN.test(key)) {
    throw new Error('مفتاح هدف التكوين غير صالح. استخدم حروفًا وأرقامًا ورموزًا بسيطة فقط.');
  }
  if (record.domain === 'page' && !PAGE_KEY_PATTERN.test(key)) {
    throw new Error('مسار الصفحة يجب أن يبدأ بشرطة مائلة /.');
  }
  const label = boundedString(record.label, 'التسمية', 160);
  const value = boundedString(record.value, 'القيمة', 4000);
  const order = boundedInteger(record.order, 'الترتيب', -10000, 10000);
  const props = asRecord(record.props);
  const serializedProps = JSON.stringify(props);
  if (serializedProps.length > 8000) throw new Error('خيارات التكوين الإضافية كبيرة جدًا.');

  return {
    domain: record.domain,
    key,
    enabled: record.enabled === undefined ? true : record.enabled === true || record.enabled === 1 || record.enabled === '1' || record.enabled === 'true',
    label,
    value,
    ...(order !== undefined ? { order } : {}),
    ...(record.required === undefined
      ? {}
      : { required: record.required === true || record.required === 1 || record.required === '1' || record.required === 'true' }),
    props,
  };
}

export function validateAppConfigRule(input: unknown): AppConfigRule {
  const record = asRecord(input);
  const kind = record.kind === 'text' ? 'text' : record.kind === 'selector' ? 'selector' : null;
  if (!kind) throw new Error('نوع قاعدة التكوين غير معروف.');
  const pagePath = normalizePagePath(record.pagePath);
  const action: AppConfigRuleAction =
    record.action === 'show' ? 'show' : record.action === 'text' ? 'text' : 'hide';
  if (kind === 'selector' && action === 'text' && !boundedString(record.replacementText, 'النص البديل', 2000)) {
    throw new Error('قاعدة استبدال عنصر تحتاج نصًا بديلًا.');
  }

  const id = boundedString(record.id, 'معرّف القاعدة', 120) || `rule_${Math.random().toString(36).slice(2, 10)}`;
  const selector = kind === 'selector'
    ? boundedString(record.selector, 'محدد العنصر', 400, { allowEmpty: false })
    : '';
  const matchText = kind === 'text'
    ? boundedString(record.matchText, 'النص الأصلي', 300, { allowEmpty: false })
    : '';
  const replacementText = boundedString(record.replacementText, 'النص البديل', 2000);
  const note = boundedString(record.note, 'ملاحظة القاعدة', 300);

  if (kind === 'text' && !replacementText && action !== 'hide') {
    throw new Error('قاعدة النص تحتاج نصًا بديلًا (يمكن أن يكون فارغًا فقط مع الإخفاء).');
  }

  return {
    id,
    kind,
    pagePath,
    ...(selector ? { selector } : {}),
    ...(matchText ? { matchText } : {}),
    ...(kind === 'text' || action === 'text' ? { replacementText } : {}),
    action,
    enabled: record.enabled === undefined ? true : record.enabled === true || record.enabled === 1 || record.enabled === '1' || record.enabled === 'true',
    ...(note ? { note } : {}),
  };
}

export function validateAppConfigSnapshot(input: unknown): AppConfigSnapshot {
  const record = asRecord(input);
  if (record.schemaVersion !== APP_CONFIG_SCHEMA_VERSION) {
    throw new Error('إصدار مخطط التكوين غير مدعوم.');
  }
  if (!Array.isArray(record.entries)) throw new Error('ملف التكوين يفتقد قائمة الأهداف.');
  if (!Array.isArray(record.rules)) throw new Error('ملف التكوين يفتقد قائمة القواعد.');
  if (record.entries.length > 3000) throw new Error('عدد أهداف التكوين يتجاوز الحد المسموح.');
  if (record.rules.length > 800) throw new Error('عدد قواعد التكوين يتجاوز الحد المسموح.');

  const entryMap = new Map<string, AppConfigEntry>();
  for (const raw of record.entries) {
    const entry = validateAppConfigEntry(raw);
    entryMap.set(entryId(entry.domain, entry.key), entry);
  }
  const ruleMap = new Map<string, AppConfigRule>();
  for (const raw of record.rules) {
    const rule = validateAppConfigRule(raw);
    ruleMap.set(rule.id, rule);
  }

  return {
    schemaVersion: APP_CONFIG_SCHEMA_VERSION,
    entries: [...entryMap.values()],
    rules: [...ruleMap.values()],
  };
}

export function parseAppConfigSnapshot(raw: unknown): AppConfigSnapshot {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return { schemaVersion: APP_CONFIG_SCHEMA_VERSION, entries: [], rules: [] };
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new Error(`تعذر قراءة ملف التكوين: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return validateAppConfigSnapshot(value);
}

export function serializeAppConfigSnapshot(snapshot: AppConfigSnapshot): string {
  return JSON.stringify({
    schemaVersion: APP_CONFIG_SCHEMA_VERSION,
    entries: snapshot.entries,
    rules: snapshot.rules,
  });
}

/**
 * Keys that encode a security or licensing decision. These may only be
 * distributed from the platform/tenant layer and must never be weakened by a
 * branch, device or user override.
 */
export function isSecuritySensitiveConfigKey(domain: AppConfigDomain, key: string): boolean {
  if (domain === 'policy') return key.startsWith('security.') || key.startsWith('license.');
  if (domain === 'feature') return true;
  if (domain === 'module') return true;
  if (domain === 'action') {
    const normalized = key.toLowerCase();
    return normalized.includes('permission') || normalized.includes('role');
  }
  return false;
}

/** Apply a `{prefix}`, `{year}`, `{month}`, `{day}` or `{seq:N}` template. */
export function formatDocumentNumber(
  template: string,
  values: { prefix: string; seq: number; date?: Date },
): string {
  const date = values.date ?? new Date();
  const seq = Math.max(0, Math.trunc(values.seq));
  const source = template.trim() || DEFAULT_NUMBER_TEMPLATE;
  return source.replace(/\{(prefix|year|month|day|seq(?::(\d{1,3}))?)\}/g, (_match, token: string, pad?: string) => {
    if (token === 'prefix') return values.prefix;
    if (token === 'year') return String(date.getFullYear());
    if (token === 'month') return String(date.getMonth() + 1).padStart(2, '0');
    if (token === 'day') return String(date.getDate()).padStart(2, '0');
    const width = Math.min(Math.max(Number(pad) || 6, 1), 12);
    return String(seq).padStart(width, '0');
  });
}
