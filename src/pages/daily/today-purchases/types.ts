export type TabKey = 'invoices' | 'items' | 'suppliers' | 'payments';
export type SortKey = 'createdAt' | 'invoiceNumber' | 'supplierName' | 'total' | 'paid' | 'remaining' | 'itemsCount';

export type SortDir = 'asc' | 'desc';

/** Formats a numeric value; `fmt` appends the currency, `plain` does not. */
export type NumberFormatter = (value: number) => string;

export interface PurchaseFilters {
  search: string;
  status: string;
  supplierId: string;
  warehouse: string;
  paymentType: string;
  minAmount: string;
  maxAmount: string;
}

export interface SupplierStat {
  id: string;
  name: string;
  phone?: string | null;
  invoices: number;
  total: number;
  paid: number;
  remaining: number;
  itemsCount: number;
  quantity: number;
  lastTime?: string | null;
  unpaid: number;
}

export interface PurchaseDetailsTarget {
  kind: 'purchase';
  id: string;
}

export interface PurchaseVoidTarget {
  kind: 'purchase';
  id: string;
  name: string;
}
