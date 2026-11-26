import { financialFieldVisibility } from '../../auth/sensitiveFields';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import type {
  DashboardActivityRow,
  DashboardContext,
  DashboardMetrics,
  DashboardProfitData,
  MonthlyComparison,
  RecentDashboardActivity,
} from './types';

export function assembleDashboardMetrics(
  rows: Record<string, any[]>,
  ctx: DashboardContext,
  fifoError: boolean,
  monthNetOverride: number | undefined,
  getProfitData: (dateFrom: string, dateTo: string) => DashboardProfitData,
): DashboardMetrics {
  const { today, monthStart } = ctx;
  const salesStats = rows.salesStats[0] || {};
  const returnStats = rows.returnStats[0] || {};
  const prevMonthSales = Number(rows.prevMonthSales[0]?.sales || 0);
  const purchaseStats = rows.purchaseStats[0] || {};
  const expenseStats = rows.expenseStats[0] || {};
  const customerDebts = rows.customerDebts[0]?.totalReceivables || 0;
  const urgentDebts = rows.urgentDebts[0]?.count || 0;
  const supplierPayables = rows.supplierPayables[0]?.totalPayables || 0;
  const invStats: any = rows.invStats[0] || { valuationCost: null, valuationSale: null, lowStock: 0, outOfStock: 0 };
  const topCustomer = rows.topCustomer[0] || null;
  // Add flag to indicate valuation is unavailable
  invStats.valuationUnavailable = fifoError;

  const monthGross = Number(salesStats.monthGrossProfit || 0)
    - Number(returnStats.monthReturns || 0)
    + Number(returnStats.monthReturnedCost || 0);
  const monthExp = expenseStats.monthExpenses || 0;
  // Unify the profit source of truth with the executive dashboard / P&L:
  // net profit is derived from posted journal entries (revenue & expense
  // accounts), so unposted invoices and expenses without ledger entries do
  // not affect it. Fall back to the invoice/expense based figure only when
  // no posted entries exist for the period.
  let monthNet = monthGross - monthExp;
  if (monthNetOverride !== undefined) {
    monthNet = monthNetOverride;
  } else {
    try {
      monthNet = getProfitData(monthStart, today).netProfit;
    } catch {
      // keep operational estimate if ledger query is unavailable
    }
  }
  const monthSales = Number(salesStats.monthSales || 0) - Number(returnStats.monthReturns || 0);
  const todaySales = Number(salesStats.todaySales || 0) - Number(returnStats.todayReturns || 0);

  // Calculate growth rate
  const salesGrowthRate = prevMonthSales > 0
    ? Number(((monthSales - prevMonthSales) / prevMonthSales * 100).toFixed(1))
    : 0;

  // Calculate profit margin
  const profitMargin = monthSales > 0
    ? Number((monthNet / monthSales * 100).toFixed(1))
    : 0;

  // Calculate average order value
  const averageOrderValue = salesStats.todaySalesCount > 0 && todaySales > 0
    ? Number((todaySales / salesStats.todaySalesCount).toFixed(2))
    : 0;

  // Average order value is sales data; profit/valuation fields are masked
  // for users without the explicit sensitivity grants (finance.*.view).
  const canSeeCost = financialFieldVisibility().cost;
  const canSeeProfit = financialFieldVisibility().profit;

  // Domain-level masking: each metric group is nulled (rendered as "—") when
  // the actor lacks the matching view permission, so users with partial
  // permissions see only the indicators they are allowed to see.
  const actor = AuthService.getCurrentUser();
  const canSeeSales = PermissionService.can(actor, 'sales.view', '/sales');
  const canSeePurchases = PermissionService.can(actor, 'purchases.view', '/purchases');
  const canSeeFinance = PermissionService.can(actor, 'finance.view', '/finance');
  const canSeeInventory = PermissionService.can(actor, 'inventory.view', '/inventory');
  const orNull = (value: number | null, allowed: boolean) => (allowed ? value : null);

  return {
    todaySales: orNull(Number(todaySales.toFixed(2)), canSeeSales),
    monthSales: orNull(Number(monthSales.toFixed(2)), canSeeSales),
    todayPurchases: orNull(Number((purchaseStats.todayPurchases || 0).toFixed(2)), canSeePurchases),
    todayExpenses: orNull(Number((expenseStats.todayExpenses || 0).toFixed(2)), canSeeFinance),
    grossProfit: orNull(Number(monthGross.toFixed(2)), canSeeProfit),
    netProfit: orNull(Number(monthNet.toFixed(2)), canSeeProfit),
    totalReceivables: orNull(Number(customerDebts.toFixed(2)), canSeeFinance),
    totalPayables: orNull(Number(supplierPayables.toFixed(2)), canSeeFinance),
    inventoryValuationCost: !canSeeInventory
      ? null
      : canSeeCost && !invStats.valuationUnavailable
        ? Number((invStats.valuationCost || 0).toFixed(2))
        : invStats.valuationUnavailable ? null : 0,
    inventoryValuationSale: orNull(Number((invStats.valuationSale || 0).toFixed(2)), canSeeInventory),
    inventoryValuationUnavailable: invStats.valuationUnavailable || false,
    lowStockCount: orNull(invStats.lowStock || 0, canSeeInventory),
    outOfStockCount: orNull(invStats.outOfStock || 0, canSeeInventory),
    salesCount: orNull(salesStats.todaySalesCount || 0, canSeeSales),
    previousMonthSales: orNull(Number(prevMonthSales.toFixed(2)), canSeeSales),
    salesGrowthRate: orNull(salesGrowthRate, canSeeSales),
    profitMargin: orNull(profitMargin, canSeeProfit),
    averageOrderValue: orNull(averageOrderValue, canSeeSales),
    topCustomer: canSeeSales && topCustomer ? { name: topCustomer.name, totalPurchases: Number((topCustomer.total_purchases || 0).toFixed(2)) } : null,
    urgentDebtsCount: orNull(urgentDebts, canSeeFinance)
  };
}

