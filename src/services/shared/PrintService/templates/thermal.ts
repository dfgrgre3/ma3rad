import type { SalesInvoice, SystemSettings } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { formatProductQuantity } from '../../../../utils/products/productUnits';
import {
  esc,
  invoiceBrandStyles,
  logoHtml,
  orderedInvoiceDetails,
  printOverride,
} from '../invoiceHtmlHelpers';

/**
 * HTML format for 80mm / 58mm thermal receipt printers.
 */
export function getThermalInvoiceHtml(
  invoice: SalesInvoice & { items: any[] },
  settings: SystemSettings,
): string {
  const receiptTitle = printOverride('sales.invoice.receipt', 'إيصال مبيعات');
  const receiptFooter = printOverride('sales.invoice.receipt.footer', settings.receiptFooter || '');
  const is58 = settings.thermalPaperWidth === '58';
  const paperWidth = is58 ? '58mm' : '80mm';
  const bodyWidth = is58 ? '54mm' : '76mm';

  const itemsHtml = invoice.items.map((item) => `
      <div style="margin-bottom: 5px;">
        <div style="font-weight: 700;">${esc(item.productName)}</div>
        <div style="font-size: 10px; color: #444;">${esc(item.productSku)} | ${esc(item.size || '')} | ${item.productGrade === 'GRADE_1' ? 'أول' : 'تجاري'}</div>
        <div style="display: flex; justify-content: space-between;">
          <span>${formatProductQuantity(item.quantityM2, item)}${settings.invoiceShowBoxesCount !== false && item.productType !== 'GENERAL' ? ` (${item.boxesCount} كرتونة)` : ''} × ${item.unitPrice}</span>
          <span style="font-weight: 700;">${CeramicMath.formatCurrency(item.totalPrice)}</span>
        </div>
        ${settings.invoiceShowLineDiscount && item.discountAmount > 0 ? `<div style="display: flex; justify-content: space-between; color: #b91c1c; font-size: 10px;"><span>خصم</span><span>-${CeramicMath.formatCurrency(item.discountAmount)}</span></div>` : ''}
      </div>
    `).join('');

  return `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>إيصال ${esc(invoice.invoiceNumber)}</title>
          <style>
            @page { size: ${paperWidth} auto; margin: 2mm; }
            * { box-sizing: border-box; }
            body { font-family: 'Cairo', Tahoma, system-ui, sans-serif; width: ${bodyWidth}; margin: 0 auto; padding: 4px; color: #000; font-size: 12px; line-height: 1.45; }
            .center { text-align: center; }
            .shop-name { font-size: 15px; font-weight: 800; }
            .muted { color: #444; font-size: 10px; white-space: pre-line; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            .meta-row { display: flex; justify-content: space-between; gap: 6px; }
            .totals-row { display: flex; justify-content: space-between; }
            .grand { font-size: 15px; font-weight: 800; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; }
            .footer { text-align: center; font-size: 10px; margin-top: 8px; white-space: pre-line; }
            ${invoiceBrandStyles(settings)}
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          ${settings.invoiceShowBrandLogo !== false ? `<div class="center">${logoHtml(settings, 26)}</div>` : ''}
          <div class="center shop-name">${esc(settings.showroomName)}</div>
          <div class="center muted">${esc(settings.tagline || '')}</div>
          <div class="center muted">${esc(settings.address || '')}${settings.phone ? ' | ت: ' + esc(settings.phone) : ''}</div>
          ${settings.taxNumber ? `<div class="center muted">الرقم الضريبي: ${esc(settings.taxNumber)}</div>` : ''}
          <div class="divider"></div>
          <div class="meta-row"><span>${esc(receiptTitle)}</span><span style="font-family: monospace; font-weight: 700;">${esc(invoice.invoiceNumber)}</span></div>
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
          <div class="totals-row"><span>طريقة الدفع</span><span>${invoice.paymentType === 'CASH' ? 'نقدي' : 'آجل'}</span></div>
          ${invoice.remainingAmount > 0 ? `<div class="totals-row" style="color: #b91c1c; font-weight: 700;"><span>المتبقي</span><span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
          ${orderedInvoiceDetails(invoice, settings, true)}
          <div class="footer">${esc(receiptFooter)}</div>
        </body>
      </html>
    `;
}
