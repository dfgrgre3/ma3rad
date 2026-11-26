import type { SalesInvoice, SystemSettings } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../../../../utils/products/productUnits';
import type { InvoiceTableColumnId } from '../../../../types';
import {
  esc,
  invoiceBrandStyles,
  logoHtml,
  orderedInvoiceDetails,
  itemSerialsHtml,
  paymentTypeLabel,
  printOverride,
  tableFirstColumns,
} from '../invoiceHtmlHelpers';

export function getTableFirstInvoiceHtml(
  invoice: SalesInvoice & { items: any[] },
  settings: SystemSettings,
  size: 'a4' | 'a5',
): string {
  const isA5 = size === 'a5';
  const primary = /^#[0-9a-f]{6}$/i.test(settings.brandPrimaryColor || '')
    ? settings.brandPrimaryColor
    : '#0369a1';
  const tableStyle = settings.invoiceTableStyle || 'minimal';
  const columns = tableFirstColumns(settings);
  const documentTitle = printOverride('sales.invoice.a4', isA5 ? 'فاتورة مبيعات A5' : 'فاتورة مبيعات');
  const labels: Record<InvoiceTableColumnId, string> = {
    number: '#',
    product: 'الصنف والبيان',
    unit: 'الوحدة',
    quantity: 'الكمية',
    boxes: 'الكراتين',
    pieces: 'القطع',
    unitPrice: 'سعر الوحدة',
    lineDiscount: 'خصم البند',
    total: 'الإجمالي',
  };
  const valueFor = (column: InvoiceTableColumnId, item: any, index: number): string => {
    switch (column) {
      case 'number': return String(index + 1);
      case 'product':
        return `<strong>${esc(item.productName || '-')}</strong>${settings.invoiceShowItemCode || settings.invoiceShowItemSpecs ? `<small>${settings.invoiceShowItemCode && item.productSku ? `كود: ${esc(item.productSku)}` : ''}${settings.invoiceShowItemCode && settings.invoiceShowItemSpecs && item.productSku && item.size ? ' · ' : ''}${settings.invoiceShowItemSpecs && item.size && item.size !== '—' ? `مقاس: ${esc(item.size)}` : ''}${settings.invoiceShowItemSpecs && item.productGrade ? ` · ${item.productGrade === 'GRADE_1' ? 'فرز أول' : 'فرز تجاري'}` : ''}</small>` : ''}${itemSerialsHtml(item)}`;
      case 'unit': return esc(getProductUnitLabel(item));
      case 'quantity': return esc(formatProductQuantity(item.quantityM2, item));
      case 'boxes': return item.productType === 'GENERAL' ? '—' : esc(item.boxesCount ?? '—');
      case 'pieces': return item.productType === 'GENERAL' ? '—' : esc(item.piecesCount ?? '—');
      case 'unitPrice': return CeramicMath.formatCurrency(item.unitPrice);
      case 'lineDiscount':
        return item.discountAmount > 0 ? CeramicMath.formatCurrency(item.discountAmount) : '—';
      case 'total': return CeramicMath.formatCurrency(item.totalPrice);
    }
  };
  const itemsHtml = (invoice.items || []).map((item, index) => `
      <tr>${columns.map((column) => `<td class="${column === 'product' ? 'product-cell' : ''}">${valueFor(column, item, index)}</td>`).join('')}</tr>
    `).join('');
  const detailsHtml = orderedInvoiceDetails(invoice, settings, isA5);
  const footer = printOverride('sales.invoice.a4.footer', settings.receiptFooter || '');
  const taxPercent = esc(invoice.taxPercentage ?? 0);
  const discountRow = invoice.discountAmount > 0
    ? `<div class="total-row discount-row"><span>الخصم</span><strong>−${CeramicMath.formatCurrency(invoice.discountAmount)}</strong></div>`
    : '';
  const shippingRow = invoice.shippingCost > 0
    ? `<div class="total-row"><span>التوصيل والنقل</span><strong>${CeramicMath.formatCurrency(invoice.shippingCost)}</strong></div>`
    : '';
  const extraFeesRow = Number(invoice.extraFees || 0) > 0
    ? `<div class="total-row"><span>مصاريف إضافية</span><strong>${CeramicMath.formatCurrency(Number(invoice.extraFees))}</strong></div>`
    : '';
  const taxRow = invoice.taxAmount > 0
    ? `<div class="total-row"><span>ضريبة القيمة المضافة (${taxPercent}%)</span><strong>${CeramicMath.formatCurrency(invoice.taxAmount)}</strong></div>`
    : '';
  const columnsHeading = columns.map((column) => `<th>${labels[column]}</th>`).join('');

  return `<!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>${esc(documentTitle)} ${esc(invoice.invoiceNumber)}</title>
          <style>
            @page{size:${isA5 ? 'A5' : 'A4'};margin:${isA5 ? '8mm' : '12mm'}}
            *{box-sizing:border-box}
            body{font-family:'Cairo',Tahoma,Arial,sans-serif;color:#17212b;font-size:${isA5 ? '10px' : '12px'};line-height:1.55;margin:0;padding:${isA5 ? '10px' : '20px'}}
            ${invoiceBrandStyles(settings)}
            .masthead{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 0 14px;border-bottom:3px solid ${primary};margin-bottom:14px}
            .brand{display:flex;align-items:center;gap:12px;min-width:0}.brand-name{font-size:${isA5 ? '17px' : '23px'};font-weight:800;color:var(--invoice-primary)}.brand-meta{font-size:10px;color:#66737f;margin-top:3px}
            .invoice-id{text-align:left;min-width:150px}.invoice-label{color:var(--invoice-accent);font-weight:800;font-size:12px}.invoice-number{font:700 ${isA5 ? '14px' : '17px'} monospace;letter-spacing:.3px;margin-top:3px}.date-line{color:#66737f;font-size:10px;margin-top:3px}
            .customer-line{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #dfe5e9;margin-bottom:12px}.field-label{color:#72808d;font-size:9px;display:block}.field-value{font-weight:700;margin-top:2px;word-break:break-word}
            table{width:100%;border-collapse:collapse;table-layout:auto}thead th{text-align:right;background:#f0f3f5;border-top:1px solid #cbd4da;border-bottom:2px solid ${primary};padding:${isA5 ? '6px 5px' : '9px 7px'};font-size:${isA5 ? '9px' : '10px'};color:#34424d}
            tbody td{padding:${isA5 ? '6px 5px' : '9px 7px'};border-bottom:1px solid #e4e9ec;vertical-align:top}tbody tr:nth-child(even){background:#fafbfc}.items-table.bordered th,.items-table.bordered td{border:1px solid #d5dde2}.items-table.striped tbody tr:nth-child(even){background:#f1f4f6}.items-table.striped th,.items-table.striped td{border-bottom:1px solid #d5dde2}.items-table.minimal th,.items-table.minimal td{border-left:0;border-right:0}.product-cell{min-width:145px}.product-cell small{display:block;color:#697783;font-size:9px;font-weight:400;margin-top:2px}
            .item-summary{display:flex;gap:20px;justify-content:flex-end;color:#66737f;font-size:10px;padding:8px 0 0}
            .post-table{display:grid;grid-template-columns:minmax(0,1fr) minmax(230px,34%);gap:24px;align-items:start;margin-top:16px}.details{min-width:0}.totals{border-top:2px solid ${primary};padding-top:7px}.total-row{display:flex;justify-content:space-between;gap:14px;padding:4px 0}.total-row strong{white-space:nowrap}.discount-row{color:#9a4a36}.grand-total{border-top:1px solid #bcc8cf;margin-top:5px;padding-top:9px;font-size:${isA5 ? '13px' : '16px'};color:var(--invoice-primary);font-weight:900}.paid{color:#287453}.balance{color:#9a4a36}
            .details>div{margin-top:8px}.signature{margin-top:${isA5 ? '22px' : '34px'};display:grid;grid-template-columns:1fr 1fr 1fr;gap:25px;text-align:center;color:#687680;font-size:10px}.signature span{border-top:1px dashed #9ca9b1;padding-top:6px}.footer{margin-top:18px;border-top:1px solid #dfe5e9;padding-top:8px;text-align:center;white-space:pre-line;color:#687680;font-size:9px}
            @media print{body{padding:0}}
          </style>
        </head>
        <body>
          <header class="masthead">
            <div class="brand">${logoHtml(settings, isA5 ? 38 : 48)}<div><div class="brand-name">${esc(settings.showroomName || 'معرض السيراميك والبورسلين')}</div><div class="brand-meta">${esc(settings.tagline || '')}${settings.phone ? ` · ${esc(settings.phone)}` : ''}${settings.address ? ` · ${esc(settings.address)}` : ''}</div></div></div>
            <div class="invoice-id"><div class="invoice-label">${esc(documentTitle)}</div><div class="invoice-number">${esc(invoice.invoiceNumber)}</div><div class="date-line">${esc(invoice.date || '')}</div></div>
          </header>
          <section class="customer-line">
            <div><span class="field-label">العميل</span><div class="field-value">${esc(invoice.customerName || 'عميل نقدي')}</div></div>
            <div><span class="field-label">رقم الهاتف</span><div class="field-value">${esc(invoice.customerPhone || '—')}</div></div>
            <div><span class="field-label">المستودع · طريقة الدفع</span><div class="field-value">${esc(invoice.warehouseName || '—')} · ${paymentTypeLabel(invoice.paymentType)}</div></div>
          </section>
          <table class="items-table ${tableStyle}">
            <thead><tr>${columnsHeading}</tr></thead>
            <tbody>${itemsHtml || `<tr><td colspan="${columns.length}" style="text-align:center;color:#72808d;padding:18px">لا توجد أصناف في الفاتورة</td></tr>`}</tbody>
          </table>
          ${settings.invoiceShowTableSummary !== false ? `<div class="item-summary"><span>عدد البنود: <strong>${invoice.items.length}</strong></span><span>الكمية الإجمالية: <strong>${formatProductQuantity(invoice.items.reduce((sum: number, item: any) => sum + (item.quantityM2 || item.quantity || 0), 0), invoice.items[0])}</strong></span></div>` : ''}
          <section class="post-table">
            <div class="details">${detailsHtml}</div>
            <div class="totals">
              <div class="total-row"><span>المجموع الفرعي</span><strong>${CeramicMath.formatCurrency(invoice.subtotal)}</strong></div>
              ${discountRow}${taxRow}${shippingRow}${extraFeesRow}
              <div class="total-row grand-total"><span>الإجمالي</span><strong>${CeramicMath.formatCurrency(invoice.totalAmount)}</strong></div>
              <div class="total-row paid"><span>المبلغ المسدد</span><strong>${CeramicMath.formatCurrency(invoice.paidAmount)}</strong></div>
              ${invoice.remainingAmount > 0 ? `<div class="total-row balance"><span>المتبقي</span><strong>${CeramicMath.formatCurrency(invoice.remainingAmount)}</strong></div>` : ''}
            </div>
          </section>
          <div class="signature"><span>البائع / المحاسب</span><span>استلام العميل</span><span>اعتماد الإدارة</span></div>
          ${footer ? `<footer class="footer">${esc(footer)}</footer>` : ''}
        </body>
      </html>`;
}
