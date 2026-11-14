import type { User } from '../../../types';
import { DashboardQueryScopeService, scalar } from './DashboardQueryScopeService_part01';
import type { DashboardDb, FinanceOverviewMetrics } from './DashboardQueryScopeService_part01';

/** Financial dashboard totals are calculated from branch-owned transactions,
 * never from company-wide customer/supplier denormalized balances. */
export function queryFinanceOverviewMetrics(
  db: DashboardDb,
  from: string,
  to: string,
  user: User
): FinanceOverviewMetrics {
  const sales = DashboardQueryScopeService.branch('si', user);
  const salesCompany = DashboardQueryScopeService.company('si', user);
  const purchase = DashboardQueryScopeService.branch('pi', user);
  const purchaseCompany = DashboardQueryScopeService.company('pi', user);
  const expense = DashboardQueryScopeService.expenseBranch('e', user);
  const register = DashboardQueryScopeService.branch('cr', user);
  const warehouse = DashboardQueryScopeService.warehouseBranch('w', user);
  const companyParams = [...sales.params, ...salesCompany.params];
  const salesWhere = `${sales.clause} AND ${salesCompany.clause}`;
  const revenue = scalar(db.exec(
    `SELECT COALESCE(SUM(si.subtotal - si.discount_amount + si.shipping_cost + COALESCE(si.extra_fees,0)),0) FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesWhere}`,
    [from, to, ...companyParams]
  ));
  const expenses = scalar(db.exec(
    `SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.date BETWEEN ? AND ? AND ${expense.clause}`,
    [from, to, ...expense.params]
  ));
  const grossProfit = scalar(db.exec(
    `SELECT COALESCE(SUM(si.gross_profit),0) FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesWhere}`,
    [from, to, ...companyParams]
  ));
  const shipping = scalar(db.exec(
    `SELECT COALESCE(SUM(si.shipping_cost),0) FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${salesWhere}`,
    [from, to, ...companyParams]
  ));
  const receivables = scalar(db.exec(
    `SELECT COALESCE(SUM(si.remaining_amount),0) FROM sales_invoices si WHERE si.remaining_amount > 0 AND si.invoice_status != 'VOID' AND ${salesWhere}`,
    companyParams
  ));
  const payables = scalar(db.exec(
    `SELECT COALESCE(SUM(pi.remaining_amount),0) FROM purchase_invoices pi WHERE pi.remaining_amount > 0 AND ${purchase.clause} AND ${purchaseCompany.clause}`,
    [...purchase.params, ...purchaseCompany.params]
  ));
  const cash = scalar(db.exec(
    `SELECT COALESCE(SUM(cr.current_balance),0) FROM cash_registers cr WHERE cr.is_active = 1 AND ${register.clause}`,
    register.params
  ));
  const inventory = scalar(db.exec(
    `SELECT COALESCE(SUM(ws.quantity_m2 * p.cost_price),0) FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id JOIN warehouses w ON w.id = ws.warehouse_id WHERE ${warehouse.clause}`,
    warehouse.params
  ));
  return {
    totalRevenue: revenue,
    totalExpenses: expenses,
    netProfit: grossProfit + shipping - expenses,
    totalReceivables: receivables,
    totalPayables: payables,
    cashBalance: cash,
    inventoryValue: inventory,
  };
}
