import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

export const PurchasesErrorAlert: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="flex items-center gap-2 rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-xs font-semibold text-danger dark:bg-danger/50 ">
    <AlertTriangle className="h-4 w-4 shrink-0" />
    <span className="flex-1">{message}</span>
    <button type="button" onClick={onRetry} className="rounded-md px-2 py-1 font-bold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">
      إعادة المحاولة
    </button>
  </div>
);

export const PurchasesLoadingState: React.FC = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface text-center " role="status" aria-live="polite">
    <Loader2 className="h-8 w-8 animate-spin text-warning" />
    <p className="text-sm font-bold text-ink ">جارٍ تحميل مشتريات اليوم…</p>
    <p className="text-xs text-muted ">يتم تجميع الفواتير والأصناف والسداد من قاعدة البيانات</p>
  </div>
);

export const PurchasesUnavailableState: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-line bg-surface text-center ">
    <AlertTriangle className="h-7 w-7 text-danger" aria-hidden="true" />
    <p className="mt-3 text-sm font-bold text-ink ">تعذر تحميل مشتريات اليوم</p>
    <p className="mt-1 text-xs text-muted ">تحقق من صلاحياتك ومن الاتصال بقاعدة البيانات ثم أعد المحاولة.</p>
    <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary dark:text-ink">إعادة المحاولة</button>
  </div>
);
