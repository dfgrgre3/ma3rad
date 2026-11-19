import type { SalesInvoice, SystemSettings } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../../../../utils/products/productUnits';
import {
  esc,
  invoiceBrandStyles,
  orderedInvoiceDetails,
  paymentBadge,
  paymentTypeLabel,
  printOverride,
  tafqeet,
  taxBreakdownHtml,
} from '../invoiceHtmlHelpers';

/**
 * Compact Invoice Template:
 * Optimized for paper efficiency, high density, tight vertical height,
 * fast printing, with tafqeet and payment badge.
 */
export function getCompactInvoiceHtml(
  invoice: SalesInvoice & { items: any[] },
  settings: SystemSettings,
  size: 'a4' | 'a5',
): string {
  const isA5 = size === 'a5';
  const documentFooter = printOverride('sales.invoice.a4.footer', settings.receiptFooter || '');
  const currency = settings.currency || 'ر.س';

  const itemsHtml = invoice.items.map((item, idx) => `
      <tr style="border-bottom: 1px solid #cbd5e1; text-align: center;${idx % 2 === 1 ? ' background:#f8fafc;' : ''}">
        <td style="padding: 3px 2px;">${idx + 1}</td>
        <td style="padding: 3px 5px; text-align: right; font-weight: 600;">
          ${esc(item.productName)} ${(settings.invoiceShowItemCode || settings.invoiceShowItemSpecs) ? `<span style="font-size: 9px; color: #64748b;">[${settings.invoiceShowItemCode ? esc(item.productSku || '') : ''}${settings.invoiceShowItemCode && settings.invoiceShowItemSpecs ? ' | ' : ''}${settings.invoiceShowItemSpecs ? `${esc(item.size || '')} | ${item.productGrade === 'GRADE_1' ? 'أول' : 'تجاري'}` : ''}]</span>` : ''}
        </td>
        <td style="padding: 3px 2px;">${getProductUnitLabel(item)}</td>
        <td style="padding: 3px 2px; font-weight: 700;">${formatProductQuantity(item.quantityM2, item)}${settings.invoiceShowBoxesCount && item.productType !== 'GENERAL' ? ` <span style="font-size:8px;color:#64748b;">(${item.boxesCount}ك)</span>` : ''}</td>
        <td style="padding: 3px 2px;">${CeramicMath.formatCurrency(item.unitPrice)}</td>
        ${settings.invoiceShowLineDiscount ? `<td style="padding: 3px 2px; color: ${item.discountAmount > 0 ? '#dc2626' : '#cbd5e1'};">${item.discountAmount > 0 ? CeramicMath.formatCurrency(item.discountAmount) : '—'}</td>` : ''}
        <td style="padding: 3px 2px; font-weight: 700;">${CeramicMath.formatCurrency(item.totalPrice)}</td>
      </tr>
    `).join('');

  const totalBoxes = invoice.items.reduce((sum: number, it: any) => sum + (it.boxesCount || 0), 0);

  return `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>فاتورة ${esc(invoice.invoiceNumber)}</title>
          <style>
            @page { size: ${isA5 ? 'A5' : 'A4'}; margin: ${isA5 ? '6mm' : '8mm'}; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Cairo', 'Segoe UI', Tahoma, system-ui, sans-serif; padding: 6px; color: #000; font-size: ${isA5 ? '10px' : '11px'}; line-height: 1.35; }
            .top-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
            .title { font-size: ${isA5 ? '14px' : '16px'}; font-weight: 900; }
            .meta-strip { display: flex; justify-content: space-between; flex-wrap: wrap; background: #f1f5f9; padding: 3px 6px; border-radius: 4px; margin-bottom: 6px; font-size: ${isA5 ? '9px' : '10px'}; gap: 4px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #e2e8f0; border-bottom: 1px solid #000; border-top: 1px solid #000; padding: ${isA5 ? '3px 2px' : '4px 2px'}; font-size: ${isA5 ? '9px' : '10px'}; font-weight: 800; }
            .bottom-grid { display: flex; justify-content: space-between; margin-top: 6px; border-top: 1px solid #000; padding-top: 4px; gap: 10px; }
            .tot-line { display: flex; justify-content: space-between; gap: 10px; font-size: ${isA5 ? '9px' : '10px'}; }
            .tafqeet-compact { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 3px 6px; margin-top: 6px; text-align: center; font-size: ${isA5 ? '9px' : '10px'}; }
            .signatures-compact { display: flex; justify-content: space-around; margin-top: ${isA5 ? '14px' : '20px'}; font-size: ${isA5 ? '9px' : '10px'}; color: #475569; }
            .signatures-compact span { border-top: 1px dashed #94a3b8; padding-top: 4px; min-width: 80px; text-align: center; }
            .footer { text-align: center; font-size: ${isA5 ? '8px' : '9px'}; margin-top: 6px; color: #475569; white-space: pre-line; }
            ${invoiceBrandStyles(settings)}
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="top-bar">
            <div style="display: flex; align-items: center; gap: 6px;">
              ${settings.invoiceShowBrandLogo !== false && settings.brandLogoDataUrl ? `<img src="${settings.brandLogoDataUrl}" style="width:${isA5 ? '24px' : '30px'};height:${isA5 ? '24px' : '30px'};object-fit:contain;" alt="">` : ''}
              <div>
                <span class="title">${esc(settings.showroomName)}</span>
                <span style="font-size: ${isA5 ? '9px' : '10px'}; color: #475569; margin-right: 6px;">${esc(settings.address || '')} | ت: ${esc(settings.phone || '')}</span>
              </div>
            </div>
            <div style="font-weight: 700; font-family: monospace; text-align: left;">
              <div>فاتورة: ${esc(invoice.invoiceNumber)}</div>
              <div style="font-size: ${isA5 ? '9px' : '10px'}; color: #475569;">${esc(invoice.date)}</div>
              ${paymentBadge(invoice, isA5)}
            </div>
          </div>

          <div class="meta-strip">
            <span><strong>العميل:</strong> ${esc(invoice.customerName || 'عميل نقدي')} (${esc(invoice.customerPhone || '-')})</span>
            <span><strong>المخزن:</strong> ${esc(invoice.warehouseName || '-')}</span>
            <span><strong>الدفع:</strong> ${paymentTypeLabel(invoice.paymentType)}</span>
            ${settings.taxNumber ? `<span><strong>ض:</strong> ${esc(settings.taxNumber)}</span>` : ''}
          </div>

          <table>
            <thead>
              <tr style="text-align: center;">
                <th style="width: 22px;">#</th>
                <th style="text-align: right;">الصنف [كود|مقاس|فرز]</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>السعر</th>
                ${settings.invoiceShowLineDiscount ? '<th>الخصم</th>' : ''}
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="bottom-grid">
            <div style="font-size: ${isA5 ? '9px' : '10px'}; max-width: 52%;">
              <div style="margin-bottom: 3px;"><strong>بنود:</strong> ${invoice.items.length} · <strong>كراتين:</strong> ${totalBoxes}</div>
              ${orderedInvoiceDetails(invoice, settings, isA5)}
            </div>
            <div style="min-width: ${isA5 ? '180px' : '220px'};">
              <div class="tot-line"><span>المجموع:</span> <span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
              ${invoice.discountAmount > 0 ? `<div class="tot-line" style="color:#dc2626;"><span>خصم:</span> <span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
              ${invoice.taxAmount > 0 ? `<div class="tot-line"><span>ضريبة (${esc(invoice.taxPercentage)}%):</span> <span>+${CeramicMath.formatCurrency(invoice.taxAmount)}</span></div>` : ''}
              ${invoice.shippingCost > 0 ? `<div class="tot-line"><span>نقل:</span> <span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
              ${Number(invoice.extraFees || 0) > 0 ? `<div class="tot-line"><span>مصاريف إضافية:</span> <span>+${CeramicMath.formatCurrency(Number(invoice.extraFees))}</span></div>` : ''}
              <div class="tot-line" style="font-weight: 900; border-top: 1.5px solid #000; margin-top: 2px; padding-top: 2px; font-size: ${isA5 ? '11px' : '12px'};">
                <span>الصافي:</span> <span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span>
              </div>
              <div class="tot-line" style="color: #16a34a; font-weight: 700;"><span>المسدد:</span> <span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
              ${invoice.remainingAmount > 0 ? `<div class="tot-line" style="color: #dc2626; font-weight: 700;"><span>المتبقي:</span> <span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
              ${taxBreakdownHtml(invoice, isA5)}
            </div>
          </div>

          <div class="tafqeet-compact">
            <strong>تفقيط:</strong> فقط ${tafqeet(invoice.totalAmount)} ${esc(currency)} لا غير
          </div>

          <div class="signatures-compact">
            <span>البائع</span>
            <span>العميل</span>
            <span>المسؤول</span>
          </div>

          <div class="footer">${esc(documentFooter)}</div>

        </body>
      </html>
    `;
}
