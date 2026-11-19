import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import {
  buildBrandSalesSpec,
  buildCategorySalesSpec,
  buildExpenseReportSpec,
  buildInventoryValuationSpecs,
  buildProfitAndLossSpecs,
  buildPurchaseReportSpec,
} from './reportSpecs';
import { buildProfitBalancesSpec } from './dashboardSpecs';
import {
  computeDashboardProfitData,
  computeProfitAndLoss,
  mapExpenseReport,
  mapInventoryValuation,
  mapPurchaseReport,
  maskReportProfit,
} from './mappers';
import {
  requireProfitAndLossView,
  requireProfitView,
  requireSalesReportView,
  requireView,
} from './permissions';
import type {
  DashboardProfitData,
  ProfitAndLossReport,
} from './types';

export function getPurchaseReport(db: DatabaseManager, access: BranchAccessService, dateFrom?: string, dateTo?: string): {
  totalPurchases: number;
  totalPaid: number;
  totalRemaining: number;
  invoices: any[];
} {
  const { invoicesSql, totalsSql, params } = buildPurchaseReportSpec(dateFrom, dateTo, access);
  return mapPurchaseReport(
    db.query<any>(invoicesSql, params),
    db.query<any>(totalsSql, params)[0],
  );
}

export async function getPurchaseReportAsync(db: DatabaseManager, access: BranchAccessService, dateFrom?: string, dateTo?: string): Promise<{
  totalPurchases: number;
  totalPaid: number;
  totalRemaining: number;
  invoices: any[];
}> {
  const { invoicesSql, totalsSql, params } = buildPurchaseReportSpec(dateFrom, dateTo, access);
  const [invoices, totalsRows] = await Promise.all([
    db.queryAsync<any>(invoicesSql, params),
    db.queryAsync<any>(totalsSql, params),
  ]);
  return mapPurchaseReport(invoices, totalsRows[0]);
}

export function getExpenseReport(db: DatabaseManager, access: BranchAccessService, dateFrom?: string, dateTo?: string): {
  totalExpenses: number;
  byCategory: { category: string; total: number }[];
  expenses: any[];
} {
  const { whereClause, params } = buildExpenseReportSpec(dateFrom, dateTo, access);
  const expenseRows = db.query<any>(`
    SELECT e.*, u.full_name as performedByName
    FROM expenses e
    LEFT JOIN users u ON e.performed_by = u.id
    ${whereClause}
    ORDER BY e.date DESC
  `, params);
  const byCategory = db.query<any>(`
    SELECT e.category, SUM(e.amount) / 100.0 as total
    FROM expenses e
    ${whereClause}
    GROUP BY e.category
    ORDER BY total DESC
  `, params);
  const totalResult = db.query<any>(`
    SELECT SUM(amount) / 100.0 as totalExpenses
    FROM expenses e
    ${whereClause}
  `, params)[0];
  return mapExpenseReport(expenseRows, byCategory, totalResult);
}

export async function getExpenseReportAsync(db: DatabaseManager, access: BranchAccessService, dateFrom?: string, dateTo?: string): Promise<{
  totalExpenses: number;
  byCategory: { category: string; total: number }[];
  expenses: any[];
}> {
  const { whereClause, params } = buildExpenseReportSpec(dateFrom, dateTo, access);
  const [expenseRows, byCategory, totalRows] = await Promise.all([
    db.queryAsync<any>(`
      SELECT e.*, u.full_name as performedByName
      FROM expenses e
      LEFT JOIN users u ON e.performed_by = u.id
      ${whereClause}
      ORDER BY e.date DESC
    `, params),
    db.queryAsync<any>(`
      SELECT e.category, SUM(e.amount) / 100.0 as total
      FROM expenses e
      ${whereClause}
      GROUP BY e.category
      ORDER BY total DESC
    `, params),
    db.queryAsync<any>(`
      SELECT SUM(amount) / 100.0 as totalExpenses
      FROM expenses e
      ${whereClause}
    `, params),
  ]);
  return mapExpenseReport(expenseRows, byCategory, totalRows[0]);
}

export function getProfitAndLossReport(db: DatabaseManager, access: BranchAccessService, dateFrom?: string, dateTo?: string): ProfitAndLossReport {
  requireProfitAndLossView(dateFrom, dateTo);
  const { balancesSql, balancesParams, sourceExpensesSql, sourceExpensesParams } = buildProfitAndLossSpecs(dateFrom, dateTo, access);
  const balances = db.query<{ code: string; type: string; amount: number }>(balancesSql, balancesParams);
  const sourceExpenses = Number(db.query<{ total: number }>(sourceExpensesSql, sourceExpensesParams)[0]?.total || 0);
  return computeProfitAndLoss(balances, sourceExpenses);
}

