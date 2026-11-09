import { AuthService } from '../auth/AuthService';
import { localDateString } from '../../utils/shared/date';
import type { SalesContext } from './context';
import type { ReturnStats } from '../../types/sales/serviceTypes';

export function fetchReturnStats(ctx: SalesContext): ReturnStats {
  AuthService.requireAuth();
  const today = localDateString();
  const scope = ctx.branchAccess.sqlScope('si.branch_id', 'w.branch_id');
  const row = ctx.db.query<any>(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(sr.total_amount), 0) AS totalAmount,
            COALESCE(SUM(sr.return_tax_amount), 0) AS taxAmount,
            COALESCE(SUM(sr.total_amount + COALESCE(sr.return_tax_amount, 0)), 0) AS grossAmount,
            COALESCE(SUM(CASE WHEN sr.return_tax_amount IS NULL THEN 1 ELSE 0 END), 0) AS returnsWithoutRecordedTax,
            COALESCE(SUM(sr.refunded_amount), 0) AS cashRefunded,
            COALESCE(SUM(sr.remaining_to_balance), 0) AS creditedToBalance,
            COALESCE(SUM(CASE WHEN sr.date = ? THEN 1 ELSE 0 END), 0) AS todayCount,
            COALESCE(SUM(CASE WHEN sr.date = ? THEN sr.total_amount ELSE 0 END), 0) AS todayAmount,
            COALESCE(SUM(CASE WHEN sr.date = ? THEN COALESCE(sr.return_tax_amount, 0) ELSE 0 END), 0) AS todayTaxAmount,
            COALESCE(SUM(CASE WHEN sr.date = ? THEN sr.total_amount + COALESCE(sr.return_tax_amount, 0) ELSE 0 END), 0) AS todayGrossAmount
     FROM sales_returns sr
     JOIN sales_invoices si ON si.id = sr.original_invoice_id
     JOIN warehouses w ON w.id = si.warehouse_id
     WHERE ${scope.clause}`,
    [today, today, today, today, ...scope.params]
  )[0] || {};
  return {
    count: Number(row.count || 0),
    totalAmount: Number(row.totalAmount || 0),
    taxAmount: Number(row.taxAmount || 0),
    grossAmount: Number(row.grossAmount || 0),
    returnsWithoutRecordedTax: Number(row.returnsWithoutRecordedTax || 0),
    cashRefunded: Number(row.cashRefunded || 0),
    creditedToBalance: Number(row.creditedToBalance || 0),
    todayCount: Number(row.todayCount || 0),
    todayAmount: Number(row.todayAmount || 0),
    todayTaxAmount: Number(row.todayTaxAmount || 0),
    todayGrossAmount: Number(row.todayGrossAmount || 0),
  };
}

export function fetchTopReturnReasons(
  ctx: SalesContext,
  limit = 5
): { reason: string; count: number; amount: number }[] {
  AuthService.requireAuth();
  const scope = ctx.branchAccess.sqlScope('si.branch_id', 'w.branch_id');
  return ctx.db.query<any>(
    `SELECT sr.reason, COUNT(*) AS count, COALESCE(SUM(sr.total_amount), 0) AS amount
     FROM sales_returns sr
     JOIN sales_invoices si ON si.id = sr.original_invoice_id
     JOIN warehouses w ON w.id = si.warehouse_id
     WHERE ${scope.clause}
     GROUP BY sr.reason
     ORDER BY count DESC, amount DESC
     LIMIT ?`,
    [...scope.params, Math.max(1, Math.min(20, limit))]
  ).map((row) => ({
    reason: row.reason || 'غير محدد',
    count: Number(row.count || 0),
    amount: Number(row.amount || 0),
  }));
}
