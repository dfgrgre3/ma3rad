import { AuthService } from '../auth/AuthService';
import { financialFieldVisibility, maskSensitiveFields } from '../auth/sensitiveFields';
import type { CustomerPayment, SalesInvoice, SalesInvoiceItem } from '../../../types';
import type { SalesContext } from './context';
import type { InvoiceFilters, InvoiceStats } from '../../../types/sales/serviceTypes';
import { buildInvoiceWhere } from './invoiceQueries_part01';
import { unscaleMoneyRow } from '../../../utils/money';

const INVOICE_MONEY_FIELDS = [
  'subtotal', 'discount_amount', 'tax_amount', 'shipping_cost', 'extra_fees',
  'total_amount', 'paid_amount', 'remaining_amount', 'total_cost', 'gross_profit', 'returned_amount',
] as const;
const INVOICE_ITEM_MONEY_FIELDS = [
  'unit_price', 'original_unit_price', 'unit_cost', 'discount_amount',
  'total_price', 'total_cost', 'profit',
] as const;

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
       COALESCE(SUM(si.total_amount) / 100.0, 0) AS totalAmount,
       COALESCE(SUM(si.paid_amount) / 100.0, 0) AS paidAmount,
       COALESCE(SUM(si.remaining_amount) / 100.0, 0) AS remainingAmount,
       COALESCE(SUM(si.returned_amount) / 100.0, 0) AS returnedAmount,
       COALESCE(SUM(si.total_cost) / 100.0, 0) AS totalCost,
       COALESCE(SUM(si.gross_profit) / 100.0, 0) AS grossProfit
     FROM sales_invoices si
     JOIN customers c ON si.customer_id = c.id
     JOIN warehouses w ON si.warehouse_id = w.id
     ${where}`,
    params
  )[0] || {};
  const visibility = financialFieldVisibility();
  return {
    count: Number(row.count || 0),
    totalAmount: Number(row.totalAmount || 0),
    paidAmount: Number(row.paidAmount || 0),
    remainingAmount: Number(row.remainingAmount || 0),
    returnedAmount: Number(row.returnedAmount || 0),
    totalCost: visibility.cost ? Number(row.totalCost || 0) : 0,
    grossProfit: visibility.profit ? Number(row.grossProfit || 0) : 0,
  };
}

export function fetchInvoiceById(
  ctx: SalesContext,
  id: string
): (SalesInvoice & { items: SalesInvoiceItem[] }) | null {
  AuthService.requireAuth();
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
  const visibility = financialFieldVisibility();
  const inv = unscaleMoneyRow(invoices[0], INVOICE_MONEY_FIELDS);
  maskSensitiveFields(inv, ['totalCost'], visibility.cost);
  maskSensitiveFields(inv, ['grossProfit'], visibility.profit);
  const items = ctx.db.query<SalesInvoiceItem>(`
    SELECT sii.*, p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
    FROM sales_invoice_items sii
    LEFT JOIN products p ON p.id = sii.product_id
    WHERE sii.invoice_id = ?
  `, [id]).map((item) => {
    const mapped = unscaleMoneyRow(item, INVOICE_ITEM_MONEY_FIELDS);
    maskSensitiveFields(mapped, ['unitCost', 'totalCost'], visibility.cost);
    maskSensitiveFields(mapped, ['profit'], visibility.profit);
    return mapped;
  });
  return { ...inv, items };
}

export async function fetchInvoiceStatsAsync(
  ctx: SalesContext,
  filters: InvoiceFilters = {},
  includeVoid = true
): Promise<InvoiceStats> {
  AuthService.requireAuth();
  const { where, params } = buildInvoiceWhere(ctx.branchAccess, filters, includeVoid);
  const rows = await ctx.db.queryAsync<any>(
    `SELECT
       COUNT(*) AS count,
       COALESCE(SUM(si.total_amount) / 100.0, 0) AS totalAmount,
       COALESCE(SUM(si.paid_amount) / 100.0, 0) AS paidAmount,
       COALESCE(SUM(si.remaining_amount) / 100.0, 0) AS remainingAmount,
       COALESCE(SUM(si.returned_amount) / 100.0, 0) AS returnedAmount,
       COALESCE(SUM(si.total_cost) / 100.0, 0) AS totalCost,
       COALESCE(SUM(si.gross_profit) / 100.0, 0) AS grossProfit
     FROM sales_invoices si
     JOIN customers c ON si.customer_id = c.id
     JOIN warehouses w ON si.warehouse_id = w.id
     ${where}`,
    params
  );
  const row = rows[0] || {};
  const visibility = financialFieldVisibility();
  return {
    count: Number(row.count || 0),
    totalAmount: Number(row.totalAmount || 0),
    paidAmount: Number(row.paidAmount || 0),
    remainingAmount: Number(row.remainingAmount || 0),
    returnedAmount: Number(row.returnedAmount || 0),
    totalCost: visibility.cost ? Number(row.totalCost || 0) : 0,
    grossProfit: visibility.profit ? Number(row.grossProfit || 0) : 0,
  };
}

export async function fetchInvoiceByIdAsync(
  ctx: SalesContext,
  id: string
): Promise<(SalesInvoice & { items: SalesInvoiceItem[] }) | null> {
  AuthService.requireAuth();
  const scope = ctx.branchAccess.sqlScope('si.branch_id', 'w.branch_id');
  const companyScope = ctx.branchAccess.companyScope('si.company_id');
  const [invoices, itemRows] = await Promise.all([
    ctx.db.queryAsync<SalesInvoice>(`
      SELECT si.*, c.name as customerName, c.phone as customerPhone, c.address as customerAddress,
             c.current_balance as customerBalance, c.credit_limit as customerCreditLimit,
             w.name as warehouseName, u.full_name as createdByName
      FROM sales_invoices si
      JOIN customers c ON si.customer_id = c.id
      JOIN warehouses w ON si.warehouse_id = w.id
      LEFT JOIN users u ON si.created_by = u.id
      WHERE si.id = ? AND ${scope.clause} AND ${companyScope.clause}
    `, [id, ...scope.params, ...companyScope.params]),
    ctx.db.queryAsync<SalesInvoiceItem>(`
      SELECT sii.*, p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
      FROM sales_invoice_items sii
      LEFT JOIN products p ON p.id = sii.product_id
      WHERE sii.invoice_id = ?
    `, [id]),
  ]);

  if (invoices.length === 0) return null;
  const visibility = financialFieldVisibility();
  const inv = unscaleMoneyRow(invoices[0], INVOICE_MONEY_FIELDS);
  maskSensitiveFields(inv, ['totalCost'], visibility.cost);
  maskSensitiveFields(inv, ['grossProfit'], visibility.profit);
  const items = itemRows.map((item) => {
    const mapped = unscaleMoneyRow(item, INVOICE_ITEM_MONEY_FIELDS);
    maskSensitiveFields(mapped, ['unitCost', 'totalCost'], visibility.cost);
    maskSensitiveFields(mapped, ['profit'], visibility.profit);
    return mapped;
  });
  return { ...inv, items };
}

export function fetchInvoicePayments(ctx: SalesContext, invoiceId: string): CustomerPayment[] {
  const invoice = ctx.getInvoiceById(invoiceId);
  if (!invoice) return [];
  const rows = ctx.db.query<CustomerPayment>(
    `SELECT * FROM customer_payments WHERE invoice_id = ? ORDER BY created_at ASC`,
    [invoiceId]
  );
  return rows.map((row) => unscaleMoneyRow(row, ['amount']));
}

export async function fetchInvoicePaymentsAsync(ctx: SalesContext, invoiceId: string): Promise<CustomerPayment[]> {
  const invoice = ctx.getInvoiceById(invoiceId);
  if (!invoice) return [];
  const rows = await ctx.db.queryAsync<CustomerPayment>(
    `SELECT * FROM customer_payments WHERE invoice_id = ? ORDER BY created_at ASC`,
    [invoiceId]
  );
  return rows.map((row) => unscaleMoneyRow(row, ['amount']));
}
