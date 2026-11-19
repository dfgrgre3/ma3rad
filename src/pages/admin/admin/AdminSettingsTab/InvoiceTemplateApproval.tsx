import React from 'react';
import {
  CheckCircle2, Eye, FileText, Layers, LayoutTemplate, Printer, Sparkles, Star, Table as TableIcon,
} from 'lucide-react';
import type { SystemSettings } from '../../../../types';
import type { InvoiceSizeId, InvoiceTemplateId } from '../../../../services/shared/PrintService';
import type { useToast } from '../../../../components/ui/Toast';
import type { SettingsSetter } from './types';

type ToastApi = ReturnType<typeof useToast>;

interface InvoiceTemplateApprovalProps {
  settings: SystemSettings;
  set: SettingsSetter;
  readOnly: boolean;
  toast: ToastApi;
  setPreviewTemplate: (value: InvoiceTemplateId) => void;
  setPreviewSize: (value: InvoiceSizeId) => void;
  setPreviewModalOpen: (value: boolean) => void;
}

export const InvoiceTemplateApproval: React.FC<InvoiceTemplateApprovalProps> = ({
  settings,
  set,
  readOnly,
  toast,
  setPreviewTemplate,
  setPreviewSize,
  setPreviewModalOpen,
}) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
      <div className="flex items-center gap-2">
        <LayoutTemplate className="w-4 h-4 text-sky-600" />
        <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
          اعتماد الفورما والمفضلة (Invoice Form Approval)
        </h4>
      </div>
      <span className="text-[11px] text-slate-500">
        الفورما والمقاس المعتمدان سيتم تطبيقهما تلقائياً على كافة مبيعات ونقاط بيع النظام
      </span>
    </div>

    {/* Template Cards Grid */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {[
        {
          key: 'table',
          id: 'table' as const,
          size: undefined as InvoiceSizeId | undefined,
          title: 'جدول واضح',
          tag: 'Table-first',
          desc: 'تخطيط هادئ يضع جدول البنود والإجماليات في المقدمة ويخفي التفاصيل الاختيارية.',
          icon: TableIcon,
        },
        {
          key: 'classic',
          id: 'classic' as const,
          size: undefined as InvoiceSizeId | undefined,
          title: 'كلاسيكي رسمي (Classic)',
          tag: 'النمط التقليدي',
          desc: 'ترويسة مؤسسية متوازنة، جداول واضحة بتفقيط ومربعات مجاميع معتمدة ومناسبة للأعمال الرسمية.',
          icon: FileText,
        },
        {
          key: 'modern',
          id: 'modern' as const,
          size: undefined as InvoiceSizeId | undefined,
          title: 'عصري حديث (Modern)',
          tag: 'تصميم معاصر',
          desc: 'مظهر أنيق جذاب بلمسات تدرج ملونة، بطاقات بيانات للعميل والمخزن، وبادجات دفع بارزة.',
          icon: Sparkles,
        },
        {
          key: 'compact',
          id: 'compact' as const,
          size: undefined as InvoiceSizeId | undefined,
          title: 'مدمج واقتصادي (Compact)',
          tag: 'توفير الورق',
          desc: 'تصميم كثيف عالي الكفاءة يقلل استهلاك الورق ويسرّع الطباعة المباشرة، ممتاز للعمليات الكثيفة.',
          icon: LayoutTemplate,
        },
        {
          key: 'detailed',
          id: 'detailed' as const,
          size: undefined as InvoiceSizeId | undefined,
          title: 'تفصيلي للمعارض',
          tag: 'مواصفات السيراميك',
          desc: 'مصمم خصيصاً لمعارض السيراميك والمواد: تفاصيل الفرز، المقاس، الكراتين، المستودع، وضمان الاستلام.',
          icon: Layers,
        },
        {
          key: 'thermal',
          id: 'compact' as const,
          size: 'thermal' as InvoiceSizeId,
          title: 'إيصال حراري',
          tag: 'Compact thermal',
          desc: 'نسخة حرارية سريعة؛ اعتمادها يختار المقاس الحراري مع الحفاظ على قالب Compact.',
          icon: Printer,
        },
      ].map((tpl) => {
        const isApproved = (settings.defaultInvoiceTemplate || 'table') === tpl.id
          && (!tpl.size || (settings.defaultInvoiceSize || 'a4') === tpl.size);
        const Icon = tpl.icon;
        return (
          <div
            key={tpl.key}
            className={`relative flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
              isApproved
                ? 'border-sky-500 bg-sky-50/40 dark:border-sky-500/60 dark:bg-sky-950/20 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-slate-200">
                  <Icon className={`w-3.5 h-3.5 ${isApproved ? 'text-sky-600' : 'text-slate-500'}`} />
                  {tpl.title}
                </span>
                {isApproved && (
                  <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-600 text-white text-[10px] font-black">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    معتمدة
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                {tpl.desc}
              </p>
            </div>

            <div className="flex items-center gap-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => {
                  set('defaultInvoiceTemplate', tpl.id);
                  if (tpl.size) set('defaultInvoiceSize', tpl.size);
                  toast.success(`تم اعتماد فورما "${tpl.title}" كالفورما المفضلة للنظام.`);
                }}
                disabled={readOnly || isApproved}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold text-center transition ${
                  isApproved
                    ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 cursor-default'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-sky-50 hover:text-sky-700 border border-slate-200 dark:border-slate-600'
                }`}
              >
                {isApproved ? '✓ معتمدة حالياً' : 'اعتماد كمعتمدة'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewTemplate(tpl.id);
                  if (tpl.size) setPreviewSize(tpl.size);
                  setPreviewModalOpen(true);
                }}
                className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-600 dark:text-slate-300 text-[11px] font-bold"
                title="معاينة هذه الفورما"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>

    {/* Favorite Size Selector */}
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
            المقاس المفضل (الافتراضي للطباعة)
          </span>
          <span className="text-[11px] text-slate-500">
            المقاس المحدد سيتم اختياره تلقائياً عند طلب طباعة أو تصدير الفواتير
          </span>
        </div>
        <span className="text-[11px] font-bold text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-800 shrink-0">
          المقاس المعتمد حالياً: {(settings.defaultInvoiceSize || 'a4').toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {[
          { id: 'a4' as const, label: 'مقاس A4 كامل', dim: '210 × 297 مم', desc: 'الأكثر شيوعاً للمستندات والملفات الرسمية' },
          { id: 'a5' as const, label: 'مقاس A5 نصف صفحة', dim: '148 × 210 مم', desc: 'اقتصادي وسريع للفواتير الميدانية والمختصرة' },
          { id: 'thermal' as const, label: 'إيصال حراري (كاشير)', dim: '80 مم / 58 مم', desc: 'لنقاط البيع السريعة ورول ماكينات الكاشير' },
        ].map((sz) => {
          const isSelected = (settings.defaultInvoiceSize || 'a4') === sz.id;
          return (
            <button
              key={sz.id}
              type="button"
              onClick={() => {
                set('defaultInvoiceSize', sz.id);
                toast.success(`تم اعتماد مقاس ${sz.label} كمقاس افتراضي للطباعة.`);
              }}
              className={`flex flex-col text-right p-3 rounded-xl border transition ${
                isSelected
                  ? 'border-sky-500 bg-white dark:bg-slate-900 shadow-sm ring-2 ring-sky-500/20'
                  : 'border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  {isSelected ? <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block" />}
                  {sz.label}
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {sz.dim}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{sz.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);
