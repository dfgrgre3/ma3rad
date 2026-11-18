import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { AccountingService } from '../finance/AccountingService';
import type {
  DailySale, DebtCustomer, LowStockItem, RecentInvoice, TopProduct,
} from '../../../types/dashboard/executive';
import type { DashboardMetrics, MonthlyComparison } from '../finance/AccountingService';
import type {
  CategoryDistributionItem, PaymentDistributionItem, PurchaseHourlyBucket,
  PurchasePaymentMixItem, PurchaseTopItem, PurchaseTopSupplier, RecentActivityItem, SalesTrendPoint,
  TopCustomerItem, TopSellingProduct,
} from '../../../types/dashboard/components';
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import type { DailyPurchaseResult } from '../operations/DailyOperationsService';

/**
 * Unified Dashboard Metrics Service
 * 
 * Single source of truth for all dashboard metric definitions:
 * - Net Sales: subtotal - discount - returns
 * - Profit: from accounting entries (gross profit - expenses)
 * - Low Stock: per product+warehouse compared to product min_stock_level
 * - Handles FIFO errors gracefully (shows "غير متاح" for valuation only)
 * - Handles permission errors gracefully (partial display)
 */

export interface ExecutiveDashboardData {
  total: number;
  profit: number;
  totalDebt: number;
  totalPurchases: number;
  totalReceived: number;
  invoiceCount: number;
  salesTrend: string;
  margin: string;
  dailySalesData: DailySale[];
  topProductsData: TopProduct[];
  recentInvoicesData: RecentInvoice[];
  debtCustomersData: DebtCustomer[];
  branchDataList: { name: string; value: number }[];
  lowStockData: LowStockItem[];
}

export interface OverviewDashboardData {
  metrics: DashboardMetrics | null;
  chartData: SalesTrendPoint[];
  topProducts: TopSellingProduct[];
  monthlyComparison: MonthlyComparison | null;
  topCustomers: TopCustomerItem[];
  categorySales: CategoryDistributionItem[];
  gradeSales: { grade: string; quantityM2: number; totalRevenue: number }[];
  paymentDistribution: PaymentDistributionItem[];
  recentActivities: RecentActivityItem[];
  todayPurchases: DailyPurchaseResult | null;
  purchasesLoading: boolean;
  purchasesError: string | null;
  purchaseHourly: PurchaseHourlyBucket[];
  purchasePeakHour: number;
  purchasePaymentMix: PurchasePaymentMixItem[];
  purchaseTopSuppliers: PurchaseTopSupplier[];
  purchaseTopItems: PurchaseTopItem[];
  purchaseQuantitiesByUnit: [string, number][];
}

export interface PartialDataError {
  section: string;
  message: string;
  originalError: Error;
}

export class DashboardMetricsService {
  private db = DatabaseManager.getInstance().getDatabase();
  private branchAccess = new BranchAccessService();
  private accountingService = new AccountingService();
  private partialErrors: PartialDataError[] = [];

  private getPartialErrors(): PartialDataError[] {
    return this.partialErrors;
  }

  private clearPartialErrors(): void {
    this.partialErrors = [];
  }

  private addPartialError(section: string, error: Error): void {
    this.partialErrors.push({ section, message: error.message, originalError: error });
  }

