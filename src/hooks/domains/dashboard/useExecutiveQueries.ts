import { format, subDays } from 'date-fns';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { DashboardQueryScopeService } from '../../../services/domains/dashboard/DashboardQueryScopeService';
import { AccountingService } from '../../../services/domains/finance/AccountingService';
import type { DailySale, DebtCustomer, LowStockItem, RecentInvoice, TopProduct } from '../../../types/dashboard/executive';

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
  const periodTo = toStr < today ? toStr : today;
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  // KPIs
  const salesRow = db.exec(`SELECT COALESCE(SUM(si.subtotal - si.discount_amount),0) as total FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`, [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]);
  const returnsRow = db.exec(`SELECT COALESCE(SUM(sr.total_amount),0) FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`, [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]);
  const profitData = new AccountingService().getDashboardProfitData(fromStr, periodTo);
  const netReturns = Number(returnsRow[0]?.values[0]?.[0] ?? 0);
  const total = Number(salesRow[0]?.values[0]?.[0] ?? 0) - netReturns;
  const profit = profitData.netProfit;

  const yesterdayRow = db.exec(`SELECT COALESCE((SELECT SUM(si.subtotal-si.discount_amount) FROM sales_invoices si WHERE si.date=? AND si.invoice_status!='VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}),0) - COALESCE((SELECT SUM(sr.total_amount) FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id WHERE sr.date=? AND si.invoice_status!='VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}),0)`, [yesterday, ...salesScope.params, ...salesCompanyScope.params, yesterday, ...salesScope.params, ...salesCompanyScope.params]);
  const todayRow = db.exec(`SELECT COALESCE((SELECT SUM(si.subtotal-si.discount_amount) FROM sales_invoices si WHERE si.date=? AND si.invoice_status!='VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}),0) - COALESCE((SELECT SUM(sr.total_amount) FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id WHERE sr.date=? AND si.invoice_status!='VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}),0)`, [today, ...salesScope.params, ...salesCompanyScope.params, today, ...salesScope.params, ...salesCompanyScope.params]);
  const todaySales = (todayRow[0]?.values[0]?.[0] as number) ?? 0;
  const yesterdaySales = (yesterdayRow[0]?.values[0]?.[0] as number) ?? 0;
  const salesTrend = yesterdaySales > 0 ? (((todaySales - yesterdaySales) / yesterdaySales) * 100).toFixed(1) : '0';

  const debtRow = db.exec(`SELECT COALESCE(SUM(si.remaining_amount),0) FROM sales_invoices si WHERE si.remaining_amount > 0 AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`, [...salesScope.params, ...salesCompanyScope.params]);
  const totalDebt = (debtRow[0]?.values[0]?.[0] as number) ?? 0;

  const totalPurchasesRow = db.exec(`SELECT COALESCE(SUM(pi.total_amount),0) FROM purchase_invoices pi WHERE pi.date BETWEEN ? AND ? AND ${purchaseScope.clause} AND ${purchaseCompanyScope.clause}`, [fromStr, periodTo, ...purchaseScope.params, ...purchaseCompanyScope.params]);
  const totalPurchases = (totalPurchasesRow[0]?.values[0]?.[0] as number) ?? 0;

  const receivedRow = db.exec(`SELECT COALESCE(SUM(cp.amount),0) FROM customer_payments cp WHERE cp.date BETWEEN ? AND ? AND ${paymentScope.clause}`, [fromStr, periodTo, ...paymentScope.params]);
  const totalReceived = (receivedRow[0]?.values[0]?.[0] as number) ?? 0;

  const invoiceCountRow = db.exec(`SELECT COUNT(*) FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause}`, [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]);
  const invoiceCount = (invoiceCountRow[0]?.values[0]?.[0] as number) ?? 0;
  const margin = total > 0 ? ((profit / total) * 100).toFixed(1) : '0';

  const salesByDayRow = db.exec(`SELECT si.date as day, COALESCE(SUM(si.subtotal-si.discount_amount),0) as sales FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} GROUP BY si.date ORDER BY day ASC`, [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]);
  const salesMap: Record<string, number> = {};
  salesByDayRow[0]?.values.forEach((row: any[]) => { salesMap[row[0] as string] = row[1] as number; });

  const returnByDayRow = db.exec(`SELECT sr.date, SUM(sr.total_amount) AS revenue FROM sales_returns sr JOIN sales_invoices si ON si.id=sr.original_invoice_id WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} GROUP BY sr.date`, [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]);
  returnByDayRow[0]?.values.forEach((row: any[]) => {
    const date = row[0] as string;
    salesMap[date] = Math.max(0, (salesMap[date] || 0) - (row[1] as number));
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

  // Top products
  const topProductsRow = db.exec(`SELECT p.name, SUM(sii.quantity_m2) as qty, SUM(sii.total_price) as revenue, p.product_type, p.base_unit, p.custom_unit FROM sales_invoice_items sii JOIN products p ON sii.product_id = p.id JOIN sales_invoices si ON sii.invoice_id = si.id WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesScope.clause} AND ${salesCompanyScope.clause} GROUP BY p.id ORDER BY revenue DESC LIMIT 5`, [fromStr, periodTo, ...salesScope.params, ...salesCompanyScope.params]);
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
  const allAuthorizedBranchesScope = DashboardQueryScopeService.branch('si', actor, true);
  const branchRow = db.exec(`SELECT b.name, COALESCE(SUM(si.total_amount), 0) FROM branches b JOIN sales_invoices si ON si.branch_id = b.id WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${allAuthorizedBranchesScope.clause} AND ${salesCompanyScope.clause} GROUP BY b.id HAVING COALESCE(SUM(si.total_amount), 0) > 0 ORDER BY 2 DESC`, [fromStr, periodTo, ...allAuthorizedBranchesScope.params, ...salesCompanyScope.params]);
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
