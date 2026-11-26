import { getEffectiveBusinessType } from '../services/domains/config/BusinessTypeService';
import { getBusinessProfile } from './businessProfiles';
import { isActivityPathHidden } from './activityPageVisibility';

/**
 * Activity-aware hub tabs for the main landing areas (sales, inventory,
 * purchasing). Resolution order for each tab label:
 *   activity override → family default → the tab's own label.
 * Tabs whose path is hidden for the selected activity are removed entirely,
 * so e.g. a hotel never sees a "showroom stock" tab.
 */

export type ActivityHubId = 'sales' | 'inventory' | 'purchasing' | 'crm' | 'receivables' | 'products';

export interface HubTabLike {
  id: string;
  label: string;
  path: string;
}

/** Per-activity label overrides: hub → tab id → activity id → label. */
const ACTIVITY_TAB_LABELS: Record<ActivityHubId, Record<string, Record<string, string>>> = {
  sales: {
    invoices: {
      ceramics: 'فواتير البلاط', sanitary: 'فواتير الأدوات الصحية', furniture: 'فواتير الأثاث',
      home_appliances: 'فواتير الأجهزة', electronics: 'فواتير الإلكترونيات', clothing: 'فواتير الملابس',
      food: 'فواتير البقالة', cosmetics: 'فواتير التجميل', automotive: 'فواتير قطع الغيار',
      building_materials: 'فواتير مواد البناء', lighting: 'فواتير الإضاءة', ecommerce: 'فواتير المتجر',
      general: 'فواتير المبيعات', hospitality: 'فواتير الإقامة',
      education: 'فواتير الأقساط', workshop: 'فواتير الورشة', manufacturing: 'فواتير المنتجات',
      construction: 'فواتير المقاولات', import_export: 'فواتير التجارة', logistics: 'فواتير الشحن',
      healthcare_admin: 'فواتير الخدمات', services: 'فواتير الخدمات', professional_services: 'فواتير الأتعاب',
      custom: 'الفواتير',
    },
    analytics: {
      ceramics: 'تحليلات مبيعات البلاط', sanitary: 'تحليلات مبيعات الأدوات', furniture: 'تحليلات مبيعات الأثاث',
      home_appliances: 'تحليلات مبيعات الأجهزة', electronics: 'تحليلات الإلكترونيات', clothing: 'تحليلات الملابس',
      food: 'تحليلات البقالة', cosmetics: 'تحليلات التجميل', automotive: 'تحليلات قطع الغيار',
      building_materials: 'تحليلات مواد البناء', lighting: 'تحليلات الإضاءة', ecommerce: 'تحليلات المتجر',
      general: 'تحليلات المبيعات', hospitality: 'تحليلات الإقامة',
      education: 'تحليلات التسجيل والأقساط', workshop: 'تحليلات الورشة', manufacturing: 'تحليلات الإنتاج',
      construction: 'تحليلات التنفيذ', import_export: 'تحليلات التجارة', logistics: 'تحليلات التوزيع',
      healthcare_admin: 'تحليلات الخدمات', services: 'تحليلات الخدمات', professional_services: 'تحليلات الأعمال',
      custom: 'تحليلات المبيعات',
    },
    cycle: {
      ceramics: 'دورة فاتورة البلاط', sanitary: 'دورة الفاتورة', furniture: 'دورة فاتورة الأثاث',
      home_appliances: 'دورة فاتورة الأجهزة', electronics: 'دورة فاتورة الإلكترونيات', clothing: 'دورة الفاتورة',
      food: 'دورة فاتورة البقالة', cosmetics: 'دورة الفاتورة', automotive: 'دورة فاتورة القطع',
      building_materials: 'دورة فاتورة المواد', lighting: 'دورة الفاتورة', ecommerce: 'دورة طلب المتجر',
      general: 'دورة الفاتورة', hospitality: 'دورة الإقامة',
      education: 'دورة القسط', workshop: 'دورة أمر الشغل', manufacturing: 'دورة أمر التسليم',
      construction: 'دورة المستخلص', import_export: 'دورة الشحنة', logistics: 'دورة بوليصة الشحن',
      healthcare_admin: 'دورة الكشف', services: 'دورة أمر الخدمة', professional_services: 'دورة الملف',
      custom: 'دورة الفاتورة',
    },
    statement: {
      ceramics: 'كشف حساب العميل', sanitary: 'كشف حساب العميل', furniture: 'كشف حساب العميل',
      home_appliances: 'كشف حساب العميل', electronics: 'كشف حساب العميل', clothing: 'كشف حساب العميل',
      food: 'كشف حساب العميل', cosmetics: 'كشف حساب العميل', automotive: 'كشف حساب العميل',
      building_materials: 'كشف حساب العميل', lighting: 'كشف حساب العميل', ecommerce: 'كشف حساب المتجر',
      general: 'كشف حساب عميل', hospitality: 'كشف حساب النزيل',
      education: 'كشف حساب ولي الأمر', workshop: 'كشف حساب العميل', manufacturing: 'كشف حساب العميل',
      construction: 'كشف حساب العميل', import_export: 'كشف حساب العميل', logistics: 'كشف حساب العميل',
      healthcare_admin: 'كشف حساب المريض', services: 'كشف حساب العميل', professional_services: 'كشف حساب العميل',
      custom: 'كشف حساب عميل',
    },
    'orders-deposits': {
      ceramics: 'حجوزات المساحات', hospitality: 'حجوزات الغرف',
      education: 'التسجيل والأقساط', construction: 'المستخلصات', workshop: 'دفعات العملاء',
      professional_services: 'مواعيد التسليم', services: 'مواعيد التسليم', healthcare_admin: 'مواعيد المرضى',
      ecommerce: 'سلات ومطالبات', food: 'طلبات سريعة', sanitary: 'حجوزات العملاء', furniture: 'حجوزات الأثاث',
      home_appliances: 'حجوزات الأجهزة', electronics: 'حجوزات الأجهزة', clothing: 'حجوزات الملابس',
      cosmetics: 'حجوزات التجميل', automotive: 'حجوزات القطع', building_materials: 'حجوزات المواد',
      lighting: 'حجوزات الإضاءة', general: 'حجوزات ودفعات', manufacturing: 'دفعات العملاء',
      import_export: 'دفعات الشحنات', logistics: 'دفعات العملاء', custom: 'حجوزات ودفعات',
    },
    'after-sales': {
      ceramics: 'تركيب وصيانة', home_appliances: 'الضمانات', electronics: 'الضمانات',
      automotive: 'الضمانات', workshop: 'ضمانات الصيانة',
      hospitality: 'شكاوى النزلاء', education: 'متابعة الغياب', healthcare_admin: 'متابعة الحالات',
      sanitary: 'الضمانات', furniture: 'الضمانات', clothing: 'الاستبدال', food: 'شكاوى الجودة',
      cosmetics: 'شكاوى التجميل', building_materials: 'مطالبات العيوب', lighting: 'الضمانات',
      ecommerce: 'شكاوى المتجر', general: 'خدمة ما بعد البيع', manufacturing: 'مطالبات الجودة',
      construction: 'متابعة التنفيذ', import_export: 'مطالبات الشحن', logistics: 'مطالبات التوصيل',
      services: 'متابعة الخدمات', professional_services: 'متابعة الملفات', custom: 'خدمة ما بعد البيع',
    },
    quotations: {
      ceramics: 'عروض أسعار البلاط', construction: 'كشوف الكميات والعروض', workshop: 'تقديرات الإصلاح',
      manufacturing: 'عروض التصنيع', import_export: 'عروض التصدير', professional_services: 'عروض الأتعاب',
      services: 'عروض الخدمات', healthcare_admin: 'عروض الفحوصات', sanitary: 'عروض الأسعار',
      furniture: 'عروض الأسعار', home_appliances: 'عروض الأسعار', electronics: 'عروض الأسعار',
      clothing: 'عروض الأسعار', food: 'عروض البقالة', cosmetics: 'عروض التجميل', automotive: 'عروض القطع',
      building_materials: 'عروض المواد', lighting: 'عروض الأسعار', ecommerce: 'عروض المتجر',
      general: 'عروض الأسعار', hospitality: 'عروض الإقامة',
      education: 'عروض الدورات', logistics: 'عروض الشحن', custom: 'عروض الأسعار',
    },
    orders: {
      ceramics: 'طلبات المقاسات', sanitary: 'طلبات العملاء', furniture: 'طلبات الأثاث',
      home_appliances: 'طلبات الأجهزة', electronics: 'طلبات الإلكترونيات', clothing: 'طلبات الملابس',
      food: 'طلبات البقالة', cosmetics: 'طلبات التجميل', automotive: 'طلبات قطع الغيار',
      building_materials: 'طلبات مواد البناء', lighting: 'طلبات الإضاءة', ecommerce: 'طلبات المتجر',
      general: 'طلبات العملاء', hospitality: 'طلبات خدمات النزلاء',
      education: 'طلبات التسجيل', workshop: 'أوامر العمل', manufacturing: 'طلبات البيع',
      construction: 'أوامر العملاء', import_export: 'طلبات التصدير', logistics: 'طلبات التوصيل',
      healthcare_admin: 'طلبات الخدمات', services: 'طلبات الخدمة', professional_services: 'ملفات العملاء',
      custom: 'الطلبات',
    },
    returns: {
      ceramics: 'مرتجعات البلاط', food: 'بضاعة مرتجعة',
      ecommerce: 'مرتجعات المتجر', workshop: 'قطع مستبدلة', sanitary: 'مرتجعات الأدوات',
      furniture: 'مرتجعات الأثاث', home_appliances: 'مرتجعات الأجهزة', electronics: 'مرتجعات الأجهزة',
      clothing: 'مرتجعات الملابس', cosmetics: 'مرتجعات التجميل', automotive: 'مرتجعات القطع',
      building_materials: 'مرتجعات المواد', lighting: 'مرتجعات الإضاءة', general: 'مرتجعات المبيعات',
      hospitality: 'غرف ملغاة', education: 'انسحابات الرسوم', manufacturing: 'منتجات مرتجعة',
      construction: 'بنود ملغاة', import_export: 'مرتجعات الشحنات', logistics: 'شحنات مرتجعة',
      healthcare_admin: 'خدمات ملغاة', services: 'خدمات ملغاة', professional_services: 'ملفات ملغاة',
      custom: 'المرتجعات',
    },
    'electronic-invoicing': {
      ceramics: 'الفاتورة الإلكترونية', sanitary: 'الفاتورة الإلكترونية', furniture: 'الفاتورة الإلكترونية',
      home_appliances: 'الفاتورة الإلكترونية', electronics: 'الفاتورة الإلكترونية', clothing: 'الفاتورة الإلكترونية',
      food: 'الفاتورة الإلكترونية', cosmetics: 'الفاتورة الإلكترونية', automotive: 'الفاتورة الإلكترونية',
      building_materials: 'الفاتورة الإلكترونية', lighting: 'الفاتورة الإلكترونية', ecommerce: 'الفاتورة الإلكترونية',
      general: 'الفاتورة الإلكترونية', hospitality: 'الفاتورة الإلكترونية',
      education: 'الفاتورة الإلكترونية', workshop: 'الفاتورة الإلكترونية', manufacturing: 'الفاتورة الإلكترونية',
      construction: 'الفاتورة الإلكترونية', import_export: 'الفاتورة الإلكترونية', logistics: 'الفاتورة الإلكترونية',
      healthcare_admin: 'الفاتورة الإلكترونية', services: 'الفاتورة الإلكترونية',
      professional_services: 'الفاتورة الإلكترونية', custom: 'الفاتورة الإلكترونية',
    },
  },
  inventory: {
    overview: {
      ceramics: 'مخزون البلاط', sanitary: 'مخزون الأدوات', furniture: 'مخزون الأثاث',
      home_appliances: 'مخزون الأجهزة', electronics: 'مخزون الإلكترونيات', clothing: 'مخزون الملابس',
      food: 'مخزون البقالة', cosmetics: 'مخزون التجميل', automotive: 'مخزون قطع الغيار',
      building_materials: 'مخزون مواد البناء', lighting: 'مخزون الإضاءة', ecommerce: 'مخزون المتجر',
      general: 'المخزون', hospitality: 'مستلزمات الفندق',
      education: 'مستلزمات المؤسسة', workshop: 'مخزون قطع الغيار', manufacturing: 'مخزون الخامات',
      construction: 'مخزون المواقع', import_export: 'مخزون البضائع', logistics: 'مخزون المستودعات',
      healthcare_admin: 'مستلزمات المنشأة', services: 'مستلزمات التشغيل', professional_services: 'مستلزمات المكتب',
      custom: 'المخزون',
    },
    'warehouse-stock': {
      ceramics: 'مخزون المخزن', sanitary: 'مخزن الأدوات', furniture: 'مخزن الأثاث',
      home_appliances: 'مخزن الأجهزة', electronics: 'مخزن الإلكترونيات', clothing: 'مخزن الملابس',
      food: 'مخزن البقالة', cosmetics: 'مخزن التجميل', automotive: 'مخزن القطع',
      building_materials: 'مخزن المواد', lighting: 'مخزن الإضاءة', ecommerce: 'مخزون المستودع',
      general: 'أرصدة المخازن', hospitality: 'مخزن الفندق',
      education: 'المخزن الرئيسي', workshop: 'مخزن القطع', manufacturing: 'مخازن الخامات',
      construction: 'مخازن المواقع', import_export: 'مخازن البضائع', logistics: 'مخزون المستودعات',
      healthcare_admin: 'مخزن المنشأة', services: 'مخزن التشغيل', professional_services: 'مخزن المكتب',
      custom: 'أرصدة المخازن',
    },
    'showroom-stock': {
      ceramics: 'مخزون المعرض بالمتر', sanitary: 'مخزون المعرض', furniture: 'مخزون المعرض',
      home_appliances: 'مخزون الصالة', electronics: 'مخزون الصالة', clothing: 'مخزون المحل',
      cosmetics: 'مخزون المحل', automotive: 'مخزون المعرض', building_materials: 'مخزون المعرض',
      lighting: 'مخزون المعرض', food: 'مخزون الرفوف', general: 'مخزون المعرض',
      ecommerce: 'مخزون الرفوف', import_export: 'مخزون المعرض', logistics: 'مخزون الرفوف',
      manufacturing: 'مخزون الصالة', construction: 'مخزون المعرض', transport: 'مخزون المعرض',
      hospitality: 'مخزون الاستقبال', healthcare_admin: 'مخزون الاستقبال', education: 'مخزون المعرض',
      professional_services: 'مخزون المعرض', services: 'مخزون المعرض', custom: 'مخزون المعرض',
    },
    ledger: {
      ceramics: 'حركة البلاط', hospitality: 'حركة المستلزمات',
      education: 'حركة المؤسسة', workshop: 'حركة قطع الغيار', manufacturing: 'حركة الخامات',
      construction: 'حركة المواقع', food: 'حركة البقالة', ecommerce: 'حركة المتجر',
      logistics: 'حركة المستودعات', healthcare_admin: 'حركة المستلزمات', import_export: 'حركة البضائع',
      general: 'سجل الحركة', custom: 'سجل الحركة',
    },
    transfers: {
      ceramics: 'تحويلات البلاط', hospitality: 'تحويلات المستلزمات',
      education: 'تحويلات المؤسسة', workshop: 'تحويلات القطع', manufacturing: 'تحويلات الخامات',
      construction: 'تحويلات المواقع', food: 'تحويلات البقالة', ecommerce: 'تحويلات المتجر',
      logistics: 'تحويلات المستودعات', healthcare_admin: 'تحويلات المستلزمات', import_export: 'تحويلات البضائع',
      general: 'التحويلات', custom: 'التحويلات',
    },
    counts: {
      ceramics: 'جرد البلاط', hospitality: 'جرد المستلزمات',
      education: 'جرد المؤسسة', workshop: 'جرد القطع', manufacturing: 'جرد الخامات',
      construction: 'جرد المواقع', food: 'جرد البقالة', ecommerce: 'جرد المتجر',
      logistics: 'جرد المستودعات', healthcare_admin: 'جرد المستلزمات', import_export: 'جرد البضائع',
      general: 'الجرد', custom: 'الجرد',
    },
    valuation: {
      ceramics: 'تقييم البلاط', hospitality: 'تقييم المستلزمات',
      education: 'تقييم المؤسسة', workshop: 'تقييم القطع', manufacturing: 'تقييم الإنتاج',
      construction: 'تقييم المواقع', food: 'تقييم البقالة', ecommerce: 'تقييم المتجر',
      logistics: 'تقييم المستودعات', healthcare_admin: 'تقييم المستلزمات', import_export: 'تقييم البضائع',
      general: 'التقييم', custom: 'التقييم',
    },
    adjustments: {
      ceramics: 'تسويات البلاط', hospitality: 'تسويات المستلزمات',
      education: 'تسويات المؤسسة', workshop: 'تسويات القطع', manufacturing: 'تسويات الإنتاج',
      construction: 'تسويات المواقع', food: 'تسويات البقالة', ecommerce: 'تسويات المتجر',
      logistics: 'تسويات المستودعات', healthcare_admin: 'تسويات المستلزمات', import_export: 'تسويات البضائع',
      general: 'التسويات', custom: 'التسويات',
    },
    'stock-reservations': {
      ceramics: 'حجوزات البلاط', hospitality: 'حجوزات المستلزمات',
      education: 'حجوزات المؤسسة', workshop: 'حجوزات القطع', manufacturing: 'حجوزات الإنتاج',
      construction: 'حجوزات المواقع', food: 'حجوزات البقالة', ecommerce: 'حجوزات المتجر',
      logistics: 'حجوزات المستودعات', healthcare_admin: 'حجوزات المستلزمات', import_export: 'حجوزات البضائع',
      general: 'حجوزات المخزون', custom: 'حجوزات المخزون',
    },
    'reorder-planning': {
      ceramics: 'طلب البلاط', sanitary: 'طلب الأدوات', furniture: 'طلب الأثاث',
      home_appliances: 'طلب الأجهزة', electronics: 'طلب الإلكترونيات', clothing: 'طلب الملابس',
      food: 'تجديد البضائع', cosmetics: 'طلب التجميل', automotive: 'طلب القطع',
      building_materials: 'طلب المواد', lighting: 'طلب الإضاءة', ecommerce: 'تجديد مخزون المتجر',
      general: 'إعادة الطلب', hospitality: 'توريد المستلزمات',
      education: 'توريد المستلزمات', workshop: 'قطع غيار مطلوبة', manufacturing: 'تخطيط الخامات',
      construction: 'مواد مطلوبة للمواقع', import_export: 'توريد البضائع', logistics: 'توريد المستودعات',
      healthcare_admin: 'توريد المستلزمات', services: 'توريد التشغيل', professional_services: 'توريد المكتب',
      custom: 'إعادة الطلب',
    },
    locations: {
      ceramics: 'مواقع البلاط', hospitality: 'مواقع المستلزمات',
      education: 'مواقع المؤسسة', workshop: 'مواقع القطع', manufacturing: 'مواقع الإنتاج',
      construction: 'مواقع المواقع', food: 'مواقع البقالة', ecommerce: 'مواقع المتجر',
      logistics: 'مواقع المستودعات', healthcare_admin: 'مواقع المستلزمات', import_export: 'مواقع البضائع',
      general: 'مواقع الرفوف', custom: 'مواقع الرفوف',
    },
    'damage-quarantine': {
      ceramics: 'بلاط تالف', sanitary: 'أدوات تالفة', furniture: 'أثاث تالف',
      home_appliances: 'أجهزة تالفة', electronics: 'إلكترونيات تالفة', clothing: 'ملابس تالفة',
      food: 'منتهي وتالف', cosmetics: 'تالف', automotive: 'قطع تالفة',
      building_materials: 'مواد تالفة', lighting: 'تالف', ecommerce: 'تالف',
      general: 'التالف والحجر', hospitality: 'مستلزمات تالفة',
      education: 'مستلزمات تالفة', workshop: 'قطع تالفة', manufacturing: 'خامات مرفوضة',
      construction: 'مواد مرفوضة', import_export: 'بضاعة مرفوضة', logistics: 'بضاعة تالفة',
      healthcare_admin: 'مستلزمات تالفة', services: 'مستلزمات تالفة', professional_services: 'مستلزمات تالفة',
      custom: 'التالف والحجر',
    },
    reconciliation: {
      ceramics: 'مطابقة البلاط', hospitality: 'مطابقة المستلزمات',
      education: 'مطابقة المؤسسة', workshop: 'مطابقة القطع', manufacturing: 'مطابقة الإنتاج',
      construction: 'مطابقة المواقع', food: 'مطابقة البقالة', ecommerce: 'مطابقة المتجر',
      logistics: 'مطابقة المستودعات', healthcare_admin: 'مطابقة المستلزمات', import_export: 'مطابقة البضائع',
      general: 'المطابقة', custom: 'المطابقة',
    },
    alerts: {
      ceramics: 'تنبيهات البلاط', sanitary: 'تنبيهات الأدوات', furniture: 'تنبيهات الأثاث',
      home_appliances: 'تنبيهات الأجهزة', electronics: 'تنبيهات الإلكترونيات', clothing: 'تنبيهات الملابس',
      food: 'تنبيهات البقالة', cosmetics: 'تنبيهات التجميل', automotive: 'تنبيهات القطع',
      building_materials: 'تنبيهات المواد', lighting: 'تنبيهات الإضاءة', ecommerce: 'تنبيهات المتجر',
      general: 'تنبيهات المخزون', hospitality: 'تنبيهات المستلزمات',
      education: 'تنبيهات المؤسسة', workshop: 'تنبيهات القطع', manufacturing: 'تنبيهات الخامات',
      construction: 'تنبيهات المواقع', import_export: 'تنبيهات البضائع', logistics: 'تنبيهات المستودعات',
      healthcare_admin: 'تنبيهات المستلزمات', services: 'تنبيهات التشغيل', professional_services: 'تنبيهات المكتب',
      custom: 'تنبيهات المخزون',
    },
  },
  purchasing: {
    invoices: {
      ceramics: 'فواتير التوريد', sanitary: 'فواتير التوريد', furniture: 'فواتير التوريد',
      home_appliances: 'فواتير التوريد', electronics: 'فواتير التوريد', clothing: 'فواتير التوريد',
      cosmetics: 'فواتير التوريد', automotive: 'فواتير التوريد', building_materials: 'فواتير التوريد',
      lighting: 'فواتير التوريد', general: 'فواتير المشتريات',
      hospitality: 'فواتير التوريد', education: 'فواتير الموردين', workshop: 'فواتير قطع الغيار',
      manufacturing: 'فواتير الخامات', construction: 'فواتير الموردين', import_export: 'فواتير الموردين',
      logistics: 'فواتير التشغيل', healthcare_admin: 'فواتير الموردين', food: 'فواتير البضاعة',
      ecommerce: 'فواتير التوريد', services: 'فواتير التشغيل', professional_services: 'فواتير المكتب',
      custom: 'فواتير المشتريات',
    },
    requests: {
      ceramics: 'طلبات شراء البلاط', hospitality: 'طلبات مستلزمات',
      education: 'طلبات مشتريات المؤسسة', workshop: 'طلبات قطع غيار', manufacturing: 'طلبات خامات',
      construction: 'طلبات مواقع', food: 'طلبات بضاعة', ecommerce: 'طلبات المتجر',
      logistics: 'طلبات تشغيل', healthcare_admin: 'طلبات مشتريات', import_export: 'طلبات استيراد',
      general: 'طلبات الشراء', custom: 'طلبات الشراء',
    },
    quotations: {
      ceramics: 'عروض موردي البلاط', hospitality: 'عروض المستلزمات',
      education: 'عروض الموردين', workshop: 'عروض قطع الغيار', manufacturing: 'عروض الخامات',
      construction: 'عروض الموردين', food: 'عروض البضاعة', ecommerce: 'عروض التوريد',
      logistics: 'عروض التشغيل', healthcare_admin: 'عروض الموردين', import_export: 'عروض الاستيراد',
      general: 'عروض الموردين', custom: 'عروض الموردين',
    },
    orders: {
      ceramics: 'أوامر شراء البلاط', sanitary: 'أوامر شراء الأدوات', furniture: 'أوامر شراء الأثاث',
      home_appliances: 'أوامر شراء الأجهزة', electronics: 'أوامر شراء الإلكترونيات',
      clothing: 'أوامر شراء الملابس', food: 'أوامر شراء البضاعة', cosmetics: 'أوامر شراء التجميل',
      automotive: 'أوامر شراء قطع الغيار', building_materials: 'أوامر شراء المواد',
      lighting: 'أوامر شراء الإضاءة', ecommerce: 'أوامر شراء المتجر', general: 'أوامر الشراء', hospitality: 'مستلزمات الفندق', education: 'مشتريات المؤسسة',
      workshop: 'قطع غيار', manufacturing: 'أوامر شراء الخامات', construction: 'مشتريات المواقع',
      import_export: 'أوامر الاستيراد', logistics: 'مشتريات التشغيل',
      healthcare_admin: 'مشتريات المنشأة', services: 'مشتريات التشغيل', professional_services: 'مشتريات التشغيل',
      custom: 'أوامر الشراء',
    },
    receipts: {
      ceramics: 'استلام شحنات البلاط', sanitary: 'استلام الأدوات', furniture: 'استلام الأثاث',
      home_appliances: 'استلام الأجهزة', electronics: 'استلام الإلكترونيات', clothing: 'استلام الملابس',
      food: 'استلام البضاعة', cosmetics: 'استلام التجميل', automotive: 'استلام القطع',
      building_materials: 'استلام المواد', lighting: 'استلام الإضاءة', ecommerce: 'استلام بضاعة المتجر',
      general: 'إذن الاستلام', hospitality: 'استلام المستلزمات',
      education: 'استلام المشتريات', workshop: 'استلام القطع', manufacturing: 'استلام الخامات',
      construction: 'استلام المواقع', import_export: 'استلام الشحنات', logistics: 'استلام التشغيل',
      healthcare_admin: 'استلام المستلزمات', services: 'استلام التشغيل', professional_services: 'استلام المكتب',
      custom: 'إذن الاستلام',
    },
    incoming: {
      ceramics: 'بضاعة واردة', sanitary: 'أدوات واردة', furniture: 'أثاث وارد',
      home_appliances: 'أجهزة واردة', electronics: 'إلكترونيات واردة', clothing: 'ملابس واردة',
      food: 'بضاعة واردة', cosmetics: 'تجميل وارد', automotive: 'قطع واردة',
      building_materials: 'مواد واردة', lighting: 'إضاءة واردة', ecommerce: 'بضاعة المتجر',
      general: 'الواردات', hospitality: 'مستلزمات واردة',
      education: 'مشتريات واردة', workshop: 'قطع واردة', manufacturing: 'خامات واردة',
      construction: 'مواد واردة للمواقع', import_export: 'شحنات واردة', logistics: 'واردات المستودعات',
      healthcare_admin: 'مستلزمات واردة', services: 'خدمات واردة', professional_services: 'خدمات واردة',
      custom: 'الواردات',
    },
    returns: {
      ceramics: 'مرتجعات للمورد', sanitary: 'مرتجعات الأدوات', furniture: 'مرتجعات الأثاث',
      home_appliances: 'مرتجعات الأجهزة', electronics: 'مرتجعات الإلكترونيات', clothing: 'مرتجعات الملابس',
      food: 'مرتجعات بضاعة', cosmetics: 'مرتجعات التجميل', automotive: 'مرتجعات القطع',
      building_materials: 'مرتجعات المواد', lighting: 'مرتجعات الإضاءة', ecommerce: 'مرتجعات التوريد',
      general: 'مرتجعات المشتريات', hospitality: 'مستلزمات مرتجعة',
      education: 'مرتجعات المؤسسة', workshop: 'قطع مرفوضة', manufacturing: 'خامات مرفوضة',
      construction: 'مواد مرفوضة', import_export: 'مرتجعات شحنات', logistics: 'مرتجعات تشغيل',
      healthcare_admin: 'مستلزمات مرتجعة', services: 'خدمات ملغاة', professional_services: 'خدمات ملغاة',
      custom: 'مرتجعات المشتريات',
    },
    claims: {
      import_export: 'مطالبات الجمارك', logistics: 'مطالبات الشحن', manufacturing: 'مطالبات الجودة',
      construction: 'مطالبات المواقع', general: 'مطالبات الموردين', custom: 'مطالبات الموردين',
    },
    statement: {
      ceramics: 'كشف حساب المورد', hospitality: 'كشف حساب المورد',
      education: 'كشف حساب المورد', workshop: 'كشف حساب المورد', manufacturing: 'كشف حساب المورد',
      construction: 'كشف حساب المورد', food: 'كشف حساب المورد', ecommerce: 'كشف حساب المورد',
      logistics: 'كشف حساب المورد', healthcare_admin: 'كشف حساب المورد', import_export: 'كشف حساب المورد',
      general: 'كشف حساب المورد', custom: 'كشف حساب المورد',
    },
  },
  crm: {
    dashboard: {
      ceramics: 'لوحة العملاء', hospitality: 'لوحة النزلاء',
      education: 'لوحة أولياء الأمور', healthcare_admin: 'لوحة المرضى', workshop: 'لوحة السيارات',
      construction: 'لوحة أصحاب المشاريع', professional_services: 'لوحة العملاء', services: 'لوحة العملاء',
      general: 'لوحة CRM', custom: 'لوحة CRM',
    },
    customers: {
      ceramics: 'العملاء والمهندسون', sanitary: 'العملاء', furniture: 'العملاء',
      home_appliances: 'العملاء', electronics: 'العملاء', clothing: 'العملاء',
      food: 'العملاء', cosmetics: 'العملاء', automotive: 'السيارات والعملاء',
      building_materials: 'العملاء والمقاولون', lighting: 'العملاء', ecommerce: 'عملاء المتجر',
      general: 'العملاء', hospitality: 'النزلاء',
      education: 'الطلاب وأولياء الأمور', workshop: 'السيارات والعملاء', manufacturing: 'العملاء',
      construction: 'أصحاب المشاريع', import_export: 'العملاء والموزعون', logistics: 'العملاء',
      healthcare_admin: 'المرضى', services: 'العملاء', professional_services: 'العملاء',
      custom: 'العملاء',
    },
    leads: {
      ceramics: 'مهندسون محتملون', hospitality: 'نزلاء محتملون',
      education: 'طلاب محتملون', healthcare_admin: 'مرضى جدد', workshop: 'سيارات جديدة',
      construction: 'مشاريع محتملة', professional_services: 'عملاء محتملون', services: 'عملاء محتملون',
      general: 'العملاء المحتملون', custom: 'العملاء المحتملون',
    },
    pipeline: {
      ceramics: 'مسار البيع', hospitality: 'مسار الحجوزات',
      education: 'مسار التسجيل', healthcare_admin: 'مسار المواعيد', workshop: 'مسار أوامر الشغل',
      construction: 'مسار المشاريع', professional_services: 'مسار الملفات', services: 'مسار الخدمات',
      general: 'مسار المبيعات', custom: 'مسار المبيعات',
    },
    activities: {
      ceramics: 'متابعة العملاء', hospitality: 'متابعة النزلاء',
      education: 'متابعة أولياء الأمور', healthcare_admin: 'متابعة المرضى', workshop: 'متابعة السيارات',
      construction: 'متابعة المشاريع', professional_services: 'متابعة العملاء', services: 'متابعة العملاء',
      general: 'الأنشطة والمتابعة', custom: 'الأنشطة والمتابعة',
    },
    campaigns: {
      ceramics: 'حملات التسويق', hospitality: 'عروض موسمية',
      education: 'حملات التسجيل', healthcare_admin: 'حملات الفحوصات', workshop: 'عروض الصيانة',
      construction: 'حملات المشاريع', professional_services: 'حملات المكتب', services: 'حملات الخدمات',
      general: 'الحملات', custom: 'الحملات',
    },
  },
  receivables: {
    debts: {
      ceramics: 'ديون العملاء', hospitality: 'ديون النزلاء',
      education: 'ديون أولياء الأمور', healthcare_admin: 'ديون المرضى والتأمين', workshop: 'ديون العملاء',
      construction: 'مستخلصات مدينة', professional_services: 'أتعاب مدينة', services: 'مستحقات الخدمات',
      general: 'ديون العملاء والموردين', custom: 'الذمم',
    },
    other: {
      ceramics: 'مطالبات أخرى', hospitality: 'مطالبات النزلاء',
      education: 'مطالبات الرسوم', healthcare_admin: 'مطالبات التأمين', workshop: 'مطالبات الورشة',
      construction: 'مطالبات المشاريع', professional_services: 'مطالبات الأتعاب', services: 'مطالبات الخدمات',
      general: 'المطالبات الأخرى', custom: 'المطالبات الأخرى',
    },
    installments: {
      ceramics: 'أقساط العملاء', hospitality: 'أقساط النزلاء',
      education: 'أقساط الطلاب', healthcare_admin: 'تقسيط الرسوم', workshop: 'أقساط العملاء',
      construction: 'دفعات المشاريع', professional_services: 'أتعاب بالتقسيط', services: 'أقساط الخدمات',
      general: 'الأقساط', custom: 'الأقساط',
    },
    'follow-up': {
      ceramics: 'تحصيل العملاء', hospitality: 'تحصيل النزلاء',
      education: 'تحصيل الرسوم', healthcare_admin: 'تحصيل المرضى', workshop: 'تحصيل الورشة',
      construction: 'تحصيل المستخلصات', professional_services: 'تحصيل الأتعاب', services: 'تحصيل الخدمات',
      general: 'التحصيل والمتابعة', custom: 'التحصيل والمتابعة',
    },
  },
  products: {
    products: {
      ceramics: 'منتجات السيراميك', sanitary: 'الأدوات الصحية', furniture: 'قطع الأثاث',
      home_appliances: 'الأجهزة الكهربائية', electronics: 'الأجهزة والإكسسوارات', clothing: 'الملابس',
      food: 'الأصناف الغذائية', cosmetics: 'منتجات التجميل', automotive: 'قطع غيار السيارات',
      building_materials: 'مواد البناء', lighting: 'منتجات الإضاءة', ecommerce: 'منتجات المتجر',
      general: 'المنتجات', hospitality: 'غرف وخدمات الفندق',
      education: 'الدورات والخدمات', workshop: 'قطع الغيار', manufacturing: 'المنتجات المصنعة',
      construction: 'بنود التنفيذ', import_export: 'البضائع', logistics: 'خدمات الشحن',
      healthcare_admin: 'الخدمات الطبية', services: 'الخدمات', professional_services: 'الخدمات المهنية',
      custom: 'المنتجات',
    },
    categories: {
      ceramics: 'أقسام السيراميك', sanitary: 'أقسام الأدوات', furniture: 'أقسام الأثاث',
      home_appliances: 'أقسام الأجهزة', electronics: 'أقسام الأجهزة', clothing: 'أقسام الملابس',
      food: 'أقسام الأصناف', cosmetics: 'أقسام التجميل', automotive: 'أقسام قطع الغيار',
      building_materials: 'أصناف البناء', lighting: 'أقسام الإضاءة', ecommerce: 'أقسام المتجر',
      general: 'التصنيفات', hospitality: 'أقسام الفندق',
      education: 'أقسام الدورات', workshop: 'أصناف قطع الغيار', manufacturing: 'مجموعات المنتجات',
      construction: 'بنود التنفيذ', import_export: 'أصناف البضائع', logistics: 'أنواع الشحن',
      healthcare_admin: 'تخصصات العيادة', services: 'أنواع الخدمات', professional_services: 'أنواع الملفات',
      custom: 'التصنيفات',
    },
    brands: {
      ceramics: 'المصانع والماركات', sanitary: 'المصانع', furniture: 'مصانع الأثاث',
      home_appliances: 'ماركات الأجهزة', electronics: 'الماركات', clothing: 'الماركات',
      food: 'الماركات الغذائية', cosmetics: 'ماركات التجميل', automotive: 'مصانع قطع الغيار',
      building_materials: 'مصانع المواد', lighting: 'ماركات الإضاءة', ecommerce: 'الماركات',
      general: 'الماركات', hospitality: 'موردو الفندق',
      education: 'الجهات التعليمية', workshop: 'مصانع القطع', manufacturing: 'مصانع المواد',
      construction: 'موردو المواد', import_export: 'المصانع المصدرة', logistics: 'شركات الشحن',
      healthcare_admin: 'المختبرات', services: 'الشركاء', professional_services: 'الشركاء',
      custom: 'الماركات',
    },
    attributes: {
      ceramics: 'مقاسات السيراميك', sanitary: 'مواصفات الأدوات', furniture: 'مقاسات الأثاث',
      home_appliances: 'مواصفات الأجهزة', electronics: 'مواصفات الأجهزة', clothing: 'مقاسات الملابس',
      food: 'مكونات الأصناف', cosmetics: 'مكونات التجميل', automotive: 'توافق القطع',
      building_materials: 'مواصفات المواد', lighting: 'مواصفات الإضاءة', ecommerce: 'خصائص المتجر',
      general: 'الخصائص الديناميكية', hospitality: 'مواصفات الغرف',
      education: 'متطلبات الدورات', workshop: 'توافق القطع', manufacturing: 'مواصفات الإنتاج',
      construction: 'مواصفات البنود', import_export: 'مواصفات البضائع', logistics: 'خصائص الشحن',
      healthcare_admin: 'تخصصات الخدمات', services: 'خصائص الخدمات', professional_services: 'خصائص الملفات',
      custom: 'الخصائص الديناميكية',
    },
    barcodes: {
      ceramics: 'باركود السيراميك', sanitary: 'باركود الأدوات', furniture: 'باركود الأثاث',
      home_appliances: 'باركود الأجهزة', electronics: 'باركود الأجهزة', clothing: 'باركود الملابس',
      food: 'باركود الأصناف', cosmetics: 'باركود التجميل', automotive: 'باركود القطع',
      building_materials: 'باركود المواد', lighting: 'باركود الإضاءة', ecommerce: 'باركود المتجر',
      general: 'الباركود', hospitality: 'رموز الغرف',
      education: 'رموز الدورات', workshop: 'باركود القطع', manufacturing: 'باركود الإنتاج',
      construction: 'باركود المواد', import_export: 'باركود البضائع', logistics: 'باركود الشحنات',
      healthcare_admin: 'رموز الخدمات', services: 'رموز الخدمات', professional_services: 'رموز الملفات',
      custom: 'الباركود',
    },
  },
};