  /**
   * Get executive dashboard data with unified metric definitions
   */
  async getExecutiveDashboardData(fromStr: string, toStr: string): Promise<ExecutiveDashboardData | null> {
    this.clearPartialErrors();
    
    // Check permissions
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.view', '/sales');
    PermissionService.require(actor, 'purchases.view', '/purchases');
    PermissionService.require(actor, 'finance.view', '/finance');

    if (!this.db) return null;

    const salesScope = this.branchAccess.sqlScope('si.branch_id', undefined, actor);
    const salesCompanyScope = this.branchAccess.companyScopeViaBranch('si.branch_id', actor);
    const purchaseScope = this.branchAccess.sqlScope('pi.branch_id', undefined, actor);
    const purchaseCompanyScope = this.branchAccess.companyScopeViaBranch('pi.branch_id', actor);
    const paymentScope = this.branchAccess.sqlScope('cp.branch_id', undefined, actor);
    const warehouseScope = this.branchAccess.warehouseBranchScope('w', undefined, actor);

    const today = format(new Date(), 'yyyy-MM-dd');
    const periodTo = toStr < today ? toStr : today;
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    // ===== UNIFIED NET SALES CALCULATION =====
    // Net Sales = subtotal - discount_amount - returns
    const salesRow = this.db.exec(
      `SELECT COALESCE(SUM(si.subtotal - si.discount_amount),0) / 100.0 as total 
       FROM sales_invoices si 
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`,
      [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]
    );
    const returnsRow = this.db.exec(
      `SELECT COALESCE(SUM(sr.total_amount),0) / 100.0 
       FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id 
       WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`,
      [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]
    );
    const netReturns = Number(returnsRow[0]?.values[0]?.[0] ?? 0);
    const total = Number(salesRow[0]?.values[0]?.[0] ?? 0) - netReturns;

    // ===== UNIFIED PROFIT CALCULATION =====
    // Profit from accounting service (gross profit from invoices - expenses)
    let profit = 0;
    let profitData: { netProfit: number; dailyNetProfit: { date: string; profit: number }[] } = { netProfit: 0, dailyNetProfit: [] };
    try {
      profitData = await this.accountingService.getDashboardProfitDataAsync(fromStr, periodTo);
      profit = profitData.netProfit;
    } catch (e) {
      this.addPartialError('profit', e as Error);
      // Try fallback: gross profit from invoices
      try {
        const grossProfitRow = this.db.exec(
          `SELECT COALESCE(SUM(si.gross_profit),0) / 100.0 
           FROM sales_invoices si 
           WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`,
          [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]
        );
        profit = Number(grossProfitRow[0]?.values[0]?.[0] ?? 0);
      } catch {
        profit = 0;
      }
    }

    // ===== SALES TREND (today vs yesterday) =====
    const yesterdayRow = this.db.exec(
      `SELECT (COALESCE((SELECT SUM(si.subtotal-si.discount_amount) FROM sales_invoices si WHERE si.date=? AND si.invoice_status!='VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}),0) - 
              COALESCE((SELECT SUM(sr.total_amount) FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id WHERE sr.date=? AND si.invoice_status!='VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}),0)) / 100.0`,
      [yesterday, ...salesScope.params, ...salesCompanyScope.params, yesterday, ...salesScope.params, ...salesCompanyScope.params]
    );
    const todayRow = this.db.exec(
      `SELECT (COALESCE((SELECT SUM(si.subtotal-si.discount_amount) FROM sales_invoices si WHERE si.date=? AND si.invoice_status!='VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}),0) - 
              COALESCE((SELECT SUM(sr.total_amount) FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id WHERE sr.date=? AND si.invoice_status!='VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}),0)) / 100.0`,
      [today, ...salesScope.params, ...salesCompanyScope.params, today, ...salesScope.params, ...salesCompanyScope.params]
    );
    const todaySales = (todayRow[0]?.values[0]?.[0] as number) ?? 0;
    const yesterdaySales = (yesterdayRow[0]?.values[0]?.[0] as number) ?? 0;
    const salesTrend = yesterdaySales > 0 ? (((todaySales - yesterdaySales) / yesterdaySales) * 100).toFixed(1) : '0';

    // ===== TOTAL DEBT =====
    const debtRow = this.db.exec(
      `SELECT COALESCE(SUM(si.remaining_amount),0) / 100.0 
       FROM sales_invoices si 
       WHERE si.remaining_amount > 0 AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`,
      [...salesScope.params, ...salesCompanyScope.params]
    );
    const totalDebt = (debtRow[0]?.values[0]?.[0] as number) ?? 0;

    // ===== TOTAL PURCHASES =====
    const totalPurchasesRow = this.db.exec(
      `SELECT COALESCE(SUM(pi.total_amount),0) / 100.0 
       FROM purchase_invoices pi 
       WHERE pi.date BETWEEN ? AND ? AND ${purchaseScope.clause} AND ${purchaseCompanyScope.clause}`,
      [fromStr, periodTo, ...purchaseScope.params, ...purchaseCompanyScope.params]
    );
    const totalPurchases = (totalPurchasesRow[0]?.values[0]?.[0] as number) ?? 0;

    // ===== TOTAL RECEIVED =====
    const receivedRow = this.db.exec(
      `SELECT COALESCE(SUM(cp.amount),0) / 100.0 
       FROM customer_payments cp 
       WHERE cp.date BETWEEN ? AND ? AND ${paymentScope.clause}`,
      [fromStr, periodTo, ...paymentScope.params]
    );
    const totalReceived = (receivedRow[0]?.values[0]?.[0] as number) ?? 0;

    // ===== INVOICE COUNT =====
    const invoiceCountRow = this.db.exec(
      `SELECT COUNT(*) 
       FROM sales_invoices si 
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`,
      [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]
    );
    const invoiceCount = (invoiceCountRow[0]?.values[0]?.[0] as number) ?? 0;

    // ===== MARGIN =====
    const margin = total > 0 ? ((profit / total) * 100).toFixed(1) : '0';

    // ===== DAILY SALES DATA =====
    const salesByDayRow = this.db.exec(
      `SELECT si.date as day, COALESCE(SUM(si.subtotal-si.discount_amount),0) / 100.0 as sales 
       FROM sales_invoices si 
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} 
       GROUP BY si.date ORDER BY day ASC`,
      [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]
    );
    const salesMap: Record<string, number> = {};
    salesByDayRow[0]?.values.forEach((row: any[]) => { salesMap[row[0] as string] = row[1] as number; });

    const returnByDayRow = this.db.exec(
      `SELECT sr.date, SUM(sr.total_amount) / 100.0 AS revenue 
       FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id 
       WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} 
       GROUP BY sr.date`,
      [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]
    );
    returnByDayRow[0]?.values.forEach((row: any[]) => {
      const date = row[0] as string;
      // FIX: Don't use Math.max(0, ...) - allow negative to show returns impact
      salesMap[date] = (salesMap[date] || 0) - (row[1] as number);
    });

    const profitByDay = new Map(profitData.dailyNetProfit.map(({ date, profit: dailyProfit }) => [date, dailyProfit]));

    const dailySalesData: DailySale[] = [];
    const periodStart = new Date(`${fromStr}T00:00:00`);
    const periodEnd = new Date(`${periodTo}T00:00:00`);
    for (const date = new Date(periodStart); date <= periodEnd; date.setDate(date.getDate() + 1)) {
      const key = format(date, 'yyyy-MM-dd');
      dailySalesData.push({
        day: format(date, 'dd/MM'),
        sales: salesMap[key] ?? 0,
        profit: profitByDay.get(key) ?? 0,
      });
    }

    // ===== TOP PRODUCTS =====
    // Use net revenue (total_price - returns) for consistency
    const topProductsRow = this.db.exec(
      `SELECT p.name, SUM(sii.quantity_m2) as qty, SUM(sii.total_price) / 100.0 as revenue, p.product_type, p.base_unit, p.custom_unit
       FROM sales_invoice_items sii 
       JOIN products p ON sii.product_id = p.id 
       JOIN sales_invoices si ON sii.invoice_id = si.id 
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} 
       GROUP BY p.id ORDER BY revenue DESC LIMIT 5`,
      [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]
    );
    const topProductsData: TopProduct[] = topProductsRow[0]?.values.map((row: any[]) => ({
      name: String(row[0]), qty: Number(row[1]), revenue: Number(row[2]), productType: String(row[3]) as 'CERAMIC' | 'GENERAL', baseUnit: String(row[4] || ''), customUnit: row[5] ? String(row[5]) : undefined,
    })) ?? [];

    // ===== RECENT INVOICES =====
    const recentInvRow = this.db.exec(
      `SELECT si.id, c.name, si.total_amount / 100.0 AS total_amount, si.date, si.payment_status 
       FROM sales_invoices si JOIN customers c ON si.customer_id = c.id 
       WHERE si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} 
       ORDER BY si.created_at DESC LIMIT 5`,
      salesScope.params.concat(salesCompanyScope.params)
    );
    const recentInvoicesData: RecentInvoice[] = recentInvRow[0]?.values.map((r: any[]) => ({
      id: String(r[0]), customer: String(r[1]), amount: Number(r[2]), date: String(r[3]), status: String(r[4]),
    })) ?? [];

    // ===== DEBT CUSTOMERS =====
    const debtCustRow = this.db.exec(
      `SELECT c.name, SUM(si.remaining_amount) / 100.0 AS current_balance 
       FROM sales_invoices si JOIN customers c ON c.id = si.customer_id 
       WHERE si.remaining_amount > 0 AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} 
       GROUP BY c.id ORDER BY current_balance DESC LIMIT 5`,
      salesScope.params.concat(salesCompanyScope.params)
    );
    const debtCustomersData: DebtCustomer[] = debtCustRow[0]?.values.map((r: any[]) => ({ name: String(r[0]), debt: Number(r[1]) })) ?? [];

    // ===== BRANCH DATA =====
    const allAuthorizedBranchesScope = this.branchAccess.sqlScope('si.branch_id', undefined, actor, true);
    const branchRow = this.db.exec(
      `SELECT b.name, COALESCE(SUM(si.total_amount), 0) / 100.0 
       FROM branches b JOIN sales_invoices si ON si.branch_id = b.id 
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${allAuthorizedBranchesScope.clause} AND ${salesCompanyScope.clause} 
       GROUP BY b.id HAVING COALESCE(SUM(si.total_amount), 0) / 100.0 > 0 ORDER BY 2 DESC`,
      [fromStr, periodTo, ...allAuthorizedBranchesScope.params, ...salesCompanyScope.params]
    );
    const branchDataList = branchRow[0]?.values.map((r: any[]) => ({ name: String(r[0]), value: Number(r[1]) })) ?? [];

    // ===== UNIFIED LOW STOCK CALCULATION =====
    // Per product+warehouse, compared to product min_stock_level
    const lowStockRow = this.db.exec(
      `SELECT p.name, w.name as warehouse, COALESCE(ws.quantity_m2, 0) as qty, p.min_stock_level, p.product_type, p.base_unit, p.custom_unit
       FROM warehouse_stock ws 
       JOIN products p ON ws.product_id = p.id 
       JOIN warehouses w ON w.id = ws.warehouse_id 
       WHERE p.is_active = 1 AND p.min_stock_level > 0 AND ws.quantity_m2 <= p.min_stock_level AND ${warehouseScope.clause} 
       ORDER BY ws.quantity_m2 ASC LIMIT 8`,
      warehouseScope.params
    );
    const lowStockData: LowStockItem[] = lowStockRow[0]?.values.map((r: any[]) => ({
      name: String(r[0]), warehouse: String(r[1]), qty: Number(r[2]), min: Number(r[3]), productType: String(r[4]) as 'CERAMIC' | 'GENERAL', baseUnit: String(r[5] || ''), customUnit: r[6] ? String(r[6]) : undefined,
    })) ?? [];

    return {
      total, profit, totalDebt, totalPurchases, totalReceived, invoiceCount, salesTrend, margin,
      dailySalesData, topProductsData, recentInvoicesData, debtCustomersData, branchDataList, lowStockData,
    };
  }

