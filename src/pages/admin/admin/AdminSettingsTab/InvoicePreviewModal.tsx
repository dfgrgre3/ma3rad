import React from 'react';
import { createPortal } from 'react-dom';
import { Check, Eye, Printer, X } from 'lucide-react';
import type { SystemSettings } from '../../../../types';
import type { PrintService } from '../../../../services/shared/PrintService';
import type { InvoiceSizeId, InvoiceTemplateId } from '../../../../services/shared/PrintService';
import type { useToast } from '../../../../components/ui/Toast';
import type { SettingsSetter } from './types';

type ToastApi = ReturnType<typeof useToast>;

interface InvoicePreviewModalProps {
  settings: SystemSettings;
  set: SettingsSetter;
  readOnly: boolean;
  toast: ToastApi;
  printService: PrintService;
  previewTemplate: InvoiceTemplateId;
  setPreviewTemplate: (value: InvoiceTemplateId) => void;
  previewSize: InvoiceSizeId;
  setPreviewSize: (value: InvoiceSizeId) => void;
  setPreviewModalOpen: (value: boolean) => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  settings,
  set,
  readOnly,
  toast,
  printService,
  previewTemplate,
  setPreviewTemplate,
  previewSize,
  setPreviewSize,
  setPreviewModalOpen,
}) => createPortal(
  <div
    className="fixed inset-0 z-[100] bg-primary/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5"
    role="dialog"
    aria-modal="true"
    aria-label="معاينة حيّة للفورم والمقاسات"
  >
  <div className="bg-surface rounded-2xl border border-line shadow-2xl w-full max-w-6xl h-[94dvh] max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
    {/* Modal Header */}
    <div className="px-4 py-3 border-b border-line bg-surface-muted dark:bg-primary/60 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-accent-soft dark:bg-primary/50 text-primary ">
          <Eye className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-black text-ink flex items-center gap-2">
            معاينة حيّة للفورم والمقاسات
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-soft dark:bg-primary/40 text-primary ">
              بيانات تجريبية لمعرض سيراميك
            </span>
          </h3>
          <p className="text-[11px] text-muted ">
            يمكنك تجربة الفورمات والمقاسات المختلفة واعتماد المناسب منها بضغطة زر واحدة
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            set('defaultInvoiceTemplate', previewTemplate);
            set('defaultInvoiceSize', previewSize);
            toast.success('تم اعتماد هذه الفورما وهذا المقاس كمفضلين للنظام بنجاح.');
          }}
          className="px-3 py-1.5 rounded-xl bg-success hover:bg-success text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-success/20 transition"
        >
          <Check className="w-3.5 h-3.5" />
          اعتماد هذه الفورما الآن
        </button>

        <button
          type="button"
          onClick={() => printService.printTestPage(previewSize, previewTemplate)}
          className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
        >
          <Printer className="w-3.5 h-3.5" />
          طباعة تجريبية
        </button>

        <button
          type="button"
          onClick={() => setPreviewModalOpen(false)}
          className="p-1.5 rounded-xl text-muted hover:bg-surface-sunken dark:hover:bg-primary transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>

    {/* Template & Size Switcher Bar */}
    <div className="px-4 py-2.5 bg-surface-sunken/80 dark:bg-primary/40 border-b border-line flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-ink-secondary ">الفورما:</span>
        {[
          { id: 'table' as const, label: 'جدول واضح' },
          { id: 'classic' as const, label: 'كلاسيكي' },
          { id: 'modern' as const, label: 'عصري' },
          { id: 'compact' as const, label: 'مدمج' },
          { id: 'detailed' as const, label: 'تفصيلي للمعارض' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPreviewTemplate(t.id)}
            className={`px-2.5 py-1 rounded-lg font-bold transition ${
              previewTemplate === t.id
                ? 'bg-primary text-white shadow-sm'
                : 'bg-surface text-ink hover:bg-surface-sunken'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="font-bold text-ink-secondary ">المقاس:</span>
        {[
          { id: 'a4' as const, label: 'A4' },
          { id: 'a5' as const, label: 'A5' },
          { id: 'thermal' as const, label: 'حراري (Thermal)' },
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setPreviewSize(s.id)}
            className={`px-2.5 py-1 rounded-lg font-bold transition ${
              previewSize === s.id
                ? 'bg-primary text-white shadow-sm'
                : 'bg-surface text-ink hover:bg-surface-sunken'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>

    {/* Iframe Preview Container */}
    <div className="flex-1 bg-surface-sunken/70 p-2 sm:p-4 overflow-auto flex items-center justify-center">
      <div className={`bg-surface shadow-xl rounded-lg overflow-hidden transition-all duration-200 h-full ${
 previewSize === 'thermal'
 ? 'w-[360px]'
 : previewSize === 'a5'
 ? 'w-[680px]'
 : 'w-[840px] max-w-full'
 }`}>
        <iframe
          title="معاينة الفورما"
          srcDoc={printService.getTemplatePreviewHtml(previewTemplate, previewSize, settings)}
          className="w-full h-full border-none bg-surface"
        />
      </div>
    </div>
  </div>
  </div>,
  document.body,
);
