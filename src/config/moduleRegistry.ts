/**
 * Declarative business-module registry.
 *
 * This is the single source of truth for what a module is: its navigation
 * surface, dependencies on other modules, required permission codes, available
 * business events and its configurable settings schema.
 *
 * Pure data and pure functions only — no database or React imports — so the
 * registry can be used by the renderer, the service layer and unit tests.
 * Module state (which modules are enabled) lives in `ModuleRegistryService`.
 */

export type ModuleSettingType = 'boolean' | 'number' | 'string' | 'enum';

export interface ModuleSettingDefinition {
  key: string;
  label: string;
  type: ModuleSettingType;
  defaultValue: string | number | boolean;
  options?: string[];
  description?: string;
}

export interface ModuleActivationRules {
  /** Enabling this module requires business inventory tracking to be on. */
  requiresInventoryTracking?: boolean;
  /** Core modules can never be disabled by an administrator. */
  core?: boolean;
}

export interface ModuleDefinition {
  id: string;
  label: string;
  description: string;
  /** Module ids that must also be enabled. */
  dependencies: string[];
  /** Permission codes a user needs before they can use the module. */
  permissions: string[];
  /** Route prefixes owned by the module. */
  paths: string[];
  /** Business events other integrations may subscribe to. */
  businessEvents: string[];
  settings: ModuleSettingDefinition[];
  activation: ModuleActivationRules;
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    id: 'sales',
    label: 'المبيعات ونقطة البيع',
    description: 'عروض الأسعار والطلبات والفواتير والمرتجعات وتحليلات البيع.',
    dependencies: ['customers'],
    permissions: ['sales.view'],
    paths: ['/daily/sales', '/pos', '/sales', '/sales/analytics', '/sales/cycle', '/sales/statement', '/sales/reservations', '/sales/after-sales', '/quotations', '/orders', '/returns'],
    businessEvents: ['invoice.posted', 'invoice.voided', 'sales_return.posted', 'receipt.posted'],
    settings: [
      { key: 'allowCreditSales', label: 'السماح بالبيع الآجل', type: 'boolean', defaultValue: true },
      { key: 'defaultTaxPercent', label: 'نسبة الضريبة الافتراضية', type: 'number', defaultValue: 0 },
    ],
    activation: {},
  },
  {
    id: 'inventory',
    label: 'المخزون والمنتجات',
    description: 'الأصناف والوحدات والمخازن والحركات والجرد والتقييم.',
    dependencies: [],
    permissions: ['inventory.view'],
    paths: ['/inventory', '/inventory/warehouse-stock', '/inventory/showroom-stock', '/inventory/ledger', '/inventory/transfers', '/inventory/counts', '/inventory/valuation', '/inventory/adjustments', '/inventory/reservations', '/inventory/reorder-planning', '/inventory/locations', '/inventory/damage-quarantine', '/inventory/reconciliation', '/products', '/categories', '/brands', '/products/attributes', '/pricing', '/promotions', '/products/barcodes'],
    businessEvents: ['stock.movement.posted', 'stock.count.posted', 'stock.adjusted'],
    settings: [
      { key: 'allowNegativeStock', label: 'السماح بالمخزون السالب', type: 'boolean', defaultValue: false },
      { key: 'costingMethod', label: 'طريقة التكلفة', type: 'enum', defaultValue: 'AVERAGE_COST', options: ['AVERAGE_COST', 'FIFO'] },
    ],
    activation: { requiresInventoryTracking: true },
  },
  {
    id: 'customers',
    label: 'العملاء والمشروعات',
    description: 'العملاء وعلاقات العملاء والمشروعات المرتبطة بهم.',
    dependencies: [],
    permissions: ['customers.view'],
    paths: ['/crm/dashboard', '/customers', '/customers/imported-products', '/customers/ready-deliveries', '/crm/leads', '/crm/pipeline', '/crm/activities', '/crm/campaigns', '/projects'],
    businessEvents: ['customer.created', 'lead.converted', 'project.created'],
    settings: [
      { key: 'creditLimitEnforced', label: 'تطبيق حد الائتمان', type: 'boolean', defaultValue: true },
    ],
    activation: {},
  },
  {
    id: 'purchasing',
    label: 'المشتريات والموردون',
    description: 'طلبات وأوامر الشراء والاستلام وفواتير الموردين والمرتجعات.',
    dependencies: ['finance'],
    permissions: ['purchases.view'],
    paths: ['/daily/purchases', '/suppliers', '/purchases/requests', '/purchases/quotations', '/purchases/orders', '/purchases/receipts', '/purchases/incoming', '/purchases', '/purchases/statement', '/purchases/claims', '/purchases/returns'],
    businessEvents: ['purchase_order.approved', 'goods_receipt.posted', 'supplier_payment.posted'],
    settings: [
      { key: 'requireApprovalAboveAmount', label: 'حد الموافقة على أمر الشراء', type: 'number', defaultValue: 0 },
    ],
    activation: {},
  },
  {
    id: 'finance',
    label: 'الحسابات والمالية',
    description: 'اليومية والأستاذ والحسابات والصناديق والتقارير المالية.',
    dependencies: [],
    permissions: ['finance.view'],
    paths: ['/daily/expenses', '/daily/debts', '/finance', '/cashboxes', '/finance/expenses', '/finance/accounts', '/finance/journal', '/finance/cheques', '/finance/bank-reconciliation', '/finance/fiscal-closing', '/finance/budgets-cost-centers', '/finance/cash-forecast', '/finance/epayment-settlements', '/finance/assets', '/finance/debts', '/finance/other-receivables', '/finance/installments'],
    businessEvents: ['journal_entry.posted', 'journal_entry.reversed', 'fiscal_period.closed'],
    settings: [
      { key: 'fiscalYearStartMonth', label: 'شهر بداية السنة المالية', type: 'number', defaultValue: 1 },
      { key: 'enforceBalancedPosting', label: 'منع ترحيل قيود غير متوازنة', type: 'boolean', defaultValue: true },
    ],
    activation: {},
  },
  {
    id: 'operations',
    label: 'الفروع والموظفون والتوصيل',
    description: 'الفروع والمخازن والموظفون والحضور والرواتب والتوصيل.',
    dependencies: [],
    permissions: ['branches.view'],
    paths: ['/fleet/dashboard', '/branches', '/warehouses', '/deliveries', '/drivers', '/vehicles'],
    businessEvents: ['payroll.posted', 'attendance.recorded', 'delivery.completed'],
    settings: [
      { key: 'payrollCurrency', label: 'عملة الرواتب', type: 'string', defaultValue: '' },
      { key: 'attendanceGraceMinutes', label: 'سماحية التأخير بالدقائق', type: 'number', defaultValue: 0 },
    ],
    activation: {},
  },
  {
    id: 'reports',
    label: 'التقارير',
    description: 'التقارير التشغيلية والمالية والضريبية والتحليلات.',
    dependencies: [],
    permissions: ['reports.view'],
    paths: ['/reports', '/reports/statements', '/reports/profit-loss', '/reports/tax'],
    businessEvents: ['report.exported'],
    settings: [],
    activation: {},
  },
  {
    id: 'approvals',
    label: 'الموافقات',
    description: 'طلبات الموافقة وسياسات الاعتماد.',
    dependencies: [],
    permissions: ['approvals.view'],
    paths: ['/approvals'],
    businessEvents: ['approval.requested', 'approval.decided'],
    settings: [
      { key: 'requireSegregationOfDuties', label: 'منع اعتماد الطالب لطلبه', type: 'boolean', defaultValue: false },
    ],
    activation: {},
  },
  {
    id: 'documents',
    label: 'المستندات والعقود',
    description: 'مستندات مركزية بنسخ غير قابلة للتعديل، وعقود بمتابعة التجديد والفسخ.',
    dependencies: [],
    permissions: ['documents.view'],
    paths: ['/documents', '/contracts'],
    businessEvents: ['document.created', 'document.version_added', 'contract.activated', 'contract.renewed', 'contract.terminated'],
    settings: [],
    activation: {},
  },
  {
    id: 'projects',
    label: 'المشروعات',
    description: 'مشروعات العملاء والوحدات والمنتجات والتقدم.',
    dependencies: ['customers'],
    permissions: ['projects.view'],
    paths: ['/projects'],
    businessEvents: ['project.created', 'project.updated', 'project.completed'],
    settings: [],
    activation: {},
  },
  {
    id: 'hr',
    label: 'الموظفون والرواتب',
    description: 'الموظفون والحضور والرواتب والعمولات.',
    dependencies: ['finance'],
    permissions: ['employees.view'],
    paths: ['/employees', '/employees/attendance', '/employees/payroll', '/employees/commissions', '/employees/leave', '/employees/contracts', '/employees/documents', '/hr', '/hr/dashboard'],
    businessEvents: ['employee.created', 'attendance.recorded', 'payroll.posted'],
    settings: [],
    activation: {},
  },
  {
    id: 'manufacturing',
    label: 'التصنيع',
    description: 'BOM، مراكز عمل، أوامر إنتاج، مواد وعمليات، وتتبع WIP.',
    dependencies: ['inventory'],
    permissions: ['manufacturing.view'],
    paths: ['/manufacturing'],
    businessEvents: ['bom.created', 'production.order.released', 'production.order.completed'],
    settings: [],
    activation: {},
  },
];

