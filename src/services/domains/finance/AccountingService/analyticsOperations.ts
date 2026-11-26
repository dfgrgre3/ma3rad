import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import {
  buildMonthlyComparisonSpec,
  buildPaymentMethodSpec,
  buildRecentActivitySpecs,
  buildSalesTrendSpec,
  buildTopCustomersSpec,
  buildTopSellingProductsSpec,
} from './dashboardSpecs';
import {
  mapMonthlyComparison,
  mapRecentActivities,
  mapSalesTrendRows,
} from './mappers';
import {
  requireDashboardCustomersSalesView,
  requireDashboardFinanceSalesView,
  requireDashboardSalesView,
  requireMonthlyComparisonView,
  requireRecentActivitiesView,
} from './permissions';
import type {
  DashboardActivityRow,
  MonthlyComparison,
  RecentDashboardActivity,
} from './types';

export function getSalesTrendLast7Days(db: DatabaseManager, access: BranchAccessService): { date: string; sales: number; profit: number }[] {
  requireDashboardSalesView();
  const { sql, params, dates } = buildSalesTrendSpec(access);
  return mapSalesTrendRows(db.query<any>(sql, params), dates);
}

export async function getSalesTrendLast7DaysAsync(db: DatabaseManager, access: BranchAccessService): Promise<{ date: string; sales: number; profit: number }[]> {
  requireDashboardSalesView();
  const { sql, params, dates } = buildSalesTrendSpec(access);
  return mapSalesTrendRows(await db.queryAsync<any>(sql, params), dates);
}

export function getTopSellingProducts(db: DatabaseManager, access: BranchAccessService, limit = 5): { name: string; quantityM2: number; totalRevenue: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[] {
  requireDashboardSalesView();
  const { sql, params } = buildTopSellingProductsSpec(limit, access);
  return db.query<any>(sql, params);
}

export async function getTopSellingProductsAsync(db: DatabaseManager, access: BranchAccessService, limit = 5): Promise<{ name: string; quantityM2: number; totalRevenue: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[]> {
  requireDashboardSalesView();
  const { sql, params } = buildTopSellingProductsSpec(limit, access);
  return db.queryAsync<any>(sql, params);
}

export function getMonthlyComparison(db: DatabaseManager, access: BranchAccessService): MonthlyComparison {
  requireMonthlyComparisonView();
  const { sql, params } = buildMonthlyComparisonSpec(access);
  return mapMonthlyComparison(db.query<any>(sql, params)[0]);
}

export async function getMonthlyComparisonAsync(db: DatabaseManager, access: BranchAccessService): Promise<MonthlyComparison> {
  requireMonthlyComparisonView();
  const { sql, params } = buildMonthlyComparisonSpec(access);
  return mapMonthlyComparison((await db.queryAsync<any>(sql, params))[0]);
}

export function getTopCustomers(db: DatabaseManager, access: BranchAccessService, limit = 5): { name: string; totalPurchases: number; purchaseCount: number }[] {
  requireDashboardCustomersSalesView();
  const { sql, params } = buildTopCustomersSpec(limit, access);
  return db.query<any>(sql, params);
}

export async function getTopCustomersAsync(db: DatabaseManager, access: BranchAccessService, limit = 5): Promise<{ name: string; totalPurchases: number; purchaseCount: number }[]> {
  requireDashboardCustomersSalesView();
  const { sql, params } = buildTopCustomersSpec(limit, access);
  return db.queryAsync<any>(sql, params);
}

export function getPaymentMethodDistribution(db: DatabaseManager, access: BranchAccessService): { method: string; count: number; totalAmount: number }[] {
  requireDashboardFinanceSalesView();
  const { sql, params } = buildPaymentMethodSpec(access);
  return db.query<any>(sql, params);
}

export async function getPaymentMethodDistributionAsync(db: DatabaseManager, access: BranchAccessService): Promise<{ method: string; count: number; totalAmount: number }[]> {
  requireDashboardFinanceSalesView();
  const { sql, params } = buildPaymentMethodSpec(access);
  return db.queryAsync<any>(sql, params);
}

export function getRecentActivities(db: DatabaseManager, access: BranchAccessService, limit = 10): RecentDashboardActivity[] {
  requireRecentActivitiesView();
  const specs = buildRecentActivitySpecs(access);
  return mapRecentActivities(
    db.query<DashboardActivityRow>(specs.sales.sql, specs.sales.params),
    db.query<DashboardActivityRow>(specs.purchases.sql, specs.purchases.params),
    db.query<DashboardActivityRow>(specs.stocks.sql, specs.stocks.params),
    limit,
  );
}

export async function getRecentActivitiesAsync(db: DatabaseManager, access: BranchAccessService, limit = 10): Promise<RecentDashboardActivity[]> {
  requireRecentActivitiesView();
  const specs = buildRecentActivitySpecs(access);
  const [sales, purchases, stocks] = await Promise.all([
    db.queryAsync<DashboardActivityRow>(specs.sales.sql, specs.sales.params),
    db.queryAsync<DashboardActivityRow>(specs.purchases.sql, specs.purchases.params),
    db.queryAsync<DashboardActivityRow>(specs.stocks.sql, specs.stocks.params),
  ]);
  return mapRecentActivities(sales, purchases, stocks, limit);
}
