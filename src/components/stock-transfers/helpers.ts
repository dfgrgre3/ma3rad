import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';
import type { TransferQuantityKey, WarehouseSummaryGroup, WarehouseSummaryRow } from './types';

/** تنسيق الأرقام بالصيغة العربية الموحدة للتحويلات. */
export const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/** تجميع كميات أصناف التحويل حسب وحدة القياس وإظهارها كنص واحد. */
export const summarizeTransferItems = (items: any[], key: TransferQuantityKey): string => {
  const totals = new Map<string, { product: any; quantity: number }>();
  for (const item of items) {
    const quantity = Number(item[key] || 0);
    if (!quantity) continue;
    const unit = getProductUnitLabel(item);
    const entry = totals.get(unit) || { product: item, quantity: 0 };
    entry.quantity += quantity;
    totals.set(unit, entry);
  }
  return [...totals.values()].map((entry) => formatProductQuantity(entry.quantity, entry.product)).join('، ') || '—';
};

/** ملخصات الكميات (مطلوب/مشحون/مستلم/فقد) لأمر تحويل واحد. */
export const buildTransferSummaryFields = (items: any[]) => ({
  quantitySummary: summarizeTransferItems(items, 'quantityM2'),
  shippedSummary: summarizeTransferItems(items, 'shippedM2'),
  receivedSummary: summarizeTransferItems(items, 'receivedM2'),
  lostSummary: summarizeTransferItems(items, 'lostM2'),
});

/** تجميع ملخص الحركة حسب المخزن مع الاحتفاظ بإجماليات الوحدات. */
export const groupSummaryByWarehouse = (summaryRows: WarehouseSummaryRow[]): WarehouseSummaryGroup[] => {
  const groupedSummary = new Map<string, WarehouseSummaryGroup>();
  for (const row of summaryRows) {
    const warehouse = groupedSummary.get(row.warehouseId) || {
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      unitTotals: [],
    };
    if (row.unitLabel) warehouse.unitTotals.push(row);
    groupedSummary.set(row.warehouseId, warehouse);
  }
  return [...groupedSummary.values()];
};

/** خطوة إدخال الكمية المناسبة حسب نوع الصنف ووحدة البيع. */
export const resolveQuantityStep = (product: any): number =>
  product?.productType === 'GENERAL' && ['BOX', 'PIECE', 'SET'].includes(product.baseUnit) ? 1 : 0.01;
