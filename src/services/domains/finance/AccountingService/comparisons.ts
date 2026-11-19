import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { financialFieldVisibility } from '../../auth/sensitiveFields';
import { localDateString } from '../../../../utils/shared/date';
import { branchScope } from './scopes';
import { requireView } from './permissions';
import type { MonthlyComparison, NetSalesAnalysis } from './types';

type Db = DatabaseManager;

function requireInvoicesView(): void {
  requireView('dashboard.view');
  PermissionService.require(AuthService.requireAuth(), 'ui.sales.invoices.view', '/sales');
}

function summarizePeriod(db: Db, scope: { clause: string; params: string[] }, from: string, to: string) {
  const canSeeProfit = financialFieldVisibility().profit;
  const revenue = Number(db.query<any>(`
    SELECT COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS v
    FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
  `, [from, to, ...scope.params])[0]?.v || 0);
  const returns = Number(db.query<any>(`
    SELECT COALESCE(SUM(sr.total_amount), 0) / 100.0 AS v
    FROM sales_returns sr JOIN sales_invoices si ON si.id = sr.original_invoice_id
    WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
  `, [from, to, ...scope.params])[0]?.v || 0);
  const profit = Number(db.query<any>(`
    SELECT COALESCE(SUM(si.gross_profit), 0) / 100.0 AS v
    FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
  `, [from, to, ...scope.params])[0]?.v || 0);
  const returnedCost = Number(db.query<any>(`
    SELECT COALESCE(SUM(sri.quantity_m2 * sri.unit_cost), 0) / 100.0 AS v
    FROM sales_return_items sri JOIN sales_returns sr ON sr.id = sri.return_id
    JOIN sales_invoices si ON si.id = sr.original_invoice_id
    WHERE sr.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
  `, [from, to, ...scope.params])[0]?.v || 0);
  const invoices = Number(db.query<any>(`
    SELECT COUNT(*) AS v FROM sales_invoices si WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND ${scope.clause}
  `, [from, to, ...scope.params])[0]?.v || 0);
  return {
    sales: Number((revenue - returns).toFixed(2)),
    profit: canSeeProfit ? Number((profit - returns + returnedCost).toFixed(2)) : 0,
    invoices,
  };
}

function buildComparison(current: { sales: number; profit: number; invoices: number }, previous: { sales: number; profit: number; invoices: number }): MonthlyComparison {
  return {
    currentMonth: current,
    previousMonth: previous,
    salesGrowth: previous.sales > 0 ? Number(((current.sales - previous.sales) / previous.sales * 100).toFixed(1)) : null,
    invoiceGrowth: previous.invoices > 0 ? Number(((current.invoices - previous.invoices) / previous.invoices * 100).toFixed(1)) : null,
    currentMonthInvoices: current.invoices,
  };
}

export function getDailyComparison(db: Db, access: BranchAccessService): MonthlyComparison {
  requireInvoicesView();
  const now = new Date();
  const today = localDateString();
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = localDateString(yesterdayDate);
  const scope = branchScope(access, 'si.branch_id');

  const current = summarizePeriod(db, scope, today, today);
  const previous = summarizePeriod(db, scope, yesterday, yesterday);
  return buildComparison(current, previous);
}

export function getYearlyComparison(db: Db, access: BranchAccessService): MonthlyComparison {
  requireInvoicesView();
  const now = new Date();
  const today = localDateString();
  const yearStart = `${now.getFullYear()}-01-01`;
  const prevYearStart = `${now.getFullYear() - 1}-01-01`;
  const prevYearSameDay = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const scope = branchScope(access, 'si.branch_id');

  const current = summarizePeriod(db, scope, yearStart, today);
  const previous = summarizePeriod(db, scope, prevYearStart, prevYearSameDay);
  return buildComparison(current, previous);
}

export function getNetSalesAnalysis(db: Db, access: BranchAccessService, dateFrom?: string, dateTo?: string): NetSalesAnalysis {
  requireInvoicesView();
  const scope = branchScope(access, 'si.branch_id');
  const conditions = ['si.invoice_status != \'VOID\'', scope.clause];
  const params: any[] = [...scope.params];
  if (dateFrom) { conditions.push('si.date >= ?'); params.unshift(dateFrom); }
  if (dateTo) { conditions.push('si.date <= ?'); params.unshift(dateTo); }
  // rebuild params order: dates first then scope
  const orderedParams: any[] = [];
  if (dateFrom) orderedParams.push(dateFrom);
  if (dateTo) orderedParams.push(dateTo);
  orderedParams.push(...scope.params);

  const grossSales = Number(db.query<any>(`
    SELECT COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS v
    FROM sales_invoices si WHERE ${conditions.join(' AND ')}
  `, orderedParams)[0]?.v || 0);
  const returns = Number(db.query<any>(`
    SELECT COALESCE(SUM(sr.total_amount), 0) / 100.0 AS v
    FROM sales_returns sr JOIN sales_invoices si ON si.id = sr.original_invoice_id
    WHERE si.invoice_status != 'VOID' AND ${scope.clause}
      ${dateFrom ? 'AND sr.date >= ?' : ''} ${dateTo ? 'AND sr.date <= ?' : ''}
  `, [...scope.params, ...(dateFrom ? [dateFrom] : []), ...(dateTo ? [dateTo] : [])])[0]?.v || 0);
  const returnedCost = Number(db.query<any>(`
    SELECT COALESCE(SUM(sri.quantity_m2 * sri.unit_cost), 0) / 100.0 AS v
    FROM sales_return_items sri JOIN sales_returns sr ON sr.id = sri.return_id
    JOIN sales_invoices si ON si.id = sr.original_invoice_id
    WHERE si.invoice_status != 'VOID' AND ${scope.clause}
      ${dateFrom ? 'AND sr.date >= ?' : ''} ${dateTo ? 'AND sr.date <= ?' : ''}
  `, [...scope.params, ...(dateFrom ? [dateFrom] : []), ...(dateTo ? [dateTo] : [])])[0]?.v || 0);
  const profit = Number(db.query<any>(`
    SELECT COALESCE(SUM(si.gross_profit), 0) / 100.0 AS v
    FROM sales_invoices si WHERE ${conditions.join(' AND ')}
  `, orderedParams)[0]?.v || 0);
  const invoices = Number(db.query<any>(`
    SELECT COUNT(*) AS v FROM sales_invoices si WHERE ${conditions.join(' AND ')}
  `, orderedParams)[0]?.v || 0);
  const netSales = grossSales - returns;
  const netProfit = profit - returns + returnedCost;
  const returnRate = grossSales > 0 ? Number(((returns / grossSales) * 100).toFixed(1)) : 0;
  const visibility = financialFieldVisibility();
  return {
    grossSales: Number(grossSales.toFixed(2)),
    returns: Number(returns.toFixed(2)),
    netSales: Number(netSales.toFixed(2)),
    returnedCost: visibility.cost ? Number(returnedCost.toFixed(2)) : 0,
    netProfit: visibility.profit ? Number(netProfit.toFixed(2)) : 0,
    invoices,
    returnRate,
  };
}
