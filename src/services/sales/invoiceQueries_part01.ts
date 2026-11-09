import { AuthService } from '../auth/AuthService';
import type { BranchAccessService } from '../auth/BranchAccessService';
import type { SalesInvoice } from '../../types';
import type { SalesContext } from './context';
import type { InvoiceFilters } from '../../types/sales/serviceTypes';

export function buildInvoiceWhere(
  branchAccess: BranchAccessService,
  filters: InvoiceFilters,
  includeVoid: boolean
): { where: string; params: any[] } {
  const scope = branchAccess.sqlScope('si.branch_id', 'w.branch_id');
  const companyScope = branchAccess.companyScope('si.company_id');
  let where = `WHERE ${scope.clause} AND ${companyScope.clause}`;
  const params: any[] = [...scope.params, ...companyScope.params];

  if (filters.invoiceStatus && filters.invoiceStatus !== 'ALL') {
    where += ` AND si.invoice_status = ?`;
    params.push(filters.invoiceStatus);
  } else if (!includeVoid) {
    where += ` AND si.invoice_status != 'VOID'`;
  }

  if (filters.paymentStatus && filters.paymentStatus !== 'ALL') {
    where += ` AND si.payment_status = ?`;
    params.push(filters.paymentStatus);
  }
  if (filters.customerId) {
    where += ` AND si.customer_id = ?`;
    params.push(filters.customerId);
  }
  if (filters.warehouseId) {
    where += ` AND si.warehouse_id = ?`;
    params.push(filters.warehouseId);
  }
  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    where += ` AND (si.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)`;
    params.push(term, term, term);
  }
  if (filters.dateFrom) {
    where += ` AND si.date >= ?`;
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where += ` AND si.date <= ?`;
    params.push(filters.dateTo);
  }
  return { where, params };
}

export function fetchInvoicesFiltered(
  ctx: SalesContext,
  filters: InvoiceFilters = {},
  includeVoid = true
): (SalesInvoice & { returnedAmount?: number; returnBalanceCredit?: number; itemsCount?: number })[] {
  AuthService.requireAuth();
  const { where, params } = buildInvoiceWhere(ctx.branchAccess, filters, includeVoid);
  return ctx.db.query<SalesInvoice & { returnedAmount?: number; returnBalanceCredit?: number; itemsCount?: number }>(
    `SELECT si.*, c.name as customerName, c.phone as customerPhone, c.address as customerAddress,
            w.name as warehouseName, u.full_name as createdByName,
            (SELECT COUNT(*) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id) AS itemsCount,
            (SELECT COALESCE(SUM(sr.remaining_to_balance), 0) FROM sales_returns sr
             WHERE sr.original_invoice_id = si.id) AS returnBalanceCredit
     FROM sales_invoices si
     JOIN customers c ON si.customer_id = c.id
     JOIN warehouses w ON si.warehouse_id = w.id
     LEFT JOIN users u ON si.created_by = u.id
     ${where}
     ORDER BY si.created_at DESC`,
    params
  );
}
