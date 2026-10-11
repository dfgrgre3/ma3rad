import { DatabaseManager } from '../database/db';
import type { SalesInvoice, SystemSettings } from '../types';
import { CeramicMath } from '../utils/ceramicMath';

export class PrintService {
  private db = DatabaseManager.getInstance();

  public getSettings(): SystemSettings {
    const rows = this.db.query<{ key: string; value: string }>(`SELECT * FROM system_settings`);
    const map: Record<string, any> = {};
    for (const r of rows) {
      map[r.key] = r.value;
    }
    return {
      showroomName: map.showroomName || 'معرض السيراميك والبورسلين',
      tagline: map.tagline || '',
      phone: map.phone || '',
      phone2: map.phone2 || '',
      address: map.address || '',
      taxNumber: map.taxNumber || '',
      commercialRecord: map.commercialRecord || '',
      currency: map.currency || 'EGP',
      currencySymbol: map.currencySymbol || 'ج.م',
      defaultTaxPercentage: Number(map.defaultTaxPercentage || 0),
      isTaxInclusive: Boolean(map.isTaxInclusive === '1'),
      enableNegativeStock: Boolean(map.enableNegativeStock === '1'),
      costingMethod: map.costingMethod || 'AVERAGE_COST',
      receiptHeader: map.receiptHeader || '',
      receiptFooter: map.receiptFooter || '',
      autoBackupIntervalHours: Number(map.autoBackupIntervalHours || 24)
    };
  }

  public printInvoice(invoice: SalesInvoice & { items: any[] }): void {
    const settings = this.getSettings();
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة لطباعة الفاتورة');
      return;
    }

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

    const html = `
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
}
