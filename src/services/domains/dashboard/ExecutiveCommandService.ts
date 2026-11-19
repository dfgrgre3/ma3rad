import { localDateString } from '../../../utils/shared/date';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import type {
  CommandPeriod,
  CommandRange,
  DrilldownKey,
  ManufacturingSummary,
  DrilldownResult,
  ExecutiveCommandOverview,
  PeriodSnapshot,
} from '../../../types/dashboard/executiveCommand';
import { ExecutiveCommandAggregates } from './ExecutiveCommandService/aggregates';
import { ManufacturingService } from '../manufacturing/ManufacturingService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { ExecutiveCommandDrilldowns } from './ExecutiveCommandService/drilldowns';
import { resolvePeriod } from './ExecutiveCommandService/period';
import { count, money, numberAr, round2, toNumber } from './ExecutiveCommandService/formatters';

/**
 * Executive command centre: one read-only aggregation surface for the main
 * dashboard. Every headline number has a matching drill-down query that returns
 * the exact records which produced it.
 *
 * Implementation is split across ./ExecutiveCommandService/* modules:
 *  - aggregates.ts  — read-only KPI queries behind getOverview
 *  - drilldowns.ts  — per-metric record queries behind getDrilldown
 *  - period.ts      — CommandRange → CommandPeriod resolution
 *  - scopes.ts      — branch/company SQL scopes
 *  - formatters.ts  — shared numeric/label formatters
 */
export class ExecutiveCommandService {
  private aggregates = new ExecutiveCommandAggregates();
  private drilldowns = new ExecutiveCommandDrilldowns(this.aggregates);

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  public getOverview(range: CommandRange): ExecutiveCommandOverview {
    const actor = this.requireCoreAccess();
    const period = resolvePeriod(range);
    const today = localDateString();

    const sales = this.aggregates.getSalesTotals(period.from, period.to);
    const todaySales = this.aggregates.getSalesTotals(today, today);
    const previousSales = this.aggregates.getSalesTotals(period.previousFrom, period.previousTo);
    const expensesTotal = this.aggregates.getExpenseTotals(period.from, period.to);
    const previousExpenses = this.aggregates.getExpenseTotals(period.previousFrom, period.previousTo);
    const collections = this.aggregates.getCollections(period.from, period.to);
    const previousCollections = this.aggregates.getCollections(period.previousFrom, period.previousTo);
    const receivables = this.aggregates.getReceivables(today);
    const liquidity = this.aggregates.getLiquidity();
    const inventoryRows = this.aggregates.getInventoryRows();
    const lowStockRows = this.aggregates.getLowStockRows();
    const topProducts = this.aggregates.getTopProducts(period.from, period.to, 10);
    const slowMoving = this.aggregates.getSlowMoving(200);
    const branches = this.aggregates.getBranchPerformance(period.from, period.to);
    const employees = this.aggregates.getEmployeeSales(period.from, period.to, 10);
    const cashFlow = this.aggregates.getCashFlow(period.from, period.to, expensesTotal.total, collections.total);
    const profit = this.aggregates.getProfit(period.from, period.to, expensesTotal.total);
    const previousProfit = this.aggregates.getProfit(period.previousFrom, period.previousTo, previousExpenses.total);

    const inventoryCostValue = round2(inventoryRows.reduce((sum, row) => sum + row.costValue, 0));
    const inventorySaleValue = round2(inventoryRows.reduce((sum, row) => sum + row.saleValue, 0));
    const inventoryQuantity = round2(inventoryRows.reduce((sum, row) => sum + row.quantity, 0));
    const lowStockProductIds = new Set(lowStockRows.filter((row) => row.quantity > 0).map((row) => row.productId));
    const outOfStockProductIds = new Set(lowStockRows.filter((row) => row.quantity <= 0).map((row) => row.productId));
    const overdueRows = this.aggregates.getOverdueInvoiceRows(today);

    const trend = this.aggregates.getTrend(period);
    const manufacturing = this.getManufacturingSummary(actor, period.from, period.to);

    const current: PeriodSnapshot = {
      sales: sales.net,
      profit: profit.net,
      expenses: expensesTotal.total,
      collections: collections.total,
      invoices: sales.invoiceCount,
      purchases: sales.purchases,
    };
    const previous: PeriodSnapshot = {
      sales: previousSales.net,
      profit: previousProfit.net,
      expenses: previousExpenses.total,
      collections: previousCollections.total,
      invoices: previousSales.invoiceCount,
      purchases: previousSales.purchases,
    };

    return {
      period,
      generatedAt: new Date().toISOString(),
      sales: {
        net: sales.net,
        gross: sales.gross,
        returns: sales.returns,
        invoiceCount: sales.invoiceCount,
        today: todaySales.net,
        todayInvoiceCount: todaySales.invoiceCount,
        purchases: sales.purchases,
        purchaseCount: sales.purchaseCount,
      },
      profit: {
        net: profit.net,
        margin: sales.net > 0 ? Number(((profit.net / sales.net) * 100).toFixed(1)) : 0,
        source: profit.source,
      },
      expenses: {
        total: expensesTotal.total,
        today: this.aggregates.getExpenseTotals(today, today).total,
        count: expensesTotal.count,
      },
      collections,
      receivables: {
        total: receivables.total,
        invoiceCount: receivables.count,
        overdueTotal: round2(overdueRows.reduce((sum, row) => sum + toNumber(row.remaining), 0)),
        overdueCount: overdueRows.length,
      },
      liquidity,
      inventory: {
        costValue: inventoryCostValue,
        saleValue: inventorySaleValue,
        unavailable: false,
        lowStockCount: lowStockProductIds.size,
        outOfStockCount: outOfStockProductIds.size,
        productCount: inventoryRows.length,
        totalQuantity: inventoryQuantity,
      },
      cashFlow,
      topProducts,
      slowMoving,
      branches,
      employees,
      trend,
      comparison: { current, previous },
      alerts: {
        overdueInvoices: overdueRows.slice(0, 5).map((row) => ({
          id: String(row.id),
          invoiceNumber: String(row.invoiceNumber),
          customer: String(row.customer),
          remaining: toNumber(row.remaining),
          daysOverdue: toNumber(row.daysOverdue),
        })),
        lowStock: lowStockRows.slice(0, 5),
      },
      manufacturing,
    };
  }

