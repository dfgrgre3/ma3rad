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
    className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5"
    role="dialog"
    aria-modal="true"
    aria-label="معاينة حيّة للفورم والمقاسات"
  >
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-6xl h-[94dvh] max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
    {/* Modal Header */}
    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300">
          <Eye className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            معاينة حيّة للفورم والمقاسات
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">
              بيانات تجريبية لمعرض سيراميك
            </span>
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 transition"
        >
          <Check className="w-3.5 h-3.5" />
          اعتماد هذه الفورما الآن
        </button>

        <button
          type="button"
          onClick={() => printService.printTestPage(previewSize, previewTemplate)}
          className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
        >
          <Printer className="w-3.5 h-3.5" />
          طباعة تجريبية
        </button>

        <button
          type="button"
          onClick={() => setPreviewModalOpen(false)}
          className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>

    {/* Template & Size Switcher Bar */}
    <div className="px-4 py-2.5 bg-slate-100/80 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-slate-600 dark:text-slate-300">الفورما:</span>
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
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="font-bold text-slate-600 dark:text-slate-300">المقاس:</span>
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
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>

    {/* Iframe Preview Container */}
    <div className="flex-1 bg-slate-200/70 dark:bg-slate-950 p-2 sm:p-4 overflow-auto flex items-center justify-center">
      <div className={`bg-white shadow-xl rounded-lg overflow-hidden transition-all duration-200 h-full ${
        previewSize === 'thermal'
          ? 'w-[360px]'
          : previewSize === 'a5'
          ? 'w-[680px]'
          : 'w-[840px] max-w-full'
      }`}>
        <iframe
          title="معاينة الفورما"
          srcDoc={printService.getTemplatePreviewHtml(previewTemplate, previewSize, settings)}
          className="w-full h-full border-none bg-white"
        />
      </div>
    </div>
  </div>
  </div>,
  document.body,
);
