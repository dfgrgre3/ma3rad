import { getProfileDashboard } from './businessProfiles';
import type { BusinessProfileDashboardKpi } from './businessProfiles';

/** Fallback KPIs when the active profile declares no dashboard KPIs. */
export const DEFAULT_PROFILE_KPIS: BusinessProfileDashboardKpi[] = [
  { id: 'today_sales', label: { ar: 'مبيعات اليوم', en: 'Today Sales' }, source: 'sales', format: 'currency' },
  { id: 'month_sales', label: { ar: 'مبيعات الشهر', en: 'Month Sales' }, source: 'sales', format: 'currency' },
  { id: 'net_profit', label: { ar: 'صافي الربح', en: 'Net Profit' }, source: 'finance', format: 'currency' },
  { id: 'inventory_value', label: { ar: 'قيمة المخزون', en: 'Inventory Value' }, source: 'inventory', format: 'currency' },
  { id: 'low_stock', label: { ar: 'نواقص المخزون', en: 'Low Stock Items' }, source: 'inventory', format: 'number' },
  { id: 'receivables', label: { ar: 'ديون العملاء', en: 'Customer Receivables' }, source: 'finance', format: 'currency' },
];

/** The KPI catalog a user may pick from for the given business type. */
export function getProfileKpiCatalog(businessType: string): BusinessProfileDashboardKpi[] {
  const kpis = getProfileDashboard(businessType)?.kpis ?? [];
  return kpis.length > 0 ? kpis : DEFAULT_PROFILE_KPIS;
}
