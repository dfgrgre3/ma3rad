import type { DailyPurchaseItemRow, DailyPurchaseRow } from '../../../services/operations/DailyOperationsService';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { PAY_LABEL } from './constants';
import { escapeHtml, timeOf } from './helpers_part01';

export const buildPurchaseInvoiceHtml = (
  row: DailyPurchaseRow,
  items: DailyPurchaseItemRow[],
  currency: string,
  storeName: string,
) => {
  const money = (value: number) => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${currency}`;
  const lines = items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td style="text-align:right;font-weight:700">${escapeHtml(item.productName)}<div style="font-size:10px;color:#64748b">${escapeHtml(item.sku || '')} · ${escapeHtml(item.grade || '')}</div></td>
      <td>${escapeHtml(formatProductQuantity(Number(item.quantityM2), item))}</td>
      <td>${escapeHtml(item.boxesCount)}</td>
      <td>${escapeHtml(money(item.unitCost))}</td>
      <td style="font-weight:700">${escapeHtml(money(item.totalCost))}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>فاتورة توريد ${escapeHtml(row.invoiceNumber)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; margin: 0; padding: 18px; font-size: 12px; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #ea580c; padding-bottom:12px; }
    .title { font-size:18px; font-weight:800; color:#c2410c; }
    .muted { color:#64748b; font-size:11px; }
    .grid { display:flex; justify-content:space-between; gap:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px; margin:14px 0; }
    table { width:100%; border-collapse:collapse; font-size:11px; }
    th, td { border-bottom:1px solid #e2e8f0; padding:7px 6px; text-align:center; }
    th { background:#fff7ed; color:#9a3412; }
    .totals { width:280px; margin-right:auto; margin-top:14px; border:1px solid #e2e8f0; border-radius:6px; padding:10px; background:#f8fafc; }
    .row { display:flex; justify-content:space-between; padding:3px 0; }
    .grand { border-top:2px solid #cbd5e1; margin-top:6px; padding-top:6px; font-size:14px; font-weight:800; color:#c2410c; }
    @media print { body { padding:0; } }
  </style>
</head>
<body>
  <div class="head">
    <div>
      <div class="title">${escapeHtml(storeName || 'CeramiSys ERP')}</div>
      <div class="muted">فاتورة توريد / مشتريات</div>
    </div>
    <div style="text-align:left">
      <div style="font-weight:800">${escapeHtml(row.invoiceNumber)}</div>
      <div class="muted">${escapeHtml(row.date)}</div>
      ${row.supplierInvoiceNumber ? `<div class="muted">فاتورة المورد: ${escapeHtml(row.supplierInvoiceNumber)}</div>` : ''}
    </div>
  </div>
  <div class="grid">
    <div><strong>المورد:</strong> ${escapeHtml(row.supplierName || '—')}<br/><span class="muted">${escapeHtml(row.supplierPhone || '')}</span></div>
    <div><strong>المخزن:</strong> ${escapeHtml(row.warehouseName || '—')}</div>
    <div><strong>طريقة السداد:</strong> ${escapeHtml(PAY_LABEL[row.paymentType] || row.paymentType || '—')}</div>
  </div>
  <table>
    <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>الكراتين</th><th>تكلفة الوحدة</th><th>الإجمالي</th></tr></thead>
    <tbody>${lines || '<tr><td colspan="6">لا توجد أصناف</td></tr>'}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>الإجمالي قبل الخصم</span><span>${escapeHtml(money(row.subtotal))}</span></div>
    <div class="row"><span>الخصم</span><span>${escapeHtml(money(row.discount))}</span></div>
    <div class="row"><span>الضريبة</span><span>${escapeHtml(money(row.tax))}</span></div>
    <div class="row"><span>الشحن</span><span>${escapeHtml(money(row.shippingCost))}</span></div>
    <div class="row grand"><span>إجمالي الفاتورة</span><span>${escapeHtml(money(row.total))}</span></div>
    <div class="row"><span>المدفوع</span><span>${escapeHtml(money(row.paid))}</span></div>
    <div class="row"><span>المتبقي</span><span>${escapeHtml(money(row.remaining))}</span></div>
  </div>
  ${row.notes ? `<p class="muted" style="margin-top:14px">ملاحظات: ${escapeHtml(row.notes)}</p>` : ''}
  <p class="muted" style="margin-top:20px;text-align:center">أُنشئت من CeramiSys ERP — ${escapeHtml(row.createdByName || '')} — ${escapeHtml(timeOf(row.createdAt))}</p>
</body>
</html>`;
};
