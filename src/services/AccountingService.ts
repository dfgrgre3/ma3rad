import { DatabaseManager } from '../database/db';
import { localDateString } from '../utils/date';

export interface DashboardMetrics {
  todaySales: number;
  monthSales: number;
  todayPurchases: number;
  todayExpenses: number;
  grossProfit: number;
  netProfit: number;
  totalReceivables: number; // ديون العملاء
  totalPayables: number; // مستحقات الموردين
  inventoryValuationCost: number; // قيمة المخزون بسعر الشراء
  inventoryValuationSale: number; // قيمة المخزون بسعر البيع
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

export class AccountingService {
  private db = DatabaseManager.getInstance();

  public getDashboardMetrics(): DashboardMetrics {
    const today = localDateString();
    const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

    // Previous month for comparison
    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMonthStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const prevMonthEnd = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate()}`;

    // 1. Sales metrics
    const salesStats = this.db.query<any>(`
      SELECT 
        SUM(CASE WHEN date = ? THEN total_amount ELSE 0 END) as todaySales,
        SUM(CASE WHEN date >= ? THEN total_amount ELSE 0 END) as monthSales,
        SUM(CASE WHEN date >= ? THEN gross_profit ELSE 0 END) as monthGrossProfit,
        COUNT(CASE WHEN date = ? THEN 1 END) as todaySalesCount
      FROM sales_invoices
      WHERE invoice_status != 'VOID'
    `, [today, monthStart, monthStart, today])[0] || {};

    // Previous month sales for growth rate
    const prevMonthSales = this.db.query<any>(`
      SELECT SUM(total_amount) as sales
      FROM sales_invoices
      WHERE date >= ? AND date <= ? AND invoice_status != 'VOID'
    `, [prevMonthStart, prevMonthEnd])[0]?.sales || 0;

    // 2. Purchases metrics
    const purchaseStats = this.db.query<any>(`
      SELECT SUM(CASE WHEN date = ? THEN total_amount ELSE 0 END) as todayPurchases
      FROM purchase_invoices
    `, [today])[0] || {};

    // 3. Expenses metrics
    const expenseStats = this.db.query<any>(`
      SELECT 
        SUM(CASE WHEN date = ? THEN amount ELSE 0 END) as todayExpenses,
        SUM(CASE WHEN date >= ? THEN amount ELSE 0 END) as monthExpenses
      FROM expenses
    `, [today, monthStart])[0] || {};

    // 4. Receivables (Customer debts)
    const customerDebts = this.db.query<any>(`
      SELECT SUM(current_balance) as totalReceivables FROM customers WHERE current_balance > 0
    `)[0]?.totalReceivables || 0;

    // Urgent debts (debts > 30 days old or high amounts)
    const urgentDebts = this.db.query<any>(`
      SELECT COUNT(*) as count
      FROM customers
      WHERE current_balance > 0 AND (current_balance > 50000 OR credit_limit > 0)
    `)[0]?.count || 0;

    // 5. Payables (Supplier dues)
    const supplierPayables = this.db.query<any>(`
      SELECT SUM(current_balance) as totalPayables FROM suppliers WHERE current_balance > 0
    `)[0]?.totalPayables || 0;

    // 6. Inventory Valuation
    const invStats = this.db.query<any>(`
      SELECT 
        SUM(ws.quantity_m2 * p.cost_price) as valuationCost,
        SUM(ws.quantity_m2 * p.selling_price_m2) as valuationSale,
        COUNT(CASE WHEN ws.quantity_m2 <= p.min_stock_level AND ws.quantity_m2 > 0 THEN 1 END) as lowStock,
        COUNT(CASE WHEN ws.quantity_m2 <= 0 THEN 1 END) as outOfStock
      FROM warehouse_stock ws
      JOIN products p ON ws.product_id = p.id
      WHERE p.is_active = 1
    `)[0] || {};

    // 7. Top customer
    const topCustomer = this.db.query<any>(`
      SELECT name, total_purchases
      FROM customers
      WHERE total_purchases > 0
      ORDER BY total_purchases DESC
      LIMIT 1
    `)[0] || null;

    const monthGross = salesStats.monthGrossProfit || 0;
    const monthExp = expenseStats.monthExpenses || 0;
    const monthNet = monthGross - monthExp;
    const monthSales = salesStats.monthSales || 0;

    // Calculate growth rate
    const salesGrowthRate = prevMonthSales > 0
      ? Number(((monthSales - prevMonthSales) / prevMonthSales * 100).toFixed(1))
      : 0;

    // Calculate profit margin
    const profitMargin = monthSales > 0
      ? Number((monthNet / monthSales * 100).toFixed(1))
      : 0;

    // Calculate average order value
    const averageOrderValue = salesStats.todaySalesCount > 0
      ? Number((salesStats.todaySales / salesStats.todaySalesCount).toFixed(2))
      : 0;

    return {
      todaySales: Number((salesStats.todaySales || 0).toFixed(2)),
      monthSales: Number(monthSales.toFixed(2)),
      todayPurchases: Number((purchaseStats.todayPurchases || 0).toFixed(2)),
      todayExpenses: Number((expenseStats.todayExpenses || 0).toFixed(2)),
      grossProfit: Number(monthGross.toFixed(2)),
      netProfit: Number(monthNet.toFixed(2)),
      totalReceivables: Number(customerDebts.toFixed(2)),
      totalPayables: Number(supplierPayables.toFixed(2)),
      inventoryValuationCost: Number((invStats.valuationCost || 0).toFixed(2)),
      inventoryValuationSale: Number((invStats.valuationSale || 0).toFixed(2)),
      lowStockCount: invStats.lowStock || 0,
      outOfStockCount: invStats.outOfStock || 0,
      salesCount: salesStats.todaySalesCount || 0,
      previousMonthSales: Number(prevMonthSales.toFixed(2)),
      salesGrowthRate,
      profitMargin,
      averageOrderValue,
      topCustomer: topCustomer ? { name: topCustomer.name, totalPurchases: Number((topCustomer.total_purchases || 0).toFixed(2)) } : null,
      urgentDebtsCount: urgentDebts
    };
  }

  public getSalesTrendLast7Days(): { date: string; sales: number; profit: number }[] {
    const results: { date: string; sales: number; profit: number }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = localDateString(d);

      const row = this.db.query<any>(`
        SELECT SUM(total_amount) as sales, SUM(gross_profit) as profit
        FROM sales_invoices
        WHERE date = ? AND invoice_status != 'VOID'
      `, [dateStr])[0];

      results.push({
        date: dateStr,
        sales: Number((row?.sales || 0).toFixed(2)),
        profit: Number((row?.profit || 0).toFixed(2))
      });
    }

    return results;
  }

  public getTopSellingProducts(limit = 5): { name: string; quantityM2: number; totalRevenue: number }[] {
    return this.db.query<any>(`
      SELECT 
        p.name,
        SUM(sii.quantity_m2) as quantityM2,
        SUM(sii.total_price) as totalRevenue
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      WHERE si.invoice_status != 'VOID'
      GROUP BY p.id
      ORDER BY totalRevenue DESC
      LIMIT ?
    `, [limit]);
  }

  public getPurchaseReport(dateFrom?: string, dateTo?: string): {
    totalPurchases: number;
    totalPaid: number;
    totalRemaining: number;
    invoices: any[];
  } {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (dateFrom) {
      whereClause += ' AND pi.date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClause += ' AND pi.date <= ?';
      params.push(dateTo);
    }

    const invoices = this.db.query<any>(`
      SELECT pi.*, s.name as supplierName, w.name as warehouseName
      FROM purchase_invoices pi
      LEFT JOIN suppliers s ON pi.supplier_id = s.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      ${whereClause}
      ORDER BY pi.date DESC
    `, params);

    const totals = this.db.query<any>(`
      SELECT 
        SUM(total_amount) as totalPurchases,
        SUM(paid_amount) as totalPaid,
        SUM(remaining_amount) as totalRemaining
      FROM purchase_invoices pi
      ${whereClause}
    `, params)[0] || {};

    return {
      totalPurchases: Number((totals.totalPurchases || 0).toFixed(2)),
      totalPaid: Number((totals.totalPaid || 0).toFixed(2)),
      totalRemaining: Number((totals.totalRemaining || 0).toFixed(2)),
      invoices
    };
  }

  public getExpenseReport(dateFrom?: string, dateTo?: string): {
    totalExpenses: number;
    byCategory: { category: string; total: number }[];
    expenses: any[];
  } {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (dateFrom) {
      whereClause += ' AND e.date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClause += ' AND e.date <= ?';
      params.push(dateTo);
    }

    const expenses = this.db.query<any>(`
      SELECT e.*, u.full_name as performedByName
      FROM expenses e
      LEFT JOIN users u ON e.performed_by = u.id
      ${whereClause}
      ORDER BY e.date DESC
    `, params);

    const byCategory = this.db.query<any>(`
      SELECT e.category, SUM(e.amount) as total
      FROM expenses e
      ${whereClause}
      GROUP BY e.category
      ORDER BY total DESC
    `, params);

    const totalResult = this.db.query<any>(`
      SELECT SUM(amount) as totalExpenses
      FROM expenses e
      ${whereClause}
    `, params)[0] || {};

    return {
      totalExpenses: Number((totalResult.totalExpenses || 0).toFixed(2)),
      byCategory,
      expenses
    };
  }

  public getProfitAndLossReport(dateFrom?: string, dateTo?: string): {
    revenue: number;
    costOfGoodsSold: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    margin: number;
  } {
    let salesWhere = 'WHERE invoice_status != \'VOID\'';
    let expenseWhere = 'WHERE 1=1';
    const salesParams: any[] = [];
    const expenseParams: any[] = [];

    if (dateFrom) {
      salesWhere += ' AND date >= ?';
      expenseWhere += ' AND date >= ?';
      salesParams.push(dateFrom);
      expenseParams.push(dateFrom);
    }
    if (dateTo) {
      salesWhere += ' AND date <= ?';
      expenseWhere += ' AND date <= ?';
      salesParams.push(dateTo);
      expenseParams.push(dateTo);
    }

    const salesResult = this.db.query<any>(`
      SELECT 
        SUM(total_amount) as revenue,
        SUM(total_cost) as cogs,
        SUM(gross_profit) as grossProfit
      FROM sales_invoices
      ${salesWhere}
    `, salesParams)[0] || {};

    const expenseResult = this.db.query<any>(`
      SELECT SUM(amount) as totalExpenses
      FROM expenses
      ${expenseWhere}
    `, expenseParams)[0] || {};

    const revenue = Number((salesResult.revenue || 0).toFixed(2));
    const costOfGoodsSold = Number((salesResult.cogs || 0).toFixed(2));
    const grossProfit = Number((salesResult.grossProfit || 0).toFixed(2));
    const expenses = Number((expenseResult.totalExpenses || 0).toFixed(2));
    const netProfit = Number((grossProfit - expenses).toFixed(2));
    const margin = revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(1)) : 0;

    return { revenue, costOfGoodsSold, grossProfit, expenses, netProfit, margin };
  }

  public getCategorySalesReport(dateFrom?: string, dateTo?: string): { categoryName: string; quantityM2: number; totalRevenue: number; profit: number }[] {
    let whereClause = 'WHERE si.invoice_status != \'VOID\'';
    const params: any[] = [];

    if (dateFrom) {
      whereClause += ' AND si.date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClause += ' AND si.date <= ?';
      params.push(dateTo);
    }

    return this.db.query<any>(`
      SELECT 
        c.name as categoryName,
        SUM(sii.quantity_m2) as quantityM2,
        SUM(sii.total_price) as totalRevenue,
        SUM(sii.profit) as profit
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      ${whereClause}
      GROUP BY c.id, c.name
      ORDER BY totalRevenue DESC
    `, params);
  }

  public getBrandSalesReport(dateFrom?: string, dateTo?: string): { brandName: string; quantityM2: number; totalRevenue: number; profit: number }[] {
    let whereClause = 'WHERE si.invoice_status != \'VOID\'';
    const params: any[] = [];

    if (dateFrom) {
      whereClause += ' AND si.date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClause += ' AND si.date <= ?';
      params.push(dateTo);
    }

    return this.db.query<any>(`
      SELECT 
        b.name as brandName,
        SUM(sii.quantity_m2) as quantityM2,
        SUM(sii.total_price) as totalRevenue,
        SUM(sii.profit) as profit
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      ${whereClause}
      GROUP BY b.id, b.name
      ORDER BY totalRevenue DESC
    `, params);
  }

  public getInventoryValuationReport(): {
    totalCostValue: number;
    totalSaleValue: number;
    byWarehouse: { warehouseName: string; costValue: number; saleValue: number; items: number }[];
  } {
    const byWarehouse = this.db.query<any>(`
      SELECT 
        w.name as warehouseName,
        SUM(ws.quantity_m2 * p.cost_price) as costValue,
        SUM(ws.quantity_m2 * p.selling_price_m2) as saleValue,
        COUNT(ws.id) as items
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      WHERE p.is_active = 1 AND ws.quantity_m2 > 0
      GROUP BY w.id, w.name
      ORDER BY costValue DESC
    `);

    const totals = this.db.query<any>(`
      SELECT 
        SUM(ws.quantity_m2 * p.cost_price) as totalCost,
        SUM(ws.quantity_m2 * p.selling_price_m2) as totalSale
      FROM warehouse_stock ws
      JOIN products p ON ws.product_id = p.id
      WHERE p.is_active = 1 AND ws.quantity_m2 > 0
    `)[0] || {};

    return {
      totalCostValue: Number((totals.totalCost || 0).toFixed(2)),
      totalSaleValue: Number((totals.totalSale || 0).toFixed(2)),
      byWarehouse
    };
  }

  // New methods for enhanced dashboard analytics
  public getMonthlyComparison(): {
    currentMonth: { sales: number; profit: number; invoices: number };
    previousMonth: { sales: number; profit: number; invoices: number };
  } {
    const now = new Date();
    const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMonthStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const prevMonthEnd = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate()}`;

