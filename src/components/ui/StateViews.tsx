import React from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Info, Loader2, SearchX } from 'lucide-react';

type StateTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_ICON: Record<StateTone, React.ElementType> = {
  neutral: Inbox,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
  info: Info,
};

const TONE_COLOR: Record<StateTone, string> = {
  neutral: 'text-[var(--cerami-muted)]',
  success: 'text-[var(--cerami-success)]',
  warning: 'text-[var(--cerami-warning)]',
  danger: 'text-[var(--cerami-danger)]',
  info: 'text-[var(--cerami-primary)]',
};

export interface StateAction {
  label: string;
  onClick: () => void;
}

export interface StateViewProps {
  tone?: StateTone;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ElementType;
  action?: StateAction;
  className?: string;
  role?: 'status' | 'alert';
  compact?: boolean;
}

/**
 * Universal empty / success / warning / error surface. Feature pages should use
 * one of the exported wrappers below so states share the same rhythm and tone.
 */
export const StateView: React.FC<StateViewProps> = ({
  tone = 'neutral',
  title,
  description,
  icon,
  action,
  className = '',
  role = tone === 'danger' ? 'alert' : 'status',
  compact = false,
}) => {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <div
      role={role}
      className={`erp-state ${compact ? 'erp-state--compact' : ''} ${className}`}
    >
      <span className={`erp-state__icon ${TONE_COLOR[tone]}`} aria-hidden="true">
        <Icon className="h-6 w-6" />
      </span>
      {title && <p className={`erp-state__title ${tone === 'danger' ? 'text-[var(--cerami-danger)]' : ''}`}>{title}</p>}
      {description && <p className="erp-state__description">{description}</p>}
      {action && (
        <button type="button" onClick={action.onClick} className="erp-btn erp-btn--secondary erp-btn--sm mt-1">
          {action.label}
        </button>
      )}
    </div>
  );
};

export const LoadingState: React.FC<{ label?: string; className?: string; compact?: boolean }> = ({
  label = 'جارٍ التحميل...',
  className = '',
  compact = false,
}) => (
  <div
    role="status"
    aria-live="polite"
    className={`erp-state ${compact ? 'erp-state--compact' : ''} ${className}`}
  >
    <Loader2 className="h-6 w-6 animate-spin text-[var(--cerami-primary)]" aria-hidden="true" />
    <span className="erp-state__title font-medium">{label}</span>
  </div>
);

export const EmptyState: React.FC<{
  title?: string;
  description?: string;
  className?: string;
  action?: StateAction;
  icon?: React.ElementType;
  compact?: boolean;
}> = ({ title = 'لا توجد بيانات', description, className = '', action, icon, compact }) => (
  <StateView title={title} description={description} action={action} icon={icon} className={className} compact={compact} />
);

export const NoResultsState: React.FC<{
  title?: string;
  description?: string;
  className?: string;
  onClear?: () => void;
  clearLabel?: string;
  compact?: boolean;
}> = ({
  title = 'لا توجد نتائج مطابقة',
  description = 'جرّب تعديل كلمة البحث أو إعادة ضبط الفلاتر.',
  className = '',
  onClear,
  clearLabel = 'مسح الفلاتر',
  compact,
}) => (
  <StateView
    title={title}
    description={description}
    icon={SearchX}
    className={className}
    compact={compact}
    action={onClear ? { label: clearLabel, onClick: onClear } : undefined}
  />
);

export const ErrorState: React.FC<{
  message?: string;
  onRetry?: () => void;
  className?: string;
  title?: string;
  compact?: boolean;
}> = ({
  message = 'تعذر تحميل البيانات.',
  onRetry,
  className = '',
  title = 'حدث خطأ',
  compact,
}) => (
  <StateView
    tone="danger"
    title={title}
    description={message}
    className={className}
    compact={compact}
    action={onRetry ? { label: 'إعادة المحاولة', onClick: onRetry } : undefined}
  />
);

export const SuccessState: React.FC<{
  title?: string;
  description?: string;
  className?: string;
  action?: StateAction;
  compact?: boolean;
}> = ({ title = 'تمت العملية بنجاح', description, className = '', action, compact }) => (
  <StateView tone="success" title={title} description={description} action={action} className={className} compact={compact} />
);

export const WarningState: React.FC<{
  title?: string;
  description?: string;
  className?: string;
  action?: StateAction;
  compact?: boolean;
}> = ({ title = 'تنبيه', description, className = '', action, compact }) => (
  <StateView tone="warning" title={title} description={description} action={action} className={className} compact={compact} />
);

export const InfoState: React.FC<{
  title?: string;
  description?: string;
  className?: string;
  action?: StateAction;
  compact?: boolean;
}> = ({ title, description, className = '', action, compact }) => (
  <StateView tone="info" title={title} description={description} action={action} className={className} compact={compact} />
);
