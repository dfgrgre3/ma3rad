import React, { useState } from 'react';
import {
  X, Printer, FileDown, FileSpreadsheet, MessageCircle, Loader2, CheckCircle2,
} from 'lucide-react';
import { downloadPdf, printHtml } from '../utils/export';

export interface DocumentPreviewModalProps {
  title: string;
  subtitle?: string;
  fileName: string;
  html: string;
  onClose: () => void;
  onDownloadExcel?: () => void;
  onWhatsApp?: () => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  title, subtitle, fileName, html, onClose, onDownloadExcel, onWhatsApp,
}) => {
  const [savingPdf, setSavingPdf] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleDownloadPdf = async () => {
    setSavingPdf(true);
    setSaved(false);
    setSaveError(null);
    try {
      await downloadPdf(html, fileName);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'تعذر حفظ ملف PDF.');
    } finally {
      setSavingPdf(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5"
      dir="rtl"
    >
      <button
        type="button"
        aria-label="إغلاق المعاينة"
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
      />
      <div className="relative z-10 bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-900 truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-500 truncate mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onDownloadExcel && (
              <button
                onClick={onDownloadExcel}
                className="px-2.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-[11px] font-bold flex items-center gap-1.5"
                title="تنزيل نسخة Excel"
              >
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </button>
            )}
            <button
              onClick={handleDownloadPdf}
              disabled={savingPdf}
              className="px-2.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-60"
              title="تنزيل نسخة PDF"
            >
              {savingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <FileDown className="w-4 h-4" />}
              {saved ? 'تم الحفظ' : 'PDF'}
            </button>
            <button
              onClick={() => printHtml(html)}
              className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold flex items-center gap-1.5"
              title="طباعة"
            >
              <Printer className="w-4 h-4" /> طباعة
            </button>
            {onWhatsApp && (
              <button
                onClick={onWhatsApp}
                className="px-2.5 py-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#128C7E] border border-[#25D366]/30 rounded-xl text-[11px] font-bold flex items-center gap-1.5"
                title="مشاركة عبر واتساب"
              >
                <MessageCircle className="w-4 h-4" /> واتساب
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:bg-slate-200" title="إغلاق">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-200/60 p-2 sm:p-4 overflow-hidden">
          <iframe
            title={title}
            srcDoc={html}
            className="w-full h-full bg-white rounded-xl border border-slate-300 shadow-inner"
          />
        </div>

        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-[10px] text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          {saveError ? (
            <span role="alert" className="text-rose-700 font-bold">{saveError}</span>
          ) : (
            <span>يمكنك اختيار الطباعة أو تنزيل PDF أو Excel من الأعلى.</span>
          )}
          <span className="font-mono">{fileName}</span>
        </div>
      </div>
    </div>
  );
};
