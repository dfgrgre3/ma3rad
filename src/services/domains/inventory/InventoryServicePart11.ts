import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { InventoryCostingService } from './InventoryCostingService';
import { InventoryLocationStockService } from './InventoryLocationStockService';
import { InventoryTransferTrackingService } from './InventoryTransferTrackingService';
import { InventoryServicePart10 } from './InventoryServicePart10';
import { BusinessRecordSyncService } from '../../../sync/BusinessRecordSyncService';

export class InventoryServicePart11 extends InventoryServicePart10 {
public rejectTransfer(transferId: string, reason: string): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.transfer.workflow.approve');

    const transfer = this.db.query<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId])[0];
    if (!transfer) throw new Error('التحويل غير موجود.');
    this.requireTransferWarehouseAuthorization(transferId, actor);
    if (['RECEIVED_FULL', 'RECEIVED_PARTIAL', 'COMPLETED', 'REJECTED'].includes(transfer.status)) {
      throw new Error('لا يمكن رفض تحويل مستلم أو مرفوض بالفعل.');
    }

    this.db.executeTransaction((txDb) => {
      const current = txDb.query<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId])[0];
      if (!current) throw new Error('التحويل غير موجود.');
      if (['RECEIVED_FULL', 'RECEIVED_PARTIAL', 'COMPLETED', 'REJECTED'].includes(current.status)) {
        throw new Error('لا يمكن رفض تحويل مستلم أو مرفوض بالفعل.');
      }

      // Claim the rejection atomically before touching stock.
      txDb.run(`
        UPDATE stock_transfers
        SET status = 'REJECTED', rejection_reason = ?
        WHERE id = ? AND status NOT IN ('RECEIVED_FULL', 'RECEIVED_PARTIAL', 'COMPLETED', 'REJECTED')
      `, [reason, transferId]);
      if (InventoryTransferTrackingService.changedRows(txDb) !== 1) {
        throw new Error('تم تحديث حالة التحويل من طلب آخر؛ أعد تحميل الطلب.');
      }

      const fromWarehouseId = current.fromWarehouseId ?? current.from_warehouse_id;
      const transitWarehouseId: string | null = current.transitWarehouseId ?? current.transit_warehouse_id ?? null;
      const transferNumber = current.transferNumber ?? current.transfer_number ?? current.id;
      const fifoEnabled = InventoryCostingService.costingMethod(txDb) === 'FIFO';

      // If already dispatched, revert the shipment from transit (or directly
      // from source for legacy transfers without a transit warehouse).
      if (current.status === 'IN_TRANSIT') {
        const items = txDb.query<any>(`SELECT * FROM stock_transfer_items WHERE transfer_id = ?`, [transferId]);
        for (const item of items) {
          const productId = item.productId ?? item.product_id;
          const shippedM2 = Number(item.shippedM2 ?? item.shipped_m2 ?? item.quantityM2 ?? item.quantity_m2 ?? 0);
          if (shippedM2 <= 0) continue;
          const boxesCount = Number(item.boxesCount ?? item.boxes_count ?? 0);
          const itemUnitCost = Number(item.unitCost ?? item.unit_cost ?? 0);

          let revertUnitCost = itemUnitCost;
          const revertPlan = fifoEnabled && transitWarehouseId
            ? InventoryCostingService.planFifo(txDb, productId, transitWarehouseId, shippedM2)
            : null;
          if (revertPlan) revertUnitCost = revertPlan.unitCost;

          if (transitWarehouseId) {
            InventoryTransferTrackingService.ensureWarehouseStock(txDb, transitWarehouseId, productId, -shippedM2);
          }

          txDb.run(`
            UPDATE warehouse_stock
            SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
            WHERE product_id = ? AND warehouse_id = ?
          `, [shippedM2, productId, fromWarehouseId]);

          InventoryLocationStockService.receive(txDb, {
            warehouseId: fromWarehouseId,
            productId,
            quantity: shippedM2,
            actorId: actor.id,
            reason: `إلغاء ورفض تحويل مخزني (${transferNumber})`,
          });

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
            shippedM2, boxesCount, revertUnitCost, Number((shippedM2 * revertUnitCost).toFixed(2)),
            current.id, `إلغاء ورفض تحويل مخزني (${transferNumber}): ${reason}`, actor.id
          ]);

          if (revertPlan && transitWarehouseId) {
            InventoryCostingService.moveLayers(txDb, {
              fromWarehouseId: transitWarehouseId,
              toWarehouseId: fromWarehouseId,
              productId,
              quantity: shippedM2,
              transactionId: txId,
              transferId: current.id,
              plan: revertPlan,
            });
          } else if (fifoEnabled && !transitWarehouseId) {
            InventoryCostingService.addLayer(txDb, {
              productId,
              warehouseId: fromWarehouseId,
              sourceTransactionId: txId,
              sourceType: 'TRANSFER_REVERT',
              sourceId: current.id,
              date: localDateString(),
              quantity: shippedM2,
              unitCost: itemUnitCost,
            });
          }

          if (transitWarehouseId) {
            InventoryTransferTrackingService.revertBatches(txDb, {
              transferItemId: item.id,
              productId,
              fromWarehouseId,
              transitWarehouseId,
              actorId: actor.id,
            });
          }
        }
      }

      new BusinessRecordSyncService(txDb).capture(txDb, 'stock_transfer', transferId, 'UPDATE');
    });
  }
}
