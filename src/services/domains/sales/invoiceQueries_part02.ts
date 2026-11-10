import { AuthService } from '../auth/AuthService';
import type { CustomerPayment, SalesInvoice, SalesInvoiceItem } from '../../../types';
import type { SalesContext } from './context';
import type { InvoiceFilters, InvoiceStats } from '../../../types/sales/serviceTypes';
import { buildInvoiceWhere } from './invoiceQueries_part01';

export function fetchInvoiceStats(
  ctx: SalesContext,
  filters: InvoiceFilters = {},
  includeVoid = true
): InvoiceStats {
  AuthService.requireAuth();
  const { where, params } = buildInvoiceWhere(ctx.branchAccess, filters, includeVoid);
  const row = ctx.db.query<any>(
    `SELECT
       COUNT(*) AS count,
       COALESCE(SUM(si.total_amount), 0) AS totalAmount,
       COALESCE(SUM(si.paid_amount), 0) AS paidAmount,
       COALESCE(SUM(si.remaining_amount), 0) AS remainingAmount,
       COALESCE(SUM(si.returned_amount), 0) AS returnedAmount,
       COALESCE(SUM(si.total_cost), 0) AS totalCost,
       COALESCE(SUM(si.gross_profit), 0) AS grossProfit
     FROM sales_invoices si
     JOIN customers c ON si.customer_id = c.id
     JOIN warehouses w ON si.warehouse_id = w.id
     ${where}`,
    params
  )[0] || {};
  return {
    count: Number(row.count || 0),
    totalAmount: Number(row.totalAmount || 0),
    paidAmount: Number(row.paidAmount || 0),
    remainingAmount: Number(row.remainingAmount || 0),
    returnedAmount: Number(row.returnedAmount || 0),
    totalCost: Number(row.totalCost || 0),
    grossProfit: Number(row.grossProfit || 0),
  };
}

export function fetchInvoiceById(
  ctx: SalesContext,
  id: string
): (SalesInvoice & { items: SalesInvoiceItem[] }) | null {
  AuthService.requireAuth();
  const actor = AuthService.getCurrentUser();
  const scope = ctx.branchAccess.sqlScope('si.branch_id', 'w.branch_id');
  const companyScope = ctx.branchAccess.companyScope('si.company_id');
  const invoices = ctx.db.query<SalesInvoice>(`
    SELECT si.*, c.name as customerName, c.phone as customerPhone, c.address as customerAddress,
           c.current_balance as customerBalance, c.credit_limit as customerCreditLimit,
           w.name as warehouseName, u.full_name as createdByName
    FROM sales_invoices si
    JOIN customers c ON si.customer_id = c.id
    JOIN warehouses w ON si.warehouse_id = w.id
    LEFT JOIN users u ON si.created_by = u.id
    WHERE si.id = ? AND ${scope.clause} AND ${companyScope.clause}
  `, [id, ...scope.params, ...companyScope.params]);

  if (invoices.length === 0) return null;
  const inv = invoices[0];
  const items = ctx.db.query<SalesInvoiceItem>(`
    SELECT sii.*, p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
    FROM sales_invoice_items sii
    LEFT JOIN products p ON p.id = sii.product_id
    WHERE sii.invoice_id = ?
  `, [id]);
  return { ...inv, items };
}

export function fetchInvoicePayments(ctx: SalesContext, invoiceId: string): CustomerPayment[] {
  const invoice = ctx.getInvoiceById(invoiceId);
  if (!invoice) return [];
  return ctx.db.query<CustomerPayment>(
    `SELECT * FROM customer_payments WHERE invoice_id = ? ORDER BY created_at ASC`,
    [invoiceId]
  );
}
