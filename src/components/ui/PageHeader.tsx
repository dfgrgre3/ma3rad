import React from 'react';
import { useInRouterContext } from 'react-router-dom';
import { useActivityPathCopy } from '../../hooks/domains/config/useBusinessTerm';

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
  /** Opt out of activity-driven title/description for this header. */
  disableActivityCopy?: boolean;
}

/**
 * Activity-aware wrapper: resolves copy outside the router context. */
const ActivityCopyResolver: React.FC<{
  disable?: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: (resolved: { title: React.ReactNode; description?: React.ReactNode }) => React.ReactNode;
}> = ({ disable, title, description, children }) => {
  const copy = useActivityPathCopy();
  if (disable || !copy) return <>{children({ title, description })}</>;
  return <>{children({
    title: typeof title === 'string' ? copy.title : title,
    description: description === undefined || typeof description === 'string' ? copy.description : description,
  })}</>;
};

/**
 * The single page-title block used across the application.
 *
 * It keeps the heading, description, meta information and page actions in one
 * predictable grid so every route has the same vertical rhythm and action
 * placement, at every viewport width.
 *
 * When the current route has activity-specific copy, a plain-string title (and
 * a plain-string or missing description) is replaced by the activity wording —
 * dynamic titles (customer names, counts) are never touched.
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
  disableActivityCopy = false,
}) => {
  const inRouter = useInRouterContext();
  const render = ({ title: resolvedTitle, description: resolvedDescription }: { title: React.ReactNode; description?: React.ReactNode }) => (
    <header className={`erp-page-header ${bordered ? '' : 'erp-page-header--plain'} ${className}`}>
      <div className="erp-page-header__main">
        {icon && <span className="erp-page-header__icon" aria-hidden="true">{icon}</span>}
        <div className="erp-page-header__text">
          {eyebrow && <p className="erp-page-header__eyebrow">{eyebrow}</p>}
          <h1 className="erp-page-header__title">{resolvedTitle}</h1>
          {resolvedDescription && <p className="erp-page-header__description">{resolvedDescription}</p>}
          {meta && <div className="erp-page-header__meta">{meta}</div>}
        </div>
      </div>
      {actions && <div className="erp-page-header__actions">{actions}</div>}
    </header>
  );

  if (!inRouter || disableActivityCopy) return render({ title, description });
  return (
    <ActivityCopyResolver disable={disableActivityCopy} title={title} description={description}>
      {render}
    </ActivityCopyResolver>
  );
};

export default PageHeader;
