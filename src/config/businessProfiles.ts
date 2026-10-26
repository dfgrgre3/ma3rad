export const BUSINESS_TYPES = [
  { id: 'ceramics', label: 'سيراميك وبورسلين', description: 'مساحات ومقاسات ومخزون بالمتر والكرتونة' },
  { id: 'building_materials', label: 'مواد بناء وتشطيب', description: 'أصناف متنوعة ومخازن ومشتريات' },
  { id: 'sanitary', label: 'أدوات صحية', description: 'منتجات وماركات ومبيعات المعرض' },
  { id: 'lighting', label: 'إضاءة وكهرباء', description: 'كتالوج أصناف وباركود ومخزون' },
  { id: 'furniture', label: 'أثاث وديكور', description: 'طلبات ومشروعات وتسليمات' },
  { id: 'electronics', label: 'أجهزة وإلكترونيات', description: 'أجهزة برقم تسلسلي وضمان ومتابعة مخزون' },
  { id: 'clothing', label: 'ملابس وأحذية', description: 'مقاسات وألوان وموديلات وبيع بالتجزئة' },
  { id: 'automotive', label: 'قطع غيار وسيارات', description: 'أصناف وموردون ومخزون وطلبات شراء' },
  { id: 'home_appliances', label: 'أجهزة منزلية', description: 'منتجات وضمانات وتوصيل ومتابعة العملاء' },
  { id: 'cosmetics', label: 'عطور ومستحضرات تجميل', description: 'كتالوج منتجات ومخزون ومبيعات' },
  { id: 'food', label: 'مواد غذائية وسوبر ماركت', description: 'أصناف سريعة الحركة ومشتريات ومخزون' },
  { id: 'general', label: 'معرض متعدد الأنشطة', description: 'تخصيص مرن لأي نشاط تجاري' },
  { id: 'custom', label: 'نشاط آخر مخصص', description: 'اكتب نوع نشاطك واختر الوحدات التي تحتاجها' },
] as const;

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

export const getManagedBusinessPaths = (): Set<string> =>
  new Set(BUSINESS_MODULES.flatMap((module) => [...module.paths]));
