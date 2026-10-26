import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryServicePart01 } from './InventoryServicePart01';

export class InventoryServicePart02 extends InventoryServicePart01 {
public adjustStock(
    productId: string,
    warehouseId: string,
    actualQuantityM2: number,
    reason: string,
    performedBy = 'usr_admin'
  ): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');
    const performedBy2 = actor.id;
    const currentStock = this.getProductStock(productId, warehouseId);
    const currentM2 = currentStock ? currentStock.quantityM2 : 0;
    if (!Number.isFinite(actualQuantityM2) || actualQuantityM2 < 0 || actualQuantityM2 < Number(currentStock?.reservedM2 || 0)) {
      throw new Error('Adjusted stock cannot be negative or below the reserved quantity.');
    }
    const diffM2 = Number((actualQuantityM2 - currentM2).toFixed(3));

    if (diffM2 === 0) return;

    this.db.executeTransaction((sqliteDb) => {
      // 1. Fetch product cost and calculate FIFO plan BEFORE changing stock quantity
      const prod = sqliteDb.query(`SELECT cost_price, meters_per_box, product_type, base_unit FROM products WHERE id = ?`, [productId])[0] as any;
      const fifoEnabled = InventoryCostingService.costingMethod(sqliteDb) === 'FIFO';
      const costPlan = fifoEnabled && diffM2 < 0
        ? InventoryCostingService.planFifo(sqliteDb, productId, warehouseId, Math.abs(diffM2))
        : null;
      const unitCost = costPlan ? costPlan.unitCost : (prod ? (prod as any).costPrice : 0);
      const metersPerBox = prod ? (prod as any).metersPerBox : 1.44;
      const transactionBoxes = prod?.product_type === 'GENERAL'
        ? prod.base_unit === 'BOX' ? diffM2 : 0
        : Number((diffM2 / metersPerBox).toFixed(2));
      const totalCost = Math.round(Math.abs(diffM2 * Number(unitCost || 0)) * 100) / 100;
      if (totalCost <= 0) throw new Error('Set a positive product cost before posting an inventory adjustment.');

      // 2. Ensure stock record exists and update quantity
      if (currentStock) {
        sqliteDb.run(`
          UPDATE warehouse_stock
          SET quantity_m2 = ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [actualQuantityM2, productId, warehouseId]);
      } else {
        const stockId = `stk_${uuidv4().substring(0, 8)}`;
        sqliteDb.run(`
          INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
          VALUES (?, ?, ?, ?, 0)
        `, [stockId, warehouseId, productId, actualQuantityM2]);
      }

      // 3. Record Inventory Transaction
      const txType: InventoryTransactionType = diffM2 > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_SUB';
      const txId = `tx_${uuidv4().substring(0, 8)}`;
      const txNum = sqliteDb.nextNumber('TX-ADJ');

      sqliteDb.run(`
        INSERT INTO inventory_transactions (
          id, transaction_number, type, product_id, warehouse_id,
          quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
          notes, performed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADJUSTMENT', ?, ?)
      `, [
        txId, txNum, txType, productId, warehouseId,
        diffM2,
        transactionBoxes,
        unitCost,
        Math.abs(diffM2 * unitCost),
        `تسوية جردية: ${reason} (من ${currentM2} ${this.getUnitLabel(productId)} إلى ${actualQuantityM2} ${this.getUnitLabel(productId)})`,
        performedBy2
      ]);
      if (totalCost > 0) {
        postLedgerEntry(sqliteDb.getDatabase(), {
          date: localDateString(), description: `Inventory adjustment ${txNum}: ${reason}`,
          referenceType: 'INVENTORY_ADJUSTMENT', referenceId: txId, createdBy: actor.id,
          lines: diffM2 > 0
            ? [{ accountCode: '1104', debit: totalCost, credit: 0 }, { accountCode: '5201', debit: 0, credit: totalCost }]
            : [{ accountCode: '5201', debit: totalCost, credit: 0 }, { accountCode: '1104', debit: 0, credit: totalCost }],
        });
      }

      // 4. Audit Log
      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
        VALUES (?, ?, ?, 'تسوية رصيد مخزني', 'INVENTORY', ?, ?, ?)
      `, [
        `aud_${uuidv4().substring(0, 8)}`, performedBy2, productId,
        JSON.stringify({ currentM2 }),
        JSON.stringify({ actualQuantityM2, diffM2, reason })
      ]);
      if (costPlan) InventoryCostingService.consumeFifo(sqliteDb, txId, costPlan);
      else if (fifoEnabled && diffM2 > 0) InventoryCostingService.addLayer(sqliteDb, {
        productId, warehouseId, sourceTransactionId: txId, sourceType: 'INVENTORY_ADJUSTMENT',
        sourceId: txId, date: localDateString(), quantity: diffM2, unitCost,
      });
    });
  }
}
