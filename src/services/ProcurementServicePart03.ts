import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { round2 } from './financials';
import { postLedgerEntry } from '../database/ledger';
import type { ReorderSuggestion, SupplierRfqRow, SupplierRfqItem, SupplierQuotationRow, SupplierQuotationItem, GoodsReceiptRow, SupplierClaimRow, SupplierClaimItem, ThreeWayMatchingResult, LandedCostBreakdownItem, SupplierScorecard, ProductPriceHistoryEntry } from './procurementTypes';
import { ProcurementServicePart02 } from './ProcurementServicePart02';
import { ModuleRegistryService } from './ModuleRegistryService';
import { isServiceProduct } from '../utils/productUnits';

type GoodsReceiptInputItem = {
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
};

type GoodsReceiptInput = {
  purchaseOrderId?: string;
  supplierId: string;
  warehouseId: string;
  deliveryNoteNumber?: string;
  vehicleNumber?: string;
  driverName?: string;
  notes?: string;
  items: GoodsReceiptInputItem[];
};

type GoodsReceiptTotals = {
  totalReceived: number;
  totalAccepted: number;
  totalDamaged: number;
  totalShortage: number;
};

type GoodsReceiptProduct = {
  name: string;
  costPrice: number | string | null;
  metersPerBox: number | string | null;
  productType: string;
  baseUnit: string;
};

export abstract class ProcurementServicePart03 extends ProcurementServicePart02 {
  public createGoodsReceipt(dto: GoodsReceiptInput): { grn: GoodsReceiptRow; hasDiscrepancy: boolean; damagedTotal: number; shortageTotal: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.create');
    if (!dto.items || dto.items.length === 0) throw new Error('أدخل صنفاً واحداً على الأقل للاستلام.');

    const grnId = `grn_${uuidv4().substring(0, 8)}`;
    const today = localDateString();

    return this.db.executeTransaction(db => this.createGoodsReceiptInTransaction(db, dto, actor, grnId, today));
  }

  private createGoodsReceiptInTransaction(
    db: DatabaseManager,
    dto: GoodsReceiptInput,
    actor: ReturnType<typeof AuthService.requireAuth>,
    grnId: string,
    today: string,
  ): { grn: GoodsReceiptRow; hasDiscrepancy: boolean; damagedTotal: number; shortageTotal: number } {
    const grnNumber = db.nextNumber('GRN');
    const totals = this.calculateGoodsReceiptTotals(dto.items);
    const hasDiscrepancy = totals.totalDamaged > 0 || totals.totalShortage > 0;
    this.insertGoodsReceiptHeader(db, dto, actor.id, grnId, grnNumber, today, totals, this.goodsReceiptStatus(totals, hasDiscrepancy));

    for (const item of dto.items) {
      this.insertGoodsReceiptItem(db, dto, item, actor, grnId, grnNumber, today);
    }

    this.updatePurchaseOrderStatus(db, dto.purchaseOrderId);
    return {
      grn: this.getGoodsReceiptById(grnId)!,
      hasDiscrepancy,
      damagedTotal: totals.totalDamaged,
      shortageTotal: totals.totalShortage,
    };
  }

  private calculateGoodsReceiptTotals(items: GoodsReceiptInputItem[]): GoodsReceiptTotals {
    return items.reduce((totals, item) => ({
      totalReceived: round2(totals.totalReceived + Number(item.receivedQuantityM2)),
      totalAccepted: round2(totals.totalAccepted + Number(item.acceptedQuantityM2)),
      totalDamaged: round2(totals.totalDamaged + Number(item.damagedQuantityM2 || 0)),
      totalShortage: round2(totals.totalShortage + Number(item.shortageQuantityM2 || 0)),
    }), { totalReceived: 0, totalAccepted: 0, totalDamaged: 0, totalShortage: 0 });
  }

  private goodsReceiptStatus(totals: GoodsReceiptTotals, hasDiscrepancy: boolean): string {
    if (totals.totalAccepted === totals.totalReceived && !hasDiscrepancy) return 'ACCEPTED';
    if (totals.totalAccepted > 0) return 'ACCEPTED_WITH_REMARKS';
    return 'REJECTED';
  }