/** Family-level fallbacks for retail subtypes sharing showroom wording. */
const FAMILY_TAB_LABELS: Record<ActivityHubId, Record<string, Record<string, string>>> = {
  sales: {
    invoices: { retail: 'فواتير المعرض' },
    analytics: { retail: 'تحليلات المبيعات', distribution: 'تحليلات التوزيع', manufacturing: 'تحليلات الإنتاج', construction: 'تحليلات التنفيذ', transport: 'تحليلات الورشة', hospitality: 'تحليلات الضيافة', healthcare: 'تحليلات الخدمات', education: 'تحليلات التسجيل', professional_services: 'تحليلات الأعمال' },
    cycle: { retail: 'دورة الفاتورة', distribution: 'دورة الشحنة', manufacturing: 'دورة أمر التسليم', construction: 'دورة المستخلص', transport: 'دورة أمر الشغل', hospitality: 'دورة الإقامة', healthcare: 'دورة الكشف', education: 'دورة القسط', professional_services: 'دورة الملف' },
    statement: { retail: 'كشف حساب عميل', distribution: 'كشف حساب عميل', manufacturing: 'كشف حساب عميل', construction: 'كشف حساب العميل', transport: 'كشف حساب العميل', hospitality: 'كشف حساب النزيل', healthcare: 'كشف حساب المريض', education: 'كشف حساب ولي الأمر', professional_services: 'كشف حساب العميل' },
    'orders-deposits': { retail: 'حجوزات ودفعات', distribution: 'دفعات وطلبات', manufacturing: 'دفعات العملاء', construction: 'مستخلصات ودفعات', transport: 'دفعات العملاء', hospitality: 'حجوزات ودفعات', healthcare: 'مواعيد ودفعات', education: 'تسجيل وأقساط', professional_services: 'مواعيد التسليم' },
    'after-sales': { retail: 'خدمة ما بعد البيع', distribution: 'متابعة الشحنات', manufacturing: 'مطالبات الجودة', construction: 'متابعة التنفيذ', transport: 'ضمانات الصيانة', hospitality: 'شكاوى النزلاء', healthcare: 'متابعة الحالات', education: 'متابعة الغياب', professional_services: 'متابعة الملفات' },
    quotations: { retail: 'عروض الأسعار', distribution: 'عروض الأسعار', manufacturing: 'عروض التصنيع', construction: 'عروض المقاولات', transport: 'عروض الصيانة', hospitality: 'عروض الإقامة', healthcare: 'عروض الفحوصات', education: 'عروض الدورات', professional_services: 'عروض الأتعاب' },
    orders: { retail: 'طلبات العملاء', distribution: 'طلبات التوريد', manufacturing: 'طلبات البيع', construction: 'أوامر العملاء', transport: 'أوامر العمل', hospitality: 'طلبات النزلاء', healthcare: 'طلبات الخدمات', education: 'طلبات التسجيل', professional_services: 'ملفات العملاء' },
    returns: { retail: 'مرتجعات المبيعات', distribution: 'مرتجعات الشحنات', manufacturing: 'منتجات مرتجعة', construction: 'بنود ملغاة', transport: 'قطع مستبدلة', hospitality: 'إلغاءات', healthcare: 'خدمات ملغاة', education: 'انسحابات', professional_services: 'ملفات ملغاة' },
    'electronic-invoicing': { retail: 'الفاتورة الإلكترونية', distribution: 'الفاتورة الإلكترونية', manufacturing: 'الفاتورة الإلكترونية', construction: 'الفاتورة الإلكترونية', transport: 'الفاتورة الإلكترونية', hospitality: 'الفاتورة الإلكترونية', healthcare: 'الفاتورة الإلكترونية', education: 'الفاتورة الإلكترونية', professional_services: 'الفاتورة الإلكترونية' },
  },
  inventory: {
    overview: { retail: 'مخزون المعرض', distribution: 'مخزون المستودعات', manufacturing: 'مخزون الإنتاج', construction: 'مخزون المواقع', transport: 'مخزون القطع', hospitality: 'مستلزمات الضيافة', healthcare: 'مستلزمات المنشأة', education: 'مستلزمات المؤسسة', professional_services: 'مستلزمات المكتب' },
    'warehouse-stock': { retail: 'مخزون المخزن', distribution: 'أرصدة المستودعات', manufacturing: 'مخازن الإنتاج', construction: 'مخازن المواقع', transport: 'مخزن القطع', hospitality: 'مخزن الضيافة', healthcare: 'مخزن المنشأة', education: 'المخزن الرئيسي', professional_services: 'مخزن المكتب' },
    'showroom-stock': { retail: 'أرصدة المعارض', distribution: 'أرصدة المعارض', manufacturing: 'أرصدة المعارض', construction: 'أرصدة المعارض', transport: 'أرصدة المعارض', hospitality: 'أرصدة الاستقبال', healthcare: 'أرصدة الاستقبال', education: 'أرصدة المعارض', professional_services: 'أرصدة المعارض' },
    ledger: { retail: 'سجل الحركة', distribution: 'سجل الحركة', manufacturing: 'سجل الإنتاج', construction: 'سجل المواقع', transport: 'سجل القطع', hospitality: 'سجل المستلزمات', healthcare: 'سجل المستلزمات', education: 'سجل المؤسسة', professional_services: 'سجل المكتب' },
    transfers: { retail: 'التحويلات', distribution: 'التحويلات', manufacturing: 'التحويلات', construction: 'تحويلات المواقع', transport: 'تحويلات القطع', hospitality: 'تحويلات المستلزمات', healthcare: 'تحويلات المستلزمات', education: 'التحويلات', professional_services: 'التحويلات' },
    counts: { retail: 'الجرد', distribution: 'الجرد', manufacturing: 'جرد الإنتاج', construction: 'جرد المواقع', transport: 'جرد القطع', hospitality: 'جرد المستلزمات', healthcare: 'جرد المستلزمات', education: 'جرد المؤسسة', professional_services: 'الجرد' },
    valuation: { retail: 'التقييم', distribution: 'التقييم', manufacturing: 'تقييم الإنتاج', construction: 'تقييم المواقع', transport: 'تقييم القطع', hospitality: 'تقييم المستلزمات', healthcare: 'تقييم المستلزمات', education: 'تقييم المؤسسة', professional_services: 'التقييم' },
    adjustments: { retail: 'التسويات', distribution: 'التسويات', manufacturing: 'تسويات الإنتاج', construction: 'تسويات المواقع', transport: 'تسويات القطع', hospitality: 'تسويات المستلزمات', healthcare: 'تسويات المستلزمات', education: 'تسويات المؤسسة', professional_services: 'التسويات' },
    'stock-reservations': { retail: 'حجوزات المخزون', distribution: 'حجوزات البضاعة', manufacturing: 'حجوزات الإنتاج', construction: 'حجوزات المواقع', transport: 'حجوزات القطع', hospitality: 'حجوزات المستلزمات', healthcare: 'حجوزات المستلزمات', education: 'حجوزات المؤسسة', professional_services: 'حجوزات المخزون' },
    'reorder-planning': { retail: 'تجديد الطلبات', distribution: 'تجديد التوريد', manufacturing: 'تخطيط الخامات', construction: 'مواد مطلوبة', transport: 'قطع غيار مطلوبة', hospitality: 'توريد المستلزمات', healthcare: 'توريد المستلزمات', education: 'توريد المستلزمات', professional_services: 'توريد المكتب' },
    locations: { retail: 'مواقع الرفوف', distribution: 'مواقع المستودعات', manufacturing: 'مواقع الإنتاج', construction: 'مواقع المواقع', transport: 'مواقع القطع', hospitality: 'مواقع المستلزمات', healthcare: 'مواقع المستلزمات', education: 'مواقع المؤسسة', professional_services: 'مواقع المكتب' },
    'damage-quarantine': { retail: 'التالف والحجر', distribution: 'التالف والحجر', manufacturing: 'المرفوضات', construction: 'المواد المرفوضة', transport: 'القطع التالفة', hospitality: 'المستلزمات التالفة', healthcare: 'المستلزمات التالفة', education: 'المستلزمات التالفة', professional_services: 'التالف والحجر' },
    reconciliation: { retail: 'المطابقة', distribution: 'المطابقة', manufacturing: 'مطابقة الإنتاج', construction: 'مطابقة المواقع', transport: 'مطابقة القطع', hospitality: 'مطابقة المستلزمات', healthcare: 'مطابقة المستلزمات', education: 'مطابقة المؤسسة', professional_services: 'المطابقة' },
    alerts: { retail: 'تنبيهات المخزون', distribution: 'تنبيهات البضاعة', manufacturing: 'تنبيهات الإنتاج', construction: 'تنبيهات المواقع', transport: 'تنبيهات القطع', hospitality: 'تنبيهات المستلزمات', healthcare: 'تنبيهات المستلزمات', education: 'تنبيهات المؤسسة', professional_services: 'تنبيهات المخزون' },
  },
  purchasing: {
    invoices: { retail: 'فواتير التوريد', distribution: 'فواتير التوريد', manufacturing: 'فواتير الخامات', construction: 'فواتير الموردين', transport: 'فواتير التشغيل', hospitality: 'فواتير التوريد', healthcare: 'فواتير الموردين', education: 'فواتير الموردين', professional_services: 'فواتير المكتب' },
    requests: { retail: 'طلبات الشراء', distribution: 'طلبات التوريد', manufacturing: 'طلبات الخامات', construction: 'طلبات المواقع', transport: 'طلبات التشغيل', hospitality: 'طلبات المستلزمات', healthcare: 'طلبات المشتريات', education: 'طلبات المشتريات', professional_services: 'طلبات المكتب' },
    quotations: { retail: 'عروض الموردين', distribution: 'عروض الموردين', manufacturing: 'عروض الخامات', construction: 'عروض المقاولين', transport: 'عروض التشغيل', hospitality: 'عروض المستلزمات', healthcare: 'عروض الموردين', education: 'عروض الموردين', professional_services: 'عروض المكتب' },
    orders: { retail: 'أوامر الشراء', distribution: 'أوامر التوريد', manufacturing: 'أوامر الخامات', construction: 'أوامر المواقع', transport: 'أوامر التشغيل', hospitality: 'أوامر المستلزمات', healthcare: 'أوامر الشراء', education: 'أوامر الشراء', professional_services: 'أوامر الشراء' },
    receipts: { retail: 'إذن الاستلام', distribution: 'إذن الاستلام', manufacturing: 'استلام الخامات', construction: 'استلام المواقع', transport: 'استلام التشغيل', hospitality: 'استلام المستلزمات', healthcare: 'استلام المستلزمات', education: 'استلام المشتريات', professional_services: 'استلام المكتب' },
    incoming: { retail: 'الواردات', distribution: 'الواردات', manufacturing: 'الخامات الواردة', construction: 'واردات المواقع', transport: 'الواردات', hospitality: 'المستلزمات الواردة', healthcare: 'الواردات', education: 'الواردات', professional_services: 'الواردات' },
    returns: { retail: 'مرتجعات المشتريات', distribution: 'مرتجعات التوريد', manufacturing: 'الخامات المرفوضة', construction: 'مرتجعات المواقع', transport: 'مرتجعات التشغيل', hospitality: 'مرتجعات المستلزمات', healthcare: 'مرتجعات المشتريات', education: 'مرتجعات المشتريات', professional_services: 'مرتجعات المكتب' },
    claims: { retail: 'مطالبات الموردين', distribution: 'مطالبات الشحن', manufacturing: 'مطالبات الجودة', construction: 'مطالبات المواقع', transport: 'مطالبات التشغيل', hospitality: 'مطالبات المستلزمات', healthcare: 'مطالبات الموردين', education: 'مطالبات الموردين', professional_services: 'مطالبات المكتب' },
    statement: { retail: 'كشف حساب المورد', distribution: 'كشف حساب المورد', manufacturing: 'كشف حساب المورد', construction: 'كشف حساب المورد', transport: 'كشف حساب المورد', hospitality: 'كشف حساب المورد', healthcare: 'كشف حساب المورد', education: 'كشف حساب المورد', professional_services: 'كشف حساب المورد' },
  },
  crm: {
    dashboard: { retail: 'لوحة العملاء', distribution: 'لوحة العملاء', manufacturing: 'لوحة العملاء', construction: 'لوحة المشاريع', transport: 'لوحة العملاء', hospitality: 'لوحة النزلاء', healthcare: 'لوحة المرضى', education: 'لوحة أولياء الأمور', professional_services: 'لوحة العملاء' },
    customers: { retail: 'العملاء', distribution: 'العملاء والموزعون', manufacturing: 'العملاء', construction: 'أصحاب المشاريع', transport: 'السيارات والعملاء', hospitality: 'النزلاء', healthcare: 'المرضى', education: 'الطلاب وأولياء الأمور', professional_services: 'العملاء' },
    leads: { retail: 'عملاء محتملون', distribution: 'عملاء محتملون', manufacturing: 'عملاء محتملون', construction: 'مشاريع محتملة', transport: 'سيارات جديدة', hospitality: 'نزلاء محتملون', healthcare: 'مرضى جدد', education: 'طلاب محتملون', professional_services: 'عملاء محتملون' },
    pipeline: { retail: 'مسار المبيعات', distribution: 'مسار التوزيع', manufacturing: 'مسار البيع', construction: 'مسار المشاريع', transport: 'مسار الصيانة', hospitality: 'مسار الحجوزات', healthcare: 'مسار المواعيد', education: 'مسار التسجيل', professional_services: 'مسار الملفات' },
    activities: { retail: 'الأنشطة والمتابعة', distribution: 'الأنشطة والمتابعة', manufacturing: 'الأنشطة والمتابعة', construction: 'متابعة المشاريع', transport: 'متابعة السيارات', hospitality: 'متابعة النزلاء', healthcare: 'متابعة المرضى', education: 'متابعة أولياء الأمور', professional_services: 'متابعة العملاء' },
    campaigns: { retail: 'الحملات', distribution: 'الحملات', manufacturing: 'الحملات', construction: 'الحملات', transport: 'العروض', hospitality: 'العروض الموسمية', healthcare: 'حملات الفحوصات', education: 'حملات التسجيل', professional_services: 'الحملات' },
  },
  receivables: {
    debts: { retail: 'ديون العملاء', distribution: 'ديون الموزعين', manufacturing: 'ديون العملاء', construction: 'مستخلصات مدينة', transport: 'ديون العملاء', hospitality: 'ديون النزلاء', healthcare: 'ديون المرضى والتأمين', education: 'ديون أولياء الأمور', professional_services: 'أتعاب مدينة' },
    other: { retail: 'المطالبات الأخرى', distribution: 'المطالبات الأخرى', manufacturing: 'المطالبات الأخرى', construction: 'مطالبات المشاريع', transport: 'المطالبات الأخرى', hospitality: 'مطالبات النزلاء', healthcare: 'مطالبات التأمين', education: 'مطالبات الرسوم', professional_services: 'مطالبات الأتعاب' },
    installments: { retail: 'الأقساط', distribution: 'الأقساط', manufacturing: 'الأقساط', construction: 'دفعات المشاريع', transport: 'الأقساط', hospitality: 'أقساط النزلاء', healthcare: 'تقسيط الرسوم', education: 'أقساط الطلاب', professional_services: 'أتعاب بالتقسيط' },
    'follow-up': { retail: 'التحصيل والمتابعة', distribution: 'التحصيل والمتابعة', manufacturing: 'التحصيل والمتابعة', construction: 'تحصيل المستخلصات', transport: 'التحصيل والمتابعة', hospitality: 'تحصيل النزلاء', healthcare: 'تحصيل المرضى', education: 'تحصيل الرسوم', professional_services: 'تحصيل الأتعاب' },
  },
  products: {
    products: { retail: 'المنتجات', distribution: 'البضائع', manufacturing: 'المنتجات المصنعة', construction: 'بنود التنفيذ', transport: 'قطع الغيار', hospitality: 'الغرف والخدمات', healthcare: 'الخدمات الطبية', education: 'الدورات والخدمات', professional_services: 'الخدمات المهنية' },
    categories: { retail: 'التصنيفات', distribution: 'أصناف البضائع', manufacturing: 'مجموعات المنتجات', construction: 'بنود التنفيذ', transport: 'أصناف قطع الغيار', hospitality: 'أقسام الفندق', healthcare: 'تخصصات العيادة', education: 'أقسام الدورات', professional_services: 'أنواع الملفات' },
    brands: { retail: 'الماركات', distribution: 'المصانع', manufacturing: 'مصانع المواد', construction: 'موردو المواد', transport: 'مصانع القطع', hospitality: 'موردو الفندق', healthcare: 'المختبرات', education: 'الجهات التعليمية', professional_services: 'الشركاء' },
    attributes: { retail: 'الخصائص الديناميكية', distribution: 'مواصفات البضائع', manufacturing: 'مواصفات الإنتاج', construction: 'مواصفات البنود', transport: 'توافق القطع', hospitality: 'مواصفات الغرف', healthcare: 'تخصصات الخدمات', education: 'متطلبات الدورات', professional_services: 'خصائص الملفات' },
    barcodes: { retail: 'الباركود', distribution: 'باركود البضائع', manufacturing: 'باركود الإنتاج', construction: 'باركود المواد', transport: 'باركود القطع', hospitality: 'رموز الغرف', healthcare: 'رموز الخدمات', education: 'رموز الدورات', professional_services: 'رموز الملفات' },
  },
};

