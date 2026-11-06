import type { Dispatch, SetStateAction } from 'react';
import type { PrintService } from '../../services/PrintService';
import { CeramicMath } from '../../utils/ceramicMath';
import { formatProductQuantity } from '../../utils/productUnits';
import { openWhatsAppChat } from '../../utils/externalLinks';
import { exportToExcel } from '../../utils/export';
import type { InvoicePreview } from './types';

interface UsePosInvoicePreviewOptions {
  printService: PrintService;
  setInvoicePreview: Dispatch<SetStateAction<InvoicePreview | null>>;
}

export const usePosInvoicePreview = ({ printService, setInvoicePreview }: UsePosInvoicePreviewOptions) => {
  const openInvoicePreview = (invoice: any) => {
    if (!invoice) return;
    const excel = {
      title: `فاتورة مبيعات ${invoice.invoiceNumber}`,
      subtitle: `${invoice.customerName || 'عميل نقدي'} • ${invoice.date}`,
      columns: [
        { key: 'idx', label: '#' },
        { key: 'product', label: 'الصنف' },
        { key: 'sku', label: 'الكود' },
        { key: 'qty', label: 'الكمية' },
        { key: 'boxes', label: 'الكراتين' },
        { key: 'price', label: 'سعر الوحدة' },
        { key: 'discount', label: 'الخصم' },
        { key: 'total', label: 'الإجمالي' },
      ],
      rows: (invoice.items || []).map((item: any, index: number) => ({
        idx: index + 1,
        product: item.productName,
        sku: item.productSku || '',
        qty: formatProductQuantity(item.quantityM2, item),
        boxes: item.productType === 'GENERAL' ? '' : item.boxesCount,
        price: item.unitPrice,
        discount: item.discountAmount,
        total: item.totalPrice,
      })),
      fileName: `invoice-${invoice.invoiceNumber}`,
      permission: 'sales.export',
    };
    setInvoicePreview({
      title: `معاينة الفاتورة ${invoice.invoiceNumber}`,
      subtitle: `${invoice.customerName || 'عميل نقدي'} • ${invoice.date} • ${CeramicMath.formatCurrency(invoice.totalAmount)}`,
      fileName: `invoice-${invoice.invoiceNumber}`,
      html: printService.getInvoiceHtml(invoice),
      excel: () => exportToExcel(excel),
      whatsapp: invoice.customerPhone ? () => {
        const text =
          `فاتورة مبيعات ${invoice.invoiceNumber}\nالإجمالي: ${CeramicMath.formatCurrency(invoice.totalAmount)}\n` +
          `المدفوع: ${CeramicMath.formatCurrency(invoice.paidAmount)}\n` +
          (invoice.remainingAmount > 0 ? `المتبقي: ${CeramicMath.formatCurrency(invoice.remainingAmount)}\n` : '') +
          `شكراً لتعاملكم معنا.`;
        openWhatsAppChat(String(invoice.customerPhone || ''), text);
      } : undefined,
    });
  };

  return { openInvoicePreview };
};
