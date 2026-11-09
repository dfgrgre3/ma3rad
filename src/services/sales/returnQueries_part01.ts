import { AuthService } from '../auth/AuthService';
import type { SalesReturn, SalesReturnItem } from '../../types';
import type { SalesContext } from './context';
import { fetchReturnItems } from './returnQueries_part03';

export function fetchReturns(
  ctx: SalesContext,
  search = '',
  dateFrom?: string,
  dateTo?: string
): (SalesReturn & { customerName: string; invoiceNumber: string })[] {
  AuthService.requireAuth();
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
  return ctx.db.query(sql, params);
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
  return { ...rows[0], items: fetchReturnItems(ctx, id) };
}
