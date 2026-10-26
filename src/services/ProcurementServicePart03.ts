import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { round2 } from './financials';
import { postLedgerEntry } from '../database/ledger';
import type { ReorderSuggestion, SupplierRfqRow, SupplierRfqItem, SupplierQuotationRow, SupplierQuotationItem, GoodsReceiptRow, GoodsReceiptItem, SupplierClaimRow, SupplierClaimItem, ThreeWayMatchingResult, LandedCostBreakdownItem, SupplierScorecard, ProductPriceHistoryEntry } from './procurementTypes';
import { ProcurementServicePart02 } from './ProcurementServicePart02';

export abstract class ProcurementServicePart03 extends ProcurementServicePart02 {
public createGoodsReceipt(dto: {
    purchaseOrderId?: string;
    supplierId: string;
    warehouseId: string;
    deliveryNoteNumber?: string;
    vehicleNumber?: string;
    driverName?: string;
    notes?: string;
    items: {
      purchaseOrderItemId?: string;
      productId: string;
      orderedQuantityM2?: number;
      receivedQuantityM2: number;
      acceptedQuantityM2: number;
      damagedQuantityM2?: number;
      shortageQuantityM2?: number;
      batchNumber?: string;
      toneShade?: string;
      caliber?: string;
      grade?: string;
      unitCost?: number;
      inspectionNotes?: string;
      qualityVerdict?: 'PASS' | 'DEFECT' | 'REJECT';
    }[];
  }): { grn: GoodsReceiptRow; hasDiscrepancy: boolean; damagedTotal: number; shortageTotal: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.create');
    if (!dto.items || dto.items.length === 0) throw new Error('أدخل صنفاً واحداً على الأقل للاستلام.');

    const grnId = `grn_${uuidv4().substring(0, 8)}`;
    const today = localDateString();

    return this.db.executeTransaction((db) => {
      const grnNumber = db.nextNumber('GRN');

      let totalReceived = 0;
      let totalAccepted = 0;
      let totalDamaged = 0;
      let totalShortage = 0;

      for (const item of dto.items) {
        totalReceived = round2(totalReceived + Number(item.receivedQuantityM2));
        totalAccepted = round2(totalAccepted + Number(item.acceptedQuantityM2));
        totalDamaged = round2(totalDamaged + Number(item.damagedQuantityM2 || 0));
        totalShortage = round2(totalShortage + Number(item.shortageQuantityM2 || 0));
      }

      const hasDiscrepancy = totalDamaged > 0 || totalShortage > 0;
      const status = totalAccepted === totalReceived && !hasDiscrepancy
        ? 'ACCEPTED'
        : totalAccepted > 0
          ? 'ACCEPTED_WITH_REMARKS'
          : 'REJECTED';

      db.run(`
        INSERT INTO goods_receipt_notes (
          id, grn_number, date, purchase_order_id, supplier_id, warehouse_id,
          delivery_note_number, vehicle_number, driver_name, status,
          total_received_m2, total_accepted_m2, total_damaged_m2, total_shortage_m2,
          notes, inspected_by, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        grnId, grnNumber, today, dto.purchaseOrderId || null, dto.supplierId, dto.warehouseId,
        dto.deliveryNoteNumber || null, dto.vehicleNumber || null, dto.driverName || null, status,
        totalReceived, totalAccepted, totalDamaged, totalShortage,
        dto.notes || null, actor.id, actor.id,
      ]);

      for (const item of dto.items) {
        const prod = db.query<any>(`SELECT name, cost_price, meters_per_box, product_type, base_unit FROM products WHERE id = ?`, [item.productId])[0];
        if (!prod) throw new Error(`المنتج ${item.productId} غير موجود.`);

        const unitCost = Number(item.unitCost) || Number(prod.cost_price) || 0;
        const verdict = item.qualityVerdict || (Number(item.damagedQuantityM2 || 0) > 0 ? 'DEFECT' : 'PASS');
        const batchNum = item.batchNumber || `LOT-${Date.now().toString().slice(-6)}`;
        const tone = item.toneShade || 'STD';
        const caliber = item.caliber || '0';
        const grade = item.grade || 'GRADE_1';

        db.run(`
          INSERT INTO goods_receipt_note_items (
            id, grn_id, purchase_order_item_id, product_id, product_name,
            ordered_quantity_m2, received_quantity_m2, accepted_quantity_m2, damaged_quantity_m2, shortage_quantity_m2,
            batch_number, tone_shade, caliber, grade, unit_cost, inspection_notes, quality_verdict
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `grni_${uuidv4().substring(0, 8)}`, grnId, item.purchaseOrderItemId || null, item.productId, prod.name,
          Number(item.orderedQuantityM2 || 0), Number(item.receivedQuantityM2), Number(item.acceptedQuantityM2),
          Number(item.damagedQuantityM2 || 0), Number(item.shortageQuantityM2 || 0),
          batchNum, tone, caliber, grade, unitCost, item.inspectionNotes || null, verdict,
        ]);

        // Increase inventory stock for ACCEPTED quantities
        if (Number(item.acceptedQuantityM2) > 0) {
          const stockRow = db.query<any>(`SELECT id, quantity_m2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`, [item.productId, dto.warehouseId])[0];
          if (stockRow) {
            db.run(`UPDATE warehouse_stock SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`, [item.acceptedQuantityM2, stockRow.id]);
          } else {
            db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES (?, ?, ?, ?, 0)`,
              [`stk_${uuidv4().substring(0, 8)}`, dto.warehouseId, item.productId, item.acceptedQuantityM2]);
          }

          if (prod.product_type !== 'GENERAL') {
            const batchId = `pb_${uuidv4().substring(0, 8)}`;
            db.run(`
              INSERT INTO product_batches (
                id, product_id, warehouse_id, batch_number, tone_shade, caliber,
                production_date, received_date, supplier_id, cost_price, quantity_m2, quantity_remaining_m2, notes, created_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              batchId, item.productId, dto.warehouseId, batchNum, tone, caliber,
              today, today, dto.supplierId, unitCost, item.acceptedQuantityM2, item.acceptedQuantityM2,
              `استلام مخزني إذن ${grnNumber}`, actor.id,
            ]);
          }

          // Inventory transaction record
          db.run(`
            INSERT INTO inventory_transactions (
              id, transaction_number, type, product_id, warehouse_id,
              quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id, notes, performed_by
            ) VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, 'GRN', ?, ?, ?)
          `, [
            `tx_${uuidv4().substring(0, 8)}`, db.nextNumber('TX-GRN'), item.productId, dto.warehouseId,
            item.acceptedQuantityM2,
            prod.product_type === 'GENERAL'
              ? prod.base_unit === 'BOX' ? item.acceptedQuantityM2 : 0
              : round2(item.acceptedQuantityM2 / (Number(prod.metersPerBox ?? prod.meters_per_box) || 1.44)),
            unitCost, round2(item.acceptedQuantityM2 * unitCost), grnId,
            `استلام بضاعة إذن استلام رقم ${grnNumber} - لوت ${batchNum}`, actor.id,
          ]);
        }

        // If linked to PO item, update PO received_m2
        if (item.purchaseOrderItemId) {
          db.run(`UPDATE purchase_order_items SET received_m2 = received_m2 + ? WHERE id = ?`, [item.receivedQuantityM2, item.purchaseOrderItemId]);
        }
      }

      // If linked to PO, update PO status
      if (dto.purchaseOrderId) {
        const left = db.query<{ remaining: number }>(`
          SELECT COALESCE(SUM(quantity_m2 - received_m2), 0) AS remaining
          FROM purchase_order_items WHERE purchase_order_id = ?
        `, [dto.purchaseOrderId])[0]?.remaining || 0;
        db.run(`UPDATE purchase_orders SET status = ? WHERE id = ?`, [left <= 0.001 ? 'RECEIVED' : 'PARTIAL', dto.purchaseOrderId]);
      }

      const grn = this.getGoodsReceiptById(grnId)!;
      return { grn, hasDiscrepancy, damagedTotal: totalDamaged, shortageTotal: totalShortage };
    });
  }
}
