import type { SalesInvoice, SystemSettings } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { formatProductQuantity } from '../../../../utils/products/productUnits';
import {
  esc,
  invoiceBrandStyles,
  itemSerialsHtml,
  logoHtml,
  orderedInvoiceDetails,
  paymentBadge,
  paymentTypeLabel,
  printOverride,
  tafqeet,
  taxBreakdownHtml,
} from '../invoiceHtmlHelpers';

/**
 * Detailed Showroom Template:
 * Tailored for ceramic showrooms: full SKU, size, grade, boxes, pieces columns,
 * logo, tafqeet, delivery terms, warehouse dispatch verification, and signatures.
 */
export function getDetailedInvoiceHtml(
  invoice: SalesInvoice & { items: any[] },
  settings: SystemSettings,
  size: 'a4' | 'a5',
): string {
  const isA5 = size === 'a5';
  const documentFooter = printOverride('sales.invoice.a4.footer', settings.receiptFooter || '');
  const currency = settings.currencySymbol || settings.currency || 'ج.م';

  const itemsHtml = invoice.items.map((item, idx) => `
      <tr style="border-bottom: 1px solid #cbd5e1; text-align: center;${idx % 2 === 1 ? ' background:#f0f9ff;' : ''}">
        <td style="padding: ${isA5 ? '4px 2px' : '6px 4px'}; font-weight: bold;">${idx + 1}</td>
        <td style="padding: ${isA5 ? '4px 4px' : '6px 6px'}; text-align: right; font-weight: 700;">
          ${esc(item.productName)}${itemSerialsHtml(item)}
        </td>
        ${settings.invoiceShowItemCode ? `<td style="padding: ${isA5 ? '4px 2px' : '6px 4px'}; font-family: monospace; font-size: ${isA5 ? '9px' : '10px'};">${esc(item.productSku || '-')}</td>` : ''}
        ${settings.invoiceShowItemSpecs ? `<td style="padding: ${isA5 ? '4px 2px' : '6px 4px'};">${esc(item.size || '—')}</td>
        <td style="padding: ${isA5 ? '4px 2px' : '6px 4px'};">${item.productGrade === 'GRADE_1' ? '<span style="color:#0369a1;font-weight:700;">فرز أول</span>' : '<span style="color:#92400e;">فرز تجاري</span>'}</td>` : ''}
        <td style="padding: ${isA5 ? '4px 2px' : '6px 4px'}; font-weight: 700;">${formatProductQuantity(item.quantityM2, item)}</td>
        ${settings.invoiceShowBoxesCount ? `<td style="padding: ${isA5 ? '4px 2px' : '6px 4px'};">${item.productType === 'GENERAL' ? '—' : (item.boxesCount || '—')}</td>
        <td style="padding: ${isA5 ? '4px 2px' : '6px 4px'}; font-size: ${isA5 ? '9px' : '10px'};">${item.productType === 'GENERAL' ? '—' : (item.piecesCount || '—')}</td>` : ''}
        <td style="padding: ${isA5 ? '4px 2px' : '6px 4px'};">${CeramicMath.formatCurrency(item.unitPrice)}</td>
        ${settings.invoiceShowLineDiscount ? `<td style="padding: ${isA5 ? '4px 2px' : '6px 4px'}; color: ${item.discountAmount > 0 ? '#dc2626' : '#cbd5e1'};">${item.discountAmount > 0 ? CeramicMath.formatCurrency(item.discountAmount) : '—'}</td>` : ''}
        <td style="padding: ${isA5 ? '4px 2px' : '6px 4px'}; font-weight: 800; color: #0284c7;">${CeramicMath.formatCurrency(item.totalPrice)}</td>
      </tr>
    `).join('');

  const totalItems = invoice.items.length;
  const totalBoxes = invoice.items.reduce((sum: number, it: any) => sum + (it.boxesCount || 0), 0);
  const totalPieces = invoice.items.reduce((sum: number, it: any) => sum + (it.piecesCount || 0), 0);
  const totalQty = invoice.items.reduce((sum: number, it: any) => sum + (it.quantityM2 || it.quantity || 0), 0);

  return `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>فاتورة تفصيلية ${esc(invoice.invoiceNumber)}</title>
          <style>
            @page { size: ${isA5 ? 'A5 landscape' : 'A4'}; margin: ${isA5 ? '6mm' : '10mm'}; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Cairo', 'Segoe UI', Tahoma, system-ui, sans-serif; padding: ${isA5 ? '8px' : '18px'}; color: #0f172a; font-size: ${isA5 ? '10px' : '12px'}; line-height: 1.45; }
            .header-panel { display: flex; justify-content: space-between; align-items: center; border: 2px solid #0369a1; border-radius: 8px; padding: ${isA5 ? '8px 12px' : '12px 18px'}; margin-bottom: ${isA5 ? '8px' : '12px'}; background: #f0f9ff; }
            .brand-block { display: flex; align-items: center; gap: ${isA5 ? '8px' : '12px'}; }
            .showroom-title { font-size: ${isA5 ? '16px' : '20px'}; font-weight: 900; color: #0369a1; }
            .meta-table { width: 100%; border-collapse: collapse; margin-bottom: ${isA5 ? '8px' : '12px'}; font-size: ${isA5 ? '10px' : '11px'}; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
            .meta-table td { padding: ${isA5 ? '4px 6px' : '5px 8px'}; border: 1px solid #e2e8f0; }
            .meta-table strong { color: #334155; }
            table.items-table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; }
            table.items-table th { background: #e0f2fe; border: 1px solid #cbd5e1; padding: ${isA5 ? '5px 2px' : '7px 4px'}; font-weight: 800; color: #0369a1; font-size: ${isA5 ? '9px' : '10px'}; }
            table.items-table td { border: 1px solid #e2e8f0; }
            .items-totals-bar { display: flex; justify-content: space-around; background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 4px; padding: ${isA5 ? '3px' : '5px'}; margin-top: ${isA5 ? '4px' : '6px'}; font-size: ${isA5 ? '9px' : '10px'}; color: #0369a1; font-weight: 700; }
            .bottom-section { display: flex; justify-content: space-between; align-items: flex-start; margin-top: ${isA5 ? '8px' : '12px'}; gap: ${isA5 ? '10px' : '16px'}; }
            .terms-box { flex: 1; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: ${isA5 ? '6px 8px' : '8px 12px'}; font-size: ${isA5 ? '9px' : '10px'}; color: #92400e; }
            .totals-box { width: ${isA5 ? '250px' : '300px'}; background: #f8fafc; border: 2px solid #0369a1; border-radius: 8px; padding: ${isA5 ? '8px 10px' : '10px 14px'}; }
            .tot-row { display: flex; justify-content: space-between; padding: ${isA5 ? '2px 0' : '3px 0'}; font-size: ${isA5 ? '10px' : '11px'}; }
            .grand-tot { border-top: 2px solid #0369a1; margin-top: 6px; padding-top: 6px; font-size: ${isA5 ? '13px' : '15px'}; font-weight: 900; color: #0369a1; }
            .tafqeet-detailed { background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 6px; padding: ${isA5 ? '4px 8px' : '6px 12px'}; margin-top: ${isA5 ? '8px' : '12px'}; text-align: center; }
            .tafqeet-label { font-size: ${isA5 ? '9px' : '10px'}; color: #0369a1; font-weight: 700; }
            .tafqeet-value { font-size: ${isA5 ? '11px' : '13px'}; font-weight: 800; color: #0c4a6e; }
            .signatures-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: ${isA5 ? '16px' : '30px'}; margin-top: ${isA5 ? '18px' : '30px'}; text-align: center; font-size: ${isA5 ? '10px' : '11px'}; color: #475569; }
            .signatures-grid div { border-top: 1px dashed #94a3b8; padding-top: 6px; }
            .footer-detailed { margin-top: ${isA5 ? '8px' : '14px'}; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 6px; font-size: ${isA5 ? '9px' : '10px'}; color: #64748b; white-space: pre-line; }
            ${invoiceBrandStyles(settings)}
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header-panel">
            <div class="brand-block">
              ${logoHtml(settings, isA5 ? 40 : 52)}
              <div>
                <div class="showroom-title">${esc(settings.showroomName || 'معرض السيراميك والبورسلين')}</div>
                <div style="font-weight: 600; color: #475569;">${esc(settings.tagline || '')}</div>
                <div style="font-size: ${isA5 ? '9px' : '10px'}; color: #64748b; margin-top: 2px;">
                  العنوان: ${esc(settings.address || '-')} | هاتف: ${esc(settings.phone || '-')}
                  ${settings.taxNumber ? ` | ض: ${esc(settings.taxNumber)}` : ''}
                  ${settings.commercialRecord ? ` | س.ت: ${esc(settings.commercialRecord)}` : ''}
                </div>
              </div>
            </div>
            <div style="text-align: left; min-width: ${isA5 ? '130px' : '180px'};">
              <div style="font-size: ${isA5 ? '10px' : '11px'}; font-weight: 800; background: #0369a1; color: white; padding: 3px 10px; border-radius: 4px; display: inline-block;">فاتورة مبيعات تفصيلية</div>
              <div style="font-size: ${isA5 ? '13px' : '16px'}; font-weight: 900; font-family: 'Courier New', monospace; color: #0f172a; margin-top: 4px; letter-spacing: 0.5px;">${esc(invoice.invoiceNumber)}</div>
              <div style="font-size: ${isA5 ? '9px' : '10px'}; color: #64748b;">تاريخ التحرير: ${esc(invoice.date)}</div>
              ${(invoice as any).dueDate && (invoice as any).dueDate !== invoice.date ? `<div style="font-size: ${isA5 ? '9px' : '10px'}; color: #92400e;">الاستحقاق: ${esc((invoice as any).dueDate)}</div>` : ''}
              <div style="margin-top: 3px;">${paymentBadge(invoice, isA5)}</div>
            </div>
          </div>

          <table class="meta-table">
            <tr>
              <td><strong>اسم العميل:</strong> ${esc(invoice.customerName || 'عميل نقدي')}</td>
              <td><strong>رقم الهاتف:</strong> ${esc(invoice.customerPhone || '-')}</td>
              <td><strong>مستودع الصرف:</strong> ${esc(invoice.warehouseName || 'المستودع الرئيسي')}</td>
            </tr>
            <tr>
              <td><strong>الرقم الضريبي:</strong> ${esc(settings.taxNumber || 'غير مسجل')}</td>
              <td><strong>السجل التجاري:</strong> ${esc(settings.commercialRecord || 'غير مسجل')}</td>
              <td><strong>طريقة السداد:</strong> ${paymentTypeLabel(invoice.paymentType)}</td>
            </tr>
          </table>

          <table class="items-table">
            <thead>
              <tr style="text-align: center;">
                <th style="width: 22px;">#</th>
                <th style="text-align: right;">الصنف والبيان</th>
                ${settings.invoiceShowItemCode ? '<th>الكود</th>' : ''}
                ${settings.invoiceShowItemSpecs ? '<th>المقاس</th><th>الفرز</th>' : ''}
                <th>الكمية</th>
                ${settings.invoiceShowBoxesCount ? '<th>الكراتين</th><th>القطع</th>' : ''}
                <th>السعر</th>
                ${settings.invoiceShowLineDiscount ? '<th>الخصم</th>' : ''}
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="items-totals-bar">
            <span>البنود: ${totalItems}</span>
            <span>إجمالي الكمية: ${formatProductQuantity(totalQty, invoice.items[0])}</span>
            <span>إجمالي الكراتين: ${totalBoxes}</span>
            <span>إجمالي القطع: ${totalPieces}</span>
          </div>

          <div class="bottom-section">
            <div class="terms-box">
              <div style="font-weight: 800; margin-bottom: 3px;">شروط الاستلام ومطابقة السيراميك:</div>
              <div>• يُرجى فحص الفرز ورقم الصبغة (Tone) ومقاس البلاط قبل التركيب، حيث لا يُقبل الاسترجاع بعد التركيب نهائياً.</div>
              <div>• الاسترجاع والاستبدال خلال 14 يوماً من تاريخ الفاتورة مع ضرورة سلامة الكراتين الأصلية وعدم فتحها.</div>
              <div>• الكميات المباعة بأقل من كرتونة كاملة لا تسترجع.</div>
              ${orderedInvoiceDetails(invoice, settings, isA5)}
              ${settings.receiptFooter ? `<div style="margin-top: 4px; border-top: 1px dashed #fde68a; padding-top: 3px;">${esc(settings.receiptFooter)}</div>` : ''}
            </div>

            <div class="totals-box">
              <div class="tot-row"><span>إجمالي البنود:</span> <span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
              ${invoice.discountAmount > 0 ? `<div class="tot-row" style="color: #dc2626;"><span>خصم الفاتورة:</span> <span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
              ${invoice.taxAmount > 0 ? `<div class="tot-row"><span>الضريبة (${esc(invoice.taxPercentage)}%):</span> <span>+${CeramicMath.formatCurrency(invoice.taxAmount)}</span></div>` : ''}
              ${invoice.shippingCost > 0 ? `<div class="tot-row"><span>المشال والنقل:</span> <span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
              ${Number(invoice.extraFees || 0) > 0 ? `<div class="tot-row"><span>مصاريف إضافية:</span> <span>+${CeramicMath.formatCurrency(Number(invoice.extraFees))}</span></div>` : ''}
              <div class="tot-row grand-tot"><span>صافي القيمة:</span> <span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span></div>
              <div class="tot-row" style="color: #16a34a; font-weight: 700;"><span>المبلغ المسدد:</span> <span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
              ${invoice.remainingAmount > 0 ? `<div class="tot-row" style="color: #dc2626; font-weight: 700;"><span>المتبقي (آجل):</span> <span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
              ${taxBreakdownHtml(invoice, isA5)}
            </div>
          </div>

          <div class="tafqeet-detailed">
            <span class="tafqeet-label">المبلغ الإجمالي بالحروف (تفقيط):</span>
            <span class="tafqeet-value"> فقط ${tafqeet(invoice.totalAmount)} ${esc(currency)} لا غير</span>
          </div>

          <div class="signatures-grid">
            <div>البائع / أمين المستودع</div>
            <div>توقيع المستلم بالمعاينة والموافقة</div>
            <div>اعتماد مسؤول المبيعات</div>
          </div>

          <div class="footer-detailed">${esc(documentFooter)}</div>

        </body>
      </html>
    `;
}
