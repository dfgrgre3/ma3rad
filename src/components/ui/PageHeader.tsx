import React from 'react';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small label above the title (module name, breadcrumb, status). */
  eyebrow?: React.ReactNode;
  /** Optional leading icon/visual. Accepts any node so pages keep their identity. */
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
  /** Hide the bottom divider when the header sits inside a card/toolbar. */
  bordered?: boolean;
}

/**
 * The single page-title block used across the application.
 *
 * It keeps the heading, description, meta information and page actions in one
 * predictable grid so every route has the same vertical rhythm and action
 * placement, at every viewport width.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  eyebrow,
  icon,
  actions,
  meta,
  className = '',
  bordered = true,
}) => (
  <header className={`erp-page-header ${bordered ? '' : 'erp-page-header--plain'} ${className}`}>
    <div className="erp-page-header__main">
      {icon && <span className="erp-page-header__icon" aria-hidden="true">{icon}</span>}
      <div className="erp-page-header__text">
        {eyebrow && <p className="erp-page-header__eyebrow">{eyebrow}</p>}
        <h1 className="erp-page-header__title">{title}</h1>
        {description && <p className="erp-page-header__description">{description}</p>}
        {meta && <div className="erp-page-header__meta">{meta}</div>}
      </div>
    </div>
    {actions && <div className="erp-page-header__actions">{actions}</div>}
  </header>
);

export default PageHeader;
