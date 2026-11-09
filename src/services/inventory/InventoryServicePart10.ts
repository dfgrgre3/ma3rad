import { DatabaseManager } from '../../database/repositories/databaseManager';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../utils/shared/date';
import { postLedgerEntry } from '../../database/repositories/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../../utils/products/productUnits';
import { InventoryServicePart09 } from './InventoryServicePart09';
import { BusinessRecordSyncService } from '../../sync/BusinessRecordSyncService';

export class InventoryServicePart10 extends InventoryServicePart09 {
public receiveTransfer(transferId: string, receipts: Array<{
    itemId: string;
    receivedM2: number;
    lostM2?: number;
    damagedM2?: number;
    notes?: string;
  }>): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.transfer');
    if (!Array.isArray(receipts) || receipts.length === 0) {
      throw new Error('يجب تسجيل استلام بند واحد على الأقل.');
    }

    const transfer = this.db.query<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId])[0];
    if (!transfer) throw new Error('طلب التحويل غير موجود.');
    this.requireTransferWarehouseAuthorization(transferId, actor);
    if (transfer.status !== 'IN_TRANSIT' && transfer.status !== 'RECEIVED_PARTIAL') {
      throw new Error('لا يمكن استلام تحويل ليس قيد النقل (IN_TRANSIT).');
    }

    const fromWarehouseId = transfer.fromWarehouseId ?? transfer.from_warehouse_id;
    const toWarehouseId = transfer.toWarehouseId ?? transfer.to_warehouse_id;
    const transferNumber = transfer.transferNumber ?? transfer.transfer_number ?? transfer.id;
    const totalShippedM2 = Number(this.db.query<{ total: number }>(
      'SELECT COALESCE(SUM(shipped_m2), 0) AS total FROM stock_transfer_items WHERE transfer_id = ?',
      [transferId]
    )[0]?.total || 0);

    this.db.executeTransaction((txDb) => {
      const totals = this.processTransferReceipts(
        txDb,
        transfer,
        receipts,
        toWarehouseId,
        fromWarehouseId,
        transferNumber,
        actor
      );
      const cumulative = txDb.query<{ totalReceived: number; totalLost: number }>(`
        SELECT COALESCE(SUM(received_m2), 0) AS totalReceived,
               COALESCE(SUM(lost_m2 + damaged_m2), 0) AS totalLost
        FROM stock_transfer_items WHERE transfer_id = ?
      `, [transferId])[0] || totals;
      this.updateTransferReceiptStatus(txDb, transferId, totalShippedM2, {
        totalReceived: Number(cumulative.totalReceived) || 0,
        totalLost: Number(cumulative.totalLost) || 0,
      }, actor.id);
      new BusinessRecordSyncService(txDb).capture(txDb, 'stock_transfer', transferId, 'UPDATE');
    });
  }

  private processTransferReceipts(
    txDb: DatabaseManager,
    transfer: any,
    receipts: Array<{ itemId: string; receivedM2: number; lostM2?: number; damagedM2?: number; notes?: string }>,
    toWarehouseId: string,
    fromWarehouseId: string,
    transferNumber: string,
    actor: ReturnType<typeof AuthService.requireAuth>
  ): { totalReceived: number; totalLost: number } {
    let totalReceived = 0;
    let totalLost = 0;
    const seenItems = new Set<string>();

    for (const receipt of receipts) {
      if (seenItems.has(receipt.itemId)) {
        throw new Error('لا يمكن تسجيل استلام البند نفسه أكثر من مرة في التحويل.');
      }
      seenItems.add(receipt.itemId);

      const item = txDb.query<any>(
        `SELECT * FROM stock_transfer_items WHERE id = ? AND transfer_id = ?`,
        [receipt.itemId, transfer.id]
      )[0];
      if (!item) throw new Error('بند الاستلام لا ينتمي إلى التحويل المحدد.');

      const shipped = Number(item.shippedM2 ?? item.shipped_m2 ?? 0);
      const receivedQuantity = Number(receipt.receivedM2);
      const lost = Number(receipt.lostM2 || 0);
      const damaged = Number(receipt.damagedM2 || 0);
      if (![receivedQuantity, lost, damaged].every(Number.isFinite)
        || receivedQuantity < 0 || lost < 0 || damaged < 0) {
        throw new Error('كميات الاستلام والفقد والتلف يجب أن تكون أرقامًا غير سالبة.');
      }
      if (receivedQuantity + lost + damaged > shipped + 0.009) {
        throw new Error(`إجمالي الكميات المسجلة يتجاوز الكمية المشحونة للبند (${shipped}).`);
      }
      const priorReceived = Number(item.receivedM2 ?? item.received_m2 ?? 0);
      const priorLost = Number(item.lostM2 ?? item.lost_m2 ?? 0);
      const priorDamaged = Number(item.damagedM2 ?? item.damaged_m2 ?? 0);
      if (receivedQuantity + lost + damaged + priorReceived + priorLost + priorDamaged > shipped + 0.009) {
        throw new Error(`إجمالي الاستلام التراكمي يتجاوز الكمية المشحونة للبند (${shipped}).`);
      }

      const received = this.processTransferReceipt(
        txDb,
        receipt,
        item,
        transfer,
        toWarehouseId,
        fromWarehouseId,
        transferNumber,
        actor
      );
      totalReceived += priorReceived + received;
      const lostQuantity = lost + damaged;
      totalLost += priorLost + priorDamaged + lostQuantity;
    }

    return { totalReceived, totalLost };
  }

  private processTransferReceipt(
    txDb: DatabaseManager,
    receipt: { itemId: string; receivedM2: number; lostM2?: number; damagedM2?: number; notes?: string },
    item: any,
    transfer: any,
    toWarehouseId: string,
    fromWarehouseId: string,
    transferNumber: string,
    actor: ReturnType<typeof AuthService.requireAuth>
  ): number {
    const productId = item.productId ?? item.product_id;
    const productName = item.productName ?? item.product_name;
    const itemUnitCost = Number(item.unitCost ?? item.unit_cost ?? 0);
    const itemNotes = item.itemNotes ?? item.item_notes ?? null;
    const received = Math.max(0, Number(receipt.receivedM2 || 0));
    const lost = Math.max(0, Number(receipt.lostM2 || 0));
    const damaged = Math.max(0, Number(receipt.damagedM2 || 0));
    const priorReceived = Number(item.receivedM2 ?? item.received_m2 ?? 0);
    const priorLost = Number(item.lostM2 ?? item.lost_m2 ?? 0);
    const priorDamaged = Number(item.damagedM2 ?? item.damaged_m2 ?? 0);

    if (received > 0) {
      this.recordTransferReceipt(
        txDb, productId, itemUnitCost, received, transfer, toWarehouseId, fromWarehouseId, transferNumber, actor
      );
    }
    this.recordTransferLoss(txDb, lost + damaged, itemUnitCost, productId, productName, transfer, transferNumber, actor);

    txDb.run(`
      UPDATE stock_transfer_items
      SET received_m2 = ?, lost_m2 = ?, damaged_m2 = ?, item_notes = ?
      WHERE id = ?
    `, [priorReceived + received, priorLost + lost, priorDamaged + damaged, receipt.notes || itemNotes || null, item.id]);

    return received;
  }

  private recordTransferReceipt(
    txDb: DatabaseManager,
    productId: string,
    itemUnitCost: number,
    received: number,
    transfer: any,
    toWarehouseId: string,
    fromWarehouseId: string,
    transferNumber: string,
    actor: ReturnType<typeof AuthService.requireAuth>
  ): void {
    const destStock = txDb.query<any>(
      `SELECT id FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
      [toWarehouseId, productId]
    )[0];
    if (destStock) {
      txDb.run(`
        UPDATE warehouse_stock
        SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [received, destStock.id]);
    } else {
      txDb.run(`
        INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
        VALUES (?, ?, ?, ?, 0)
      `, [`stk_${uuidv4().substring(0, 8)}`, toWarehouseId, productId, received]);
    }

    const txId = `tx_${uuidv4().substring(0, 8)}`;
    const txNum = txDb.nextNumber('TX-TRF-IN');
    const product = txDb.query<any>(
      `SELECT meters_per_box AS metersPerBox, product_type AS productType, base_unit AS baseUnit FROM products WHERE id = ?`,
      [productId]
    )[0];
    const boxes = product?.productType === 'GENERAL'
      ? product.baseUnit === 'BOX' ? received : 0
      : Number((received / (product?.metersPerBox ?? 1.44)).toFixed(2));

    txDb.run(`
      INSERT INTO inventory_transactions (
        id, transaction_number, type, product_id, warehouse_id,
        quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id,
        notes, performed_by, created_at
      ) VALUES (?, ?, 'TRANSFER_IN', ?, ?, ?, ?, ?, ?, 'TRANSFER', ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      txId, txNum, productId, toWarehouseId,
      received, boxes, itemUnitCost, Number((received * itemUnitCost).toFixed(2)),
      transfer.id, `استلام تحويل مخزني (${transferNumber}) من ${fromWarehouseId}`, actor.id
    ]);

    if (InventoryCostingService.costingMethod(txDb) === 'FIFO') {
      InventoryCostingService.addLayer(txDb, {
        productId,
        warehouseId: toWarehouseId,
        sourceTransactionId: txId,
        sourceType: 'TRANSFER',
        sourceId: transfer.id,
        date: localDateString(),
        quantity: received,
        unitCost: itemUnitCost,
      });
    }
  }

  private recordTransferLoss(
    txDb: DatabaseManager,
    lossQuantity: number,
    itemUnitCost: number,
    productId: string,
    productName: string,
    transfer: any,
    transferNumber: string,
    actor: ReturnType<typeof AuthService.requireAuth>
  ): void {
    const lossCost = Number((lossQuantity * itemUnitCost).toFixed(2));
    if (lossQuantity <= 0) return;
    const lossTransactionId = `tx_${uuidv4().substring(0, 8)}`;
    txDb.run(`
      INSERT INTO inventory_transactions (
        id, transaction_number, type, product_id, warehouse_id, quantity_m2,
        boxes_count, unit_cost, total_cost, reference_type, reference_id,
        notes, performed_by, created_at
      ) VALUES (?, ?, 'DAMAGE', ?, ?, ?, 0, ?, ?, 'TRANSFER_LOSS', ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      lossTransactionId, txDb.nextNumber('TX-TRF-LOSS'), productId,
      transfer.fromWarehouseId ?? transfer.from_warehouse_id, -lossQuantity,
      itemUnitCost, lossCost, transfer.id,
      `فقد/تلف أثناء التحويل ${transferNumber} - الصنف ${productName}`, actor.id,
    ]);
    if (lossCost <= 0) return;

    postLedgerEntry(txDb.getDatabase(), {
      date: localDateString(),
      description: `فقد/تلف أثناء التحويل المخزني ${transferNumber} - الصنف ${productName}`,
      referenceType: 'TRANSFER_LOSS',
      referenceId: lossTransactionId,
      createdBy: actor.id,
      lines: [
        { accountCode: '5201', debit: lossCost, credit: 0 },
        { accountCode: '1104', debit: 0, credit: lossCost },
      ],
    });
  }

  private updateTransferReceiptStatus(
    txDb: DatabaseManager,
    transferId: string,
    totalQuantityM2: number,
    totals: { totalReceived: number; totalLost: number },
    actorId: string
  ): void {
    const isSettled = totals.totalReceived + totals.totalLost >= totalQuantityM2 - 0.009;
    const finalStatus = !isSettled
      ? 'RECEIVED_PARTIAL'
      : totals.totalLost > 0
        ? 'COMPLETED'
        : 'RECEIVED_FULL';

    txDb.run(`
      UPDATE stock_transfers
      SET status = ?, total_received_m2 = ?, total_lost_m2 = ?,
          received_by = ?, received_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [finalStatus, totals.totalReceived, totals.totalLost, actorId, transferId]);
  }
}
