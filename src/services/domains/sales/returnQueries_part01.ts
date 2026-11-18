import { AuthService } from '../auth/AuthService';
import type { SalesReturn, SalesReturnItem } from '../../../types';
import type { SalesContext } from './context';
import { fetchReturnItems, fetchReturnItemsAsync } from './returnQueries_part03';
import { unscaleMoneyRow } from '../../../utils/money';

const RETURN_ROW_MONEY_FIELDS = [
  'total_amount', 'return_tax_amount', 'refunded_amount', 'remaining_to_balance',
] as const;

export function fetchReturns(
  ctx: SalesContext,
  search = '',
  dateFrom?: string,
  dateTo?: string
): (SalesReturn & { customerName: string; invoiceNumber: string })[] {
  AuthService.requireAuth();
  const { sql, params } = buildReturnsSql(ctx, search, dateFrom, dateTo);
  return ctx.db.query(sql, params).map((row) => unscaleMoneyRow(row, RETURN_ROW_MONEY_FIELDS));
}

export async function fetchReturnsAsync(
  ctx: SalesContext,
  search = '',
  dateFrom?: string,
  dateTo?: string
): Promise<(SalesReturn & { customerName: string; invoiceNumber: string })[]> {
  AuthService.requireAuth();
  const { sql, params } = buildReturnsSql(ctx, search, dateFrom, dateTo);
  const rows = await ctx.db.queryAsync<SalesReturn & { customerName: string; invoiceNumber: string }>(sql, params);
  return rows.map((row) => unscaleMoneyRow(row, RETURN_ROW_MONEY_FIELDS));
}

function buildReturnsSql(
  ctx: SalesContext,
  search: string,
  dateFrom?: string,
  dateTo?: string
): { sql: string; params: any[] } {
  const scope = ctx.branchAccess.sqlScope('si.branch_id', 'w.branch_id');
  let sql = `
    SELECT sr.*, c.name as customerName, sr.original_invoice_number as invoiceNumber
    FROM sales_returns sr
    JOIN customers c ON c.id = sr.customer_id
    JOIN sales_invoices si ON si.id = sr.original_invoice_id
    JOIN warehouses w ON w.id = si.warehouse_id
    WHERE ${scope.clause}`;
  const params: any[] = [...scope.params];
  if (search.trim()) {
    sql += ` AND (sr.return_number LIKE ? OR c.name LIKE ? OR sr.original_invoice_number LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }
  if (dateFrom) {
    sql += ` AND sr.date >= ?`;
    params.push(dateFrom);
  }
  if (dateTo) {
    sql += ` AND sr.date <= ?`;
    params.push(dateTo);
  }
  sql += ` ORDER BY sr.date DESC, sr.created_at DESC`;
  return { sql, params };
}

export function fetchReturnById(
  ctx: SalesContext,
  id: string
): (SalesReturn & { items: SalesReturnItem[]; customerName?: string; invoiceNumber?: string }) | null {
  AuthService.requireAuth();
  const scope = ctx.branchAccess.sqlScope('si.branch_id', 'w.branch_id');
  const rows = ctx.db.query<SalesReturn & { customerName: string; invoiceNumber: string }>(
    `SELECT sr.*, c.name as customerName, sr.original_invoice_number as invoiceNumber
     FROM sales_returns sr
     JOIN customers c ON c.id = sr.customer_id
     JOIN sales_invoices si ON si.id = sr.original_invoice_id
     JOIN warehouses w ON w.id = si.warehouse_id
     WHERE sr.id = ? AND ${scope.clause}`,
    [id, ...scope.params]
  );
  if (rows.length === 0) return null;
  return { ...unscaleMoneyRow(rows[0], RETURN_ROW_MONEY_FIELDS), items: fetchReturnItems(ctx, id) };
}

export async function fetchReturnByIdAsync(
  ctx: SalesContext,
  id: string
): Promise<(SalesReturn & { items: SalesReturnItem[]; customerName?: string; invoiceNumber?: string }) | null> {
  AuthService.requireAuth();
  const scope = ctx.branchAccess.sqlScope('si.branch_id', 'w.branch_id');
  const rows = await ctx.db.queryAsync<SalesReturn & { customerName: string; invoiceNumber: string }>(
    `SELECT sr.*, c.name as customerName, sr.original_invoice_number as invoiceNumber
     FROM sales_returns sr
     JOIN customers c ON c.id = sr.customer_id
     JOIN sales_invoices si ON si.id = sr.original_invoice_id
     JOIN warehouses w ON w.id = si.warehouse_id
     WHERE sr.id = ? AND ${scope.clause}`,
    [id, ...scope.params]
  );
  if (rows.length === 0) return null;
  const items = await fetchReturnItemsAsync(ctx, id);
  return { ...unscaleMoneyRow(rows[0], RETURN_ROW_MONEY_FIELDS), items };
}
