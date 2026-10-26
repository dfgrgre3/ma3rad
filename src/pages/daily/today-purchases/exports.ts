import { exportToExcel, exportToPdf, printHtml } from '../../../utils/export';
import { getProductUnitLabel } from '../../../utils/productUnits';
import type {
  DailyPurchaseItemRow,
  DailyPurchaseResult,
  DailyPurchaseRow,
  DailySupplierPaymentRow,
} from '../../../services/DailyOperationsService';
import type { useToast } from '../../../components/ui/Toast';
import { PAY_LABEL } from './constants';
import { buildPurchaseInvoiceHtml, formatDay, timeOf } from './helpers';
import type { NumberFormatter, SupplierStat } from './types';

type ToastApi = ReturnType<typeof useToast>;

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
    });
    toast.success('تم تصدير فواتير التوريد');
  } catch (e: any) {
    toast.error(e?.message || 'تعذر تصدير الفواتير');
  }
};

export const exportPurchaseItems = ({ date, items, plain, toast }: PurchaseExportContext) => {
  try {
    exportToExcel({
      title: 'أصناف التوريد اليوم',
      subtitle: `${formatDay(date)} — ${plain(items.length)} سطر`,
      columns: [
        { key: 'invoiceNumber', label: 'الفاتورة' },
        { key: 'supplierName', label: 'المورد' },
        { key: 'productName', label: 'الصنف' },
        { key: 'sku', label: 'الكود' },
        { key: 'grade', label: 'الفرز' },
        { key: 'quantityM2', label: 'الكمية' },
        { key: 'unit', label: 'الوحدة' },
        { key: 'boxesCount', label: 'الكراتين' },
        { key: 'unitCost', label: 'تكلفة الوحدة' },
        { key: 'totalCost', label: 'الإجمالي' },
      ],
      rows: items.map((item) => ({
        ...item,
        quantityM2: plain(item.quantityM2),
        unit: getProductUnitLabel(item),
      })) as unknown as Array<Record<string, unknown>>,
      fileName: `daily-purchases-items-${date}`,
    });
    toast.success('تم تصدير أصناف التوريد');
  } catch (e: any) {
    toast.error(e?.message || 'تعذر تصدير الأصناف');
  }
};

export const exportPurchaseSuppliers = ({ date, supplierStats, toast }: PurchaseExportContext) => {
  try {
    exportToExcel({
      title: 'موردون مشتريات اليوم',
      subtitle: formatDay(date),
      columns: [
        { key: 'name', label: 'المورد' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'invoices', label: 'عدد الفواتير' },
        { key: 'itemsCount', label: 'عدد الأصناف' },
        { key: 'total', label: 'إجمالي المشتريات' },
        { key: 'paid', label: 'المدفوع' },
        { key: 'remaining', label: 'المتبقي' },
        { key: 'unpaid', label: 'فواتير غير مسددة' },
      ],
      rows: supplierStats as unknown as Array<Record<string, unknown>>,
      fileName: `daily-purchases-suppliers-${date}`,
    });
    toast.success('تم تصدير الموردين');
  } catch (e: any) {
    toast.error(e?.message || 'تعذر تصدير الموردين');
  }
};

export const exportSupplierPayments = ({ date, payments, toast }: PurchaseExportContext) => {
  try {
    exportToExcel({
      title: 'سداد الموردين اليوم',
      subtitle: formatDay(date),
      columns: [
        { key: 'receiptNumber', label: 'السند' },
        { key: 'supplierName', label: 'المورد' },
        { key: 'invoiceNumbers', label: 'الفواتير' },
        { key: 'amount', label: 'المبلغ' },
        { key: 'paymentTypeLabel', label: 'طريقة السداد' },
        { key: 'performedByName', label: 'بواسطة' },
        { key: 'notes', label: 'ملاحظات' },
      ],
      rows: payments.map((payment) => ({
        ...payment,
        paymentTypeLabel: PAY_LABEL[payment.paymentType] || payment.paymentType,
      })),
      fileName: `daily-supplier-payments-${date}`,
    });
    toast.success('تم تصدير سداد الموردين');
  } catch (e: any) {
    toast.error(e?.message || 'تعذر تصدير السداد');
  }
};

export const printPurchaseStatement = ({ date, data, rows, plain, fmt, toast }: PurchaseExportContext) => {
  if (!data) return;
  try {
    exportToPdf({
      title: 'كشف مشتريات اليوم',
      subtitle: `${formatDay(date)} — ${plain(data.summary.count)} فاتورة — الإجمالي ${fmt(data.summary.total)}`,
      columns: [
        { key: 'invoiceNumber', label: 'الفاتورة' },
        { key: 'time', label: 'الوقت' },
        { key: 'supplierName', label: 'المورد' },
        { key: 'supplierInvoiceNumber', label: 'فاتورة المورد' },
        { key: 'itemsCount', label: 'الأصناف' },
        { key: 'total', label: 'الإجمالي' },
        { key: 'paid', label: 'المدفوع' },
        { key: 'remaining', label: 'المتبقي' },
        { key: 'status', label: 'الحالة' },
      ],
      rows: rows.map((row) => ({
        invoiceNumber: row.invoiceNumber,
        time: timeOf(row.createdAt),
        supplierName: row.supplierName || '—',
        supplierInvoiceNumber: row.supplierInvoiceNumber || '—',
        itemsCount: plain(row.itemsCount),
        total: fmt(row.total),
        paid: fmt(row.paid),
        remaining: fmt(row.remaining),
        status: PAY_LABEL[row.paymentStatus] || row.paymentStatus,
      })),
      fileName: `daily-purchases-${date}`,
    });
    toast.success('تم تجهيز كشف الطباعة');
  } catch (e: any) {
    toast.error(e?.message || 'تعذر تجهيز الطباعة');
  }
};

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
