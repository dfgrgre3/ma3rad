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
  <div className="rounded-2xl border border-accent-border bg-gradient-to-r from-primary to-primary/40 p-4 dark:border-primary/30 dark:from-primary/20 dark:to-primary/10">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-md shadow-primary/20">
          <Printer className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-black text-ink ">
            إدارة الفواتير والطباعة الشاملة
          </h3>
          <p className="text-xs text-muted ">
            اعتماد الفورما الرسمية، اختيار المقاس المفضل، وتهيئة طابعة كل مقاس من مكان واحد موحد مع معاينة حية.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenPreview}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-primary to-primary hover:from-primary hover:to-primary text-white text-xs font-bold shadow-md shadow-primary/20 transition"
        >
          <Eye className="w-4 h-4" />
          معاينة حيّة للفورم
        </button>

        <button
          type="button"
          disabled={isScanningPrinters}
          onClick={() => scanPrinters(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-line-strong bg-surface hover:bg-surface-muted dark:hover:bg-primary/60 text-ink text-xs font-bold transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanningPrinters ? 'animate-spin' : ''}`} />
          {isScanningPrinters ? 'جاري الفحص...' : 'استكشاف الطابعات'}
        </button>
      </div>
    </div>

    {scannedPrintersCount !== null && (
      <div className="mt-2.5 text-[11px] text-success flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>تم العثور على {scannedPrintersCount} طابعة مثبتة في النظام. يمكنك الآن اختيارها مباشرة من القوائم أدناه.</span>
      </div>
    )}
  </div>
);
