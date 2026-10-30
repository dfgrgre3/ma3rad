import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { normalizePagePath } from '../../config/appConfiguration';
import { registerConfigTarget } from '../../config/appConfigTargets';
import { useSectionConfig } from '../../hooks/useAppConfig';

export interface ConfigSectionProps {
  /** Stable section id, unique inside the page. */
  id: string;
  /** Defaults to the current route path. */
  page?: string;
  title?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A named region of a page that administrators can hide, reorder or relabel
 * from the Dynamic Application Configuration Engine.
 *
 * Pages that cannot be instrumented can still be controlled with selector
 * rules (see the "أقسام الصفحات" tab), which target existing DOM nodes.
 */
export const ConfigSection: React.FC<ConfigSectionProps> = ({
  id,
  page,
  title,
  className,
  children,
}) => {
  const location = useLocation();
  const pagePath = normalizePagePath(page ?? location.pathname);
  const { enabled, label } = useSectionConfig(id, pagePath);

  useEffect(() => {
    return registerConfigTarget({
      domain: 'section',
      key: `${pagePath}#${id}`,
      label: title || label || id,
      pagePath,
      description: `قسم داخل صفحة ${pagePath}`,
    });
  }, [id, pagePath, title, label]);

  if (!enabled) return null;

  return (
    <section
      data-config-section={id}
      data-config-page={pagePath}
      aria-label={label || title || undefined}
      className={className}
    >
      {children}
    </section>
  );
};

export default ConfigSection;
