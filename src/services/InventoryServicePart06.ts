import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryServicePart05 } from './InventoryServicePart05';

export class InventoryServicePart06 extends InventoryServicePart05 {
public recordSpecialStock(input: {
    warehouseId: string;
    productId: string;
    category: 'DAMAGED' | 'BROKEN' | 'DISPLAY_SAMPLE' | 'NON_SELLABLE_RETURN' | 'QUARANTINE_INSPECTION';
    quantityM2: number;
    sourceType?: string;
    sourceId?: string;
    notes?: string;
  }): any {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');

    if (input.quantityM2 <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر.');

    return this.db.executeTransaction((txDb) => {
      const stock = this.getProductStock(input.productId, input.warehouseId);
      if (!stock || stock.availableM2 < input.quantityM2) {
        const unitLabel = this.getUnitLabel(input.productId);
        throw new Error(`الرصيد المتاح بالمخزن (${stock?.availableM2 || 0} ${unitLabel}) غير كافٍ لعزل ${input.quantityM2} ${unitLabel}`);
      }

      const prod = txDb.query<any>(`SELECT cost_price AS costPrice, meters_per_box AS metersPerBox, product_type AS productType, base_unit AS baseUnit FROM products WHERE id = ?`, [input.productId])[0];
      const metersPerBox = prod?.metersPerBox ?? 1.44;
      const boxes = prod?.productType === 'GENERAL'
        ? prod.baseUnit === 'BOX' ? input.quantityM2 : 0
        : Number((input.quantityM2 / metersPerBox).toFixed(2));

      // Calculate FIFO plan
      const fifoEnabled = InventoryCostingService.costingMethod(txDb) === 'FIFO';
      const fifoPlan = fifoEnabled
        ? InventoryCostingService.planFifo(txDb, input.productId, input.warehouseId, input.quantityM2)
        : null;
      const unitCost = fifoPlan?.unitCost ?? (Number(prod?.costPrice) || 0);
      const totalCost = Number((input.quantityM2 * unitCost).toFixed(2));

      const specialId = `spc_${uuidv4().substring(0, 8)}`;
      const specialNum = txDb.nextNumber('SPC');
      const txId = `tx_${uuidv4().substring(0, 8)}`;
      const txNum = txDb.nextNumber('TX-SPC');

      // 1. Decrement warehouse stock
      txDb.run(`
        UPDATE warehouse_stock
        SET quantity_m2 = quantity_m2 - ?, last_updated = CURRENT_TIMESTAMP
        WHERE product_id = ? AND warehouse_id = ?
      `, [input.quantityM2, input.productId, input.warehouseId]);

      // 2. Insert into inventory_transactions (IMMUTABLE LEDGER)
      const txType: InventoryTransactionType = input.category === 'DAMAGED' || input.category === 'BROKEN' ? 'DAMAGE' : 'ADJUSTMENT_SUB';
      txDb.run(`
        INSERT INTO inventory_transactions (
          id, transaction_number, type, product_id, warehouse_id,
          quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id,
          notes, performed_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SPECIAL_STOCK', ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        txId, txNum, txType, input.productId, input.warehouseId,
        -input.quantityM2, -boxes, unitCost, totalCost, specialId,
        `تحويل إلى مخزون خاص/تالف (${input.category}): ${input.notes || ''}`.trim(), actor.id
      ]);

      if (fifoPlan) InventoryCostingService.consumeFifo(txDb, txId, fifoPlan);

      // 3. Insert special stock record
      txDb.run(`
        INSERT INTO inventory_special_stocks (
          id, special_number, warehouse_id, product_id, category,
          quantity_m2, boxes_count, unit_cost, total_cost, status,
          source_type, source_id, inspection_notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECORDED', ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        specialId, specialNum, input.warehouseId, input.productId, input.category,
        input.quantityM2, boxes, unitCost, totalCost,
        input.sourceType || 'MANUAL', input.sourceId || null, input.notes || null, actor.id
      ]);

      return this.getSpecialStocks({ warehouseId: input.warehouseId }).find(s => s.id === specialId);
    });
  }

public inspectSpecialStock(id: string, notes: string): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');

    this.db.run(`
      UPDATE inventory_special_stocks
      SET status = 'INSPECTED', inspection_notes = ?, inspected_by = ?, inspected_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [notes, actor.id, id]);
  }
}
