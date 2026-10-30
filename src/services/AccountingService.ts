import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { localDateString } from '../utils/date';

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

  public getDashboardMetrics(): DashboardMetrics {
    this.requireView('dashboard.view');
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

    // 1. Sales metrics (bounded up to today to exclude future-dated entries from MTD)
    const salesStats = this.db.query<any>(`
      SELECT 
        SUM(CASE WHEN si.date = ? THEN si.subtotal - si.discount_amount ELSE 0 END) as todaySales,
        SUM(CASE WHEN si.date >= ? AND si.date <= ? THEN si.subtotal - si.discount_amount ELSE 0 END) as monthSales,
        SUM(CASE WHEN si.date >= ? AND si.date <= ? THEN si.gross_profit ELSE 0 END) as monthGrossProfit,
        COUNT(CASE WHEN si.date = ? THEN 1 END) as todaySalesCount
      FROM sales_invoices si
      WHERE si.invoice_status != 'VOID' AND ${salesScope.clause}
    `, [today, monthStart, today, monthStart, today, today, ...salesScope.params])[0] || {};

    const returnStats = this.db.query<any>(`
      SELECT
        SUM(CASE WHEN sr.date = ? THEN sr.total_amount - CASE WHEN si.total_amount > 0
          THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2) ELSE 0 END ELSE 0 END) AS todayReturns,
        SUM(CASE WHEN sr.date >= ? AND sr.date <= ? THEN sr.total_amount - CASE WHEN si.total_amount > 0
          THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2) ELSE 0 END ELSE 0 END) AS monthReturns,
        SUM(CASE WHEN sr.date >= ? AND sr.date <= ?
          THEN (SELECT COALESCE(SUM(sri.quantity_m2 * sri.unit_cost), 0)
                FROM sales_return_items sri WHERE sri.return_id = sr.id)
          ELSE 0 END) AS monthReturnedCost
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      WHERE si.invoice_status != 'VOID' AND ${salesScope.clause}
    `, [today, monthStart, today, monthStart, today, ...salesScope.params])[0] || {};

    const prevMonthSales = Number(this.db.query<any>(`
      SELECT
        COALESCE((SELECT SUM(si.subtotal - si.discount_amount) FROM sales_invoices si
          WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${salesScope.clause}), 0)
        - COALESCE((SELECT SUM(sr.total_amount - CASE WHEN si.total_amount > 0
            THEN ROUND(sr.total_amount * COALESCE(si.tax_amount, 0) / si.total_amount, 2) ELSE 0 END) FROM sales_returns sr
          JOIN sales_invoices si ON si.id = sr.original_invoice_id
          WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${salesScope.clause}), 0) AS sales
    `, [prevMonthStart, prevMonthEnd, ...salesScope.params, prevMonthStart, prevMonthEnd, ...salesScope.params])[0]?.sales || 0);

    // 2. Purchases metrics
    const purchaseStats = this.db.query<any>(`
      SELECT SUM(CASE WHEN pi.date = ? THEN pi.total_amount ELSE 0 END) as todayPurchases
      FROM purchase_invoices pi
      WHERE ${purchaseScope.clause}
    `, [today, ...purchaseScope.params])[0] || {};

    // 3. Expenses metrics (bounded up to today)
    const expenseStats = this.db.query<any>(`
      SELECT 
        SUM(CASE WHEN e.date = ? THEN e.amount ELSE 0 END) as todayExpenses,
        SUM(CASE WHEN e.date >= ? AND e.date <= ? THEN e.amount ELSE 0 END) as monthExpenses
      FROM expenses e
      WHERE ${expenseScope.clause}
    `, [today, monthStart, today, ...expenseScope.params])[0] || {};

    // 4. Receivables (Customer debts)
    const customerDebts = this.db.query<any>(`
      SELECT SUM(si.remaining_amount) as totalReceivables FROM sales_invoices si
      WHERE si.remaining_amount > 0 AND si.invoice_status != 'VOID' AND ${salesScope.clause}
    `, salesScope.params)[0]?.totalReceivables || 0;

    // Urgent debts: customers with debts overdue by > 30 days based on invoice due dates
    const cutoff30DaysAgo = new Date();
    cutoff30DaysAgo.setDate(cutoff30DaysAgo.getDate() - 30);
    const cutoff30Str = localDateString(cutoff30DaysAgo);
    const urgentDebts = this.db.query<any>(`
      SELECT COUNT(DISTINCT si.customer_id) as count
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      WHERE si.remaining_amount > 0
        AND si.invoice_status != 'VOID'
        AND COALESCE(si.due_date, si.date) < ?
        AND ${salesScope.clause}
    `, [cutoff30Str, ...salesScope.params])[0]?.count || 0;

    // 5. Payables (Supplier dues)
    const supplierPayables = this.db.query<any>(`
      SELECT SUM(pi.remaining_amount) as totalPayables FROM purchase_invoices pi
      WHERE pi.remaining_amount > 0 AND ${purchaseScope.clause}
    `, purchaseScope.params)[0]?.totalPayables || 0;

    // 6. Inventory Valuation
    const costingMethod = this.db.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'costingMethod'`
    )[0]?.value;
    if (costingMethod === 'FIFO') {
      const inconsistentStock = this.db.query<{ productId: string; warehouseId: string }>(`
        SELECT ws.product_id AS productId, ws.warehouse_id AS warehouseId
        FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
        WHERE COALESCE((SELECT SUM(icl.quantity_remaining)
          FROM inventory_cost_layers icl
          WHERE icl.product_id = ws.product_id AND icl.warehouse_id = ws.warehouse_id), 0)
          > ws.quantity_m2 + 0.009
          AND ${warehouseScope.clause}
        LIMIT 1
      `, warehouseScope.params)[0];
      if (inconsistentStock) {
        throw new Error(
          `FIFO cost layers exceed physical stock for product ${inconsistentStock.productId} in warehouse ${inconsistentStock.warehouseId}. Reconcile inventory before viewing valuation.`
        );
      }
    }
    const invStats = this.db.query<any>(`
      SELECT 
        SUM(CASE WHEN ? = 'FIFO' THEN
          COALESCE((SELECT SUM(icl.quantity_remaining * icl.unit_cost)
            FROM inventory_cost_layers icl
            WHERE icl.product_id = ws.product_id AND icl.warehouse_id = ws.warehouse_id), 0)
          + MAX(0, ws.quantity_m2 - COALESCE((SELECT SUM(icl.quantity_remaining)
            FROM inventory_cost_layers icl
            WHERE icl.product_id = ws.product_id AND icl.warehouse_id = ws.warehouse_id), 0)) * p.cost_price
          ELSE ws.quantity_m2 * p.cost_price END) as valuationCost,
        SUM(ws.quantity_m2 * p.selling_price_m2) as valuationSale,
        COUNT(CASE WHEN ws.quantity_m2 <= p.min_stock_level AND ws.quantity_m2 > 0 THEN 1 END) as lowStock,
        COUNT(CASE WHEN ws.quantity_m2 <= 0 THEN 1 END) as outOfStock
      FROM warehouse_stock ws
      JOIN warehouses w ON w.id = ws.warehouse_id
      JOIN products p ON ws.product_id = p.id
      WHERE p.is_active = 1 AND ${warehouseScope.clause}
    `, [costingMethod, ...warehouseScope.params])[0] || {};

    // 7. Top customer
    const topCustomer = this.db.query<any>(`
      SELECT c.name, SUM(si.total_amount) AS total_purchases
      FROM customers c JOIN sales_invoices si ON si.customer_id = c.id
      WHERE si.invoice_status != 'VOID' AND ${salesScope.clause}
      GROUP BY c.id
      HAVING total_purchases > 0
      ORDER BY total_purchases DESC
      LIMIT 1
    `, salesScope.params)[0] || null;

    const monthGross = Number(salesStats.monthGrossProfit || 0)
      - Number(returnStats.monthReturns || 0)
      + Number(returnStats.monthReturnedCost || 0);
    const monthExp = expenseStats.monthExpenses || 0;
    const monthNet = monthGross - monthExp;
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
    const averageOrderValue = salesStats.todaySalesCount > 0
      ? Number((salesStats.todaySales / salesStats.todaySalesCount).toFixed(2))
      : 0;

    return {
      todaySales: Number(todaySales.toFixed(2)),
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
    this.requireView('dashboard.view');
    const scope = this.branchScope('si.branch_id');
    const results: { date: string; sales: number; profit: number }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = localDateString(d);

      const row = this.db.query<any>(`
        SELECT
          COALESCE((SELECT SUM(si.subtotal - si.discount_amount) FROM sales_invoices si
            WHERE si.date = ? AND si.invoice_status != 'VOID' AND ${scope.clause}), 0)
          - COALESCE((SELECT SUM(sr.total_amount - CASE WHEN si.total_amount > 0
              THEN ROUND(sr.total_amount * COALESCE(si.tax_amount,0) / si.total_amount,2) ELSE 0 END) FROM sales_returns sr
            JOIN sales_invoices si ON si.id = sr.original_invoice_id
            WHERE sr.date = ? AND si.invoice_status != 'VOID' AND ${scope.clause}), 0) AS sales,
          COALESCE((SELECT SUM(si.gross_profit) FROM sales_invoices si
            WHERE si.date = ? AND si.invoice_status != 'VOID' AND ${scope.clause}), 0)
          - COALESCE((SELECT SUM(sr.total_amount - CASE WHEN si.total_amount > 0
              THEN ROUND(sr.total_amount * COALESCE(si.tax_amount,0) / si.total_amount,2) ELSE 0 END) FROM sales_returns sr
            JOIN sales_invoices si ON si.id = sr.original_invoice_id
            WHERE sr.date = ? AND si.invoice_status != 'VOID' AND ${scope.clause}), 0)
          + COALESCE((SELECT SUM(sri.quantity_m2 * sri.unit_cost)
            FROM sales_returns sr
            JOIN sales_invoices si ON si.id = sr.original_invoice_id
            JOIN sales_return_items sri ON sri.return_id = sr.id
            WHERE sr.date = ? AND si.invoice_status != 'VOID' AND ${scope.clause}), 0) AS profit
      `, [dateStr, ...scope.params, dateStr, ...scope.params, dateStr, ...scope.params,
        dateStr, ...scope.params, dateStr, ...scope.params])[0];

      results.push({
        date: dateStr,
        sales: Number((row?.sales || 0).toFixed(2)),
        profit: Number((row?.profit || 0).toFixed(2))
      });
    }

    return results;
  }

  public getTopSellingProducts(limit = 5): { name: string; quantityM2: number; totalRevenue: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[] {
    this.requireView('reports.view');
    const scope = this.branchScope('si.branch_id');
    return this.db.query<any>(`
      SELECT 
        p.name,
        p.product_type AS productType,
        p.base_unit AS baseUnit,
        p.custom_unit AS customUnit,
        SUM(sii.quantity_m2) as quantityM2,
        SUM(sii.total_price) as totalRevenue
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      WHERE si.invoice_status != 'VOID' AND ${scope.clause}
      GROUP BY p.id
      ORDER BY totalRevenue DESC
      LIMIT ?
    `, [...scope.params, limit]);
  }

  public getPurchaseReport(dateFrom?: string, dateTo?: string): {
    totalPurchases: number;
    totalPaid: number;
    totalRemaining: number;
    invoices: any[];
  } {
    this.requireView('finance.view');
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
    this.requireView('finance.view');
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
    merchandiseRevenue: number;
    shippingRevenue: number;
    otherRevenue: number;
    costOfGoodsSold: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    margin: number;
  } {
    this.requireView('finance.view');
    if ((dateFrom && !isValidDate(dateFrom)) || (dateTo && !isValidDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) {
      throw new Error('Invalid profit and loss date range.');
    }
    const conditions = ['e.is_posted = 1', "a.type IN ('REVENUE', 'EXPENSE')"];
    const params: string[] = [];
    const scope = this.ledgerScope();
    conditions.push(scope.clause);
    params.push(...scope.params);
    if (dateFrom) { conditions.push('e.date >= ?'); params.push(dateFrom); }
    if (dateTo) { conditions.push('e.date <= ?'); params.push(dateTo); }
    const balances = this.db.query<{ code: string; type: string; amount: number }>(`
      SELECT a.code, a.type,
             ROUND(SUM(CASE WHEN a.type = 'REVENUE' THEN l.credit - l.debit ELSE l.debit - l.credit END), 2) AS amount
      FROM journal_entries e
      JOIN journal_entry_lines l ON l.entry_id = e.id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY a.code, a.type
    `, params);
    const merchandiseRevenue = Number(balances.filter((row) => row.code === '4101').reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2));
    const shippingRevenue = Number(balances.filter((row) => row.code === '4102').reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2));
    const otherRevenue = Number(balances.filter((row) => row.type === 'REVENUE' && !['4101', '4102'].includes(row.code)).reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2));
    const revenue = Number((merchandiseRevenue + shippingRevenue + otherRevenue).toFixed(2));
    const costOfGoodsSold = Number(balances.filter((row) => row.type === 'EXPENSE' && row.code === '5101').reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2));
    const grossProfit = Number((merchandiseRevenue - costOfGoodsSold).toFixed(2));
    const expenses = Number(balances.filter((row) => row.type === 'EXPENSE' && row.code !== '5101').reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2));
    const netProfit = Number((grossProfit + shippingRevenue + otherRevenue - expenses).toFixed(2));
    const margin = revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(1)) : 0;

    return { revenue, merchandiseRevenue, shippingRevenue, otherRevenue, costOfGoodsSold, grossProfit, expenses, netProfit, margin };
  }

  public getCategorySalesReport(dateFrom?: string, dateTo?: string): { categoryName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[] {
    this.requireView('reports.view');
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

    return this.db.query<any>(`
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
        SUM(sii.total_price) as totalRevenue,
        SUM(sii.profit) as profit
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      ${whereClause}
      GROUP BY c.id, c.name, p.product_type, p.base_unit, p.custom_unit
      ORDER BY totalRevenue DESC
    `, params);
  }

  public getBrandSalesReport(dateFrom?: string, dateTo?: string): { brandName: string; quantityM2: number; totalRevenue: number; profit: number; productType: string; baseUnit: string; customUnit?: string }[] {
    this.requireView('reports.view');
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

    return this.db.query<any>(`
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
        SUM(sii.total_price) as totalRevenue,
        SUM(sii.profit) as profit
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      ${whereClause}
      GROUP BY b.id, b.name, p.product_type, p.base_unit, p.custom_unit
      ORDER BY totalRevenue DESC
    `, params);
  }

  public getInventoryValuationReport(): {
    totalCostValue: number;
    totalSaleValue: number;
    byWarehouse: { warehouseName: string; costValue: number; saleValue: number; items: number }[];
  } {
    this.requireView('finance.view');
    const scope = this.branchScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id ORDER BY bw.is_primary DESC, bw.branch_id LIMIT 1)'
    );
    const byWarehouse = this.db.query<any>(`
      SELECT 
        w.name as warehouseName,
        SUM(ws.quantity_m2 * p.cost_price) as costValue,
        SUM(ws.quantity_m2 * p.selling_price_m2) as saleValue,
        COUNT(ws.id) as items
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      WHERE p.is_active = 1 AND ws.quantity_m2 > 0 AND ${scope.clause}
      GROUP BY w.id, w.name
      ORDER BY costValue DESC
    `, scope.params);

    const totals = this.db.query<any>(`
      SELECT 
        SUM(ws.quantity_m2 * p.cost_price) as totalCost,
        SUM(ws.quantity_m2 * p.selling_price_m2) as totalSale
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      WHERE p.is_active = 1 AND ws.quantity_m2 > 0 AND ${scope.clause}
    `, scope.params)[0] || {};

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
    this.requireView('dashboard.view');
    const now = new Date();
    const today = localDateString();
    const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMonthStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const prevMonthEnd = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate()}`;
    const scope = this.branchScope('si.branch_id');

    const loadSalesSummary = (from: string, to: string) => {
      const sales = this.db.query<any>(`
        SELECT COALESCE(SUM(subtotal - discount_amount),0) AS revenue,
          COALESCE(SUM(gross_profit),0) AS profit, COUNT(*) AS invoices
        FROM sales_invoices si
        WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0] || {};
      const returnedRevenue = Number(this.db.query<any>(`
        SELECT COALESCE(SUM(sr.total_amount - CASE WHEN si.total_amount > 0
            THEN ROUND(sr.total_amount * COALESCE(si.tax_amount,0) / si.total_amount,2) ELSE 0 END),0) AS revenue
        FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id
        WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0]?.revenue || 0);
      const returnedCost = Number(this.db.query<any>(`
        SELECT COALESCE(SUM(sri.quantity_m2*sri.unit_cost),0) AS cost
        FROM sales_return_items sri JOIN sales_returns sr ON sr.id=sri.return_id
        JOIN sales_invoices si ON si.id=sr.original_invoice_id
        WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      `, [from, to, ...scope.params])[0]?.cost || 0);
      return {
        sales: Number(sales.revenue || 0) - returnedRevenue,
        profit: Number(sales.profit || 0) - returnedRevenue + returnedCost,
        invoices: Number(sales.invoices || 0),
      };
    };

    const current = loadSalesSummary(currentMonthStart, today);
    const previous = loadSalesSummary(prevMonthStart, prevMonthEnd);

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
    this.requireView('customers.view');
    const scope = this.branchScope('si.branch_id');
    return this.db.query<any>(`
      SELECT 
        c.name,
        SUM(si.total_amount) as totalPurchases,
        COUNT(DISTINCT si.id) as purchaseCount
      FROM customers c
      LEFT JOIN sales_invoices si ON c.id = si.customer_id AND si.invoice_status != 'VOID' AND ${scope.clause}
      GROUP BY c.id
      HAVING totalPurchases > 0
      ORDER BY totalPurchases DESC
      LIMIT ?
    `, [...scope.params, limit]);
  }

  public getPaymentMethodDistribution(): { method: string; count: number; totalAmount: number }[] {
    this.requireView('finance.view');
    const scope = this.branchScope('si.branch_id');
    return this.db.query<any>(`
      SELECT 
        payment_type as method,
        COUNT(*) as count,
        SUM(total_amount) as totalAmount
      FROM sales_invoices si
      WHERE invoice_status != 'VOID' AND date >= date('now', '-30 days') AND ${scope.clause}
      GROUP BY payment_type
      ORDER BY totalAmount DESC
    `, scope.params);
  }

  public getSalesByGrade(): { grade: string; quantityM2: number; totalRevenue: number }[] {
    this.requireView('reports.view');
    const scope = this.branchScope('si.branch_id');
    return this.db.query<any>(`
      SELECT 
        p.grade,
        SUM(sii.quantity_m2) as quantityM2,
        SUM(sii.total_price) as totalRevenue
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      WHERE si.invoice_status != 'VOID' AND si.date >= date('now', '-30 days') AND ${scope.clause}
      GROUP BY p.grade
      ORDER BY totalRevenue DESC
    `, scope.params);
  }

  public getRecentActivities(limit = 10): {
    type: 'SALE' | 'PURCHASE' | 'STOCK' | 'PAYMENT';
    description: string;
    amount?: number;
    date: string;
  }[] {
    this.requireView('dashboard.view');
    const salesScope = this.branchScope('si.branch_id');
    const purchaseScope = this.branchScope('pi.branch_id');
    const stockScope = this.branchScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id ORDER BY bw.is_primary DESC, bw.branch_id LIMIT 1)'
    );
    const activities: any[] = [];

    // Recent sales
    const sales = this.db.query<any>(`
      SELECT 'SALE' as type, 
        'فاتورة مبيعات #' || si.invoice_number as description,
        si.total_amount as amount,
        si.date
      FROM sales_invoices si
      WHERE si.invoice_status != 'VOID' AND ${salesScope.clause}
      ORDER BY si.date DESC
      LIMIT 3
    `, salesScope.params);

    // Recent purchases
    const purchases = this.db.query<any>(`
      SELECT 'PURCHASE' as type,
        'فاتورة توريد #' || pi.invoice_number as description,
        pi.total_amount as amount,
        pi.date
      FROM purchase_invoices pi
      WHERE ${purchaseScope.clause}
      ORDER BY pi.date DESC
      LIMIT 3
    `, purchaseScope.params);

    // Recent stock movements
    const stocks = this.db.query<any>(`
      SELECT 'STOCK' as type,
        'حركة مخزون #' || t.transaction_number as description,
        NULL as amount,
        t.created_at as date
      FROM inventory_transactions t
      JOIN warehouses w ON w.id = t.warehouse_id
      WHERE ${stockScope.clause}
      ORDER BY t.created_at DESC
      LIMIT 2
    `, stockScope.params);

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
