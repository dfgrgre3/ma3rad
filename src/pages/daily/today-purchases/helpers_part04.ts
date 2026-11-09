import type { DailyPurchaseItemRow, DailyPurchaseRow, DailySupplierPaymentRow } from '../../../services/operations/DailyOperationsService';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import type { PurchaseFilters, SupplierStat } from '../../../types/dashboard/todayPurchases';

export const filterItemsByPurchaseIds = (
  items: DailyPurchaseItemRow[],
  purchaseIds: Set<string>,
  search: string,
) => {
  const term = search.trim().toLowerCase();
  const list = items.filter((item) => purchaseIds.has(item.purchaseId));
  if (!term) return list;
  return list.filter((item) =>
    `${item.productName} ${item.sku || ''} ${item.invoiceNumber} ${item.supplierName} ${item.grade}`.toLowerCase().includes(term)
  );
};

export const filterSupplierPayments = (
  payments: DailySupplierPaymentRow[],
  filters: Pick<PurchaseFilters, 'search' | 'supplierId' | 'paymentType'>,
) => {
  const term = filters.search.trim().toLowerCase();
  return payments.filter((payment) => {
    if (filters.supplierId !== 'ALL' && payment.supplierId !== filters.supplierId) return false;
    if (filters.paymentType !== 'ALL' && payment.paymentType !== filters.paymentType) return false;
    if (!term) return true;
    return `${payment.receiptNumber} ${payment.supplierName} ${payment.invoiceNumbers || ''} ${payment.notes || ''} ${payment.performedByName || ''}`
      .toLowerCase().includes(term);
  });
};

export const buildSupplierStats = (rows: DailyPurchaseRow[], scopedItems: DailyPurchaseItemRow[]): SupplierStat[] => {
  const map = new Map<string, SupplierStat>();
  rows.forEach((row) => {
    const key = row.supplierId || row.supplierName || '—';
    const current = map.get(key) || {
      id: key, name: row.supplierName || '—', phone: row.supplierPhone,
      invoices: 0, total: 0, paid: 0, remaining: 0, itemsCount: 0, quantity: 0, lastTime: row.createdAt, unpaid: 0,
    };
    current.invoices += 1;
    current.total += Number(row.total) || 0;
    current.paid += Number(row.paid) || 0;
    current.remaining += Number(row.remaining) || 0;
    current.unpaid += row.paymentStatus === 'PAID' ? 0 : 1;
    current.lastTime = String(row.createdAt || '') > String(current.lastTime || '') ? row.createdAt : current.lastTime;
    map.set(key, current);
  });
  scopedItems.forEach((item) => {
    const key = item.supplierId || item.supplierName || '—';
    const current = map.get(key);
    if (!current) return;
    current.itemsCount += 1;
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
};

/** Quantity totals grouped by display unit, in insertion order. */
export const sumItemQuantityByUnit = (items: DailyPurchaseItemRow[]) =>
  [...items.reduce((totals, item) => {
    const unit = getProductUnitLabel(item);
    totals.set(unit, (totals.get(unit) || 0) + (Number(item.quantityM2) || 0));
    return totals;
  }, new Map<string, number>())];
