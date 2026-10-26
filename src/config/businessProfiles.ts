export const BUSINESS_TYPES = [
  { id: 'ceramics', label: 'سيراميك وبورسلين', description: 'مساحات ومقاسات ومخزون بالمتر والكرتونة' },
  { id: 'building_materials', label: 'مواد بناء وتشطيب', description: 'أصناف متنوعة ومخازن ومشتريات' },
  { id: 'sanitary', label: 'أدوات صحية', description: 'منتجات وماركات ومبيعات المعرض' },
  { id: 'lighting', label: 'إضاءة وكهرباء', description: 'كتالوج أصناف وباركود ومخزون' },
  { id: 'furniture', label: 'أثاث وديكور', description: 'طلبات ومشروعات وتسليمات' },
  { id: 'electronics', label: 'أجهزة وإلكترونيات', description: 'كتالوج أجهزة ومبيعات ومتابعة مخزون' },
  { id: 'clothing', label: 'ملابس وأحذية', description: 'مقاسات وألوان وموديلات وبيع بالتجزئة' },
  { id: 'automotive', label: 'قطع غيار وسيارات', description: 'أصناف وموردون ومخزون وطلبات شراء' },
  { id: 'home_appliances', label: 'أجهزة منزلية', description: 'منتجات وضمانات وتوصيل ومتابعة العملاء' },
  { id: 'cosmetics', label: 'عطور ومستحضرات تجميل', description: 'كتالوج منتجات ومخزون ومبيعات' },
  { id: 'food', label: 'مواد غذائية وسوبر ماركت', description: 'أصناف سريعة الحركة ومشتريات ومخزون' },
  { id: 'restaurant', label: 'مطعم أو كافيه', description: 'مبيعات ومواد تشغيل ومخزون اختياري' },
  { id: 'services', label: 'شركة خدمات أو صيانة', description: 'خدمات وفواتير وعملاء دون مخزون افتراضي' },
  { id: 'workshop', label: 'ورشة أو خدمات تشغيل', description: 'خدمات ومخزون اختياري' },
  { id: 'general', label: 'معرض متعدد الأنشطة', description: 'تخصيص مرن لأي نشاط تجاري' },
  { id: 'custom', label: 'نشاط آخر مخصص', description: 'اكتب نوع نشاطك واختر الوحدات التي تحتاجها' },
] as const;

export const BUSINESS_UNITS = [
  { id: 'M2', label: 'متر مربع' },
  { id: 'LINEAR_METER', label: 'متر طولي' },
  { id: 'METER', label: 'متر' },
  { id: 'PIECE', label: 'قطعة' },
  { id: 'BOX', label: 'كرتونة' },
  { id: 'PACK', label: 'عبوة' },
  { id: 'KG', label: 'كيلوجرام' },
  { id: 'TON', label: 'طن' },
  { id: 'LITER', label: 'لتر' },
  { id: 'SET', label: 'طقم' },
  { id: 'SERVICE', label: 'خدمة' },
] as const;

export type BusinessModel = 'products' | 'services' | 'mixed';

export interface BusinessConfiguration {
  businessType: string;
  businessModel: BusinessModel;
  trackInventory: boolean;
  units: string[];
  customUnits: string[];
  productAttributes: string[];
}

type BusinessConfigurationDefaults = Omit<BusinessConfiguration, 'businessType'>;

const COMMON_DEFAULTS: BusinessConfigurationDefaults = {
  businessModel: 'products',
  trackInventory: true,
  units: ['PIECE'],
  customUnits: [],
  productAttributes: [],
};