    const current = this.db.query<any>(`
      SELECT 
        SUM(total_amount) as sales,
        SUM(gross_profit) as profit,
        COUNT(*) as invoices
      FROM sales_invoices
      WHERE date >= ? AND invoice_status != 'VOID'
    `, [currentMonthStart])[0] || {};

    const previous = this.db.query<any>(`
      SELECT 
        SUM(total_amount) as sales,
        SUM(gross_profit) as profit,
        COUNT(*) as invoices
      FROM sales_invoices
      WHERE date >= ? AND date <= ? AND invoice_status != 'VOID'
    `, [prevMonthStart, prevMonthEnd])[0] || {};

    return {
      currentMonth: {
        sales: Number((current.sales || 0).toFixed(2)),
        profit: Number((current.profit || 0).toFixed(2)),
        invoices: current.invoices || 0
      },
      previousMonth: {
        sales: Number((previous.sales || 0).toFixed(2)),
        profit: Number((previous.profit || 0).toFixed(2)),
        invoices: previous.invoices || 0
      }
    };
  }

  public getTopCustomers(limit = 5): { name: string; totalPurchases: number; purchaseCount: number }[] {
    return this.db.query<any>(`
      SELECT 
        c.name,
        SUM(si.total_amount) as totalPurchases,
        COUNT(DISTINCT si.id) as purchaseCount
      FROM customers c
      LEFT JOIN sales_invoices si ON c.id = si.customer_id AND si.invoice_status != 'VOID'
      GROUP BY c.id
      HAVING totalPurchases > 0
      ORDER BY totalPurchases DESC
      LIMIT ?
    `, [limit]);
  }

