import { AuthService } from '../AuthService';
import { localDateString } from '../../utils/date';
import { round2 } from '../financials';
import type { SalesReturn, SalesReturnItem } from '../../types';
import type { SalesContext } from './context';
import type { ReturnableItem, ReturnStats } from './types';

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

export function fetchReturnStats(ctx: SalesContext): ReturnStats {
  AuthService.requireAuth();
  const today = localDateString();
  const scope = ctx.branchAccess.sqlScope('si.branch_id', 'w.branch_id');
  const row = ctx.db.query<any>(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(total_amount), 0) AS totalAmount,
            COALESCE(SUM(refunded_amount), 0) AS cashRefunded,
            COALESCE(SUM(remaining_to_balance), 0) AS creditedToBalance,
            COALESCE(SUM(CASE WHEN date = ? THEN 1 ELSE 0 END), 0) AS todayCount,
            COALESCE(SUM(CASE WHEN date = ? THEN total_amount ELSE 0 END), 0) AS todayAmount
     FROM sales_returns sr
     JOIN sales_invoices si ON si.id = sr.original_invoice_id
     JOIN warehouses w ON w.id = si.warehouse_id
     WHERE ${scope.clause}`,
    [today, today, ...scope.params]
  )[0] || {};
  return {
    count: Number(row.count || 0),
    totalAmount: Number(row.totalAmount || 0),
    cashRefunded: Number(row.cashRefunded || 0),
    creditedToBalance: Number(row.creditedToBalance || 0),
    todayCount: Number(row.todayCount || 0),
    todayAmount: Number(row.todayAmount || 0),
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
  );
}

/** Remaining returnable quantity per product for an invoice, after prior returns. */
export function fetchReturnableItems(ctx: SalesContext, invoiceId: string): ReturnableItem[] {
  if (!ctx.getInvoiceById(invoiceId)) return [];
  const rows = ctx.db.query<any>(
    `SELECT sii.product_id, sii.product_name, sii.product_grade, sii.size, sii.quantity_m2,
            sii.unit_price, sii.unit_cost, sii.boxes_count, sii.meters_per_box,
            p.pieces_per_box AS piecesPerBox,
            p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
     FROM sales_invoice_items sii
     LEFT JOIN products p ON p.id = sii.product_id
     WHERE sii.invoice_id = ?`,
    [invoiceId]
  );
  const returned = new Map<string, number>();
  for (const r of ctx.db.query<any>(
    `SELECT sri.product_id, COALESCE(SUM(sri.quantity_m2), 0) AS qty
     FROM sales_return_items sri
     JOIN sales_returns sr ON sr.id = sri.return_id
     WHERE sr.original_invoice_id = ?
     GROUP BY sri.product_id`,
    [invoiceId]
  )) {
    returned.set(r.productId, Number(r.qty || 0));
  }
  const map = new Map<string, ReturnableItem>();
  for (const r of rows) {
    const existing = map.get(r.productId);
    if (existing) {
      const priorQuantity = existing.soldM2;
      const lineQuantity = Number(r.quantityM2 || 0);
      const combinedQuantity = priorQuantity + lineQuantity;
      if (combinedQuantity > 0) {
        existing.unitPrice = round2((existing.unitPrice * priorQuantity + Number(r.unitPrice || 0) * lineQuantity) / combinedQuantity);
        existing.unitCost = round2((existing.unitCost * priorQuantity + Number(r.unitCost || 0) * lineQuantity) / combinedQuantity);
      }
      existing.soldM2 = round2(combinedQuantity);
      existing.boxesCount = round2(existing.boxesCount + Number(r.boxesCount || 0));
    } else {
      map.set(r.productId, {
        productId: r.productId,
        productName: r.productName,
        grade: r.productGrade,
        size: r.size,
        soldM2: round2(Number(r.quantityM2 || 0)),
        returnedM2: 0,
        returnableM2: 0,
        unitPrice: Number(r.unitPrice || 0),
        unitCost: Number(r.unitCost || 0),
        boxesCount: Number(r.boxesCount || 0),
        metersPerBox: Number(r.metersPerBox) || 1.44,
        piecesPerBox: Number(r.piecesPerBox) || 1,
        productType: r.productType,
        baseUnit: r.baseUnit,
        customUnit: r.customUnit,
      });
    }
  }
  return Array.from(map.values()).map((item) => {
    const returnedM2 = round2(returned.get(item.productId) || 0);
    return {
      ...item,
      returnedM2,
      returnableM2: round2(Math.max(0, item.soldM2 - returnedM2)),
    };
  });
}
