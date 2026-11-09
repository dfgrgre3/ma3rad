import React from 'react';
import { StateView } from './StateViews_part01';
import type { StateAction } from './StateViews_part01';

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