  /**
   * Get overview dashboard data with unified metric definitions
   */
  async getOverviewDashboardData(): Promise<OverviewDashboardData> {
    this.clearPartialErrors();
    
    const actor = AuthService.requireAuth();
    
    // Check permissions (match DashboardPage PULSE_ACCESS)
    PermissionService.require(actor, 'sales.view', '/sales');
    PermissionService.require(actor, 'purchases.view', '/purchases');
    PermissionService.require(actor, 'finance.view', '/finance');
    PermissionService.require(actor, 'customers.view', '/customers');
    PermissionService.require(actor, 'inventory.view', '/inventory');

    // Use AccountingService for core metrics but handle FIFO errors gracefully
    let metrics: DashboardMetrics | null = null;
    let chartData: SalesTrendPoint[] = [];
    let topProducts: TopSellingProduct[] = [];
    let monthlyComparison: MonthlyComparison | null = null;
    let topCustomers: TopCustomerItem[] = [];
    let categorySales: CategoryDistributionItem[] = [];
    let gradeSales: { grade: string; quantityM2: number; totalRevenue: number }[] = [];
    let paymentDistribution: PaymentDistributionItem[] = [];
    let recentActivities: RecentActivityItem[] = [];

    try {
      metrics = await this.accountingService.getDashboardMetricsAsync();
    } catch (e) {
      this.addPartialError('metrics', e as Error);
      // Metrics will be null, UI should show "غير متاح" for valuation
    }

    try {
      chartData = await this.accountingService.getSalesTrendLast7DaysAsync();
    } catch (e) {
      this.addPartialError('chartData', e as Error);
    }

    try {
      topProducts = await this.accountingService.getTopSellingProductsAsync(5);
    } catch (e) {
      this.addPartialError('topProducts', e as Error);
    }

    try {
      monthlyComparison = await this.accountingService.getMonthlyComparisonAsync();
    } catch (e) {
      this.addPartialError('monthlyComparison', e as Error);
    }

    try {
      topCustomers = (await this.accountingService.getTopCustomersAsync(5)).map((customer) => ({
        name: customer.name,
        totalAmount: customer.totalPurchases,
        invoiceCount: customer.purchaseCount,
      }));
    } catch (e) {
      this.addPartialError('topCustomers', e as Error);
    }

    try {
      const categories = new Map<string, number>();
      (await this.accountingService.getCategorySalesReportAsync()).forEach((category) => {
        categories.set(category.categoryName, (categories.get(category.categoryName) || 0) + category.totalRevenue);
      });
      categorySales = [...categories.entries()].map(([name, value]) => ({ name, value }));
    } catch (e) {
      this.addPartialError('categorySales', e as Error);
    }

    try {
      gradeSales = await this.accountingService.getSalesByGradeAsync();
    } catch (e) {
      this.addPartialError('gradeSales', e as Error);
    }

    try {
      paymentDistribution = (await this.accountingService.getPaymentMethodDistributionAsync()).map((payment) => ({
        method: this.translatePaymentMethod(payment.method),
        amount: payment.totalAmount,
        count: payment.count,
      }));
    } catch (e) {
      this.addPartialError('paymentDistribution', e as Error);
    }

    try {
      recentActivities = (await this.accountingService.getRecentActivitiesAsync(6)).map(a => ({
        type: a.type,
        description: a.description,
        amount: a.amount,
        timestamp: this.formatActivityTimestamp(a.timestamp),
      }));
    } catch (e) {
      this.addPartialError('recentActivities', e as Error);
    }

    // Today's purchases
    let todayPurchases: OverviewDashboardData['todayPurchases'] = null;
    const purchasesLoading = false;
    let purchasesError = null as string | null;
    let purchaseHourly: PurchaseHourlyBucket[] = [];
    let purchasePeakHour = 0;
    let purchasePaymentMix: PurchasePaymentMixItem[] = [];
    let purchaseTopSuppliers: PurchaseTopSupplier[] = [];
    let purchaseTopItems: PurchaseTopItem[] = [];
    let purchaseQuantitiesByUnit: [string, number][] = [];

    try {
      if (PermissionService.can(AuthService.getCurrentUser(), 'purchases.view')) {
        const dailyOps = await import('../operations/DailyOperationsService').then(m => new m.DailyOperationsService());
        todayPurchases = dailyOps.getPurchases();
        purchasesError = null;
      }
    } catch (error: any) {
      todayPurchases = null;
      purchasesError = error?.message || 'تعذر تحميل مؤشرات مشتريات اليوم';
    }

    if (todayPurchases) {
      const { getProductUnitLabel } = await import('../../../utils/products/productUnits');
      
      purchaseHourly = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));
      todayPurchases.rows.forEach((row) => {
        const date = new Date(row.createdAt);
        if (Number.isNaN(date.getTime())) return;
        purchaseHourly[date.getHours()].total += Number(row.total) || 0;
        purchaseHourly[date.getHours()].count += 1;
      });

