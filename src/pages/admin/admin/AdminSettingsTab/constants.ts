import React from 'react';
import {
  Store, ReceiptText, Boxes, ShieldCheck, Truck, Download,
  Palette, SlidersHorizontal,
} from 'lucide-react';
import type { InvoiceSectionId, InvoiceTableColumnId } from '../../../../types';
import type { PosPaymentVisibilitySetting, Tab, NavigationLayoutValue } from './types';

export const POS_PAYMENT_VISIBILITY_OPTIONS: { key: PosPaymentVisibilitySetting; label: string }[] = [
  { key: 'posShowCashButton', label: 'نقدي' },
  { key: 'posShowCardButton', label: 'بطاقة' },
  { key: 'posShowBankTransferButton', label: 'تحويل بنكي' },
  { key: 'posShowChequeButton', label: 'شيك' },
  { key: 'posShowCreditButton', label: 'آجل' },
  { key: 'posShowMixedPaymentButton', label: 'دفع مختلط' },
];

export const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'الإعدادات العامة', icon: Store },
  { id: 'business', label: 'إعدادات النشاط', icon: Boxes },
  { id: 'branding', label: 'الهوية والمظهر', icon: Palette },
  { id: 'customization', label: 'تخصيص الواجهة', icon: SlidersHorizontal },
  { id: 'invoice', label: 'الفواتير والطباعة', icon: ReceiptText },
  { id: 'inventory', label: 'المخزون والتكلفة', icon: Boxes },
  { id: 'operations', label: 'التشغيل والموافقات', icon: Truck },
  { id: 'security', label: 'الأمان', icon: ShieldCheck },
  { id: 'backup', label: 'النسخ والاستعادة', icon: Download },
];

export const DEFAULT_INVOICE_SECTION_ORDER: InvoiceSectionId[] = ['promotions', 'delivery', 'paymentSplits', 'notes'];
export const DEFAULT_INVOICE_TABLE_COLUMNS: InvoiceTableColumnId[] = ['number', 'product', 'unit', 'quantity', 'unitPrice', 'total'];
export const INVOICE_SECTION_OPTIONS: { id: InvoiceSectionId; label: string }[] = [
  { id: 'promotions', label: 'العروض والخصومات الإضافية' },
  { id: 'delivery', label: 'الشحن والتوصيل' },
  { id: 'paymentSplits', label: 'تفاصيل الدفعات المجزأة' },
  { id: 'notes', label: 'الملاحظات الإضافية' },
];
export const INVOICE_COLUMN_OPTIONS: { id: InvoiceTableColumnId; label: string }[] = [
  { id: 'number', label: 'رقم البند' },
  { id: 'product', label: 'الصنف والبيان' },
  { id: 'unit', label: 'الوحدة' },
  { id: 'quantity', label: 'الكمية' },
  { id: 'boxes', label: 'عدد الكراتين' },
  { id: 'pieces', label: 'عدد القطع' },
  { id: 'unitPrice', label: 'سعر الوحدة' },
  { id: 'lineDiscount', label: 'خصم البند' },
  { id: 'total', label: 'الإجمالي' },
];

export const NAVIGATION_LAYOUT_OPTIONS: { value: NavigationLayoutValue; label: string; hint: string }[] = [
  {
    value: 'sidebar',
    label: 'قائمة جانبية',
    hint: 'شريط علوي للعنوان + قائمة تنقل رأسية على الجانب (الافتراضي).',
  },
  {
    value: 'header',
    label: 'شريط علوي',
    hint: 'القائمة الرئيسية داخل الهيدر أفقيًا بدون قائمة جانبية على الشاشات الكبيرة.',
  },
];
