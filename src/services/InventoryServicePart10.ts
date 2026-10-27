import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryServicePart09 } from './InventoryServicePart09';

export class InventoryServicePart10 extends InventoryServicePart09 {
public receiveTransfer(transferId: string, receipts: Array<{
    itemId: string;
    receivedM2: number;
    lostM2?: number;
    damagedM2?: number;
    notes?: string;
  }>): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.transfer');

    const transfer = this.db.query<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId])[0];
    if (!transfer) throw new Error('طلب التحويل غير موجود.');
    if (transfer.status !== 'IN_TRANSIT') {
      throw new Error('لا يمكن استلام تحويل ليس قيد النقل (IN_TRANSIT).');
    }

    const fromWarehouseId = transfer.fromWarehouseId ?? transfer.from_warehouse_id;
    const toWarehouseId = transfer.toWarehouseId ?? transfer.to_warehouse_id;
    const transferNumber = transfer.transferNumber ?? transfer.transfer_number ?? transfer.id;
    const totalQuantityM2 = Number(transfer.totalQuantityM2 ?? transfer.total_quantity_m2 ?? 0);

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
      this.updateTransferReceiptStatus(txDb, transferId, totalQuantityM2, totals, actor.id);
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

    for (const receipt of receipts) {
      const item = txDb.query<any>(`SELECT * FROM stock_transfer_items WHERE id = ?`, [receipt.itemId])[0];
      if (!item) continue;

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
      totalReceived += received;
      totalLost += Math.max(0, Number(receipt.lostM2 || 0)) + Math.max(0, Number(receipt.damagedM2 || 0));
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

    if (received > 0) {
      this.recordTransferReceipt(
        txDb, productId, itemUnitCost, received, transfer, toWarehouseId, fromWarehouseId, transferNumber, actor
      );
    }
    this.recordTransferLoss(txDb, lost + damaged, itemUnitCost, productName, transfer, transferNumber, actor);

    txDb.run(`
      UPDATE stock_transfer_items
      SET received_m2 = ?, lost_m2 = ?, damaged_m2 = ?, item_notes = ?
      WHERE id = ?
    `, [received, lost, damaged, receipt.notes || itemNotes || null, item.id]);

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
      `SELECT meters_per_box, product_type, base_unit FROM products WHERE id = ?`,
      [productId]
    )[0];
    const boxes = product?.product_type === 'GENERAL'
      ? product.base_unit === 'BOX' ? received : 0
      : Number((received / (product?.metersPerBox ?? product?.meters_per_box ?? 1.44)).toFixed(2));

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
    productName: string,
    transfer: any,
    transferNumber: string,
    actor: ReturnType<typeof AuthService.requireAuth>
  ): void {
    if (lossQuantity <= 0) return;

    const lossCost = Number((lossQuantity * itemUnitCost).toFixed(2));
    if (lossCost <= 0) return;

    postLedgerEntry(txDb.getDatabase(), {
      date: localDateString(),
      description: `فقد/تلف أثناء التحويل المخزني ${transferNumber} - الصنف ${productName}`,
      referenceType: 'TRANSFER_LOSS',
      referenceId: transfer.id,
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
    const isFull = totals.totalLost === 0 && totals.totalReceived >= totalQuantityM2;
    const finalStatus = isFull ? 'RECEIVED_FULL' : 'RECEIVED_PARTIAL';

    txDb.run(`
      UPDATE stock_transfers
      SET status = ?, total_received_m2 = ?, total_lost_m2 = ?,
          received_by = ?, received_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [finalStatus, totals.totalReceived, totals.totalLost, actorId, transferId]);
  }
}
