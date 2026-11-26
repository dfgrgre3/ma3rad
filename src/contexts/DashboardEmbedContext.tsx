import React from 'react';

/**
 * Marks a page rendered inside a dashboard section card (tab on /dashboard).
 * Embedded pages should suppress their own PageHeader since SectionCard
 * already provides the title/subtitle.
 */
export const DashboardEmbedContext = React.createContext<boolean>(false);

export const useDashboardEmbed = (): boolean => React.useContext(DashboardEmbedContext);
