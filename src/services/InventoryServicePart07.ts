import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryServicePart06 } from './InventoryServicePart06';

export class InventoryServicePart07 extends InventoryServicePart06 {
public resolveSpecialStock(id: string, action: 'WRITE_OFF' | 'DOWNGRADE_SALE' | 'RESTORE_TO_STOCK', notes: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');

    const item = this.db.query<any>(`SELECT * FROM inventory_special_stocks WHERE id = ?`, [id])[0];
    if (!item) throw new Error('السجل غير موجود.');
    if (['WRITTEN_OFF', 'RESTORED_TO_STOCK'].includes(item.status)) {
      throw new Error('تمت معالجة هذا السجل مسبقاً.');
    }

    const productId = item.productId ?? item.product_id;
    const warehouseId = item.warehouseId ?? item.warehouse_id;
    const quantityM2 = Number(item.quantityM2 ?? item.quantity_m2 ?? 0);
    const unitCost = Number(item.unitCost ?? item.unit_cost ?? 0);
    const totalCost = Number(item.totalCost ?? item.total_cost ?? (quantityM2 * unitCost));
    const specialNumber = item.specialNumber ?? item.special_number ?? item.id;

    this.db.executeTransaction((txDb) => {
      const today = localDateString();

      if (action === 'WRITE_OFF') {
        // Accounting write-off: Dr 5201 (Damage Loss) / Cr 1104 (Inventory)
        if (totalCost > 0) {
          postLedgerEntry(txDb.getDatabase(), {
            date: today,
            description: `إعدام مخزني للتالف/الكسر - قيد رقم ${specialNumber}: ${notes}`,
            referenceType: 'INVENTORY_WRITE_OFF',
            referenceId: item.id,
            createdBy: actor.id,
            lines: [
              { accountCode: '5201', debit: totalCost, credit: 0 },
              { accountCode: '1104', debit: 0, credit: totalCost },
            ],
          });
        }
        txDb.run(`
          UPDATE inventory_special_stocks
          SET status = 'WRITTEN_OFF', resolution_notes = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [notes, actor.id, id]);

      } else if (action === 'RESTORE_TO_STOCK') {
        // Restore back to warehouse stock + create cost layer
        txDb.run(`
          UPDATE warehouse_stock
          SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [quantityM2, productId, warehouseId]);

        const txId = `tx_${uuidv4().substring(0, 8)}`;
        const txNum = txDb.nextNumber('TX-RES');
        const prod = txDb.query<any>(`SELECT meters_per_box, product_type, base_unit FROM products WHERE id = ?`, [productId])[0];
        const boxes = prod?.product_type === 'GENERAL'
          ? prod.base_unit === 'BOX' ? quantityM2 : 0
          : Number((quantityM2 / (prod?.metersPerBox ?? prod?.meters_per_box ?? 1.44)).toFixed(2));

        txDb.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id,
            notes, performed_by, created_at
          ) VALUES (?, ?, 'ADJUSTMENT_ADD', ?, ?, ?, ?, ?, ?, 'SPECIAL_STOCK_RESTORE', ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          txId, txNum, productId, warehouseId,
          quantityM2, boxes, unitCost, totalCost,
          item.id, `إعادة المخزون المفحوص للصالح للبيع (${specialNumber}): ${notes}`, actor.id
        ]);

        if (InventoryCostingService.costingMethod(txDb) === 'FIFO') {
          InventoryCostingService.addLayer(txDb, {
            productId,
            warehouseId,
            sourceTransactionId: txId,
            sourceType: 'SPECIAL_STOCK_RESTORE',
            sourceId: item.id,
            date: today,
            quantity: quantityM2,
            unitCost,
          });
        }

        txDb.run(`
          UPDATE inventory_special_stocks
          SET status = 'RESTORED_TO_STOCK', resolution_notes = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [notes, actor.id, id]);

      } else if (action === 'DOWNGRADE_SALE') {
        txDb.run(`
          UPDATE inventory_special_stocks
          SET status = 'DOWNGRADED_SALE', resolution_notes = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [notes, actor.id, id]);
      }
    });
  }

public getTransfersWithDetails(status?: string, warehouseId?: string): any[] {
    let sql = `
      SELECT 
        st.id, st.transfer_number as transferNumber, st.date,
        st.from_warehouse_id as fromWarehouseId, w_from.name as fromWarehouseName,
        st.to_warehouse_id as toWarehouseId, w_to.name as toWarehouseName,
        st.status, st.total_quantity_m2 as totalQuantityM2, st.total_cost as totalCost,
        st.total_shipped_m2 as totalShippedM2, st.total_received_m2 as totalReceivedM2,
        st.total_lost_m2 as totalLostM2, st.rejection_reason as rejectionReason,
        st.notes, st.created_at as createdAt,
        u_cre.full_name as createdByName,
        u_app.full_name as approvedByName, st.approved_at as approvedAt,
        u_disp.full_name as dispatchedByName, st.dispatched_at as dispatchedAt,
        u_rec.full_name as receivedByName, st.received_at as receivedAt,
        (SELECT COUNT(*) FROM stock_transfer_items sti WHERE sti.transfer_id = st.id) as itemsCount
      FROM stock_transfers st
      JOIN warehouses w_from ON st.from_warehouse_id = w_from.id
      JOIN warehouses w_to ON st.to_warehouse_id = w_to.id
      LEFT JOIN users u_cre ON st.created_by = u_cre.id
      LEFT JOIN users u_app ON st.approved_by = u_app.id
      LEFT JOIN users u_disp ON st.dispatched_by = u_disp.id
      LEFT JOIN users u_rec ON st.received_by = u_rec.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (status && status !== 'ALL') {
      sql += ` AND st.status = ?`;
      params.push(status);
    }
    if (warehouseId) {
      sql += ` AND (st.from_warehouse_id = ? OR st.to_warehouse_id = ?)`;
      params.push(warehouseId, warehouseId);
    }
    sql += ` ORDER BY st.created_at DESC`;
    return this.db.query<any>(sql, params);
  }
}
