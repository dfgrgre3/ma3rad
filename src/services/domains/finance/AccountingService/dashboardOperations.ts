import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import {
  buildDashboardContext,
  buildInvStatsSpec,
  buildProfitBalancesSpec,
  dashboardQuerySpecs,
} from './dashboardSpecs';
import { computeDashboardProfitData, assembleDashboardMetrics } from './mappers';
import { requireDashboardView } from './permissions';
import type { DashboardMetrics, DashboardProfitData } from './types';

export function getDashboardMetrics(
  db: DatabaseManager,
  access: BranchAccessService,
  getProfitData: (dateFrom: string, dateTo: string) => DashboardProfitData,
): DashboardMetrics {
  requireDashboardView();
  const ctx = buildDashboardContext(access);
  const specs = dashboardQuerySpecs(ctx);

  const costingMethod = db.query<{ value: string }>(
    specs.costingMethod.sql, specs.costingMethod.params
  )[0]?.value;
  // Handle FIFO errors gracefully
  let fifoError = false;
  if (costingMethod === 'FIFO') {
    const inconsistentStock = db.query<{ productId: string; warehouseId: string }>(
      specs.inconsistentStock.sql, specs.inconsistentStock.params
    )[0];
    if (inconsistentStock) {
      fifoError = true;
      // Don't throw - log warning and continue with valuation unavailable
      console.warn(`FIFO cost layers exceed physical stock for product ${inconsistentStock.productId} in warehouse ${inconsistentStock.warehouseId}. Inventory valuation unavailable.`);
    }
  }
  const rows: Record<string, any[]> = {};
  for (const key of ['salesStats', 'returnStats', 'prevMonthSales', 'purchaseStats', 'expenseStats', 'customerDebts', 'urgentDebts', 'supplierPayables', 'topCustomer'] as const) {
    rows[key] = db.query<any>(specs[key].sql, specs[key].params);
  }
  if (!fifoError) {
    const invSpec = buildInvStatsSpec(ctx, costingMethod);
    rows.invStats = db.query<any>(invSpec.sql, invSpec.params);
  }
  return assembleDashboardMetrics(rows, ctx, fifoError, undefined, getProfitData);
}

export async function getDashboardMetricsAsync(
  db: DatabaseManager,
  access: BranchAccessService,
  getProfitData: (dateFrom: string, dateTo: string) => DashboardProfitData,
): Promise<DashboardMetrics> {
  requireDashboardView();
  const ctx = buildDashboardContext(access);
  const specs = dashboardQuerySpecs(ctx);

  const profitSpec = buildProfitBalancesSpec(ctx.monthStart, ctx.today, access);
  const keys = ['costingMethod', 'inconsistentStock', 'salesStats', 'returnStats', 'prevMonthSales', 'purchaseStats', 'expenseStats', 'customerDebts', 'urgentDebts', 'supplierPayables', 'topCustomer'] as const;
  const results = await Promise.all([
    ...keys.map((key) => db.queryAsync<any>(specs[key].sql, specs[key].params)),
    // Ledger profit query failure must not fail the whole dashboard - fall back to the operational estimate.
    db.queryAsync<any>(profitSpec.sql, profitSpec.params).catch(() => null),
  ]);
  const rows: Record<string, any[]> = {};
  keys.forEach((key, i) => { rows[key] = results[i] as any[]; });
  const profitBalances = results[keys.length] as { date: string; code: string; type: 'REVENUE' | 'EXPENSE'; amount: number }[] | null;
  const monthNetOverride = profitBalances !== null
    ? computeDashboardProfitData(profitBalances).netProfit
    : undefined;

  const costingMethod = rows.costingMethod[0]?.value as string | undefined;
  // Handle FIFO errors gracefully
  let fifoError = false;
  const inconsistentStock = rows.inconsistentStock[0];
  if (costingMethod === 'FIFO' && inconsistentStock) {
    fifoError = true;
    // Don't throw - log warning and continue with valuation unavailable
    console.warn(`FIFO cost layers exceed physical stock for product ${inconsistentStock.productId} in warehouse ${inconsistentStock.warehouseId}. Inventory valuation unavailable.`);
  }
  if (!fifoError) {
    const invSpec = buildInvStatsSpec(ctx, costingMethod);
    rows.invStats = await db.queryAsync<any>(invSpec.sql, invSpec.params);
  }
  return assembleDashboardMetrics(rows, ctx, fifoError, monthNetOverride, getProfitData);
}
