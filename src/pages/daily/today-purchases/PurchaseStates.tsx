import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

export const PurchasesErrorAlert: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
    <AlertTriangle className="h-4 w-4 shrink-0" />
    <span className="flex-1">{message}</span>
    <button type="button" onClick={onRetry} className="rounded-md px-2 py-1 font-bold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
      إعادة المحاولة
    </button>
  </div>
);

export const PurchasesLoadingState: React.FC = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white text-center dark:border-slate-700 dark:bg-slate-900" role="status" aria-live="polite">
    <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">جارٍ تحميل مشتريات اليوم…</p>
    <p className="text-xs text-slate-500 dark:text-slate-400">يتم تجميع الفواتير والأصناف والسداد من قاعدة البيانات</p>
  </div>
);

export const PurchasesUnavailableState: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white text-center dark:border-slate-700 dark:bg-slate-900">
    <AlertTriangle className="h-7 w-7 text-rose-500" aria-hidden="true" />
    <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">تعذر تحميل مشتريات اليوم</p>
    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">تحقق من صلاحياتك ومن الاتصال بقاعدة البيانات ثم أعد المحاولة.</p>
    <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900">إعادة المحاولة</button>
  </div>
);