      purchasePeakHour = Math.max(...purchaseHourly.map((bucket) => bucket.total), 0);

      const mix = new Map<string, { total: number; count: number }>();
      todayPurchases.rows.forEach((row) => {
        const key = row.paymentType || 'CASH';
        const entry = mix.get(key) || { total: 0, count: 0 };
        entry.total += Number(row.total) || 0;
        entry.count += 1;
        mix.set(key, entry);
      });
      purchasePaymentMix = [...mix.entries()]
        .map(([method, values]) => ({ method: this.translatePaymentMethod(method), ...values }))
        .sort((a, b) => b.total - a.total);

      const suppliers = new Map<string, { name: string; total: number; paid: number; count: number }>();
      todayPurchases.rows.forEach((row) => {
        const key = row.supplierId || row.supplierName || 'unknown';
        const supplier = suppliers.get(key) || { name: row.supplierName || '—', total: 0, paid: 0, count: 0 };
        supplier.total += Number(row.total) || 0;
        supplier.paid += Number(row.paid) || 0;
        supplier.count += 1;
        suppliers.set(key, supplier);
      });
      purchaseTopSuppliers = [...suppliers.values()].sort((a, b) => b.total - a.total).slice(0, 4);

      const products = new Map<string, { name: string; quantity: number; total: number; invoices: Set<string>; productType?: 'CERAMIC' | 'GENERAL'; baseUnit?: string; customUnit?: string }>();
      todayPurchases.items.forEach((item) => {
        const key = item.productId || item.productName;
        const product = products.get(key) || { name: item.productName || '—', quantity: 0, total: 0, invoices: new Set<string>(), productType: item.productType, baseUnit: item.baseUnit, customUnit: item.customUnit };
        product.quantity += Number(item.quantityM2) || 0;
        product.total += Number(item.totalCost) || 0;
        product.invoices.add(item.purchaseId);
        products.set(key, product);
      });
      purchaseTopItems = [...products.values()].sort((a, b) => b.total - a.total).slice(0, 4);

