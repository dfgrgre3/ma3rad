import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { BranchAccessService } from '../auth/BranchAccessService';
import {
  getDashboardMetrics,
  getDashboardMetricsAsync,
} from './AccountingService/dashboardOperations';
import {
  getMonthlyComparison,
  getMonthlyComparisonAsync,
  getPaymentMethodDistribution,
  getPaymentMethodDistributionAsync,
  getRecentActivities,
  getRecentActivitiesAsync,
  getSalesByGrade,
  getSalesByGradeAsync,
  getSalesTrendLast7Days,
  getSalesTrendLast7DaysAsync,
  getTopCustomers,
  getTopCustomersAsync,
  getTopSellingProducts,
  getTopSellingProductsAsync,
} from './AccountingService/analyticsOperations';
import {
  getBrandSalesReport,
  getBrandSalesReportAsync,
  getCategorySalesReport,
  getCategorySalesReportAsync,
  getDashboardProfitData,
  getDashboardProfitDataAsync,
  getExpenseReport,
  getExpenseReportAsync,
  getInventoryValuationReport,
  getInventoryValuationReportAsync,
  getProfitAndLossReport,
  getProfitAndLossReportAsync,
  getPurchaseReport,
  getPurchaseReportAsync,
} from './AccountingService/reportOperations';
import {
  getDailyComparison,
  getNetSalesAnalysis,
  getYearlyComparison,
} from './AccountingService/comparisons';
import type {
  DashboardMetrics,
  DashboardProfitData,
  MonthlyComparison,
  RecentDashboardActivity,
} from './AccountingService/types';

export type {
  DashboardMetrics,
  MonthlyComparison,
  RecentDashboardActivity,
  DashboardProfitData,
} from './AccountingService/types';

