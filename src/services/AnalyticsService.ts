import { DatabaseManager } from '../database/db';
import type { AnalyticsSnapshot, SalesAnalytics } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { round2 } from './financials';

export class AnalyticsService {
  private db = DatabaseManager.getInstance();

  public getSalesAnalytics(dateFrom: string, dateTo: string): SalesAnalytics {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'reports.view');

    const invoices = this.db.query<any>(`
      SELECT si.*, c.name as customerName
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID'
      ORDER BY si.date ASC
    `, [dateFrom, dateTo]);

    const totalSales = round2(invoices.reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0));
    const totalOrders = invoices.length;
    const averageOrderValue = totalOrders > 0 ? round2(totalSales / totalOrders) : 0;

    // Calculate profit using cost from sale items
    let totalProfit = 0;
    const productRevenue: Record<string, { productId: string; productName: string; quantity: number; revenue: number }> = {};
    const customerSpent: Record<string, { customerId: string; customerName: string; totalSpent: number; orderCount: number }> = {};
    const salesByDay: Record<string, { date: string; amount: number; count: number }> = {};

    for (const inv of invoices) {
      const date = inv.date;
      if (!salesByDay[date]) salesByDay[date] = { date, amount: 0, count: 0 };
      salesByDay[date].amount += Number(inv.total_amount || 0);
      salesByDay[date].count += 1;

      const custId = inv.customer_id;
      if (!customerSpent[custId]) {
        customerSpent[custId] = { customerId: custId, customerName: inv.customerName, totalSpent: 0, orderCount: 0 };
      }
      customerSpent[custId].totalSpent += Number(inv.total_amount || 0);
      customerSpent[custId].orderCount += 1;

      const items = this.db.query<any>(`
        SELECT sii.*, p.name as productName
        FROM sales_invoice_items sii
        JOIN products p ON p.id = sii.product_id
        WHERE sii.invoice_id = ?
      `, [inv.id]);

      for (const item of items) {
        const qty = Number(item.quantity_m2 || 0);
        const revenue = Number(item.unit_price || 0) * qty;
        const cost = Number(item.unit_cost || 0) * qty;
        totalProfit += revenue - cost;

        const pid = item.product_id;
        if (!productRevenue[pid]) {
          productRevenue[pid] = { productId: pid, productName: item.productName, quantity: 0, revenue: 0 };
        }
        productRevenue[pid].quantity += qty;
        productRevenue[pid].revenue += revenue;
      }
    }

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
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().slice(0, 10);

    const totalSalesToday = this.db.query<any>(`
      SELECT COALESCE(SUM(total_amount), 0) as total FROM sales_invoices
      WHERE date = ? AND invoice_status != 'VOID'
    `, [today])[0]?.total || 0;

    const totalSalesMonth = this.db.query<any>(`
      SELECT COALESCE(SUM(total_amount), 0) as total FROM sales_invoices
      WHERE date >= ? AND invoice_status != 'VOID'
    `, [monthStartStr])[0]?.total || 0;

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