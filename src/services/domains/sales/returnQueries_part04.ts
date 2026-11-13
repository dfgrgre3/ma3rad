import { round2 } from '../finance/financials';
import type { SalesContext } from './context';
import type { ReturnableItem } from '../../../types/sales/serviceTypes';

/** Remaining returnable quantity per original invoice line, after prior returns. */
export function fetchReturnableItems(ctx: SalesContext, invoiceId: string): ReturnableItem[] {
  if (!ctx.getInvoiceById(invoiceId)) return [];
  const rows = ctx.db.query<any>(
    `SELECT sii.id AS invoiceItemId, sii.product_id, sii.product_name, sii.product_grade, sii.size, sii.quantity_m2,
            sii.unit_price, sii.unit_cost, sii.boxes_count, sii.meters_per_box,
            sii.special_stock_id,
            iss.special_number,
            p.pieces_per_box AS piecesPerBox,
            p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
     FROM sales_invoice_items sii
     LEFT JOIN products p ON p.id = sii.product_id
     LEFT JOIN inventory_special_stocks iss ON iss.id = sii.special_stock_id
     WHERE sii.invoice_id = ? ORDER BY sii.rowid`,
    [invoiceId]
  );
  const returnedByLine = new Map<string, number>();
  const legacyReturnedBySource = new Map<string, number>();
  for (const r of ctx.db.query<any>(
    `SELECT sri.invoice_item_id AS invoiceItemId, sri.product_id, sri.special_stock_id,
            COALESCE(SUM(sri.quantity_m2), 0) AS qty
     FROM sales_return_items sri
     JOIN sales_returns sr ON sr.id = sri.return_id
     WHERE sr.original_invoice_id = ?
     GROUP BY sri.invoice_item_id, sri.product_id, sri.special_stock_id`,
    [invoiceId]
  )) {
    if (r.invoiceItemId) returnedByLine.set(String(r.invoiceItemId), Number(r.qty || 0));
    else {
      const key = `${r.productId}|${r.specialStockId || ''}`;
      legacyReturnedBySource.set(key, Number(r.qty || 0));
    }
  }
  const items: ReturnableItem[] = [];
  for (const r of rows) {
    const specialStockId = r.specialStockId ? String(r.specialStockId) : null;
    const soldM2 = round2(Number(r.quantityM2 || 0));
    const legacyKey = `${r.productId}|${specialStockId || ''}`;
    const legacyRemaining = Number(legacyReturnedBySource.get(legacyKey) || 0);
    const legacyAllocation = round2(Math.min(soldM2, legacyRemaining));
    if (legacyAllocation > 0) legacyReturnedBySource.set(legacyKey, round2(legacyRemaining - legacyAllocation));
    const returnedM2 = round2((returnedByLine.get(String(r.invoiceItemId)) || 0) + legacyAllocation);
    items.push({
      invoiceItemId: String(r.invoiceItemId),
      productId: r.productId,
      productName: r.productName,
      grade: r.productGrade,
      size: r.size,
      soldM2,
      returnedM2,
      returnableM2: round2(Math.max(0, soldM2 - returnedM2)),
      unitPrice: Number(r.unitPrice || 0),
      unitCost: Number(r.unitCost || 0),
      boxesCount: Number(r.boxesCount || 0),
      metersPerBox: Number(r.metersPerBox) || 1.44,
      piecesPerBox: Number(r.piecesPerBox) || 1,
      productType: r.productType,
      baseUnit: r.baseUnit,
      customUnit: r.customUnit,
      specialStockId,
      specialNumber: r.specialNumber ? String(r.specialNumber) : null,
      sourceType: specialStockId ? 'SPECIAL_STOCK_SALE' : 'INVOICE',
      defaultDisposition: specialStockId ? 'SPECIAL_STOCK' : 'RESTOCK',
    });
  }
  return items;
}
