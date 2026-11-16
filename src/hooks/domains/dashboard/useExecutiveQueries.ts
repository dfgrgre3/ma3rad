import { dashboardMetricsService, type ExecutiveDashboardData } from '../../../services/domains/dashboard/DashboardMetricsService';

/**
 * @deprecated Use dashboardMetricsService.getExecutiveDashboardData() instead
 * This function is kept for backward compatibility but delegates to the unified service
 */
export async function runExecutiveQueries(fromStr: string, toStr: string): Promise<ExecutiveDashboardData | null> {
  return dashboardMetricsService.getExecutiveDashboardData(fromStr, toStr);
}
