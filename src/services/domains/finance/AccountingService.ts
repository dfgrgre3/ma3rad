import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { financialFieldVisibility } from '../auth/sensitiveFields';
import { BranchAccessService } from '../auth/BranchAccessService';
import { localDateString } from '../../../utils/shared/date';

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export interface DashboardMetrics {
  todaySales: number;
  monthSales: number;
  todayPurchases: number;
  todayExpenses: number;
  grossProfit: number;
  netProfit: number;
  totalReceivables: number; // ديون العملاء
  totalPayables: number; // مستحقات الموردين
  inventoryValuationCost: number | null; // قيمة المخزون بسعر الشراء (null = غير متاح)
  inventoryValuationSale: number | null; // قيمة المخزون بسعر البيع (null = غير متاح)
  inventoryValuationUnavailable: boolean; // true إذا كانت التكلفة غير متاحة بسبب خطأ FIFO
  lowStockCount: number;
  outOfStockCount: number;
  salesCount: number;
  // New fields for enhanced analytics
  previousMonthSales: number;
  salesGrowthRate: number;
  profitMargin: number;
  averageOrderValue: number;
  topCustomer: { name: string; totalPurchases: number } | null;
  urgentDebtsCount: number;
}

export interface MonthlyComparison {
  currentMonth: { sales: number; profit: number; invoices: number };
  previousMonth: { sales: number; profit: number; invoices: number };
  salesGrowth: number | null;
  invoiceGrowth: number | null;
  currentMonthInvoices: number;
}

export interface RecentDashboardActivity {
  type: 'sale' | 'purchase' | 'inventory';
  description: string;
  amount?: number;
  timestamp: string;
}

export interface DashboardProfitData {
  netProfit: number;
  dailyNetProfit: { date: string; profit: number }[];
}

interface DashboardActivityRow {
  type: 'SALE' | 'PURCHASE' | 'STOCK';
  description: string;
  amount: number | null;
  date: string;
}