export class AccountingService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  public getBranchScopeWarning(): string | null {
    return 'تعرض هذه المؤشرات بيانات الفرع النشط فقط؛ القيود غير المرتبطة بفرع لا تدخل في الإجماليات.';
  }

  public getDashboardMetrics(): DashboardMetrics {
    return getDashboardMetrics(this.db, this.branchAccess, (from, to) => this.getDashboardProfitData(from, to));
  }

  public async getDashboardMetricsAsync(): Promise<DashboardMetrics> {
    return getDashboardMetricsAsync(this.db, this.branchAccess, (from, to) => this.getDashboardProfitData(from, to));
  }

  public getSalesTrendLast7Days(): { date: string; sales: number; profit: number }[] {
    return getSalesTrendLast7Days(this.db, this.branchAccess);
  }

  public async getSalesTrendLast7DaysAsync(): Promise<{ date: string; sales: number; profit: number }[]> {
    return getSalesTrendLast7DaysAsync(this.db, this.branchAccess);
  }

  public getTopSellingProducts(limit = 5): { name: string; quantityM2: number; totalRevenue: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[] {
    return getTopSellingProducts(this.db, this.branchAccess, limit);
  }

  public async getTopSellingProductsAsync(limit = 5): Promise<{ name: string; quantityM2: number; totalRevenue: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[]> {
    return getTopSellingProductsAsync(this.db, this.branchAccess, limit);
  }

  public getPurchaseReport(dateFrom?: string, dateTo?: string): {
    totalPurchases: number;
    totalPaid: number;
    totalRemaining: number;
    invoices: any[];
  } {
    return getPurchaseReport(this.db, this.branchAccess, dateFrom, dateTo);
  }

  public async getPurchaseReportAsync(dateFrom?: string, dateTo?: string): Promise<{
    totalPurchases: number;
    totalPaid: number;
    totalRemaining: number;
    invoices: any[];
  }> {
    return getPurchaseReportAsync(this.db, this.branchAccess, dateFrom, dateTo);
  }

  public getExpenseReport(dateFrom?: string, dateTo?: string): {
    totalExpenses: number;
    byCategory: { category: string; total: number }[];
    expenses: any[];
  } {
    return getExpenseReport(this.db, this.branchAccess, dateFrom, dateTo);
  }

  public async getExpenseReportAsync(dateFrom?: string, dateTo?: string): Promise<{
    totalExpenses: number;
    byCategory: { category: string; total: number }[];
    expenses: any[];
  }> {
    return getExpenseReportAsync(this.db, this.branchAccess, dateFrom, dateTo);
  }

  public getProfitAndLossReport(dateFrom?: string, dateTo?: string): {
    revenue: number;
    merchandiseRevenue: number;
    shippingRevenue: number;
    otherRevenue: number;
    costOfGoodsSold: number;
    grossProfit: number;
    expenses: number;
    sourceExpenses: number;
    expenseReconciliationDifference: number;
    netProfit: number;
    margin: number;
  } {
    return getProfitAndLossReport(this.db, this.branchAccess, dateFrom, dateTo);
  }

  public async getProfitAndLossReportAsync(dateFrom?: string, dateTo?: string): Promise<{
    revenue: number;
    merchandiseRevenue: number;
    shippingRevenue: number;
    otherRevenue: number;
    costOfGoodsSold: number;
    grossProfit: number;
    expenses: number;
    sourceExpenses: number;
    expenseReconciliationDifference: number;
    netProfit: number;
    margin: number;
  }> {
    return getProfitAndLossReportAsync(this.db, this.branchAccess, dateFrom, dateTo);
  }

  public getDashboardProfitData(dateFrom: string, dateTo: string): DashboardProfitData {
    return getDashboardProfitData(this.db, this.branchAccess, dateFrom, dateTo);
  }

  public async getDashboardProfitDataAsync(dateFrom: string, dateTo: string): Promise<DashboardProfitData> {
    return getDashboardProfitDataAsync(this.db, this.branchAccess, dateFrom, dateTo);
  }

  public getCategorySalesReport(dateFrom?: string, dateTo?: string): { categoryName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[] {
    return getCategorySalesReport(this.db, this.branchAccess, dateFrom, dateTo);
  }

  public async getCategorySalesReportAsync(dateFrom?: string, dateTo?: string): Promise<{ categoryName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[]> {
    return getCategorySalesReportAsync(this.db, this.branchAccess, dateFrom, dateTo);
  }

  public getBrandSalesReport(dateFrom?: string, dateTo?: string): { brandName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[] {
    return getBrandSalesReport(this.db, this.branchAccess, dateFrom, dateTo);
  }

  public async getBrandSalesReportAsync(dateFrom?: string, dateTo?: string): Promise<{ brandName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[]> {
    return getBrandSalesReportAsync(this.db, this.branchAccess, dateFrom, dateTo);
  }

  public getInventoryValuationReport(): {
    totalCostValue: number;
    totalSaleValue: number;
    byWarehouse: { warehouseName: string; costValue: number; saleValue: number; items: number }[];
  } {
    return getInventoryValuationReport(this.db, this.branchAccess);
  }

  public async getInventoryValuationReportAsync(): Promise<{
    totalCostValue: number;
    totalSaleValue: number;
    byWarehouse: { warehouseName: string; costValue: number; saleValue: number; items: number }[];
  }> {
    return getInventoryValuationReportAsync(this.db, this.branchAccess);
  }

  public getMonthlyComparison(): MonthlyComparison {
    return getMonthlyComparison(this.db, this.branchAccess);
  }

  public async getMonthlyComparisonAsync(): Promise<MonthlyComparison> {
    return getMonthlyComparisonAsync(this.db, this.branchAccess);
  }

  public getDailyComparison(): MonthlyComparison {
    return getDailyComparison(this.db, this.branchAccess);
  }

  public getYearlyComparison(): MonthlyComparison {
    return getYearlyComparison(this.db, this.branchAccess);
  }

  public getNetSalesAnalysis(dateFrom?: string, dateTo?: string): { grossSales: number; returns: number; netSales: number; returnedCost: number; netProfit: number; invoices: number; returnRate: number } {
    return getNetSalesAnalysis(this.db, this.branchAccess, dateFrom, dateTo);
  }

  // Aliases for common naming variants
  public getDayComparison() { return this.getDailyComparison(); }
  public getYearComparison() { return this.getYearlyComparison(); }
  public getNetSales(dateFrom?: string, dateTo?: string) { return this.getNetSalesAnalysis(dateFrom, dateTo); }
  public getNetSalesAfterReturns(dateFrom?: string, dateTo?: string) { return this.getNetSalesAnalysis(dateFrom, dateTo); }

  public getTopCustomers(limit = 5): { name: string; totalPurchases: number; purchaseCount: number }[] {
    return getTopCustomers(this.db, this.branchAccess, limit);
  }

  public async getTopCustomersAsync(limit = 5): Promise<{ name: string; totalPurchases: number; purchaseCount: number }[]> {
    return getTopCustomersAsync(this.db, this.branchAccess, limit);
  }

  public getPaymentMethodDistribution(): { method: string; count: number; totalAmount: number }[] {
    return getPaymentMethodDistribution(this.db, this.branchAccess);
  }

  public async getPaymentMethodDistributionAsync(): Promise<{ method: string; count: number; totalAmount: number }[]> {
    return getPaymentMethodDistributionAsync(this.db, this.branchAccess);
  }

  public getSalesByGrade(): { grade: string; quantityM2: number; totalRevenue: number }[] {
    return getSalesByGrade(this.db, this.branchAccess);
  }

  public async getSalesByGradeAsync(): Promise<{ grade: string; quantityM2: number; totalRevenue: number }[]> {
    return getSalesByGradeAsync(this.db, this.branchAccess);
  }

  public getRecentActivities(limit = 10): RecentDashboardActivity[] {
    return getRecentActivities(this.db, this.branchAccess, limit);
  }

  public async getRecentActivitiesAsync(limit = 10): Promise<RecentDashboardActivity[]> {
    return getRecentActivitiesAsync(this.db, this.branchAccess, limit);
  }
}