/**
 * Per-activity tab ordering: tab ids listed here surface first, in the given
 * order; unlisted tabs keep their default order after them. Used so each
 * activity leads with the workflow it actually runs (room bookings for a
 * hotel, job cards for a workshop, installments for a school...).
 */
const ACTIVITY_TAB_ORDER: Partial<Record<ActivityHubId, Record<string, string[]>>> = {
  sales: {
    hospitality: ['orders-deposits', 'orders', 'invoices', 'statement', 'returns', 'after-sales', 'quotations', 'analytics', 'cycle', 'electronic-invoicing'],
    education: ['orders-deposits', 'statement', 'orders', 'invoices', 'quotations', 'returns', 'after-sales', 'analytics', 'cycle', 'electronic-invoicing'],
    healthcare_admin: ['orders', 'orders-deposits', 'statement', 'invoices', 'quotations', 'after-sales', 'returns', 'analytics', 'cycle', 'electronic-invoicing'],
    workshop: ['orders', 'cycle', 'orders-deposits', 'quotations', 'invoices', 'after-sales', 'returns', 'statement', 'analytics', 'electronic-invoicing'],
    construction: ['orders-deposits', 'quotations', 'orders', 'cycle', 'invoices', 'statement', 'after-sales', 'returns', 'analytics', 'electronic-invoicing'],
    manufacturing: ['orders', 'cycle', 'invoices', 'orders-deposits', 'quotations', 'returns', 'after-sales', 'analytics', 'statement', 'electronic-invoicing'],
    import_export: ['orders', 'orders-deposits', 'invoices', 'quotations', 'returns', 'cycle', 'statement', 'after-sales', 'analytics', 'electronic-invoicing'],
    logistics: ['orders', 'orders-deposits', 'invoices', 'returns', 'quotations', 'cycle', 'statement', 'after-sales', 'analytics', 'electronic-invoicing'],
    professional_services: ['orders', 'statement', 'quotations', 'invoices', 'orders-deposits', 'after-sales', 'returns', 'analytics', 'cycle', 'electronic-invoicing'],
    services: ['orders', 'statement', 'quotations', 'invoices', 'orders-deposits', 'after-sales', 'returns', 'analytics', 'cycle', 'electronic-invoicing'],
    ecommerce: ['orders', 'invoices', 'returns', 'quotations', 'orders-deposits', 'after-sales', 'analytics', 'statement', 'cycle', 'electronic-invoicing'],
    food: ['invoices', 'orders', 'returns', 'orders-deposits', 'quotations', 'after-sales', 'analytics', 'statement', 'cycle', 'electronic-invoicing'],
  },
  inventory: {
    manufacturing: ['overview', 'warehouse-stock', 'reorder-planning', 'damage-quarantine', 'counts', 'ledger', 'transfers', 'adjustments', 'valuation', 'alerts', 'stock-reservations', 'locations', 'reconciliation', 'showroom-stock'],
    construction: ['overview', 'warehouse-stock', 'reorder-planning', 'transfers', 'damage-quarantine', 'counts', 'alerts', 'ledger', 'adjustments', 'valuation', 'locations', 'reconciliation', 'stock-reservations', 'showroom-stock'],
    ecommerce: ['overview', 'warehouse-stock', 'reorder-planning', 'alerts', 'stock-reservations', 'counts', 'ledger', 'transfers', 'adjustments', 'valuation', 'damage-quarantine', 'locations', 'reconciliation', 'showroom-stock'],
    food: ['overview', 'warehouse-stock', 'reorder-planning', 'damage-quarantine', 'alerts', 'counts', 'ledger', 'transfers', 'adjustments', 'valuation', 'stock-reservations', 'locations', 'reconciliation', 'showroom-stock'],
    logistics: ['overview', 'warehouse-stock', 'transfers', 'locations', 'counts', 'reorder-planning', 'damage-quarantine', 'alerts', 'ledger', 'adjustments', 'valuation', 'reconciliation', 'stock-reservations', 'showroom-stock'],
    import_export: ['overview', 'warehouse-stock', 'reorder-planning', 'damage-quarantine', 'counts', 'alerts', 'ledger', 'transfers', 'adjustments', 'valuation', 'locations', 'reconciliation', 'stock-reservations', 'showroom-stock'],
    workshop: ['overview', 'warehouse-stock', 'reorder-planning', 'damage-quarantine', 'counts', 'alerts', 'ledger', 'transfers', 'adjustments', 'valuation', 'stock-reservations', 'locations', 'reconciliation', 'showroom-stock'],
    hospitality: ['overview', 'warehouse-stock', 'reorder-planning', 'damage-quarantine', 'alerts', 'counts', 'ledger', 'transfers', 'adjustments', 'valuation', 'locations', 'reconciliation', 'stock-reservations', 'showroom-stock'],
    healthcare_admin: ['overview', 'warehouse-stock', 'reorder-planning', 'damage-quarantine', 'alerts', 'counts', 'ledger', 'transfers', 'adjustments', 'valuation', 'locations', 'reconciliation', 'stock-reservations', 'showroom-stock'],
    education: ['overview', 'warehouse-stock', 'reorder-planning', 'damage-quarantine', 'alerts', 'counts', 'ledger', 'transfers', 'adjustments', 'valuation', 'locations', 'reconciliation', 'stock-reservations', 'showroom-stock'],
    professional_services: ['overview', 'warehouse-stock', 'reorder-planning', 'alerts', 'counts', 'ledger', 'transfers', 'adjustments', 'valuation', 'locations', 'reconciliation', 'damage-quarantine', 'stock-reservations', 'showroom-stock'],
    services: ['overview', 'warehouse-stock', 'reorder-planning', 'alerts', 'counts', 'ledger', 'transfers', 'adjustments', 'valuation', 'locations', 'reconciliation', 'damage-quarantine', 'stock-reservations', 'showroom-stock'],
  },
  purchasing: {
    manufacturing: ['orders', 'receipts', 'incoming', 'invoices', 'returns', 'requests', 'quotations', 'claims', 'statement'],
    construction: ['orders', 'receipts', 'incoming', 'invoices', 'returns', 'requests', 'quotations', 'claims', 'statement'],
    import_export: ['orders', 'incoming', 'receipts', 'invoices', 'claims', 'returns', 'requests', 'quotations', 'statement'],
    logistics: ['orders', 'receipts', 'incoming', 'invoices', 'returns', 'claims', 'requests', 'quotations', 'statement'],
    ecommerce: ['orders', 'receipts', 'incoming', 'invoices', 'returns', 'requests', 'quotations', 'claims', 'statement'],
    food: ['orders', 'receipts', 'incoming', 'invoices', 'returns', 'requests', 'quotations', 'claims', 'statement'],
    workshop: ['orders', 'receipts', 'incoming', 'invoices', 'returns', 'requests', 'quotations', 'claims', 'statement'],
    hospitality: ['orders', 'receipts', 'incoming', 'invoices', 'returns', 'requests', 'quotations', 'claims', 'statement'],
    healthcare_admin: ['orders', 'receipts', 'incoming', 'invoices', 'returns', 'requests', 'quotations', 'claims', 'statement'],
    education: ['orders', 'receipts', 'incoming', 'invoices', 'returns', 'requests', 'quotations', 'claims', 'statement'],
    professional_services: ['orders', 'invoices', 'receipts', 'incoming', 'statement', 'returns', 'requests', 'quotations', 'claims'],
    services: ['orders', 'invoices', 'receipts', 'incoming', 'statement', 'returns', 'requests', 'quotations', 'claims'],
  },
  crm: {
    hospitality: ['customers', 'activities', 'leads', 'pipeline', 'campaigns', 'dashboard'],
    education: ['customers', 'leads', 'pipeline', 'activities', 'campaigns', 'dashboard'],
    healthcare_admin: ['customers', 'leads', 'pipeline', 'activities', 'campaigns', 'dashboard'],
    workshop: ['customers', 'pipeline', 'activities', 'leads', 'campaigns', 'dashboard'],
    construction: ['customers', 'pipeline', 'leads', 'activities', 'campaigns', 'dashboard'],
    ecommerce: ['customers', 'campaigns', 'leads', 'pipeline', 'activities', 'dashboard'],
    professional_services: ['customers', 'pipeline', 'activities', 'leads', 'campaigns', 'dashboard'],
    services: ['customers', 'pipeline', 'activities', 'leads', 'campaigns', 'dashboard'],
  },
  receivables: {
    education: ['installments', 'debts', 'other', 'follow-up'],
    construction: ['debts', 'other', 'follow-up', 'installments'],
    hospitality: ['debts', 'other', 'follow-up', 'installments'],
    healthcare_admin: ['debts', 'other', 'follow-up', 'installments'],
    professional_services: ['debts', 'other', 'follow-up', 'installments'],
    services: ['debts', 'other', 'follow-up', 'installments'],
    ecommerce: ['installments', 'debts', 'other', 'follow-up'],
  },
};

