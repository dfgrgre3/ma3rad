import arabicTerms from './terminology/ar.json';

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