export function mapSalesTrendRows(rows: any[], dates: string[]): { date: string; sales: number; profit: number | null }[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const canSeeProfit = financialFieldVisibility().profit;
  return dates.map((date) => {
    const row = byDate.get(date);
    return {
      date,
      sales: Number((row?.sales || 0).toFixed(2)),
      profit: canSeeProfit ? Number((row?.profit || 0).toFixed(2)) : null,
    };
  });
}

export function mapPurchaseReport(invoices: any[], totals: any): { totalPurchases: number; totalPaid: number; totalRemaining: number; invoices: any[] } {
  totals = totals || {};
  return {
    totalPurchases: Number((totals.totalPurchases || 0).toFixed(2)),
    totalPaid: Number((totals.totalPaid || 0).toFixed(2)),
    totalRemaining: Number((totals.totalRemaining || 0).toFixed(2)),
    invoices
  };
}

export function mapExpenseReport(expenseRows: any[], byCategory: any[], totalResult: any): { totalExpenses: number; byCategory: { category: string; total: number }[]; expenses: any[] } {
  const expenses = expenseRows.map((row) => ({ ...row, amount: Number(row.amount) / 100 }));
  totalResult = totalResult || {};
  return {
    totalExpenses: Number((totalResult.totalExpenses || 0).toFixed(2)),
    byCategory,
    expenses
  };
}

export function computeProfitAndLoss(balances: { code: string; type: string; amount: number }[], sourceExpensesValue: number): {
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
  const merchandiseRevenue = Number(balances.filter((row) => row.code === '4101').reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2));
  const shippingRevenue = Number(balances.filter((row) => row.code === '4102').reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2));
  const otherRevenue = Number(balances.filter((row) => row.type === 'REVENUE' && !['4101', '4102'].includes(row.code)).reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2));
  const revenue = Number((merchandiseRevenue + shippingRevenue + otherRevenue).toFixed(2));
  const costOfGoodsSold = Number(balances.filter((row) => row.type === 'EXPENSE' && row.code === '5101').reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2));
  const grossProfit = Number((merchandiseRevenue - costOfGoodsSold).toFixed(2));
  const expenses = Number(balances.filter((row) => row.type === 'EXPENSE' && row.code !== '5101').reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2));
  const roundedSourceExpenses = Number(sourceExpensesValue.toFixed(2));
  const expenseReconciliationDifference = Number((roundedSourceExpenses - expenses).toFixed(2));
  const netProfit = Number((grossProfit + shippingRevenue + otherRevenue - expenses).toFixed(2));
  const margin = revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(1)) : 0;

  return {
    revenue, merchandiseRevenue, shippingRevenue, otherRevenue, costOfGoodsSold, grossProfit, expenses,
    sourceExpenses: roundedSourceExpenses, expenseReconciliationDifference, netProfit, margin,
  };
}