export const MODULE_IDS: string[] = MODULE_REGISTRY.map((module) => module.id);

const REGISTRY_BY_ID = new Map(MODULE_REGISTRY.map((module) => [module.id, module]));

export const getModuleDefinition = (id: string): ModuleDefinition | undefined => REGISTRY_BY_ID.get(id);

export const isKnownModule = (id: string): boolean => REGISTRY_BY_ID.has(id);

/** All modules a set of modules transitively depends on. */
export const getModuleDependencyClosure = (ids: string[]): string[] => {
  const result = new Set<string>();
  const visit = (id: string) => {
    const definition = REGISTRY_BY_ID.get(id);
    if (!definition) return;
    for (const dependency of definition.dependencies) {
      if (result.has(dependency)) continue;
      result.add(dependency);
      visit(dependency);
    }
  };
  for (const id of ids) visit(id);
  return [...result];
};

/** Add missing dependencies (transitively) to a selection. Unknown ids survive so validation can report them. */
export const withModuleDependencies = (ids: string[]): string[] => {
  const selected = [...new Set(ids)];
  const closure = getModuleDependencyClosure(selected);
  return [...new Set([...selected, ...closure])].filter((id) => isKnownModule(id));
};

export interface ModuleSelectionOptions {
  trackInventory: boolean;
}