  public getDrilldown(key: DrilldownKey, range: CommandRange): DrilldownResult {
    this.requireCoreAccess();
    const period = resolvePeriod(range);
    const today = localDateString();

    switch (key) {
      case 'salesToday':
        return this.drilldowns.invoiceDrilldown(key, 'مبيعات اليوم', `فواتير ${today}`, today, today);
      case 'salesMonth':
        return this.drilldowns.invoiceDrilldown(key, 'مبيعات الفترة', period.label, period.from, period.to);
      case 'sales':
        return this.drilldowns.invoiceDrilldown(key, 'فواتير المبيعات', period.label, period.from, period.to);
      case 'profit':
        return this.drilldowns.profitDrilldown(period.from, period.to);
      case 'expenses':
        return this.drilldowns.expenseDrilldown(key, 'المصروفات', period.label, period.from, period.to);
      case 'expensesToday':
        return this.drilldowns.expenseDrilldown(key, 'مصروفات اليوم', today, today, today);
      case 'collections':
        return this.drilldowns.collectionsDrilldown(period.from, period.to);
      case 'receivables':
        return this.drilldowns.receivablesDrilldown(false);
      case 'overdueInvoices':
        return this.drilldowns.receivablesDrilldown(true);
      case 'cashBalance':
        return this.drilldowns.cashDrilldown();
      case 'inventory':
      case 'inventoryValue':
        return this.drilldowns.inventoryDrilldown();
      case 'topProducts':
        return this.drilldowns.topProductsDrilldown(period.from, period.to);
      case 'slowMoving':
        return this.drilldowns.slowMovingDrilldown();
      case 'branches':
        return this.drilldowns.branchesDrilldown(period.from, period.to);
      case 'employees':
        return this.drilldowns.employeesDrilldown(period.from, period.to);
      case 'cashFlow':
      case 'cashInflow':
      case 'cashOutflow':
        return this.drilldowns.cashFlowDrilldown(period.from, period.to, key);
      case 'purchases':
        return this.drilldowns.purchasesDrilldown(period.from, period.to);
      case 'lowStock':
        return this.drilldowns.lowStockDrilldown();
      case 'manufacturing':
        return this.drilldowns.manufacturingDrilldown();
      case 'comparison':
        return this.comparisonDrilldown(period);
      default:
        return this.drilldowns.invoiceDrilldown('sales', 'فواتير المبيعات', period.label, period.from, period.to);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Scope & ranges
  // ───────────────────────────────────────────────────────────────────────────

  private requireCoreAccess() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.view', '/sales');
    PermissionService.require(actor, 'purchases.view', '/purchases');
    PermissionService.require(actor, 'finance.view', '/finance');
    PermissionService.require(actor, 'inventory.view', '/inventory');
    return actor;
  }

  /** Manufacturing KPIs, only when the actor may view manufacturing and the module is enabled. */
  private getManufacturingSummary(
    actor: ReturnType<typeof AuthService.requireAuth>,
    from: string,
    to: string,
  ): ManufacturingSummary | null {
    if (!PermissionService.can(actor, 'manufacturing.view')) return null;
    if (!ModuleRegistryService.isModuleEnabled('manufacturing')) return null;
    try {
      const summary = this.aggregates.getManufacturingSummary(from, to);
      const service = new ManufacturingService();
      const wip = service.getWipValuation();
      const shortages = service.getMaterialShortages();
      const bomAlerts = service.getBomStockAlerts();
      return {
        activeOrders: summary.activeOrders,
        inProgressOrders: summary.inProgressOrders,
        completedInPeriod: summary.completedInPeriod,
        completedQuantity: summary.completedQuantity,
        wipOrders: wip.orders.length,
        wipMaterialCost: wip.totalMaterialCost,
        materialShortages: shortages.length,
        bomStockAlerts: bomAlerts.length,
      };
    } catch (error) {
      console.error('[executive] manufacturing summary failed', error);
      return null;
    }
  }

  private comparisonDrilldown(period: CommandPeriod): DrilldownResult {
    const now = this.getOverview(period.range);
    const metrics: Array<[string, number, number, 'money' | 'number']> = [
      ['المبيعات', now.comparison.current.sales, now.comparison.previous.sales, 'money'],
      ['صافي الربح', now.comparison.current.profit, now.comparison.previous.profit, 'money'],
      ['المصروفات', now.comparison.current.expenses, now.comparison.previous.expenses, 'money'],
      ['التحصيلات', now.comparison.current.collections, now.comparison.previous.collections, 'money'],
      ['عدد الفواتير', now.comparison.current.invoices, now.comparison.previous.invoices, 'number'],
      ['المشتريات', now.comparison.current.purchases, now.comparison.previous.purchases, 'money'],
    ];
    return {
      key: 'comparison',
      title: 'مقارنة الأداء بالفترة السابقة',
      subtitle: `${period.label} مقابل ${period.previousLabel}`,
      columns: [
        { key: 'metric', label: 'المؤشر' },
        { key: 'current', label: 'الفترة الحالية', type: 'money' },
        { key: 'previous', label: 'الفترة السابقة', type: 'money' },
        { key: 'change', label: 'التغير %', type: 'percent' },
      ],
      rows: metrics.map(([metric, current, previous]) => ({
        metric,
        current: round2(current),
        previous: round2(previous),
        change: previous !== 0 ? Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1)) : null,
      })),
      totals: [],
    };
  }
}

export const executiveCommandService = new ExecutiveCommandService();

/** Shared formatters used by the command-centre components. */
export const commandFormatters = { money, count, numberAr };
