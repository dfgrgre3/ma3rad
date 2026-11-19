import type { SystemSettings } from '../../../types';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { writeAndPrintWindow } from '../../../utils/shared/printWindow';
import { SettingsService } from '../../domains/config/SettingsService';
import { esc, printOverride } from './invoiceHtmlHelpers';

function openDocument(title: string, body: string): void {
  const win = window.open('about:blank', '_blank', 'width=900,height=900');
  if (!win) {
    alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
    return;
  }
  writeAndPrintWindow(win, `<!DOCTYPE html>
      <html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>
        @page { size: A4; margin: 12mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Cairo', Tahoma, 'Segoe UI', sans-serif; color: #0f172a; font-size: 12px; line-height: 1.5; margin: 0; padding: 16px; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 14px; }
        .shop { font-size: 20px; font-weight: 800; color: #0369a1; }
        .muted { color: #64748b; font-size: 11px; white-space: pre-line; }
        .doc-title { font-size: 16px; font-weight: 800; }
        .doc-no { color: #0369a1; font-weight: 700; font-family: monospace; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; }
        .meta b { color: #334155; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f1f5f9; border-bottom: 2px solid #cbd5e1; padding: 8px 6px; font-size: 11px; text-align: center; }
        td { border-bottom: 1px solid #e2e8f0; padding: 7px 6px; text-align: center; }
        td.name { text-align: right; font-weight: 600; }
        .totals { width: 300px; margin-top: 14px; margin-right: auto; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
        .row { display: flex; justify-content: space-between; padding: 3px 0; }
        .grand { border-top: 2px solid #cbd5e1; margin-top: 5px; padding-top: 6px; font-size: 15px; font-weight: 800; color: #0369a1; }
        .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; text-align: center; color: #475569; }
        .sign div { border-top: 1px dashed #cbd5e1; padding-top: 8px; }
        .notes { margin-top: 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px; white-space: pre-line; }
        .footer { margin-top: 26px; border-top: 1px dashed #cbd5e1; padding-top: 10px; text-align: center; color: #64748b; font-size: 10px; white-space: pre-line; }
        @media print { body { padding: 0; } }
      </style></head><body>${body}</body></html>`, false);
}

function header(settings: SystemSettings, title: string, docNo: string, date: string, extra = ''): string {
  return `<div class="head">
      <div>
        <div class="shop">${esc(settings.showroomName)}</div>
        <div class="muted">${esc(settings.tagline)}</div>
        <div class="muted">${esc(settings.address)}${settings.phone ? ' | ت: ' + esc(settings.phone) : ''}</div>
      </div>
      <div style="text-align:left">
        <div class="doc-title">${esc(title)}</div>
        <div class="doc-no">${esc(docNo)}</div>
        <div class="muted">التاريخ: ${esc(date)}</div>
        ${extra ? `<div class="muted">${extra}</div>` : ''}
      </div>
    </div>`;
}