export interface ModuleSelectionValidation {
  /** Normalized selection: unknown/duplicate ids removed and dependencies included. */
  enabled: string[];
  errors: string[];
  warnings: string[];
}

/**
 * Validate an administrator's module selection.
 *
 * Dependencies are auto-included (so a saved profile cannot silently break a
 * route), while invalid states that cannot be fixed automatically are reported
 * as errors. Callers must refuse to persist a result with errors.
 */
export const validateModuleSelection = (
  ids: string[],
  options: ModuleSelectionOptions
): ModuleSelectionValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const requested = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];

  const unknown = requested.filter((id) => !isKnownModule(id));
  if (unknown.length > 0) {
    errors.push(`وحدات غير معروفة: ${unknown.join(', ')}`);
  }

  const known = requested.filter(isKnownModule);
  const enabled = withModuleDependencies(known);

  for (const id of enabled) {
    const definition = REGISTRY_BY_ID.get(id);
    if (!definition) continue;
    if (definition.activation.requiresInventoryTracking && !options.trackInventory) {
      errors.push(`الوحدة «${definition.label}» تتطلب تفعيل تتبع المخزون في إعدادات النشاط.`);
    }
    for (const dependency of definition.dependencies) {
      if (!enabled.includes(dependency)) {
        errors.push(`الوحدة «${definition.label}» تتطلب تفعيل «${REGISTRY_BY_ID.get(dependency)?.label || dependency}».`);
      }
    }
  }

  if (enabled.length === 0) {
    warnings.push('لم يتم تفعيل أي وحدة أعمال. لن تظهر شاشات العمل للمستخدمين.');
  }

  return { enabled, errors, warnings };
};

/** Resolve the module that owns a route path, using the longest matching prefix. */
export const getModulePathOwner = (pathname: string): string | undefined => {
  const candidates = MODULE_REGISTRY.flatMap((module) =>
    module.paths.map((path) => ({ path, moduleId: module.id }))
  ).filter(({ path }) => pathname === path || pathname.startsWith(`${path}/`));
  return candidates.sort((a, b) => b.path.length - a.path.length)[0]?.moduleId;
};

export const getManagedModulePaths = (): Set<string> =>
  new Set(MODULE_REGISTRY.flatMap((module) => module.paths));

export const getHiddenModulePaths = (enabledModuleIds: string[]): string[] => {
  const enabled = new Set(enabledModuleIds);
  return MODULE_REGISTRY
    .filter((module) => !enabled.has(module.id))
    .flatMap((module) => module.paths);
};
