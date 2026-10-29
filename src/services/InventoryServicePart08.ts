import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryServicePart07 } from './InventoryServicePart07';
import { BusinessRecordSyncService } from '../sync/BusinessRecordSyncService';

export class InventoryServicePart08 extends InventoryServicePart07 {
public getTransferItems(transferId: string): any[] {
    return this.db.query<any>(`
      SELECT 
        sti.id, sti.transfer_id as transferId, sti.product_id as productId,
        sti.product_name as productName, p.sku, p.grade, p.size,
        p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
        sti.quantity_m2 as quantityM2, sti.boxes_count as boxesCount,
        sti.shipped_m2 as shippedM2, sti.received_m2 as receivedM2,
        sti.lost_m2 as lostM2, sti.damaged_m2 as damagedM2,
        sti.unit_cost as unitCost, sti.total_cost as totalCost,
        sti.item_notes as itemNotes
      FROM stock_transfer_items sti
      JOIN products p ON sti.product_id = p.id
      WHERE sti.transfer_id = ?
    `, [transferId]);
  }

public createTransferRequest(input: {
    fromWarehouseId: string;
    toWarehouseId: string;
    items: Array<{ productId: string; quantityM2: number; notes?: string }>;
    notes?: string;
  }): string {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.transfer');

    if (input.fromWarehouseId === input.toWarehouseId) {
      throw new Error('لا يمكن التحويل لنفس المخزن.');
    }
    if (!input.items || input.items.length === 0) {
      throw new Error('يجب إضافة صنف واحد على الأقل للتحويل.');
    }

    return this.db.executeTransaction((txDb) => {
      let totalQty = 0;
      let totalCost = 0;
      const transferId = `trf_${uuidv4().substring(0, 8)}`;
      const transferNum = txDb.nextNumber('TRF');

      const preparedItems: Array<{
        id: string;
        productId: string;
        productName: string;
        quantityM2: number;
        boxesCount: number;
        unitCost: number;
        itemCost: number;
        notes: string | null;
      }> = [];

      for (const item of input.items) {
        if (item.quantityM2 <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر.');
        const stock = this.getProductStock(item.productId, input.fromWarehouseId);
        if (!stock || stock.availableM2 < item.quantityM2) {
          const unitLabel = this.getUnitLabel(item.productId);
          throw new Error(`الرصيد المتاح للصنف ${item.productId} (${stock?.availableM2 || 0} ${unitLabel}) لا يكفي لتحويل ${item.quantityM2} ${unitLabel}`);
        }

        const prod = txDb.query<any>(`SELECT name, cost_price AS costPrice, meters_per_box AS metersPerBox, product_type AS productType, base_unit AS baseUnit FROM products WHERE id = ?`, [item.productId])[0];
        const unitCost = Number(prod?.costPrice || 0);
        const itemCost = Number((item.quantityM2 * unitCost).toFixed(2));
        const boxes = prod?.productType === 'GENERAL'
          ? prod.baseUnit === 'BOX' ? item.quantityM2 : 0
          : Number((item.quantityM2 / (prod?.metersPerBox ?? 1.44)).toFixed(2));

        totalQty += item.quantityM2;
        totalCost += itemCost;

        preparedItems.push({
          id: `trfi_${uuidv4().substring(0, 8)}`,
          productId: item.productId,
          productName: prod?.name || 'صنف',
          quantityM2: item.quantityM2,
          boxesCount: boxes,
          unitCost,
          itemCost,
          notes: item.notes || null,
        });
      }

      // 1. Insert parent stock_transfers master record
      txDb.run(`
        INSERT INTO stock_transfers (
          id, transfer_number, date, from_warehouse_id, to_warehouse_id,
          status, total_quantity_m2, total_cost, total_shipped_m2, total_received_m2,
          total_lost_m2, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, 'REQUESTED', ?, ?, 0, 0, 0, ?, ?, CURRENT_TIMESTAMP)
      `, [
        transferId, transferNum, localDateString(), input.fromWarehouseId, input.toWarehouseId,
        totalQty, totalCost, input.notes?.trim() || null, actor.id
      ]);

      // 2. Insert child stock_transfer_items records
      for (const pi of preparedItems) {
        txDb.run(`
          INSERT INTO stock_transfer_items (
            id, transfer_id, product_id, product_name, quantity_m2,
            boxes_count, shipped_m2, received_m2, lost_m2, damaged_m2,
            unit_cost, total_cost, item_notes
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)
        `, [
          pi.id, transferId, pi.productId, pi.productName,
          pi.quantityM2, pi.boxesCount, pi.unitCost, pi.itemCost, pi.notes
        ]);
      }

      new BusinessRecordSyncService(txDb).capture(txDb, 'stock_transfer', transferId, 'CREATE');

      return transferId;
    });
  }

public approveTransfer(transferId: string): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.transfer');

    const transfer = this.db.query<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId])[0];
    if (!transfer) throw new Error('طلب التحويل غير موجود.');
    if (transfer.status !== 'REQUESTED') throw new Error('لا يمكن اعتماد تحويل ليس في حالة الطلب.');

    this.db.run(`
      UPDATE stock_transfers
      SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [actor.id, transferId]);
  }

public prepareTransfer(transferId: string): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.transfer');

    const transfer = this.db.query<any>(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId])[0];
    if (!transfer) throw new Error('طلب التحويل غير موجود.');
    if (transfer.status !== 'APPROVED') throw new Error('يجب اعتماد التحويل أولاً قبل بدء التجهيز.');

    this.db.run(`UPDATE stock_transfers SET status = 'PREPARING' WHERE id = ?`, [transferId]);
  }
}
