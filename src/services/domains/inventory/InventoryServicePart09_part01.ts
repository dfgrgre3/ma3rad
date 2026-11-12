import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { InventoryCostingService } from './InventoryCostingService';
import { InventoryLocationStockService } from './InventoryLocationStockService';
import { InventoryTransferTrackingService } from './InventoryTransferTrackingService';
import { InventoryServicePart08 } from './InventoryServicePart08';
import { BusinessRecordSyncService } from '../../../sync/BusinessRecordSyncService';

export class InventoryServicePart09 extends InventoryServicePart08 {
public dispatchTransfer(transferId: string, idempotencyKey?: string): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.transfer.execute');

    const operationKey = idempotencyKey?.trim() || `DISPATCH:${transferId}`;
    if (InventoryTransferTrackingService.findOperation(this.db, transferId, 'DISPATCH', operationKey)) {
      return;
    }

    this.db.executeTransaction((txDb) => {
      const transfer = txDb.query<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId])[0];
      if (!transfer) throw new Error('طلب التحويل غير موجود.');
      this.requireTransferWarehouseAuthorization(transferId, actor);

      // Re-check and claim the status inside the transaction so two concurrent
      // dispatch requests cannot both post the same shipment.
      if (!['APPROVED', 'PREPARING'].includes(transfer.status)) {
        throw new Error('لا يمكن إرسال تحويل غير معتمد أو غير قيد التجهيز.');
      }
      if (InventoryTransferTrackingService.findOperation(txDb, transferId, 'DISPATCH', operationKey)) {
        return;
      }

      const fromWarehouseId = transfer.fromWarehouseId ?? transfer.from_warehouse_id;
      const toWarehouseId = transfer.toWarehouseId ?? transfer.to_warehouse_id;
      const transferNumber = transfer.transferNumber ?? transfer.transfer_number ?? transfer.id;
      InventoryTransferTrackingService.assertSameCompany(txDb, fromWarehouseId, toWarehouseId);
      const transitWarehouseId = InventoryTransferTrackingService.resolveTransitWarehouse(txDb, fromWarehouseId);

      txDb.run(`
        UPDATE stock_transfers
        SET status = 'IN_TRANSIT', transit_warehouse_id = ?,
            dispatched_by = ?, dispatched_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('APPROVED', 'PREPARING')
      `, [transitWarehouseId, actor.id, transferId]);
      if (InventoryTransferTrackingService.changedRows(txDb) !== 1) {
        throw new Error('تم تحديث حالة التحويل من طلب آخر؛ أعد تحميل الطلب.');
      }

      const items = txDb.query<any>(`SELECT * FROM stock_transfer_items WHERE transfer_id = ?`, [transferId]);
      let totalShipped = 0;

      for (const item of items) {
        const productId = item.productId ?? item.product_id;
        const productName = item.productName ?? item.product_name;
        const quantityM2 = Number(item.quantityM2 ?? item.quantity_m2 ?? 0);
        const itemUnitCost = Number(item.unitCost ?? item.unit_cost ?? 0);

        const stock = txDb.query<{ quantity: number; reserved: number }>(`
          SELECT quantity_m2 AS quantity, COALESCE(reserved_m2, 0) AS reserved
          FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?
        `, [productId, fromWarehouseId])[0];
        const availableM2 = Number(stock?.quantity || 0) - Number(stock?.reserved || 0);
        if (!stock || availableM2 < quantityM2) {
          const unitLabel = this.getUnitLabel(productId);
          throw new Error(`الرصيد المتاح للصنف ${productName} (${availableM2 || 0} ${unitLabel}) غير كافٍ لإرسال ${quantityM2} ${unitLabel}.`);
        }

        // Calculate FIFO plan from the source warehouse before moving layers.
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

        InventoryLocationStockService.release(txDb, {
          warehouseId: fromWarehouseId,
          productId,
          quantity: quantityM2,
          actorId: actor.id,
          reason: `إرسال تحويل مخزني (${transferNumber})`,
        });

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

        // Park the goods (and their exact cost layers) in the transit warehouse.
        if (fifoPlan) {
          InventoryCostingService.moveLayers(txDb, {
            fromWarehouseId,
            toWarehouseId: transitWarehouseId,
            productId,
            quantity: quantityM2,
            transactionId: txId,
            transferId: transfer.id,
            plan: fifoPlan,
          });
        }
        InventoryTransferTrackingService.ensureWarehouseStock(txDb, transitWarehouseId, productId, quantityM2);

        const transitTxId = `tx_${uuidv4().substring(0, 8)}`;
        const transitTxNum = txDb.nextNumber('TX-TRF-TRANSIT');
        txDb.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id,
            notes, performed_by, created_at
          ) VALUES (?, ?, 'TRANSFER_IN', ?, ?, ?, ?, ?, ?, 'TRANSFER_TRANSIT', ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          transitTxId, transitTxNum, productId, transitWarehouseId,
          quantityM2, boxes, unitCost, Number((quantityM2 * unitCost).toFixed(2)),
          transfer.id, `بضاعة قيد النقل من ${fromWarehouseId} ضمن التحويل ${transferNumber}`, actor.id
        ]);

        // Move the ceramic batches (shade/caliber) with the goods.
        InventoryTransferTrackingService.dispatchBatches(txDb, {
          transferId: transfer.id,
          transferItemId: item.id,
          productId,
          fromWarehouseId,
          transitWarehouseId,
          quantity: quantityM2,
          transferNumber,
          actorId: actor.id,
        });

        txDb.run(`
          UPDATE stock_transfer_items
          SET shipped_m2 = quantity_m2, unit_cost = ?
          WHERE id = ?
        `, [unitCost, item.id]);

        totalShipped += quantityM2;
      }

      txDb.run(`
        UPDATE stock_transfers
        SET total_shipped_m2 = ?
        WHERE id = ?
      `, [totalShipped, transferId]);

      InventoryTransferTrackingService.recordOperation(txDb, {
        transferId,
        operation: 'DISPATCH',
        idempotencyKey: operationKey,
        actorId: actor.id,
        payloadJson: JSON.stringify(items.map((item) => ({
          itemId: item.id,
          quantity: Number(item.quantity_m2 ?? item.quantityM2 ?? 0),
        }))),
      });

      new BusinessRecordSyncService(txDb).capture(txDb, 'stock_transfer', transferId, 'UPDATE');
    });
  }
}
