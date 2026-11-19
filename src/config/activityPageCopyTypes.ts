/**
 * Shared types for activity-driven page copy.
 * Kept dependency-free so data files and the resolver can share them.
 */
export type ActivityPageKey =
  | 'dashboard'
  | 'customers'
  | 'products'
  | 'sales'
  | 'orders'
  | 'inventory'
  | 'purchasing'
  | 'finance'
  | 'reports'
  | 'crm'
  | 'operations'
  | 'projects'
  | 'purchaseOrders'
  | 'pos'
  | 'returns'
  | 'quotations'
  | 'afterSales'
  | 'partners'
  | 'hr'
  | 'documents';

export interface ActivityPageCopy {
  title: string;
  description: string;
}
