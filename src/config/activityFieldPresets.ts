/**
 * Sector-specific operational field presets.
 *
 * Each business activity declares the extra typed fields its documents and
 * records need (customer car plate for an auto-parts shop, project site for a
 * ceramics showroom, incoterm for an importer, ...). Presets are keyed by
 * activity id (which equals the business profile template id) and are seeded
 * idempotently into `operational_field_definitions` when the profile is
 * applied, so every tenant sees fields that match its line of business.
 */

export type ActivityFieldDataType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'DATE';

export interface ActivityFieldPreset {
  entityType: string;
  code: string;
  name: string;
  dataType: ActivityFieldDataType;
  unit?: string;
  isRequired?: boolean;
  isFilterable?: boolean;
  options?: string[];
}

const f = (
  entityType: string,
  code: string,
  name: string,
  dataType: ActivityFieldDataType,
  extra?: Partial<ActivityFieldPreset>,
): ActivityFieldPreset => ({ entityType, code, name, dataType, ...extra });

export const ACTIVITY_FIELD_PRESETS: Record<string, ActivityFieldPreset[]> = {
  // ── Retail & showrooms ──────────────────────────────────────────────
  ceramics: [
    f('customers', 'PROJECT_NAME', 'اسم المشروع / العميل', 'TEXT'),
    f('customers', 'SITE_ADDRESS', 'موقع المشروع', 'TEXT'),
    f('sales_invoices', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
    f('sales_invoices', 'INSTALLATION_REQUIRED', 'يتطلب تركيب', 'BOOLEAN'),
    f('orders', 'REQUIRED_BY_DATE', 'موعد التسليم المطلوب', 'DATE'),
  ],
  sanitary: [
    f('customers', 'PROJECT_NAME', 'اسم المشروع / العميل', 'TEXT'),
    f('customers', 'SITE_ADDRESS', 'موقع المشروع', 'TEXT'),
    f('orders', 'INSTALLATION_REQUIRED', 'يتطلب تركيب', 'BOOLEAN'),
    f('orders', 'REQUIRED_BY_DATE', 'موعد التسليم المطلوب', 'DATE'),
  ],
  furniture: [
    f('customers', 'PROJECT_NAME', 'اسم المشروع / العميل', 'TEXT'),
    f('orders', 'DELIVERY_DATE', 'موعد التسليم', 'DATE'),
    f('orders', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
    f('orders', 'FLOOR_LEVEL', 'الدور / الدور المطلوب', 'TEXT'),
  ],
  home_appliances: [
    f('sales_invoices', 'WARRANTY_MONTHS', 'مدة الضمان (شهر)', 'NUMBER'),
    f('sales_invoices', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
    f('orders', 'DELIVERY_DATE', 'موعد التسليم', 'DATE'),
    f('orders', 'INSTALLATION_REQUIRED', 'يتطلب تركيب', 'BOOLEAN'),
  ],
  electronics: [
    f('sales_invoices', 'IMEI_SERIAL', 'الرقم التسلسلي / IMEI', 'TEXT'),
    f('sales_invoices', 'WARRANTY_MONTHS', 'مدة الضمان (شهر)', 'NUMBER'),
    f('orders', 'WARRANTY_TYPE', 'نوع الضمان', 'SELECT', { options: ['ضمان الوكيل', 'ضمان المحل', 'بدون ضمان'] }),
  ],
  clothing: [
    f('orders', 'DELIVERY_DATE', 'موعد التسليم', 'DATE'),
    f('orders', 'EXCHANGE_WINDOW_DAYS', 'مهلة الاستبدال (يوم)', 'NUMBER'),
    f('sales_returns', 'REASON_CATEGORY', 'سبب الإرجاع', 'SELECT', { options: ['مقاس غير مناسب', 'عيب مصنعي', 'خطأ في الطلب', 'تغيير رأي'] }),
  ],
  food: [
    f('products', 'EXPIRY_DATE', 'تاريخ الصلاحية', 'DATE', { isFilterable: true }),
    f('products', 'BATCH_NUMBER', 'رقم التشغيلة', 'TEXT', { isFilterable: true }),
    f('products', 'STORAGE_ZONE', 'منطقة التخزين', 'TEXT'),
  ],
  cosmetics: [
    f('customers', 'SKIN_TYPE', 'نوع البشرة', 'SELECT', { options: ['جافة', 'دهنية', 'مختلطة', 'حساسة'] }),
    f('customers', 'ALLERGIES', 'حساسية / ملاحظات', 'TEXT'),
  ],
  automotive: [
    f('customers', 'CAR_BRAND', 'ماركة السيارة', 'TEXT'),
    f('customers', 'CAR_MODEL', 'موديل السيارة', 'TEXT'),
    f('customers', 'CAR_YEAR', 'سنة الصنع', 'NUMBER'),
    f('customers', 'PLATE_NUMBER', 'رقم اللوحة', 'TEXT', { isFilterable: true }),
    f('customers', 'CHASSIS_NO', 'رقم الشاسيه', 'TEXT'),
  ],
  building_materials: [
    f('customers', 'PROJECT_NAME', 'اسم المشروع / العميل', 'TEXT'),
    f('customers', 'SITE_ADDRESS', 'موقع المشروع', 'TEXT'),
    f('sales_invoices', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
    f('sales_invoices', 'CRANE_REQUIRED', 'يتطلب رفع /', 'BOOLEAN'),
    f('orders', 'REQUIRED_BY_DATE', 'موعد التسليم', 'DATE'),
  ],
  lighting: [
    f('customers', 'PROJECT_NAME', 'اسم المشروع / العميل', 'TEXT'),
    f('customers', 'SITE_ADDRESS', 'موقع المشروع', 'TEXT'),
    f('sales_invoices', 'WARRANTY_MONTHS', 'مدة الضمان (شهر)', 'NUMBER'),
  ],
  ecommerce: [
    f('customers', 'GOVERNORATE', 'المحافظة', 'TEXT'),
    f('customers', 'ADDRESS', 'العنوان', 'TEXT'),
    f('orders', 'SHIPPING_ADDRESS', 'عنوان الشحن', 'TEXT'),
    f('orders', 'SHIPPING_COMPANY', 'شركة الشحن', 'SELECT', { options: ['البريد العربي', 'أرامكس', 'بريد مُستعجل', 'استلام من الفرع'] }),
    f('orders', 'TRACKING_NUMBER', 'رقم التتبع', 'TEXT'),
  ],
  general: [
    f('customers', 'GOVERNORATE', 'المحافظة', 'TEXT'),
    f('customers', 'ADDRESS', 'العنوان', 'TEXT'),
  ],

  // ── Distribution & supply ───────────────────────────────────────────
  import_export: [
    f('suppliers', 'COUNTRY', 'بلد المنشأ', 'TEXT', { isFilterable: true }),
    f('suppliers', 'CURRENCY', 'عملة التعامل', 'SELECT', { options: ['USD', 'EUR', 'CNY', 'TRY', 'AED', 'SAR'] }),
    f('customers', 'COUNTRY', 'بلد العميل', 'TEXT', { isFilterable: true }),
    f('customers', 'PAYMENT_TERMS', 'شروط الدفع', 'SELECT', { options: ['نقدي مقدم', 'آجل 30 يوم', 'آجل 60 يوم', 'خطابات اعتماد'] }),
    f('purchase_invoices', 'INCOTERM', 'شرط التسليم الدولي', 'SELECT', { options: ['EXW', 'FOB', 'CIF', 'CFR', 'DDP', 'DAP'] }),
    f('purchase_invoices', 'COUNTRY_OF_ORIGIN', 'بلد المنشأ', 'TEXT'),
    f('purchase_invoices', 'SHIPPING_DOCUMENTS', 'مستندات الشحن', 'BOOLEAN'),
  ],
  logistics: [
    f('customers', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
    f('customers', 'REGION', 'المنطقة / المحافظة', 'TEXT', { isFilterable: true }),
    f('orders', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
    f('orders', 'DELIVERY_WINDOW', 'نافذة التسليم', 'TEXT'),
    f('sales_invoices', 'PALLETS_COUNT', 'عدد البلاطات', 'NUMBER'),
    f('sales_invoices', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
  ],

  // ── Manufacturing ───────────────────────────────────────────────────
  manufacturing: [
    f('products', 'BOM_REFERENCE', 'مرجع قائمة المواد BOM', 'TEXT'),
    f('products', 'PRODUCTION_UNIT', 'وحدة الإنتاج', 'TEXT'),
    f('orders', 'PRODUCTION_BATCH', 'تشغيلة الإنتاج', 'TEXT'),
    f('sales_invoices', 'QUALITY_CERTIFICATE', 'شهادة الجودة مرفقة', 'BOOLEAN'),
  ],

  // ── Construction & real estate ──────────────────────────────────────
  construction: [
    f('customers', 'PROJECT_NAME', 'اسم المشروع', 'TEXT'),
    f('customers', 'SITE_ADDRESS', 'موقع الموقع', 'TEXT'),
    f('customers', 'CONTRACT_VALUE', 'قيمة العقد', 'NUMBER'),
    f('customers', 'CONSULTANT_ENGINEER', 'استشاري المشروع', 'TEXT'),
    f('projects', 'CONTRACT_VALUE', 'قيمة العقد', 'NUMBER'),
    f('projects', 'SITE_ADDRESS', 'موقع الموقع', 'TEXT'),
    f('projects', 'CONSULTANT_ENGINEER', 'استشاري المشروع', 'TEXT'),
    f('projects', 'CONTRACT_TYPE', 'نوع العقد', 'SELECT', { options: ['مقاولة عامة', 'مقاولة باطن', 'إشراف هندسي', 'توريد وتركيب'] }),
    f('purchase_orders', 'SUBCONTRACTOR', 'مقاول الباطن', 'TEXT'),
  ],

  // ── Automotive & transport ──────────────────────────────────────────
  workshop: [
    f('customers', 'CAR_BRAND', 'ماركة السيارة', 'TEXT'),
    f('customers', 'CAR_MODEL', 'موديل السيارة', 'TEXT'),
    f('customers', 'CAR_YEAR', 'سنة الصنع', 'NUMBER'),
    f('customers', 'PLATE_NUMBER', 'رقم اللوحة', 'TEXT', { isFilterable: true }),
    f('customers', 'VIN', 'رقم الهيكل VIN', 'TEXT'),
    f('orders', 'KM_READING', 'قراءة العداد (كم)', 'NUMBER'),
    f('orders', 'COMPLAINT', 'عطل / ملاحظة العميل', 'TEXT'),
    f('orders', 'EXPECTED_READY', 'موعد الإنجاز المتوقع', 'DATE'),
    f('sales_invoices', 'KM_READING', 'قراءة العداد (كم)', 'NUMBER'),
  ],

  // ── Hospitality & food service ──────────────────────────────────────
  hospitality: [
    f('customers', 'NATIONALITY', 'الجنسية', 'TEXT'),
    f('customers', 'ID_NUMBER', 'رقم الهوية / الجواز', 'TEXT'),
    f('orders', 'ROOM_NUMBER', 'رقم الغرفة', 'TEXT'),
    f('orders', 'CHECK_IN_DATE', 'تاريخ الدخول', 'DATE'),
    f('orders', 'CHECK_OUT_DATE', 'تاريخ الخروج', 'DATE'),
    f('orders', 'GUEST_COUNT', 'عدد النزلاء', 'NUMBER'),
    f('sales_invoices', 'NIGHTS_COUNT', 'عدد الليالي', 'NUMBER'),
  ],
  restaurant: [
    f('customers', 'ALLERGIES', 'حساسية طعام', 'TEXT'),
    f('orders', 'TABLE_NUMBER', 'رقم الطاولة', 'TEXT'),
    f('orders', 'WAITING_MINUTES', 'مدة الانتظار (دقيقة)', 'NUMBER'),
    f('orders', 'ORDER_CHANNEL', 'قناة الطلب', 'SELECT', { options: ['محلي', 'سفري', 'توصيل', 'عرض'] }),
  ],

  // ── Healthcare, education, professional services ────────────────────
  healthcare_admin: [
    f('customers', 'NATIONAL_ID', 'الرقم القومي', 'TEXT', { isFilterable: true }),
    f('customers', 'BIRTH_DATE', 'تاريخ الميلاد', 'DATE'),
    f('customers', 'BLOOD_TYPE', 'فصيلة الدم', 'SELECT', { options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] }),
    f('customers', 'INSURANCE_PROVIDER', 'جهة التأمين', 'TEXT'),
  ],
  education: [
    f('customers', 'STUDENT_NAME', 'اسم الطالب', 'TEXT'),
    f('customers', 'GRADE_LEVEL', 'المرحلة الدراسية', 'TEXT'),
    f('customers', 'GUARDIAN_PHONE', 'هاتف ولي الأمر', 'TEXT'),
    f('customers', 'ENROLLMENT_DATE', 'تاريخ الالتحاق', 'DATE'),
  ],
  professional_services: [
    f('customers', 'COMPANY_NAME', 'اسم الشركة', 'TEXT'),
    f('customers', 'TAX_NUMBER', 'الرقم الضريبي', 'TEXT'),
    f('customers', 'COMMERCIAL_REGISTER', 'السجل التجاري', 'TEXT'),
    f('suppliers', 'TAX_NUMBER', 'الرقم الضريبي', 'TEXT'),
    f('sales_invoices', 'PERIOD_FROM', 'الفترة من', 'DATE'),
    f('sales_invoices', 'PERIOD_TO', 'الفترة إلى', 'DATE'),
  ],
  services: [
    f('customers', 'SERVICE_ADDRESS', 'عنوان موقع الخدمة', 'TEXT'),
    f('orders', 'SERVICE_TYPE', 'نوع الخدمة', 'SELECT', { options: ['تركيب', 'صيانة', 'إصلاح', 'فحص', 'استشارة'] }),
    f('orders', 'VISIT_DATE', 'موعد الزيارة', 'DATE'),
    f('orders', 'WARRANTY_MONTHS', 'مدة الضمان (شهر)', 'NUMBER'),
  ],

  // ── Fallback for any custom / unmapped activity ─────────────────────
  custom: [
    f('customers', 'GOVERNORATE', 'المحافظة', 'TEXT'),
    f('customers', 'ADDRESS', 'العنوان', 'TEXT'),
    f('orders', 'REQUIRED_BY_DATE', 'موعد التسليم المطلوب', 'DATE'),
    f('orders', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
  ],
};

export function getActivityFieldPresets(activityId: string): ActivityFieldPreset[] {
  return ACTIVITY_FIELD_PRESETS[activityId] || [];
}
