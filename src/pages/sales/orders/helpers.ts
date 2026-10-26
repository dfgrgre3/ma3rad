import { Order } from '../../../services/OrderService';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/productUnits';
import { STATUS_LABELS } from './types';

export const summarizeOrderQuantity = (items: any[], field: 'quantityM2' | 'deliveredM2') => {
  const totals = new Map<string, { product: any; quantity: number }>();
  for (const item of items) {
    const quantity = Number(item[field] || 0);
    if (quantity <= 0) continue;
    const unit = getProductUnitLabel(item);
    const entry = totals.get(unit) || { product: item, quantity: 0 };
    entry.quantity += quantity;
    totals.set(unit, entry);
  }
  return [...totals.values()].map((entry) => formatProductQuantity(entry.quantity, entry.product)).join('، ') || '0';
};

export const buildOrderExportRows = (orders: Order[]) => orders.map((o) => ({
  orderNumber: o.orderNumber,
  date: o.date,
  customer: o.customerName || '',
  phone: o.customerPhone || '',
  warehouse: o.warehouseName || '',
  delivery: o.expectedDeliveryDate || '',
  items: o.itemsCount || 0,
  total: o.totalAmount,
  status: STATUS_LABELS[o.status].label,
  invoice: o.invoiceNumber || '',
}));
