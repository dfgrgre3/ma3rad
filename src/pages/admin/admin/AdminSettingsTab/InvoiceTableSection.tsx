import React from 'react';
import { ArrowDown, ArrowUp, Check, Table as TableIcon } from 'lucide-react';
import type { InvoiceTableColumnId, SystemSettings } from '../../../../types';
import type { SettingsSetter } from './types';
import { INVOICE_COLUMN_OPTIONS } from './constants';

interface InvoiceTableSectionProps {
  settings: SystemSettings;
  set: SettingsSetter;
  readOnly: boolean;
  invoiceTableColumns: InvoiceTableColumnId[];
  setInvoiceTableColumn: (column: InvoiceTableColumnId, checked: boolean) => void;
  setInvoiceTableColumnGroup: (columns: InvoiceTableColumnId[], checked: boolean) => void;
  moveInvoiceTableColumn: (column: InvoiceTableColumnId, direction: -1 | 1) => void;
}

export const InvoiceTableSection: React.FC<InvoiceTableSectionProps> = ({
  settings,
  set,
  readOnly,
  invoiceTableColumns,
  setInvoiceTableColumn,
  setInvoiceTableColumnGroup,
  moveInvoiceTableColumn,
}) => (
  <div className="rounded-2xl border border-line bg-surface p-4 space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-line pb-3">
      <div className="flex items-center gap-2">
        <TableIcon className="w-4 h-4 text-primary" />
        <div>
          <h4 className="text-xs font-black text-ink ">
            تصميم شكل جدول الأصناف في الفواتير (Invoice Items Table Styling)
          </h4>
          <p className="text-[11px] text-muted">
            تخصيص نمط الحدود والتسطير، والأعمدة المعروضة في جداول الفاتورة A4 و A5 والمطبوعات
          </p>
        </div>
      </div>
    </div>

    {/* Table Style Options */}
    <div>
      <label className="text-xs font-bold text-ink block mb-2">
        نمط تسطير الجدول
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            id: 'bordered' as const,
            title: 'كلاسيكي بشبكة حدود (Grid Bordered)',
            desc: 'حدود كاملة لكل خلية وعمود، النمط المعتمد الأكثر دقة ووضوحاً للمعاملات الرسمية.',
          },
          {
            id: 'striped' as const,
            title: 'عصري بسطور متناوبة (Zebra Striped)',
            desc: 'خلفيات رمادية خفيفة متبادلة للسطور مع حدود أفقية ناعمة، مريح وسهل القراءة.',
          },
          {
            id: 'minimal' as const,
            title: 'مدمج وموفر للورق (Clean Minimal)',
            desc: 'خطوط أفقية ناعمة فقط ومسافات مضغوطة لتقليل استهلاك حبر وطباعة الورق.',
          },
        ].map((styleOption) => {
          const isSelected = (settings.invoiceTableStyle || 'minimal') === styleOption.id;
          return (
            <button
              key={styleOption.id}
              type="button"
              disabled={readOnly}
              onClick={() => set('invoiceTableStyle', styleOption.id)}
              className={`p-3 rounded-xl border text-right transition flex flex-col justify-between ${
                isSelected
                  ? 'border-primary bg-accent-soft/50 dark:bg-primary/20 ring-1 ring-primary shadow-sm'
                  : 'border-line bg-surface-muted/40 dark:bg-primary/40 hover:border-line-strong'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-ink ">
                    {styleOption.title}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                </div>
                <p className="text-[11px] text-muted leading-relaxed">
                  {styleOption.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>

    {/* Column Visibility Toggles */}
    <div className="border-t border-line pt-3">
      <label className="text-xs font-bold text-ink block mb-2">
        تخصيص أعمدة وبيانات بنود الفاتورة
      </label>
      <p className="mb-2 text-[10px] text-muted">
        اختر الأعمدة ورتّبها من الأعلى إلى الأسفل؛ اسم الصنف مطلوب دائماً، والخصومات والكراتين مخفية افتراضياً.
      </p>
      <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {INVOICE_COLUMN_OPTIONS.map((column) => {
          const selected = invoiceTableColumns.includes(column.id);
          const position = invoiceTableColumns.indexOf(column.id);
          return (
            <div key={column.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2 ">
              <label className="flex items-center gap-2 text-[11px] font-medium text-ink ">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={readOnly || column.id === 'product'}
                  onChange={(event) => setInvoiceTableColumn(column.id, event.target.checked)}
                  className="accent-primary"
                />
                {column.label}
              </label>
              {selected && (
                <div className="flex gap-1">
                  <button type="button" aria-label={`تحريك ${column.label} لأعلى`} disabled={readOnly || position === 0} onClick={() => moveInvoiceTableColumn(column.id, -1)} className="rounded border border-line p-1 text-ink-secondary disabled:opacity-40 ">
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button type="button" aria-label={`تحريك ${column.label} لأسفل`} disabled={readOnly || position === invoiceTableColumns.length - 1} onClick={() => moveInvoiceTableColumn(column.id, 1)} className="rounded border border-line p-1 text-ink-secondary disabled:opacity-40 ">
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        <label className="flex items-center gap-2 p-2.5 rounded-xl border border-line bg-surface-muted/50 dark:bg-primary/40 cursor-pointer text-xs font-semibold text-ink ">
          <input
            type="checkbox"
            checked={settings.invoiceShowItemCode !== false}
            disabled={readOnly}
            onChange={(e) => set('invoiceShowItemCode', e.target.checked)}
            className="accent-primary rounded"
          />
          إظهار كود الصنف (SKU / الباركود)
        </label>

        <label className="flex items-center gap-2 p-2.5 rounded-xl border border-line bg-surface-muted/50 dark:bg-primary/40 cursor-pointer text-xs font-semibold text-ink ">
          <input
            type="checkbox"
            checked={settings.invoiceShowItemSpecs !== false}
            disabled={readOnly}
            onChange={(e) => set('invoiceShowItemSpecs', e.target.checked)}
            className="accent-primary rounded"
          />
          إظهار المقاس وفرز الصنف
        </label>

        <label className="flex items-center gap-2 p-2.5 rounded-xl border border-line bg-surface-muted/50 dark:bg-primary/40 cursor-pointer text-xs font-semibold text-ink ">
          <input
            type="checkbox"
            checked={invoiceTableColumns.includes('boxes') || invoiceTableColumns.includes('pieces')}
            disabled={readOnly}
            onChange={(e) => setInvoiceTableColumnGroup(['boxes', 'pieces'], e.target.checked)}
            className="accent-primary rounded"
          />
          إظهار عدد الكراتين والقطع
        </label>

        <label className="flex items-center gap-2 p-2.5 rounded-xl border border-line bg-surface-muted/50 dark:bg-primary/40 cursor-pointer text-xs font-semibold text-ink ">
          <input
            type="checkbox"
            checked={invoiceTableColumns.includes('lineDiscount')}
            disabled={readOnly}
            onChange={(e) => setInvoiceTableColumn('lineDiscount', e.target.checked)}
            className="accent-primary rounded"
          />
          إظهار عمود الخصم للبند
        </label>

        <label className="flex items-center gap-2 p-2.5 rounded-xl border border-line bg-surface-muted/50 dark:bg-primary/40 cursor-pointer text-xs font-semibold text-ink ">
          <input
            type="checkbox"
            checked={settings.invoiceShowTableSummary !== false}
            disabled={readOnly}
            onChange={(e) => set('invoiceShowTableSummary', e.target.checked)}
            className="accent-primary rounded"
          />
          إظهار شريط ملخص الجدول (إجمالي البنود والكميات)
        </label>
      </div>
    </div>

    {/* Table Live Mini-Preview */}
    <div className="border-t border-line pt-3">
      <span className="text-[11px] font-bold text-muted mb-2 block">
        معاينة مباشرة لشكل جدول الأصناف:
      </span>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface text-xs">
        <table className="w-full text-center border-collapse">
          <thead>
            <tr className="bg-surface-sunken text-ink font-bold border-b-2 border-line-strong ">
              <th className="p-2 w-8 border border-line ">#</th>
              <th className="p-2 text-right border border-line ">الصنف والبيان</th>
              <th className="p-2 border border-line ">الوحدة</th>
              <th className="p-2 border border-line ">الكمية</th>
              <th className="p-2 border border-line ">السعر</th>
              {settings.invoiceShowLineDiscount !== false && (
                <th className="p-2 border border-line ">الخصم</th>
              )}
              <th className="p-2 border border-line ">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            <tr className={`${
              settings.invoiceTableStyle === 'striped' ? 'bg-surface-muted/60 dark:bg-primary/30' : ''
            } ${settings.invoiceTableStyle === 'minimal' ? 'border-b border-line ' : 'border-b border-line '}`}>
              <td className="p-2 border border-line text-muted">1</td>
              <td className="p-2 text-right border border-line ">
                <div className="font-bold text-ink ">سيراميك كليوباترا رويال بيج 60×120</div>
                <div className="text-[10px] text-muted flex gap-2 mt-0.5">
                  {settings.invoiceShowItemCode !== false && <span>كود: CL-6012-ROY</span>}
                  {settings.invoiceShowItemSpecs !== false && <span>مقاس: 60×120 · فرز أول</span>}
                </div>
              </td>
              <td className="p-2 border border-line ">م²</td>
              <td className="p-2 border border-line font-bold">
                45 م²
                {settings.invoiceShowBoxesCount !== false && (
                  <div className="text-[10px] text-muted font-normal">31 كرتونة</div>
                )}
              </td>
              <td className="p-2 border border-line ">220.00</td>
              {settings.invoiceShowLineDiscount !== false && (
                <td className="p-2 border border-line text-muted">—</td>
              )}
              <td className="p-2 border border-line font-black text-primary">9,900.00</td>
            </tr>
            <tr className={`${
              settings.invoiceTableStyle === 'striped' ? 'bg-surface ' : ''
            } ${settings.invoiceTableStyle === 'minimal' ? 'border-b border-line ' : 'border-b border-line '}`}>
              <td className="p-2 border border-line text-muted">2</td>
              <td className="p-2 text-right border border-line ">
                <div className="font-bold text-ink ">غراء سيراميك سافيتو سوبر 25 كجم</div>
                <div className="text-[10px] text-muted flex gap-2 mt-0.5">
                  {settings.invoiceShowItemCode !== false && <span>كود: SAV-25KG-SUP</span>}
                </div>
              </td>
              <td className="p-2 border border-line ">شيكارة</td>
              <td className="p-2 border border-line font-bold">5</td>
              <td className="p-2 border border-line ">110.00</td>
              {settings.invoiceShowLineDiscount !== false && (
                <td className="p-2 border border-line text-danger font-bold">25.00</td>
              )}
              <td className="p-2 border border-line font-black text-primary">525.00</td>
            </tr>
          </tbody>
        </table>
        {settings.invoiceShowTableSummary !== false && (
          <div className="p-2 bg-surface-muted dark:bg-primary/60 border-t border-line flex justify-around text-[11px] text-ink-secondary ">
            <span>عدد البنود: <strong>2</strong></span>
            <span>إجمالي الكراتين: <strong>31</strong></span>
            <span>إجمالي الكمية: <strong>50</strong></span>
          </div>
        )}
      </div>
    </div>
  </div>
);