export function printQuotationDocument(quotation: any): void {
  const settings = SettingsService.getSettings();
  const quotationTitle = printOverride('quotation.a4', 'عرض سعر / مقايسة');
  const quotationFooter = printOverride('quotation.a4.footer', settings.receiptFooter || '');
  const productItems = (quotation.items || []).map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td class="name">${esc(item.productName)}${item.size ? ` (${esc(item.size)})` : ''}</td>
        <td>${esc(item.grade)}</td>
        <td>${formatProductQuantity(Number(item.quantityM2 || 0), item)}</td>
        <td>${item.productType === 'GENERAL' ? '—' : Number(item.boxesCount || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.unitPrice || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.totalPrice || 0)}</td>
      </tr>`).join('');
  const serviceItems = (quotation.serviceItems || []).map((item: any, i: number) => `
      <tr>
        <td>${(quotation.items || []).length + i + 1}</td>
        <td class="name">${esc(item.description || 'خدمة / عمالة')}</td>
        <td>خدمة</td>
        <td>${esc(item.quantity || 0)} ${esc(item.unit || 'بند')}</td>
        <td>—</td>
        <td>${CeramicMath.formatCurrency(item.unitPrice || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.totalPrice || 0)}</td>
      </tr>`).join('');
  const items = productItems + serviceItems;
  const itemCount = (quotation.items || []).length + (quotation.serviceItems || []).length;
  const statusLabel = quotation.status === 'CONVERTED' ? 'محوّل إلى فاتورة'
    : quotation.status === 'EXPIRED' ? 'منتهي الصلاحية'
    : quotation.status === 'CANCELLED' ? 'ملغي' : 'بانتظار الموافقة';

  openDocument(`عرض سعر ${quotation.quotationNumber}`, `
      ${header(settings, quotationTitle, quotation.quotationNumber, quotation.date, `صالح لغاية: ${esc(quotation.validUntil)}`)}
      <div class="meta">
        <div><b>العميل:</b> ${esc(quotation.customerName || 'عميل نقدي')}</div>
        <div><b>الهاتف:</b> ${esc(quotation.customerPhone || '-')}</div>
        <div><b>الحالة:</b> ${esc(statusLabel)}</div>
        <div><b>عدد البنود:</b> ${itemCount}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>الصنف والبيان</th><th>الفرز</th><th>الكمية</th><th>الكراتين</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>${items || '<tr><td colspan="7">لا توجد بنود</td></tr>'}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>المجموع الفرعي</span><span>${CeramicMath.formatCurrency(quotation.subtotal || 0)}</span></div>
        <div class="row"><span>الخصم</span><span>-${CeramicMath.formatCurrency(quotation.discountAmount || 0)}</span></div>
        <div class="row"><span>الضريبة</span><span>+${CeramicMath.formatCurrency(quotation.taxAmount || 0)}</span></div>
        <div class="row grand"><span>الإجمالي</span><span>${CeramicMath.formatCurrency(quotation.totalAmount || 0)}</span></div>
      </div>
      ${quotation.notes ? `<div class="notes"><b>ملاحظات وشروط:</b>\n${esc(quotation.notes)}</div>` : ''}
      <div class="sign"><div>توقيع العميل بالقبول</div><div>إدارة المبيعات</div></div>
      <div class="footer">${esc(quotationFooter)}</div>
    `);
}

export function printOrderDocument(order: any): void {
  const settings = SettingsService.getSettings();
  const items = (order.items || []).map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td class="name">${esc(item.productName)}${item.size ? ` (${esc(item.size)})` : ''}</td>
        <td>${esc(item.grade)}</td>
        <td>${formatProductQuantity(Number(item.quantityM2 || 0), item)}</td>
        <td>${item.productType === 'GENERAL' ? '—' : Number(item.boxesCount || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.unitPrice || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.totalPrice || 0)}</td>
      </tr>`).join('');

  openDocument(`طلب ${order.orderNumber}`, `
      ${header(settings, 'طلب حجز بضاعة', order.orderNumber, order.date, order.expectedDeliveryDate ? `التسليم المتوقع: ${esc(order.expectedDeliveryDate)}` : '')}
      <div class="meta">
        <div><b>العميل:</b> ${esc(order.customerName || '-')}</div>
        <div><b>الهاتف:</b> ${esc(order.customerPhone || '-')}</div>
        <div><b>المخزن:</b> ${esc(order.warehouseName || '-')}</div>
        <div><b>الحالة:</b> ${esc(order.status)}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>الصنف والبيان</th><th>الفرز</th><th>الكمية</th><th>الكراتين</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>${items || '<tr><td colspan="7">لا توجد بنود</td></tr>'}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>المجموع الفرعي</span><span>${CeramicMath.formatCurrency(order.subtotal || 0)}</span></div>
        <div class="row"><span>الخصم</span><span>-${CeramicMath.formatCurrency(order.discountAmount || 0)}</span></div>
        <div class="row"><span>مصاريف الشحن</span><span>+${CeramicMath.formatCurrency(order.shippingCost || 0)}</span></div>
        <div class="row grand"><span>الإجمالي</span><span>${CeramicMath.formatCurrency(order.totalAmount || 0)}</span></div>
      </div>
      ${order.notes ? `<div class="notes"><b>ملاحظات:</b>\n${esc(order.notes)}</div>` : ''}
      <div class="sign"><div>توقيع العميل</div><div>إدارة المبيعات</div></div>
      <div class="footer">${esc(settings.receiptFooter)}</div>
    `);
}

