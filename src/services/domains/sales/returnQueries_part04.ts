import { round2 } from '../finance/financials';
import type { SalesContext } from './context';
import type { ReturnableItem } from '../../../types/sales/serviceTypes';

/** Stable key so a product sold from regular stock and from a special-stock record stays separate. */
function returnableKey(productId: string, specialStockId: string | null): string {
  return `${productId}|${specialStockId || ''}`;
}

/** Remaining returnable quantity per product/source for an invoice, after prior returns. */
export function fetchReturnableItems(ctx: SalesContext, invoiceId: string): ReturnableItem[] {
  if (!ctx.getInvoiceById(invoiceId)) return [];
  const rows = ctx.db.query<any>(
    `SELECT sii.product_id, sii.product_name, sii.product_grade, sii.size, sii.quantity_m2,
            sii.unit_price, sii.unit_cost, sii.boxes_count, sii.meters_per_box,
            sii.special_stock_id,
            iss.special_number,
            p.pieces_per_box AS piecesPerBox,
            p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
     FROM sales_invoice_items sii
     LEFT JOIN products p ON p.id = sii.product_id
     LEFT JOIN inventory_special_stocks iss ON iss.id = sii.special_stock_id
     WHERE sii.invoice_id = ?`,
    [invoiceId]
  );
  // Group the already-returned quantity by the same source so returning a
  // discounted line can never consume the allowance of the regular stock line
  // (or of a different discounted batch).
  const returned = new Map<string, number>();
  for (const r of ctx.db.query<any>(
    `SELECT sri.product_id, sri.special_stock_id,
            COALESCE(SUM(sri.quantity_m2), 0) AS qty
     FROM sales_return_items sri
     JOIN sales_returns sr ON sr.id = sri.return_id
     WHERE sr.original_invoice_id = ?
     GROUP BY sri.product_id, sri.special_stock_id`,
    [invoiceId]
  )) {
    returned.set(
      returnableKey(String(r.productId), r.specialStockId ? String(r.specialStockId) : null),
      Number(r.qty || 0)
    );
  }
  const map = new Map<string, ReturnableItem>();
  for (const r of rows) {
    const specialStockId = r.specialStockId ? String(r.specialStockId) : null;
    const key = returnableKey(String(r.productId), specialStockId);
    const existing = map.get(key);
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
      map.set(key, {
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
        specialStockId,
        specialNumber: r.specialNumber ? String(r.specialNumber) : null,
        sourceType: specialStockId ? 'SPECIAL_STOCK_SALE' : 'INVOICE',
        defaultDisposition: specialStockId ? 'SPECIAL_STOCK' : 'RESTOCK',
      });
    }
  }
  return Array.from(map.entries()).map(([key, item]) => {
    const returnedM2 = round2(returned.get(key) || 0);
    return {
      ...item,
      returnedM2,
      returnableM2: round2(Math.max(0, item.soldM2 - returnedM2)),
    };
  });
}
