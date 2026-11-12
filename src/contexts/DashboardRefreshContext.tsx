import React, { createContext } from 'react';

export interface DashboardRefreshContextValue {
  refreshToken: number;
  refresh: () => void;
}

export const DashboardRefreshContext = createContext<DashboardRefreshContextValue | null>(null);

export const useDashboardRefresh = (): DashboardRefreshContextValue | null =>
  React.useContext(DashboardRefreshContext);
