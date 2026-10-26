import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryServicePart10 } from './InventoryServicePart10';

export class InventoryServicePart11 extends InventoryServicePart10 {
public rejectTransfer(transferId: string, reason: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.transfer');

    const transfer = this.db.query<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId])[0];
    if (!transfer) throw new Error('التحويل غير موجود.');
    if (['RECEIVED_FULL', 'RECEIVED_PARTIAL', 'REJECTED'].includes(transfer.status)) {
      throw new Error('لا يمكن رفض تحويل مستلم أو مرفوض بالفعل.');
    }

    const fromWarehouseId = transfer.fromWarehouseId ?? transfer.from_warehouse_id;
    const transferNumber = transfer.transferNumber ?? transfer.transfer_number ?? transfer.id;

    this.db.executeTransaction((txDb) => {
      // If already dispatched, revert stock back to source warehouse
      if (transfer.status === 'IN_TRANSIT') {
        const items = txDb.query<any>(`SELECT * FROM stock_transfer_items WHERE transfer_id = ?`, [transferId]);
        for (const item of items) {
          const productId = item.productId ?? item.product_id;
          const shippedM2 = Number(item.shippedM2 ?? item.shipped_m2 ?? item.quantityM2 ?? item.quantity_m2 ?? 0);
          const boxesCount = Number(item.boxesCount ?? item.boxes_count ?? 0);
          const itemUnitCost = Number(item.unitCost ?? item.unit_cost ?? 0);

          txDb.run(`
            UPDATE warehouse_stock
            SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
            WHERE product_id = ? AND warehouse_id = ?
          `, [shippedM2, productId, fromWarehouseId]);

          const txId = `tx_${uuidv4().substring(0, 8)}`;
          const txNum = txDb.nextNumber('TX-TRF-REV');
          txDb.run(`
            INSERT INTO inventory_transactions (
              id, transaction_number, type, product_id, warehouse_id,
              quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id,
              notes, performed_by, created_at
            ) VALUES (?, ?, 'TRANSFER_IN', ?, ?, ?, ?, ?, ?, 'TRANSFER_REVERT', ?, ?, ?, CURRENT_TIMESTAMP)
          `, [
            txId, txNum, productId, fromWarehouseId,
            shippedM2, boxesCount, itemUnitCost, Number((shippedM2 * itemUnitCost).toFixed(2)),
            transfer.id, `إلغاء ورفض تحويل مخزني (${transferNumber}): ${reason}`, actor.id
          ]);

          if (InventoryCostingService.costingMethod(txDb) === 'FIFO') {
            InventoryCostingService.addLayer(txDb, {
              productId,
              warehouseId: fromWarehouseId,
              sourceTransactionId: txId,
              sourceType: 'TRANSFER_REVERT',
              sourceId: transfer.id,
              date: localDateString(),
              quantity: shippedM2,
              unitCost: itemUnitCost,
            });
          }
        }
      }

      txDb.run(`
        UPDATE stock_transfers
        SET status = 'REJECTED', rejection_reason = ?
        WHERE id = ?
      `, [reason, transferId]);
    });
  }
}