/** Activity-aware label for a single hub tab (falls back to the passed label). */
export function resolveHubTabLabel(
  hub: ActivityHubId,
  tabId: string,
  fallback: string,
  businessType: string = getEffectiveBusinessType(),
): string {
  const familyId = getBusinessProfile(businessType).familyId;
  return (
    ACTIVITY_TAB_LABELS[hub]?.[tabId]?.[businessType]
    ?? (familyId ? FAMILY_TAB_LABELS[hub]?.[tabId]?.[familyId] : undefined)
    ?? fallback
  );
}

/** Activity-specific tab order for a hub (undefined = keep declared order). */
export function getHubTabOrder(hub: ActivityHubId, businessType: string = getEffectiveBusinessType()): string[] | undefined {
  return ACTIVITY_TAB_ORDER[hub]?.[businessType];
}

/** Tabs that only make sense for activities whose family keeps them visible. */
export function resolveHubTabs<T extends HubTabLike>(
  hub: ActivityHubId,
  tabs: T[],
  businessType: string = getEffectiveBusinessType(),
): T[] {
  const visible = tabs
    .filter((tab) => !isActivityPathHidden(tab.path, businessType))
    .map((tab) => {
      const label = resolveHubTabLabel(hub, tab.id, tab.label, businessType);
      return label === tab.label ? tab : { ...tab, label };
    });
  const order = ACTIVITY_TAB_ORDER[hub]?.[businessType];
  if (!order?.length) return visible;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...visible].sort((a, b) => {
    const ra = rank.get(a.id) ?? order.length;
    const rb = rank.get(b.id) ?? order.length;
    return ra === rb ? 0 : ra - rb;
  });
}
