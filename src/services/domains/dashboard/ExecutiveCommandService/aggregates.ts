import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { AuthService } from '../../auth/AuthService';
import { BranchAccessService } from '../../auth/BranchAccessService';
import { AccountingService } from '../../finance/AccountingService';
import type {
  BranchPerformanceRow,
  CashAccountRow,
  CommandPeriod,
  CommandTrendPoint,
  EmployeeSaleRow,
  InventoryRow,
  LowStockRow,
  ProductSaleRow,
  SlowMovingRow,
} from '../../../../types/dashboard/executiveCommand';
import { MAX_DRILLDOWN_ROWS, SLOW_MOVING_DAYS, round2, toNumber } from './formatters';
import { CommandScopes } from './scopes';

/**
 * Read-only aggregate queries behind the executive command centre overview.
 * Extracted verbatim from ExecutiveCommandService.
 */
export class ExecutiveCommandAggregates {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private accountingService = new AccountingService();
  private scopes = new CommandScopes();

  public getSalesTotals(from: string, to: string) {
    const sales = this.scopes.salesScopes();
    const purchase = this.scopes.purchaseScopes();

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

  public getExpenseTotals(from: string, to: string) {
    const scope = this.scopes.expenseScopes();
    const row = this.db.query<any>(
      `SELECT COALESCE(SUM(e.amount), 0) / 100.0 AS total, COUNT(*) AS expenseCount
       FROM expenses e
       WHERE e.date BETWEEN ? AND ? AND ${scope.branch.clause} AND ${scope.company.clause}`,
      [from, to, ...scope.branch.params, ...scope.company.params],
    )[0] ?? {};
    return { total: round2(toNumber(row.total)), count: Math.trunc(toNumber(row.expenseCount)) };
  }

  public getCollections(from: string, to: string) {
    const actor = AuthService.requireAuth();
    const sales = this.scopes.salesScopes();
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

  public getReceivables(today: string) {
    const sales = this.scopes.salesScopes();
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

  public getLiquidity() {
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

  public getInventoryRows(): InventoryRow[] {
    const scope = this.scopes.warehouseScope();
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

  public getLowStockRows(): LowStockRow[] {
    const scope = this.scopes.warehouseScope();
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

  public getTopProducts(from: string, to: string, limit: number): ProductSaleRow[] {
    const sales = this.scopes.salesScopes();
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

  public getSlowMoving(limit: number): SlowMovingRow[] {
    const scope = this.scopes.warehouseScope();
    const sales = this.scopes.salesScopes();
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

  public getBranchPerformance(from: string, to: string): BranchPerformanceRow[] {
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

  public getEmployeeSales(from: string, to: string, limit: number): EmployeeSaleRow[] {
    const sales = this.scopes.salesScopes();
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

  public getProfit(from: string, to: string, fallbackExpenses: number): { net: number; source: 'ledger' | 'estimated' } {
    try {
      const result = this.accountingService.getDashboardProfitData(from, to);
      return { net: round2(result.netProfit), source: 'ledger' };
    } catch {
      const sales = this.getSalesTotals(from, to);
      return { net: round2(sales.grossProfit - fallbackExpenses), source: 'estimated' };
    }
  }

  public getCashFlow(from: string, to: string, expenses: number, collections: number) {
    const purchase = this.scopes.purchaseScopes();
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

  public getTrend(period: CommandPeriod): CommandTrendPoint[] {
    const sales = this.scopes.salesScopes();
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
  // Receivable / overdue invoice rows (shared by overview + drill-downs)
  // ───────────────────────────────────────────────────────────────────────────

  public getReceivableInvoiceRows(): any[] {
    const sales = this.scopes.salesScopes();
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

  public getOverdueInvoiceRows(today: string): any[] {
    const sales = this.scopes.salesScopes();
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

  /** Production-order counts and WIP material valuation for the command centre. */
  public getManufacturingSummary(from: string, to: string) {
    const scope = this.scopes.manufacturingScope();
    const statusRows = this.db.query<{ status: string; count: number; qty: number }>(
      `SELECT po.status, COUNT(*) AS count, COALESCE(SUM(po.quantity), 0) AS qty
       FROM production_orders po
       WHERE ${scope.clause}
       GROUP BY po.status`,
      scope.params
    );
    const byStatus = new Map(statusRows.map((row) => [row.status, row]));
    const completedPeriod = this.db.query<{ count: number; qty: number }>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(po.quantity), 0) AS qty
       FROM production_orders po
       WHERE po.status = 'COMPLETED' AND date(po.completed_at) BETWEEN ? AND ?
         AND ${scope.clause}`,
      [from, to, ...scope.params]
    )[0] ?? { count: 0, qty: 0 };
    const wip = this.db.query<{ orders: number; cost: number }>(
      `SELECT COUNT(DISTINCT po.id) AS orders,
              COALESCE(SUM(m.planned_qty * p.cost_price / 100.0), 0) AS cost
       FROM production_orders po
       JOIN production_order_materials m ON m.order_id = po.id
       JOIN products p ON p.id = m.product_id
       WHERE po.status IN ('RELEASED', 'IN_PROGRESS') AND ${scope.clause}`,
      scope.params
    )[0] ?? { orders: 0, cost: 0 };
    const active = ['PLANNED', 'RELEASED', 'IN_PROGRESS']
      .reduce((sum, status) => sum + Number(byStatus.get(status)?.count || 0), 0);
    return {
      activeOrders: active,
      inProgressOrders: Number(byStatus.get('IN_PROGRESS')?.count || 0),
      completedInPeriod: Number(completedPeriod.count || 0),
      completedQuantity: Number(completedPeriod.qty || 0),
      wipOrders: Number(wip.orders || 0),
      wipMaterialCost: round2(Number(wip.cost || 0)),
      materialShortages: 0,
      bomStockAlerts: 0,
    };
  }
}