export function computeDashboardProfitData(balances: { date: string; code: string; type: 'REVENUE' | 'EXPENSE'; amount: number }[]): DashboardProfitData {
  const accountBalances = new Map<string, { type: 'REVENUE' | 'EXPENSE'; amount: number }>();
  const dailyAccountBalances = new Map<string, { date: string; type: 'REVENUE' | 'EXPENSE'; amount: number }>();
  for (const balance of balances) {
    const amount = Number(balance.amount);
    const accountKey = `${balance.code}:${balance.type}`;
    const accountBalance = accountBalances.get(accountKey) || { type: balance.type, amount: 0 };
    accountBalance.amount += amount;
    accountBalances.set(accountKey, accountBalance);

    const dailyAccountKey = `${balance.date}:${accountKey}`;
    const dailyAccountBalance = dailyAccountBalances.get(dailyAccountKey) || {
      date: balance.date,
      type: balance.type,
      amount: 0,
    };
    dailyAccountBalance.amount += amount;
    dailyAccountBalances.set(dailyAccountKey, dailyAccountBalance);
  }

  const dailyProfits = new Map<string, number>();
  for (const balance of dailyAccountBalances.values()) {
    const roundedAmount = Number(balance.amount.toFixed(2));
    const signedAmount = balance.type === 'REVENUE' ? roundedAmount : -roundedAmount;
    dailyProfits.set(balance.date, (dailyProfits.get(balance.date) || 0) + signedAmount);
  }

  const dailyNetProfit = [...dailyProfits.entries()].map(([date, profit]) => ({
    date,
    profit: Number(profit.toFixed(2)),
  }));

  return {
    netProfit: Number([...accountBalances.values()].reduce(
      (sum, account) => sum + (account.type === 'REVENUE'
        ? Number(account.amount.toFixed(2))
        : -Number(account.amount.toFixed(2))),
      0
    ).toFixed(2)),
    dailyNetProfit,
  };
}

export function mapMonthlyComparison(summaries: any): MonthlyComparison {
  summaries = summaries || {};
  const current = {
    sales: Number(summaries.currentSalesRevenue || 0) - Number(summaries.currentReturnedRevenue || 0),
    profit: Number(summaries.currentProfit || 0) - Number(summaries.currentReturnedRevenue || 0) + Number(summaries.currentReturnedCost || 0),
    invoices: Number(summaries.currentInvoices || 0),
  };
  const previous = {
    sales: Number(summaries.previousSalesRevenue || 0) - Number(summaries.previousReturnedRevenue || 0),
    profit: Number(summaries.previousProfit || 0) - Number(summaries.previousReturnedRevenue || 0) + Number(summaries.previousReturnedCost || 0),
    invoices: Number(summaries.previousInvoices || 0),
  };

  const canSeeProfit = financialFieldVisibility().profit;
  const currentMonth = {
    sales: Number((current.sales || 0).toFixed(2)),
    profit: canSeeProfit ? Number((current.profit || 0).toFixed(2)) : null,
    invoices: current.invoices || 0,
  };
  const previousMonth = {
    sales: Number((previous.sales || 0).toFixed(2)),
    profit: canSeeProfit ? Number((previous.profit || 0).toFixed(2)) : null,
    invoices: previous.invoices || 0,
  };

  return {
    currentMonth,
    previousMonth,
    salesGrowth: previousMonth.sales > 0
      ? Number(((currentMonth.sales - previousMonth.sales) / previousMonth.sales * 100).toFixed(1))
      : null,
    invoiceGrowth: previousMonth.invoices > 0
      ? Number(((currentMonth.invoices - previousMonth.invoices) / previousMonth.invoices * 100).toFixed(1))
      : null,
    currentMonthInvoices: currentMonth.invoices,
  };
}

export function maskReportProfit<T extends { profit: number | null }>(rows: T[]): T[] {
  const canSee = financialFieldVisibility().profit;
  return rows.map((row) => ({ ...row, profit: canSee ? Number(row.profit || 0) : null }));
}

export function mapInventoryValuation(byWarehouse: any[], totals: any): {
  totalCostValue: number;
  totalSaleValue: number;
  byWarehouse: { warehouseName: string; costValue: number; saleValue: number; items: number }[];
} {
  totals = totals || {};
  return {
    totalCostValue: Number((totals.totalCost || 0).toFixed(2)),
    totalSaleValue: Number((totals.totalSale || 0).toFixed(2)),
    byWarehouse
  };
}

export function mapRecentActivities(sales: DashboardActivityRow[], purchases: DashboardActivityRow[], stocks: DashboardActivityRow[], limit: number): RecentDashboardActivity[] {
  const activities: DashboardActivityRow[] = [...sales, ...purchases, ...stocks];
  activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const activityTypes: Record<string, RecentDashboardActivity['type']> = {
    SALE: 'sale',
    PURCHASE: 'purchase',
    STOCK: 'inventory',
  };

  return activities.slice(0, limit).map(a => ({
    type: activityTypes[a.type],
    description: a.description,
    amount: a.amount == null ? undefined : Number(Number(a.amount).toFixed(2)),
    timestamp: a.date,
  }));
}
