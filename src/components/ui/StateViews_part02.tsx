import React from 'react';
import { Loader2, SearchX } from 'lucide-react';
import { StateView } from './StateViews_part01';
import type { StateAction } from './StateViews_part01';

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
