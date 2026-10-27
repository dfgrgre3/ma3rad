import { DatabaseManager } from '../database/db';
import type { AnalyticsSnapshot, SalesAnalytics } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { round2 } from './financials';
import { localDateString } from '../utils/date';

type ProductRevenue = { productId: string; productName: string; quantity: number; revenue: number };
type CustomerSpent = { customerId: string; customerName: string; totalSpent: number; orderCount: number };
type DailySales = { date: string; amount: number; count: number };

type SalesAnalyticsTotals = {
  totalSales: number;
  totalProfit: number;
  productRevenue: Record<string, ProductRevenue>;
  customerSpent: Record<string, CustomerSpent>;
  salesByDay: Record<string, DailySales>;
};

export class AnalyticsService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  public getSalesAnalytics(dateFrom: string, dateTo: string): SalesAnalytics {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.view');

    const scope = this.branchAccess.sqlScope(
      'si.branch_id',
      '(SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id)',
      actor
    );

    const invoices = this.db.query<any>(`
      SELECT si.*, c.name as customerName
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status = 'COMPLETED'
        AND ${scope.clause}
      ORDER BY si.date ASC
    `, [dateFrom, dateTo, ...scope.params]);

    const saleItems = this.db.query<any>(`
      SELECT sii.*, p.name AS productName
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON si.id = sii.invoice_id
      JOIN products p ON p.id = sii.product_id
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status = 'COMPLETED'
        AND ${scope.clause}
      ORDER BY si.date ASC, sii.id ASC
    `, [dateFrom, dateTo, ...scope.params]);
    const saleItemsByInvoice = this.groupItemsByParent(saleItems, item => item.invoiceId);

    const totals: SalesAnalyticsTotals = {
      totalSales: invoices.reduce((sum: number, inv: any) =>
        sum + Number(inv.subtotal || 0) - Number(inv.discountAmount || 0), 0),
      totalProfit: 0,
      productRevenue: {},
      customerSpent: {},
      salesByDay: {},
    };
    const totalOrders = invoices.length;
    this.aggregateInvoices(invoices, saleItemsByInvoice, totals);

    const returns = this.db.query<any>(`
      SELECT sr.*, si.total_amount AS invoiceTotal, si.tax_amount AS invoiceTax,
        c.name AS customerName
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      LEFT JOIN customers c ON c.id = sr.customer_id
      WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status = 'COMPLETED'
        AND ${scope.clause}
      ORDER BY sr.date ASC
    `, [dateFrom, dateTo, ...scope.params]);

    const returnItems = this.db.query<any>(`
      SELECT sri.*, p.name AS productName
      FROM sales_return_items sri
      JOIN sales_returns sr ON sr.id = sri.return_id
      JOIN products p ON p.id = sri.product_id
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status = 'COMPLETED'
        AND ${scope.clause}
      ORDER BY sr.date ASC, sri.id ASC
    `, [dateFrom, dateTo, ...scope.params]);
    const returnItemsByReturn = this.groupItemsByParent(returnItems, item => item.returnId);
    this.aggregateReturns(returns, returnItemsByReturn, totals);

    totals.totalSales = round2(totals.totalSales);
    const averageOrderValue = totalOrders > 0 ? round2(totals.totalSales / totalOrders) : 0;

