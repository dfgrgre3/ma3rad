import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { round2 } from './financials';
import { postLedgerEntry } from '../database/ledger';
import type { ReorderSuggestion, SupplierRfqRow, SupplierRfqItem, SupplierQuotationRow, SupplierQuotationItem, GoodsReceiptRow, GoodsReceiptItem, SupplierClaimRow, SupplierClaimItem, ThreeWayMatchingResult, LandedCostBreakdownItem, SupplierScorecard, ProductPriceHistoryEntry } from './procurementTypes';
import { ProcurementServicePart07 } from './ProcurementServicePart07';

export abstract class ProcurementServicePart08 extends ProcurementServicePart07 {
public compareSuppliersForProduct(productId: string): Array<{
    supplierId: string;
    supplierName: string;
    lastPrice: number;
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    totalQuantityM2: number;
    lastPurchaseDate: string;
  }> {
    const rows = this.db.query<any>(`
      SELECT
        s.id AS supplierId,
        s.name AS supplierName,
        MIN(pii.unit_cost) AS minPrice,
        MAX(pii.unit_cost) AS maxPrice,
        AVG(pii.unit_cost) AS avgPrice,
        SUM(pii.quantity_m2) AS totalQuantityM2,
        MAX(pi.date) AS lastPurchaseDate
      FROM purchase_invoice_items pii
      JOIN purchase_invoices pi ON pi.id = pii.purchase_id
      JOIN suppliers s ON s.id = pi.supplier_id
      WHERE pii.product_id = ?
      GROUP BY s.id
      ORDER BY minPrice ASC
    `, [productId]);

    return rows.map((r) => {
      const lastRow = this.db.query<any>(`
        SELECT pii.unit_cost AS lastPrice FROM purchase_invoice_items pii
        JOIN purchase_invoices pi ON pi.id = pii.purchase_id
        WHERE pii.product_id = ? AND pi.supplier_id = ?
        ORDER BY pi.date DESC, pi.created_at DESC LIMIT 1
      `, [productId, r.supplierId])[0];
      return {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        lastPrice: round2(Number(lastRow?.lastPrice || r.minPrice)),
        minPrice: round2(Number(r.minPrice)),
        maxPrice: round2(Number(r.maxPrice)),
        avgPrice: round2(Number(r.avgPrice)),
        totalQuantityM2: round2(Number(r.totalQuantityM2)),
        lastPurchaseDate: r.lastPurchaseDate,
      };
    });
  }
}
