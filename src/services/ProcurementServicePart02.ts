import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { round2 } from './financials';
import { postLedgerEntry } from '../database/ledger';
import type { ReorderSuggestion, SupplierRfqRow, SupplierRfqItem, SupplierQuotationRow, SupplierQuotationItem, GoodsReceiptRow, GoodsReceiptItem, SupplierClaimRow, SupplierClaimItem, ThreeWayMatchingResult, LandedCostBreakdownItem, SupplierScorecard, ProductPriceHistoryEntry } from './procurementTypes';
import { ProcurementServicePart01 } from './ProcurementServicePart01';

export abstract class ProcurementServicePart02 extends ProcurementServicePart01 {
public compareQuotationsForRfq(rfqId: string) {
    const rfq = this.getRfqById(rfqId);
    if (!rfq) throw new Error('طلب عروض الأسعار غير موجود.');
    const quotations = rfq.quotations || [];
    const bestPriceByProduct: Record<string, { unitCost: number; supplierId: string; supplierName: string }> = {};

    for (const q of quotations) {
      for (const it of q.items || []) {
        if (!bestPriceByProduct[it.productId] || it.unitCost < bestPriceByProduct[it.productId].unitCost) {
          bestPriceByProduct[it.productId] = {
            unitCost: it.unitCost,
            supplierId: q.supplierId,
            supplierName: q.supplierName || '',
          };
        }
      }
    }

    return {
      rfq,
      quotations,
      bestPriceByProduct,
      lowestTotalQuotation: quotations[0] || null,
    };
  }

public addSupplierQuotation(dto: {
    rfqId: string;
    supplierId: string;
    quotationNumber: string;
    date?: string;
    validUntil?: string;
    deliveryDays?: number;
    paymentTerms?: string;
    qualityRating?: string;
    notes?: string;
    items: { rfqItemId?: string; productId: string; quantityM2: number; unitCost: number; notes?: string }[];
  }): SupplierQuotationRow {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.create');
    const rfq = this.getRfqById(dto.rfqId);
    if (!rfq) throw new Error('طلب عروض الأسعار غير موجود.');
    if (rfq.status === 'AWARDED' || rfq.status === 'CANCELLED') throw new Error('لا يمكن إضافة عروض لهذا الطلب بعد الإغلاق.');

    const quoteId = `sq_${uuidv4().substring(0, 8)}`;
    const today = dto.date || localDateString();

    return this.db.executeTransaction((db) => {
      let totalAmount = 0;
      for (const item of dto.items) {
        totalAmount = round2(totalAmount + Number(item.quantityM2) * Number(item.unitCost));
      }

      db.run(`
        INSERT INTO supplier_quotations (
          id, rfq_id, supplier_id, quotation_number, date, valid_until,
          total_amount, delivery_days, payment_terms, quality_rating, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)
      `, [
        quoteId, dto.rfqId, dto.supplierId, dto.quotationNumber, today, dto.validUntil || null,
        totalAmount, dto.deliveryDays || 7, dto.paymentTerms || 'CASH', dto.qualityRating || 'GRADE_1', dto.notes || null,
      ]);

      for (const item of dto.items) {
        const itemTotal = round2(Number(item.quantityM2) * Number(item.unitCost));
        db.run(`
          INSERT INTO supplier_quotation_items (id, quotation_id, rfq_item_id, product_id, quantity_m2, unit_cost, total_cost, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [`sqi_${uuidv4().substring(0, 8)}`, quoteId, item.rfqItemId || null, item.productId, Number(item.quantityM2), Number(item.unitCost), itemTotal, item.notes || null]);
      }

      db.run(`UPDATE supplier_rfqs SET status = 'EVALUATING' WHERE id = ? AND status = 'OPEN'`, [dto.rfqId]);

      const res = db.query<SupplierQuotationRow>(`
        SELECT q.*, s.name AS supplierName
        FROM supplier_quotations q JOIN suppliers s ON s.id = q.supplier_id WHERE q.id = ?
      `, [quoteId])[0];
      return res;
    });
  }

public awardQuotation(quotationId: string, createPurchaseOrder = true, warehouseId = 'wh_main'): { orderId?: string } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.approve');

    const quote = this.db.query<any>(`
      SELECT q.*, s.name AS supplierName FROM supplier_quotations q JOIN suppliers s ON s.id = q.supplier_id WHERE q.id = ?
    `, [quotationId])[0];
    if (!quote) throw new Error('عرض السعر غير موجود.');

    const items = this.db.query<SupplierQuotationItem>(`
      SELECT qi.*, p.name AS productName, p.product_type AS productType,
             p.base_unit AS baseUnit, p.custom_unit AS customUnit
      FROM supplier_quotation_items qi LEFT JOIN products p ON p.id = qi.product_id WHERE qi.quotation_id = ?
    `, [quotationId]);

    return this.db.executeTransaction((db) => {
      // 1. Accept this quote, reject other quotes for this RFQ
      db.run(`UPDATE supplier_quotations SET status = 'ACCEPTED' WHERE id = ?`, [quotationId]);
      db.run(`UPDATE supplier_quotations SET status = 'REJECTED' WHERE rfq_id = ? AND id != ?`, [quote.rfqId, quotationId]);
      db.run(`UPDATE supplier_rfqs SET status = 'AWARDED' WHERE id = ?`, [quote.rfqId]);

      let orderId: string | undefined;
      if (createPurchaseOrder) {
        orderId = `po_${uuidv4().substring(0, 8)}`;
        const orderNumber = db.nextNumber('PO');
        const today = localDateString();

        db.run(`
          INSERT INTO purchase_orders (
            id, order_number, date, supplier_id, warehouse_id, request_id,
            subtotal, discount_amount, tax_amount, shipping_cost, total_amount, status, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, NULL, ?, 0, 0, 0, ?, 'SENT', ?, ?)
        `, [
          orderId, orderNumber, today, quote.supplierId, warehouseId,
          quote.totalAmount, quote.totalAmount,
          `أمر شراء صادر عن ترسية عرض سعر ${quote.quotationNumber} (RFQ: ${quote.rfqId})`, actor.id,
        ]);

        for (const item of items) {
          const prod = db.query<any>(`SELECT meters_per_box FROM products WHERE id = ?`, [item.productId])[0];
          const boxes = round2(item.quantityM2 / (Number(prod?.metersPerBox) || 1.44));
          db.run(`
            INSERT INTO purchase_order_items (
              id, purchase_order_id, product_id, product_name, quantity_m2, boxes_count, received_m2, unit_cost, total_cost
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
          `, [`poi_${uuidv4().substring(0, 8)}`, orderId, item.productId, item.productName || 'صنف سيراميك', item.quantityM2, boxes, item.unitCost, item.totalCost]);
        }
      }

      return { orderId };
    });
  }
}
