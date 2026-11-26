import type { SalesInvoice, SystemSettings } from '../../../types';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { writeAndPrintWindow } from '../../../utils/shared/printWindow';
import { EscPosService } from '../EscPosService';
import { SettingsService } from '../../domains/config/SettingsService';
import { esc, printOverride } from './invoiceHtmlHelpers';

async function printThermalReceiptDirect(
  invoice: SalesInvoice & { items: any[] },
  settings: SystemSettings,
): Promise<boolean> {
  // Direct ESC/POS route: raw bytes to the OS spooler (winspool/CUPS) or
  // straight over TCP 9100 for network printers — silent, no dialog.
  if (!settings.thermalPrinterName || !window.ceramisys?.printing?.raw) return false;

  try {
    const width = EscPosService.lineWidthFor(settings);
    const bytes = EscPosService.buildReceiptBytes(invoice, settings, width);
    const isNetwork = settings.thermalTransport === 'network';
    const res = await window.ceramisys.printing.raw(bytes, settings.thermalPrinterName, isNetwork
      ? { transport: 'network', host: settings.thermalHost, port: 9100 }
      : { transport: 'system' });
    if (res?.ok) return true;
    console.warn('Direct ESC/POS printing failed, falling back to dialog:', res?.error);
  } catch (error) {
    console.warn('Direct ESC/POS printing failed, falling back to dialog:', error);
  }

  return false;
}

/**
 * 80mm thermal receipt for point-of-sale checkout. Kept intentionally compact
 * (no table borders, monospace-ish) so it renders correctly on narrow roll paper.
 */
export async function printThermalReceipt(invoice: SalesInvoice & { items: any[] }): Promise<void> {
  const settings = SettingsService.getSettings();
  const receiptTitle = printOverride('sales.invoice.receipt', 'إيصال بيع');
  const receiptFooter = printOverride('sales.invoice.receipt.footer', settings.receiptFooter || '');

  if (await printThermalReceiptDirect(invoice, settings)) return;

  const printWindow = window.open('about:blank', '_blank', 'width=380,height=640');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة لطباعة الإيصال');
    return;
  }

  const itemsHtml = invoice.items.map((item) => `
      <div class="item">
        <div class="item-name">${esc(item.productName)}</div>
        <div class="item-meta">${esc(item.productSku)} | مقاس ${esc(item.size)} | ${item.productGrade === 'GRADE_1' ? 'فرز أول' : 'فرز ثاني/تجاري'}</div>
        <div class="item-row">
          <span>${formatProductQuantity(item.quantityM2, item)}${item.productType === 'GENERAL' ? '' : ` (${item.boxesCount} كرتونة)`} × ${item.unitPrice}</span>
          <span>${CeramicMath.formatCurrency(item.totalPrice)}</span>
        </div>
        ${item.discountAmount > 0 ? `<div class="item-row discount"><span>خصم الصنف</span><span>-${CeramicMath.formatCurrency(item.discountAmount)}</span></div>` : ''}
      </div>
    `).join('');

  const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>إيصال ${esc(invoice.invoiceNumber)}</title>
          <style>
            @page { size: 80mm auto; margin: 2mm; }
            * { box-sizing: border-box; }
            body { font-family: 'Cairo', Tahoma, system-ui, sans-serif; width: 76mm; margin: 0 auto; padding: 4px; color: #000; font-size: 12px; line-height: 1.45; }
            .center { text-align: center; }
            .shop-name { font-size: 15px; font-weight: 800; }
            .muted { color: #444; font-size: 10px; white-space: pre-line; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            .meta-row { display: flex; justify-content: space-between; gap: 6px; }
            .item { margin-bottom: 5px; }
            .item-name { font-weight: 700; }
            .item-meta { font-size: 10px; color: #444; }
            .item-row { display: flex; justify-content: space-between; gap: 6px; }
            .item-row.discount { color: #b91c1c; font-size: 10px; }
            .totals-row { display: flex; justify-content: space-between; }
            .grand { font-size: 15px; font-weight: 800; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; }
            .footer { text-align: center; font-size: 10px; margin-top: 8px; white-space: pre-line; }
          </style>
        </head>
        <body>
          <div class="center shop-name">${esc(settings.showroomName)}</div>
          <div class="center muted">${esc(settings.tagline || '')}</div>
          <div class="center muted">${esc(settings.address || '')}${settings.phone ? ' | ت: ' + esc(settings.phone) : ''}</div>
          <div class="divider"></div>
          <div class="meta-row"><span>${esc(receiptTitle)}</span><span>${esc(invoice.invoiceNumber)}</span></div>
          <div class="meta-row"><span>التاريخ</span><span>${esc(invoice.date)}</span></div>
          <div class="meta-row"><span>العميل</span><span>${esc(invoice.customerName || 'عميل نقدي')}</span></div>
          <div class="meta-row"><span>المخزن</span><span>${esc(invoice.warehouseName || '-')}</span></div>
          <div class="divider"></div>
          ${itemsHtml}
          <div class="divider"></div>
          <div class="totals-row"><span>المجموع الفرعي</span><span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
          ${invoice.discountAmount > 0 ? `<div class="totals-row"><span>خصم الفاتورة</span><span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
          ${invoice.taxAmount > 0 ? `<div class="totals-row"><span>ضريبة</span><span>+${CeramicMath.formatCurrency(invoice.taxAmount)}</span></div>` : ''}
          ${invoice.shippingCost > 0 ? `<div class="totals-row"><span>مشال ونقل</span><span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
          ${Number(invoice.extraFees || 0) > 0 ? `<div class="totals-row"><span>مصاريف إضافية</span><span>+${CeramicMath.formatCurrency(Number(invoice.extraFees))}</span></div>` : ''}
          <div class="totals-row grand"><span>الإجمالي</span><span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span></div>
          <div class="totals-row"><span>المدفوع</span><span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
          <div class="totals-row"><span>طريقة الدفع</span><span>${invoice.paymentType === 'CASH' ? 'نقدي' : invoice.paymentType === 'CARD' ? 'بطاقة' : invoice.paymentType === 'BANK_TRANSFER' ? 'تحويل بنكي' : invoice.paymentType === 'CHEQUE' ? 'شيك' : invoice.paymentType === 'MIXED' ? 'دفع مختلط' : invoice.paymentType === 'WALLET' ? 'محفظة إلكترونية' : invoice.paymentType === 'ONLINE' ? 'دفع أونلاين' : 'آجل'}</span></div>
          ${invoice.remainingAmount > 0 ? `<div class="totals-row"><span>المتبقي (آجل)</span><span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
          <div class="footer">${esc(receiptFooter || '')}</div>
        </body>
      </html>
    `;

  writeAndPrintWindow(printWindow, html, true);
}
