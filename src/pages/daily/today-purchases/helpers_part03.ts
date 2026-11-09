import type { DailyPurchaseItemRow, DailyPurchaseRow } from '../../../services/operations/DailyOperationsService';
import type { PurchaseFilters, SortDir, SortKey } from '../../../types/dashboard/todayPurchases';

/** Amount range check shared by the invoice and item scopes. */
export const matchesAmountRange = (row: DailyPurchaseRow, minAmount: string, maxAmount: string) => {
  const total = Number(row.total) || 0;
  if (minAmount.trim() && total < Number(minAmount)) return false;
  if (maxAmount.trim() && total > Number(maxAmount)) return false;
  return true;
};

/** Applies every filter except the free-text search term. */
export const matchesPurchaseFilters = (
  row: DailyPurchaseRow,
  filters: Pick<PurchaseFilters, 'status' | 'supplierId' | 'warehouse' | 'paymentType' | 'minAmount' | 'maxAmount'>,
) => {
  if (filters.status !== 'ALL' && row.paymentStatus !== filters.status) return false;
  if (filters.supplierId !== 'ALL' && row.supplierId !== filters.supplierId) return false;
  if (filters.warehouse !== 'ALL' && row.warehouseName !== filters.warehouse) return false;
  if (filters.paymentType !== 'ALL' && row.paymentType !== filters.paymentType) return false;
  if (!matchesAmountRange(row, filters.minAmount, filters.maxAmount)) return false;
  return true;
};

export const purchaseSearchText = (row: DailyPurchaseRow) =>
  `${row.invoiceNumber} ${row.supplierInvoiceNumber || ''} ${row.supplierName || ''} ${row.supplierPhone || ''} ${row.warehouseName || ''} ${row.createdByName || ''} ${row.notes || ''}`
    .toLowerCase();

export const filterPurchaseRows = (rows: DailyPurchaseRow[], filters: PurchaseFilters) => {
  const term = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (!matchesPurchaseFilters(row, filters)) return false;
    if (!term) return true;
    return purchaseSearchText(row).includes(term);
  });
};

export const sortPurchaseRows = (rows: DailyPurchaseRow[], sortKey: SortKey, sortDir: SortDir) => {
  const direction = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (sortKey) {
      case 'invoiceNumber': return a.invoiceNumber.localeCompare(b.invoiceNumber) * direction;
      case 'supplierName': return (a.supplierName || '').localeCompare(b.supplierName || '', 'ar') * direction;
      case 'createdAt': return String(a.createdAt || '').localeCompare(String(b.createdAt || '')) * direction;
      default: return ((Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0)) * direction;
    }
  });
};

export const sortIndicator = (sortKey: SortKey, sortDir: SortDir, key: SortKey) =>
  (sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '');

export const groupItemsByPurchase = (items: DailyPurchaseItemRow[]) => {
  const map = new Map<string, DailyPurchaseItemRow[]>();
  items.forEach((item) => {
    const list = map.get(item.purchaseId) || [];
    list.push(item);
    map.set(item.purchaseId, list);
  });
  return map;
};

export const itemsInScope = (items: DailyPurchaseItemRow[], purchaseIds: Set<string>) =>
  items.filter((item) => purchaseIds.has(item.purchaseId));
