import type { BusinessLanguage, BusinessTermKey } from './businessTerminology_part01';

/**
 * Sector terminology for every business activity profile.
 * `businessTerminology_part02.ts` merges these with the JSON-file profiles so
 * each activity shows its own vocabulary (patients vs guests vs students...)
 * without duplicating the loader plumbing.
 */
export const EXTRA_BUSINESS_PROFILE_TERMINOLOGY: Record<
  string,
  Partial<Record<BusinessTermKey, Partial<Record<BusinessLanguage, string>>>>
> = {
  automotive: {
    'entities.products.singular': { ar: 'قطعة غيار' },
    'entities.products.plural': { ar: 'قطع الغيار' },
    'modules.inventory': { ar: 'مخزن القطع' },
    'documents.salesInvoices': { ar: 'فواتير القطع' },
  },
  building_materials: {
    'entities.products.singular': { ar: 'مادة بناء' },
    'entities.products.plural': { ar: 'مواد البناء' },
    'modules.inventory': { ar: 'مخزن الخامات' },
  },
  clothing: {
    'entities.products.singular': { ar: 'قطعة ملابس' },
    'entities.products.plural': { ar: 'القطع' },
    'entities.customers.plural': { ar: 'العملاء' },
  },
  construction: {
    'entities.customers.singular': { ar: 'صاحب مشروع' },
    'entities.customers.plural': { ar: 'أصحاب المشاريع' },
    'entities.projects.singular': { ar: 'مشروع' },
    'entities.projects.plural': { ar: 'المشروعات' },
    'entities.products.singular': { ar: 'بند' },
    'entities.products.plural': { ar: 'البنود' },
    'modules.sales': { ar: 'أعمال التنفيذ' },
    'documents.salesInvoices': { ar: 'فواتير التنفيذ' },
  },
  cosmetics: {
    'entities.products.singular': { ar: 'منتج تجميل' },
    'entities.products.plural': { ar: 'منتجات التجميل' },
  },
  ecommerce: {
    'documents.salesInvoices': { ar: 'طلبات العملاء' },
    'modules.sales': { ar: 'المتجر الإلكتروني' },
  },
  education: {
    'entities.customers.singular': { ar: 'طالب / ولي أمر' },
    'entities.customers.plural': { ar: 'الطلاب وأولياء الأمور' },
    'entities.products.singular': { ar: 'دورة / خدمة' },
    'entities.products.plural': { ar: 'الدورات والخدمات' },
    'documents.salesInvoices': { ar: 'فواتير الرسوم' },
  },
  electronics: {
    'entities.products.singular': { ar: 'جهاز / إكسسوار' },
    'entities.products.plural': { ar: 'الأجهزة والإكسسوارات' },
    'modules.inventory': { ar: 'مخزن الأجهزة' },
  },
  food: {
    'entities.products.singular': { ar: 'صنف غذائي' },
    'entities.products.plural': { ar: 'الأصناف الغذائية' },
    'modules.inventory': { ar: 'المخزن الغذائي' },
  },
  furniture: {
    'entities.products.singular': { ar: 'قطعة أثاث' },
    'entities.products.plural': { ar: 'الأثاث' },
    'modules.inventory': { ar: 'مخزن الأثاث' },
  },
  healthcare_admin: {
    'entities.customers.singular': { ar: 'مريض' },
    'entities.customers.plural': { ar: 'المرضى' },
    'entities.products.singular': { ar: 'خدمة طبية' },
    'entities.products.plural': { ar: 'الخدمات الطبية' },
    'documents.salesInvoices': { ar: 'فواتير الكشف' },
  },
  home_appliances: {
    'entities.products.singular': { ar: 'جهاز كهربائي' },
    'entities.products.plural': { ar: 'الأجهزة الكهربائية' },
    'modules.inventory': { ar: 'مخزن الأجهزة' },
  },
  hospitality: {
    'entities.customers.singular': { ar: 'نزيل' },
    'entities.customers.plural': { ar: 'النزلاء' },
    'entities.products.singular': { ar: 'غرفة / خدمة' },
    'entities.products.plural': { ar: 'الغرف والخدمات' },
    'documents.salesInvoices': { ar: 'فواتير الإقامة' },
  },
  import_export: {
    'entities.products.singular': { ar: 'بضاعة' },
    'entities.products.plural': { ar: 'البضائع' },
    'entities.suppliers.plural': { ar: 'الموردون' },
    'documents.salesInvoices': { ar: 'فواتير التصدير' },
  },
  lighting: {
    'entities.products.singular': { ar: 'منتج إضاءة' },
    'entities.products.plural': { ar: 'منتجات الإضاءة' },
  },
  logistics: {
    'entities.products.singular': { ar: 'شحنة' },
    'entities.products.plural': { ar: 'الشحنات' },
    'modules.inventory': { ar: 'المستودعات' },
    'modules.sales': { ar: 'الخدمات اللوجستية' },
    'documents.salesInvoices': { ar: 'بوليصات الشحن' },
  },
  manufacturing: {
    'entities.products.singular': { ar: 'منتج مصنّع' },
    'entities.products.plural': { ar: 'المنتجات المصنعة' },
    'modules.inventory': { ar: 'مخزن الإنتاج' },
    'documents.salesInvoices': { ar: 'أوامر التسليم' },
  },
  restaurant: {
    'entities.customers.singular': { ar: 'ضيف' },
    'entities.customers.plural': { ar: 'الضيوف' },
    'entities.products.singular': { ar: 'صنف' },
    'entities.products.plural': { ar: 'الأصناف' },
    'modules.sales': { ar: 'أوامر الصالة' },
    'documents.salesInvoices': { ar: 'فواتير الصالة' },
  },
  sanitary: {
    'entities.products.singular': { ar: 'أداة صحية' },
    'entities.products.plural': { ar: 'الأدوات الصحية' },
    'modules.inventory': { ar: 'مخزن الأدوات' },
  },
};
