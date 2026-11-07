import React from 'react';
import { Loader2, AlertTriangle, Inbox } from 'lucide-react';

export const LoadingState: React.FC<{ label?: string; className?: string }> = ({
  label = 'جارٍ التحميل...',
  className = '',
}) => (
  <div
    role="status"
    aria-live="polite"
    className={`flex flex-col items-center justify-center gap-3 py-12 text-[var(--cerami-muted)] ${className}`}
  >
    <Loader2 className="h-8 w-8 animate-spin text-[var(--cerami-primary)]" aria-hidden="true" />
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
    className={`flex flex-col items-center justify-center gap-2 py-12 text-center text-[var(--cerami-muted)] ${className}`}
  >
    <Inbox className="h-10 w-10" aria-hidden="true" />
    <p className="text-sm font-bold text-[var(--cerami-text-secondary)]">{title}</p>
    {description && <p className="text-xs text-[var(--cerami-muted)] max-w-md">{description}</p>}
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
    <AlertTriangle className="h-10 w-10 text-[var(--cerami-danger)]" aria-hidden="true" />
    <p className="text-sm font-bold text-[var(--cerami-danger)]">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="ui-btn-primary px-4 py-2 text-sm"
      >
        إعادة المحاولة
      </button>
    )}
  </div>
);