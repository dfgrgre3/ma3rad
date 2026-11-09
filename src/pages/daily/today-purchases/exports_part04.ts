import { printHtml } from '../../../utils/export/export';
import type { DailyPurchaseItemRow, DailyPurchaseRow } from '../../../services/operations/DailyOperationsService';
import { buildPurchaseInvoiceHtml } from './helpers';
import type { ToastApi } from './exports_part01';

export const printPurchaseInvoice = ({
  row,
  items,
  currency,
  storeName,
  toast,
}: {
  row: DailyPurchaseRow;
  items: DailyPurchaseItemRow[];
  currency: string;
  storeName: string;
  toast: ToastApi;
}) => {
  try {
    const html = buildPurchaseInvoiceHtml(row, items, currency, storeName);
    printHtml(html);
  } catch (e: any) {
    toast.error(e?.message || 'تعذر طباعة الفاتورة');
  }
};
