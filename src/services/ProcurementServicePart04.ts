import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { round2 } from './financials';
import { postLedgerEntry } from '../database/ledger';
import type { ReorderSuggestion, SupplierRfqRow, SupplierRfqItem, SupplierQuotationRow, SupplierQuotationItem, GoodsReceiptRow, GoodsReceiptItem, SupplierClaimRow, SupplierClaimItem, ThreeWayMatchingResult, LandedCostBreakdownItem, SupplierScorecard, ProductPriceHistoryEntry } from './procurementTypes';
import { getProductUnitLabel } from '../utils/productUnits';
import { ProcurementServicePart03 } from './ProcurementServicePart03';

export abstract class ProcurementServicePart04 extends ProcurementServicePart03 {
public getAllGoodsReceipts(search = '', status = 'ALL'): GoodsReceiptRow[] {
    let sql = `
      SELECT g.*, s.name AS supplierName, w.name AS warehouseName, u.full_name AS createdByName,
        po.order_number AS orderNumber,
        (SELECT COUNT(*) FROM goods_receipt_note_items i WHERE i.grn_id = g.id) AS itemsCount
      FROM goods_receipt_notes g
      JOIN suppliers s ON s.id = g.supplier_id
      JOIN warehouses w ON w.id = g.warehouse_id
      LEFT JOIN purchase_orders po ON po.id = g.purchase_order_id
      LEFT JOIN users u ON u.id = g.created_by
      WHERE 1 = 1
    `;
    const params: any[] = [];
    if (status !== 'ALL') {
      sql += ` AND g.status = ?`;
      params.push(status);
    }
    if (search.trim()) {
      sql += ` AND (g.grn_number LIKE ? OR s.name LIKE ? OR g.delivery_note_number LIKE ? OR po.order_number LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    sql += ` ORDER BY g.created_at DESC`;
    const rows = this.db.query<GoodsReceiptRow>(sql, params);
    if (rows.length === 0) return rows;

    const itemRows = this.db.query<any>(`
      SELECT gi.grn_id AS grnId, p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit,
        SUM(gi.received_quantity_m2) AS totalReceived,
        SUM(gi.accepted_quantity_m2) AS totalAccepted,
        SUM(gi.damaged_quantity_m2) AS totalDamaged,
        SUM(gi.shortage_quantity_m2) AS totalShortage
      FROM goods_receipt_note_items gi
      LEFT JOIN products p ON p.id = gi.product_id
      WHERE gi.grn_id IN (${rows.map(() => '?').join(',')})
      GROUP BY gi.grn_id, p.product_type, p.base_unit, p.custom_unit
    `, rows.map((row) => row.id));
    const breakdownByReceipt = new Map<string, any[]>();
    for (const item of itemRows) {
      const breakdown = breakdownByReceipt.get(item.grnId) || [];
      breakdown.push({
        ...item,
        unitLabel: getProductUnitLabel({ productType: item.productType || 'CERAMIC', baseUnit: item.baseUnit, customUnit: item.customUnit }),
      });
      breakdownByReceipt.set(item.grnId, breakdown);
    }
    return rows.map((row) => ({ ...row, quantityBreakdown: breakdownByReceipt.get(row.id) || [] }));
  }

public getGoodsReceiptById(id: string): (GoodsReceiptRow & { items: GoodsReceiptItem[] }) | null {
    const row = this.db.query<GoodsReceiptRow>(`
      SELECT g.*, s.name AS supplierName, w.name AS warehouseName, u.full_name AS createdByName,
        po.order_number AS orderNumber
      FROM goods_receipt_notes g
      JOIN suppliers s ON s.id = g.supplier_id
      JOIN warehouses w ON w.id = g.warehouse_id
      LEFT JOIN purchase_orders po ON po.id = g.purchase_order_id
      LEFT JOIN users u ON u.id = g.created_by
      WHERE g.id = ?
    `, [id])[0];
    if (!row) return null;

    const items = this.db.query<GoodsReceiptItem>(`
      SELECT gi.*, p.sku AS productSku,
             p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
      FROM goods_receipt_note_items gi
      LEFT JOIN products p ON p.id = gi.product_id
      WHERE gi.grn_id = ?
    `, [id]);

    return { ...row, items };
  }

public validateSupplierInvoiceNumber(supplierId: string, supplierInvoiceNumber?: string, excludeInvoiceId?: string): { isDuplicate: boolean; message?: string } {
    if (!supplierInvoiceNumber || !supplierInvoiceNumber.trim()) {
      return { isDuplicate: false };
    }
    let sql = `
      SELECT id, invoice_number, date FROM purchase_invoices
      WHERE supplier_id = ? AND supplier_invoice_number = ? AND is_no_number_supplier = 0
    `;
    const params: any[] = [supplierId, supplierInvoiceNumber.trim()];
    if (excludeInvoiceId) {
      sql += ` AND id != ?`;
      params.push(excludeInvoiceId);
    }
    const found = this.db.query<any>(sql, params)[0];
    if (found) {
      return {
        isDuplicate: true,
        message: `تم استخدام رقم فاتورة المورد (${supplierInvoiceNumber}) مسبقاً في الفاتورة رقم ${found.invoiceNumber} بتاريخ ${found.date}.`,
      };
    }
    return { isDuplicate: false };
  }

public perform3WayMatching(params: {
    purchaseOrderId?: string;
    grnId?: string;
    invoiceItems: { productId: string; quantityM2: number; unitCost: number }[];
  }): ThreeWayMatchingResult {
    let poItemsMap = new Map<string, { unitCost: number; quantityM2: number }>();
    if (params.purchaseOrderId) {
      const poItems = this.db.query<any>(`SELECT product_id, unit_cost, quantity_m2 FROM purchase_order_items WHERE purchase_order_id = ?`, [params.purchaseOrderId]);
      for (const pi of poItems) {
        poItemsMap.set(pi.productId, { unitCost: Number(pi.unitCost), quantityM2: Number(pi.quantityM2) });
      }
    }

    let grnItemsMap = new Map<string, { acceptedQty: number }>();
    if (params.grnId) {
      const grnItems = this.db.query<any>(`SELECT product_id, accepted_quantity_m2 FROM goods_receipt_note_items WHERE grn_id = ?`, [params.grnId]);
      for (const gi of grnItems) {
        grnItemsMap.set(gi.productId, { acceptedQty: Number(gi.acceptedQuantityM2) });
      }
    }

    let priceVarianceTotal = 0;
    let qtyVarianceTotal = 0;
    const itemsResult: ThreeWayMatchingResult['items'] = [];

    for (const invItem of params.invoiceItems) {
      const prod = this.db.query<any>(`SELECT name FROM products WHERE id = ?`, [invItem.productId])[0];
      const prodName = prod?.name || 'صنف';
      const poData = poItemsMap.get(invItem.productId);
      const grnData = grnItemsMap.get(invItem.productId);

      const poPrice = poData ? poData.unitCost : invItem.unitCost;
      const grnAccepted = grnData ? grnData.acceptedQty : invItem.quantityM2;

      const priceDiff = round2(invItem.unitCost - poPrice);
      const qtyDiff = round2(invItem.quantityM2 - grnAccepted);

      const linePriceVariance = round2(priceDiff * invItem.quantityM2);
      const lineQtyVariance = round2(qtyDiff * invItem.unitCost);

      priceVarianceTotal = round2(priceVarianceTotal + linePriceVariance);
      qtyVarianceTotal = round2(qtyVarianceTotal + lineQtyVariance);

      let status: 'MATCHED' | 'PRICE_DIFF' | 'QTY_DIFF' | 'BOTH_DIFF' = 'MATCHED';
      if (Math.abs(priceDiff) > 0.01 && Math.abs(qtyDiff) > 0.01) status = 'BOTH_DIFF';
      else if (Math.abs(priceDiff) > 0.01) status = 'PRICE_DIFF';
      else if (Math.abs(qtyDiff) > 0.01) status = 'QTY_DIFF';

      itemsResult.push({
        productId: invItem.productId,
        productName: prodName,
        invoiceQty: invItem.quantityM2,
        invoicePrice: invItem.unitCost,
        poPrice,
        grnAcceptedQty: grnAccepted,
        priceVariance: linePriceVariance,
        qtyVariance: lineQtyVariance,
        status,
      });
    }

    let overallStatus: ThreeWayMatchingResult['matchingStatus'] = 'MATCHED';
    if (Math.abs(priceVarianceTotal) > 0.01 && Math.abs(qtyVarianceTotal) > 0.01) overallStatus = 'BOTH_VARIANCE';
    else if (Math.abs(priceVarianceTotal) > 0.01) overallStatus = 'PRICE_VARIANCE';
    else if (Math.abs(qtyVarianceTotal) > 0.01) overallStatus = 'QTY_VARIANCE';

    return {
      matchingStatus: overallStatus,
      priceVarianceTotal,
      qtyVarianceTotal,
      items: itemsResult,
    };
  }
}
