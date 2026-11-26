import type { SalesInvoice, SystemSettings } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../../../../utils/products/productUnits';
import {
  esc,
  invoiceBrandStyles,
  itemSerialsHtml,
  orderedInvoiceDetails,
  paymentBadge,
  paymentTypeLabel,
  printOverride,
  tafqeet,
  taxBreakdownHtml,
} from '../invoiceHtmlHelpers';

/**
 * Modern Invoice Template:
 * Contemporary styling with vibrant gradients, rounded card blocks,
 * logo, tafqeet, payment badges, delivery info, and signatures.
 */
export function getModernInvoiceHtml(
  invoice: SalesInvoice & { items: any[] },
  settings: SystemSettings,
  size: 'a4' | 'a5',
): string {
  const isA5 = size === 'a5';
  const documentFooter = printOverride('sales.invoice.a4.footer', settings.receiptFooter || '');
  const currency = settings.currencySymbol || settings.currency || 'ج.م';

  const itemsHtml = invoice.items.map((item, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9; text-align: center; ${idx % 2 === 1 ? 'background-color: #fafbfc;' : ''}">
        <td style="padding: ${isA5 ? '5px 3px' : '8px 6px'}; font-weight: bold; color: #64748b;">${idx + 1}</td>
        <td style="padding: ${isA5 ? '5px 6px' : '8px 10px'}; text-align: right;">
          <div style="font-weight: 700; color: #0f172a;">${esc(item.productName)}</div>
          ${itemSerialsHtml(item)}
          ${settings.invoiceShowItemCode || settings.invoiceShowItemSpecs ? `<div style="font-size: ${isA5 ? '9px' : '10px'}; color: #64748b; margin-top: 2px; display: flex; gap: 4px; flex-wrap: wrap;">
            ${settings.invoiceShowItemCode && item.productSku ? `<span style="background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-family: monospace;">${esc(item.productSku)}</span>` : ''}
            ${settings.invoiceShowItemSpecs && item.size && item.size !== '—' ? `<span style="background: #f1f5f9; padding: 1px 5px; border-radius: 4px;">${esc(item.size)}</span>` : ''}
            ${settings.invoiceShowItemSpecs && item.productGrade ? `<span style="background: ${item.productGrade === 'GRADE_1' ? '#dcfce7' : '#fef3c7'}; padding: 1px 5px; border-radius: 4px; color: ${item.productGrade === 'GRADE_1' ? '#15803d' : '#92400e'};">${item.productGrade === 'GRADE_1' ? 'فرز أول' : 'فرز تجاري'}</span>` : ''}
          </div>` : ''}
        </td>
        <td style="padding: ${isA5 ? '5px 3px' : '8px 6px'}; color: #475569;">${getProductUnitLabel(item)}</td>
        <td style="padding: ${isA5 ? '5px 3px' : '8px 6px'}; font-weight: 700; color: #0f172a;">
          ${formatProductQuantity(item.quantityM2, item)}
          ${settings.invoiceShowBoxesCount && item.productType !== 'GENERAL' ? `<div style="font-size: ${isA5 ? '9px' : '10px'}; color: #64748b; font-weight: normal;">${item.boxesCount} كرتونة${item.piecesCount ? ` · ${item.piecesCount} قطعة` : ''}</div>` : ''}
        </td>
        <td style="padding: ${isA5 ? '5px 3px' : '8px 6px'}; font-weight: 600;">${CeramicMath.formatCurrency(item.unitPrice)}</td>
        ${settings.invoiceShowLineDiscount ? `<td style="padding: ${isA5 ? '5px 3px' : '8px 6px'}; color: ${item.discountAmount > 0 ? '#e11d48' : '#94a3b8'};">${item.discountAmount > 0 ? `-${CeramicMath.formatCurrency(item.discountAmount)}` : '—'}</td>` : ''}
        <td style="padding: ${isA5 ? '5px 3px' : '8px 6px'}; font-weight: 800; color: #0369a1;">${CeramicMath.formatCurrency(item.totalPrice)}</td>
      </tr>
    `).join('');

  const totalItems = invoice.items.length;
  const totalBoxes = invoice.items.reduce((sum: number, it: any) => sum + (it.boxesCount || 0), 0);

  return `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>فاتورة ${esc(invoice.invoiceNumber)}</title>
          <style>
            @page { size: ${isA5 ? 'A5' : 'A4'}; margin: ${isA5 ? '8mm' : '12mm'}; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Cairo', 'Segoe UI', Tahoma, system-ui, sans-serif; padding: ${isA5 ? '10px' : '22px'}; color: #0f172a; font-size: ${isA5 ? '11px' : '13px'}; line-height: 1.5; }
            .hero-header { display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: ${isA5 ? '12px 16px' : '18px 24px'}; border-radius: 12px; margin-bottom: ${isA5 ? '10px' : '16px'}; }
            .brand-block { display: flex; align-items: center; gap: ${isA5 ? '10px' : '14px'}; }
            .brand-title { font-size: ${isA5 ? '17px' : '22px'}; font-weight: 900; color: #38bdf8; letter-spacing: -0.5px; }
            .brand-sub { font-size: ${isA5 ? '10px' : '11px'}; color: #94a3b8; }
            .legal-line { font-size: ${isA5 ? '9px' : '10px'}; color: #cbd5e1; margin-top: 3px; }
            .invoice-tag { text-align: left; min-width: ${isA5 ? '120px' : '160px'}; }
            .pill { display: inline-block; padding: 4px 12px; border-radius: 9999px; background: #0284c7; color: white; font-weight: 800; font-size: ${isA5 ? '10px' : '12px'}; }
            .inv-no-modern { font-size: ${isA5 ? '14px' : '17px'}; font-weight: 900; margin-top: 6px; font-family: 'Courier New', monospace; letter-spacing: 0.5px; }
            .cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: ${isA5 ? '8px' : '12px'}; margin-bottom: ${isA5 ? '10px' : '16px'}; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: ${isA5 ? '8px 10px' : '12px 16px'}; font-size: ${isA5 ? '10px' : '12px'}; }
            .card-title { font-weight: 800; color: #0369a1; margin-bottom: 4px; font-size: ${isA5 ? '10px' : '12px'}; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
            table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
            th { background: #f1f5f9; padding: ${isA5 ? '6px 3px' : '9px 6px'}; font-weight: 800; color: #334155; font-size: ${isA5 ? '10px' : '11px'}; border-bottom: 2px solid #cbd5e1; }
            .items-summary { display: flex; justify-content: center; gap: ${isA5 ? '16px' : '24px'}; background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); border-radius: 8px; padding: ${isA5 ? '5px' : '7px'}; margin-top: ${isA5 ? '6px' : '8px'}; font-size: ${isA5 ? '9px' : '11px'}; color: #475569; }
            .summary-section { display: flex; justify-content: space-between; align-items: flex-start; margin-top: ${isA5 ? '10px' : '16px'}; gap: ${isA5 ? '10px' : '16px'}; }
            .payment-notes { flex: 1; max-width: 48%; }
            .summary-card { width: ${isA5 ? '250px' : '320px'}; background: #ffffff; border: 2px solid #e2e8f0; border-radius: 12px; padding: ${isA5 ? '10px' : '14px'}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
            .sum-row { display: flex; justify-content: space-between; padding: ${isA5 ? '3px 0' : '4px 0'}; font-size: ${isA5 ? '10px' : '12px'}; }
            .grand-sum { background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: white; padding: ${isA5 ? '6px 10px' : '8px 12px'}; border-radius: 8px; margin-top: 8px; font-size: ${isA5 ? '13px' : '15px'}; font-weight: 800; display: flex; justify-content: space-between; }
            .tafqeet-modern { background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%); border-radius: 8px; padding: ${isA5 ? '5px 10px' : '8px 14px'}; margin-top: ${isA5 ? '8px' : '12px'}; text-align: center; }
            .tafqeet-label { font-size: ${isA5 ? '9px' : '10px'}; color: #0369a1; font-weight: 700; }
            .tafqeet-value { font-size: ${isA5 ? '11px' : '13px'}; font-weight: 800; color: #0c4a6e; margin-top: 1px; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: ${isA5 ? '16px' : '30px'}; margin-top: ${isA5 ? '20px' : '36px'}; text-align: center; font-size: ${isA5 ? '10px' : '11px'}; color: #475569; }
            .signatures div { border-top: 1px dashed #94a3b8; padding-top: 6px; }
            .footer-modern { margin-top: ${isA5 ? '12px' : '20px'}; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; color: #64748b; font-size: ${isA5 ? '9px' : '10px'}; white-space: pre-line; }
            ${invoiceBrandStyles(settings)}
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="hero-header">
            <div class="brand-block">
              ${settings.invoiceShowBrandLogo !== false && settings.brandLogoDataUrl ? `<img src="${settings.brandLogoDataUrl}" style="width:${isA5 ? '40px' : '52px'};height:${isA5 ? '40px' : '52px'};object-fit:contain;border-radius:8px;border:2px solid rgba(255,255,255,0.2);" alt="شعار">` : ''}
              <div>
                <div class="brand-title">${esc(settings.showroomName || 'معرض السيراميك')}</div>
                <div class="brand-sub">${esc(settings.tagline || '')}</div>
                <div class="legal-line">
                  ${esc(settings.address || '')} • هاتف: ${esc(settings.phone || '')}
                  ${settings.taxNumber ? ` • ض: ${esc(settings.taxNumber)}` : ''}
                  ${settings.commercialRecord ? ` • س.ت: ${esc(settings.commercialRecord)}` : ''}
                </div>
              </div>
            </div>
            <div class="invoice-tag">
              <span class="pill">فاتورة مبيعات معتمدة</span>
              <div class="inv-no-modern">${esc(invoice.invoiceNumber)}</div>
              <div style="font-size: ${isA5 ? '10px' : '11px'}; color: #94a3b8;">${esc(invoice.date)}</div>
              ${(invoice as any).dueDate && (invoice as any).dueDate !== invoice.date ? `<div style="font-size: ${isA5 ? '9px' : '10px'}; color: #fbbf24;">الاستحقاق: ${esc((invoice as any).dueDate)}</div>` : ''}
              <div style="margin-top: 4px;">${paymentBadge(invoice, isA5)}</div>
            </div>
          </div>

          <div class="cards-grid">
            <div class="card">
              <div class="card-title">بيانات العميل</div>
              <div><strong>الاسم:</strong> ${esc(invoice.customerName || 'عميل نقدي')}</div>
              <div><strong>الهاتف:</strong> ${esc(invoice.customerPhone || '-')}</div>
              <div><strong>طريقة السداد:</strong> <span style="background: #e0f2fe; color: #0369a1; padding: 1px 6px; border-radius: 4px; font-weight: bold;">${paymentTypeLabel(invoice.paymentType)}</span></div>
            </div>
            <div class="card">
              <div class="card-title">بيانات الصرف والمعرض</div>
              <div><strong>المستودع:</strong> ${esc(invoice.warehouseName || 'المستودع الرئيسي')}</div>
              <div><strong>الرقم الضريبي:</strong> ${esc(settings.taxNumber || 'غير محدد')}</div>
              ${settings.commercialRecord ? `<div><strong>السجل التجاري:</strong> ${esc(settings.commercialRecord)}</div>` : ''}
            </div>
          </div>

          <table>
            <thead>
              <tr style="text-align: center;">
                <th style="width: 28px;">#</th>
                <th style="text-align: right;">الصنف والمواصفات</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                ${settings.invoiceShowLineDiscount ? '<th>الخصم</th>' : ''}
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="items-summary">
            <span>عدد البنود: <strong>${totalItems}</strong></span>
            <span>إجمالي الكراتين: <strong>${totalBoxes}</strong></span>
          </div>

          <div class="summary-section">
            <div class="payment-notes">
              ${orderedInvoiceDetails(invoice, settings, isA5)}
            </div>
            <div class="summary-card">
              <div class="sum-row"><span>المجموع الفرعي</span> <span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
              ${invoice.discountAmount > 0 ? `<div class="sum-row" style="color: #e11d48;"><span>خصم الفاتورة</span> <span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
              ${invoice.taxAmount > 0 ? `<div class="sum-row"><span>ضريبة القيمة المضافة (${esc(invoice.taxPercentage)}%)</span> <span>+${CeramicMath.formatCurrency(invoice.taxAmount)}</span></div>` : ''}
              ${invoice.shippingCost > 0 ? `<div class="sum-row"><span>مصاريف النقل والمشال</span> <span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
              ${Number(invoice.extraFees || 0) > 0 ? `<div class="sum-row"><span>مصاريف إضافية</span> <span>+${CeramicMath.formatCurrency(Number(invoice.extraFees))}</span></div>` : ''}
              <div class="grand-sum"><span>صافي الفاتورة</span> <span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span></div>
              <div class="sum-row" style="margin-top: 6px; font-weight: 700; color: #16a34a;"><span>المبلغ المسدد</span> <span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
              ${invoice.remainingAmount > 0 ? `<div class="sum-row" style="font-weight: 700; color: #e11d48;"><span>المتبقي (آجل)</span> <span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
              ${taxBreakdownHtml(invoice, isA5)}
            </div>
          </div>

          <div class="tafqeet-modern">
            <div class="tafqeet-label">المبلغ الإجمالي بالحروف (تفقيط)</div>
            <div class="tafqeet-value">فقط ${tafqeet(invoice.totalAmount)} ${esc(currency)} لا غير</div>
          </div>

          <div class="signatures">
            <div>البائع / المحاسب</div>
            <div>توقيع العميل بالاستلام</div>
            <div>اعتماد مسؤول المبيعات</div>
          </div>

          <div class="footer-modern">
            ${esc(documentFooter)}
          </div>

        </body>
      </html>
    `;
}
