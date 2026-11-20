import React from 'react';
import { ArrowDown, ArrowUp, SlidersHorizontal, Upload } from 'lucide-react';
import type { InvoiceSectionId, SystemSettings } from '../../../../types';
import { ColorInput, Field, inputCls, labelCls } from '../AdminSettingsFields';
import { INVOICE_SECTION_OPTIONS } from './constants';
import type { SettingsSetter } from './types';

interface InvoiceDetailsSectionProps {
  settings: SystemSettings;
  set: SettingsSetter;
  readOnly: boolean;
  onLogo: (file: File | undefined) => void;
  invoiceSectionOrder: InvoiceSectionId[];
  moveInvoiceSection: (section: InvoiceSectionId, direction: -1 | 1) => void;
}

export const InvoiceDetailsSection: React.FC<InvoiceDetailsSectionProps> = ({
  settings,
  set,
  readOnly,
  onLogo,
  invoiceSectionOrder,
  moveInvoiceSection,
}) => (
  <section className="rounded-2xl border border-line bg-surface p-4 space-y-4">
    <div className="flex items-start gap-2 border-b border-line pb-3">
      <SlidersHorizontal className="mt-0.5 h-4 w-4 text-primary" />
      <div>
        <h4 className="text-xs font-black text-ink ">تفاصيل الفاتورة ومظهرها</h4>
        <p className="mt-1 text-[11px] text-muted ">
          تُحفظ البيانات كما هي؛ هذه الخيارات تحدد ما يظهر في النسخة المطبوعة فقط. اللونان يستخدمان إعدادات الهوية المشتركة.
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { key: 'invoiceShowPromotions' as const, label: 'إظهار تفاصيل العروض والقسائم' },
        { key: 'invoiceShowShipping' as const, label: 'إظهار تفاصيل الشحن والتوصيل' },
        { key: 'invoiceShowPaymentSplits' as const, label: 'إظهار تفاصيل الدفعات المجزأة' },
        { key: 'invoiceShowNotes' as const, label: 'إظهار الملاحظات الإضافية' },
      ].map((option) => (
        <label key={option.key} className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted/60 p-2.5 text-[11px] font-semibold text-ink dark:bg-primary/40 ">
          <input
            type="checkbox"
            checked={settings[option.key] === true}
            disabled={readOnly}
            onChange={(event) => set(option.key, event.target.checked)}
            className="accent-primary"
          />
          {option.label}
        </label>
      ))}
    </div>

    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="space-y-2">
        <span className={labelCls}>ترتيب التفاصيل الاختيارية في الفاتورة</span>
        {invoiceSectionOrder.map((section, index) => {
          const option = INVOICE_SECTION_OPTIONS.find((item) => item.id === section)!;
          return (
            <div key={section} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2 ">
              <span className="text-[11px] font-semibold text-ink ">{index + 1}. {option.label}</span>
              <div className="flex gap-1">
                <button type="button" aria-label={`تحريك ${option.label} لأعلى`} disabled={readOnly || index === 0} onClick={() => moveInvoiceSection(section, -1)} className="rounded border border-line p-1 text-ink-secondary disabled:opacity-40 ">
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button type="button" aria-label={`تحريك ${option.label} لأسفل`} disabled={readOnly || index === invoiceSectionOrder.length - 1} onClick={() => moveInvoiceSection(section, 1)} className="rounded border border-line p-1 text-ink-secondary disabled:opacity-40 ">
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="اللون الأساسي">
            <ColorInput disabled={readOnly} value={settings.brandPrimaryColor || '#34445a'} onChange={(value) => set('brandPrimaryColor', value)} />
          </Field>
          <Field label="اللون المساند">
            <ColorInput disabled={readOnly} value={settings.brandAccentColor || '#64748b'} onChange={(value) => set('brandAccentColor', value)} />
          </Field>
        </div>
        <Field label="خط الفاتورة">
          <select disabled={readOnly} value={settings.invoiceFontFamily || 'Cairo'} onChange={(event) => set('invoiceFontFamily', event.target.value as SystemSettings['invoiceFontFamily'])} className={inputCls}>
            <option value="Cairo">القاهرة</option>
            <option value="Tajawal">تجوال</option>
            <option value="Tahoma">تاهوما</option>
            <option value="Arial">أريال</option>
          </select>
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-2.5 ">
          <label className="flex items-center gap-2 text-[11px] font-semibold text-ink ">
            <input type="checkbox" checked={settings.invoiceShowBrandLogo !== false} disabled={readOnly} onChange={(event) => set('invoiceShowBrandLogo', event.target.checked)} className="accent-primary" />
            إظهار شعار المعرض
          </label>
          <label className="cursor-pointer rounded-lg border border-dashed border-line-strong px-2.5 py-1.5 text-[10px] font-bold text-ink-secondary hover:bg-surface-muted dark:hover:bg-primary">
            <Upload className="mr-1 inline h-3 w-3" />{settings.brandLogoDataUrl ? 'تغيير الشعار' : 'رفع الشعار'}
            <input type="file" accept="image/*" disabled={readOnly} className="hidden" onChange={(event) => onLogo(event.target.files?.[0])} />
          </label>
        </div>
      </div>
    </div>
  </section>
);
