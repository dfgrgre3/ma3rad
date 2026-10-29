import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryServicePart08 } from './InventoryServicePart08';

export class InventoryServicePart09 extends InventoryServicePart08 {
public dispatchTransfer(transferId: string): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.transfer');

    const transfer = this.db.query<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId])[0];
    if (!transfer) throw new Error('طلب التحويل غير موجود.');
    if (!['APPROVED', 'PREPARING'].includes(transfer.status)) {
      throw new Error('لا يمكن إرسال تحويل غير معتمد أو غير قيد التجهيز.');
    }

    const fromWarehouseId = transfer.fromWarehouseId ?? transfer.from_warehouse_id;
    const toWarehouseId = transfer.toWarehouseId ?? transfer.to_warehouse_id;
    const transferNumber = transfer.transferNumber ?? transfer.transfer_number ?? transfer.id;

    const items = this.db.query<any>(`SELECT * FROM stock_transfer_items WHERE transfer_id = ?`, [transferId]);

    this.db.executeTransaction((txDb) => {
      let totalShipped = 0;

      for (const item of items) {
        const productId = item.productId ?? item.product_id;
        const productName = item.productName ?? item.product_name;
        const quantityM2 = Number(item.quantityM2 ?? item.quantity_m2 ?? 0);
        const itemUnitCost = Number(item.unitCost ?? item.unit_cost ?? 0);

        const stock = this.getProductStock(productId, fromWarehouseId);
        if (!stock || stock.availableM2 < quantityM2) {
          const unitLabel = this.getUnitLabel(productId);
          throw new Error(`الرصيد المتاح للصنف ${productName} (${stock?.availableM2 || 0} ${unitLabel}) غير كافٍ لإرسال ${quantityM2} ${unitLabel}.`);
        }

        // Calculate FIFO plan
        const fifoEnabled = InventoryCostingService.costingMethod(txDb) === 'FIFO';
        const fifoPlan = fifoEnabled
          ? InventoryCostingService.planFifo(txDb, productId, fromWarehouseId, quantityM2)
          : null;
        const unitCost = fifoPlan?.unitCost ?? itemUnitCost;
        const prod = txDb.query<any>(`SELECT meters_per_box AS metersPerBox, product_type AS productType, base_unit AS baseUnit FROM products WHERE id = ?`, [productId])[0];
        const boxes = prod?.productType === 'GENERAL'
          ? prod.baseUnit === 'BOX' ? quantityM2 : 0
          : Number((quantityM2 / (prod?.metersPerBox ?? 1.44)).toFixed(2));

        // Decrement source warehouse stock
        txDb.run(`
          UPDATE warehouse_stock
          SET quantity_m2 = quantity_m2 - ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [quantityM2, productId, fromWarehouseId]);

        // Record immutable ledger entry (TRANSFER_OUT)
        const txId = `tx_${uuidv4().substring(0, 8)}`;
        const txNum = txDb.nextNumber('TX-TRF-OUT');
        txDb.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id,
            notes, performed_by, created_at
          ) VALUES (?, ?, 'TRANSFER_OUT', ?, ?, ?, ?, ?, ?, 'TRANSFER', ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          txId, txNum, productId, fromWarehouseId,
          -quantityM2, -boxes, unitCost, Number((quantityM2 * unitCost).toFixed(2)),
          transfer.id, `إرسال تحويل مخزني (${transferNumber}) إلى ${toWarehouseId}`, actor.id
        ]);

        if (fifoPlan) InventoryCostingService.consumeFifo(txDb, txId, fifoPlan);

        txDb.run(`
          UPDATE stock_transfer_items
          SET shipped_m2 = quantity_m2, unit_cost = ?
          WHERE id = ?
        `, [unitCost, item.id]);

        totalShipped += quantityM2;
      }

      txDb.run(`
        UPDATE stock_transfers
        SET status = 'IN_TRANSIT', total_shipped_m2 = ?, dispatched_by = ?, dispatched_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [totalShipped, actor.id, transferId]);
    });
  }
}
