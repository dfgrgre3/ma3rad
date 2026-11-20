import type { ActivityPageKey } from './activityPageCopyTypes';

export type { ActivityPageCopy, ActivityPageKey } from './activityPageCopyTypes';

/** Business families that own page-copy wording. */
export type ActivityCopyFamilyId =
  | 'retail'
  | 'distribution'
  | 'manufacturing'
  | 'construction'
  | 'transport'
  | 'hospitality'
  | 'healthcare'
  | 'education'
  | 'professional_services';

/**
 * Route paths already covered by the semantic page-copy system
 * (`activityPageCopy_families/activities`). The path-copy resolver defers to
 * those entries so per-activity wording always wins over family defaults.
 */
export const PATH_SEMANTIC_KEYS: Record<string, ActivityPageKey> = {
  '/dashboard': 'dashboard',
  '/customers': 'customers',
  '/products': 'products',
  '/products/catalog': 'products',
  '/sales': 'sales',
  '/orders': 'orders',
  '/inventory': 'inventory',
  '/inventory/hub': 'inventory',
  '/purchases/orders': 'purchaseOrders',
  '/purchases': 'purchasing',
  '/finance': 'finance',
  '/finance/receivables': 'finance',
  '/finance/other-receivables': 'finance',
  '/finance/installments': 'finance',
  '/reports': 'reports',
  '/crm': 'crm',
  '/crm/hub': 'crm',
  '/crm/dashboard': 'crm',
  '/projects': 'projects',
  '/pos': 'pos',
  '/returns': 'returns',
  '/quotations': 'quotations',
  '/sales/after-sales': 'afterSales',
  '/partners': 'partners',
  '/documents': 'documents',
  '/contracts': 'documents',
  '/employees': 'hr',
  '/hr/dashboard': 'hr',
  '/branches': 'operations',
  '/warehouses': 'operations',
};

/** Prefix rules for parameterized/sub routes that share a hub page's copy. */
export const PATH_PREFIX_SEMANTIC_KEYS: Array<{ prefix: string; key: ActivityPageKey }> = [
  { prefix: '/reports/', key: 'reports' },
];
