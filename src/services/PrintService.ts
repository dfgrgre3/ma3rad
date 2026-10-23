import { DatabaseManager } from '../database/db';
import type { SalesInvoice, SystemSettings } from '../types';
import { CeramicMath } from '../utils/ceramicMath';
import { SettingsService } from './SettingsService';

export class PrintService {
  private db = DatabaseManager.getInstance();

  public getSettings(): SystemSettings {
    return SettingsService.getSettings();
  }

  /**
   * Returns the printable A4 invoice document as a standalone HTML string.
   * Used both by the print action and by the in-app document preview modal.
   */
  public getInvoiceHtml(invoice: SalesInvoice & { items: any[] }, autoPrint = false): string {
    const settings = this.getSettings();

    const itemsHtml = invoice.items.map((item, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; text-align: center;">
        <td style="padding: 8px;">${idx + 1}</td>
        <td style="padding: 8px; text-align: right; font-weight: 600;">
          ${item.productName}
          <div style="font-size: 11px; color: #64748b;">كود: ${item.productSku} | مقاس: ${item.size} | فرز: ${item.productGrade === 'GRADE_1' ? 'أول' : 'تجاري/ثاني'}</div>
        </td>
        <td style="padding: 8px;">${item.soldBy === 'BOX' ? 'كرتونة' : 'متر مربع'}</td>
        <td style="padding: 8px; font-weight: 700;">${item.quantityM2} م² <span style="font-size: 11px; color: #64748b;">(${item.boxesCount} كرتونة)</span></td>
        <td style="padding: 8px;">${CeramicMath.formatCurrency(item.unitPrice)}</td>
        <td style="padding: 8px;">${item.discountAmount > 0 ? CeramicMath.formatCurrency(item.discountAmount) : '-'}</td>
        <td style="padding: 8px; font-weight: 700;">${CeramicMath.formatCurrency(item.totalPrice)}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>فاتورة مبيعات ${invoice.invoiceNumber}</title>
          <style>
            body { font-family: 'Cairo', system-ui, sans-serif; margin: 0; padding: 20px; color: #0f172a; font-size: 13px; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 15px; }
            .showroom-title { font-size: 20px; font-weight: 800; color: #0369a1; }
            .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; background: #e0f2fe; color: #0369a1; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background-color: #f1f5f9; padding: 10px 8px; border-bottom: 2px solid #cbd5e1; font-weight: 700; }
            .totals-box { margin-top: 20px; margin-left: auto; width: 300px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
            .total-row { display: flex; justify-content: space-between; padding: 4px 0; }
            .grand-total { font-size: 16px; font-weight: 800; color: #0369a1; border-top: 2px solid #cbd5e1; margin-top: 6px; padding-top: 6px; }
            .footer { margin-top: 30px; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 15px; font-size: 11px; color: #64748b; white-space: pre-line; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="showroom-title">${settings.showroomName}</div>
              <div>${settings.tagline}</div>
              <div>العنوان: ${settings.address} | هاتف: ${settings.phone}</div>
              ${settings.taxNumber ? `<div>س.ت: ${settings.commercialRecord} | ب.ض: ${settings.taxNumber}</div>` : ''}
            </div>
            <div style="text-align: left;">
              <div class="badge">فاتورة مبيعات ضريبية</div>
              <div style="font-size: 14px; font-weight: 700; margin-top: 6px;">رقم: ${invoice.invoiceNumber}</div>
              <div>التاريخ: ${invoice.date}</div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 15px;">
            <div><strong>العميل:</strong> ${invoice.customerName || 'عميل نقدي'} | <strong>الهاتف:</strong> ${invoice.customerPhone || '-'}</div>
            <div><strong>المخزن المنصرف منه:</strong> ${invoice.warehouseName || 'المعرض الرئيسي'}</div>
          </div>

          <table>
            <thead>
              <tr style="text-align: center;">
                <th style="width: 30px;">#</th>
                <th style="text-align: right;">الصنف والبيان</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>الخصم</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="margin-top: 20px; font-size: 12px;">
              <strong>طريقة الدفع:</strong> ${invoice.paymentType === 'CASH' ? 'نقدي كاش' : (invoice.paymentType === 'CARD' ? 'بطاقة بنكية / فيزا' : 'آجل / تقسيط')}<br>
              <strong>ملاحظات:</strong> ${invoice.notes || 'لا يوجد'}
            </div>
            <div class="totals-box">
              <div class="total-row"><span>المجموع الفرعي:</span> <span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
              ${invoice.discountAmount > 0 ? `<div class="total-row" style="color: #dc2626;"><span>خصم الفاتورة:</span> <span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
              ${invoice.shippingCost > 0 ? `<div class="total-row"><span>مشال ونقل:</span> <span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
              <div class="total-row grand-total"><span>صافي الفاتورة:</span> <span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span></div>
              <div class="total-row" style="color: #16a34a; font-weight: 700; margin-top: 4px;"><span>المبلغ المسدد:</span> <span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
              ${invoice.remainingAmount > 0 ? `<div class="total-row" style="color: #dc2626; font-weight: 700;"><span>المتبقي (آجل):</span> <span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
            </div>
          </div>

          <div class="footer">
            ${settings.receiptFooter}
          </div>

          ${autoPrint ? `<script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>` : ''}
        </body>
      </html>
    `;
  }

  public printInvoice(invoice: SalesInvoice & { items: any[] }): void {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة لطباعة الفاتورة');
      return;
    }
    printWindow.document.write(this.getInvoiceHtml(invoice, true));
    printWindow.document.close();
  }

  /**
   * 80mm thermal receipt for point-of-sale checkout. Kept intentionally compact
   * (no table borders, monospace-ish) so it renders correctly on narrow roll paper.
   */
  public printThermalReceipt(invoice: SalesInvoice & { items: any[] }): void {
    const settings = this.getSettings();
    const printWindow = window.open('', '_blank', 'width=380,height=640');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة لطباعة الإيصال');
      return;
    }

    const itemsHtml = invoice.items.map((item) => `
      <div class="item">
        <div class="item-name">${item.productName}</div>
        <div class="item-meta">${item.productSku} | مقاس ${item.size} | ${item.productGrade === 'GRADE_1' ? 'فرز أول' : 'فرز ثاني/تجاري'}</div>
        <div class="item-row">
          <span>${item.quantityM2} م² (${item.boxesCount} كرتونة) × ${item.unitPrice}</span>
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
          <title>إيصال ${invoice.invoiceNumber}</title>
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
          <div class="center shop-name">${settings.showroomName}</div>
          <div class="center muted">${settings.tagline || ''}</div>
          <div class="center muted">${settings.address || ''}${settings.phone ? ' | ت: ' + settings.phone : ''}</div>
          <div class="divider"></div>
          <div class="meta-row"><span>إيصال بيع</span><span>${invoice.invoiceNumber}</span></div>
          <div class="meta-row"><span>التاريخ</span><span>${invoice.date}</span></div>
          <div class="meta-row"><span>العميل</span><span>${invoice.customerName || 'عميل نقدي'}</span></div>
          <div class="meta-row"><span>المخزن</span><span>${invoice.warehouseName || '-'}</span></div>
          <div class="divider"></div>
          ${itemsHtml}
          <div class="divider"></div>
          <div class="totals-row"><span>المجموع الفرعي</span><span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
          ${invoice.discountAmount > 0 ? `<div class="totals-row"><span>خصم الفاتورة</span><span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
          ${invoice.taxAmount > 0 ? `<div class="totals-row"><span>ضريبة</span><span>+${CeramicMath.formatCurrency(invoice.taxAmount)}</span></div>` : ''}
          ${invoice.shippingCost > 0 ? `<div class="totals-row"><span>مشال ونقل</span><span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
          <div class="totals-row grand"><span>الإجمالي</span><span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span></div>
          <div class="totals-row"><span>المدفوع</span><span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
          <div class="totals-row"><span>طريقة الدفع</span><span>${invoice.paymentType === 'CASH' ? 'نقدي' : invoice.paymentType === 'CARD' ? 'بطاقة' : 'آجل'}</span></div>
          ${invoice.remainingAmount > 0 ? `<div class="totals-row"><span>المتبقي (آجل)</span><span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
          <div class="footer">${settings.receiptFooter || ''}</div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  }

  // ─── Quotations / Orders / Returns ──────────────────────────────────────────

  private esc(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private openDocument(title: string, body: string): void {
    const win = window.open('', '_blank', 'width=900,height=900');
    if (!win) {
      alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
      return;
    }
    win.document.write(`<!DOCTYPE html>
      <html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${this.esc(title)}</title>
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
      </style></head><body>${body}
      <script>window.onload = function () { window.print(); };</script>
      </body></html>`);
    win.document.close();
  }

  private header(settings: SystemSettings, title: string, docNo: string, date: string, extra = ''): string {
    return `<div class="head">
      <div>
        <div class="shop">${this.esc(settings.showroomName)}</div>
        <div class="muted">${this.esc(settings.tagline)}</div>
        <div class="muted">${this.esc(settings.address)}${settings.phone ? ' | ت: ' + this.esc(settings.phone) : ''}</div>
      </div>
      <div style="text-align:left">
        <div class="doc-title">${this.esc(title)}</div>
        <div class="doc-no">${this.esc(docNo)}</div>
        <div class="muted">التاريخ: ${this.esc(date)}</div>
        ${extra ? `<div class="muted">${extra}</div>` : ''}
      </div>
    </div>`;
  }

  public printQuotation(quotation: any): void {
    const settings = this.getSettings();
    const items = (quotation.items || []).map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td class="name">${this.esc(item.productName)}${item.size ? ` (${this.esc(item.size)})` : ''}</td>
        <td>${this.esc(item.grade)}</td>
        <td>${Number(item.quantityM2 || 0)} م²</td>
        <td>${Number(item.boxesCount || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.unitPrice || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.totalPrice || 0)}</td>
      </tr>`).join('');
    const statusLabel = quotation.status === 'CONVERTED' ? 'محوّل إلى فاتورة'
      : quotation.status === 'EXPIRED' ? 'منتهي الصلاحية'
      : quotation.status === 'CANCELLED' ? 'ملغي' : 'بانتظار الموافقة';

    this.openDocument(`عرض سعر ${quotation.quotationNumber}`, `
      ${this.header(settings, 'عرض سعر / مقايسة', quotation.quotationNumber, quotation.date, `صالح لغاية: ${this.esc(quotation.validUntil)}`)}
      <div class="meta">
        <div><b>العميل:</b> ${this.esc(quotation.customerName || 'عميل نقدي')}</div>
        <div><b>الهاتف:</b> ${this.esc(quotation.customerPhone || '-')}</div>
        <div><b>الحالة:</b> ${this.esc(statusLabel)}</div>
        <div><b>عدد البنود:</b> ${(quotation.items || []).length}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>الصنف والبيان</th><th>الفرز</th><th>الكمية</th><th>الكراتين</th><th>سعر المتر</th><th>الإجمالي</th></tr></thead>
        <tbody>${items || '<tr><td colspan="7">لا توجد بنود</td></tr>'}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>المجموع الفرعي</span><span>${CeramicMath.formatCurrency(quotation.subtotal || 0)}</span></div>
        <div class="row"><span>الخصم</span><span>-${CeramicMath.formatCurrency(quotation.discountAmount || 0)}</span></div>
        <div class="row"><span>الضريبة</span><span>+${CeramicMath.formatCurrency(quotation.taxAmount || 0)}</span></div>
        <div class="row grand"><span>الإجمالي</span><span>${CeramicMath.formatCurrency(quotation.totalAmount || 0)}</span></div>
      </div>
      ${quotation.notes ? `<div class="notes"><b>ملاحظات وشروط:</b>\n${this.esc(quotation.notes)}</div>` : ''}
      <div class="sign"><div>توقيع العميل بالقبول</div><div>إدارة المبيعات</div></div>
      <div class="footer">${this.esc(settings.receiptFooter)}</div>
    `);
  }

  public printOrder(order: any): void {
    const settings = this.getSettings();
    const items = (order.items || []).map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td class="name">${this.esc(item.productName)}${item.size ? ` (${this.esc(item.size)})` : ''}</td>
        <td>${this.esc(item.grade)}</td>
        <td>${Number(item.quantityM2 || 0)} م²</td>
        <td>${Number(item.boxesCount || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.unitPrice || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.totalPrice || 0)}</td>
      </tr>`).join('');

    this.openDocument(`طلب ${order.orderNumber}`, `
      ${this.header(settings, 'طلب حجز بضاعة', order.orderNumber, order.date, order.expectedDeliveryDate ? `التسليم المتوقع: ${this.esc(order.expectedDeliveryDate)}` : '')}
      <div class="meta">
        <div><b>العميل:</b> ${this.esc(order.customerName || '-')}</div>
        <div><b>الهاتف:</b> ${this.esc(order.customerPhone || '-')}</div>
        <div><b>المخزن:</b> ${this.esc(order.warehouseName || '-')}</div>
        <div><b>الحالة:</b> ${this.esc(order.status)}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>الصنف والبيان</th><th>الفرز</th><th>الكمية</th><th>الكراتين</th><th>سعر المتر</th><th>الإجمالي</th></tr></thead>
        <tbody>${items || '<tr><td colspan="7">لا توجد بنود</td></tr>'}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>المجموع الفرعي</span><span>${CeramicMath.formatCurrency(order.subtotal || 0)}</span></div>
        <div class="row"><span>الخصم</span><span>-${CeramicMath.formatCurrency(order.discountAmount || 0)}</span></div>
        <div class="row"><span>مصاريف الشحن</span><span>+${CeramicMath.formatCurrency(order.shippingCost || 0)}</span></div>
        <div class="row grand"><span>الإجمالي</span><span>${CeramicMath.formatCurrency(order.totalAmount || 0)}</span></div>
      </div>
      ${order.notes ? `<div class="notes"><b>ملاحظات:</b>\n${this.esc(order.notes)}</div>` : ''}
      <div class="sign"><div>توقيع العميل</div><div>إدارة المبيعات</div></div>
      <div class="footer">${this.esc(settings.receiptFooter)}</div>
    `);
  }

  public printSalesReturn(salesReturn: any): void {
    const settings = this.getSettings();
    const items = (salesReturn.items || []).map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td class="name">${this.esc(item.productName)}</td>
        <td>${this.esc(item.grade)}</td>
        <td>${Number(item.quantityM2 || 0)} م²</td>
        <td>${Number(item.boxesCount || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.unitPrice || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.totalRefund || 0)}</td>
      </tr>`).join('');

    this.openDocument(`مرتجع ${salesReturn.returnNumber}`, `
      ${this.header(settings, 'سند مرتجع مبيعات', salesReturn.returnNumber, salesReturn.date, `الفاتورة الأصلية: ${this.esc(salesReturn.originalInvoiceNumber || '')}`)}
      <div class="meta">
        <div><b>العميل:</b> ${this.esc(salesReturn.customerName || '-')}</div>
        <div><b>المخزن:</b> ${this.esc(salesReturn.warehouseName || '-')}</div>
        <div><b>سبب الإرجاع:</b> ${this.esc(salesReturn.reason || '-')}</div>
        <div><b>عدد البنود:</b> ${(salesReturn.items || []).length}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>الصنف</th><th>الفرز</th><th>الكمية</th><th>الكراتين</th><th>سعر المتر</th><th>قيمة الارتجاع</th></tr></thead>
        <tbody>${items || '<tr><td colspan="7">لا توجد بنود</td></tr>'}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>إجمالي قيمة المرتجع</span><span>${CeramicMath.formatCurrency(salesReturn.totalAmount || 0)}</span></div>
        <div class="row"><span>المسترد نقداً</span><span>${CeramicMath.formatCurrency(salesReturn.refundedAmount || 0)}</span></div>
        <div class="row grand"><span>خصم من رصيد العميل</span><span>${CeramicMath.formatCurrency(salesReturn.remainingToBalance || 0)}</span></div>
      </div>
      <div class="sign"><div>توقيع العميل</div><div>إدارة المبيعات</div></div>
      <div class="footer">${this.esc(settings.receiptFooter)}</div>
    `);
  }
}
