import type { SalesReturnItem } from '../../../types';
import type { SalesContext } from './context';
import { unscaleMoneyRow } from '../../../utils/money';

const RETURN_ITEM_MONEY_FIELDS = ['unit_price', 'unit_cost', 'total_refund'] as const;

export function fetchReturnItems(ctx: SalesContext, returnId: string): SalesReturnItem[] {
  const scope = ctx.branchAccess.sqlScope('si.branch_id', 'w.branch_id');
  if (!ctx.db.query(
    `SELECT sr.id FROM sales_returns sr
     JOIN sales_invoices si ON si.id = sr.original_invoice_id
     JOIN warehouses w ON w.id = si.warehouse_id
     WHERE sr.id = ? AND ${scope.clause}`,
    [returnId, ...scope.params]
  ).length) return [];
  return ctx.db.query<SalesReturnItem>(
    `SELECT sri.*, COALESCE(p.product_type, 'CERAMIC') AS productType,
            p.base_unit AS baseUnit, p.custom_unit AS customUnit
     FROM sales_return_items sri
     JOIN sales_returns sr ON sr.id = sri.return_id
     JOIN sales_invoices si ON si.id = sr.original_invoice_id
     JOIN warehouses w ON w.id = si.warehouse_id
     LEFT JOIN products p ON p.id = sri.product_id
     WHERE sri.return_id = ? AND ${scope.clause}`,
    [returnId, ...scope.params]
  ).map((row) => unscaleMoneyRow(row, RETURN_ITEM_MONEY_FIELDS));
}

export async function fetchReturnItemsAsync(ctx: SalesContext, returnId: string): Promise<SalesReturnItem[]> {
  const scope = ctx.branchAccess.sqlScope('si.branch_id', 'w.branch_id');
  const accessRows = await ctx.db.queryAsync(
    `SELECT sr.id FROM sales_returns sr
     JOIN sales_invoices si ON si.id = sr.original_invoice_id
     JOIN warehouses w ON w.id = si.warehouse_id
     WHERE sr.id = ? AND ${scope.clause}`,
    [returnId, ...scope.params]
  );
  if (!accessRows.length) return [];
  const rows = await ctx.db.queryAsync<SalesReturnItem>(
    `SELECT sri.*, COALESCE(p.product_type, 'CERAMIC') AS productType,
            p.base_unit AS baseUnit, p.custom_unit AS customUnit
     FROM sales_return_items sri
     JOIN sales_returns sr ON sr.id = sri.return_id
     JOIN sales_invoices si ON si.id = sr.original_invoice_id
     JOIN warehouses w ON w.id = si.warehouse_id
     LEFT JOIN products p ON p.id = sri.product_id
     WHERE sri.return_id = ? AND ${scope.clause}`,
    [returnId, ...scope.params]
  );
  return rows.map((row) => unscaleMoneyRow(row, RETURN_ITEM_MONEY_FIELDS));
}
