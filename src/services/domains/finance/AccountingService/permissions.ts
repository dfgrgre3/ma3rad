import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { isValidDate } from './types';

export function requireView(permission: string): void {
  PermissionService.require(AuthService.requireAuth(), permission);
}

export function requireDashboardView(): void {
  requireView('dashboard.view');
  const actor = AuthService.requireAuth();
  // Use domain permissions (matching DashboardPage PULSE_ACCESS) instead of ui.* permissions.
  // Any single domain grant is enough to enter; assembleDashboardMetrics masks the
  // fields of domains the actor cannot see, so partial-permission users get only
  // the indicators they are allowed to view instead of a fully blocked summary.
  PermissionService.requireAny(actor, ['sales.view', 'purchases.view', 'finance.view', 'customers.view', 'inventory.view'], '/dashboard');
}

export function requireDashboardSalesView(): void {
  requireView('dashboard.view');
  PermissionService.require(AuthService.requireAuth(), 'sales.view', '/sales');
}

export function requireProfitAndLossView(dateFrom?: string, dateTo?: string): void {
  requireView('ui.finance.overview.view');
  if ((dateFrom && !isValidDate(dateFrom)) || (dateTo && !isValidDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) {
    throw new Error('Invalid profit and loss date range.');
  }
}

export function requireProfitView(dateFrom: string, dateTo: string): void {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'finance.view', '/finance');
  if (!isValidDate(dateFrom) || !isValidDate(dateTo) || dateFrom > dateTo) {
    throw new Error('Invalid profit and loss date range.');
  }
}

export function requireSalesReportView(permission: string): void {
  requireView(permission);
  PermissionService.require(AuthService.requireAuth(), 'sales.view', '/sales');
}

export function requireMonthlyComparisonView(): void {
  requireView('dashboard.view');
  PermissionService.require(AuthService.requireAuth(), 'sales.view', '/sales');
}

export function requireDashboardCustomersSalesView(): void {
  requireView('dashboard.view');
  PermissionService.require(AuthService.requireAuth(), 'customers.view', '/customers');
  PermissionService.require(AuthService.requireAuth(), 'sales.view', '/sales');
}

export function requireDashboardFinanceSalesView(): void {
  requireView('dashboard.view');
  PermissionService.require(AuthService.requireAuth(), 'finance.view', '/finance');
  PermissionService.require(AuthService.requireAuth(), 'sales.view', '/sales');
}

export function requireRecentActivitiesView(): void {
  requireView('dashboard.view');
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'sales.view', '/sales');
  PermissionService.require(actor, 'purchases.view', '/purchases');
  PermissionService.require(actor, 'inventory.view', '/inventory');
}