export class AccountingService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private requireView(permission: string): void {
    PermissionService.require(AuthService.requireAuth(), permission);
  }

  private branchScope(expression: string, fallbackExpression?: string) {
    return this.branchAccess.sqlScope(expression, fallbackExpression);
  }

  /** Journal entries are scoped by branch *and* the legal entity that owns it. */
  private ledgerScope(alias = 'e') {
    const branch = this.branchAccess.sqlScope(`${alias}.branch_id`);
    const company = this.branchAccess.companyScope(`${alias}.company_id`);
    return {
      clause: `(${branch.clause}) AND (${company.clause})`,
      params: [...branch.params, ...company.params],
    };
  }

  public getBranchScopeWarning(): string | null {
    return 'تعرض هذه المؤشرات بيانات الفرع النشط فقط؛ القيود غير المرتبطة بفرع لا تدخل في الإجماليات.';
  }

  private requireDashboardView(): void {
    this.requireView('dashboard.view');
    const actor = AuthService.requireAuth();
    // Use domain permissions (matching DashboardPage PULSE_ACCESS) instead of ui.* permissions
    // This allows users with domain-level access to view the dashboard summary
    PermissionService.require(actor, 'sales.view', '/sales');
    PermissionService.require(actor, 'purchases.view', '/purchases');
    PermissionService.require(actor, 'finance.view', '/finance');
    PermissionService.require(actor, 'customers.view', '/customers');
    PermissionService.require(actor, 'inventory.view', '/inventory');
  }

  private buildDashboardContext() {
    const today = localDateString();
    const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    const salesScope = this.branchScope('si.branch_id');
    const purchaseScope = this.branchScope('pi.branch_id');
    const expenseScope = this.branchScope('e.branch_id');
    const warehouseScope = this.branchScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id ORDER BY bw.is_primary DESC, bw.branch_id LIMIT 1)'
    );

    // Compare the elapsed days in this month with the same dates last month.
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const prevMonthLastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
    const prevMonthEnd = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${String(Math.min(now.getDate(), prevMonthLastDay)).padStart(2, '0')}`;

    const cutoff30DaysAgo = new Date();
    cutoff30DaysAgo.setDate(cutoff30DaysAgo.getDate() - 30);

    return {
      today, monthStart, prevMonthStart, prevMonthEnd,
      cutoff30Str: localDateString(cutoff30DaysAgo),
      salesScope, purchaseScope, expenseScope, warehouseScope,
    };
  }

  private dashboardQuerySpecs(ctx: ReturnType<AccountingService['buildDashboardContext']>): Record<string, { sql: string; params: any[] }> {
    const { today, monthStart, prevMonthStart, prevMonthEnd, cutoff30Str, salesScope, purchaseScope, expenseScope, warehouseScope } = ctx;
    return {
      costingMethod: {
        sql: `SELECT value FROM system_settings WHERE key = 'costingMethod'`,
        params: [],
      },
      inconsistentStock: {
        sql: `
        SELECT ws.product_id AS productId, ws.warehouse_id AS warehouseId
        FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
        WHERE COALESCE((SELECT SUM(icl.quantity_remaining)
          FROM inventory_cost_layers icl
          WHERE icl.product_id = ws.product_id AND icl.warehouse_id = ws.warehouse_id), 0)
          > ws.quantity_m2 + 0.009
          AND ${warehouseScope.clause}
        LIMIT 1`,
        params: [...warehouseScope.params],
      },
      // 1. Sales metrics (bounded up to today to exclude future-dated entries from MTD)
      salesStats: {
        sql: `
      SELECT
        SUM(CASE WHEN si.date = ? THEN si.subtotal - si.discount_amount ELSE 0 END) / 100.0 as todaySales,
        SUM(CASE WHEN si.date >= ? AND si.date <= ? THEN si.subtotal - si.discount_amount ELSE 0 END) / 100.0 as monthSales,
        SUM(CASE WHEN si.date >= ? AND si.date <= ? THEN si.gross_profit ELSE 0 END) / 100.0 as monthGrossProfit,
        COUNT(CASE WHEN si.date = ? THEN 1 END) as todaySalesCount
      FROM sales_invoices si
      WHERE si.invoice_status != 'VOID'
        AND si.date BETWEEN ? AND ?
        AND ${salesScope.clause}
    `,
        params: [today, monthStart, today, monthStart, today, today, monthStart, today, ...salesScope.params],
      },
      returnStats: {
        sql: `
      SELECT
        SUM(CASE WHEN sr.date = ? THEN sr.total_amount ELSE 0 END) / 100.0 AS todayReturns,
        SUM(CASE WHEN sr.date >= ? AND sr.date <= ? THEN sr.total_amount ELSE 0 END) / 100.0 AS monthReturns,
        SUM(CASE WHEN sr.date >= ? AND sr.date <= ?
          THEN (SELECT COALESCE(SUM(sri.quantity_m2 * sri.unit_cost), 0)
                FROM sales_return_items sri WHERE sri.return_id = sr.id)
          ELSE 0 END) / 100.0 AS monthReturnedCost
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      WHERE si.invoice_status != 'VOID'
        AND sr.date BETWEEN ? AND ?
        AND ${salesScope.clause}
    `,
        params: [today, monthStart, today, monthStart, today, monthStart, today, ...salesScope.params],
      },
      prevMonthSales: {
        sql: `
      SELECT
        (COALESCE((SELECT SUM(si.subtotal - si.discount_amount) FROM sales_invoices si
          WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${salesScope.clause}), 0)
        - COALESCE((SELECT SUM(sr.total_amount) FROM sales_returns sr
          JOIN sales_invoices si ON si.id = sr.original_invoice_id
          WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${salesScope.clause}), 0)) / 100.0 AS sales
    `,
        params: [prevMonthStart, prevMonthEnd, ...salesScope.params, prevMonthStart, prevMonthEnd, ...salesScope.params],
      },
      // 2. Purchases metrics
      purchaseStats: {
        sql: `
      SELECT SUM(CASE WHEN pi.date = ? THEN pi.total_amount ELSE 0 END) / 100.0 as todayPurchases
      FROM purchase_invoices pi
      WHERE pi.date = ? AND ${purchaseScope.clause}
    `,
        params: [today, today, ...purchaseScope.params],
      },
      // 3. Expenses metrics (bounded up to today)
      expenseStats: {
        sql: `
      SELECT
        SUM(CASE WHEN e.date = ? THEN e.amount ELSE 0 END) / 100.0 as todayExpenses,
        SUM(CASE WHEN e.date >= ? AND e.date <= ? THEN e.amount ELSE 0 END) / 100.0 as monthExpenses
      FROM expenses e
      WHERE e.date BETWEEN ? AND ? AND ${expenseScope.clause}
    `,
        params: [today, monthStart, today, monthStart, today, ...expenseScope.params],
      },
      // 4. Receivables (Customer debts)
      customerDebts: {
        sql: `
      SELECT SUM(si.remaining_amount) / 100.0 as totalReceivables FROM sales_invoices si
      WHERE si.remaining_amount > 0 AND si.invoice_status != 'VOID' AND ${salesScope.clause}
    `,
        params: [...salesScope.params],
      },
      // Urgent debts: customers with debts overdue by > 30 days based on invoice due dates
      urgentDebts: {
        sql: `
      SELECT COUNT(DISTINCT si.customer_id) as count
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      WHERE si.remaining_amount > 0
        AND si.invoice_status != 'VOID'
        AND COALESCE(si.due_date, si.date) < ?
        AND ${salesScope.clause}
    `,
        params: [cutoff30Str, ...salesScope.params],
      },
      // 5. Payables (Supplier dues)
      supplierPayables: {
        sql: `
      SELECT SUM(pi.remaining_amount) / 100.0 as totalPayables FROM purchase_invoices pi
      WHERE pi.remaining_amount > 1 AND ${purchaseScope.clause}
    `,
        params: [...purchaseScope.params],
      },
      // 7. Top customer
      topCustomer: {
        sql: `
      SELECT c.name, SUM(si.total_amount) / 100.0 AS total_purchases
      FROM customers c JOIN sales_invoices si ON si.customer_id = c.id
      WHERE si.invoice_status != 'VOID' AND ${salesScope.clause}
      GROUP BY c.id
      HAVING total_purchases > 0
      ORDER BY total_purchases DESC
      LIMIT 1
    `,
        params: [...salesScope.params],
      },
    };
  }

  private buildInvStatsSpec(ctx: ReturnType<AccountingService['buildDashboardContext']>, costingMethod: string | undefined): { sql: string; params: any[] } {
    const { warehouseScope } = ctx;
    return {
      sql: `
        SELECT
          SUM(CASE WHEN ? = 'FIFO' THEN
            COALESCE((SELECT SUM(icl.quantity_remaining * icl.unit_cost)
              FROM inventory_cost_layers icl
              WHERE icl.product_id = ws.product_id AND icl.warehouse_id = ws.warehouse_id), 0)
            + MAX(0, ws.quantity_m2 - COALESCE((SELECT SUM(icl.quantity_remaining)
              FROM inventory_cost_layers icl
              WHERE icl.product_id = ws.product_id AND icl.warehouse_id = ws.warehouse_id), 0)) * p.cost_price
            ELSE ws.quantity_m2 * p.cost_price END) / 100.0 as valuationCost,
          SUM(ws.quantity_m2 * p.selling_price_m2) / 100.0 as valuationSale,
          COUNT(DISTINCT CASE WHEN ws.quantity_m2 <= p.min_stock_level AND ws.quantity_m2 > 0 THEN p.id END) as lowStock,
          COUNT(DISTINCT CASE WHEN ws.quantity_m2 <= 0 THEN p.id END) as outOfStock
        FROM warehouse_stock ws
        JOIN warehouses w ON w.id = ws.warehouse_id
        JOIN products p ON ws.product_id = p.id
        WHERE p.is_active = 1 AND ${warehouseScope.clause}
      `,
      params: [costingMethod, ...warehouseScope.params],
    };
  }

  private assembleDashboardMetrics(
    rows: Record<string, any[]>,
    ctx: ReturnType<AccountingService['buildDashboardContext']>,
    fifoError: boolean,
    monthNetOverride?: number,
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
        monthNet = this.getDashboardProfitData(monthStart, today).netProfit;
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

    return {
      todaySales: Number(todaySales.toFixed(2)),
      monthSales: Number(monthSales.toFixed(2)),
      todayPurchases: Number((purchaseStats.todayPurchases || 0).toFixed(2)),
      todayExpenses: Number((expenseStats.todayExpenses || 0).toFixed(2)),
      grossProfit: canSeeProfit ? Number(monthGross.toFixed(2)) : 0,
      netProfit: canSeeProfit ? Number(monthNet.toFixed(2)) : 0,
      totalReceivables: Number(customerDebts.toFixed(2)),
      totalPayables: Number(supplierPayables.toFixed(2)),
      inventoryValuationCost: canSeeCost && !invStats.valuationUnavailable ? Number((invStats.valuationCost || 0).toFixed(2)) : (invStats.valuationUnavailable ? null : 0),
      inventoryValuationSale: Number((invStats.valuationSale || 0).toFixed(2)),
      inventoryValuationUnavailable: invStats.valuationUnavailable || false,
      lowStockCount: invStats.lowStock || 0,
      outOfStockCount: invStats.outOfStock || 0,
      salesCount: salesStats.todaySalesCount || 0,
      previousMonthSales: Number(prevMonthSales.toFixed(2)),
      salesGrowthRate,
      profitMargin: canSeeProfit ? profitMargin : 0,
      averageOrderValue,
      topCustomer: topCustomer ? { name: topCustomer.name, totalPurchases: Number((topCustomer.total_purchases || 0).toFixed(2)) } : null,
      urgentDebtsCount: urgentDebts
    };
  }

  public getDashboardMetrics(): DashboardMetrics {
    this.requireDashboardView();
    const ctx = this.buildDashboardContext();
    const specs = this.dashboardQuerySpecs(ctx);

    const costingMethod = this.db.query<{ value: string }>(
      specs.costingMethod.sql, specs.costingMethod.params
    )[0]?.value;
    // Handle FIFO errors gracefully
    let fifoError = false;
    if (costingMethod === 'FIFO') {
      const inconsistentStock = this.db.query<{ productId: string; warehouseId: string }>(
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
      rows[key] = this.db.query<any>(specs[key].sql, specs[key].params);
    }
    if (!fifoError) {
      const invSpec = this.buildInvStatsSpec(ctx, costingMethod);
      rows.invStats = this.db.query<any>(invSpec.sql, invSpec.params);
    }
    return this.assembleDashboardMetrics(rows, ctx, fifoError);
  }

  public async getDashboardMetricsAsync(): Promise<DashboardMetrics> {
    this.requireDashboardView();
    const ctx = this.buildDashboardContext();
    const specs = this.dashboardQuerySpecs(ctx);

    const profitSpec = this.buildProfitBalancesSpec(ctx.monthStart, ctx.today);
    const keys = ['costingMethod', 'inconsistentStock', 'salesStats', 'returnStats', 'prevMonthSales', 'purchaseStats', 'expenseStats', 'customerDebts', 'urgentDebts', 'supplierPayables', 'topCustomer'] as const;
    const results = await Promise.all([
      ...keys.map((key) => this.db.queryAsync<any>(specs[key].sql, specs[key].params)),
      // Ledger profit query failure must not fail the whole dashboard - fall back to the operational estimate.
      this.db.queryAsync<any>(profitSpec.sql, profitSpec.params).catch(() => null),
    ]);
    const rows: Record<string, any[]> = {};
    keys.forEach((key, i) => { rows[key] = results[i] as any[]; });
    const profitBalances = results[keys.length] as { date: string; code: string; type: 'REVENUE' | 'EXPENSE'; amount: number }[] | null;
    const monthNetOverride = profitBalances !== null
      ? this.computeDashboardProfitData(profitBalances).netProfit
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
      const invSpec = this.buildInvStatsSpec(ctx, costingMethod);
      rows.invStats = await this.db.queryAsync<any>(invSpec.sql, invSpec.params);
    }
    return this.assembleDashboardMetrics(rows, ctx, fifoError, monthNetOverride);
  }

  private requireDashboardSalesView(): void {
    this.requireView('dashboard.view');
    PermissionService.require(AuthService.requireAuth(), 'sales.view', '/sales');
  }

  private buildSalesTrendSpec(): { sql: string; params: any[]; dates: string[] } {
    const scope = this.branchScope('si.branch_id');
    const now = new Date();
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (6 - index));
      return localDateString(date);
    });
    return {
      dates,
      sql: `
      SELECT date, SUM(sales) / 100.0 AS sales, SUM(profit) / 100.0 AS profit
      FROM (
        SELECT si.date,
          SUM(si.subtotal - si.discount_amount) AS sales,
          SUM(si.gross_profit) AS profit
        FROM sales_invoices si
        WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
        GROUP BY si.date

        UNION ALL

        SELECT sr.date,
          -SUM(sr.total_amount) AS sales,
          -SUM(sr.total_amount) + SUM(COALESCE(return_cost.total_cost, 0)) AS profit
        FROM sales_returns sr
        JOIN sales_invoices si ON si.id = sr.original_invoice_id
        LEFT JOIN (
          SELECT return_id, SUM(quantity_m2 * unit_cost) AS total_cost
          FROM sales_return_items
          GROUP BY return_id
        ) return_cost ON return_cost.return_id = sr.id
        WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
        GROUP BY sr.date
      )
      GROUP BY date
    `,
      params: [dates[0], dates[6], ...scope.params, dates[0], dates[6], ...scope.params],
    };
  }

  private mapSalesTrendRows(rows: any[], dates: string[]): { date: string; sales: number; profit: number }[] {
    const byDate = new Map(rows.map((row) => [row.date, row]));
    const canSeeProfit = financialFieldVisibility().profit;
    return dates.map((date) => {
      const row = byDate.get(date);
      return {
        date,
        sales: Number((row?.sales || 0).toFixed(2)),
        profit: canSeeProfit ? Number((row?.profit || 0).toFixed(2)) : 0,
      };
    });
  }

  public getSalesTrendLast7Days(): { date: string; sales: number; profit: number }[] {
    this.requireDashboardSalesView();
    const { sql, params, dates } = this.buildSalesTrendSpec();
    return this.mapSalesTrendRows(this.db.query<any>(sql, params), dates);
  }

  public async getSalesTrendLast7DaysAsync(): Promise<{ date: string; sales: number; profit: number }[]> {
    this.requireDashboardSalesView();
    const { sql, params, dates } = this.buildSalesTrendSpec();
    return this.mapSalesTrendRows(await this.db.queryAsync<any>(sql, params), dates);
  }

  private buildTopSellingProductsSpec(limit: number): { sql: string; params: any[] } {
    const scope = this.branchScope('si.branch_id');
    return {
      sql: `
      SELECT
        p.name,
        p.product_type AS productType,
        p.base_unit AS baseUnit,
        p.custom_unit AS customUnit,
        SUM(sii.quantity_m2) as quantityM2,
        SUM(sii.total_price) / 100.0 as totalRevenue
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      WHERE si.invoice_status != 'VOID' AND ${scope.clause}
      GROUP BY p.id
      ORDER BY quantityM2 DESC, totalRevenue DESC
      LIMIT ?
    `,
      params: [...scope.params, limit],
    };
  }

  public getTopSellingProducts(limit = 5): { name: string; quantityM2: number; totalRevenue: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[] {
    this.requireDashboardSalesView();
    const { sql, params } = this.buildTopSellingProductsSpec(limit);
    return this.db.query<any>(sql, params);
  }

  public async getTopSellingProductsAsync(limit = 5): Promise<{ name: string; quantityM2: number; totalRevenue: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[]> {
    this.requireDashboardSalesView();
    const { sql, params } = this.buildTopSellingProductsSpec(limit);
    return this.db.queryAsync<any>(sql, params);
  }

  private buildPurchaseReportSpec(dateFrom?: string, dateTo?: string): { invoicesSql: string; totalsSql: string; params: any[] } {
    this.requireView('ui.finance.overview.view');
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    const scope = this.branchScope('pi.branch_id');
    whereClause += ` AND ${scope.clause}`;
    params.push(...scope.params);

    if (dateFrom) {
      whereClause += ' AND pi.date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClause += ' AND pi.date <= ?';
      params.push(dateTo);
    }

    return {
      invoicesSql: `
      SELECT pi.*, s.name as supplierName, w.name as warehouseName
      FROM purchase_invoices pi
      LEFT JOIN suppliers s ON pi.supplier_id = s.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      ${whereClause}
      ORDER BY pi.date DESC
    `,
      totalsSql: `
      SELECT
        SUM(total_amount) as totalPurchases,
        SUM(paid_amount) as totalPaid,
        SUM(remaining_amount) as totalRemaining
      FROM purchase_invoices pi
      ${whereClause}
    `,
      params,
    };
  }

  private mapPurchaseReport(invoices: any[], totals: any): { totalPurchases: number; totalPaid: number; totalRemaining: number; invoices: any[] } {
    totals = totals || {};
    return {
      totalPurchases: Number((totals.totalPurchases || 0).toFixed(2)),
      totalPaid: Number((totals.totalPaid || 0).toFixed(2)),
      totalRemaining: Number((totals.totalRemaining || 0).toFixed(2)),
      invoices
    };
  }

  public getPurchaseReport(dateFrom?: string, dateTo?: string): {
    totalPurchases: number;
    totalPaid: number;
    totalRemaining: number;
    invoices: any[];
  } {
    const { invoicesSql, totalsSql, params } = this.buildPurchaseReportSpec(dateFrom, dateTo);
    return this.mapPurchaseReport(
      this.db.query<any>(invoicesSql, params),
      this.db.query<any>(totalsSql, params)[0],
    );
  }

  public async getPurchaseReportAsync(dateFrom?: string, dateTo?: string): Promise<{
    totalPurchases: number;
    totalPaid: number;
    totalRemaining: number;
    invoices: any[];
  }> {
    const { invoicesSql, totalsSql, params } = this.buildPurchaseReportSpec(dateFrom, dateTo);
    const [invoices, totalsRows] = await Promise.all([
      this.db.queryAsync<any>(invoicesSql, params),
      this.db.queryAsync<any>(totalsSql, params),
    ]);
    return this.mapPurchaseReport(invoices, totalsRows[0]);
  }

  private buildExpenseReportSpec(dateFrom?: string, dateTo?: string): { whereClause: string; params: any[] } {
    this.requireView('ui.finance.overview.view');
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    const scope = this.branchScope('e.branch_id');
    whereClause += ` AND ${scope.clause}`;
    params.push(...scope.params);

    if (dateFrom) {
      whereClause += ' AND e.date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClause += ' AND e.date <= ?';
      params.push(dateTo);
    }
    return { whereClause, params };
  }

  private mapExpenseReport(expenseRows: any[], byCategory: any[], totalResult: any): { totalExpenses: number; byCategory: { category: string; total: number }[]; expenses: any[] } {
    const expenses = expenseRows.map((row) => ({ ...row, amount: Number(row.amount) / 100 }));
    totalResult = totalResult || {};
    return {
      totalExpenses: Number((totalResult.totalExpenses || 0).toFixed(2)),
      byCategory,
      expenses
    };
  }

  public getExpenseReport(dateFrom?: string, dateTo?: string): {
    totalExpenses: number;
    byCategory: { category: string; total: number }[];
    expenses: any[];
  } {
    const { whereClause, params } = this.buildExpenseReportSpec(dateFrom, dateTo);
    const expenseRows = this.db.query<any>(`
      SELECT e.*, u.full_name as performedByName
      FROM expenses e
      LEFT JOIN users u ON e.performed_by = u.id
      ${whereClause}
      ORDER BY e.date DESC
    `, params);
    const byCategory = this.db.query<any>(`
      SELECT e.category, SUM(e.amount) / 100.0 as total
      FROM expenses e
      ${whereClause}
      GROUP BY e.category
      ORDER BY total DESC
    `, params);
    const totalResult = this.db.query<any>(`
      SELECT SUM(amount) / 100.0 as totalExpenses
      FROM expenses e
      ${whereClause}
    `, params)[0];
    return this.mapExpenseReport(expenseRows, byCategory, totalResult);
  }

  public async getExpenseReportAsync(dateFrom?: string, dateTo?: string): Promise<{
    totalExpenses: number;
    byCategory: { category: string; total: number }[];
    expenses: any[];
  }> {
    const { whereClause, params } = this.buildExpenseReportSpec(dateFrom, dateTo);
    const [expenseRows, byCategory, totalRows] = await Promise.all([
      this.db.queryAsync<any>(`
        SELECT e.*, u.full_name as performedByName
        FROM expenses e
        LEFT JOIN users u ON e.performed_by = u.id
        ${whereClause}
        ORDER BY e.date DESC
      `, params),
      this.db.queryAsync<any>(`
        SELECT e.category, SUM(e.amount) / 100.0 as total
        FROM expenses e
        ${whereClause}
        GROUP BY e.category
        ORDER BY total DESC
      `, params),
      this.db.queryAsync<any>(`
        SELECT SUM(amount) / 100.0 as totalExpenses
        FROM expenses e
        ${whereClause}
      `, params),
    ]);
    return this.mapExpenseReport(expenseRows, byCategory, totalRows[0]);
  }

  private requireProfitAndLossView(dateFrom?: string, dateTo?: string): void {
    this.requireView('ui.finance.overview.view');
    if ((dateFrom && !isValidDate(dateFrom)) || (dateTo && !isValidDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) {
      throw new Error('Invalid profit and loss date range.');
    }
  }

  private buildProfitAndLossSpecs(dateFrom?: string, dateTo?: string): {
    balancesSql: string; balancesParams: string[];
    sourceExpensesSql: string; sourceExpensesParams: string[];
  } {
    const conditions = ['e.is_posted = 1', "a.type IN ('REVENUE', 'EXPENSE')"];
    const params: string[] = [];
    const scope = this.ledgerScope();
    conditions.push(scope.clause);
    params.push(...scope.params);
    if (dateFrom) { conditions.push('e.date >= ?'); params.push(dateFrom); }
    if (dateTo) { conditions.push('e.date <= ?'); params.push(dateTo); }
    const sourceExpenseScope = this.branchScope('ex.branch_id');
    const sourceExpenseConditions = [sourceExpenseScope.clause];
    const sourceExpenseParams: string[] = [...sourceExpenseScope.params];
    if (dateFrom) { sourceExpenseConditions.push('ex.date >= ?'); sourceExpenseParams.push(dateFrom); }
    if (dateTo) { sourceExpenseConditions.push('ex.date <= ?'); sourceExpenseParams.push(dateTo); }
    return {
      balancesSql: `
      SELECT a.code, a.type,
             ROUND(SUM(CASE WHEN a.type = 'REVENUE' THEN (l.credit - l.debit) / 100.0 ELSE (l.debit - l.credit) / 100.0 END), 2) AS amount
      FROM journal_entries e
      JOIN journal_entry_lines l ON l.entry_id = e.id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY a.code, a.type
    `,
      balancesParams: params,
      sourceExpensesSql: `
      SELECT COALESCE(SUM(ex.amount), 0) / 100.0 AS total
      FROM expenses ex
      WHERE ${sourceExpenseConditions.join(' AND ')}
    `,
      sourceExpensesParams: sourceExpenseParams,
    };
  }

  private computeProfitAndLoss(balances: { code: string; type: string; amount: number }[], sourceExpensesValue: number): {
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
    this.requireProfitAndLossView(dateFrom, dateTo);
    const { balancesSql, balancesParams, sourceExpensesSql, sourceExpensesParams } = this.buildProfitAndLossSpecs(dateFrom, dateTo);
    const balances = this.db.query<{ code: string; type: string; amount: number }>(balancesSql, balancesParams);
    const sourceExpenses = Number(this.db.query<{ total: number }>(sourceExpensesSql, sourceExpensesParams)[0]?.total || 0);
    return this.computeProfitAndLoss(balances, sourceExpenses);
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
    this.requireProfitAndLossView(dateFrom, dateTo);
    const { balancesSql, balancesParams, sourceExpensesSql, sourceExpensesParams } = this.buildProfitAndLossSpecs(dateFrom, dateTo);
    const [balances, sourceExpenseRows] = await Promise.all([
      this.db.queryAsync<{ code: string; type: string; amount: number }>(balancesSql, balancesParams),
      this.db.queryAsync<{ total: number }>(sourceExpensesSql, sourceExpensesParams),
    ]);
    return this.computeProfitAndLoss(balances, Number(sourceExpenseRows[0]?.total || 0));
  }

  private requireProfitView(dateFrom: string, dateTo: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.view', '/finance');
    if (!isValidDate(dateFrom) || !isValidDate(dateTo) || dateFrom > dateTo) {
      throw new Error('Invalid profit and loss date range.');
    }
  }

  private buildProfitBalancesSpec(dateFrom: string, dateTo: string): { sql: string; params: any[] } {
    const scope = this.ledgerScope();
    return {
      sql: `
      SELECT e.date,
             a.code,
             a.type,
             SUM(CASE WHEN a.type = 'REVENUE' THEN (l.credit - l.debit) / 100.0 ELSE (l.debit - l.credit) / 100.0 END) AS amount
      FROM journal_entries e
      JOIN journal_entry_lines l ON l.entry_id = e.id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1
        AND a.type IN ('REVENUE', 'EXPENSE')
        AND e.date BETWEEN ? AND ?
        AND ${scope.clause}
      GROUP BY e.date, a.code, a.type
      ORDER BY e.date, a.code
    `,
      params: [dateFrom, dateTo, ...scope.params],
    };
  }

  private computeDashboardProfitData(balances: { date: string; code: string; type: 'REVENUE' | 'EXPENSE'; amount: number }[]): DashboardProfitData {
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

  public getDashboardProfitData(dateFrom: string, dateTo: string): DashboardProfitData {
    this.requireProfitView(dateFrom, dateTo);
    const spec = this.buildProfitBalancesSpec(dateFrom, dateTo);
    const balances = this.db.query<{ date: string; code: string; type: 'REVENUE' | 'EXPENSE'; amount: number }>(spec.sql, spec.params);
    return this.computeDashboardProfitData(balances);
  }

  public async getDashboardProfitDataAsync(dateFrom: string, dateTo: string): Promise<DashboardProfitData> {
    this.requireProfitView(dateFrom, dateTo);
    const spec = this.buildProfitBalancesSpec(dateFrom, dateTo);
    const balances = await this.db.queryAsync<{ date: string; code: string; type: 'REVENUE' | 'EXPENSE'; amount: number }>(spec.sql, spec.params);
    return this.computeDashboardProfitData(balances);
  }

  private requireSalesReportView(permission: string): void {
    this.requireView(permission);
    PermissionService.require(AuthService.requireAuth(), 'sales.view', '/sales');
  }

  private buildSalesReportWhere(dateFrom?: string, dateTo?: string): { whereClause: string; params: any[] } {
    let whereClause = 'WHERE si.invoice_status != \'VOID\'';
    const params: any[] = [];
    const scope = this.branchScope('si.branch_id');
    whereClause += ` AND ${scope.clause}`;
    params.push(...scope.params);

    if (dateFrom) {
      whereClause += ' AND si.date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClause += ' AND si.date <= ?';
      params.push(dateTo);
    }
    return { whereClause, params };
  }

  private maskReportProfit<T extends { profit: number }>(rows: T[]): T[] {
    const canSee = financialFieldVisibility().profit;
    return rows.map((row) => ({ ...row, profit: canSee ? Number(row.profit || 0) : 0 }));
  }

  private buildCategorySalesSpec(dateFrom?: string, dateTo?: string): { sql: string; params: any[] } {
    const { whereClause, params } = this.buildSalesReportWhere(dateFrom, dateTo);
    return {
      sql: `
      SELECT
        c.name as categoryName,
        CASE
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'CUSTOM' THEN COALESCE(NULLIF(TRIM(p.custom_unit), ''), 'وحدة')
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'BOX' THEN 'كرتونة'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'PIECE' THEN 'قطعة'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'KG' THEN 'كجم'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'TON' THEN 'طن'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'SET' THEN 'طقم'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'LINEAR_METER' THEN 'متر طولي'
          WHEN p.product_type = 'GENERAL' THEN 'م²'
          ELSE 'م²'
        END as unitLabel,
        p.product_type as productType,
        p.base_unit as baseUnit,
        p.custom_unit as customUnit,
        SUM(sii.quantity_m2) as quantityM2,
        SUM(sii.total_price) / 100.0 as totalRevenue,
        SUM(sii.profit) / 100.0 as profit
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      ${whereClause}
      GROUP BY c.id, c.name, p.product_type, p.base_unit, p.custom_unit
      ORDER BY totalRevenue DESC
    `,
      params,
    };
  }

  public getCategorySalesReport(dateFrom?: string, dateTo?: string): { categoryName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[] {
    this.requireSalesReportView('dashboard.view');
    const { sql, params } = this.buildCategorySalesSpec(dateFrom, dateTo);
    return this.maskReportProfit(this.db.query<any>(sql, params));
  }

  public async getCategorySalesReportAsync(dateFrom?: string, dateTo?: string): Promise<{ categoryName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[]> {
    this.requireSalesReportView('dashboard.view');
    const { sql, params } = this.buildCategorySalesSpec(dateFrom, dateTo);
    return this.maskReportProfit(await this.db.queryAsync<any>(sql, params));
  }

  private buildBrandSalesSpec(dateFrom?: string, dateTo?: string): { sql: string; params: any[] } {
    const { whereClause, params } = this.buildSalesReportWhere(dateFrom, dateTo);
    return {
      sql: `
      SELECT
        b.name as brandName,
        CASE
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'CUSTOM' THEN COALESCE(NULLIF(TRIM(p.custom_unit), ''), 'وحدة')
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'BOX' THEN 'كرتونة'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'PIECE' THEN 'قطعة'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'KG' THEN 'كجم'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'TON' THEN 'طن'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'SET' THEN 'طقم'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'LINEAR_METER' THEN 'متر طولي'
          WHEN p.product_type = 'GENERAL' THEN 'م²'
          ELSE 'م²'
        END as unitLabel,
        p.product_type as productType,
        p.base_unit as baseUnit,
        p.custom_unit as customUnit,
        SUM(sii.quantity_m2) as quantityM2,
        SUM(sii.total_price) / 100.0 as totalRevenue,
        SUM(sii.profit) / 100.0 as profit
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      ${whereClause}
      GROUP BY b.id, b.name, p.product_type, p.base_unit, p.custom_unit
      ORDER BY totalRevenue DESC
    `,
      params,
    };
  }

  public getBrandSalesReport(dateFrom?: string, dateTo?: string): { brandName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[] {
    this.requireView('reports.view');
    const { sql, params } = this.buildBrandSalesSpec(dateFrom, dateTo);
    return this.maskReportProfit(this.db.query<any>(sql, params));
  }

  public async getBrandSalesReportAsync(dateFrom?: string, dateTo?: string): Promise<{ brandName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[]> {
    this.requireView('reports.view');
    const { sql, params } = this.buildBrandSalesSpec(dateFrom, dateTo);
    return this.maskReportProfit(await this.db.queryAsync<any>(sql, params));
  }

  private buildInventoryValuationSpecs(): { byWarehouseSql: string; totalsSql: string; params: any[] } {
    this.requireView('ui.finance.overview.view');
    const scope = this.branchScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id ORDER BY bw.is_primary DESC, bw.branch_id LIMIT 1)'
    );
    return {
      byWarehouseSql: `
      SELECT
        w.name as warehouseName,
        SUM(ws.quantity_m2 * p.cost_price) / 100.0 as costValue,
        SUM(ws.quantity_m2 * p.selling_price_m2) / 100.0 as saleValue,
        COUNT(ws.id) as items
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      WHERE p.is_active = 1 AND ws.quantity_m2 > 0 AND ${scope.clause}
      GROUP BY w.id, w.name
      ORDER BY costValue DESC
    `,
      totalsSql: `
      SELECT
        SUM(ws.quantity_m2 * p.cost_price) / 100.0 as totalCost,
        SUM(ws.quantity_m2 * p.selling_price_m2) / 100.0 as totalSale
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      WHERE p.is_active = 1 AND ws.quantity_m2 > 0 AND ${scope.clause}
    `,
      params: [...scope.params],
    };
  }

  private mapInventoryValuation(byWarehouse: any[], totals: any): {
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

  public getInventoryValuationReport(): {
    totalCostValue: number;
    totalSaleValue: number;
    byWarehouse: { warehouseName: string; costValue: number; saleValue: number; items: number }[];
  } {
    const { byWarehouseSql, totalsSql, params } = this.buildInventoryValuationSpecs();
    return this.mapInventoryValuation(
      this.db.query<any>(byWarehouseSql, params),
      this.db.query<any>(totalsSql, params)[0],
    );
  }

  public async getInventoryValuationReportAsync(): Promise<{
    totalCostValue: number;
    totalSaleValue: number;
    byWarehouse: { warehouseName: string; costValue: number; saleValue: number; items: number }[];
  }> {
    const { byWarehouseSql, totalsSql, params } = this.buildInventoryValuationSpecs();
    const [byWarehouse, totalsRows] = await Promise.all([
      this.db.queryAsync<any>(byWarehouseSql, params),
      this.db.queryAsync<any>(totalsSql, params),
    ]);
    return this.mapInventoryValuation(byWarehouse, totalsRows[0]);
  }

  // New methods for enhanced dashboard analytics
  private requireMonthlyComparisonView(): void {
    this.requireView('dashboard.view');
    PermissionService.require(AuthService.requireAuth(), 'sales.view', '/sales');
  }

  private buildMonthlyComparisonSpec(): { sql: string; params: any[] } {
    const now = new Date();
    const today = localDateString();
    const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const prevMonthLastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
    const prevMonthEnd = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${String(Math.min(now.getDate(), prevMonthLastDay)).padStart(2, '0')}`;
    const scope = this.branchScope('si.branch_id');

    return {
      sql: `
      WITH sales AS (
        SELECT
          SUM(CASE WHEN si.date BETWEEN ? AND ? THEN si.subtotal - si.discount_amount ELSE 0 END) / 100.0 AS currentRevenue,
          SUM(CASE WHEN si.date BETWEEN ? AND ? THEN si.gross_profit ELSE 0 END) / 100.0 AS currentProfit,
          SUM(CASE WHEN si.date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS currentInvoices,
          SUM(CASE WHEN si.date BETWEEN ? AND ? THEN si.subtotal - si.discount_amount ELSE 0 END) / 100.0 AS previousRevenue,
          SUM(CASE WHEN si.date BETWEEN ? AND ? THEN si.gross_profit ELSE 0 END) / 100.0 AS previousProfit,
          SUM(CASE WHEN si.date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS previousInvoices
        FROM sales_invoices si
        WHERE (si.date BETWEEN ? AND ? OR si.date BETWEEN ? AND ?)
          AND si.invoice_status != 'VOID' AND ${scope.clause}
      ),
      returns AS (
        SELECT
          SUM(CASE WHEN sr.date BETWEEN ? AND ? THEN sr.total_amount ELSE 0 END) / 100.0 AS currentRevenue,
          SUM(CASE WHEN sr.date BETWEEN ? AND ? THEN sr.total_amount ELSE 0 END) / 100.0 AS previousRevenue
        FROM sales_returns sr
        JOIN sales_invoices si ON si.id = sr.original_invoice_id
        WHERE (sr.date BETWEEN ? AND ? OR sr.date BETWEEN ? AND ?)
          AND si.invoice_status != 'VOID' AND ${scope.clause}
      ),
      returned_cost AS (
        SELECT
          SUM(CASE WHEN sr.date BETWEEN ? AND ? THEN sri.quantity_m2 * sri.unit_cost ELSE 0 END) / 100.0 AS currentCost,
          SUM(CASE WHEN sr.date BETWEEN ? AND ? THEN sri.quantity_m2 * sri.unit_cost ELSE 0 END) / 100.0 AS previousCost
        FROM sales_return_items sri
        JOIN sales_returns sr ON sr.id = sri.return_id
        JOIN sales_invoices si ON si.id = sr.original_invoice_id
        WHERE (sr.date BETWEEN ? AND ? OR sr.date BETWEEN ? AND ?)
          AND si.invoice_status != 'VOID' AND ${scope.clause}
      )
      SELECT
        sales.currentRevenue AS currentSalesRevenue,
        sales.currentProfit AS currentProfit,
        sales.currentInvoices AS currentInvoices,
        sales.previousRevenue AS previousSalesRevenue,
        sales.previousProfit AS previousProfit,
        sales.previousInvoices AS previousInvoices,
        returns.currentRevenue AS currentReturnedRevenue,
        returns.previousRevenue AS previousReturnedRevenue,
        returned_cost.currentCost AS currentReturnedCost,
        returned_cost.previousCost AS previousReturnedCost
      FROM sales CROSS JOIN returns CROSS JOIN returned_cost
    `,
      params: [
        currentMonthStart, today, currentMonthStart, today, currentMonthStart, today,
        prevMonthStart, prevMonthEnd, prevMonthStart, prevMonthEnd, prevMonthStart, prevMonthEnd,
        currentMonthStart, today, prevMonthStart, prevMonthEnd, ...scope.params,
        currentMonthStart, today, prevMonthStart, prevMonthEnd,
        currentMonthStart, today, prevMonthStart, prevMonthEnd, ...scope.params,
        currentMonthStart, today, prevMonthStart, prevMonthEnd,
        currentMonthStart, today, prevMonthStart, prevMonthEnd, ...scope.params,
      ],
    };
  }

  private mapMonthlyComparison(summaries: any): MonthlyComparison {
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
      profit: canSeeProfit ? Number((current.profit || 0).toFixed(2)) : 0,
      invoices: current.invoices || 0,
    };
    const previousMonth = {
      sales: Number((previous.sales || 0).toFixed(2)),
      profit: canSeeProfit ? Number((previous.profit || 0).toFixed(2)) : 0,
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

  public getMonthlyComparison(): MonthlyComparison {
    this.requireMonthlyComparisonView();
    const { sql, params } = this.buildMonthlyComparisonSpec();
    return this.mapMonthlyComparison(this.db.query<any>(sql, params)[0]);
  }

  public async getMonthlyComparisonAsync(): Promise<MonthlyComparison> {
    this.requireMonthlyComparisonView();
    const { sql, params } = this.buildMonthlyComparisonSpec();
    return this.mapMonthlyComparison((await this.db.queryAsync<any>(sql, params))[0]);
  }

  public getDailyComparison(): MonthlyComparison {
    this.requireView('dashboard.view');
    PermissionService.require(AuthService.requireAuth(), 'ui.sales.invoices.view', '/sales');
    const now = new Date();
    const today = localDateString();
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);
    const yesterday = localDateString(yesterdayDate);
    const scope = this.branchScope('si.branch_id');

    const canSeeProfit = financialFieldVisibility().profit;
    const summarize = (from: string, to: string) => {
      const revenue = Number(this.db.query<any>(`
        SELECT COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS v
        FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0]?.v || 0);
      const returns = Number(this.db.query<any>(`
        SELECT COALESCE(SUM(sr.total_amount), 0) / 100.0 AS v
        FROM sales_returns sr JOIN sales_invoices si ON si.id = sr.original_invoice_id
        WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0]?.v || 0);
      const profit = Number(this.db.query<any>(`
        SELECT COALESCE(SUM(si.gross_profit), 0) / 100.0 AS v
        FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0]?.v || 0);
      const returnedCost = Number(this.db.query<any>(`
        SELECT COALESCE(SUM(sri.quantity_m2 * sri.unit_cost), 0) / 100.0 AS v
        FROM sales_return_items sri JOIN sales_returns sr ON sr.id = sri.return_id
        JOIN sales_invoices si ON si.id = sr.original_invoice_id
        WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0]?.v || 0);
      const invoices = Number(this.db.query<any>(`
        SELECT COUNT(*) AS v FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0]?.v || 0);
      return {
        sales: Number((revenue - returns).toFixed(2)),
        profit: canSeeProfit ? Number((profit - returns + returnedCost).toFixed(2)) : 0,
        invoices,
      };
    };

    const current = summarize(today, today);
    const previous = summarize(yesterday, yesterday);
    return {
      currentMonth: current,
      previousMonth: previous,
      salesGrowth: previous.sales > 0 ? Number(((current.sales - previous.sales) / previous.sales * 100).toFixed(1)) : null,
      invoiceGrowth: previous.invoices > 0 ? Number(((current.invoices - previous.invoices) / previous.invoices * 100).toFixed(1)) : null,
      currentMonthInvoices: current.invoices,
    };
  }

  public getYearlyComparison(): MonthlyComparison {
    this.requireView('dashboard.view');
    PermissionService.require(AuthService.requireAuth(), 'ui.sales.invoices.view', '/sales');
    const now = new Date();
    const today = localDateString();
    const yearStart = `${now.getFullYear()}-01-01`;
    const prevYearStart = `${now.getFullYear() - 1}-01-01`;
    const prevYearSameDay = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const scope = this.branchScope('si.branch_id');

    const canSeeProfit = financialFieldVisibility().profit;
    const summarize = (from: string, to: string) => {
      const revenue = Number(this.db.query<any>(`
        SELECT COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS v
        FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0]?.v || 0);
      const returns = Number(this.db.query<any>(`
        SELECT COALESCE(SUM(sr.total_amount), 0) / 100.0 AS v
        FROM sales_returns sr JOIN sales_invoices si ON si.id = sr.original_invoice_id
        WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0]?.v || 0);
      const profit = Number(this.db.query<any>(`
        SELECT COALESCE(SUM(si.gross_profit), 0) / 100.0 AS v
        FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0]?.v || 0);
      const returnedCost = Number(this.db.query<any>(`
        SELECT COALESCE(SUM(sri.quantity_m2 * sri.unit_cost), 0) / 100.0 AS v
        FROM sales_return_items sri JOIN sales_returns sr ON sr.id = sri.return_id
        JOIN sales_invoices si ON si.id = sr.original_invoice_id
        WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0]?.v || 0);
      const invoices = Number(this.db.query<any>(`
        SELECT COUNT(*) AS v FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0]?.v || 0);
      return {
        sales: Number((revenue - returns).toFixed(2)),
        profit: canSeeProfit ? Number((profit - returns + returnedCost).toFixed(2)) : 0,
        invoices,
      };
    };

    const current = summarize(yearStart, today);
    const previous = summarize(prevYearStart, prevYearSameDay);
    return {
      currentMonth: current,
      previousMonth: previous,
      salesGrowth: previous.sales > 0 ? Number(((current.sales - previous.sales) / previous.sales * 100).toFixed(1)) : null,
      invoiceGrowth: previous.invoices > 0 ? Number(((current.invoices - previous.invoices) / previous.invoices * 100).toFixed(1)) : null,
      currentMonthInvoices: current.invoices,
    };
  }

  public getNetSalesAnalysis(dateFrom?: string, dateTo?: string): { grossSales: number; returns: number; netSales: number; returnedCost: number; netProfit: number; invoices: number; returnRate: number } {
    this.requireView('dashboard.view');
    PermissionService.require(AuthService.requireAuth(), 'ui.sales.invoices.view', '/sales');
    const scope = this.branchScope('si.branch_id');
    const conditions = ['si.invoice_status != \'VOID\'', scope.clause];
    const params: any[] = [...scope.params];
    if (dateFrom) { conditions.push('si.date >= ?'); params.unshift(dateFrom); }
    if (dateTo) { conditions.push('si.date <= ?'); params.unshift(dateTo); }
    // rebuild params order: dates first then scope
    const orderedParams: any[] = [];
    if (dateFrom) orderedParams.push(dateFrom);
    if (dateTo) orderedParams.push(dateTo);
    orderedParams.push(...scope.params);

    const grossSales = Number(this.db.query<any>(`
      SELECT COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS v
      FROM sales_invoices si WHERE ${conditions.join(' AND ')}
    `, orderedParams)[0]?.v || 0);
    const returns = Number(this.db.query<any>(`
      SELECT COALESCE(SUM(sr.total_amount), 0) / 100.0 AS v
      FROM sales_returns sr JOIN sales_invoices si ON si.id = sr.original_invoice_id
      WHERE si.invoice_status != 'VOID' AND ${scope.clause}
        ${dateFrom ? 'AND sr.date >= ?' : ''} ${dateTo ? 'AND sr.date <= ?' : ''}
    `, [...scope.params, ...(dateFrom ? [dateFrom] : []), ...(dateTo ? [dateTo] : [])])[0]?.v || 0);
    const returnedCost = Number(this.db.query<any>(`
      SELECT COALESCE(SUM(sri.quantity_m2 * sri.unit_cost), 0) / 100.0 AS v
      FROM sales_return_items sri JOIN sales_returns sr ON sr.id = sri.return_id
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      WHERE si.invoice_status != 'VOID' AND ${scope.clause}
        ${dateFrom ? 'AND sr.date >= ?' : ''} ${dateTo ? 'AND sr.date <= ?' : ''}
    `, [...scope.params, ...(dateFrom ? [dateFrom] : []), ...(dateTo ? [dateTo] : [])])[0]?.v || 0);
    const profit = Number(this.db.query<any>(`
      SELECT COALESCE(SUM(si.gross_profit), 0) / 100.0 AS v
      FROM sales_invoices si WHERE ${conditions.join(' AND ')}
    `, orderedParams)[0]?.v || 0);
    const invoices = Number(this.db.query<any>(`
      SELECT COUNT(*) AS v FROM sales_invoices si WHERE ${conditions.join(' AND ')}
    `, orderedParams)[0]?.v || 0);
    const netSales = grossSales - returns;
    const netProfit = profit - returns + returnedCost;
    const returnRate = grossSales > 0 ? Number(((returns / grossSales) * 100).toFixed(1)) : 0;
    const visibility = financialFieldVisibility();
    return {
      grossSales: Number(grossSales.toFixed(2)),
      returns: Number(returns.toFixed(2)),
      netSales: Number(netSales.toFixed(2)),
      returnedCost: visibility.cost ? Number(returnedCost.toFixed(2)) : 0,
      netProfit: visibility.profit ? Number(netProfit.toFixed(2)) : 0,
      invoices,
      returnRate,
    };
  }

  // Aliases for common naming variants
  public getDayComparison() { return this.getDailyComparison(); }
  public getYearComparison() { return this.getYearlyComparison(); }
  public getNetSales(dateFrom?: string, dateTo?: string) { return this.getNetSalesAnalysis(dateFrom, dateTo); }
  public getNetSalesAfterReturns(dateFrom?: string, dateTo?: string) { return this.getNetSalesAnalysis(dateFrom, dateTo); }

  private requireDashboardCustomersSalesView(): void {
    this.requireView('dashboard.view');
    PermissionService.require(AuthService.requireAuth(), 'customers.view', '/customers');
    PermissionService.require(AuthService.requireAuth(), 'sales.view', '/sales');
  }

  private buildTopCustomersSpec(limit: number): { sql: string; params: any[] } {
    const scope = this.branchScope('si.branch_id');
    return {
      sql: `
      SELECT
        c.name,
        SUM(si.total_amount) / 100.0 as totalPurchases,
        COUNT(DISTINCT si.id) as purchaseCount
      FROM customers c
      LEFT JOIN sales_invoices si ON c.id = si.customer_id AND si.invoice_status != 'VOID' AND ${scope.clause}
      GROUP BY c.id
      HAVING totalPurchases > 0
      ORDER BY totalPurchases DESC
      LIMIT ?
    `,
      params: [...scope.params, limit],
    };
  }

  public getTopCustomers(limit = 5): { name: string; totalPurchases: number; purchaseCount: number }[] {
    this.requireDashboardCustomersSalesView();
    const { sql, params } = this.buildTopCustomersSpec(limit);
    return this.db.query<any>(sql, params);
  }

  public async getTopCustomersAsync(limit = 5): Promise<{ name: string; totalPurchases: number; purchaseCount: number }[]> {
    this.requireDashboardCustomersSalesView();
    const { sql, params } = this.buildTopCustomersSpec(limit);
    return this.db.queryAsync<any>(sql, params);
  }

  private requireDashboardFinanceSalesView(): void {
    this.requireView('dashboard.view');
    PermissionService.require(AuthService.requireAuth(), 'finance.view', '/finance');
    PermissionService.require(AuthService.requireAuth(), 'sales.view', '/sales');
  }

  private buildPaymentMethodSpec(): { sql: string; params: any[] } {
    const scope = this.branchScope('si.branch_id');
    return {
      sql: `
      SELECT
        payment_type as method,
        COUNT(*) as count,
        SUM(total_amount) / 100.0 as totalAmount
      FROM sales_invoices si
      WHERE invoice_status != 'VOID' AND date >= date('now', '-30 days') AND ${scope.clause}
      GROUP BY payment_type
      ORDER BY totalAmount DESC
    `,
      params: [...scope.params],
    };
  }

  public getPaymentMethodDistribution(): { method: string; count: number; totalAmount: number }[] {
    this.requireDashboardFinanceSalesView();
    const { sql, params } = this.buildPaymentMethodSpec();
    return this.db.query<any>(sql, params);
  }

  public async getPaymentMethodDistributionAsync(): Promise<{ method: string; count: number; totalAmount: number }[]> {
    this.requireDashboardFinanceSalesView();
    const { sql, params } = this.buildPaymentMethodSpec();
    return this.db.queryAsync<any>(sql, params);
  }

  private buildSalesByGradeSpec(): { sql: string; params: any[] } {
    const scope = this.branchScope('si.branch_id');
    return {
      sql: `
      SELECT
        p.grade,
        SUM(sii.quantity_m2) as quantityM2,
        SUM(sii.total_price) / 100.0 as totalRevenue
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      WHERE si.invoice_status != 'VOID' AND si.date >= date('now', '-30 days') AND ${scope.clause}
      GROUP BY p.grade
      ORDER BY totalRevenue DESC
    `,
      params: [...scope.params],
    };
  }

  public getSalesByGrade(): { grade: string; quantityM2: number; totalRevenue: number }[] {
    this.requireDashboardSalesView();
    const { sql, params } = this.buildSalesByGradeSpec();
    return this.db.query<any>(sql, params);
  }

  public async getSalesByGradeAsync(): Promise<{ grade: string; quantityM2: number; totalRevenue: number }[]> {
    this.requireDashboardSalesView();
    const { sql, params } = this.buildSalesByGradeSpec();
    return this.db.queryAsync<any>(sql, params);
  }

  private requireRecentActivitiesView(): void {
    this.requireView('dashboard.view');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.view', '/sales');
    PermissionService.require(actor, 'purchases.view', '/purchases');
    PermissionService.require(actor, 'inventory.view', '/inventory');
  }

  private buildRecentActivitySpecs(): { sales: { sql: string; params: any[] }; purchases: { sql: string; params: any[] }; stocks: { sql: string; params: any[] } } {
    const salesScope = this.branchScope('si.branch_id');
    const purchaseScope = this.branchScope('pi.branch_id');
    const stockScope = this.branchScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id ORDER BY bw.is_primary DESC, bw.branch_id LIMIT 1)'
    );
    return {
      // Recent sales
      sales: {
        sql: `
      SELECT 'SALE' as type,
        'فاتورة مبيعات #' || si.invoice_number as description,
        si.total_amount / 100.0 as amount,
        si.date
      FROM sales_invoices si
      WHERE si.invoice_status != 'VOID' AND ${salesScope.clause}
      ORDER BY si.date DESC
      LIMIT 3
    `,
        params: [...salesScope.params],
      },
      // Recent purchases
      purchases: {
        sql: `
      SELECT 'PURCHASE' as type,
        'فاتورة توريد #' || pi.invoice_number as description,
        pi.total_amount / 100.0 as amount,
        pi.date
      FROM purchase_invoices pi
      WHERE ${purchaseScope.clause}
      ORDER BY pi.date DESC
      LIMIT 3
    `,
        params: [...purchaseScope.params],
      },
      // Recent stock movements
      stocks: {
        sql: `
      SELECT 'STOCK' as type,
        'حركة مخزون #' || t.transaction_number as description,
        NULL as amount,
        t.created_at as date
      FROM inventory_transactions t
      JOIN warehouses w ON w.id = t.warehouse_id
      WHERE ${stockScope.clause}
      ORDER BY t.created_at DESC
      LIMIT 2
    `,
        params: [...stockScope.params],
      },
    };
  }

  private mapRecentActivities(sales: DashboardActivityRow[], purchases: DashboardActivityRow[], stocks: DashboardActivityRow[], limit: number): RecentDashboardActivity[] {
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

  public getRecentActivities(limit = 10): RecentDashboardActivity[] {
    this.requireRecentActivitiesView();
    const specs = this.buildRecentActivitySpecs();
    return this.mapRecentActivities(
      this.db.query<DashboardActivityRow>(specs.sales.sql, specs.sales.params),
      this.db.query<DashboardActivityRow>(specs.purchases.sql, specs.purchases.params),
      this.db.query<DashboardActivityRow>(specs.stocks.sql, specs.stocks.params),
      limit,
    );
  }

  public async getRecentActivitiesAsync(limit = 10): Promise<RecentDashboardActivity[]> {
    this.requireRecentActivitiesView();
    const specs = this.buildRecentActivitySpecs();
    const [sales, purchases, stocks] = await Promise.all([
      this.db.queryAsync<DashboardActivityRow>(specs.sales.sql, specs.sales.params),
      this.db.queryAsync<DashboardActivityRow>(specs.purchases.sql, specs.purchases.params),
      this.db.queryAsync<DashboardActivityRow>(specs.stocks.sql, specs.stocks.params),
    ]);
    return this.mapRecentActivities(sales, purchases, stocks, limit);
  }
}