  private insertGoodsReceiptHeader(
    db: DatabaseManager,
    dto: GoodsReceiptInput,
    actorId: string,
    grnId: string,
    grnNumber: string,
    today: string,
    totals: GoodsReceiptTotals,
    status: string,
  ): void {
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
      totals.totalReceived, totals.totalAccepted, totals.totalDamaged, totals.totalShortage,
      dto.notes || null, actorId, actorId,
    ]);
  }

  private insertGoodsReceiptItem(
    db: DatabaseManager,
    dto: GoodsReceiptInput,
    item: GoodsReceiptInputItem,
    actor: ReturnType<typeof AuthService.requireAuth>,
    grnId: string,
    grnNumber: string,
    today: string,
  ): void {
    const product = db.query<GoodsReceiptProduct>(
      `SELECT name, cost_price, meters_per_box, product_type, base_unit FROM products WHERE id = ?`,
      [item.productId],
    )[0];
    if (!product) throw new Error(`المنتج ${item.productId} غير موجود.`);

    const unitCost = Number(item.unitCost) || Number(product.costPrice) || 0;
    const batchNumber = item.batchNumber || `LOT-${Date.now().toString().slice(-6)}`;
    this.insertGoodsReceiptItemRow(db, item, product.name, grnId, batchNumber, unitCost);

    const receivesStock = ModuleRegistryService.isInventoryTracked()
      && !isServiceProduct({ productType: product.productType, baseUnit: product.baseUnit });
    if (Number(item.acceptedQuantityM2) > 0 && receivesStock) {
      this.receiveGoodsReceiptInventory(db, dto, item, product, actor, grnId, grnNumber, today, batchNumber, unitCost);
    }
    if (item.purchaseOrderItemId) {
      db.run(`UPDATE purchase_order_items SET received_m2 = received_m2 + ? WHERE id = ?`, [item.receivedQuantityM2, item.purchaseOrderItemId]);
    }
  }

  private insertGoodsReceiptItemRow(
    db: DatabaseManager,
    item: GoodsReceiptInputItem,
    productName: string,
    grnId: string,
    batchNumber: string,
    unitCost: number,
  ): void {
    const verdict = item.qualityVerdict || (Number(item.damagedQuantityM2 || 0) > 0 ? 'DEFECT' : 'PASS');
    db.run(`
      INSERT INTO goods_receipt_note_items (
        id, grn_id, purchase_order_item_id, product_id, product_name,
        ordered_quantity_m2, received_quantity_m2, accepted_quantity_m2, damaged_quantity_m2, shortage_quantity_m2,
        batch_number, tone_shade, caliber, grade, unit_cost, inspection_notes, quality_verdict
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      `grni_${uuidv4().substring(0, 8)}`, grnId, item.purchaseOrderItemId || null, item.productId, productName,
      Number(item.orderedQuantityM2 || 0), Number(item.receivedQuantityM2), Number(item.acceptedQuantityM2),
      Number(item.damagedQuantityM2 || 0), Number(item.shortageQuantityM2 || 0),
      batchNumber, item.toneShade || 'STD', item.caliber || '0', item.grade || 'GRADE_1',
      unitCost, item.inspectionNotes || null, verdict,
    ]);
  }

  private receiveGoodsReceiptInventory(
    db: DatabaseManager,
    dto: GoodsReceiptInput,
    item: GoodsReceiptInputItem,
    product: GoodsReceiptProduct,
    actor: ReturnType<typeof AuthService.requireAuth>,
    grnId: string,
    grnNumber: string,
    today: string,
    batchNumber: string,
    unitCost: number,
  ): void {
    this.increaseWarehouseStock(db, dto.warehouseId, item.productId, item.acceptedQuantityM2);
    if (product.productType !== 'GENERAL') {
      this.insertProductBatch(db, dto, item, actor.id, today, grnNumber, batchNumber, unitCost);
    }
    this.insertGoodsReceiptInventoryTransaction(db, dto, item, product, actor.id, grnId, grnNumber, batchNumber, unitCost);
  }

  private increaseWarehouseStock(db: DatabaseManager, warehouseId: string, productId: string, quantity: number): void {
    const stockRow = db.query<{ id: string }>(
      `SELECT id FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
      [productId, warehouseId],
    )[0];
    if (stockRow) {
      db.run(`UPDATE warehouse_stock SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`, [quantity, stockRow.id]);
      return;
    }
    db.run(
      `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES (?, ?, ?, ?, 0)`,
      [`stk_${uuidv4().substring(0, 8)}`, warehouseId, productId, quantity],
    );
  }

  private insertProductBatch(
    db: DatabaseManager,
    dto: GoodsReceiptInput,
    item: GoodsReceiptInputItem,
    actorId: string,
    today: string,
    grnNumber: string,
    batchNumber: string,
    unitCost: number,
  ): void {
    db.run(`
      INSERT INTO product_batches (
        id, product_id, warehouse_id, batch_number, tone_shade, caliber,
        production_date, received_date, supplier_id, cost_price, quantity_m2, quantity_remaining_m2, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      `pb_${uuidv4().substring(0, 8)}`, item.productId, dto.warehouseId, batchNumber,
      item.toneShade || 'STD', item.caliber || '0', today, today, dto.supplierId,
      unitCost, item.acceptedQuantityM2, item.acceptedQuantityM2,
      `استلام مخزني إذن ${grnNumber}`, actorId,
    ]);
  }

  private insertGoodsReceiptInventoryTransaction(
    db: DatabaseManager,
    dto: GoodsReceiptInput,
    item: GoodsReceiptInputItem,
    product: GoodsReceiptProduct,
    actorId: string,
    grnId: string,
    grnNumber: string,
    batchNumber: string,
    unitCost: number,
  ): void {
    const metersPerBox = Number(product.metersPerBox) || 1.44;
    const boxesCount = product.productType === 'GENERAL'
      ? product.baseUnit === 'BOX' ? item.acceptedQuantityM2 : 0
      : round2(item.acceptedQuantityM2 / metersPerBox);
    db.run(`
      INSERT INTO inventory_transactions (
        id, transaction_number, type, product_id, warehouse_id,
        quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id, notes, performed_by
      ) VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, 'GRN', ?, ?, ?)
    `, [
      `tx_${uuidv4().substring(0, 8)}`, db.nextNumber('TX-GRN'), item.productId, dto.warehouseId,
      item.acceptedQuantityM2, boxesCount, unitCost, round2(item.acceptedQuantityM2 * unitCost), grnId,
      `استلام بضاعة إذن استلام رقم ${grnNumber} - لوت ${batchNumber}`, actorId,
    ]);
  }

  private updatePurchaseOrderStatus(db: DatabaseManager, purchaseOrderId?: string): void {
    if (!purchaseOrderId) return;
    const remaining = db.query<{ remaining: number }>(`
      SELECT COALESCE(SUM(quantity_m2 - received_m2), 0) AS remaining
      FROM purchase_order_items WHERE purchase_order_id = ?
    `, [purchaseOrderId])[0]?.remaining || 0;
    db.run(`UPDATE purchase_orders SET status = ? WHERE id = ?`, [remaining <= 0.001 ? 'RECEIVED' : 'PARTIAL', purchaseOrderId]);
  }
}