    const topProducts = Object.values(totals.productRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const topCustomers = Object.values(totals.customerSpent)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    const periodLabel = `${dateFrom} إلى ${dateTo}`;

    return {
      period: periodLabel,
      totalSales: totals.totalSales,
      totalOrders,
      averageOrderValue,
      totalProfit: round2(totals.totalProfit),
      topProducts,
      topCustomers,
      salesByDay: Object.values(totals.salesByDay).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  private groupItemsByParent<T>(items: T[], getParentId: (item: T) => string): Map<string, T[]> {
    const grouped = new Map<string, T[]>();
    for (const item of items) {
      const parentId = getParentId(item);
      const group = grouped.get(parentId) || [];
      group.push(item);
      grouped.set(parentId, group);
    }
    return grouped;
  }

  private aggregateInvoices(invoices: any[], itemsByInvoice: Map<string, any[]>, totals: SalesAnalyticsTotals): void {
    for (const invoice of invoices) {
      const invoiceRevenue = Number(invoice.subtotal || 0) - Number(invoice.discountAmount || 0);
      this.addDailySales(totals, invoice.date, invoiceRevenue, 1);
      this.addCustomerSpend(totals, invoice.customerId, invoice.customerName, invoiceRevenue, 1);

      for (const item of itemsByInvoice.get(invoice.id) || []) {
        this.aggregateInvoiceItem(invoice, item, totals);
      }
    }
  }

  private aggregateInvoiceItem(invoice: any, item: any, totals: SalesAnalyticsTotals): void {
    const quantity = Number(item.quantityM2 || 0);
    const lineRevenue = Number(item.totalPrice || 0);
    const subtotal = Number(invoice.subtotal || 0);
    const discountShare = subtotal > 0
      ? Number(invoice.discountAmount || 0) * lineRevenue / subtotal
      : 0;
    const revenue = lineRevenue - discountShare;
    totals.totalProfit += revenue - Number(item.unitCost || 0) * quantity;
    this.addProductRevenue(totals, item.productId, item.productName, quantity, revenue);
  }

  private aggregateReturns(returns: any[], itemsByReturn: Map<string, any[]>, totals: SalesAnalyticsTotals): void {
    for (const salesReturn of returns) {
      const returnedAmount = Number(salesReturn.totalAmount || 0);
      const invoiceTotal = Number(salesReturn.invoiceTotal || 0);
      const taxReduction = invoiceTotal > 0
        ? round2(returnedAmount * Number(salesReturn.invoiceTax || 0) / invoiceTotal)
        : 0;
      const netReturnedRevenue = returnedAmount - taxReduction;

      totals.totalSales -= netReturnedRevenue;
      this.addDailySales(totals, salesReturn.date, -netReturnedRevenue, 0);
      this.addCustomerSpend(
        totals,
        salesReturn.customerId,
        salesReturn.customerName || 'غير معروف',
        -netReturnedRevenue,
        0,
      );

      for (const item of itemsByReturn.get(salesReturn.id) || []) {
        this.aggregateReturnItem(item, returnedAmount, taxReduction, totals);
      }
    }
  }

  private aggregateReturnItem(item: any, returnedAmount: number, taxReduction: number, totals: SalesAnalyticsTotals): void {
    const itemRefund = Number(item.totalRefund || 0);
    const itemTaxReduction = returnedAmount > 0
      ? round2(taxReduction * itemRefund / returnedAmount)
      : 0;
    const netRevenue = itemRefund - itemTaxReduction;
    const quantity = Number(item.quantityM2 || 0);
    totals.totalProfit += Number(item.unitCost || 0) * quantity - netRevenue;
    this.addProductRevenue(totals, item.productId, item.productName, -quantity, -netRevenue);
  }

  private addDailySales(totals: SalesAnalyticsTotals, date: string, amount: number, count: number): void {
    if (!totals.salesByDay[date]) totals.salesByDay[date] = { date, amount: 0, count: 0 };
    totals.salesByDay[date].amount += amount;
    totals.salesByDay[date].count += count;
  }

  private addCustomerSpend(
    totals: SalesAnalyticsTotals,
    customerId: string,
    customerName: string,
    amount: number,
    orderCount: number,
  ): void {
    if (!totals.customerSpent[customerId]) {
      totals.customerSpent[customerId] = { customerId, customerName, totalSpent: 0, orderCount: 0 };
    }
    totals.customerSpent[customerId].totalSpent += amount;
    totals.customerSpent[customerId].orderCount += orderCount;
  }

  private addProductRevenue(
    totals: SalesAnalyticsTotals,
    productId: string,
    productName: string,
    quantity: number,
    revenue: number,
  ): void {
    if (!totals.productRevenue[productId]) {
      totals.productRevenue[productId] = { productId, productName, quantity: 0, revenue: 0 };
    }
    totals.productRevenue[productId].quantity += quantity;
    totals.productRevenue[productId].revenue += revenue;
  }

  public recordSnapshot(metricName: string, metricValue: number, periodStart: string, periodEnd: string, dimension?: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'analytics.write');

    const id = `an_${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();
    this.db.run(`
      INSERT INTO analytics_snapshots (id, metric_name, metric_value, dimension, period_start, period_end, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, metricName, metricValue, dimension || null, periodStart, periodEnd, now]);
  }

  public getSnapshots(metricName: string, periodStart: string, periodEnd: string): AnalyticsSnapshot[] {
    return this.db.query<AnalyticsSnapshot>(`
      SELECT * FROM analytics_snapshots
      WHERE metric_name = ? AND period_start >= ? AND period_end <= ?
      ORDER BY created_at DESC
    `, [metricName, periodStart, periodEnd]);
  }

  public getDashboardMetrics(): Array<{ name: string; value: number; label: string; trend: 'up' | 'down' | 'stable' }> {
    const actor = AuthService.requireAuth();
    const today = localDateString();
    const monthStartStr = `${today.slice(0, 7)}-01`;
    const scope = this.branchAccess.sqlScope(
      'si.branch_id',
      '(SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id)',
      actor
    );

    const totalSalesToday = this.db.query<any>(`
      SELECT
        COALESCE((SELECT SUM(si.subtotal - si.discount_amount) FROM sales_invoices si
          WHERE si.date = ? AND si.invoice_status != 'VOID' AND ${scope.clause}), 0)
        - COALESCE((SELECT SUM(sr.total_amount - CASE WHEN si.total_amount > 0
            THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2)
            ELSE 0 END) FROM sales_returns sr
          JOIN sales_invoices si ON si.id = sr.original_invoice_id
          WHERE sr.date = ? AND si.invoice_status != 'VOID' AND ${scope.clause}), 0) AS total
    `, [today, ...scope.params, today, ...scope.params])[0]?.total || 0;

    const totalSalesMonth = this.db.query<any>(`
      SELECT
        COALESCE((SELECT SUM(si.subtotal - si.discount_amount) FROM sales_invoices si
          WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}), 0)
        - COALESCE((SELECT SUM(sr.total_amount - CASE WHEN si.total_amount > 0
            THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2)
            ELSE 0 END) FROM sales_returns sr
          JOIN sales_invoices si ON si.id = sr.original_invoice_id
          WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}), 0) AS total
    `, [monthStartStr, today, ...scope.params, monthStartStr, today, ...scope.params])[0]?.total || 0;

    const totalCustomers = this.db.query<any>('SELECT COUNT(*) as cnt FROM customers')[0]?.cnt || 0;
    const totalProducts = this.db.query<any>("SELECT COUNT(*) as cnt FROM products WHERE is_active = 1")[0]?.cnt || 0;

    return [
      { name: 'المبيعات اليوم', value: Number(totalSalesToday), label: 'ج.م', trend: 'up' },
      { name: 'المبيعات هذا الشهر', value: Number(totalSalesMonth), label: 'ج.م', trend: 'up' },
      { name: 'إجمالي العملاء', value: Number(totalCustomers), label: 'عميل', trend: 'stable' },
      { name: 'الأصناف النشطة', value: Number(totalProducts), label: 'صنف', trend: 'stable' },
    ];
  }
}
