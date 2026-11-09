import React from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Info } from 'lucide-react';

export type StateTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export const TONE_ICON: Record<StateTone, React.ElementType> = {
  neutral: Inbox,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
  info: Info,
};

export const TONE_COLOR: Record<StateTone, string> = {
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
