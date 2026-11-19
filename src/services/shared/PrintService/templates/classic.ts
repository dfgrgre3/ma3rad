import type { SalesInvoice, SystemSettings } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../../../../utils/products/productUnits';
import {
  esc,
  invoiceBrandStyles,
  logoHtml,
  orderedInvoiceDetails,
  paymentBadge,
  paymentTypeLabel,
  printOverride,
  tafqeet,
  taxBreakdownHtml,
} from '../invoiceHtmlHelpers';

/**
 * Classic Invoice Template:
 * Formal corporate layout with branding, logo, tax/commercial info,
 * amount in words (tafqeet), payment badge, signatures, and delivery notes.
 */
export function getClassicInvoiceHtml(
  invoice: SalesInvoice & { items: any[] },
  settings: SystemSettings,
  size: 'a4' | 'a5',
): string {
  const isA5 = size === 'a5';
  const documentTitle = printOverride('sales.invoice.a4', isA5 ? 'فاتورة مبيعات A5' : 'فاتورة مبيعات');
  const documentFooter = printOverride('sales.invoice.a4.footer', settings.receiptFooter || '');
  const currency = settings.currency || 'ر.س';

  const itemsHtml = invoice.items.map((item, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; text-align: center;${idx % 2 === 1 ? ' background:#fafbfc;' : ''}">
        <td style="padding: ${isA5 ? '5px 3px' : '7px 6px'}; color: #64748b; font-weight: 600;">${idx + 1}</td>
        <td style="padding: ${isA5 ? '5px 6px' : '7px 8px'}; text-align: right;">
          <div style="font-weight: 700; color: #0f172a;">${esc(item.productName)}</div>
          ${(settings.invoiceShowItemCode !== false || settings.invoiceShowItemSpecs !== false) ? `
          <div style="font-size: ${isA5 ? '9px' : '10px'}; color: #64748b; margin-top: 1px;">
            ${settings.invoiceShowItemCode !== false ? `كود: <span style="font-family:monospace;background:#f1f5f9;padding:1px 4px;border-radius:3px;">${esc(item.productSku)}</span>` : ''}
            ${settings.invoiceShowItemSpecs !== false && item.size && item.size !== '—' ? ` · مقاس: ${esc(item.size)}` : ''}
            ${settings.invoiceShowItemSpecs !== false && item.productGrade ? ` · ${item.productGrade === 'GRADE_1' ? 'فرز أول' : 'فرز تجاري/ثاني'}` : ''}
          </div>` : ''}
        </td>
        <td style="padding: ${isA5 ? '5px 3px' : '7px 6px'}; font-size: ${isA5 ? '10px' : '11px'};">${getProductUnitLabel(item)}</td>
        <td style="padding: ${isA5 ? '5px 3px' : '7px 6px'}; font-weight: 700;">
          ${formatProductQuantity(item.quantityM2, item)}
          ${settings.invoiceShowBoxesCount !== false && item.productType !== 'GENERAL' ? `<div style="font-size:${isA5 ? '8px' : '10px'};color:#64748b;font-weight:normal;">${item.boxesCount} كرتونة${item.piecesCount ? ` (${item.piecesCount} قطعة)` : ''}</div>` : ''}
        </td>
        <td style="padding: ${isA5 ? '5px 3px' : '7px 6px'};">${CeramicMath.formatCurrency(item.unitPrice)}</td>
        ${settings.invoiceShowLineDiscount !== false ? `<td style="padding: ${isA5 ? '5px 3px' : '7px 6px'}; color: ${item.discountAmount > 0 ? '#dc2626' : '#cbd5e1'};">${item.discountAmount > 0 ? CeramicMath.formatCurrency(item.discountAmount) : '—'}</td>` : ''}
        <td style="padding: ${isA5 ? '5px 3px' : '7px 6px'}; font-weight: 700; color: #0369a1;">${CeramicMath.formatCurrency(item.totalPrice)}</td>
      </tr>
    `).join('');

  const totalItems = invoice.items.length;
  const totalBoxes = invoice.items.reduce((sum: number, it: any) => sum + (it.boxesCount || 0), 0);
  const totalQty = invoice.items.reduce((sum: number, it: any) => sum + (it.quantityM2 || it.quantity || 0), 0);

  return `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>${esc(documentTitle)} ${esc(invoice.invoiceNumber)}</title>
          <style>
            @page { size: ${isA5 ? 'A5' : 'A4'}; margin: ${isA5 ? '8mm' : '12mm'}; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Cairo', 'Segoe UI', Tahoma, system-ui, sans-serif; padding: ${isA5 ? '10px' : '20px'}; color: #0f172a; font-size: ${isA5 ? '11px' : '13px'}; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: ${isA5 ? '8px' : '14px'}; margin-bottom: ${isA5 ? '8px' : '14px'}; border-bottom: 3px solid #0284c7; }
            .brand-block { display: flex; align-items: flex-start; gap: ${isA5 ? '8px' : '12px'}; }
            .showroom-title { font-size: ${isA5 ? '16px' : '20px'}; font-weight: 900; color: #0369a1; letter-spacing: -0.3px; }
            .tagline { color: #64748b; font-size: ${isA5 ? '10px' : '11px'}; }
            .legal-info { font-size: ${isA5 ? '9px' : '10px'}; color: #475569; margin-top: 3px; }
            .badge { display: inline-block; padding: ${isA5 ? '3px 7px' : '4px 10px'}; border-radius: 4px; background: #e0f2fe; color: #0369a1; font-weight: 800; font-size: ${isA5 ? '10px' : '12px'}; }
            .inv-no { font-size: ${isA5 ? '13px' : '16px'}; font-weight: 900; margin-top: 5px; font-family: 'Courier New', monospace; color: #0f172a; letter-spacing: 0.5px; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: ${isA5 ? '6px' : '8px'}; margin-bottom: ${isA5 ? '8px' : '14px'}; }
            .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: ${isA5 ? '6px 8px' : '10px 12px'}; font-size: ${isA5 ? '10px' : '12px'}; }
            .meta-card-title { font-weight: 800; color: #0369a1; font-size: ${isA5 ? '10px' : '11px'}; margin-bottom: 2px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
            table { width: 100%; border-collapse: collapse; margin-top: ${isA5 ? '6px' : '10px'}; }
            table.bordered th, table.bordered td { border: 1px solid #cbd5e1; }
            table.striped tr:nth-child(even) { background-color: #f8fafc; }
            table.minimal th, table.minimal td { border-bottom: 1px solid #e2e8f0; border-left: none; border-right: none; }
            thead th { background-color: #f1f5f9; padding: ${isA5 ? '6px 3px' : '8px 6px'}; border-bottom: 2px solid #cbd5e1; font-weight: 800; font-size: ${isA5 ? '10px' : '11px'}; color: #334155; }
            .items-summary { display: flex; justify-content: space-around; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: ${isA5 ? '4px 6px' : '6px 10px'}; margin-top: ${isA5 ? '4px' : '6px'}; font-size: ${isA5 ? '9px' : '11px'}; color: #475569; }
            .bottom-section { display: flex; justify-content: space-between; align-items: flex-start; margin-top: ${isA5 ? '10px' : '16px'}; gap: ${isA5 ? '10px' : '16px'}; }
            .payment-notes { flex: 1; max-width: 48%; font-size: ${isA5 ? '10px' : '12px'}; }
            .totals-box { width: ${isA5 ? '240px' : '300px'}; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: ${isA5 ? '8px 10px' : '12px 14px'}; }
            .total-row { display: flex; justify-content: space-between; padding: ${isA5 ? '2px 0' : '3px 0'}; font-size: ${isA5 ? '10px' : '12px'}; }
            .grand-total { font-size: ${isA5 ? '13px' : '16px'}; font-weight: 900; color: #0369a1; border-top: 2px solid #0284c7; margin-top: 6px; padding-top: 6px; }
            .tafqeet-box { background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 6px; padding: ${isA5 ? '5px 8px' : '8px 12px'}; margin-top: ${isA5 ? '8px' : '12px'}; text-align: center; }
            .tafqeet-label { font-size: ${isA5 ? '9px' : '10px'}; color: #0369a1; font-weight: 700; }
            .tafqeet-value { font-size: ${isA5 ? '11px' : '13px'}; font-weight: 800; color: #0c4a6e; margin-top: 2px; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: ${isA5 ? '16px' : '30px'}; margin-top: ${isA5 ? '20px' : '36px'}; text-align: center; font-size: ${isA5 ? '10px' : '11px'}; color: #475569; }
            .signatures div { border-top: 1px dashed #94a3b8; padding-top: 6px; }
            .footer { margin-top: ${isA5 ? '12px' : '20px'}; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 8px; font-size: ${isA5 ? '9px' : '10px'}; color: #64748b; white-space: pre-line; }
            ${invoiceBrandStyles(settings)}
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand-block">
              ${logoHtml(settings, isA5 ? 42 : 56)}
              <div>
                <div class="showroom-title">${esc(settings.showroomName || 'معرض النخبة')}</div>
                <div class="tagline">${esc(settings.tagline || '')}</div>
                <div class="legal-info">
                  ${esc(settings.address || '-')} · هاتف: ${esc(settings.phone || '-')}
                  ${settings.commercialRecord ? `<br>السجل التجاري: ${esc(settings.commercialRecord)}` : ''}
                  ${settings.taxNumber ? ` · الرقم الضريبي: ${esc(settings.taxNumber)}` : ''}
                </div>
              </div>
            </div>
            <div style="text-align: left; min-width: ${isA5 ? '120px' : '160px'};">
              <div class="badge">${esc(documentTitle)}</div>
              <div class="inv-no">${esc(invoice.invoiceNumber)}</div>
              <div style="font-size: ${isA5 ? '10px' : '11px'}; color: #475569; margin-top: 2px;">التاريخ: ${esc(invoice.date)}</div>
              ${(invoice as any).dueDate && (invoice as any).dueDate !== invoice.date ? `<div style="font-size: ${isA5 ? '9px' : '10px'}; color: #92400e;">الاستحقاق: ${esc((invoice as any).dueDate)}</div>` : ''}
              <div style="margin-top: 4px;">${paymentBadge(invoice, isA5)}</div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-card">
              <div class="meta-card-title">بيانات العميل</div>
              <div><strong>الاسم:</strong> ${esc(invoice.customerName || 'عميل نقدي')}</div>
              <div><strong>الهاتف:</strong> ${esc(invoice.customerPhone || '-')}</div>
            </div>
            <div class="meta-card">
              <div class="meta-card-title">بيانات الصرف</div>
              <div><strong>المخزن:</strong> ${esc(invoice.warehouseName || 'المعرض الرئيسي')}</div>
              <div><strong>طريقة الدفع:</strong> ${paymentTypeLabel(invoice.paymentType)}</div>
            </div>
          </div>

          <table class="items-main-table ${settings.invoiceTableStyle || 'bordered'}">
            <thead>
              <tr style="text-align: center;">
                <th style="width: 28px;">#</th>
                <th style="text-align: right;">الصنف والبيان</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                ${settings.invoiceShowLineDiscount !== false ? '<th>الخصم</th>' : ''}
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          ${settings.invoiceShowTableSummary !== false ? `
          <div class="items-summary">
            <span>عدد البنود: <strong>${totalItems}</strong></span>
            <span>إجمالي الكراتين: <strong>${totalBoxes}</strong></span>
            <span>إجمالي الكمية: <strong>${formatProductQuantity(totalQty, invoice.items[0])}</strong></span>
          </div>` : ''}

          <div class="bottom-section">
            <div class="payment-notes">
              ${orderedInvoiceDetails(invoice, settings, isA5)}
            </div>
            <div class="totals-box">
              <div class="total-row"><span>المجموع الفرعي:</span> <span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
              ${invoice.discountAmount > 0 ? `<div class="total-row" style="color: #dc2626;"><span>خصم الفاتورة:</span> <span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
              ${invoice.taxAmount > 0 ? `<div class="total-row"><span>ضريبة القيمة المضافة (${esc(invoice.taxPercentage)}%):</span> <span>+${CeramicMath.formatCurrency(invoice.taxAmount)}</span></div>` : ''}
              ${invoice.shippingCost > 0 ? `<div class="total-row"><span>مصاريف النقل والمشال:</span> <span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
              ${Number(invoice.extraFees || 0) > 0 ? `<div class="total-row"><span>مصاريف إضافية:</span> <span>+${CeramicMath.formatCurrency(Number(invoice.extraFees))}</span></div>` : ''}
              <div class="total-row grand-total"><span>صافي الفاتورة:</span> <span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span></div>
              <div class="total-row" style="color: #16a34a; font-weight: 700; margin-top: 4px;"><span>المبلغ المسدد:</span> <span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
              ${invoice.remainingAmount > 0 ? `<div class="total-row" style="color: #dc2626; font-weight: 700;"><span>المتبقي (آجل):</span> <span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
              ${taxBreakdownHtml(invoice, isA5)}
            </div>
          </div>

          <div class="tafqeet-box">
            <div class="tafqeet-label">المبلغ الإجمالي بالحروف (تفقيط)</div>
            <div class="tafqeet-value">فقط ${tafqeet(invoice.totalAmount)} ${esc(currency)} لا غير</div>
          </div>

          <div class="signatures">
            <div>البائع / المحاسب</div>
            <div>توقيع العميل بالاستلام</div>
            <div>اعتماد مسؤول المبيعات</div>
          </div>

          <div class="footer">
            ${esc(documentFooter)}
          </div>

        </body>
      </html>
    `;
}
