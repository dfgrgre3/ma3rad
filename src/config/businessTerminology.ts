import arabicTerms from './terminology/ar.json' with { type: 'json' };
import ceramicsTerms from './terminology/profiles/ceramics.json' with { type: 'json' };
import servicesTerms from './terminology/profiles/services.json' with { type: 'json' };
import professionalServicesTerms from './terminology/profiles/professional_services.json' with { type: 'json' };
import { getBusinessProfileTemplateId } from './businessProfiles';

export type BusinessLanguage = 'ar';

export const BUSINESS_TERMINOLOGY = {
  'entities.customers.singular': {
    label: 'عميل',
    description: 'اسم العميل الفردي في النماذج والواجهات.',
  },
  'entities.customers.plural': {
    label: 'العملاء',
    description: 'اسم مجموعة العملاء في القوائم والواجهات.',
  },
  'entities.products.singular': {
    label: 'منتج',
    description: 'اسم المنتج الفردي في النماذج والواجهات.',
  },
  'entities.products.plural': {
    label: 'المنتجات',
    description: 'اسم مجموعة المنتجات أو الخدمات القابلة للبيع.',
  },
  'entities.suppliers.singular': {
    label: 'مورد',
    description: 'اسم المورد الفردي في النماذج والواجهات.',
  },
  'entities.suppliers.plural': {
    label: 'الموردون',
    description: 'اسم مجموعة الموردين في القوائم والواجهات.',
  },
  'entities.projects.singular': {
    label: 'مشروع',
    description: 'اسم المشروع الفردي في النماذج والواجهات.',
  },
  'entities.projects.plural': {
    label: 'المشاريع',
    description: 'اسم مجموعة المشاريع أو العقود في القوائم والواجهات.',
  },
  'modules.inventory': {
    label: 'المخزون',
    description: 'اسم وحدة إدارة المخزون.',
  },
  'modules.sales': {
    label: 'المبيعات',
    description: 'اسم وحدة المبيعات ونقطة البيع.',
  },
  'modules.purchasing': {
    label: 'المشتريات',
    description: 'اسم وحدة المشتريات.',
  },
  'modules.operations': {
    label: 'العمليات',
    description: 'اسم مجموعة العمليات التشغيلية.',
  },
  'modules.reports': {
    label: 'التقارير',
    description: 'اسم وحدة التقارير.',
  },
  'documents.salesInvoices': {
    label: 'فواتير المبيعات',
    description: 'اسم قائمة فواتير المبيعات.',
  },
} as const;

export type BusinessTermKey = keyof typeof BUSINESS_TERMINOLOGY;
export const BUSINESS_TERM_DEFAULTS: Record<BusinessLanguage, Record<BusinessTermKey, string>> = {
  ar: arabicTerms,
};

export const BUSINESS_PROFILE_TERMINOLOGY: Record<
  string,
  Partial<Record<BusinessTermKey, Partial<Record<BusinessLanguage, string>>>>
> = {
  ceramics: ceramicsTerms,
  services: servicesTerms,
  professional_services: professionalServicesTerms,
};

export type BusinessTermOverrides = Partial<
  Record<BusinessLanguage, Partial<Record<BusinessTermKey, string>>>
>;

export const BUSINESS_TERM_KEYS = Object.keys(BUSINESS_TERMINOLOGY) as BusinessTermKey[];

export function resolveBusinessTerm(
  key: BusinessTermKey,
  options: {
    businessType: string;
    language: BusinessLanguage;
    overrides?: BusinessTermOverrides;
  },
): string {
  const custom = options.overrides?.[options.language]?.[key]?.trim();
  if (custom) return custom;

  const profileId = getBusinessProfileTemplateId(options.businessType);
  const profileValue = BUSINESS_PROFILE_TERMINOLOGY[profileId]?.[key]?.[options.language];
  if (profileValue) return profileValue;

  return BUSINESS_TERM_DEFAULTS[options.language][key] || BUSINESS_TERM_DEFAULTS.ar[key];
}

export function validateBusinessTermOverrides(value: unknown): BusinessTermOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('تخصيص المصطلحات يجب أن يكون كائنًا صالحًا.');
  }

  const input = value as Record<string, unknown>;
  const normalized: BusinessTermOverrides = {};
  const seenValues = new Map<string, BusinessTermKey>();

  for (const language of Object.keys(input)) {
    if (language !== 'ar' && language !== 'en') {
      throw new Error(`لغة مصطلحات غير مدعومة: ${language}.`);
    }
  }

  const rawArabicDictionary = input.ar;
  if (rawArabicDictionary !== undefined) {
    if (!rawArabicDictionary || typeof rawArabicDictionary !== 'object' || Array.isArray(rawArabicDictionary)) {
      throw new Error('قاموس المصطلحات للغة العربية غير صالح.');
    }

    const dictionary = rawArabicDictionary as Record<string, unknown>;
    const entries: Partial<Record<BusinessTermKey, string>> = {};
    for (const [rawKey, rawLabel] of Object.entries(dictionary)) {
      if (!Object.prototype.hasOwnProperty.call(BUSINESS_TERMINOLOGY, rawKey)) {
        throw new Error(`مفتاح مصطلح غير مسموح: ${rawKey}.`);
      }
      if (typeof rawLabel !== 'string') {
        throw new Error(`قيمة المصطلح ${rawKey} يجب أن تكون نصًا.`);
      }

      const label = rawLabel.trim();
      if (!label) continue;
      if (label.length > 80) throw new Error(`قيمة المصطلح ${rawKey} تتجاوز 80 حرفًا.`);

      const key = rawKey as BusinessTermKey;
      const duplicate = seenValues.get(label.toLocaleLowerCase('ar'));
      if (duplicate && duplicate !== key) {
        throw new Error(`المصطلح «${label}» مكرر بين ${duplicate} و${key}.`);
      }
      seenValues.set(label.toLocaleLowerCase('ar'), key);
      entries[key] = label;
    }
    normalized.ar = entries;
  }

  // Ignore saved English overrides so existing installations migrate to Arabic-only labels.
  return normalized;
}
