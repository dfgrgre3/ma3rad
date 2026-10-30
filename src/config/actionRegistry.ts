/**
 * Central registry of every application action that an administrator may
 * configure through the Dynamic Application Configuration Engine.
 *
 * Hiding an action is never authorization. Permission, module, feature and
 * licensing checks are enforced by `ActionRegistryService` and by the service
 * layer regardless of the configured visibility.
 */

export interface ActionDefinition {
  id: string;
  label: string;
  /** Module that owns the action. */
  module?: string;
  /** Permission codes that must all be present for the action to run. */
  permissions: string[];
  /** Where the action is typically rendered. */
  locations: string[];
  /** Optional policy key used for extra thresholds (e.g. discount %). */
  policyKey?: string;
  /** Whether the UI must ask for confirmation before running. */
  confirmByDefault?: boolean;
  /** True when the action mutates financial or stock data. */
  sensitive?: boolean;
  /** Optional feature flag id required for the action. */
  featureId?: string;
  /** Optional role codes that may run the action (empty = all roles with perms). */
  roleCodes?: string[];
}

export const ACTION_REGISTRY: readonly ActionDefinition[] = [
  { id: 'common.save', label: 'حفظ', permissions: ['settings.update'], locations: ['forms'], sensitive: true },
  { id: 'common.cancel', label: 'إلغاء', permissions: [], locations: ['forms'] },
  { id: 'common.print', label: 'طباعة', permissions: ['sales.view'], locations: ['toolbars', 'details'] },
  { id: 'common.export', label: 'تصدير', permissions: ['reports.export'], locations: ['tables', 'reports'], sensitive: true },
  { id: 'common.import', label: 'استيراد', permissions: ['products.import'], locations: ['tables'], sensitive: true },

  { id: 'products.create', label: 'إضافة صنف', module: 'inventory', permissions: ['products.create'], locations: ['pages', 'tables'], sensitive: true },
  { id: 'products.update', label: 'تعديل صنف', module: 'inventory', permissions: ['products.update'], locations: ['tables', 'details'], sensitive: true },
  { id: 'products.delete', label: 'حذف صنف', module: 'inventory', permissions: ['products.delete'], locations: ['tables'], confirmByDefault: true, sensitive: true },
  { id: 'products.export', label: 'تصدير الأصناف', module: 'inventory', permissions: ['products.export'], locations: ['tables'] },

  { id: 'customers.create', label: 'إضافة عميل', module: 'customers', permissions: ['customers.create'], locations: ['pages'], sensitive: true },
  { id: 'customers.update', label: 'تعديل عميل', module: 'customers', permissions: ['customers.update'], locations: ['details'], sensitive: true },
  { id: 'customers.delete', label: 'حذف عميل', module: 'customers', permissions: ['customers.delete'], locations: ['tables'], confirmByDefault: true, sensitive: true },
  { id: 'customers.payment', label: 'تحصيل من عميل', module: 'customers', permissions: ['customers.payment'], locations: ['details'], sensitive: true },
  { id: 'customers.export', label: 'تصدير العملاء', module: 'customers', permissions: ['customers.export'], locations: ['tables'] },

  { id: 'suppliers.create', label: 'إضافة مورد', module: 'purchasing', permissions: ['suppliers.create'], locations: ['pages'], sensitive: true },
  { id: 'suppliers.update', label: 'تعديل مورد', module: 'purchasing', permissions: ['suppliers.update'], locations: ['details'], sensitive: true },
  { id: 'suppliers.payment', label: 'سداد لمورد', module: 'purchasing', permissions: ['suppliers.payment'], locations: ['details'], sensitive: true },

  { id: 'sales.create', label: 'إنشاء فاتورة بيع', module: 'sales', permissions: ['sales.create'], locations: ['pages', 'pos'], sensitive: true },
  { id: 'sales.discount', label: 'منح خصم', module: 'sales', permissions: ['sales.discount'], policyKey: 'sales.discountApprovalThreshold', locations: ['forms'], sensitive: true },
  { id: 'sales.void', label: 'إلغاء فاتورة', module: 'sales', permissions: ['sales.void'], locations: ['details'], confirmByDefault: true, sensitive: true },
  { id: 'sales.refund', label: 'مرتجع بيع', module: 'sales', permissions: ['sales.refund'], locations: ['pages'], sensitive: true },
  { id: 'sales.export', label: 'تصدير المبيعات', module: 'sales', permissions: ['sales.export'], locations: ['tables'] },

  { id: 'purchases.create', label: 'إدخال مشتريات', module: 'purchasing', permissions: ['purchases.create'], locations: ['pages'], sensitive: true },
  { id: 'purchases.approve', label: 'اعتماد طلب شراء', module: 'purchasing', permissions: ['purchases.approve'], locations: ['details'], sensitive: true },
  { id: 'purchases.export', label: 'تصدير المشتريات', module: 'purchasing', permissions: ['purchases.export'], locations: ['tables'] },

  { id: 'inventory.adjust', label: 'تسوية مخزون', module: 'inventory', permissions: ['inventory.adjust'], locations: ['pages'], confirmByDefault: true, sensitive: true },
  { id: 'inventory.transfer', label: 'تحويل مخزون', module: 'inventory', permissions: ['inventory.transfer'], locations: ['pages'], sensitive: true },
  { id: 'inventory.count', label: 'جرد مخزون', module: 'inventory', permissions: ['inventory.count'], locations: ['pages'], sensitive: true },

  { id: 'finance.approve', label: 'اعتماد مالي', module: 'finance', permissions: ['finance.approve'], locations: ['details'], sensitive: true },
  { id: 'approvals.approve', label: 'اعتماد', module: 'approvals', permissions: ['approvals.approve'], locations: ['details'], sensitive: true },
  { id: 'approvals.reject', label: 'رفض', module: 'approvals', permissions: ['approvals.reject'], locations: ['details'], confirmByDefault: true, sensitive: true },
] as const;

export function getActionDefinition(id: string): ActionDefinition | undefined {
  return ACTION_REGISTRY.find((action) => action.id === id);
}

export function isKnownAction(id: string): boolean {
  return ACTION_REGISTRY.some((action) => action.id === id);
}
