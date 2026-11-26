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
    f('customers', 'TRADE_TYPE', 'نوع العميل', 'SELECT', { options: ['مهندس', 'مقاول', 'موزع', 'مكتب تشطيبات', 'فرد'] }),
    f('products', 'TILE_SERIES', 'التشكيلة / المجموعة', 'TEXT', { isFilterable: true }),
    f('products', 'ORIGIN_COUNTRY', 'بلد المنشأ', 'TEXT'),
    f('sales_invoices', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
    f('sales_invoices', 'INSTALLATION_REQUIRED', 'يتطلب تركيب', 'BOOLEAN'),
    f('sales_invoices', 'CUTTING_REQUIRED', 'يتطلب قص وتقطيع', 'BOOLEAN'),
    f('sales_invoices', 'TILE_AREA_M2', 'إجمالي المساحة (م²)', 'NUMBER'),
    f('quotations', 'PROJECT_NAME', 'اسم المشروع / العميل', 'TEXT'),
    f('quotations', 'SITE_ADDRESS', 'موقع المشروع', 'TEXT'),
    f('quotations', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
    f('quotations', 'INSTALLATION_REQUIRED', 'يتطلب تركيب', 'BOOLEAN'),
    f('quotations', 'CUTTING_REQUIRED', 'يتطلب قص وتقطيع', 'BOOLEAN'),
    f('quotations', 'TILE_AREA_M2', 'إجمالي المساحة (م²)', 'NUMBER'),
    f('orders', 'REQUIRED_BY_DATE', 'موعد التسليم المطلوب', 'DATE'),
    f('orders', 'CUT_SPECS', 'مقاسات القص / التقطيع', 'TEXT'),
    f('orders', 'TILE_AREA_M2', 'إجمالي المساحة (م²)', 'NUMBER'),
    f('orders', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
    f('orders', 'INSTALLATION_REQUIRED', 'يتطلب تركيب', 'BOOLEAN'),
    f('orders', 'CUTTING_REQUIRED', 'يتطلب قص وتقطيع', 'BOOLEAN'),
    f('sales_returns', 'DAMAGE_TYPE', 'نوع التلف / سبب الإرجاع', 'SELECT', {
      options: ['كسر أثناء النقل', 'عيب تصنيع', 'خطأ في المقاس أو الفرز', 'تغير رأي العميل', 'أخرى'],
    }),
    f('sales_returns', 'RETURNED_BOXES', 'الكراتين المرتجعة', 'NUMBER'),
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
    f('purchase_invoices', 'BATCH_NUMBER', 'رقم التشغيلة', 'TEXT', { isFilterable: true }),
    f('purchase_invoices', 'EXPIRY_DATE', 'أقرب تاريخ صلاحية', 'DATE'),
    f('purchase_orders', 'REQUIRED_DATE', 'تاريخ الاحتياج', 'DATE'),
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
    f('purchase_invoices', 'LETTER_OF_CREDIT', 'خطاب اعتماد', 'TEXT'),
    f('purchase_orders', 'INCOTERM', 'شرط التسليم الدولي', 'SELECT', { options: ['EXW', 'FOB', 'CIF', 'CFR', 'DDP', 'DAP'] }),
    f('purchase_orders', 'EXPECTED_SHIP_DATE', 'تاريخ الشحن المتوقع', 'DATE'),
    f('purchase_orders', 'PORT_OF_LOADING', 'ميناء الشحن', 'TEXT'),
    f('purchase_orders', 'CUSTOMS_BROKER', 'المخلص الجمركي', 'TEXT'),
  ],
  logistics: [
    f('customers', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
    f('customers', 'REGION', 'المنطقة / المحافظة', 'TEXT', { isFilterable: true }),
    f('orders', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
    f('orders', 'DELIVERY_WINDOW', 'نافذة التسليم', 'TEXT'),
    f('sales_invoices', 'PALLETS_COUNT', 'عدد البلاطات', 'NUMBER'),
    f('sales_invoices', 'DELIVERY_ADDRESS', 'عنوان التسليم', 'TEXT'),
    f('purchase_invoices', 'FREIGHT_COST', 'تكلفة الشحن', 'NUMBER'),
    f('purchase_invoices', 'SUPPLIER_DOC_NO', 'رقم مستند المورد', 'TEXT'),
    f('purchase_orders', 'VEHICLE_PLATE', 'لوحة السيارة', 'TEXT'),
    f('purchase_orders', 'DRIVER_NAME', 'اسم السائق', 'TEXT'),
    f('purchase_orders', 'DELIVERY_WINDOW', 'نافذة التسليم', 'TEXT'),
  ],

  // ── Manufacturing ───────────────────────────────────────────────────
  manufacturing: [
    f('products', 'BOM_REFERENCE', 'مرجع قائمة المواد BOM', 'TEXT'),
    f('products', 'PRODUCTION_UNIT', 'وحدة الإنتاج', 'TEXT'),
    f('orders', 'PRODUCTION_BATCH', 'تشغيلة الإنتاج', 'TEXT'),
    f('sales_invoices', 'QUALITY_CERTIFICATE', 'شهادة الجودة مرفقة', 'BOOLEAN'),
    f('purchase_invoices', 'QC_STATUS', 'نتيجة فحص الجودة', 'SELECT', { options: ['مقبول', 'مرفوض', 'معلّق'] }),
    f('purchase_invoices', 'WORK_ORDER_REF', 'مرجع أمر الشغل', 'TEXT'),
    f('purchase_orders', 'PRODUCTION_ORDER', 'أمر الإنتاج', 'TEXT'),
    f('purchase_orders', 'REQUIRED_DATE', 'تاريخ الاحتياج', 'DATE'),
    f('projects', 'WORK_ORDER', 'أمر الشغل', 'TEXT'),
    f('projects', 'PRODUCTION_BATCH', 'تشغيلة الإنتاج', 'TEXT'),
    f('projects', 'QC_STATUS', 'حالة الجودة', 'SELECT', { options: ['قيد الفحص', 'مطابق', 'غير مطابق'] }),
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
    f('projects', 'PAYMENT_MILESTONE', 'مستحق الدفعة الحالية', 'TEXT'),
    f('projects', 'PROGRESS_PERCENT', 'نسبة الإنجاز (%)', 'NUMBER'),
    f('projects', 'SUPERVISOR', 'مشرف الموقع', 'TEXT'),
    f('purchase_orders', 'SUBCONTRACTOR', 'مقاول الباطن', 'TEXT'),
    f('purchase_orders', 'PROJECT_PHASE', 'مرحلة المشروع', 'TEXT'),
    f('purchase_orders', 'REQUIRED_DATE', 'تاريخ الاحتياج في الموقع', 'DATE'),
    f('purchase_invoices', 'RETENTION_PERCENT', 'نسبة محتجزات', 'NUMBER'),
    f('purchase_invoices', 'MEASUREMENT_NO', 'رقم مستخلص', 'TEXT'),
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

/**
 * Presets for master-data entities beyond documents (leads, employees,
 * vehicles, warehouses). Kept apart from the document presets above so each
 * block stays readable; merged by `getActivityFieldPresets`.
 */
export const ACTIVITY_MASTER_FIELD_PRESETS: Record<string, ActivityFieldPreset[]> = {
  ceramics: [
    f('branches', 'SHOWROOM_AREA_M2', 'مساحة المعرض (م²)', 'NUMBER'),
    f('leads', 'PROJECT_TYPE', 'نوع المشروع', 'SELECT', { options: ['سكني', 'تجاري', 'فيلا', 'تشطيب شقة'], isFilterable: true }),
    f('leads', 'ESTIMATED_AREA_M2', 'المساحة التقديرية (م²)', 'NUMBER'),
  ],
  building_materials: [
    f('leads', 'PROJECT_TYPE', 'نوع المشروع', 'TEXT', { isFilterable: true }),
    f('vehicles', 'LOAD_CAPACITY_KG', 'حمولة المركبة (كجم)', 'NUMBER'),
  ],
  import_export: [
    f('leads', 'TARGET_MARKET', 'السوق المستهدف', 'TEXT', { isFilterable: true }),
    f('leads', 'EXPECTED_VOLUME', 'الحجم المتوقع', 'NUMBER'),
    f('warehouses', 'BONDED', 'مخزن جمركي', 'BOOLEAN'),
  ],
  logistics: [
    f('vehicles', 'LOAD_CAPACITY_KG', 'حمولة المركبة (كجم)', 'NUMBER'),
    f('vehicles', 'LICENSE_EXPIRY', 'انتهاء رخصة المركبة', 'DATE'),
    f('vehicles', 'INSURANCE_EXPIRY', 'انتهاء التأمين', 'DATE'),
    f('employees', 'DRIVING_LICENSE_NO', 'رقم رخصة القيادة', 'TEXT'),
    f('employees', 'DRIVING_LICENSE_EXPIRY', 'انتهاء رخصة القيادة', 'DATE'),
    f('warehouses', 'BONDED', 'مخزن جمركي', 'BOOLEAN'),
  ],
  manufacturing: [
    f('branches', 'FACTORY_LICENSE_NO', 'رقم ترخيص المصنع', 'TEXT'),
    f('employees', 'PRODUCTION_LINE', 'خط الإنتاج', 'TEXT', { isFilterable: true }),
    f('employees', 'SHIFT_PATTERN', 'نظام الوردية', 'SELECT', { options: ['صباحية', 'مسائية', 'ليلية', 'متناوبة'] }),
    f('warehouses', 'STORES_RAW_MATERIAL', 'يخزّن خامات', 'BOOLEAN'),
  ],
  construction: [
    f('employees', 'TRADE', 'الحرفة / التخصص', 'TEXT', { isFilterable: true }),
    f('employees', 'ASSIGNED_SITE', 'موقع العمل الحالي', 'TEXT'),
    f('vehicles', 'ASSIGNED_SITE', 'موقع العمل الحالي', 'TEXT'),
    f('warehouses', 'SITE_STORE', 'مخزن موقع', 'BOOLEAN'),
  ],
  workshop: [
    f('employees', 'TECH_SPECIALTY', 'تخصص الفني', 'TEXT', { isFilterable: true }),
    f('vehicles', 'PLATE_NUMBER', 'رقم اللوحة', 'TEXT', { isFilterable: true }),
    f('vehicles', 'LICENSE_EXPIRY', 'انتهاء رخصة المركبة', 'DATE'),
  ],
  food: [
    f('warehouses', 'COLD_STORAGE', 'تخزين مبرّد', 'BOOLEAN'),
    f('vehicles', 'REFRIGERATED', 'مركبة مبرّدة', 'BOOLEAN'),
  ],
  hospitality: [
    f('branches', 'ROOM_COUNT', 'عدد الغرف', 'NUMBER'),
    f('employees', 'HEALTH_CARD_EXPIRY', 'انتهاء الكارنيه الصحي', 'DATE'),
    f('employees', 'DEPARTMENT_SHIFT', 'وردية القسم', 'SELECT', { options: ['صباحية', 'مسائية', 'ليلية'] }),
  ],
  healthcare_admin: [
    f('branches', 'FACILITY_LICENSE_NO', 'رقم ترخيص المنشأة', 'TEXT'),
    f('employees', 'PROFESSIONAL_LICENSE_NO', 'رقم ترخيص المزاولة', 'TEXT'),
    f('employees', 'PROFESSIONAL_LICENSE_EXPIRY', 'انتهاء ترخيص المزاولة', 'DATE'),
  ],
  education: [
    f('branches', 'STUDENT_CAPACITY', 'الطاقة الاستيعابية (طلاب)', 'NUMBER'),
    f('employees', 'TEACHING_SUBJECT', 'المادة الدراسية', 'TEXT', { isFilterable: true }),
    f('employees', 'GRADE_LEVELS', 'المراحل الدراسية', 'MULTI_SELECT', { options: ['ابتدائي', 'إعدادي', 'ثانوي', 'جامعي'] }),
  ],
  professional_services: [
    f('employees', 'BILLING_RATE_HOURLY', 'سعر الساعة', 'NUMBER'),
    f('leads', 'SERVICE_INTEREST', 'الخدمة المطلوبة', 'TEXT', { isFilterable: true }),
  ],
  services: [
    f('leads', 'SERVICE_INTEREST', 'الخدمة المطلوبة', 'TEXT', { isFilterable: true }),
  ],
};

export function getActivityFieldPresets(activityId: string): ActivityFieldPreset[] {
  const documents = ACTIVITY_FIELD_PRESETS[activityId] || [];
  const master = ACTIVITY_MASTER_FIELD_PRESETS[activityId] || [];
  if (!master.length) return documents;
  // (entityType, code) must stay unique: document presets win on a clash.
  const seen = new Set(documents.map((p) => `${p.entityType}:${p.code}`));
  return [...documents, ...master.filter((p) => !seen.has(`${p.entityType}:${p.code}`))];
}
