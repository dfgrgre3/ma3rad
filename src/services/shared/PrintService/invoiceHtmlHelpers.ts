import type { SalesInvoice, SystemSettings } from '../../../types';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { AppConfigService } from '../../domains/config/AppConfigService';
import type { InvoiceSectionId, InvoiceTableColumnId } from '../../../types';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Reads an administrator override for a printed document title or footer.
 * Falls back to the hard-coded default when the configuration is empty or
 * unavailable (e.g. before the database is initialized).
 */
export function printOverride(key: string, fallback: string): string {
  try {
    return AppConfigService.getPrintTemplate(key, fallback) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Converts a numeric amount to Arabic words (tafqeet) for invoice totals.
 * Supports values up to 9,999,999 with proper Arabic grammar.
 */
export function tafqeet(amount: number): string {
  if (!amount || amount <= 0) return 'صفر';
  const integer = Math.floor(amount);
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  const twoDigits = (n: number): string => {
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o ? `${ones[o]} و${tens[t]}` : tens[t];
  };
  const threeDigits = (n: number): string => {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const rest = n % 100;
    if (h && rest) return `${hundreds[h]} و${twoDigits(rest)}`;
    return h ? hundreds[h] : twoDigits(rest);
  };
  const parts: string[] = [];
  const millions = Math.floor(integer / 1000000);
  const thousands = Math.floor((integer % 1000000) / 1000);
  const remainder = integer % 1000;
  if (millions === 1) parts.push('مليون');
  else if (millions === 2) parts.push('مليونان');
  else if (millions >= 3 && millions <= 10) parts.push(`${threeDigits(millions)} ملايين`);
  else if (millions > 10) parts.push(`${threeDigits(millions)} مليون`);
  if (thousands === 1) parts.push('ألف');
  else if (thousands === 2) parts.push('ألفان');
  else if (thousands >= 3 && thousands <= 10) parts.push(`${threeDigits(thousands)} آلاف`);
  else if (thousands > 10) parts.push(`${threeDigits(thousands)} ألف`);
  if (remainder) parts.push(threeDigits(remainder));
  return parts.join(' و') || 'صفر';
}

/**
 * Returns a payment status badge with appropriate color for the given invoice.
 */
export function paymentBadge(invoice: SalesInvoice, isA5: boolean): string {
  const badgeSize = isA5 ? '9px' : '11px';
  const padH = isA5 ? '5px' : '8px';
  const padV = isA5 ? '2px' : '3px';
  if (invoice.paymentStatus === 'PAID' || invoice.remainingAmount <= 0) {
    return `<span style="display:inline-block;padding:${padV} ${padH};border-radius:4px;background:#dcfce7;color:#15803d;font-weight:700;font-size:${badgeSize};">مسددة بالكامل ✓</span>`;
  }
  if (invoice.remainingAmount > 0 && invoice.paidAmount > 0) {
    return `<span style="display:inline-block;padding:${padV} ${padH};border-radius:4px;background:#fef3c7;color:#92400e;font-weight:700;font-size:${badgeSize};">مسددة جزئياً</span>`;
  }
  return `<span style="display:inline-block;padding:${padV} ${padH};border-radius:4px;background:#fee2e2;color:#991b1b;font-weight:700;font-size:${badgeSize};">غير مسددة</span>`;
}

/**
 * Returns a payment type label in Arabic for the given payment type code.
 */
export function paymentTypeLabel(paymentType: string): string {
  switch (paymentType) {
    case 'CASH': return 'نقدي كاش';
    case 'CARD': return 'بطاقة بنكية / فيزا';
    case 'BANK_TRANSFER': return 'تحويل بنكي';
    case 'CHEQUE': return 'شيك';
    case 'MIXED': return 'دفع مختلط';
    case 'CREDIT': return 'آجل';
    default: return 'آجل / تقسيط';
  }
}

/**
 * Returns logo HTML for the invoice header.
 */
export function logoHtml(settings: SystemSettings, size: number): string {
  if (settings.invoiceShowBrandLogo === false) return '';
  if (settings.brandLogoDataUrl) {
    return `<img src="${settings.brandLogoDataUrl}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:6px;" alt="شعار">`;
  }
  const color = settings.brandPrimaryColor || '#0369a1';
  const letter = (settings.brandShortName || settings.showroomName || 'س').slice(0, 2);
  return `<div style="width:${size}px;height:${size}px;border-radius:8px;background:${esc(color)};display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:${Math.round(size * 0.45)}px;">${esc(letter)}</div>`;
}

export function invoiceBrandStyles(settings: SystemSettings): string {
  const primary = /^#[0-9a-f]{6}$/i.test(settings.brandPrimaryColor || '')
    ? settings.brandPrimaryColor
    : '#0369a1';
  const accent = /^#[0-9a-f]{6}$/i.test(settings.brandAccentColor || '')
    ? settings.brandAccentColor
    : '#4f46e5';
  const font = ['Cairo', 'Tajawal', 'Tahoma', 'Arial'].includes(settings.invoiceFontFamily || '')
    ? settings.invoiceFontFamily
    : 'Cairo';
  return `:root{--invoice-primary:${primary};--invoice-accent:${accent}}body{font-family:'${font}',Tahoma,Arial,sans-serif!important}.invoice-primary{color:var(--invoice-primary)!important}.invoice-accent{color:var(--invoice-accent)!important}.invoice-primary-bg{background-color:var(--invoice-primary)!important}.showroom-title,.brand-title,.title,.grand-total,.grand-tot,.card-title,.meta-card-title,.tafqeet-label{color:var(--invoice-primary)!important}.header,.top-bar,.header-panel{border-color:var(--invoice-primary)!important}.grand-total,.grand-tot{border-color:var(--invoice-primary)!important}.badge,.pill{background-color:var(--invoice-primary)!important}.grand-sum{background:var(--invoice-primary)!important;color:#fff!important}`;
}

/**
 * Generates tax breakdown HTML (Tax Details).
 */
export function taxBreakdownHtml(invoice: SalesInvoice, isA5: boolean): string {
  const taxRate = invoice.taxPercentage ?? 0;
  const taxAmount = invoice.taxAmount ?? 0;
  const taxableAmount = Math.max(0, (invoice.subtotal || 0) - (invoice.discountAmount || 0));

  return `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:${isA5 ? '5px 8px' : '7px 10px'};margin-top:${isA5 ? '6px' : '8px'};font-size:${isA5 ? '9px' : '11px'};">
        <div style="font-weight:800;color:#0f172a;margin-bottom:3px;display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:2px;">
          <span>تفاصيل الضريبة (VAT Breakdown)</span>
          <span style="color:#0369a1;">نسبة الضريبة: ${taxRate}%</span>
        </div>
        <div style="display:flex;justify-content:space-between;color:#475569;">
          <span>الوعاء الخاضع للضريبة (بعد الخصم):</span>
          <span style="font-weight:700;">${CeramicMath.formatCurrency(taxableAmount)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;color:#0369a1;margin-top:2px;">
          <span>مبلغ ضريبة القيمة المضافة:</span>
          <span style="font-weight:800;">+${CeramicMath.formatCurrency(taxAmount)}</span>
        </div>
      </div>
    `;
}

/**
 * Generates promotions and coupon discount section HTML.
 */
export function promotionsHtml(invoice: SalesInvoice, isA5: boolean): string {
  const hasCoupon = !!invoice.couponCode;
  const hasPromo = !!invoice.promotionName || (invoice.promotionDiscount && invoice.promotionDiscount > 0);
  const hasGeneralDiscount = (invoice.discountAmount || 0) > 0;

  if (!hasCoupon && !hasPromo && !hasGeneralDiscount) return '';

  return `
      <div style="background:#ecfdf5;border:1px dashed #10b981;border-radius:6px;padding:${isA5 ? '5px 8px' : '7px 10px'};margin-top:${isA5 ? '6px' : '8px'};font-size:${isA5 ? '9px' : '11px'};color:#065f46;">
        <div style="font-weight:800;display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
          <span>🎁 العروض والخصومات المطبقة:</span>
          <span style="background:#059669;color:white;padding:1px 6px;border-radius:4px;font-size:${isA5 ? '8px' : '10px'};">وفرت ${CeramicMath.formatCurrency(invoice.discountAmount || 0)}</span>
        </div>
        ${hasPromo ? `<div>• عرض: <strong>${esc(invoice.promotionName)}</strong></div>` : ''}
        ${hasCoupon ? `<div>• كود الكوبون المطبق: <strong style="font-family:monospace;background:#d1fae5;padding:1px 5px;border-radius:3px;">${esc(invoice.couponCode)}</strong></div>` : ''}
        ${!hasPromo && !hasCoupon && hasGeneralDiscount ? `<div>• خصم تجاري مباشر ممنوح على الفاتورة</div>` : ''}
      </div>
    `;
}

/**
 * Generates delivery and shipping information HTML.
 */
export function deliveryDetailsHtml(invoice: SalesInvoice, isA5: boolean): string {
  const hasAddress = !!invoice.deliveryAddress;
  const hasContact = !!invoice.deliveryContactName || !!invoice.deliveryContactPhone;
  const hasDate = !!invoice.deliveryDate;
  const hasDriver = !!invoice.driverName;
  const hasCost = (invoice.shippingCost || 0) > 0;

  if (!hasAddress && !hasContact && !hasDate && !hasDriver && !hasCost) return '';

  return `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:${isA5 ? '5px 8px' : '7px 10px'};margin-top:${isA5 ? '6px' : '8px'};font-size:${isA5 ? '9px' : '11px'};color:#166534;">
        <div style="font-weight:800;color:#15803d;margin-bottom:3px;border-bottom:1px solid #dcfce7;padding-bottom:2px;display:flex;justify-content:space-between;">
          <span>🚚 بيانات الشحن والتوصيل للموقع</span>
          ${hasCost ? `<span style="color:#047857;">رسوم النقل: ${CeramicMath.formatCurrency(invoice.shippingCost)}</span>` : '<span style="color:#047857;">توصيل مجاني</span>'}
        </div>
        ${hasAddress ? `<div><strong>عنوان التوصيل:</strong> ${esc(invoice.deliveryAddress)}</div>` : ''}
        ${hasContact ? `<div><strong>مستلم الموقع:</strong> ${esc(invoice.deliveryContactName || '-')} ${invoice.deliveryContactPhone ? `(${esc(invoice.deliveryContactPhone)})` : ''}</div>` : ''}
        <div style="display:flex;gap:12px;margin-top:2px;">
          ${hasDate ? `<span><strong>تاريخ التسليم:</strong> ${esc(invoice.deliveryDate)}</span>` : ''}
          ${hasDriver ? `<span><strong>السائق / وسيلة النقل:</strong> ${esc(invoice.driverName)}</span>` : ''}
        </div>
        ${invoice.deliveryNotes ? `<div style="margin-top:2px;font-style:italic;color:#14532d;">تعليمات الشحن: ${esc(invoice.deliveryNotes)}</div>` : ''}
      </div>
    `;
}

/**
 * Generates split-payment / multi-payment breakdown HTML.
 */
export function paymentSplitsHtml(invoice: SalesInvoice, isA5: boolean): string {
  const splits = invoice.paymentSplits;
  if (splits && splits.length > 0) {
    return `
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:${isA5 ? '5px 8px' : '7px 10px'};margin-top:${isA5 ? '6px' : '8px'};font-size:${isA5 ? '9px' : '11px'};color:#1e40af;">
          <div style="font-weight:800;margin-bottom:3px;border-bottom:1px solid #dbeafe;padding-bottom:2px;">
            💳 تفاصيل طرق الدفع والتحصيل (Split Payments):
          </div>
          ${splits.map((s) => `
            <div style="display:flex;justify-content:space-between;padding:1px 0;">
              <span>• ${paymentTypeLabel(s.method)} ${s.reference ? `<span style="font-size:${isA5 ? '8px' : '9px'};color:#3b82f6;">(${esc(s.reference)})</span>` : ''}:</span>
              <span style="font-weight:700;">${CeramicMath.formatCurrency(s.amount)}</span>
            </div>
          `).join('')}
        </div>
      `;
  }

  return `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:${isA5 ? '5px 8px' : '7px 10px'};margin-top:${isA5 ? '6px' : '8px'};font-size:${isA5 ? '9px' : '11px'};">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span><strong>طريقة الدفع الأساسية:</strong> ${paymentTypeLabel(invoice.paymentType)}</span>
          <span>${paymentBadge(invoice, isA5)}</span>
        </div>
      </div>
    `;
}

export function orderedInvoiceDetails(
  invoice: SalesInvoice & { items?: any[] },
  settings: SystemSettings,
  isA5: boolean,
): string {
  const sections: Record<InvoiceSectionId, string> = {
    promotions: settings.invoiceShowPromotions
      ? promotionsHtml(invoice, isA5)
      : '',
    delivery: settings.invoiceShowShipping
      ? deliveryDetailsHtml(invoice, isA5)
      : '',
    paymentSplits: settings.invoiceShowPaymentSplits
      ? paymentSplitsHtml(invoice, isA5)
      : '',
    notes: settings.invoiceShowNotes && invoice.notes
      ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:${isA5 ? '5px 8px' : '8px 10px'};margin-top:6px;"><strong style="color:#92400e;">ملاحظات إضافية:</strong><br><span style="color:#78350f;">${esc(invoice.notes)}</span></div>`
      : '',
  };
  const defaultOrder: InvoiceSectionId[] = ['promotions', 'delivery', 'paymentSplits', 'notes'];
  const order = Array.isArray(settings.invoiceSectionOrder)
    ? settings.invoiceSectionOrder.filter((section): section is InvoiceSectionId => section in sections)
    : defaultOrder;
  for (const section of defaultOrder) {
    if (!order.includes(section)) order.push(section);
  }
  return order.map((section) => sections[section]).join('');
}

export function tableFirstColumns(settings: SystemSettings): InvoiceTableColumnId[] {
  const valid: InvoiceTableColumnId[] = [
    'number', 'product', 'unit', 'quantity', 'boxes', 'pieces', 'unitPrice', 'lineDiscount', 'total',
  ];
  const configured = settings.invoiceTableColumns;
  const columns = Array.isArray(configured)
    ? configured.filter((column): column is InvoiceTableColumnId => valid.includes(column))
    : [];
  return columns.length ? columns : ['number', 'product', 'unit', 'quantity', 'unitPrice', 'total'];
}
