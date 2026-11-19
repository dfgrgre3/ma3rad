import React from 'react';
import { CheckCircle2, Eye, Printer, RefreshCw } from 'lucide-react';

interface InvoiceHeaderBarProps {
  isScanningPrinters: boolean;
  scannedPrintersCount: number | null;
  scanPrinters: (notify?: boolean) => void;
  onOpenPreview: () => void;
}

export const InvoiceHeaderBar: React.FC<InvoiceHeaderBarProps> = ({
  isScanningPrinters,
  scannedPrintersCount,
  scanPrinters,
  onOpenPreview,
}) => (
  <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 to-indigo-50/40 p-4 dark:border-sky-900/30 dark:from-sky-950/20 dark:to-indigo-950/10">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-600/20">
          <Printer className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
            إدارة الفواتير والطباعة الشاملة
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            اعتماد الفورما الرسمية، اختيار المقاس المفضل، وتهيئة طابعة كل مقاس من مكان واحد موحد مع معاينة حية.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenPreview}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition"
        >
          <Eye className="w-4 h-4" />
          معاينة حيّة للفورم
        </button>

        <button
          type="button"
          disabled={isScanningPrinters}
          onClick={() => scanPrinters(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-bold transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanningPrinters ? 'animate-spin' : ''}`} />
          {isScanningPrinters ? 'جاري الفحص...' : 'استكشاف الطابعات'}
        </button>
      </div>
    </div>

    {scannedPrintersCount !== null && (
      <div className="mt-2.5 text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>تم العثور على {scannedPrintersCount} طابعة مثبتة في النظام. يمكنك الآن اختيارها مباشرة من القوائم أدناه.</span>
      </div>
    )}
  </div>
);