export function printSalesReturnDocument(salesReturn: any): void {
  const settings = SettingsService.getSettings();
  const items = (salesReturn.items || []).map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td class="name">${esc(item.productName)}</td>
        <td>${esc(item.grade)}</td>
        <td>${formatProductQuantity(Number(item.quantityM2 || 0), item)}</td>
        <td>${item.productType === 'GENERAL' ? '—' : Number(item.boxesCount || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.unitPrice || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.totalRefund || 0)}</td>
      </tr>`).join('');

  openDocument(`مرتجع ${salesReturn.returnNumber}`, `
      ${header(settings, 'سند مرتجع مبيعات', salesReturn.returnNumber, salesReturn.date, `الفاتورة الأصلية: ${esc(salesReturn.originalInvoiceNumber || '')}`)}
      <div class="meta">
        <div><b>العميل:</b> ${esc(salesReturn.customerName || '-')}</div>
        <div><b>المخزن:</b> ${esc(salesReturn.warehouseName || '-')}</div>
        <div><b>سبب الإرجاع:</b> ${esc(salesReturn.reason || '-')}</div>
        <div><b>عدد البنود:</b> ${(salesReturn.items || []).length}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>الصنف</th><th>الفرز</th><th>الكمية</th><th>الكراتين</th><th>سعر الوحدة</th><th>قيمة الارتجاع</th></tr></thead>
        <tbody>${items || '<tr><td colspan="7">لا توجد بنود</td></tr>'}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>صافي المرتجع قبل الضريبة</span><span>${CeramicMath.formatCurrency(salesReturn.totalAmount || 0)}</span></div>
        <div class="row"><span>ضريبة المرتجع</span><span>${salesReturn.returnTaxAmount == null ? 'غير مسجلة تاريخيًا' : CeramicMath.formatCurrency(salesReturn.returnTaxAmount)}</span></div>
        <div class="row"><span>الإجمالي شامل الضريبة</span><span>${salesReturn.returnTaxAmount == null ? 'غير معلوم تاريخيًا' : CeramicMath.formatCurrency(Number(salesReturn.totalAmount || 0) + Number(salesReturn.returnTaxAmount || 0))}</span></div>
        <div class="row"><span>المسترد نقداً (شامل الضريبة)</span><span>${CeramicMath.formatCurrency(salesReturn.refundedAmount || 0)}</span></div>
        <div class="row grand"><span>المضاف إلى رصيد العميل (شامل الضريبة)</span><span>${CeramicMath.formatCurrency(salesReturn.remainingToBalance || 0)}</span></div>
      </div>
      <div class="sign"><div>توقيع العميل</div><div>إدارة المبيعات</div></div>
      <div class="footer">${esc(settings.receiptFooter)}</div>
    `);
}

export function printPurchaseReturnDocument(purchaseReturn: any): void {
  const settings = SettingsService.getSettings();
  const items = (purchaseReturn.items || []).map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td class="name">${esc(item.productName)}</td>
        <td>${esc(item.grade)}</td>
        <td>${formatProductQuantity(Number(item.quantityM2 || 0), item)}</td>
        <td>${item.productType === 'GENERAL' ? '—' : Number(item.boxesCount || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.unitCost || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.totalRefund || 0)}</td>
      </tr>`).join('');

  const isCash = Number(purchaseReturn.refundedAmount || 0) > 0;

  openDocument(`مرتجع شراء ${purchaseReturn.returnNumber}`, `
      ${header(settings, 'سند مرتجع مشتريات', purchaseReturn.returnNumber, purchaseReturn.date, `الفاتورة الأصلية: ${esc(purchaseReturn.originalInvoiceNumber || '')}`)}
      <div class="meta">
        <div><b>المورد:</b> ${esc(purchaseReturn.supplierName || '-')}</div>
        <div><b>المخزن:</b> ${esc(purchaseReturn.warehouseName || '-')}</div>
        <div><b>سبب الإرجاع:</b> ${esc(purchaseReturn.reason || '-')}</div>
        <div><b>طريقة التسوية:</b> ${isCash ? 'استرداد نقدي من الخزينة' : 'خصم من حساب المورد'}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>الصنف</th><th>الفرز</th><th>الكمية</th><th>الكراتين</th><th>تكلفة الوحدة</th><th>قيمة الارتجاع</th></tr></thead>
        <tbody>${items || '<tr><td colspan="7">لا توجد بنود</td></tr>'}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>إجمالي قيمة المرتجع</span><span>${CeramicMath.formatCurrency(purchaseReturn.totalAmount || 0)}</span></div>
        <div class="row"><span>المسترد نقداً</span><span>${CeramicMath.formatCurrency(purchaseReturn.refundedAmount || 0)}</span></div>
        <div class="row grand"><span>خصم من حساب المورد</span><span>${CeramicMath.formatCurrency(purchaseReturn.remainingToBalance || 0)}</span></div>
      </div>
      <div class="sign"><div>توقيع المورد</div><div>إدارة المشتريات</div></div>
      <div class="footer">${esc(settings.receiptFooter)}</div>
    `);
}