export async function getProfitAndLossReportAsync(db: DatabaseManager, access: BranchAccessService, dateFrom?: string, dateTo?: string): Promise<ProfitAndLossReport> {
  requireProfitAndLossView(dateFrom, dateTo);
  const { balancesSql, balancesParams, sourceExpensesSql, sourceExpensesParams } = buildProfitAndLossSpecs(dateFrom, dateTo, access);
  const [balances, sourceExpenseRows] = await Promise.all([
    db.queryAsync<{ code: string; type: string; amount: number }>(balancesSql, balancesParams),
    db.queryAsync<{ total: number }>(sourceExpensesSql, sourceExpensesParams),
  ]);
  return computeProfitAndLoss(balances, Number(sourceExpenseRows[0]?.total || 0));
}

export function getDashboardProfitData(db: DatabaseManager, access: BranchAccessService, dateFrom: string, dateTo: string): DashboardProfitData {
  requireProfitView(dateFrom, dateTo);
  const spec = buildProfitBalancesSpec(dateFrom, dateTo, access);
  const balances = db.query<{ date: string; code: string; type: 'REVENUE' | 'EXPENSE'; amount: number }>(spec.sql, spec.params);
  return computeDashboardProfitData(balances);
}

export async function getDashboardProfitDataAsync(db: DatabaseManager, access: BranchAccessService, dateFrom: string, dateTo: string): Promise<DashboardProfitData> {
  requireProfitView(dateFrom, dateTo);
  const spec = buildProfitBalancesSpec(dateFrom, dateTo, access);
  const balances = await db.queryAsync<{ date: string; code: string; type: 'REVENUE' | 'EXPENSE'; amount: number }>(spec.sql, spec.params);
  return computeDashboardProfitData(balances);
}

export function getCategorySalesReport(db: DatabaseManager, access: BranchAccessService, dateFrom?: string, dateTo?: string): { categoryName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[] {
  requireSalesReportView('dashboard.view');
  const { sql, params } = buildCategorySalesSpec(dateFrom, dateTo, access);
  return maskReportProfit(db.query<any>(sql, params));
}

export async function getCategorySalesReportAsync(db: DatabaseManager, access: BranchAccessService, dateFrom?: string, dateTo?: string): Promise<{ categoryName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[]> {
  requireSalesReportView('dashboard.view');
  const { sql, params } = buildCategorySalesSpec(dateFrom, dateTo, access);
  return maskReportProfit(await db.queryAsync<any>(sql, params));
}

export function getBrandSalesReport(db: DatabaseManager, access: BranchAccessService, dateFrom?: string, dateTo?: string): { brandName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[] {
  requireView('reports.view');
  const { sql, params } = buildBrandSalesSpec(dateFrom, dateTo, access);
  return maskReportProfit(db.query<any>(sql, params));
}

export async function getBrandSalesReportAsync(db: DatabaseManager, access: BranchAccessService, dateFrom?: string, dateTo?: string): Promise<{ brandName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[]> {
  requireView('reports.view');
  const { sql, params } = buildBrandSalesSpec(dateFrom, dateTo, access);
  return maskReportProfit(await db.queryAsync<any>(sql, params));
}

export function getInventoryValuationReport(db: DatabaseManager, access: BranchAccessService): {
  totalCostValue: number;
  totalSaleValue: number;
  byWarehouse: { warehouseName: string; costValue: number; saleValue: number; items: number }[];
} {
  const { byWarehouseSql, totalsSql, params } = buildInventoryValuationSpecs(access);
  return mapInventoryValuation(
    db.query<any>(byWarehouseSql, params),
    db.query<any>(totalsSql, params)[0],
  );
}

export async function getInventoryValuationReportAsync(db: DatabaseManager, access: BranchAccessService): Promise<{
  totalCostValue: number;
  totalSaleValue: number;
  byWarehouse: { warehouseName: string; costValue: number; saleValue: number; items: number }[];
}> {
  const { byWarehouseSql, totalsSql, params } = buildInventoryValuationSpecs(access);
  const [byWarehouse, totalsRows] = await Promise.all([
    db.queryAsync<any>(byWarehouseSql, params),
    db.queryAsync<any>(totalsSql, params),
  ]);
  return mapInventoryValuation(byWarehouse, totalsRows[0]);
}
