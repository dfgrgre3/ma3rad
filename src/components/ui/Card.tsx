import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Card padding follows the shared spacing scale. */
  padding?: 'none' | 'sm' | 'md';
  /** Lighter surface used for grouped secondary content. */
  muted?: boolean;
}

export const Card: React.FC<CardProps> = ({
  padding = 'md',
  muted = false,
  className = '',
  children,
  ...rest
}) => (
  <div
    className={[
      'erp-card',
      padding === 'none' ? 'erp-card--flush' : padding === 'sm' ? 'erp-card--compact' : '',
      muted ? 'erp-card--muted' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    {children}
  </div>
);

export interface CardHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  description,
  icon,
  actions,
  className = '',
}) => (
  <div className={`erp-card__header ${className}`}>
    <div className="erp-card__heading">
      {icon && <span className="erp-card__icon" aria-hidden="true">{icon}</span>}
      <div className="min-w-0">
        <h2 className="erp-card__title">{title}</h2>
        {description && <p className="erp-card__description">{description}</p>}
      </div>
    </div>
    {actions && <div className="erp-card__actions">{actions}</div>}
  </div>
);

/** Compact metric tile used by dashboards and hub summary rows. */
export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'danger' | 'warning';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className = '',
}) => (
  <div className={`erp-stat erp-stat--${tone} ${className}`}>
    <div className="erp-stat__label">
      {icon && <span className="erp-stat__icon" aria-hidden="true">{icon}</span>}
      <span>{label}</span>
    </div>
    <p className="erp-stat__value">{value}</p>
    {hint && <p className="erp-stat__hint">{hint}</p>}
  </div>
);

export default Card;
