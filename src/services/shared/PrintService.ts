import { DatabaseManager } from '../../database/repositories/databaseManager';
import type { SalesInvoice, SystemSettings } from '../../types';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/products/productUnits';
import { AppConfigService } from '../domains/config/AppConfigService';
import { EscPosService } from './EscPosService';
import { SettingsService } from '../domains/config/SettingsService';
import { getEffectiveBusinessType } from '../domains/config/BusinessTypeService';
import { getProfilePrintTemplate } from '../../config/businessProfiles';
import type { InvoiceSectionId, InvoiceTableColumnId } from '../../types';
import { writeAndPrintWindow } from '../../utils/shared/printWindow';
import { addLocalDays, localDateString } from '../../utils/shared/date';

export type InvoiceTemplateId = 'table' | 'classic' | 'modern' | 'compact' | 'detailed';
export type InvoiceSizeId = 'a4' | 'a5' | 'thermal';

export interface InvoiceHtmlOptions {
  autoPrint?: boolean;
  size?: InvoiceSizeId;
  template?: InvoiceTemplateId;
  settingsOverride?: Partial<SystemSettings>;
}

export class PrintService {
  private db = DatabaseManager.getInstance();

  public getSettings(): SystemSettings {
    return SettingsService.getSettings();
  }

  /**
   * Reads an administrator override for a printed document title or footer.
   * Falls back to the hard-coded default when the configuration is empty or
   * unavailable (e.g. before the database is initialized).
   */
  private printOverride(key: string, fallback: string): string {
    try {
      return AppConfigService.getPrintTemplate(key, fallback) || fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Generates a realistic ceramic & building materials sample invoice for previewing
   * and testing print templates without needing live transactional data.
   */
  public getSampleInvoice(settingsOverride?: Partial<SystemSettings>): SalesInvoice & { items: any[] } {
    const settings = { ...this.getSettings(), ...(settingsOverride || {}) };
    return {
      id: 'sample-inv-preview',
      invoiceNumber: 'INV-2026-0088',
      date: localDateString(),
      dueDate: localDateString(),
      customerId: 'cust_sample_01',
      customerName: 'مؤسسة إعمار وبناء الحديثة',
      customerPhone: '0555123456',
      warehouseId: 'wh_main',
      warehouseName: 'المستودع الرئيسي - صالة العرض',
      paymentType: 'CASH',
      subtotal: 9450,
      taxPercentage: settings.defaultTaxPercentage ?? 14,
      taxAmount: Math.round(9450 * ((settings.defaultTaxPercentage ?? 14) / 100)),
      discountAmount: 350,
      shippingCost: 150,
      totalAmount: Math.round(9450 - 350 + (9450 * ((settings.defaultTaxPercentage ?? 14) / 100)) + 150),
      paidAmount: Math.round(9450 - 350 + (9450 * ((settings.defaultTaxPercentage ?? 14) / 100)) + 150),
      remainingAmount: 0,
      totalCost: 6000,
      grossProfit: 3450,
      createdBy: 'admin',
      discountPercentage: 0,
      paymentStatus: 'PAID',
      invoiceStatus: 'COMPLETED',
      notes: 'تسليم الموقع - عمارة الشروق 2 | يتم نقل البضاعة بواسطة سيارات المعرض',
      // تفاصيل التوصيل التجريبية
      deliveryAddress: 'حي الياسمين - شارع الملك عبدالعزيز - فيلا 42',
      deliveryContactName: 'م. أحمد الشريف',
      deliveryContactPhone: '0555987654',
      deliveryDate: localDateString(addLocalDays(new Date(), 1)),
      driverName: 'سعد المنصور (شاحنة نقل رقم 12)',
      deliveryNotes: 'يرجى الاتصال قبل الوصول بنصف ساعة والتنزيل داخل الحوش',
      // تفاصيل العروض والكوبونات التجريبية
      couponCode: 'CERAMIC2026',
      promotionName: 'خصم موسم البناء السنوي (كوبون ترويجي)',
      promotionDiscount: 350,
      // تفاصيل طرق الدفع المتعددة (Split Payments)
      paymentSplits: [
        { method: 'CASH', amount: 5000, reference: 'سند قبض نقدي #994' },
        { method: 'CARD', amount: Math.round(9450 - 350 + (9450 * ((settings.defaultTaxPercentage ?? 14) / 100)) + 150) - 5000, reference: 'شبكة مدى - POS #4421' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [
        {
          id: 'item-preview-1',
          invoiceId: 'sample-inv-preview',
          productId: 'prod-p1',
          productName: 'بورسلين إسباني ليزر فاخر - كلكتا جولد',
          productSku: 'POR-SP-60120',
          productType: 'CERAMIC',
          size: '60×120',
          productGrade: 'GRADE_1',
          soldBy: 'M2',
          baseUnit: 'M2',
          quantityM2: 24,
          quantity: 24,
          boxesCount: 16,
          piecesCount: 32,
          unitPrice: 280,
          originalUnitPrice: 280,
          unitCost: 190,
          discountAmount: 180,
          totalPrice: 6540,
          costPrice: 190,
        },
        {
          id: 'item-preview-2',
          invoiceId: 'sample-inv-preview',
          productId: 'prod-p2',
          productName: 'سيراميك أرضيات فرز أول - رويال بيج',
          productSku: 'CER-RY-6060',
          productType: 'CERAMIC',
          size: '60×60',
          productGrade: 'GRADE_1',
          soldBy: 'M2',
          baseUnit: 'M2',
          quantityM2: 18,
          quantity: 18,
          boxesCount: 12,
          piecesCount: 48,
          unitPrice: 145,
          originalUnitPrice: 145,
          unitCost: 95,
          discountAmount: 120,
          totalPrice: 2490,
          costPrice: 95,
        },
        {
          id: 'item-preview-3',
          invoiceId: 'sample-inv-preview',
          productId: 'prod-p3',
          productName: 'مادة لاصقة سيراميك وبورسلين سافيتو (25 كجم)',
          productSku: 'ADH-SV-25KG',
          productType: 'GENERAL',
          size: '—',
          productGrade: 'GRADE_1',
          soldBy: 'PIECE',
          baseUnit: 'PIECE',
          quantityM2: 5,
          quantity: 5,
          boxesCount: 5,
          piecesCount: 5,
          unitPrice: 85,
          originalUnitPrice: 85,
          unitCost: 60,
          discountAmount: 50,
          totalPrice: 375,
          costPrice: 60,
        },
      ] as any,
    };
  }

  /**
   * Returns invoice document HTML based on the requested template and paper size.
   * Legacy autoPrint options are accepted for compatibility, but generated HTML
   * remains script-free; callers must initiate printing from the parent window.
   */
  public getInvoiceHtml(
    invoice: SalesInvoice & { items: any[] },
    optionsOrAutoPrint: boolean | InvoiceHtmlOptions = false,
  ): string {
    const opts: InvoiceHtmlOptions = typeof optionsOrAutoPrint === 'boolean'
      ? { autoPrint: optionsOrAutoPrint }
      : (optionsOrAutoPrint || {});

    const settings = { ...this.getSettings(), ...(opts.settingsOverride || {}) };
    const size: InvoiceSizeId = opts.size || (settings.defaultInvoiceSize as InvoiceSizeId) || 'a4';
    const profileTemplate = getProfilePrintTemplate(getEffectiveBusinessType(), 'sales_invoice');
    const resolvedProfileTemplate =
      profileTemplate && (['table', 'classic', 'modern', 'compact', 'detailed'] as const).includes(profileTemplate as any)
        ? (profileTemplate as InvoiceTemplateId)
        : undefined;
    const template: InvoiceTemplateId = opts.template || (settings.defaultInvoiceTemplate as InvoiceTemplateId) || resolvedProfileTemplate || 'table';

    if (size === 'thermal') {
      return this.getThermalInvoiceHtml(invoice, settings);
    }

    if (template === 'modern') {
      return this.getModernInvoiceHtml(invoice, settings, size);
    }
    if (template === 'compact') {
      return this.getCompactInvoiceHtml(invoice, settings, size);
    }
    if (template === 'detailed') {
      return this.getDetailedInvoiceHtml(invoice, settings, size);
    }
    if (template === 'table') {
      return this.getTableFirstInvoiceHtml(invoice, settings, size);
    }

    return this.getClassicInvoiceHtml(invoice, settings, size);
  }

  /**
   * Generates live preview HTML for any template & size combination.
   */
  public getTemplatePreviewHtml(
    template: InvoiceTemplateId = 'table',
    size: InvoiceSizeId = 'a4',
    settingsOverride?: Partial<SystemSettings>,
  ): string {
    const sample = this.getSampleInvoice(settingsOverride);
    return this.getInvoiceHtml(sample, {
      template,
      size,
      settingsOverride,
      autoPrint: false,
    });
  }

  /**
   * Converts a numeric amount to Arabic words (tafqeet) for invoice totals.
   * Supports values up to 9,999,999 with proper Arabic grammar.
   */
  private tafqeet(amount: number): string {
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
  private paymentBadge(invoice: SalesInvoice, isA5: boolean): string {
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
  private paymentTypeLabel(paymentType: string): string {
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
  private logoHtml(settings: SystemSettings, size: number): string {
    if (settings.invoiceShowBrandLogo === false) return '';
    if (settings.brandLogoDataUrl) {
      return `<img src="${settings.brandLogoDataUrl}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:6px;" alt="شعار">`;
    }
    const color = settings.brandPrimaryColor || '#0369a1';
    const letter = (settings.brandShortName || settings.showroomName || 'س').slice(0, 2);
    return `<div style="width:${size}px;height:${size}px;border-radius:8px;background:${this.esc(color)};display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:${Math.round(size * 0.45)}px;">${this.esc(letter)}</div>`;
  }

  private invoiceBrandStyles(settings: SystemSettings): string {
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

  private orderedInvoiceDetails(
    invoice: SalesInvoice & { items?: any[] },
    settings: SystemSettings,
    isA5: boolean,
  ): string {
    const sections: Record<InvoiceSectionId, string> = {
      promotions: settings.invoiceShowPromotions
        ? this.promotionsHtml(invoice, isA5)
        : '',
      delivery: settings.invoiceShowShipping
        ? this.deliveryDetailsHtml(invoice, isA5)
        : '',
      paymentSplits: settings.invoiceShowPaymentSplits
        ? this.paymentSplitsHtml(invoice, isA5)
        : '',
      notes: settings.invoiceShowNotes && invoice.notes
        ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:${isA5 ? '5px 8px' : '8px 10px'};margin-top:6px;"><strong style="color:#92400e;">ملاحظات إضافية:</strong><br><span style="color:#78350f;">${this.esc(invoice.notes)}</span></div>`
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

  private tableFirstColumns(settings: SystemSettings): InvoiceTableColumnId[] {
    const valid: InvoiceTableColumnId[] = [
      'number', 'product', 'unit', 'quantity', 'boxes', 'pieces', 'unitPrice', 'lineDiscount', 'total',
    ];
    const configured = settings.invoiceTableColumns;
    const columns = Array.isArray(configured)
      ? configured.filter((column): column is InvoiceTableColumnId => valid.includes(column))
      : [];
    return columns.length ? columns : ['number', 'product', 'unit', 'quantity', 'unitPrice', 'total'];
  }

  private getTableFirstInvoiceHtml(
    invoice: SalesInvoice & { items: any[] },
    settings: SystemSettings,
    size: 'a4' | 'a5',
  ): string {
    const isA5 = size === 'a5';
    const primary = /^#[0-9a-f]{6}$/i.test(settings.brandPrimaryColor || '')
      ? settings.brandPrimaryColor
      : '#0369a1';
    const tableStyle = settings.invoiceTableStyle || 'minimal';
    const columns = this.tableFirstColumns(settings);
    const documentTitle = this.printOverride('sales.invoice.a4', isA5 ? 'فاتورة مبيعات A5' : 'فاتورة مبيعات');
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
          return `<strong>${this.esc(item.productName || '-')}</strong>${settings.invoiceShowItemCode || settings.invoiceShowItemSpecs ? `<small>${settings.invoiceShowItemCode && item.productSku ? `كود: ${this.esc(item.productSku)}` : ''}${settings.invoiceShowItemCode && settings.invoiceShowItemSpecs && item.productSku && item.size ? ' · ' : ''}${settings.invoiceShowItemSpecs && item.size && item.size !== '—' ? `مقاس: ${this.esc(item.size)}` : ''}${settings.invoiceShowItemSpecs && item.productGrade ? ` · ${item.productGrade === 'GRADE_1' ? 'فرز أول' : 'فرز تجاري'}` : ''}</small>` : ''}`;
        case 'unit': return this.esc(getProductUnitLabel(item));
        case 'quantity': return this.esc(formatProductQuantity(item.quantityM2, item));
        case 'boxes': return item.productType === 'GENERAL' ? '—' : this.esc(item.boxesCount ?? '—');
        case 'pieces': return item.productType === 'GENERAL' ? '—' : this.esc(item.piecesCount ?? '—');
        case 'unitPrice': return CeramicMath.formatCurrency(item.unitPrice);
        case 'lineDiscount':
          return item.discountAmount > 0 ? CeramicMath.formatCurrency(item.discountAmount) : '—';
        case 'total': return CeramicMath.formatCurrency(item.totalPrice);
      }
    };
    const itemsHtml = (invoice.items || []).map((item, index) => `
      <tr>${columns.map((column) => `<td class="${column === 'product' ? 'product-cell' : ''}">${valueFor(column, item, index)}</td>`).join('')}</tr>
    `).join('');
    const detailsHtml = this.orderedInvoiceDetails(invoice, settings, isA5);
    const footer = this.printOverride('sales.invoice.a4.footer', settings.receiptFooter || '');
    const taxPercent = this.esc(invoice.taxPercentage ?? 0);
    const discountRow = invoice.discountAmount > 0
      ? `<div class="total-row discount-row"><span>الخصم</span><strong>−${CeramicMath.formatCurrency(invoice.discountAmount)}</strong></div>`
      : '';
    const shippingRow = invoice.shippingCost > 0
      ? `<div class="total-row"><span>التوصيل والنقل</span><strong>${CeramicMath.formatCurrency(invoice.shippingCost)}</strong></div>`
      : '';
    const taxRow = invoice.taxAmount > 0
      ? `<div class="total-row"><span>ضريبة القيمة المضافة (${taxPercent}%)</span><strong>${CeramicMath.formatCurrency(invoice.taxAmount)}</strong></div>`
      : '';
    const columnsHeading = columns.map((column) => `<th>${labels[column]}</th>`).join('');

    return `<!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>${this.esc(documentTitle)} ${this.esc(invoice.invoiceNumber)}</title>
          <style>
            @page{size:${isA5 ? 'A5' : 'A4'};margin:${isA5 ? '8mm' : '12mm'}}
            *{box-sizing:border-box}
            body{font-family:'Cairo',Tahoma,Arial,sans-serif;color:#17212b;font-size:${isA5 ? '10px' : '12px'};line-height:1.55;margin:0;padding:${isA5 ? '10px' : '20px'}}
            ${this.invoiceBrandStyles(settings)}
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
            <div class="brand">${this.logoHtml(settings, isA5 ? 38 : 48)}<div><div class="brand-name">${this.esc(settings.showroomName || 'معرض السيراميك والبورسلين')}</div><div class="brand-meta">${this.esc(settings.tagline || '')}${settings.phone ? ` · ${this.esc(settings.phone)}` : ''}${settings.address ? ` · ${this.esc(settings.address)}` : ''}</div></div></div>
            <div class="invoice-id"><div class="invoice-label">${this.esc(documentTitle)}</div><div class="invoice-number">${this.esc(invoice.invoiceNumber)}</div><div class="date-line">${this.esc(invoice.date || '')}</div></div>
          </header>
          <section class="customer-line">
            <div><span class="field-label">العميل</span><div class="field-value">${this.esc(invoice.customerName || 'عميل نقدي')}</div></div>
            <div><span class="field-label">رقم الهاتف</span><div class="field-value">${this.esc(invoice.customerPhone || '—')}</div></div>
            <div><span class="field-label">المستودع · طريقة الدفع</span><div class="field-value">${this.esc(invoice.warehouseName || '—')} · ${this.paymentTypeLabel(invoice.paymentType)}</div></div>
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
              ${discountRow}${taxRow}${shippingRow}
              <div class="total-row grand-total"><span>الإجمالي</span><strong>${CeramicMath.formatCurrency(invoice.totalAmount)}</strong></div>
              <div class="total-row paid"><span>المبلغ المسدد</span><strong>${CeramicMath.formatCurrency(invoice.paidAmount)}</strong></div>
              ${invoice.remainingAmount > 0 ? `<div class="total-row balance"><span>المتبقي</span><strong>${CeramicMath.formatCurrency(invoice.remainingAmount)}</strong></div>` : ''}
            </div>
          </section>
          <div class="signature"><span>البائع / المحاسب</span><span>استلام العميل</span><span>اعتماد الإدارة</span></div>
          ${footer ? `<footer class="footer">${this.esc(footer)}</footer>` : ''}
        </body>
      </html>`;
  }

  /**
   * Generates comprehensive tax breakdown HTML (Tax Details).
   */
  private taxBreakdownHtml(invoice: SalesInvoice, isA5: boolean): string {
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
  private promotionsHtml(invoice: SalesInvoice, isA5: boolean): string {
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
        ${hasPromo ? `<div>• عرض: <strong>${this.esc(invoice.promotionName)}</strong></div>` : ''}
        ${hasCoupon ? `<div>• كود الكوبون المطبق: <strong style="font-family:monospace;background:#d1fae5;padding:1px 5px;border-radius:3px;">${this.esc(invoice.couponCode)}</strong></div>` : ''}
        ${!hasPromo && !hasCoupon && hasGeneralDiscount ? `<div>• خصم تجاري مباشر ممنوح على الفاتورة</div>` : ''}
      </div>
    `;
  }

  /**
   * Generates delivery and shipping information HTML.
   */
  private deliveryDetailsHtml(invoice: SalesInvoice, isA5: boolean): string {
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
        ${hasAddress ? `<div><strong>عنوان التوصيل:</strong> ${this.esc(invoice.deliveryAddress)}</div>` : ''}
        ${hasContact ? `<div><strong>مستلم الموقع:</strong> ${this.esc(invoice.deliveryContactName || '-')} ${invoice.deliveryContactPhone ? `(${this.esc(invoice.deliveryContactPhone)})` : ''}</div>` : ''}
        <div style="display:flex;gap:12px;margin-top:2px;">
          ${hasDate ? `<span><strong>تاريخ التسليم:</strong> ${this.esc(invoice.deliveryDate)}</span>` : ''}
          ${hasDriver ? `<span><strong>السائق / وسيلة النقل:</strong> ${this.esc(invoice.driverName)}</span>` : ''}
        </div>
        ${invoice.deliveryNotes ? `<div style="margin-top:2px;font-style:italic;color:#14532d;">تعليمات الشحن: ${this.esc(invoice.deliveryNotes)}</div>` : ''}
      </div>
    `;
  }

  /**
   * Generates split-payment / multi-payment breakdown HTML.
   */
  private paymentSplitsHtml(invoice: SalesInvoice, isA5: boolean): string {
    const splits = invoice.paymentSplits;
    if (splits && splits.length > 0) {
      return `
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:${isA5 ? '5px 8px' : '7px 10px'};margin-top:${isA5 ? '6px' : '8px'};font-size:${isA5 ? '9px' : '11px'};color:#1e40af;">
          <div style="font-weight:800;margin-bottom:3px;border-bottom:1px solid #dbeafe;padding-bottom:2px;">
            💳 تفاصيل طرق الدفع والتحصيل (Split Payments):
          </div>
          ${splits.map((s) => `
            <div style="display:flex;justify-content:space-between;padding:1px 0;">
              <span>• ${this.paymentTypeLabel(s.method)} ${s.reference ? `<span style="font-size:${isA5 ? '8px' : '9px'};color:#3b82f6;">(${this.esc(s.reference)})</span>` : ''}:</span>
              <span style="font-weight:700;">${CeramicMath.formatCurrency(s.amount)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:${isA5 ? '5px 8px' : '7px 10px'};margin-top:${isA5 ? '6px' : '8px'};font-size:${isA5 ? '9px' : '11px'};">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span><strong>طريقة الدفع الأساسية:</strong> ${this.paymentTypeLabel(invoice.paymentType)}</span>
          <span>${this.paymentBadge(invoice, isA5)}</span>
        </div>
      </div>
    `;
  }

  /**
   * Classic Invoice Template:
   * Formal corporate layout with branding, logo, tax/commercial info,
   * amount in words (tafqeet), payment badge, signatures, and delivery notes.
   */
  private getClassicInvoiceHtml(
    invoice: SalesInvoice & { items: any[] },
    settings: SystemSettings,
    size: 'a4' | 'a5',
  ): string {
    const isA5 = size === 'a5';
    const documentTitle = this.printOverride('sales.invoice.a4', isA5 ? 'فاتورة مبيعات A5' : 'فاتورة مبيعات');
    const documentFooter = this.printOverride('sales.invoice.a4.footer', settings.receiptFooter || '');
    const currency = settings.currency || 'ر.س';

    const itemsHtml = invoice.items.map((item, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; text-align: center;${idx % 2 === 1 ? ' background:#fafbfc;' : ''}">
        <td style="padding: ${isA5 ? '5px 3px' : '7px 6px'}; color: #64748b; font-weight: 600;">${idx + 1}</td>
        <td style="padding: ${isA5 ? '5px 6px' : '7px 8px'}; text-align: right;">
          <div style="font-weight: 700; color: #0f172a;">${this.esc(item.productName)}</div>
          ${(settings.invoiceShowItemCode !== false || settings.invoiceShowItemSpecs !== false) ? `
          <div style="font-size: ${isA5 ? '9px' : '10px'}; color: #64748b; margin-top: 1px;">
            ${settings.invoiceShowItemCode !== false ? `كود: <span style="font-family:monospace;background:#f1f5f9;padding:1px 4px;border-radius:3px;">${this.esc(item.productSku)}</span>` : ''}
            ${settings.invoiceShowItemSpecs !== false && item.size && item.size !== '—' ? ` · مقاس: ${this.esc(item.size)}` : ''}
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
          <title>${this.esc(documentTitle)} ${this.esc(invoice.invoiceNumber)}</title>
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
            ${this.invoiceBrandStyles(settings)}
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand-block">
              ${this.logoHtml(settings, isA5 ? 42 : 56)}
              <div>
                <div class="showroom-title">${this.esc(settings.showroomName || 'معرض النخبة')}</div>
                <div class="tagline">${this.esc(settings.tagline || '')}</div>
                <div class="legal-info">
                  ${this.esc(settings.address || '-')} · هاتف: ${this.esc(settings.phone || '-')}
                  ${settings.commercialRecord ? `<br>السجل التجاري: ${this.esc(settings.commercialRecord)}` : ''}
                  ${settings.taxNumber ? ` · الرقم الضريبي: ${this.esc(settings.taxNumber)}` : ''}
                </div>
              </div>
            </div>
            <div style="text-align: left; min-width: ${isA5 ? '120px' : '160px'};">
              <div class="badge">${this.esc(documentTitle)}</div>
              <div class="inv-no">${this.esc(invoice.invoiceNumber)}</div>
              <div style="font-size: ${isA5 ? '10px' : '11px'}; color: #475569; margin-top: 2px;">التاريخ: ${this.esc(invoice.date)}</div>
              ${(invoice as any).dueDate && (invoice as any).dueDate !== invoice.date ? `<div style="font-size: ${isA5 ? '9px' : '10px'}; color: #92400e;">الاستحقاق: ${this.esc((invoice as any).dueDate)}</div>` : ''}
              <div style="margin-top: 4px;">${this.paymentBadge(invoice, isA5)}</div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-card">
              <div class="meta-card-title">بيانات العميل</div>
              <div><strong>الاسم:</strong> ${this.esc(invoice.customerName || 'عميل نقدي')}</div>
              <div><strong>الهاتف:</strong> ${this.esc(invoice.customerPhone || '-')}</div>
            </div>
            <div class="meta-card">
              <div class="meta-card-title">بيانات الصرف</div>
              <div><strong>المخزن:</strong> ${this.esc(invoice.warehouseName || 'المعرض الرئيسي')}</div>
              <div><strong>طريقة الدفع:</strong> ${this.paymentTypeLabel(invoice.paymentType)}</div>
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
              ${this.orderedInvoiceDetails(invoice, settings, isA5)}
            </div>
            <div class="totals-box">
              <div class="total-row"><span>المجموع الفرعي:</span> <span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
              ${invoice.discountAmount > 0 ? `<div class="total-row" style="color: #dc2626;"><span>خصم الفاتورة:</span> <span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
              ${invoice.taxAmount > 0 ? `<div class="total-row"><span>ضريبة القيمة المضافة (${this.esc(invoice.taxPercentage)}%):</span> <span>+${CeramicMath.formatCurrency(invoice.taxAmount)}</span></div>` : ''}
              ${invoice.shippingCost > 0 ? `<div class="total-row"><span>مصاريف النقل والمشال:</span> <span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
              <div class="total-row grand-total"><span>صافي الفاتورة:</span> <span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span></div>
              <div class="total-row" style="color: #16a34a; font-weight: 700; margin-top: 4px;"><span>المبلغ المسدد:</span> <span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
              ${invoice.remainingAmount > 0 ? `<div class="total-row" style="color: #dc2626; font-weight: 700;"><span>المتبقي (آجل):</span> <span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
              ${this.taxBreakdownHtml(invoice, isA5)}
            </div>
          </div>

          <div class="tafqeet-box">
            <div class="tafqeet-label">المبلغ الإجمالي بالحروف (تفقيط)</div>
            <div class="tafqeet-value">فقط ${this.tafqeet(invoice.totalAmount)} ${this.esc(currency)} لا غير</div>
          </div>

          <div class="signatures">
            <div>البائع / المحاسب</div>
            <div>توقيع العميل بالاستلام</div>
            <div>اعتماد مسؤول المبيعات</div>
          </div>

          <div class="footer">
            ${this.esc(documentFooter)}
          </div>

        </body>
      </html>
    `;
  }

  /**
   * Modern Invoice Template:
   * Contemporary styling with vibrant gradients, rounded card blocks,
   * logo, tafqeet, payment badges, delivery info, and signatures.
   */
  private getModernInvoiceHtml(
    invoice: SalesInvoice & { items: any[] },
    settings: SystemSettings,
    size: 'a4' | 'a5',
  ): string {
    const isA5 = size === 'a5';
    const documentFooter = this.printOverride('sales.invoice.a4.footer', settings.receiptFooter || '');
    const currency = settings.currency || 'ر.س';

    const itemsHtml = invoice.items.map((item, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9; text-align: center; ${idx % 2 === 1 ? 'background-color: #fafbfc;' : ''}">
        <td style="padding: ${isA5 ? '5px 3px' : '8px 6px'}; font-weight: bold; color: #64748b;">${idx + 1}</td>
        <td style="padding: ${isA5 ? '5px 6px' : '8px 10px'}; text-align: right;">
          <div style="font-weight: 700; color: #0f172a;">${this.esc(item.productName)}</div>
          ${settings.invoiceShowItemCode || settings.invoiceShowItemSpecs ? `<div style="font-size: ${isA5 ? '9px' : '10px'}; color: #64748b; margin-top: 2px; display: flex; gap: 4px; flex-wrap: wrap;">
            ${settings.invoiceShowItemCode && item.productSku ? `<span style="background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-family: monospace;">${this.esc(item.productSku)}</span>` : ''}
            ${settings.invoiceShowItemSpecs && item.size && item.size !== '—' ? `<span style="background: #f1f5f9; padding: 1px 5px; border-radius: 4px;">${this.esc(item.size)}</span>` : ''}
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
          <title>فاتورة ${this.esc(invoice.invoiceNumber)}</title>
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
            ${this.invoiceBrandStyles(settings)}
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="hero-header">
            <div class="brand-block">
              ${settings.invoiceShowBrandLogo !== false && settings.brandLogoDataUrl ? `<img src="${settings.brandLogoDataUrl}" style="width:${isA5 ? '40px' : '52px'};height:${isA5 ? '40px' : '52px'};object-fit:contain;border-radius:8px;border:2px solid rgba(255,255,255,0.2);" alt="شعار">` : ''}
              <div>
                <div class="brand-title">${this.esc(settings.showroomName || 'معرض السيراميك')}</div>
                <div class="brand-sub">${this.esc(settings.tagline || '')}</div>
                <div class="legal-line">
                  ${this.esc(settings.address || '')} • هاتف: ${this.esc(settings.phone || '')}
                  ${settings.taxNumber ? ` • ض: ${this.esc(settings.taxNumber)}` : ''}
                  ${settings.commercialRecord ? ` • س.ت: ${this.esc(settings.commercialRecord)}` : ''}
                </div>
              </div>
            </div>
            <div class="invoice-tag">
              <span class="pill">فاتورة مبيعات معتمدة</span>
              <div class="inv-no-modern">${this.esc(invoice.invoiceNumber)}</div>
              <div style="font-size: ${isA5 ? '10px' : '11px'}; color: #94a3b8;">${this.esc(invoice.date)}</div>
              ${(invoice as any).dueDate && (invoice as any).dueDate !== invoice.date ? `<div style="font-size: ${isA5 ? '9px' : '10px'}; color: #fbbf24;">الاستحقاق: ${this.esc((invoice as any).dueDate)}</div>` : ''}
              <div style="margin-top: 4px;">${this.paymentBadge(invoice, isA5)}</div>
            </div>
          </div>

          <div class="cards-grid">
            <div class="card">
              <div class="card-title">بيانات العميل</div>
              <div><strong>الاسم:</strong> ${this.esc(invoice.customerName || 'عميل نقدي')}</div>
              <div><strong>الهاتف:</strong> ${this.esc(invoice.customerPhone || '-')}</div>
              <div><strong>طريقة السداد:</strong> <span style="background: #e0f2fe; color: #0369a1; padding: 1px 6px; border-radius: 4px; font-weight: bold;">${this.paymentTypeLabel(invoice.paymentType)}</span></div>
            </div>
            <div class="card">
              <div class="card-title">بيانات الصرف والمعرض</div>
              <div><strong>المستودع:</strong> ${this.esc(invoice.warehouseName || 'المستودع الرئيسي')}</div>
              <div><strong>الرقم الضريبي:</strong> ${this.esc(settings.taxNumber || 'غير محدد')}</div>
              ${settings.commercialRecord ? `<div><strong>السجل التجاري:</strong> ${this.esc(settings.commercialRecord)}</div>` : ''}
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
              ${this.orderedInvoiceDetails(invoice, settings, isA5)}
            </div>
            <div class="summary-card">
              <div class="sum-row"><span>المجموع الفرعي</span> <span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
              ${invoice.discountAmount > 0 ? `<div class="sum-row" style="color: #e11d48;"><span>خصم الفاتورة</span> <span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
              ${invoice.taxAmount > 0 ? `<div class="sum-row"><span>ضريبة القيمة المضافة (${this.esc(invoice.taxPercentage)}%)</span> <span>+${CeramicMath.formatCurrency(invoice.taxAmount)}</span></div>` : ''}
              ${invoice.shippingCost > 0 ? `<div class="sum-row"><span>مصاريف النقل والمشال</span> <span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
              <div class="grand-sum"><span>صافي الفاتورة</span> <span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span></div>
              <div class="sum-row" style="margin-top: 6px; font-weight: 700; color: #16a34a;"><span>المبلغ المسدد</span> <span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
              ${invoice.remainingAmount > 0 ? `<div class="sum-row" style="font-weight: 700; color: #e11d48;"><span>المتبقي (آجل)</span> <span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
              ${this.taxBreakdownHtml(invoice, isA5)}
            </div>
          </div>

          <div class="tafqeet-modern">
            <div class="tafqeet-label">المبلغ الإجمالي بالحروف (تفقيط)</div>
            <div class="tafqeet-value">فقط ${this.tafqeet(invoice.totalAmount)} ${this.esc(currency)} لا غير</div>
          </div>

          <div class="signatures">
            <div>البائع / المحاسب</div>
            <div>توقيع العميل بالاستلام</div>
            <div>اعتماد مسؤول المبيعات</div>
          </div>

          <div class="footer-modern">
            ${this.esc(documentFooter)}
          </div>

        </body>
      </html>
    `;
  }

  /**
   * Compact Invoice Template:
   * Optimized for paper efficiency, high density, tight vertical height,
   * fast printing, with tafqeet and payment badge.
   */
  private getCompactInvoiceHtml(
    invoice: SalesInvoice & { items: any[] },
    settings: SystemSettings,
    size: 'a4' | 'a5',
  ): string {
    const isA5 = size === 'a5';
    const documentFooter = this.printOverride('sales.invoice.a4.footer', settings.receiptFooter || '');
    const currency = settings.currency || 'ر.س';

    const itemsHtml = invoice.items.map((item, idx) => `
      <tr style="border-bottom: 1px solid #cbd5e1; text-align: center;${idx % 2 === 1 ? ' background:#f8fafc;' : ''}">
        <td style="padding: 3px 2px;">${idx + 1}</td>
        <td style="padding: 3px 5px; text-align: right; font-weight: 600;">
          ${this.esc(item.productName)} ${(settings.invoiceShowItemCode || settings.invoiceShowItemSpecs) ? `<span style="font-size: 9px; color: #64748b;">[${settings.invoiceShowItemCode ? this.esc(item.productSku || '') : ''}${settings.invoiceShowItemCode && settings.invoiceShowItemSpecs ? ' | ' : ''}${settings.invoiceShowItemSpecs ? `${this.esc(item.size || '')} | ${item.productGrade === 'GRADE_1' ? 'أول' : 'تجاري'}` : ''}]</span>` : ''}
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
          <title>فاتورة ${this.esc(invoice.invoiceNumber)}</title>
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
            ${this.invoiceBrandStyles(settings)}
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="top-bar">
            <div style="display: flex; align-items: center; gap: 6px;">
              ${settings.invoiceShowBrandLogo !== false && settings.brandLogoDataUrl ? `<img src="${settings.brandLogoDataUrl}" style="width:${isA5 ? '24px' : '30px'};height:${isA5 ? '24px' : '30px'};object-fit:contain;" alt="">` : ''}
              <div>
                <span class="title">${this.esc(settings.showroomName)}</span>
                <span style="font-size: ${isA5 ? '9px' : '10px'}; color: #475569; margin-right: 6px;">${this.esc(settings.address || '')} | ت: ${this.esc(settings.phone || '')}</span>
              </div>
            </div>
            <div style="font-weight: 700; font-family: monospace; text-align: left;">
              <div>فاتورة: ${this.esc(invoice.invoiceNumber)}</div>
              <div style="font-size: ${isA5 ? '9px' : '10px'}; color: #475569;">${this.esc(invoice.date)}</div>
              ${this.paymentBadge(invoice, isA5)}
            </div>
          </div>

          <div class="meta-strip">
            <span><strong>العميل:</strong> ${this.esc(invoice.customerName || 'عميل نقدي')} (${this.esc(invoice.customerPhone || '-')})</span>
            <span><strong>المخزن:</strong> ${this.esc(invoice.warehouseName || '-')}</span>
            <span><strong>الدفع:</strong> ${this.paymentTypeLabel(invoice.paymentType)}</span>
            ${settings.taxNumber ? `<span><strong>ض:</strong> ${this.esc(settings.taxNumber)}</span>` : ''}
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
              ${this.orderedInvoiceDetails(invoice, settings, isA5)}
            </div>
            <div style="min-width: ${isA5 ? '180px' : '220px'};">
              <div class="tot-line"><span>المجموع:</span> <span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
              ${invoice.discountAmount > 0 ? `<div class="tot-line" style="color:#dc2626;"><span>خصم:</span> <span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
              ${invoice.taxAmount > 0 ? `<div class="tot-line"><span>ضريبة (${this.esc(invoice.taxPercentage)}%):</span> <span>+${CeramicMath.formatCurrency(invoice.taxAmount)}</span></div>` : ''}
              ${invoice.shippingCost > 0 ? `<div class="tot-line"><span>نقل:</span> <span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
              <div class="tot-line" style="font-weight: 900; border-top: 1.5px solid #000; margin-top: 2px; padding-top: 2px; font-size: ${isA5 ? '11px' : '12px'};">
                <span>الصافي:</span> <span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span>
              </div>
              <div class="tot-line" style="color: #16a34a; font-weight: 700;"><span>المسدد:</span> <span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
              ${invoice.remainingAmount > 0 ? `<div class="tot-line" style="color: #dc2626; font-weight: 700;"><span>المتبقي:</span> <span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
              ${this.taxBreakdownHtml(invoice, isA5)}
            </div>
          </div>

          <div class="tafqeet-compact">
            <strong>تفقيط:</strong> فقط ${this.tafqeet(invoice.totalAmount)} ${this.esc(currency)} لا غير
          </div>

          <div class="signatures-compact">
            <span>البائع</span>
            <span>العميل</span>
            <span>المسؤول</span>
          </div>

          <div class="footer">${this.esc(documentFooter)}</div>

        </body>
      </html>
    `;
  }

  /**
   * Detailed Showroom Template:
   * Tailored for ceramic showrooms: full SKU, size, grade, boxes, pieces columns,
   * logo, tafqeet, delivery terms, warehouse dispatch verification, and signatures.
   */
  private getDetailedInvoiceHtml(
    invoice: SalesInvoice & { items: any[] },
    settings: SystemSettings,
    size: 'a4' | 'a5',
  ): string {
    const isA5 = size === 'a5';
    const documentFooter = this.printOverride('sales.invoice.a4.footer', settings.receiptFooter || '');
    const currency = settings.currency || 'ر.س';

    const itemsHtml = invoice.items.map((item, idx) => `
      <tr style="border-bottom: 1px solid #cbd5e1; text-align: center;${idx % 2 === 1 ? ' background:#f0f9ff;' : ''}">
        <td style="padding: ${isA5 ? '4px 2px' : '6px 4px'}; font-weight: bold;">${idx + 1}</td>
        <td style="padding: ${isA5 ? '4px 4px' : '6px 6px'}; text-align: right; font-weight: 700;">
          ${this.esc(item.productName)}
        </td>
        ${settings.invoiceShowItemCode ? `<td style="padding: ${isA5 ? '4px 2px' : '6px 4px'}; font-family: monospace; font-size: ${isA5 ? '9px' : '10px'};">${this.esc(item.productSku || '-')}</td>` : ''}
        ${settings.invoiceShowItemSpecs ? `<td style="padding: ${isA5 ? '4px 2px' : '6px 4px'};">${this.esc(item.size || '—')}</td>
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
          <title>فاتورة تفصيلية ${this.esc(invoice.invoiceNumber)}</title>
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
            ${this.invoiceBrandStyles(settings)}
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header-panel">
            <div class="brand-block">
              ${this.logoHtml(settings, isA5 ? 40 : 52)}
              <div>
                <div class="showroom-title">${this.esc(settings.showroomName || 'معرض السيراميك والبورسلين')}</div>
                <div style="font-weight: 600; color: #475569;">${this.esc(settings.tagline || '')}</div>
                <div style="font-size: ${isA5 ? '9px' : '10px'}; color: #64748b; margin-top: 2px;">
                  العنوان: ${this.esc(settings.address || '-')} | هاتف: ${this.esc(settings.phone || '-')}
                  ${settings.taxNumber ? ` | ض: ${this.esc(settings.taxNumber)}` : ''}
                  ${settings.commercialRecord ? ` | س.ت: ${this.esc(settings.commercialRecord)}` : ''}
                </div>
              </div>
            </div>
            <div style="text-align: left; min-width: ${isA5 ? '130px' : '180px'};">
              <div style="font-size: ${isA5 ? '10px' : '11px'}; font-weight: 800; background: #0369a1; color: white; padding: 3px 10px; border-radius: 4px; display: inline-block;">فاتورة مبيعات تفصيلية</div>
              <div style="font-size: ${isA5 ? '13px' : '16px'}; font-weight: 900; font-family: 'Courier New', monospace; color: #0f172a; margin-top: 4px; letter-spacing: 0.5px;">${this.esc(invoice.invoiceNumber)}</div>
              <div style="font-size: ${isA5 ? '9px' : '10px'}; color: #64748b;">تاريخ التحرير: ${this.esc(invoice.date)}</div>
              ${(invoice as any).dueDate && (invoice as any).dueDate !== invoice.date ? `<div style="font-size: ${isA5 ? '9px' : '10px'}; color: #92400e;">الاستحقاق: ${this.esc((invoice as any).dueDate)}</div>` : ''}
              <div style="margin-top: 3px;">${this.paymentBadge(invoice, isA5)}</div>
            </div>
          </div>

          <table class="meta-table">
            <tr>
              <td><strong>اسم العميل:</strong> ${this.esc(invoice.customerName || 'عميل نقدي')}</td>
              <td><strong>رقم الهاتف:</strong> ${this.esc(invoice.customerPhone || '-')}</td>
              <td><strong>مستودع الصرف:</strong> ${this.esc(invoice.warehouseName || 'المستودع الرئيسي')}</td>
            </tr>
            <tr>
              <td><strong>الرقم الضريبي:</strong> ${this.esc(settings.taxNumber || 'غير مسجل')}</td>
              <td><strong>السجل التجاري:</strong> ${this.esc(settings.commercialRecord || 'غير مسجل')}</td>
              <td><strong>طريقة السداد:</strong> ${this.paymentTypeLabel(invoice.paymentType)}</td>
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
              ${this.orderedInvoiceDetails(invoice, settings, isA5)}
              ${settings.receiptFooter ? `<div style="margin-top: 4px; border-top: 1px dashed #fde68a; padding-top: 3px;">${this.esc(settings.receiptFooter)}</div>` : ''}
            </div>

            <div class="totals-box">
              <div class="tot-row"><span>إجمالي البنود:</span> <span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
              ${invoice.discountAmount > 0 ? `<div class="tot-row" style="color: #dc2626;"><span>خصم الفاتورة:</span> <span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
              ${invoice.taxAmount > 0 ? `<div class="tot-row"><span>الضريبة (${this.esc(invoice.taxPercentage)}%):</span> <span>+${CeramicMath.formatCurrency(invoice.taxAmount)}</span></div>` : ''}
              ${invoice.shippingCost > 0 ? `<div class="tot-row"><span>المشال والنقل:</span> <span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
              <div class="tot-row grand-tot"><span>صافي القيمة:</span> <span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span></div>
              <div class="tot-row" style="color: #16a34a; font-weight: 700;"><span>المبلغ المسدد:</span> <span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
              ${invoice.remainingAmount > 0 ? `<div class="tot-row" style="color: #dc2626; font-weight: 700;"><span>المتبقي (آجل):</span> <span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
              ${this.taxBreakdownHtml(invoice, isA5)}
            </div>
          </div>

          <div class="tafqeet-detailed">
            <span class="tafqeet-label">المبلغ الإجمالي بالحروف (تفقيط):</span>
            <span class="tafqeet-value"> فقط ${this.tafqeet(invoice.totalAmount)} ${this.esc(currency)} لا غير</span>
          </div>

          <div class="signatures-grid">
            <div>البائع / أمين المستودع</div>
            <div>توقيع المستلم بالمعاينة والموافقة</div>
            <div>اعتماد مسؤول المبيعات</div>
          </div>

          <div class="footer-detailed">${this.esc(documentFooter)}</div>

        </body>
      </html>
    `;
  }

  /**
   * HTML format for 80mm / 58mm thermal receipt printers.
   */
  private getThermalInvoiceHtml(
    invoice: SalesInvoice & { items: any[] },
    settings: SystemSettings,
  ): string {
    const receiptTitle = this.printOverride('sales.invoice.receipt', 'إيصال مبيعات');
    const receiptFooter = this.printOverride('sales.invoice.receipt.footer', settings.receiptFooter || '');
    const is58 = settings.thermalPaperWidth === '58';
    const paperWidth = is58 ? '58mm' : '80mm';
    const bodyWidth = is58 ? '54mm' : '76mm';

    const itemsHtml = invoice.items.map((item) => `
      <div style="margin-bottom: 5px;">
        <div style="font-weight: 700;">${this.esc(item.productName)}</div>
        <div style="font-size: 10px; color: #444;">${this.esc(item.productSku)} | ${this.esc(item.size || '')} | ${item.productGrade === 'GRADE_1' ? 'أول' : 'تجاري'}</div>
        <div style="display: flex; justify-content: space-between;">
          <span>${formatProductQuantity(item.quantityM2, item)}${item.productType === 'GENERAL' ? '' : ` (${item.boxesCount} كرتونة)`} × ${item.unitPrice}</span>
          <span style="font-weight: 700;">${CeramicMath.formatCurrency(item.totalPrice)}</span>
        </div>
        ${settings.invoiceShowLineDiscount && item.discountAmount > 0 ? `<div style="display: flex; justify-content: space-between; color: #b91c1c; font-size: 10px;"><span>خصم</span><span>-${CeramicMath.formatCurrency(item.discountAmount)}</span></div>` : ''}
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>إيصال ${this.esc(invoice.invoiceNumber)}</title>
          <style>
            @page { size: ${paperWidth} auto; margin: 2mm; }
            * { box-sizing: border-box; }
            body { font-family: 'Cairo', Tahoma, system-ui, sans-serif; width: ${bodyWidth}; margin: 0 auto; padding: 4px; color: #000; font-size: 12px; line-height: 1.45; }
            .center { text-align: center; }
            .shop-name { font-size: 15px; font-weight: 800; }
            .muted { color: #444; font-size: 10px; white-space: pre-line; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            .meta-row { display: flex; justify-content: space-between; gap: 6px; }
            .totals-row { display: flex; justify-content: space-between; }
            .grand { font-size: 15px; font-weight: 800; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; }
            .footer { text-align: center; font-size: 10px; margin-top: 8px; white-space: pre-line; }
            ${this.invoiceBrandStyles(settings)}
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          ${settings.invoiceShowBrandLogo !== false ? `<div class="center">${this.logoHtml(settings, 26)}</div>` : ''}
          <div class="center shop-name">${this.esc(settings.showroomName)}</div>
          <div class="center muted">${this.esc(settings.tagline || '')}</div>
          <div class="center muted">${this.esc(settings.address || '')}${settings.phone ? ' | ت: ' + this.esc(settings.phone) : ''}</div>
          ${settings.taxNumber ? `<div class="center muted">الرقم الضريبي: ${this.esc(settings.taxNumber)}</div>` : ''}
          <div class="divider"></div>
          <div class="meta-row"><span>${this.esc(receiptTitle)}</span><span style="font-family: monospace; font-weight: 700;">${this.esc(invoice.invoiceNumber)}</span></div>
          <div class="meta-row"><span>التاريخ</span><span>${this.esc(invoice.date)}</span></div>
          <div class="meta-row"><span>العميل</span><span>${this.esc(invoice.customerName || 'عميل نقدي')}</span></div>
          <div class="meta-row"><span>المخزن</span><span>${this.esc(invoice.warehouseName || '-')}</span></div>
          <div class="divider"></div>
          ${itemsHtml}
          <div class="divider"></div>
          <div class="totals-row"><span>المجموع الفرعي</span><span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
          ${invoice.discountAmount > 0 ? `<div class="totals-row"><span>خصم الفاتورة</span><span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
          ${invoice.taxAmount > 0 ? `<div class="totals-row"><span>ضريبة</span><span>+${CeramicMath.formatCurrency(invoice.taxAmount)}</span></div>` : ''}
          ${invoice.shippingCost > 0 ? `<div class="totals-row"><span>مشال ونقل</span><span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
          <div class="totals-row grand"><span>الإجمالي</span><span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span></div>
          <div class="totals-row"><span>المدفوع</span><span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
          <div class="totals-row"><span>طريقة الدفع</span><span>${invoice.paymentType === 'CASH' ? 'نقدي' : 'آجل'}</span></div>
          ${invoice.remainingAmount > 0 ? `<div class="totals-row" style="color: #b91c1c; font-weight: 700;"><span>المتبقي</span><span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
          ${this.orderedInvoiceDetails(invoice, settings, true)}
          <div class="footer">${this.esc(receiptFooter)}</div>
        </body>
      </html>
    `;
  }

  public printInvoice(
    invoice: SalesInvoice & { items: any[] },
    size?: InvoiceSizeId,
    template?: InvoiceTemplateId,
  ): void {
    const printWindow = window.open('about:blank', '_blank', 'width=850,height=900');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة لطباعة الفاتورة');
      return;
    }
    writeAndPrintWindow(
      printWindow,
      this.getInvoiceHtml(invoice, { size, template }),
      true,
    );
  }

  /**
   * Prints a test page for the selected paper size and template.
   */
  public printTestPage(
    size: InvoiceSizeId = 'a4',
    template: InvoiceTemplateId = 'table',
  ): void {
    const sample = this.getSampleInvoice();
    this.printInvoice(sample, size, template);
  }

  /**
   * 80mm thermal receipt for point-of-sale checkout. Kept intentionally compact
   * (no table borders, monospace-ish) so it renders correctly on narrow roll paper.
   */
  public async printThermalReceipt(invoice: SalesInvoice & { items: any[] }): Promise<void> {
    const settings = this.getSettings();
    const receiptTitle = this.printOverride('sales.invoice.receipt', 'إيصال بيع');
    const receiptFooter = this.printOverride('sales.invoice.receipt.footer', settings.receiptFooter || '');

    if (await this.printThermalReceiptDirect(invoice, settings)) return;

    const printWindow = window.open('about:blank', '_blank', 'width=380,height=640');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة لطباعة الإيصال');
      return;
    }

    const itemsHtml = invoice.items.map((item) => `
      <div class="item">
        <div class="item-name">${this.esc(item.productName)}</div>
        <div class="item-meta">${this.esc(item.productSku)} | مقاس ${this.esc(item.size)} | ${item.productGrade === 'GRADE_1' ? 'فرز أول' : 'فرز ثاني/تجاري'}</div>
        <div class="item-row">
          <span>${formatProductQuantity(item.quantityM2, item)}${item.productType === 'GENERAL' ? '' : ` (${item.boxesCount} كرتونة)`} × ${item.unitPrice}</span>
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
          <title>إيصال ${this.esc(invoice.invoiceNumber)}</title>
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
          <div class="center shop-name">${this.esc(settings.showroomName)}</div>
          <div class="center muted">${this.esc(settings.tagline || '')}</div>
          <div class="center muted">${this.esc(settings.address || '')}${settings.phone ? ' | ت: ' + this.esc(settings.phone) : ''}</div>
          <div class="divider"></div>
          <div class="meta-row"><span>${this.esc(receiptTitle)}</span><span>${this.esc(invoice.invoiceNumber)}</span></div>
          <div class="meta-row"><span>التاريخ</span><span>${this.esc(invoice.date)}</span></div>
          <div class="meta-row"><span>العميل</span><span>${this.esc(invoice.customerName || 'عميل نقدي')}</span></div>
          <div class="meta-row"><span>المخزن</span><span>${this.esc(invoice.warehouseName || '-')}</span></div>
          <div class="divider"></div>
          ${itemsHtml}
          <div class="divider"></div>
          <div class="totals-row"><span>المجموع الفرعي</span><span>${CeramicMath.formatCurrency(invoice.subtotal)}</span></div>
          ${invoice.discountAmount > 0 ? `<div class="totals-row"><span>خصم الفاتورة</span><span>-${CeramicMath.formatCurrency(invoice.discountAmount)}</span></div>` : ''}
          ${invoice.taxAmount > 0 ? `<div class="totals-row"><span>ضريبة</span><span>+${CeramicMath.formatCurrency(invoice.taxAmount)}</span></div>` : ''}
          ${invoice.shippingCost > 0 ? `<div class="totals-row"><span>مشال ونقل</span><span>+${CeramicMath.formatCurrency(invoice.shippingCost)}</span></div>` : ''}
          <div class="totals-row grand"><span>الإجمالي</span><span>${CeramicMath.formatCurrency(invoice.totalAmount)}</span></div>
          <div class="totals-row"><span>المدفوع</span><span>${CeramicMath.formatCurrency(invoice.paidAmount)}</span></div>
          <div class="totals-row"><span>طريقة الدفع</span><span>${invoice.paymentType === 'CASH' ? 'نقدي' : invoice.paymentType === 'CARD' ? 'بطاقة' : invoice.paymentType === 'BANK_TRANSFER' ? 'تحويل بنكي' : invoice.paymentType === 'CHEQUE' ? 'شيك' : invoice.paymentType === 'MIXED' ? 'دفع مختلط' : 'آجل'}</span></div>
          ${invoice.remainingAmount > 0 ? `<div class="totals-row"><span>المتبقي (آجل)</span><span>${CeramicMath.formatCurrency(invoice.remainingAmount)}</span></div>` : ''}
          <div class="footer">${this.esc(receiptFooter || '')}</div>
        </body>
      </html>
    `;

    writeAndPrintWindow(printWindow, html, true);
  }

  private async printThermalReceiptDirect(
    invoice: SalesInvoice & { items: any[] },
    settings: SystemSettings,
  ): Promise<boolean> {
    // Direct ESC/POS route: raw bytes to the OS spooler (winspool/CUPS) or
    // straight over TCP 9100 for network printers — silent, no dialog.
    if (!settings.thermalPrinterName || !window.ceramisys?.printing?.raw) return false;

    try {
      const width = EscPosService.lineWidthFor(settings);
      const bytes = EscPosService.buildReceiptBytes(invoice, settings, width);
      const isNetwork = settings.thermalTransport === 'network';
      const res = await window.ceramisys.printing.raw(bytes, settings.thermalPrinterName, isNetwork
        ? { transport: 'network', host: settings.thermalHost, port: 9100 }
        : { transport: 'system' });
      if (res?.ok) return true;
      console.warn('Direct ESC/POS printing failed, falling back to dialog:', res?.error);
    } catch (error) {
      console.warn('Direct ESC/POS printing failed, falling back to dialog:', error);
    }

    return false;
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
    const win = window.open('about:blank', '_blank', 'width=900,height=900');
    if (!win) {
      alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
      return;
    }
    writeAndPrintWindow(win, `<!DOCTYPE html>
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
      </style></head><body>${body}</body></html>`, false);
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
    const quotationTitle = this.printOverride('quotation.a4', 'عرض سعر / مقايسة');
    const quotationFooter = this.printOverride('quotation.a4.footer', settings.receiptFooter || '');
    const productItems = (quotation.items || []).map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td class="name">${this.esc(item.productName)}${item.size ? ` (${this.esc(item.size)})` : ''}</td>
        <td>${this.esc(item.grade)}</td>
        <td>${formatProductQuantity(Number(item.quantityM2 || 0), item)}</td>
        <td>${item.productType === 'GENERAL' ? '—' : Number(item.boxesCount || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.unitPrice || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.totalPrice || 0)}</td>
      </tr>`).join('');
    const serviceItems = (quotation.serviceItems || []).map((item: any, i: number) => `
      <tr>
        <td>${(quotation.items || []).length + i + 1}</td>
        <td class="name">${this.esc(item.description || 'خدمة / عمالة')}</td>
        <td>خدمة</td>
        <td>${this.esc(item.quantity || 0)} ${this.esc(item.unit || 'بند')}</td>
        <td>—</td>
        <td>${CeramicMath.formatCurrency(item.unitPrice || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.totalPrice || 0)}</td>
      </tr>`).join('');
    const items = productItems + serviceItems;
    const itemCount = (quotation.items || []).length + (quotation.serviceItems || []).length;
    const statusLabel = quotation.status === 'CONVERTED' ? 'محوّل إلى فاتورة'
      : quotation.status === 'EXPIRED' ? 'منتهي الصلاحية'
      : quotation.status === 'CANCELLED' ? 'ملغي' : 'بانتظار الموافقة';

    this.openDocument(`عرض سعر ${quotation.quotationNumber}`, `
      ${this.header(settings, quotationTitle, quotation.quotationNumber, quotation.date, `صالح لغاية: ${this.esc(quotation.validUntil)}`)}
      <div class="meta">
        <div><b>العميل:</b> ${this.esc(quotation.customerName || 'عميل نقدي')}</div>
        <div><b>الهاتف:</b> ${this.esc(quotation.customerPhone || '-')}</div>
        <div><b>الحالة:</b> ${this.esc(statusLabel)}</div>
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
      ${quotation.notes ? `<div class="notes"><b>ملاحظات وشروط:</b>\n${this.esc(quotation.notes)}</div>` : ''}
      <div class="sign"><div>توقيع العميل بالقبول</div><div>إدارة المبيعات</div></div>
      <div class="footer">${this.esc(quotationFooter)}</div>
    `);
  }

  public printOrder(order: any): void {
    const settings = this.getSettings();
    const items = (order.items || []).map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td class="name">${this.esc(item.productName)}${item.size ? ` (${this.esc(item.size)})` : ''}</td>
        <td>${this.esc(item.grade)}</td>
        <td>${formatProductQuantity(Number(item.quantityM2 || 0), item)}</td>
        <td>${item.productType === 'GENERAL' ? '—' : Number(item.boxesCount || 0)}</td>
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
        <thead><tr><th>#</th><th>الصنف والبيان</th><th>الفرز</th><th>الكمية</th><th>الكراتين</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
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
        <td>${formatProductQuantity(Number(item.quantityM2 || 0), item)}</td>
        <td>${item.productType === 'GENERAL' ? '—' : Number(item.boxesCount || 0)}</td>
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
      <div class="footer">${this.esc(settings.receiptFooter)}</div>
    `);
  }

  public printPurchaseReturn(purchaseReturn: any): void {
    const settings = this.getSettings();
    const items = (purchaseReturn.items || []).map((item: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td class="name">${this.esc(item.productName)}</td>
        <td>${this.esc(item.grade)}</td>
        <td>${formatProductQuantity(Number(item.quantityM2 || 0), item)}</td>
        <td>${item.productType === 'GENERAL' ? '—' : Number(item.boxesCount || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.unitCost || 0)}</td>
        <td>${CeramicMath.formatCurrency(item.totalRefund || 0)}</td>
      </tr>`).join('');

    const isCash = Number(purchaseReturn.refundedAmount || 0) > 0;

    this.openDocument(`مرتجع شراء ${purchaseReturn.returnNumber}`, `
      ${this.header(settings, 'سند مرتجع مشتريات', purchaseReturn.returnNumber, purchaseReturn.date, `الفاتورة الأصلية: ${this.esc(purchaseReturn.originalInvoiceNumber || '')}`)}
      <div class="meta">
        <div><b>المورد:</b> ${this.esc(purchaseReturn.supplierName || '-')}</div>
        <div><b>المخزن:</b> ${this.esc(purchaseReturn.warehouseName || '-')}</div>
        <div><b>سبب الإرجاع:</b> ${this.esc(purchaseReturn.reason || '-')}</div>
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
      <div class="footer">${this.esc(settings.receiptFooter)}</div>
    `);
  }
}