      const quantities = new Map<string, number>();
      todayPurchases.items.forEach((item) => {
        const unit = getProductUnitLabel(item);
        quantities.set(unit, (quantities.get(unit) || 0) + (Number(item.quantityM2) || 0));
      });
      purchaseQuantitiesByUnit = [...quantities.entries()];
    }

    return {
      metrics,
      chartData,
      topProducts,
      monthlyComparison,
      topCustomers,
      categorySales,
      gradeSales,
      paymentDistribution,
      recentActivities,
      todayPurchases,
      purchasesLoading,
      purchasesError,
      purchaseHourly,
      purchasePeakHour,
      purchasePaymentMix,
      purchaseTopSuppliers,
      purchaseTopItems,
      purchaseQuantitiesByUnit,
    };
  }

  /**
   * Get partial errors for UI display
   */
  getErrors(): PartialDataError[] {
    return this.getPartialErrors();
  }

  /**
   * Translate payment method to Arabic
   */
  private translatePaymentMethod(method: string): string {
    const translations: Record<string, string> = {
      'CASH': 'نقدي',
      'CARD': 'بطاقة',
      'BANK_TRANSFER': 'تحويل بنكي',
      'CHECK': 'شيك',
      'VOUCHER': 'قسيمة',
    };
    return translations[method] ?? method;
  }

  /**
   * Format activity timestamp for display
   */
  private formatActivityTimestamp(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return timestamp;
      return new Intl.DateTimeFormat('ar-EG', { 
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(date);
    } catch {
      return timestamp;
    }
  }

  /**
   * Get date range for a period
   */
  static getRangeDates(range: 'today' | 'week' | 'month' | 'year'): { from: Date; to: Date } {
    const now = new Date();
    switch (range) {
      case 'today': return { from: startOfDay(now), to: endOfDay(now) };
      case 'week': return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
      case 'month': return { from: startOfMonth(now), to: endOfMonth(now) };
      case 'year': return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
    }
  }

  /**
   * Format currency for display
   */
  static formatCurrency(value: number): string {
    return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(value || 0);
  }
}

// Singleton instance
export const dashboardMetricsService = new DashboardMetricsService();