const PROFILE_CONFIGURATIONS: Record<string, BusinessConfigurationDefaults> = {
  ceramics: {
    ...COMMON_DEFAULTS,
    units: ['M2', 'BOX', 'PIECE'],
    productAttributes: ['المقاس', 'الفرز', 'اللون', 'النغمة', 'التشطيب'],
  },
  building_materials: { ...COMMON_DEFAULTS, units: ['PIECE', 'KG', 'TON', 'BOX'] },
  sanitary: { ...COMMON_DEFAULTS, units: ['PIECE', 'SET'], productAttributes: ['الماركة', 'الموديل', 'اللون'] },
  lighting: { ...COMMON_DEFAULTS, units: ['PIECE', 'BOX'], productAttributes: ['الماركة', 'الموديل', 'القدرة'] },
  furniture: { ...COMMON_DEFAULTS, units: ['PIECE', 'SET'], productAttributes: ['الموديل', 'اللون', 'الخامة'] },
  electronics: {
    ...COMMON_DEFAULTS,
    units: ['PIECE'],
    productAttributes: ['الماركة', 'الموديل', 'الضمان'],
  },
  clothing: {
    ...COMMON_DEFAULTS,
    units: ['PIECE'],
    productAttributes: ['المقاس', 'اللون', 'الموديل'],
  },
  automotive: { ...COMMON_DEFAULTS, units: ['PIECE', 'SET'], productAttributes: ['رقم القطعة', 'الماركة', 'الموديل'] },
  home_appliances: {
    ...COMMON_DEFAULTS,
    units: ['PIECE'],
    productAttributes: ['الماركة', 'الموديل', 'الضمان'],
  },
  cosmetics: { ...COMMON_DEFAULTS, units: ['PIECE', 'PACK'], productAttributes: ['الحجم', 'الرائحة', 'اللون'] },
  food: { ...COMMON_DEFAULTS, units: ['PIECE', 'KG', 'LITER', 'PACK', 'BOX'], productAttributes: ['تاريخ الصلاحية', 'العلامة التجارية'] },
  restaurant: {
    ...COMMON_DEFAULTS,
    businessModel: 'mixed',
    units: ['PIECE', 'KG', 'LITER', 'SERVICE'],
    productAttributes: ['الفئة', 'الحجم'],
  },
  services: {
    ...COMMON_DEFAULTS,
    businessModel: 'services',
    trackInventory: false,
    units: ['SERVICE'],
    productAttributes: [],
  },
  workshop: {
    ...COMMON_DEFAULTS,
    businessModel: 'mixed',
    units: ['SERVICE', 'PIECE'],
    productAttributes: ['نوع الخدمة', 'الموديل'],
  },
  general: { ...COMMON_DEFAULTS, businessModel: 'mixed', units: ['PIECE', 'KG', 'LITER', 'METER', 'LINEAR_METER', 'PACK', 'SERVICE'] },
  custom: { ...COMMON_DEFAULTS, businessModel: 'mixed', units: ['PIECE', 'KG', 'LITER', 'METER', 'LINEAR_METER', 'PACK', 'SERVICE'] },
};

const VALID_BUSINESS_MODELS = new Set<BusinessModel>(['products', 'services', 'mixed']);
const VALID_UNITS = new Set<string>(BUSINESS_UNITS.map((unit) => unit.id));

export const getDefaultBusinessConfiguration = (businessType: string): BusinessConfiguration => ({
  businessType,
  ...(PROFILE_CONFIGURATIONS[businessType] || PROFILE_CONFIGURATIONS.general),
  units: [...(PROFILE_CONFIGURATIONS[businessType] || PROFILE_CONFIGURATIONS.general).units],
  customUnits: [...(PROFILE_CONFIGURATIONS[businessType] || PROFILE_CONFIGURATIONS.general).customUnits],
  productAttributes: [...(PROFILE_CONFIGURATIONS[businessType] || PROFILE_CONFIGURATIONS.general).productAttributes],
});

export const parseBusinessConfiguration = (raw: string | undefined, businessType: string): BusinessConfiguration => {
  const defaults = getDefaultBusinessConfiguration(businessType);
  if (!raw) return defaults;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;
    const saved = parsed as Partial<BusinessConfiguration>;
    const strings = (value: unknown, fallback: string[]) => Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
      : fallback;
    return {
      ...defaults,
      businessType,
      businessModel: VALID_BUSINESS_MODELS.has(saved.businessModel as BusinessModel) ? saved.businessModel as BusinessModel : defaults.businessModel,
      trackInventory: typeof saved.trackInventory === 'boolean' ? saved.trackInventory : defaults.trackInventory,
      units: strings(saved.units, defaults.units).filter((unit) => VALID_UNITS.has(unit)),
      customUnits: strings(saved.customUnits, defaults.customUnits),
      productAttributes: strings(saved.productAttributes, defaults.productAttributes),
    };
  } catch {
    return defaults;
  }
};

