import { exportToExcel } from '../../../utils/export/export';
import type { DailyPurchaseItemRow, DailyPurchaseResult, DailyPurchaseRow, DailySupplierPaymentRow } from '../../../services/domains/operations/DailyOperationsService';
import type { useToast } from '../../../components/ui/Toast';
import { PAY_LABEL } from './constants';
import { formatDay, timeOf } from './helpers';
import type { NumberFormatter, SupplierStat } from '../../../types/dashboard/todayPurchases';

export type ToastApi = ReturnType<typeof useToast>;

export interface PurchaseExportContext {
  date: string;
  data: DailyPurchaseResult | null;
  rows: DailyPurchaseRow[];
  items: DailyPurchaseItemRow[];
  supplierStats: SupplierStat[];
  payments: DailySupplierPaymentRow[];
  plain: NumberFormatter;
  fmt: NumberFormatter;
  toast: ToastApi;
}

export const exportPurchaseInvoices = ({ date, data, rows, plain, toast }: PurchaseExportContext) => {
  if (!data) return;
  try {
    exportToExcel({
      title: 'كشف مشتريات اليوم',
      subtitle: `${formatDay(date)} — ${plain(data.summary.count)} فاتورة`,
      columns: [
        { key: 'invoiceNumber', label: 'الفاتورة' },
        { key: 'supplierInvoiceNumber', label: 'فاتورة المورد' },
        { key: 'time', label: 'الوقت' },
        { key: 'supplierName', label: 'المورد' },
        { key: 'supplierPhone', label: 'الهاتف' },
        { key: 'warehouseName', label: 'المخزن' },
        { key: 'itemsCount', label: 'الأصناف' },
        { key: 'subtotal', label: 'قبل الخصم' },
        { key: 'discount', label: 'الخصم' },
        { key: 'tax', label: 'الضريبة' },
        { key: 'shippingCost', label: 'الشحن' },
        { key: 'total', label: 'الإجمالي' },
        { key: 'paid', label: 'المدفوع' },
        { key: 'remaining', label: 'المتبقي' },
        { key: 'paymentTypeLabel', label: 'طريقة السداد' },
        { key: 'paymentStatusLabel', label: 'حالة السداد' },
        { key: 'createdByName', label: 'بواسطة' },
        { key: 'notes', label: 'ملاحظات' },
      ],
      rows: rows.map((row) => ({
        ...row,
        time: timeOf(row.createdAt),
        paymentTypeLabel: PAY_LABEL[row.paymentType] || row.paymentType,
        paymentStatusLabel: PAY_LABEL[row.paymentStatus] || row.paymentStatus,
      })),
      fileName: `daily-purchases-${date}`,
      permission: 'purchases.export',
    });
    toast.success('تم تصدير فواتير التوريد');
  } catch (e: any) {
    toast.error(e?.message || 'تعذر تصدير الفواتير');
  }
};
