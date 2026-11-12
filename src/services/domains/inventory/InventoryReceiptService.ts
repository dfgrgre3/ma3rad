import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { InventoryCostingService } from './InventoryCostingService';
import { InventoryLocationStockService } from './InventoryLocationStockService';
import { round2 } from '../finance/financials';

export interface InventoryReceiptPostingInput {
  productId: string;
  warehouseId: string;
  quantityM2: number;
  boxesCount: number;
  unitCost: number;
  transactionNumberPrefix: string;
  referenceType: string;
  referenceId: string;
  sourceType: string;
  sourceId: string;
  date: string;
  actorId: string;
  notes: string;
  goodsReceiptId?: string | null;
  batchId?: string | null;
  supplierId?: string | null;
}

export class InventoryReceiptService {
  static post(db: DatabaseManager, input: InventoryReceiptPostingInput): string {
    const stockRow = db.query<{ id: string }>(
      `SELECT id FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
      [input.productId, input.warehouseId],
    )[0];
    if (stockRow) {
      db.run(
        `UPDATE warehouse_stock SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?`,
        [input.quantityM2, stockRow.id],
      );
    } else {
      db.run(
        `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
         VALUES (?, ?, ?, ?, 0)`,
        [`stk_${uuidv4().substring(0, 8)}`, input.warehouseId, input.productId, input.quantityM2],
      );
    }

    InventoryLocationStockService.receive(db, {
      warehouseId: input.warehouseId,
      productId: input.productId,
      quantity: input.quantityM2,
      actorId: input.actorId,
      reason: input.notes,
    });

    const transactionId = `tx_${uuidv4().substring(0, 8)}`;
    db.run(`
      INSERT INTO inventory_transactions (
        id, transaction_number, type, product_id, warehouse_id,
        quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
        reference_id, notes, performed_by
      ) VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      transactionId, db.nextNumber(input.transactionNumberPrefix), input.productId, input.warehouseId,
      input.quantityM2, input.boxesCount, input.unitCost, round2(input.quantityM2 * input.unitCost),
      input.referenceType, input.referenceId, input.notes, input.actorId,
    ]);

    InventoryCostingService.addLayer(db, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      sourceTransactionId: transactionId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      goodsReceiptId: input.goodsReceiptId,
      batchId: input.batchId,
      supplierId: input.supplierId,
      date: input.date,
      quantity: input.quantityM2,
      unitCost: input.unitCost,
    });
    return transactionId;
  }
}
