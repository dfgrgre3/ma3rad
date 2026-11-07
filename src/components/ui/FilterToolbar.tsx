import React from 'react';

export interface FilterToolbarProps {
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({ ariaLabel, className = '', children }) => (
  <section aria-label={ariaLabel} className={`ui-filter-toolbar ${className}`}>
    {children}
  </section>
);

export default FilterToolbar;
