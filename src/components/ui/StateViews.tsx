import React from 'react';
import { Loader2, AlertTriangle, Inbox } from 'lucide-react';

export const LoadingState: React.FC<{ label?: string; className?: string }> = ({
  label = 'جارٍ التحميل...',
  className = '',
}) => (
  <div
    role="status"
    aria-live="polite"
    className={`flex flex-col items-center justify-center gap-3 py-12 text-slate-500 ${className}`}
  >
    <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden="true" />
    <span className="text-sm font-medium">{label}</span>
  </div>
);

export const EmptyState: React.FC<{ title?: string; description?: string; className?: string }> = ({
  title = 'لا توجد بيانات',
  description,
  className = '',
}) => (
  <div
    role="status"
    className={`flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-400 ${className}`}
  >
    <Inbox className="h-10 w-10" aria-hidden="true" />
    <p className="text-sm font-bold text-slate-600">{title}</p>
    {description && <p className="text-xs text-slate-400 max-w-md">{description}</p>}
  </div>
);

export const ErrorState: React.FC<{ message?: string; onRetry?: () => void; className?: string }> = ({
  message = 'تعذر تحميل البيانات.',
  onRetry,
  className = '',
}) => (
  <div
    role="alert"
    className={`flex flex-col items-center justify-center gap-3 py-12 text-center ${className}`}
  >
    <AlertTriangle className="h-10 w-10 text-rose-500" aria-hidden="true" />
    <p className="text-sm font-bold text-rose-700">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-700"
      >
        إعادة المحاولة
      </button>
    )}
  </div>
);