/** Declarative feature catalog. Keep this data in config so registries can
 * depend on it without importing runtime services. */
export interface FeatureDefinition {
  id: string;
  label: string;
  module?: string;
  /** Permission codes that grant access. Empty means no permission gate. */
  permissions: string[];
  /** Feature flags default to available; entitlements default to true. */
  defaultEntitled?: boolean;
}

export const FEATURE_REGISTRY: readonly FeatureDefinition[] = [
  { id: 'core.erp', label: 'النظام الأساسي', permissions: ['dashboard.view'] },
  { id: 'module.sales', label: 'المبيعات', module: 'sales', permissions: ['sales.view'] },
  { id: 'module.inventory', label: 'المخزون', module: 'inventory', permissions: ['inventory.view'] },
  { id: 'module.customers', label: 'العملاء', module: 'customers', permissions: ['customers.view'] },
  { id: 'module.purchasing', label: 'المشتريات', module: 'purchasing', permissions: ['purchases.view'] },
  { id: 'module.finance', label: 'الحسابات', module: 'finance', permissions: ['finance.view'] },
  { id: 'module.operations', label: 'العمليات', module: 'operations', permissions: ['operations.view'] },
  { id: 'module.manufacturing', label: 'التصنيع', module: 'manufacturing', permissions: ['manufacturing.view'] },
  { id: 'module.approvals', label: 'الموافقات', module: 'approvals', permissions: ['approvals.view'] },
  { id: 'module.crm', label: 'علاقات العملاء', module: 'crm', permissions: ['crm.view'] },
  { id: 'module.projects', label: 'المشاريع', module: 'projects', permissions: ['projects.view'] },
  { id: 'module.restaurant', label: 'المطعم', module: 'restaurant', permissions: ['sales.view'] },
  { id: 'feature.pos.offline', label: 'نقطة بيع غير متصلة', module: 'sales', permissions: ['sales.create'], defaultEntitled: true },
  { id: 'feature.reports.export', label: 'تصدير التقارير', permissions: ['reports.export'], defaultEntitled: true },
  { id: 'feature.branch.sync', label: 'مزامنة الفروع', permissions: ['admin.view'], defaultEntitled: true },
] as const;
