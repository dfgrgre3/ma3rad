import { exportToExcel, exportToPdf } from '../../../utils/export/export';
import { PAY_LABEL } from './constants';
import { formatDay, timeOf } from './helpers';
import type { PurchaseExportContext } from './exports_part01';

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
      permission: 'purchases.export',
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
      permission: 'purchases.export',
    });
    toast.success('تم تجهيز كشف الطباعة');
  } catch (e: any) {
    toast.error(e?.message || 'تعذر تجهيز الطباعة');
  }
};
