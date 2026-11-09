import { format, subDays } from 'date-fns';
import { DatabaseManager } from '../../database/repositories/databaseManager';
import { AuthService } from '../../services/auth/AuthService';
import { PermissionService } from '../../services/auth/PermissionService';
import { DashboardQueryScopeService } from '../../services/dashboard/DashboardQueryScopeService';
import type { DailySale, DebtCustomer, LowStockItem, RecentInvoice, TopProduct } from '../../types/dashboard/executive';

export function runExecutiveQueries(fromStr: string, toStr: string) {
  // تُدمَج هذه المؤشرات داخل لوحة المعلومات، لذا تفحص طبقة القراءة صلاحيات
  // المجالات التي تجمّعها (مبيعات/مشتريات/مالية) لا صلاحية المسار الأب وحدها.
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'sales.view', '/sales');
  PermissionService.require(actor, 'purchases.view', '/purchases');
  PermissionService.require(actor, 'finance.view', '/finance');

  const db = DatabaseManager.getInstance().getDatabase();
  if (!db) return null;
  const salesScope = DashboardQueryScopeService.branch('si', actor);
  const salesCompanyScope = DashboardQueryScopeService.company('si', actor);
  const purchaseScope = DashboardQueryScopeService.branch('pi', actor);
  const purchaseCompanyScope = DashboardQueryScopeService.company('pi', actor);
  const paymentScope = DashboardQueryScopeService.branch('cp', actor);
  const warehouseScope = DashboardQueryScopeService.warehouseBranch('w', actor);

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  // KPIs
  const salesRow = db.exec(`SELECT COALESCE(SUM(si.subtotal - si.discount_amount),0) as total, COALESCE(SUM(si.gross_profit), 0) as profit FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`, [fromStr, toStr, ...salesScope.params, ...salesCompanyScope.params]);
  const returnsRow = db.exec(`SELECT COALESCE(SUM(sr.total_amount),0) FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`, [fromStr, toStr, ...salesScope.params, ...salesCompanyScope.params]);
  const returnedCostRow = db.exec(`SELECT COALESCE(SUM(sri.quantity_m2 * sri.unit_cost),0) FROM sales_return_items sri JOIN sales_returns sr ON sr.id=sri.return_id JOIN sales_invoices si ON si.id=sr.original_invoice_id WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`, [fromStr, toStr, ...salesScope.params, ...salesCompanyScope.params]);
  const netReturns = Number(returnsRow[0]?.values[0]?.[0] ?? 0);
  const returnedCost = Number(returnedCostRow[0]?.values[0]?.[0] ?? 0);
  const total = Number(salesRow[0]?.values[0]?.[0] ?? 0) - netReturns;
  const profit = Number(salesRow[0]?.values[0]?.[1] ?? 0) - netReturns + returnedCost;

  const yesterdayRow = db.exec(`SELECT COALESCE((SELECT SUM(si.subtotal-si.discount_amount) FROM sales_invoices si WHERE si.date=? AND si.invoice_status!='VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}),0) - COALESCE((SELECT SUM(sr.total_amount) FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id WHERE sr.date=? AND si.invoice_status!='VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}),0)`, [yesterday, ...salesScope.params, ...salesCompanyScope.params, yesterday, ...salesScope.params, ...salesCompanyScope.params]);
  const todayRow = db.exec(`SELECT COALESCE((SELECT SUM(si.subtotal-si.discount_amount) FROM sales_invoices si WHERE si.date=? AND si.invoice_status!='VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}),0) - COALESCE((SELECT SUM(sr.total_amount) FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id WHERE sr.date=? AND si.invoice_status!='VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}),0)`, [today, ...salesScope.params, ...salesCompanyScope.params, today, ...salesScope.params, ...salesCompanyScope.params]);
  const todaySales = (todayRow[0]?.values[0]?.[0] as number) ?? 0;
  const yesterdaySales = (yesterdayRow[0]?.values[0]?.[0] as number) ?? 0;
  const salesTrend = yesterdaySales > 0 ? (((todaySales - yesterdaySales) / yesterdaySales) * 100).toFixed(1) : '0';

  const debtRow = db.exec(`SELECT COALESCE(SUM(si.remaining_amount),0) FROM sales_invoices si WHERE si.remaining_amount > 0 AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`, [...salesScope.params, ...salesCompanyScope.params]);
  const totalDebt = (debtRow[0]?.values[0]?.[0] as number) ?? 0;

  const totalPurchasesRow = db.exec(`SELECT COALESCE(SUM(pi.total_amount),0) FROM purchase_invoices pi WHERE pi.date BETWEEN ? AND ? AND ${purchaseScope.clause} AND ${purchaseCompanyScope.clause}`, [fromStr, toStr, ...purchaseScope.params, ...purchaseCompanyScope.params]);
  const totalPurchases = (totalPurchasesRow[0]?.values[0]?.[0] as number) ?? 0;

  const receivedRow = db.exec(`SELECT COALESCE(SUM(cp.amount),0) FROM customer_payments cp WHERE cp.date BETWEEN ? AND ? AND ${paymentScope.clause}`, [fromStr, toStr, ...paymentScope.params]);
  const totalReceived = (receivedRow[0]?.values[0]?.[0] as number) ?? 0;

  const invoiceCountRow = db.exec(`SELECT COUNT(*) FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`, [fromStr, toStr, ...salesScope.params, ...salesCompanyScope.params]);
  const invoiceCount = (invoiceCountRow[0]?.values[0]?.[0] as number) ?? 0;
  const margin = total > 0 ? ((profit / total) * 100).toFixed(1) : '0';

  // Daily sales 30 days
  const days30From = format(subDays(new Date(), 29), 'yyyy-MM-dd');
  const salesByDayRow = db.exec(`SELECT si.date as day, COALESCE(SUM(si.subtotal-si.discount_amount),0) as sales, COALESCE(SUM(si.gross_profit),0) as profit FROM sales_invoices si WHERE si.date >= ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} GROUP BY si.date ORDER BY day ASC`, [days30From, ...salesScope.params, ...salesCompanyScope.params]);
  const salesMap: Record<string, { sales: number; profit: number }> = {};
  salesByDayRow[0]?.values.forEach((row: any[]) => { salesMap[row[0] as string] = { sales: row[1] as number, profit: row[2] as number }; });

  const returnByDayRow = db.exec(`SELECT sr.date, SUM(sr.total_amount) AS revenue, (SELECT COALESCE(SUM(sri.quantity_m2*sri.unit_cost),0) FROM sales_return_items sri WHERE sri.return_id=sr.id) AS cost FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id WHERE sr.date >= ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} GROUP BY sr.date`, [days30From, ...salesScope.params, ...salesCompanyScope.params]);
  returnByDayRow[0]?.values.forEach((row: any[]) => {
    const cur = salesMap[row[0] as string] || { sales: 0, profit: 0 };
    salesMap[row[0] as string] = { sales: Math.max(0, cur.sales - (row[1] as number)), profit: cur.profit - (row[1] as number) + (row[2] as number) };
  });

  const dailySalesData: DailySale[] = Array.from({ length: 30 }, (_, i) => {
    const d = format(subDays(new Date(), 29 - i), 'yyyy-MM-dd');
    return { day: format(new Date(d), 'dd/MM'), sales: salesMap[d]?.sales ?? 0, profit: salesMap[d]?.profit ?? 0 };
  });

  // Top products
  const topProductsRow = db.exec(`SELECT p.name, SUM(sii.quantity_m2) as qty, SUM(sii.total_price) as revenue, p.product_type, p.base_unit, p.custom_unit FROM sales_invoice_items sii JOIN products p ON sii.product_id = p.id JOIN sales_invoices si ON sii.invoice_id = si.id WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} GROUP BY p.id ORDER BY revenue DESC LIMIT 5`, [fromStr, toStr, ...salesScope.params, ...salesCompanyScope.params]);
  const topProductsData: TopProduct[] = topProductsRow[0]?.values.map((row: any[]) => ({
    name: String(row[0]), qty: Number(row[1]), revenue: Number(row[2]), productType: String(row[3]) as 'CERAMIC' | 'GENERAL', baseUnit: String(row[4] || ''), customUnit: row[5] ? String(row[5]) : undefined,
  })) ?? [];

  // Recent invoices
  const recentInvRow = db.exec(`SELECT si.id, c.name, si.total_amount, si.date, si.payment_status FROM sales_invoices si JOIN customers c ON si.customer_id = c.id WHERE si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} ORDER BY si.created_at DESC LIMIT 5`, salesScope.params.concat(salesCompanyScope.params));
  const recentInvoicesData: RecentInvoice[] = recentInvRow[0]?.values.map((r: any[]) => ({
    id: String(r[0]), customer: String(r[1]), amount: Number(r[2]), date: String(r[3]), status: String(r[4]),
  })) ?? [];

  // Debt customers
  const debtCustRow = db.exec(`SELECT c.name, SUM(si.remaining_amount) AS current_balance FROM sales_invoices si JOIN customers c ON c.id = si.customer_id WHERE si.remaining_amount > 0 AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} GROUP BY c.id ORDER BY current_balance DESC LIMIT 5`, salesScope.params.concat(salesCompanyScope.params));
  const debtCustomersData: DebtCustomer[] = debtCustRow[0]?.values.map((r: any[]) => ({ name: String(r[0]), debt: Number(r[1]) })) ?? [];

  // Branch data
  const branchRow = db.exec(`SELECT b.name, COALESCE(SUM(si.total_amount), 0) FROM branches b JOIN sales_invoices si ON si.branch_id = b.id WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} GROUP BY b.id HAVING COALESCE(SUM(si.total_amount), 0) > 0 ORDER BY 2 DESC`, [fromStr, toStr, ...salesScope.params, ...salesCompanyScope.params]);
  const branchDataList = branchRow[0]?.values.map((r: any[]) => ({ name: String(r[0]), value: Number(r[1]) })) ?? [];

  // Low stock
  const lowStockRow = db.exec(`SELECT p.name, w.name as warehouse, COALESCE(ws.quantity_m2, 0) as qty, p.min_stock_level, p.product_type, p.base_unit, p.custom_unit FROM warehouse_stock ws JOIN products p ON ws.product_id = p.id JOIN warehouses w ON w.id = ws.warehouse_id WHERE p.is_active = 1 AND p.min_stock_level > 0 AND ws.quantity_m2 <= p.min_stock_level AND ${warehouseScope.clause} ORDER BY ws.quantity_m2 ASC LIMIT 8`, warehouseScope.params);
  const lowStockData: LowStockItem[] = lowStockRow[0]?.values.map((r: any[]) => ({
    name: String(r[0]), warehouse: String(r[1]), qty: Number(r[2]), min: Number(r[3]), productType: String(r[4]) as 'CERAMIC' | 'GENERAL', baseUnit: String(r[5] || ''), customUnit: r[6] ? String(r[6]) : undefined,
  })) ?? [];

  return {
    total, profit, totalDebt, totalPurchases, totalReceived, invoiceCount, salesTrend, margin,
    dailySalesData, topProductsData, recentInvoicesData, debtCustomersData, branchDataList, lowStockData,
  };
}