  public getPaymentMethodDistribution(): { method: string; count: number; totalAmount: number }[] {
    return this.db.query<any>(`
      SELECT 
        payment_type as method,
        COUNT(*) as count,
        SUM(total_amount) as totalAmount
      FROM sales_invoices
      WHERE invoice_status != 'VOID' AND date >= date('now', '-30 days')
      GROUP BY payment_type
      ORDER BY totalAmount DESC
    `);
  }

  public getSalesByGrade(): { grade: string; quantityM2: number; totalRevenue: number }[] {
    return this.db.query<any>(`
      SELECT 
        p.grade,
        SUM(sii.quantity_m2) as quantityM2,
        SUM(sii.total_price) as totalRevenue
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      WHERE si.invoice_status != 'VOID' AND si.date >= date('now', '-30 days')
      GROUP BY p.grade
      ORDER BY totalRevenue DESC
    `);
  }

  public getRecentActivities(limit = 10): {
    type: 'SALE' | 'PURCHASE' | 'STOCK' | 'PAYMENT';
    description: string;
    amount?: number;
    date: string;
  }[] {
    const activities: any[] = [];

    // Recent sales
    const sales = this.db.query<any>(`
      SELECT 'SALE' as type, 
        'فاتورة مبيعات #' || invoice_number as description,
        total_amount as amount,
        date
      FROM sales_invoices
      WHERE invoice_status != 'VOID'
      ORDER BY date DESC
      LIMIT 3
    `);

    // Recent purchases
    const purchases = this.db.query<any>(`
      SELECT 'PURCHASE' as type,
        'فاتورة توريد #' || invoice_number as description,
        total_amount as amount,
        date
      FROM purchase_invoices
      ORDER BY date DESC
      LIMIT 3
    `);

    // Recent stock movements
    const stocks = this.db.query<any>(`
      SELECT 'STOCK' as type,
        'حركة مخزون #' || transaction_number as description,
        NULL as amount,
        created_at as date
      FROM inventory_transactions
      ORDER BY created_at DESC
      LIMIT 2
    `);

    activities.push(...sales, ...purchases, ...stocks);
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return activities.slice(0, limit).map(a => ({
      type: a.type,
      description: a.description,
      amount: a.amount ? Number(a.amount.toFixed(2)) : undefined,
      date: a.date
    }));
  }
}
