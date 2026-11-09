import { exportToExcel } from '../../../utils/export/export';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import { formatDay } from './helpers';
import type { PurchaseExportContext } from './exports_part01';

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
