import { DatabaseManager } from '../database/db';
import type { AnalyticsSnapshot, SalesAnalytics } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { round2 } from './financials';
import { localDateString } from '../utils/date';

export class AnalyticsService {
  private db = DatabaseManager.getInstance();

  public getSalesAnalytics(dateFrom: string, dateTo: string): SalesAnalytics {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.view');

    const invoices = this.db.query<any>(`
      SELECT si.*, c.name as customerName
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status = 'COMPLETED'
      ORDER BY si.date ASC
    `, [dateFrom, dateTo]);

    const saleItemsByInvoice = new Map<string, any[]>();
    const saleItems = this.db.query<any>(`
      SELECT sii.*, p.name AS productName
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON si.id = sii.invoice_id
      JOIN products p ON p.id = sii.product_id
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status = 'COMPLETED'
      ORDER BY si.date ASC, sii.id ASC
    `, [dateFrom, dateTo]);
    for (const item of saleItems) {
      const list = saleItemsByInvoice.get(item.invoiceId) || [];
      list.push(item);
      saleItemsByInvoice.set(item.invoiceId, list);
    }

    let totalSales = invoices.reduce((sum: number, inv: any) =>
      sum + Number(inv.subtotal || 0) - Number(inv.discountAmount || 0), 0);
    const totalOrders = invoices.length;
    let totalProfit = 0;

    const productRevenue: Record<string, { productId: string; productName: string; quantity: number; revenue: number }> = {};
    const customerSpent: Record<string, { customerId: string; customerName: string; totalSpent: number; orderCount: number }> = {};
    const salesByDay: Record<string, { date: string; amount: number; count: number }> = {};

    for (const inv of invoices) {
      const date = inv.date;
      if (!salesByDay[date]) salesByDay[date] = { date, amount: 0, count: 0 };
      const invoiceRevenue = Number(inv.subtotal || 0) - Number(inv.discountAmount || 0);
      salesByDay[date].amount += invoiceRevenue;
      salesByDay[date].count += 1;

      const custId = inv.customerId;
      if (!customerSpent[custId]) {
        customerSpent[custId] = { customerId: custId, customerName: inv.customerName, totalSpent: 0, orderCount: 0 };
      }
      customerSpent[custId].totalSpent += invoiceRevenue;
      customerSpent[custId].orderCount += 1;

      const items = saleItemsByInvoice.get(inv.id) || [];

      for (const item of items) {
        const qty = Number(item.quantityM2 || 0);
        const lineRevenue = Number(item.totalPrice || 0);
        const headerDiscountShare = Number(inv.subtotal || 0) > 0
          ? Number(inv.discountAmount || 0) * lineRevenue / Number(inv.subtotal)
          : 0;
        const revenue = lineRevenue - headerDiscountShare;
        const cost = Number(item.unitCost || 0) * qty;
        totalProfit += revenue - cost;

        const pid = item.productId;
        if (!productRevenue[pid]) {
          productRevenue[pid] = { productId: pid, productName: item.productName, quantity: 0, revenue: 0 };
        }
        productRevenue[pid].quantity += qty;
        productRevenue[pid].revenue += revenue;
      }
    }

    const returns = this.db.query<any>(`
      SELECT sr.*, si.total_amount AS invoiceTotal, si.tax_amount AS invoiceTax,
        c.name AS customerName
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      LEFT JOIN customers c ON c.id = sr.customer_id
      WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status = 'COMPLETED'
      ORDER BY sr.date ASC
    `, [dateFrom, dateTo]);

    const returnItemsByReturn = new Map<string, any[]>();
    const returnItems = this.db.query<any>(`
      SELECT sri.*, p.name AS productName
      FROM sales_return_items sri
      JOIN sales_returns sr ON sr.id = sri.return_id
      JOIN products p ON p.id = sri.product_id
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status = 'COMPLETED'
      ORDER BY sr.date ASC, sri.id ASC
    `, [dateFrom, dateTo]);
    for (const item of returnItems) {
      const list = returnItemsByReturn.get(item.returnId) || [];
      list.push(item);
      returnItemsByReturn.set(item.returnId, list);
    }

    for (const salesReturn of returns) {
      const returnedAmount = Number(salesReturn.totalAmount || 0);
      const invoiceTotal = Number(salesReturn.invoiceTotal || 0);
      const taxReduction = invoiceTotal > 0
        ? round2(returnedAmount * Number(salesReturn.invoiceTax || 0) / invoiceTotal)
        : 0;
      const netReturnedRevenue = returnedAmount - taxReduction;
      totalSales -= netReturnedRevenue;

      const date = salesReturn.date;
      if (!salesByDay[date]) salesByDay[date] = { date, amount: 0, count: 0 };
      salesByDay[date].amount -= netReturnedRevenue;

      const customerId = salesReturn.customerId;
      if (!customerSpent[customerId]) {
        customerSpent[customerId] = {
          customerId,
          customerName: salesReturn.customerName || 'غير معروف',
          totalSpent: 0,
          orderCount: 0,
        };
      }
      customerSpent[customerId].totalSpent -= netReturnedRevenue;

      const items = returnItemsByReturn.get(salesReturn.id) || [];

      for (const item of items) {
        const itemRefund = Number(item.totalRefund || 0);
        const itemTaxReduction = returnedAmount > 0
          ? round2(taxReduction * itemRefund / returnedAmount)
          : 0;
        const netRevenue = itemRefund - itemTaxReduction;
        const quantity = Number(item.quantityM2 || 0);
        const returnedCost = Number(item.unitCost || 0) * quantity;
        totalProfit += returnedCost - netRevenue;

        const productId = item.productId;
        if (!productRevenue[productId]) {
          productRevenue[productId] = {
            productId,
            productName: item.productName,
            quantity: 0,
            revenue: 0,
          };
        }
        productRevenue[productId].quantity -= quantity;
        productRevenue[productId].revenue -= netRevenue;
      }
    }

    totalSales = round2(totalSales);
    const averageOrderValue = totalOrders > 0 ? round2(totalSales / totalOrders) : 0;

    const topProducts = Object.values(productRevenue)
      .sort((a: any, b: any) => b.revenue - a.revenue)
      .slice(0, 10);

    const topCustomers = Object.values(customerSpent)
      .sort((a: any, b: any) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    const periodLabel = `${dateFrom} إلى ${dateTo}`;

    return {
      period: periodLabel,
      totalSales,
      totalOrders,
      averageOrderValue,
      totalProfit: round2(totalProfit),
      topProducts,
      topCustomers,
      salesByDay: Object.values(salesByDay).sort((a: any, b: any) => a.date.localeCompare(b.date)),
    };
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
    const today = localDateString();
    const monthStartStr = `${today.slice(0, 7)}-01`;

    const totalSalesToday = this.db.query<any>(`
      SELECT
        COALESCE((SELECT SUM(subtotal - discount_amount) FROM sales_invoices
          WHERE date = ? AND invoice_status != 'VOID'), 0)
        - COALESCE((SELECT SUM(sr.total_amount - CASE WHEN si.total_amount > 0
            THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2)
            ELSE 0 END) FROM sales_returns sr
          JOIN sales_invoices si ON si.id = sr.original_invoice_id
          WHERE sr.date = ? AND si.invoice_status != 'VOID'), 0) AS total
    `, [today, today])[0]?.total || 0;

    const totalSalesMonth = this.db.query<any>(`
      SELECT
        COALESCE((SELECT SUM(subtotal - discount_amount) FROM sales_invoices
          WHERE date >= ? AND date <= ? AND invoice_status != 'VOID'), 0)
        - COALESCE((SELECT SUM(sr.total_amount - CASE WHEN si.total_amount > 0
            THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2)
            ELSE 0 END) FROM sales_returns sr
          JOIN sales_invoices si ON si.id = sr.original_invoice_id
          WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID'), 0) AS total
    `, [monthStartStr, today, monthStartStr, today])[0]?.total || 0;

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
