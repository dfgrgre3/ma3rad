import { localDateString } from '../../../../utils/shared/date';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import { branchScope, ledgerScope } from './scopes';
import type { DashboardContext } from './types';

export function buildDashboardContext(access: BranchAccessService): DashboardContext {
  const today = localDateString();
  const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
  const salesScope = branchScope(access, 'si.branch_id');
  const purchaseScope = branchScope(access, 'pi.branch_id');
  const expenseScope = branchScope(access, 'e.branch_id');
  const warehouseScope = branchScope(access,
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

export function dashboardQuerySpecs(ctx: DashboardContext): Record<string, { sql: string; params: any[] }> {
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

export function buildInvStatsSpec(ctx: DashboardContext, costingMethod: string | undefined): { sql: string; params: any[] } {
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

export function buildProfitBalancesSpec(dateFrom: string, dateTo: string, access: BranchAccessService): { sql: string; params: any[] } {
  const scope = ledgerScope(access);
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

export function buildSalesTrendSpec(access: BranchAccessService): { sql: string; params: any[]; dates: string[] } {
  const scope = branchScope(access, 'si.branch_id');
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

export function buildTopSellingProductsSpec(limit: number, access: BranchAccessService): { sql: string; params: any[] } {
  const scope = branchScope(access, 'si.branch_id');
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

export function buildMonthlyComparisonSpec(access: BranchAccessService): { sql: string; params: any[] } {
  const now = new Date();
  const today = localDateString();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
  const prevMonthLastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
  const prevMonthEnd = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${String(Math.min(now.getDate(), prevMonthLastDay)).padStart(2, '0')}`;
  const scope = branchScope(access, 'si.branch_id');

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

export function buildTopCustomersSpec(limit: number, access: BranchAccessService): { sql: string; params: any[] } {
  const scope = branchScope(access, 'si.branch_id');
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

export function buildPaymentMethodSpec(access: BranchAccessService): { sql: string; params: any[] } {
  const scope = branchScope(access, 'si.branch_id');
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

export function buildSalesByGradeSpec(access: BranchAccessService): { sql: string; params: any[] } {
  const scope = branchScope(access, 'si.branch_id');
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

export function buildRecentActivitySpecs(access: BranchAccessService): { sales: { sql: string; params: any[] }; purchases: { sql: string; params: any[] }; stocks: { sql: string; params: any[] } } {
  const salesScope = branchScope(access, 'si.branch_id');
  const purchaseScope = branchScope(access, 'pi.branch_id');
  const stockScope = branchScope(access,
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
