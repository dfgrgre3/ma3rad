import { differenceInCalendarDays, format, startOfDay, startOfMonth, startOfYear, subDays } from 'date-fns';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { AccountingService } from '../finance/AccountingService';
import { localDateString } from '../../../utils/shared/date';
import type {
  BranchPerformanceRow,
  CashAccountRow,
  CommandPeriod,
  CommandRange,
  CommandTrendPoint,
  DrilldownKey,
  DrilldownResult,
  DrilldownRow,
  EmployeeSaleRow,
  ExecutiveCommandOverview,
  InventoryRow,
  LowStockRow,
  PeriodSnapshot,
  ProductSaleRow,
  SlowMovingRow,
} from '../../../types/dashboard/executiveCommand';

const MAX_DRILLDOWN_ROWS = 1500;
const SLOW_MOVING_DAYS = 60;

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const money = (value: number): string => {
  const formatted = (Number.isFinite(value) ? value : 0).toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ج.م`;
};

const count = (value: number): string => (Number.isFinite(value) ? value : 0).toLocaleString('ar-EG');

const numberAr = (value: number): string =>
  (Number.isFinite(value) ? value : 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 });

/**
 * Executive command centre: one read-only aggregation surface for the main
 * dashboard. Every headline number has a matching drill-down query that returns
 * the exact records which produced it.
 */
export class ExecutiveCommandService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private accountingService = new AccountingService();

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  public getOverview(range: CommandRange): ExecutiveCommandOverview {
    this.requireCoreAccess();
    const period = this.resolvePeriod(range);
    const today = localDateString();

    const sales = this.getSalesTotals(period.from, period.to);
    const todaySales = this.getSalesTotals(today, today);
    const previousSales = this.getSalesTotals(period.previousFrom, period.previousTo);
    const expensesTotal = this.getExpenseTotals(period.from, period.to);
    const previousExpenses = this.getExpenseTotals(period.previousFrom, period.previousTo);
    const collections = this.getCollections(period.from, period.to);
    const previousCollections = this.getCollections(period.previousFrom, period.previousTo);
    const receivables = this.getReceivables(today);
    const liquidity = this.getLiquidity();
    const inventoryRows = this.getInventoryRows();
    const lowStockRows = this.getLowStockRows();
    const topProducts = this.getTopProducts(period.from, period.to, 10);
    const slowMoving = this.getSlowMoving(200);
    const branches = this.getBranchPerformance(period.from, period.to);
    const employees = this.getEmployeeSales(period.from, period.to, 10);
    const cashFlow = this.getCashFlow(period.from, period.to, expensesTotal.total, collections.total);
    const profit = this.getProfit(period.from, period.to, expensesTotal.total);
    const previousProfit = this.getProfit(period.previousFrom, period.previousTo, previousExpenses.total);

    const inventoryCostValue = round2(inventoryRows.reduce((sum, row) => sum + row.costValue, 0));
    const inventorySaleValue = round2(inventoryRows.reduce((sum, row) => sum + row.saleValue, 0));
    const inventoryQuantity = round2(inventoryRows.reduce((sum, row) => sum + row.quantity, 0));
    const lowStockProductIds = new Set(lowStockRows.filter((row) => row.quantity > 0).map((row) => row.productId));
    const outOfStockProductIds = new Set(lowStockRows.filter((row) => row.quantity <= 0).map((row) => row.productId));
    const overdueRows = this.getOverdueInvoiceRows(today);

    const trend = this.getTrend(period);

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
        today: this.getExpenseTotals(today, today).total,
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
    };
  }

  public getDrilldown(key: DrilldownKey, range: CommandRange): DrilldownResult {
    this.requireCoreAccess();
    const period = this.resolvePeriod(range);
    const today = localDateString();

    switch (key) {
      case 'salesToday':
        return this.invoiceDrilldown(key, 'مبيعات اليوم', `فواتير ${today}`, today, today);
      case 'salesMonth':
        return this.invoiceDrilldown(key, 'مبيعات الفترة', period.label, period.from, period.to);
      case 'sales':
        return this.invoiceDrilldown(key, 'فواتير المبيعات', period.label, period.from, period.to);
      case 'profit':
        return this.profitDrilldown(period.from, period.to);
      case 'expenses':
        return this.expenseDrilldown(key, 'المصروفات', period.label, period.from, period.to);
      case 'expensesToday':
        return this.expenseDrilldown(key, 'مصروفات اليوم', today, today, today);
      case 'collections':
        return this.collectionsDrilldown(period.from, period.to);
      case 'receivables':
        return this.receivablesDrilldown(false);
      case 'overdueInvoices':
        return this.receivablesDrilldown(true);
      case 'cashBalance':
        return this.cashDrilldown();
      case 'inventory':
      case 'inventoryValue':
        return this.inventoryDrilldown();
      case 'topProducts':
        return this.topProductsDrilldown(period.from, period.to);
      case 'slowMoving':
        return this.slowMovingDrilldown();
      case 'branches':
        return this.branchesDrilldown(period.from, period.to);
      case 'employees':
        return this.employeesDrilldown(period.from, period.to);
      case 'cashFlow':
      case 'cashInflow':
      case 'cashOutflow':
        return this.cashFlowDrilldown(period.from, period.to, key);
      case 'purchases':
        return this.purchasesDrilldown(period.from, period.to);
      case 'lowStock':
        return this.lowStockDrilldown();
      case 'comparison':
        return this.comparisonDrilldown(period);
      default:
        return this.invoiceDrilldown('sales', 'فواتير المبيعات', period.label, period.from, period.to);
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

  private resolvePeriod(range: CommandRange): CommandPeriod {
    const now = new Date();
    const end = startOfDay(now);
    let start: Date;
    let label: string;
    let previousLabel: string;

    switch (range) {
      case 'today':
        start = end;
        label = 'اليوم';
        previousLabel = 'الأمس';
        break;
      case 'week':
        start = subDays(end, 6);
        label = 'آخر ٧ أيام';
        previousLabel = 'الـ٧ أيام السابقة';
        break;
      case 'month':
        start = startOfMonth(end);
        label = 'الشهر حتى تاريخه';
        previousLabel = 'نفس الفترة من الشهر السابق';
        break;
      case 'year':
      default:
        start = startOfYear(end);
        label = 'السنة حتى تاريخه';
        previousLabel = 'نفس الفترة من السنة السابقة';
        break;
    }

    const days = Math.max(1, differenceInCalendarDays(end, start) + 1);
    const previousEnd = subDays(start, 1);
    const previousStart = subDays(previousEnd, days - 1);

    return {
      range,
      from: format(start, 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
      previousFrom: format(previousStart, 'yyyy-MM-dd'),
      previousTo: format(previousEnd, 'yyyy-MM-dd'),
      days,
      label,
      previousLabel,
    };
  }

  private salesScopes() {
    const actor = AuthService.requireAuth();
    return {
      branch: this.branchAccess.sqlScope('si.branch_id', undefined, actor),
      company: this.branchAccess.companyScopeViaBranch('si.branch_id', actor),
    };
  }

  private purchaseScopes() {
    const actor = AuthService.requireAuth();
    return {
      branch: this.branchAccess.sqlScope('pi.branch_id', undefined, actor),
      company: this.branchAccess.companyScopeViaBranch('pi.branch_id', actor),
    };
  }

  private expenseScopes() {
    const actor = AuthService.requireAuth();
    return {
      branch: this.branchAccess.sqlScope('e.branch_id', undefined, actor),
      company: this.branchAccess.companyScopeViaBranch('e.branch_id', actor),
    };
  }

  private warehouseScope() {
    return this.branchAccess.warehouseBranchScope('w');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Core aggregates
  // ───────────────────────────────────────────────────────────────────────────

  private getSalesTotals(from: string, to: string) {
    const sales = this.salesScopes();
    const purchase = this.purchaseScopes();

    const invoiceRow = this.db.query<any>(
      `SELECT
         COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS gross,
         COALESCE(SUM(si.total_amount), 0) / 100.0 AS invoiceTotal,
         COALESCE(SUM(si.gross_profit), 0) / 100.0 AS grossProfit,
         COALESCE(SUM(si.paid_amount), 0) / 100.0 AS paid,
         COALESCE(SUM(si.remaining_amount), 0) / 100.0 AS remaining,
         COUNT(*) AS invoiceCount
       FROM sales_invoices si
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}`,
      [from, to, ...sales.branch.params, ...sales.company.params],
    )[0] ?? {};

    const returnsRow = this.db.query<any>(
      `SELECT COALESCE(SUM(sr.total_amount), 0) / 100.0 AS returns
       FROM sales_returns sr
       JOIN sales_invoices si ON si.id = sr.original_invoice_id
       WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}`,
      [from, to, ...sales.branch.params, ...sales.company.params],
    )[0] ?? {};

    const purchaseRow = this.db.query<any>(
      `SELECT COALESCE(SUM(pi.total_amount), 0) / 100.0 AS purchases,
              COALESCE(SUM(pi.paid_amount), 0) / 100.0 AS paid,
              COUNT(*) AS purchaseCount
       FROM purchase_invoices pi
       WHERE pi.date BETWEEN ? AND ? AND ${purchase.branch.clause} AND ${purchase.company.clause}`,
      [from, to, ...purchase.branch.params, ...purchase.company.params],
    )[0] ?? {};

    const returns = round2(toNumber(returnsRow.returns));
    const gross = round2(toNumber(invoiceRow.gross));
    return {
      gross,
      returns,
      net: round2(gross - returns),
      invoiceCount: Math.trunc(toNumber(invoiceRow.invoiceCount)),
      grossProfit: round2(toNumber(invoiceRow.grossProfit)),
      paid: round2(toNumber(invoiceRow.paid)),
      remaining: round2(toNumber(invoiceRow.remaining)),
      purchases: round2(toNumber(purchaseRow.purchases)),
      purchasesPaid: round2(toNumber(purchaseRow.paid)),
      purchaseCount: Math.trunc(toNumber(purchaseRow.purchaseCount)),
    };
  }

  private getExpenseTotals(from: string, to: string) {
    const scope = this.expenseScopes();
    const row = this.db.query<any>(
      `SELECT COALESCE(SUM(e.amount), 0) / 100.0 AS total, COUNT(*) AS expenseCount
       FROM expenses e
       WHERE e.date BETWEEN ? AND ? AND ${scope.branch.clause} AND ${scope.company.clause}`,
      [from, to, ...scope.branch.params, ...scope.company.params],
    )[0] ?? {};
    return { total: round2(toNumber(row.total)), count: Math.trunc(toNumber(row.expenseCount)) };
  }

  private getCollections(from: string, to: string) {
    const actor = AuthService.requireAuth();
    const sales = this.salesScopes();
    const paymentBranch = this.branchAccess.sqlScope('cp.branch_id', undefined, actor);
    const paymentCompany = this.branchAccess.companyScopeViaBranch('cp.branch_id', actor);

    const invoiceRow = this.db.query<any>(
      `SELECT COALESCE(SUM(si.paid_amount), 0) / 100.0 AS amount,
              COUNT(CASE WHEN si.paid_amount > 0 THEN 1 END) AS receipts
       FROM sales_invoices si
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}`,
      [from, to, ...sales.branch.params, ...sales.company.params],
    )[0] ?? {};

    // Payments received in the period against invoices dated before the period.
    // Payments on invoices created inside the period are already represented by
    // the invoice's paid_amount, so excluding them avoids double counting.
    const laterRow = this.db.query<any>(
      `SELECT COALESCE(SUM(cp.amount), 0) / 100.0 AS amount, COUNT(*) AS receipts
       FROM customer_payments cp
       JOIN sales_invoices si ON si.id = cp.invoice_id
       WHERE cp.date BETWEEN ? AND ? AND si.date < ?
         AND si.invoice_status != 'VOID'
         AND ${paymentBranch.clause} AND ${paymentCompany.clause}`,
      [from, to, from, ...paymentBranch.params, ...paymentCompany.params],
    )[0] ?? {};

    const invoiceCollections = round2(toNumber(invoiceRow.amount));
    const laterCollections = round2(toNumber(laterRow.amount));
    return {
      total: round2(invoiceCollections + laterCollections),
      count: Math.trunc(toNumber(invoiceRow.receipts) + toNumber(laterRow.receipts)),
      invoiceCollections,
      laterCollections,
    };
  }

  private getReceivables(today: string) {
    const sales = this.salesScopes();
    const row = this.db.query<any>(
      `SELECT COALESCE(SUM(si.remaining_amount), 0) / 100.0 AS total, COUNT(*) AS invoiceCount
       FROM sales_invoices si
       WHERE si.remaining_amount > 1 AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}`,
      [...sales.branch.params, ...sales.company.params],
    )[0] ?? {};

    const overdue = this.getOverdueInvoiceRows(today);
    return {
      total: round2(toNumber(row.total)),
      count: Math.trunc(toNumber(row.invoiceCount)),
      overdueTotal: round2(overdue.reduce((sum, item) => sum + toNumber(item.remaining), 0)),
      overdueCount: overdue.length,
    };
  }

  private getLiquidity() {
    const actor = AuthService.requireAuth();
    const cashScope = this.branchAccess.sqlScope('cr.branch_id', undefined, actor);
    const bankScope = this.branchAccess.sqlScope('ba.branch_id', undefined, actor);
    const bankCompany = this.branchAccess.companyScopeViaBranch('ba.branch_id', actor);

    const cashRows = this.db.query<any>(
      `SELECT cr.id, cr.name, COALESCE(cr.current_balance, 0) / 100.0 AS balance, b.name AS branchName
       FROM cash_registers cr
       LEFT JOIN branches b ON b.id = cr.branch_id
       WHERE cr.is_active = 1 AND ${cashScope.clause}
       ORDER BY cr.is_default DESC, cr.name ASC`,
      [...cashScope.params],
    );

    const bankRows = this.db.query<any>(
      `SELECT ba.id, ba.account_name AS name, ba.bank_name AS bankName,
              COALESCE(ba.current_balance, 0) / 100.0 AS balance, b.name AS branchName
       FROM bank_accounts ba
       LEFT JOIN branches b ON b.id = ba.branch_id
       WHERE ba.is_active = 1 AND ${bankScope.clause} AND ${bankCompany.clause}
       ORDER BY ba.bank_name ASC, ba.account_name ASC`,
      [...bankScope.params, ...bankCompany.params],
    );

    const cashAccounts: CashAccountRow[] = cashRows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      type: 'cash',
      balance: round2(toNumber(row.balance)),
      branchName: String(row.branchName ?? '—'),
    }));
    const bankAccounts: CashAccountRow[] = bankRows.map((row) => ({
      id: String(row.id),
      name: `${row.name} — ${row.bankName}`,
      type: 'bank',
      balance: round2(toNumber(row.balance)),
      branchName: String(row.branchName ?? '—'),
    }));

    const cashTotal = round2(cashAccounts.reduce((sum, row) => sum + row.balance, 0));
    const bankTotal = round2(bankAccounts.reduce((sum, row) => sum + row.balance, 0));
    return { cashTotal, bankTotal, total: round2(cashTotal + bankTotal), cashAccounts: [...cashAccounts, ...bankAccounts] };
  }

  private getInventoryRows(): InventoryRow[] {
    const scope = this.warehouseScope();
    const costingMethod = this.db.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'costingMethod'`,
    )[0]?.value ?? 'AVERAGE';

    const rows = this.db.query<any>(
      `SELECT p.id, p.name, p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit,
              COALESCE(SUM(ws.quantity_m2), 0) AS quantity,
              COALESCE(SUM(
                CASE WHEN ? = 'FIFO' THEN
                  COALESCE((SELECT SUM(icl.quantity_remaining * icl.unit_cost)
                    FROM inventory_cost_layers icl
                    WHERE icl.product_id = ws.product_id AND icl.warehouse_id = ws.warehouse_id), 0)
                  + MAX(0, ws.quantity_m2 - COALESCE((SELECT SUM(icl.quantity_remaining)
                    FROM inventory_cost_layers icl
                    WHERE icl.product_id = ws.product_id AND icl.warehouse_id = ws.warehouse_id), 0)) * p.cost_price
                ELSE ws.quantity_m2 * p.cost_price END
              ) / 100.0, 0) AS costValue,
              COALESCE(SUM(ws.quantity_m2 * p.selling_price_m2), 0) / 100.0 AS saleValue
       FROM warehouse_stock ws
       JOIN products p ON p.id = ws.product_id
       JOIN warehouses w ON w.id = ws.warehouse_id
       WHERE p.is_active = 1 AND ${scope.clause}
       GROUP BY p.id
       HAVING COALESCE(SUM(ws.quantity_m2), 0) > 0
       ORDER BY costValue DESC`,
      [costingMethod, ...scope.params],
    );

    return rows.map((row) => ({
      productId: String(row.id),
      name: String(row.name),
      quantity: round2(toNumber(row.quantity)),
      costValue: round2(toNumber(row.costValue)),
      saleValue: round2(toNumber(row.saleValue)),
      productType: String(row.productType) === 'GENERAL' ? 'GENERAL' : 'CERAMIC',
      baseUnit: String(row.baseUnit ?? ''),
      customUnit: row.customUnit ? String(row.customUnit) : undefined,
    }));
  }

  private getLowStockRows(): LowStockRow[] {
    const scope = this.warehouseScope();
    const rows = this.db.query<any>(
      `SELECT p.id, p.name, w.name AS warehouse, COALESCE(ws.quantity_m2, 0) AS quantity,
              COALESCE(p.min_stock_level, 0) AS minLevel, p.product_type AS productType,
              p.base_unit AS baseUnit, p.custom_unit AS customUnit
       FROM warehouse_stock ws
       JOIN products p ON p.id = ws.product_id
       JOIN warehouses w ON w.id = ws.warehouse_id
       WHERE p.is_active = 1
         AND (ws.quantity_m2 <= COALESCE(p.min_stock_level, 0) OR ws.quantity_m2 <= 0)
         AND ${scope.clause}
       ORDER BY (COALESCE(ws.quantity_m2, 0) - COALESCE(p.min_stock_level, 0)) ASC, p.name ASC
       LIMIT 500`,
      [...scope.params],
    );

    return rows.map((row) => ({
      productId: String(row.id),
      name: String(row.name),
      warehouse: String(row.warehouse),
      quantity: round2(toNumber(row.quantity)),
      minLevel: round2(toNumber(row.minLevel)),
      productType: String(row.productType) === 'GENERAL' ? 'GENERAL' : 'CERAMIC',
      baseUnit: String(row.baseUnit ?? ''),
      customUnit: row.customUnit ? String(row.customUnit) : undefined,
    }));
  }

  private getTopProducts(from: string, to: string, limit: number): ProductSaleRow[] {
    const sales = this.salesScopes();
    const rows = this.db.query<any>(
      `SELECT p.id, p.name, p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit,
              COALESCE(SUM(sii.quantity_m2), 0) AS quantity,
              COALESCE(SUM(sii.total_price), 0) / 100.0 AS revenue,
              COALESCE(SUM(sii.profit), 0) / 100.0 AS profit
       FROM sales_invoice_items sii
       JOIN products p ON p.id = sii.product_id
       JOIN sales_invoices si ON si.id = sii.invoice_id
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}
       GROUP BY p.id
       ORDER BY revenue DESC
       LIMIT ?`,
      [from, to, ...sales.branch.params, ...sales.company.params, limit],
    );

    return rows.map((row) => ({
      productId: String(row.id),
      name: String(row.name),
      quantity: round2(toNumber(row.quantity)),
      revenue: round2(toNumber(row.revenue)),
      profit: round2(toNumber(row.profit)),
      productType: String(row.productType) === 'GENERAL' ? 'GENERAL' : 'CERAMIC',
      baseUnit: String(row.baseUnit ?? ''),
      customUnit: row.customUnit ? String(row.customUnit) : undefined,
    }));
  }

  private getSlowMoving(limit: number): SlowMovingRow[] {
    const scope = this.warehouseScope();
    const sales = this.salesScopes();
    const cutoff = format(subDays(new Date(), SLOW_MOVING_DAYS), 'yyyy-MM-dd');

    const rows = this.db.query<any>(
      `SELECT p.id, p.name, COALESCE(SUM(ws.quantity_m2), 0) AS quantity,
              COALESCE(SUM(ws.quantity_m2 * p.cost_price), 0) / 100.0 AS stockValue,
              p.base_unit AS baseUnit, p.custom_unit AS customUnit, last_sale.lastSale AS lastSaleDate
       FROM products p
       JOIN warehouse_stock ws ON ws.product_id = p.id
       JOIN warehouses w ON w.id = ws.warehouse_id
       LEFT JOIN (
         SELECT sii.product_id AS productId, MAX(si.date) AS lastSale
         FROM sales_invoice_items sii
         JOIN sales_invoices si ON si.id = sii.invoice_id
         WHERE si.invoice_status != 'VOID'
           AND ${sales.branch.clause} AND ${sales.company.clause}
         GROUP BY sii.product_id
       ) last_sale ON last_sale.productId = p.id
       WHERE p.is_active = 1 AND ws.quantity_m2 > 0 AND ${scope.clause}
       GROUP BY p.id
       HAVING last_sale.lastSale IS NULL OR last_sale.lastSale < ?
       ORDER BY stockValue DESC
       LIMIT ?`,
      [...sales.branch.params, ...sales.company.params, ...scope.params, cutoff, limit],
    );

    return rows.map((row) => {
      const lastSaleDate = row.lastSaleDate ? String(row.lastSaleDate) : null;
      const daysIdle = lastSaleDate
        ? Math.max(0, differenceInCalendarDays(new Date(), new Date(`${lastSaleDate}T00:00:00`)))
        : null;
      return {
        productId: String(row.id),
        name: String(row.name),
        stockQty: round2(toNumber(row.quantity)),
        stockValue: round2(toNumber(row.stockValue)),
        lastSaleDate,
        daysIdle,
        baseUnit: String(row.baseUnit ?? ''),
        customUnit: row.customUnit ? String(row.customUnit) : undefined,
      };
    });
  }

  private getBranchPerformance(from: string, to: string): BranchPerformanceRow[] {
    const actor = AuthService.requireAuth();
    const branchScope = this.branchAccess.sqlScope('b.id', undefined, actor, true);
    const companyScope = this.branchAccess.companyScopeViaBranch('b.id', actor);

    const rows = this.db.query<any>(
      `SELECT b.id, b.name,
              COALESCE(SUM(CASE WHEN si.invoice_status != 'VOID' THEN si.subtotal - si.discount_amount ELSE 0 END), 0) / 100.0 AS sales,
              COUNT(CASE WHEN si.invoice_status != 'VOID' THEN 1 END) AS invoices,
              COALESCE(SUM(CASE WHEN si.invoice_status != 'VOID' THEN si.gross_profit ELSE 0 END), 0) / 100.0 AS grossProfit
       FROM branches b
       LEFT JOIN sales_invoices si ON si.branch_id = b.id AND si.date BETWEEN ? AND ?
       WHERE b.is_active = 1 AND ${branchScope.clause} AND ${companyScope.clause}
       GROUP BY b.id
       ORDER BY sales DESC, b.name ASC`,
      [from, to, ...branchScope.params, ...companyScope.params],
    );

    return rows.map((row) => ({
      branchId: String(row.id),
      name: String(row.name),
      sales: round2(toNumber(row.sales)),
      invoices: Math.trunc(toNumber(row.invoices)),
      grossProfit: round2(toNumber(row.grossProfit)),
    }));
  }

  private getEmployeeSales(from: string, to: string, limit: number): EmployeeSaleRow[] {
    const sales = this.salesScopes();
    const rows = this.db.query<any>(
      `SELECT COALESCE(si.sales_rep_id, si.created_by, 'unknown') AS employeeKey,
              COALESCE(e.full_name, u.full_name, 'غير محدد') AS name,
              COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS sales,
              COUNT(*) AS invoices,
              COALESCE(SUM(si.gross_profit), 0) / 100.0 AS grossProfit
       FROM sales_invoices si
       LEFT JOIN employees e ON e.id = si.sales_rep_id
       LEFT JOIN users u ON u.id = si.created_by
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}
       GROUP BY COALESCE(si.sales_rep_id, si.created_by, 'unknown')
       ORDER BY sales DESC
       LIMIT ?`,
      [from, to, ...sales.branch.params, ...sales.company.params, limit],
    );

    return rows.map((row) => ({
      key: String(row.employeeKey),
      name: String(row.name),
      sales: round2(toNumber(row.sales)),
      invoices: Math.trunc(toNumber(row.invoices)),
      grossProfit: round2(toNumber(row.grossProfit)),
    }));
  }

  private getProfit(from: string, to: string, fallbackExpenses: number): { net: number; source: 'ledger' | 'estimated' } {
    try {
      const result = this.accountingService.getDashboardProfitData(from, to);
      return { net: round2(result.netProfit), source: 'ledger' };
    } catch {
      const sales = this.getSalesTotals(from, to);
      return { net: round2(sales.grossProfit - fallbackExpenses), source: 'estimated' };
    }
  }

  private getCashFlow(from: string, to: string, expenses: number, collections: number) {
    const purchase = this.purchaseScopes();
    const purchasePaidRow = this.db.query<any>(
      `SELECT COALESCE(SUM(pi.paid_amount), 0) / 100.0 AS amount
       FROM purchase_invoices pi
       WHERE pi.date BETWEEN ? AND ? AND ${purchase.branch.clause} AND ${purchase.company.clause}`,
      [from, to, ...purchase.branch.params, ...purchase.company.params],
    )[0] ?? {};

    const actor = AuthService.requireAuth();
    const paymentBranch = this.branchAccess.sqlScope('sp.branch_id', undefined, actor);
    const paymentCompany = this.branchAccess.companyScopeViaBranch('sp.branch_id', actor);
    const laterSupplierRow = this.db.query<any>(
      `SELECT COALESCE(SUM(spa.amount), 0) / 100.0 AS amount
       FROM supplier_payment_allocations spa
       JOIN supplier_payments sp ON sp.id = spa.payment_id
       JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
       WHERE sp.date BETWEEN ? AND ? AND pi.date < ?
         AND ${paymentBranch.clause} AND ${paymentCompany.clause}`,
      [from, to, from, ...paymentBranch.params, ...paymentCompany.params],
    )[0] ?? {};

    const purchasesPaid = round2(toNumber(purchasePaidRow.amount));
    const supplierPayments = round2(toNumber(laterSupplierRow.amount));
    const outflow = round2(expenses + purchasesPaid + supplierPayments);
    return {
      inflow: round2(collections),
      outflow,
      net: round2(collections - outflow),
      purchasesPaid,
      supplierPayments,
      expenses: round2(expenses),
    };
  }

  private getTrend(period: CommandPeriod): CommandTrendPoint[] {
    const sales = this.salesScopes();
    const currentRows = this.db.query<any>(
      `SELECT si.date AS date, COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS sales
       FROM sales_invoices si
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}
       GROUP BY si.date`,
      [period.from, period.to, ...sales.branch.params, ...sales.company.params],
    );
    const returnRows = this.db.query<any>(
      `SELECT sr.date AS date, COALESCE(SUM(sr.total_amount), 0) / 100.0 AS returns
       FROM sales_returns sr
       JOIN sales_invoices si ON si.id = sr.original_invoice_id
       WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}
       GROUP BY sr.date`,
      [period.from, period.to, ...sales.branch.params, ...sales.company.params],
    );
    const previousRows = this.db.query<any>(
      `SELECT si.date AS date, COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS sales
       FROM sales_invoices si
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}
       GROUP BY si.date`,
      [period.previousFrom, period.previousTo, ...sales.branch.params, ...sales.company.params],
    );
    const previousReturnRows = this.db.query<any>(
      `SELECT sr.date AS date, COALESCE(SUM(sr.total_amount), 0) / 100.0 AS returns
       FROM sales_returns sr
       JOIN sales_invoices si ON si.id = sr.original_invoice_id
       WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}
       GROUP BY sr.date`,
      [period.previousFrom, period.previousTo, ...sales.branch.params, ...sales.company.params],
    );

    const currentMap = new Map<string, number>();
    currentRows.forEach((row) => currentMap.set(String(row.date), toNumber(row.sales)));
    returnRows.forEach((row) => {
      const key = String(row.date);
      currentMap.set(key, (currentMap.get(key) ?? 0) - toNumber(row.returns));
    });
    const previousMap = new Map<string, number>();
    previousRows.forEach((row) => previousMap.set(String(row.date), toNumber(row.sales)));
    previousReturnRows.forEach((row) => {
      const key = String(row.date);
      previousMap.set(key, (previousMap.get(key) ?? 0) - toNumber(row.returns));
    });

    let profitMap = new Map<string, number>();
    try {
      const profitData = this.accountingService.getDashboardProfitData(period.from, period.to);
      profitMap = new Map(profitData.dailyNetProfit.map((row) => [row.date, row.profit]));
    } catch {
      profitMap = new Map();
    }

    const points: CommandTrendPoint[] = [];
    const start = new Date(`${period.from}T00:00:00`);
    const previousStart = new Date(`${period.previousFrom}T00:00:00`);
    for (let index = 0; index < period.days; index += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const previousDate = new Date(previousStart);
      previousDate.setDate(previousStart.getDate() + index);
      const key = format(date, 'yyyy-MM-dd');
      const previousKey = format(previousDate, 'yyyy-MM-dd');
      points.push({
        date: key,
        label: format(date, 'dd/MM'),
        sales: round2(currentMap.get(key) ?? 0),
        profit: round2(profitMap.get(key) ?? 0),
        previousSales: round2(previousMap.get(previousKey) ?? 0),
      });
    }
    return points;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Drill-down queries
  // ───────────────────────────────────────────────────────────────────────────

  private invoiceDrilldown(key: DrilldownKey, title: string, subtitle: string, from: string, to: string): DrilldownResult {
    const sales = this.salesScopes();
    const rows = this.db.query<any>(
      `SELECT si.id, si.invoice_number AS invoiceNumber, si.date, si.due_date AS dueDate,
              c.name AS customer,
              COALESCE(e.full_name, u.full_name, '—') AS employee,
              (si.subtotal - si.discount_amount) / 100.0 AS net,
              si.total_amount / 100.0 AS total, si.paid_amount / 100.0 AS paid, si.remaining_amount / 100.0 AS remaining,
              si.payment_status AS paymentStatus
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       LEFT JOIN employees e ON e.id = si.sales_rep_id
       LEFT JOIN users u ON u.id = si.created_by
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}
       ORDER BY si.date DESC, si.created_at DESC
       LIMIT ?`,
      [from, to, ...sales.branch.params, ...sales.company.params, MAX_DRILLDOWN_ROWS],
    );

    const totalNet = rows.reduce((sum, row) => sum + toNumber(row.net), 0);
    return {
      key,
      title,
      subtitle,
      columns: [
        { key: 'invoiceNumber', label: 'الفاتورة' },
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'customer', label: 'العميل' },
        { key: 'employee', label: 'الموظف' },
        { key: 'net', label: 'صافي المبيعات', type: 'money' },
        { key: 'total', label: 'الإجمالي', type: 'money' },
        { key: 'paid', label: 'المدفوع', type: 'money' },
        { key: 'remaining', label: 'المتبقي', type: 'money' },
        { key: 'paymentStatus', label: 'الحالة' },
      ],
      rows: rows.map((row) => ({
        invoiceNumber: String(row.invoiceNumber),
        date: String(row.date),
        customer: String(row.customer),
        employee: String(row.employee),
        net: round2(toNumber(row.net)),
        total: round2(toNumber(row.total)),
        paid: round2(toNumber(row.paid)),
        remaining: round2(toNumber(row.remaining)),
        paymentStatus: this.paymentStatusLabel(String(row.paymentStatus)),
      })),
      totals: [
        { label: 'صافي المبيعات', value: round2(totalNet), type: 'money' },
        { label: 'عدد الفواتير', value: rows.length, type: 'number' },
      ],
      note: rows.length >= MAX_DRILLDOWN_ROWS ? `يتم عرض أحدث ${MAX_DRILLDOWN_ROWS} فاتورة.` : undefined,
    };
  }

  private expenseDrilldown(key: DrilldownKey, title: string, subtitle: string, from: string, to: string): DrilldownResult {
    const scope = this.expenseScopes();
    const rows = this.db.query<any>(
      `SELECT e.id, e.date, COALESCE(ec.name, e.category) AS category, e.amount / 100.0 AS amount,
              e.recipient, e.description, COALESCE(cr.name, '—') AS registerName,
              COALESCE(u.full_name, '—') AS performedBy
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN cash_registers cr ON cr.id = e.register_id
       LEFT JOIN users u ON u.id = e.performed_by
       WHERE e.date BETWEEN ? AND ? AND ${scope.branch.clause} AND ${scope.company.clause}
       ORDER BY e.date DESC, e.created_at DESC
       LIMIT ?`,
      [from, to, ...scope.branch.params, ...scope.company.params, MAX_DRILLDOWN_ROWS],
    );

    return {
      key,
      title,
      subtitle,
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'category', label: 'البند' },
        { key: 'description', label: 'البيان' },
        { key: 'recipient', label: 'المستفيد' },
        { key: 'registerName', label: 'الخزينة' },
        { key: 'performedBy', label: 'بواسطة' },
        { key: 'amount', label: 'المبلغ', type: 'money' },
      ],
      rows: rows.map((row) => ({
        date: String(row.date),
        category: String(row.category ?? '—'),
        description: String(row.description ?? ''),
        recipient: String(row.recipient ?? '—'),
        registerName: String(row.registerName),
        performedBy: String(row.performedBy),
        amount: round2(toNumber(row.amount)),
      })),
      totals: [
        { label: 'إجمالي المصروفات', value: round2(rows.reduce((sum, row) => sum + toNumber(row.amount), 0)), type: 'money' },
        { label: 'عدد الحركات', value: rows.length, type: 'number' },
      ],
      note: rows.length >= MAX_DRILLDOWN_ROWS ? 'يتم عرض أحدث الحركات فقط.' : undefined,
    };
  }

  private collectionsDrilldown(from: string, to: string): DrilldownResult {
    const actor = AuthService.requireAuth();
    const sales = this.salesScopes();
    const paymentBranch = this.branchAccess.sqlScope('cp.branch_id', undefined, actor);
    const paymentCompany = this.branchAccess.companyScopeViaBranch('cp.branch_id', actor);

    const invoiceRows = this.db.query<any>(
      `SELECT si.id, si.invoice_number AS reference, si.date, c.name AS party,
              si.paid_amount / 100.0 AS amount, si.payment_type AS method, 'تحصيل على فاتورة' AS kind
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND si.paid_amount > 0
         AND ${sales.branch.clause} AND ${sales.company.clause}
       ORDER BY si.date DESC
       LIMIT ?`,
      [from, to, ...sales.branch.params, ...sales.company.params, MAX_DRILLDOWN_ROWS],
    );

    const paymentRows = this.db.query<any>(
      `SELECT cp.id, cp.receipt_number AS reference, cp.date, c.name AS party,
              cp.amount / 100.0 AS amount, cp.payment_type AS method, 'سند قبض' AS kind
       FROM customer_payments cp
       JOIN sales_invoices si ON si.id = cp.invoice_id
       JOIN customers c ON c.id = cp.customer_id
       WHERE cp.date BETWEEN ? AND ? AND si.date < ? AND si.invoice_status != 'VOID'
         AND ${paymentBranch.clause} AND ${paymentCompany.clause}
       ORDER BY cp.date DESC
       LIMIT ?`,
      [from, to, from, ...paymentBranch.params, ...paymentCompany.params, MAX_DRILLDOWN_ROWS],
    );

    const combined = [
      ...invoiceRows.map((row) => ({ ...row, sortDate: String(row.date) })),
      ...paymentRows.map((row) => ({ ...row, sortDate: String(row.date) })),
    ].sort((a, b) => b.sortDate.localeCompare(a.sortDate)).slice(0, MAX_DRILLDOWN_ROWS);

    return {
      key: 'collections',
      title: 'التحصيلات',
      subtitle: 'المبالغ المحصلة من العملاء خلال الفترة',
      columns: [
        { key: 'kind', label: 'نوع الحركة' },
        { key: 'reference', label: 'المرجع' },
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'party', label: 'العميل' },
        { key: 'method', label: 'وسيلة الدفع' },
        { key: 'amount', label: 'المبلغ', type: 'money' },
      ],
      rows: combined.map((row) => ({
        kind: String(row.kind),
        reference: String(row.reference),
        date: String(row.date),
        party: String(row.party),
        method: this.paymentTypeLabel(String(row.method)),
        amount: round2(toNumber(row.amount)),
      })),
      totals: [
        { label: 'إجمالي التحصيلات', value: round2(combined.reduce((sum, row) => sum + toNumber(row.amount), 0)), type: 'money' },
        { label: 'عدد الحركات', value: combined.length, type: 'number' },
      ],
      note: 'يشمل المدفوع على الفواتير داخل الفترة وسندات القبض المسددة على فواتير سابقة.',
    };
  }

  private receivablesDrilldown(onlyOverdue: boolean): DrilldownResult {
    const today = localDateString();
    const rows = onlyOverdue ? this.getOverdueInvoiceRows(today) : this.getReceivableInvoiceRows();
    return {
      key: onlyOverdue ? 'overdueInvoices' : 'receivables',
      title: onlyOverdue ? 'الفواتير المتأخرة' : 'المديونيات المستحقة',
      subtitle: onlyOverdue ? 'فواتير تجاوزت تاريخ الاستحقاق ولم تُسدد' : 'أرصدة العملاء المستحقة على الفواتير',
      columns: [
        { key: 'invoiceNumber', label: 'الفاتورة' },
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'dueDate', label: 'الاستحقاق', type: 'date' },
        { key: 'customer', label: 'العميل' },
        { key: 'total', label: 'إجمالي الفاتورة', type: 'money' },
        { key: 'paid', label: 'المدفوع', type: 'money' },
        { key: 'remaining', label: 'المتبقي', type: 'money' },
        { key: 'daysOverdue', label: 'أيام التأخير', type: 'number' },
      ],
      rows: rows.map((row) => ({
        invoiceNumber: String(row.invoiceNumber),
        date: String(row.date),
        dueDate: String(row.dueDate ?? '—'),
        customer: String(row.customer),
        total: round2(toNumber(row.total)),
        paid: round2(toNumber(row.paid)),
        remaining: round2(toNumber(row.remaining)),
        daysOverdue: Math.max(0, Math.trunc(toNumber(row.daysOverdue))),
      })),
      totals: [
        { label: 'إجمالي المتبقي', value: round2(rows.reduce((sum, row) => sum + toNumber(row.remaining), 0)), type: 'money' },
        { label: 'عدد الفواتير', value: rows.length, type: 'number' },
      ],
      note: rows.length >= MAX_DRILLDOWN_ROWS ? 'يتم عرض أكبر الأرصدة فقط.' : undefined,
    };
  }

  private getReceivableInvoiceRows(): any[] {
    const sales = this.salesScopes();
    return this.db.query<any>(
      `SELECT si.id, si.invoice_number AS invoiceNumber, si.date, si.due_date AS dueDate,
              c.name AS customer, si.total_amount / 100.0 AS total, si.paid_amount / 100.0 AS paid,
              si.remaining_amount / 100.0 AS remaining,
              CAST(julianday('now') - julianday(COALESCE(si.due_date, si.date)) AS INTEGER) AS daysOverdue
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       WHERE si.remaining_amount > 1 AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}
       ORDER BY si.remaining_amount DESC, si.date DESC
       LIMIT ?`,
      [...sales.branch.params, ...sales.company.params, MAX_DRILLDOWN_ROWS],
    );
  }

  private getOverdueInvoiceRows(today: string): any[] {
    const sales = this.salesScopes();
    return this.db.query<any>(
      `SELECT si.id, si.invoice_number AS invoiceNumber, si.date, si.due_date AS dueDate,
              c.name AS customer, si.total_amount / 100.0 AS total, si.paid_amount / 100.0 AS paid,
              si.remaining_amount / 100.0 AS remaining,
              CAST(julianday(?) - julianday(COALESCE(si.due_date, si.date)) AS INTEGER) AS daysOverdue
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       WHERE si.remaining_amount > 1 AND si.invoice_status != 'VOID'
         AND COALESCE(si.due_date, si.date) < ?
         AND ${sales.branch.clause} AND ${sales.company.clause}
       ORDER BY daysOverdue DESC, si.remaining_amount DESC
       LIMIT ?`,
      [today, today, ...sales.branch.params, ...sales.company.params, MAX_DRILLDOWN_ROWS],
    );
  }

  private cashDrilldown(): DrilldownResult {
    const liquidity = this.getLiquidity();
    return {
      key: 'cashBalance',
      title: 'أرصدة الخزائن والبنوك',
      subtitle: 'الرصيد الحالي لكل خزينة وحساب بنكي',
      columns: [
        { key: 'name', label: 'الخزينة / الحساب' },
        { key: 'type', label: 'النوع' },
        { key: 'branchName', label: 'الفرع' },
        { key: 'balance', label: 'الرصيد', type: 'money' },
      ],
      rows: liquidity.cashAccounts.map((account) => ({
        name: account.name,
        type: account.type === 'cash' ? 'خزينة' : 'بنك',
        branchName: account.branchName,
        balance: account.balance,
      })),
      totals: [
        { label: 'إجمالي النقدية', value: liquidity.cashTotal, type: 'money' },
        { label: 'إجمالي البنوك', value: liquidity.bankTotal, type: 'money' },
        { label: 'الإجمالي', value: liquidity.total, type: 'money' },
      ],
    };
  }

  private inventoryDrilldown(): DrilldownResult {
    const rows = this.getInventoryRows();
    return {
      key: 'inventoryValue',
      title: 'قيمة المخزون الحالية',
      subtitle: 'رصيد وتقييم كل صنف في المخازن',
      columns: [
        { key: 'name', label: 'الصنف' },
        { key: 'quantity', label: 'الكمية', type: 'number' },
        { key: 'costValue', label: 'التكلفة', type: 'money' },
        { key: 'saleValue', label: 'قيمة البيع', type: 'money' },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        quantity: row.quantity,
        costValue: row.costValue,
        saleValue: row.saleValue,
      })),
      totals: [
        { label: 'قيمة المخزون بالتكلفة', value: round2(rows.reduce((sum, row) => sum + row.costValue, 0)), type: 'money' },
        { label: 'قيمة المخزون بالبيع', value: round2(rows.reduce((sum, row) => sum + row.saleValue, 0)), type: 'money' },
        { label: 'عدد الأصناف', value: rows.length, type: 'number' },
      ],
    };
  }

  private topProductsDrilldown(from: string, to: string): DrilldownResult {
    const rows = this.getTopProducts(from, to, MAX_DRILLDOWN_ROWS);
    return {
      key: 'topProducts',
      title: 'الأصناف الأكثر مبيعًا',
      subtitle: 'ترتيب الأصناف حسب الإيراد خلال الفترة',
      columns: [
        { key: 'name', label: 'الصنف' },
        { key: 'quantity', label: 'الكمية', type: 'number' },
        { key: 'revenue', label: 'الإيراد', type: 'money' },
        { key: 'profit', label: 'الربح', type: 'money' },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        quantity: row.quantity,
        revenue: row.revenue,
        profit: row.profit,
      })),
      totals: [
        { label: 'إيراد الأصناف', value: round2(rows.reduce((sum, row) => sum + row.revenue, 0)), type: 'money' },
        { label: 'ربح الأصناف', value: round2(rows.reduce((sum, row) => sum + row.profit, 0)), type: 'money' },
      ],
    };
  }

  private slowMovingDrilldown(): DrilldownResult {
    const rows = this.getSlowMoving(MAX_DRILLDOWN_ROWS);
    return {
      key: 'slowMoving',
      title: 'الأصناف الراكدة',
      subtitle: `أصناف لديها رصيد ولم تُبع خلال ${SLOW_MOVING_DAYS} يومًا`,
      columns: [
        { key: 'name', label: 'الصنف' },
        { key: 'stockQty', label: 'الرصيد', type: 'number' },
        { key: 'stockValue', label: 'قيمة الرصيد', type: 'money' },
        { key: 'lastSaleDate', label: 'آخر بيع', type: 'date' },
        { key: 'daysIdle', label: 'أيام بدون بيع', type: 'number' },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        stockQty: row.stockQty,
        stockValue: row.stockValue,
        lastSaleDate: row.lastSaleDate ?? 'لم يُبع',
        daysIdle: row.daysIdle ?? '—',
      })),
      totals: [
        { label: 'قيمة المخزون الراكد', value: round2(rows.reduce((sum, row) => sum + row.stockValue, 0)), type: 'money' },
        { label: 'عدد الأصناف', value: rows.length, type: 'number' },
      ],
    };
  }

  private branchesDrilldown(from: string, to: string): DrilldownResult {
    const rows = this.getBranchPerformance(from, to);
    return {
      key: 'branches',
      title: 'أداء الفروع',
      subtitle: 'مبيعات وربحية كل فرع خلال الفترة',
      columns: [
        { key: 'name', label: 'الفرع' },
        { key: 'sales', label: 'المبيعات', type: 'money' },
        { key: 'invoices', label: 'الفواتير', type: 'number' },
        { key: 'grossProfit', label: 'الربح الإجمالي', type: 'money' },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        sales: row.sales,
        invoices: row.invoices,
        grossProfit: row.grossProfit,
      })),
      totals: [
        { label: 'إجمالي المبيعات', value: round2(rows.reduce((sum, row) => sum + row.sales, 0)), type: 'money' },
        { label: 'إجمالي الفواتير', value: rows.reduce((sum, row) => sum + row.invoices, 0), type: 'number' },
      ],
    };
  }

  private employeesDrilldown(from: string, to: string): DrilldownResult {
    const rows = this.getEmployeeSales(from, to, MAX_DRILLDOWN_ROWS);
    return {
      key: 'employees',
      title: 'المبيعات حسب الموظف',
      subtitle: 'أداء مندوبي وموظفي البيع خلال الفترة',
      columns: [
        { key: 'name', label: 'الموظف' },
        { key: 'sales', label: 'المبيعات', type: 'money' },
        { key: 'invoices', label: 'الفواتير', type: 'number' },
        { key: 'grossProfit', label: 'الربح الإجمالي', type: 'money' },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        sales: row.sales,
        invoices: row.invoices,
        grossProfit: row.grossProfit,
      })),
      totals: [
        { label: 'إجمالي المبيعات', value: round2(rows.reduce((sum, row) => sum + row.sales, 0)), type: 'money' },
        { label: 'عدد الموظفين', value: rows.length, type: 'number' },
      ],
    };
  }

  private purchasesDrilldown(from: string, to: string): DrilldownResult {
    const purchase = this.purchaseScopes();
    const rows = this.db.query<any>(
      `SELECT pi.id, pi.invoice_number AS invoiceNumber, pi.date, s.name AS supplier,
              pi.total_amount / 100.0 AS total, pi.paid_amount / 100.0 AS paid, pi.remaining_amount / 100.0 AS remaining,
              pi.payment_status AS paymentStatus
       FROM purchase_invoices pi
       JOIN suppliers s ON s.id = pi.supplier_id
       WHERE pi.date BETWEEN ? AND ? AND ${purchase.branch.clause} AND ${purchase.company.clause}
       ORDER BY pi.date DESC, pi.created_at DESC
       LIMIT ?`,
      [from, to, ...purchase.branch.params, ...purchase.company.params, MAX_DRILLDOWN_ROWS],
    );
    return {
      key: 'purchases',
      title: 'المشتريات',
      subtitle: 'فواتير التوريد خلال الفترة',
      columns: [
        { key: 'invoiceNumber', label: 'الفاتورة' },
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'supplier', label: 'المورد' },
        { key: 'total', label: 'الإجمالي', type: 'money' },
        { key: 'paid', label: 'المدفوع', type: 'money' },
        { key: 'remaining', label: 'المتبقي', type: 'money' },
        { key: 'paymentStatus', label: 'الحالة' },
      ],
      rows: rows.map((row) => ({
        invoiceNumber: String(row.invoiceNumber),
        date: String(row.date),
        supplier: String(row.supplier),
        total: round2(toNumber(row.total)),
        paid: round2(toNumber(row.paid)),
        remaining: round2(toNumber(row.remaining)),
        paymentStatus: this.paymentStatusLabel(String(row.paymentStatus)),
      })),
      totals: [
        { label: 'إجمالي المشتريات', value: round2(rows.reduce((sum, row) => sum + toNumber(row.total), 0)), type: 'money' },
        { label: 'عدد الفواتير', value: rows.length, type: 'number' },
      ],
    };
  }

  private lowStockDrilldown(): DrilldownResult {
    const rows = this.getLowStockRows();
    return {
      key: 'lowStock',
      title: 'نواقص المخزون',
      subtitle: 'أصناف وصلت إلى الحد الأدنى أو نفدت من المخزن',
      columns: [
        { key: 'name', label: 'الصنف' },
        { key: 'warehouse', label: 'المخزن' },
        { key: 'quantity', label: 'الرصيد', type: 'number' },
        { key: 'minLevel', label: 'حد الطلب', type: 'number' },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        warehouse: row.warehouse,
        quantity: row.quantity,
        minLevel: row.minLevel,
      })),
      totals: [
        { label: 'عدد الحالات', value: rows.length, type: 'number' },
        { label: 'أصناف نفدت', value: rows.filter((row) => row.quantity <= 0).length, type: 'number' },
      ],
    };
  }

  private profitDrilldown(from: string, to: string): DrilldownResult {
    const actor = AuthService.requireAuth();
    const branch = this.branchAccess.sqlScope('je.branch_id', undefined, actor);
    const company = this.branchAccess.companyScope('je.company_id', actor);
    const rows = this.db.query<any>(
      `SELECT a.code, a.name, a.type,
              ROUND(SUM(CASE WHEN a.type = 'REVENUE' THEN l.credit - l.debit ELSE l.debit - l.credit END), 2) AS amount
       FROM journal_entries je
       JOIN journal_entry_lines l ON l.entry_id = je.id
       JOIN chart_of_accounts a ON a.id = l.account_id
       WHERE je.is_posted = 1 AND a.type IN ('REVENUE', 'EXPENSE')
         AND je.date BETWEEN ? AND ? AND ${branch.clause} AND ${company.clause}
       GROUP BY a.id
       HAVING ABS(amount) > 0.009
       ORDER BY a.type DESC, amount DESC`,
      [from, to, ...branch.params, ...company.params],
    );

    const revenue = rows.filter((row) => row.type === 'REVENUE').reduce((sum, row) => sum + toNumber(row.amount), 0);
    const expenses = rows.filter((row) => row.type === 'EXPENSE').reduce((sum, row) => sum + toNumber(row.amount), 0);

    return {
      key: 'profit',
      title: 'تفاصيل صافي الربح',
      subtitle: 'الإيرادات والمصروفات المرحلة في دفتر اليومية',
      columns: [
        { key: 'code', label: 'الحساب' },
        { key: 'name', label: 'اسم الحساب' },
        { key: 'type', label: 'النوع' },
        { key: 'amount', label: 'الصافي', type: 'money' },
      ],
      rows: rows.map((row) => ({
        code: String(row.code),
        name: String(row.name),
        type: row.type === 'REVENUE' ? 'إيراد' : 'مصروف',
        amount: round2(toNumber(row.amount)),
      })),
      totals: [
        { label: 'الإيرادات', value: round2(revenue), type: 'money' },
        { label: 'المصروفات', value: round2(expenses), type: 'money' },
        { label: 'صافي الربح', value: round2(revenue - expenses), type: 'money' },
      ],
      note: 'يُحسب صافي الربح من القيود المرحلة، لذلك لا تدخل الفواتير غير المرحلة في النتيجة.',
    };
  }

  private cashFlowDrilldown(from: string, to: string, key: DrilldownKey): DrilldownResult {
    const collections = this.getCollections(from, to);
    const expenses = this.getExpenseTotals(from, to);
    const cashFlow = this.getCashFlow(from, to, expenses.total, collections.total);
    const rows: DrilldownRow[] = [];

    if (key !== 'cashOutflow') {
      rows.push({ label: 'تحصيلات العملاء', direction: 'داخل', amount: cashFlow.inflow });
    }
    if (key !== 'cashInflow') {
      rows.push({ label: 'المصروفات', direction: 'خارج', amount: -cashFlow.expenses });
      rows.push({ label: 'مدفوعات فواتير التوريد', direction: 'خارج', amount: -cashFlow.purchasesPaid });
      rows.push({ label: 'سداد موردين على فواتير سابقة', direction: 'خارج', amount: -cashFlow.supplierPayments });
    }
    rows.push({ label: 'صافي التدفق النقدي', direction: cashFlow.net >= 0 ? 'صافي داخل' : 'صافي خارج', amount: cashFlow.net });

    return {
      key,
      title: key === 'cashInflow' ? 'التدفقات النقدية الداخلة' : key === 'cashOutflow' ? 'التدفقات النقدية الخارجة' : 'مؤشرات التدفق النقدي',
      subtitle: 'حركة النقد المتوقعة من التحصيلات والمدفوعات',
      columns: [
        { key: 'label', label: 'البند' },
        { key: 'direction', label: 'الاتجاه' },
        { key: 'amount', label: 'المبلغ', type: 'money' },
      ],
      rows: rows.map((row) => ({
        label: String(row.label),
        direction: String(row.direction),
        amount: round2(toNumber(row.amount)),
      })),
      totals: [
        { label: 'التدفق الداخل', value: cashFlow.inflow, type: 'money' },
        { label: 'التدفق الخارج', value: cashFlow.outflow, type: 'money' },
        { label: 'الصافي', value: cashFlow.net, type: 'money' },
      ],
    };
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

  // ───────────────────────────────────────────────────────────────────────────
  // Formatting helpers (shared with the generic drill-down table)
  // ───────────────────────────────────────────────────────────────────────────

  private paymentStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      PAID: 'مدفوع',
      PARTIAL: 'جزئي',
      UNPAID: 'آجل',
      PENDING: 'معلق',
    };
    return labels[status] ?? status ?? '—';
  }

  private paymentTypeLabel(method: string): string {
    const labels: Record<string, string> = {
      CASH: 'نقدي',
      CARD: 'بطاقة',
      BANK_TRANSFER: 'تحويل بنكي',
      CHEQUE: 'شيك',
      CREDIT: 'آجل',
      MIXED: 'مختلط',
    };
    return labels[method] ?? method ?? '—';
  }
}

export const executiveCommandService = new ExecutiveCommandService();

/** Shared formatters used by the command-centre components. */
export const commandFormatters = { money, count, numberAr };
