import type {
  DailyPurchaseItemRow,
  DailyPurchaseRow,
  DailySupplierPaymentRow,
} from '../../../services/DailyOperationsService';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/productUnits';
import { PAY_LABEL } from './constants';
import type { PurchaseFilters, SortDir, SortKey, SupplierStat } from './types';

const ESCAPE_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] || ch);

export const timeOf = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—');

export const formatDay = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('ar-EG', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

export const shiftDay = (value: string, days: number) => {
  const next = new Date(`${value}T12:00:00`);
  next.setDate(next.getDate() + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};

export const weekdayOf = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('ar-EG', { weekday: 'short' });

export const buildPurchaseInvoiceHtml = (
  row: DailyPurchaseRow,
  items: DailyPurchaseItemRow[],
  currency: string,
  storeName: string,
) => {
  const money = (value: number) => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${currency}`;
  const lines = items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td style="text-align:right;font-weight:700">${escapeHtml(item.productName)}<div style="font-size:10px;color:#64748b">${escapeHtml(item.sku || '')} · ${escapeHtml(item.grade || '')}</div></td>
      <td>${escapeHtml(formatProductQuantity(Number(item.quantityM2), item))}</td>
      <td>${escapeHtml(item.boxesCount)}</td>
      <td>${escapeHtml(money(item.unitCost))}</td>
      <td style="font-weight:700">${escapeHtml(money(item.totalCost))}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>فاتورة توريد ${escapeHtml(row.invoiceNumber)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; margin: 0; padding: 18px; font-size: 12px; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #ea580c; padding-bottom:12px; }
    .title { font-size:18px; font-weight:800; color:#c2410c; }
    .muted { color:#64748b; font-size:11px; }
    .grid { display:flex; justify-content:space-between; gap:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px; margin:14px 0; }
    table { width:100%; border-collapse:collapse; font-size:11px; }
    th, td { border-bottom:1px solid #e2e8f0; padding:7px 6px; text-align:center; }
    th { background:#fff7ed; color:#9a3412; }
    .totals { width:280px; margin-right:auto; margin-top:14px; border:1px solid #e2e8f0; border-radius:6px; padding:10px; background:#f8fafc; }
    .row { display:flex; justify-content:space-between; padding:3px 0; }
    .grand { border-top:2px solid #cbd5e1; margin-top:6px; padding-top:6px; font-size:14px; font-weight:800; color:#c2410c; }
    @media print { body { padding:0; } }
  </style>
</head>
<body>
  <div class="head">
    <div>
      <div class="title">${escapeHtml(storeName || 'CeramiSys ERP')}</div>
      <div class="muted">فاتورة توريد / مشتريات</div>
    </div>
    <div style="text-align:left">
      <div style="font-weight:800">${escapeHtml(row.invoiceNumber)}</div>
      <div class="muted">${escapeHtml(row.date)}</div>
      ${row.supplierInvoiceNumber ? `<div class="muted">فاتورة المورد: ${escapeHtml(row.supplierInvoiceNumber)}</div>` : ''}
    </div>
  </div>
  <div class="grid">
    <div><strong>المورد:</strong> ${escapeHtml(row.supplierName || '—')}<br/><span class="muted">${escapeHtml(row.supplierPhone || '')}</span></div>
    <div><strong>المخزن:</strong> ${escapeHtml(row.warehouseName || '—')}</div>
    <div><strong>طريقة السداد:</strong> ${escapeHtml(PAY_LABEL[row.paymentType] || row.paymentType || '—')}</div>
  </div>
  <table>
    <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>الكراتين</th><th>تكلفة الوحدة</th><th>الإجمالي</th></tr></thead>
    <tbody>${lines || '<tr><td colspan="6">لا توجد أصناف</td></tr>'}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>الإجمالي قبل الخصم</span><span>${escapeHtml(money(row.subtotal))}</span></div>
    <div class="row"><span>الخصم</span><span>${escapeHtml(money(row.discount))}</span></div>
    <div class="row"><span>الضريبة</span><span>${escapeHtml(money(row.tax))}</span></div>
    <div class="row"><span>الشحن</span><span>${escapeHtml(money(row.shippingCost))}</span></div>
    <div class="row grand"><span>إجمالي الفاتورة</span><span>${escapeHtml(money(row.total))}</span></div>
    <div class="row"><span>المدفوع</span><span>${escapeHtml(money(row.paid))}</span></div>
    <div class="row"><span>المتبقي</span><span>${escapeHtml(money(row.remaining))}</span></div>
  </div>
  ${row.notes ? `<p class="muted" style="margin-top:14px">ملاحظات: ${escapeHtml(row.notes)}</p>` : ''}
  <p class="muted" style="margin-top:20px;text-align:center">أُنشئت من CeramiSys ERP — ${escapeHtml(row.createdByName || '')} — ${escapeHtml(timeOf(row.createdAt))}</p>
</body>
</html>`;
};

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

const purchaseSearchText = (row: DailyPurchaseRow) =>
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