export const BUSINESS_MODULES = [
  { id: 'sales', label: 'المبيعات ونقطة البيع', paths: ['/daily/sales', '/pos', '/sales', '/sales/analytics', '/sales/cycle', '/sales/statement', '/sales/reservations', '/sales/after-sales', '/quotations', '/orders', '/returns'] },
  { id: 'inventory', label: 'المخزون والمنتجات', paths: ['/inventory', '/inventory/warehouse-stock', '/inventory/showroom-stock', '/inventory/ledger', '/inventory/transfers', '/inventory/counts', '/inventory/valuation', '/inventory/adjustments', '/inventory/reservations', '/inventory/reorder-planning', '/inventory/locations', '/inventory/damage-quarantine', '/inventory/reconciliation', '/products', '/categories', '/brands', '/products/attributes', '/pricing', '/promotions', '/products/barcodes'] },
  { id: 'customers', label: 'العملاء والمشروعات', paths: ['/crm/dashboard', '/customers', '/customers/imported-products', '/customers/ready-deliveries', '/crm/leads', '/crm/pipeline', '/crm/activities', '/crm/campaigns', '/projects'] },
  { id: 'purchasing', label: 'المشتريات والموردون', paths: ['/daily/purchases', '/suppliers', '/purchases/requests', '/purchases/quotations', '/purchases/orders', '/purchases/receipts', '/purchases/incoming', '/purchases', '/purchases/statement', '/purchases/claims', '/purchases/returns'] },
  { id: 'finance', label: 'الحسابات والمالية', paths: ['/daily/expenses', '/daily/debts', '/finance', '/cashboxes', '/finance/expenses', '/finance/accounts', '/finance/journal', '/finance/cheques', '/finance/bank-reconciliation', '/finance/fiscal-closing', '/finance/budgets-cost-centers', '/finance/cash-forecast', '/finance/epayment-settlements', '/finance/assets', '/finance/debts', '/finance/other-receivables', '/finance/installments'] },
  { id: 'operations', label: 'الفروع والموظفون والتوصيل', paths: ['/fleet/dashboard', '/hr/dashboard', '/branches', '/warehouses', '/employees', '/employees/attendance', '/employees/payroll', '/employees/commissions', '/deliveries', '/drivers', '/vehicles'] },
  { id: 'reports', label: 'التقارير', paths: ['/reports', '/reports/statements', '/reports/profit-loss', '/reports/tax'] },
  { id: 'approvals', label: 'الموافقات', paths: ['/approvals'] },
] as const;

const ALL_MODULE_IDS = BUSINESS_MODULES.map((module) => module.id);

const PROFILE_MODULES: Record<string, string[]> = {
  ceramics: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports', 'approvals'],
  building_materials: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports', 'approvals'],
  sanitary: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'reports'],
  lighting: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'reports'],
  furniture: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports'],
  electronics: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports', 'approvals'],
  clothing: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'reports'],
  automotive: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports', 'approvals'],
  home_appliances: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports'],
  cosmetics: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'reports'],
  food: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'operations', 'reports'],
  restaurant: ['sales', 'inventory', 'customers', 'purchasing', 'finance', 'reports'],
  services: ['sales', 'customers', 'finance', 'reports'],
  workshop: ['sales', 'inventory', 'customers', 'finance', 'operations', 'reports'],
  general: ALL_MODULE_IDS,
  custom: ALL_MODULE_IDS,
};

export const getProfileModuleIds = (businessType: string): string[] =>
  [...(PROFILE_MODULES[businessType] || PROFILE_MODULES.general)];

export const parseEnabledModules = (raw: string | undefined, businessType: string): string[] => {
  if (!raw) return getProfileModuleIds(businessType);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getProfileModuleIds(businessType);
    const valid = parsed.filter((id): id is string =>
      typeof id === 'string' && BUSINESS_MODULES.some((module) => module.id === id)
    );
    return valid.length === 0 && parsed.length > 0
      ? getProfileModuleIds(businessType)
      : [...new Set(valid)];
  } catch {
    return getProfileModuleIds(businessType);
  }
};

export const getProfileHiddenPaths = (enabledModuleIds: string[]): string[] => {
  const enabled = new Set(enabledModuleIds);
  return BUSINESS_MODULES
    .filter((module) => !enabled.has(module.id))
    .flatMap((module) => [...module.paths]);
};

export const getBusinessModuleForPath = (pathname: string): string | undefined => {
  const candidates = BUSINESS_MODULES.flatMap((module) =>
    module.paths.map((path) => ({ path, moduleId: module.id }))
  ).filter(({ path }) => pathname === path || pathname.startsWith(`${path}/`));
  return candidates.sort((a, b) => b.path.length - a.path.length)[0]?.moduleId;
};

export const getManagedBusinessPaths = (): Set<string> =>
  new Set(BUSINESS_MODULES.flatMap((module) => [...module.paths]));
