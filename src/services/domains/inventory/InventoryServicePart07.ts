import { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../../../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { postLedgerEntry } from '../../../database/repositories/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { InventoryLocationStockService } from './InventoryLocationStockService';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import { InventoryServicePart06 } from './InventoryServicePart06';

export class InventoryServicePart07 extends InventoryServicePart06 {
public resolveSpecialStock(
    id: string,
    action: 'WRITE_OFF' | 'DOWNGRADE_SALE' | 'RESTORE_TO_STOCK',
    notes: string,
    discountedUnitPrice?: number
  ): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.adjust');
    if (!notes.trim()) throw new Error('يجب تسجيل مبررات القرار.');

    const branchScope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
    const companyScope = this.branchAccess.companyScope('w.company_id', actor);
    const item = this.db.query<any>(`
      SELECT iss.* FROM inventory_special_stocks iss
      JOIN warehouses w ON w.id = iss.warehouse_id
      WHERE iss.id = ? AND ${branchScope.clause} AND ${companyScope.clause}
    `, [id, ...branchScope.params, ...companyScope.params])[0];
    if (!item) throw new Error('السجل غير موجود.');
    const warehouseId = item.warehouseId ?? item.warehouse_id;
    this.branchAccess.requireWarehouseAuthorization(warehouseId, actor);
    if (item.status !== 'INSPECTED') throw new Error('يجب فحص السجل واعتماد نتيجة الفحص قبل اتخاذ القرار.');

    const productId = item.productId ?? item.product_id;
    const quantityM2 = Number(item.quantityM2 ?? item.quantity_m2 ?? 0);
    const unitCost = Number(item.unitCost ?? item.unit_cost ?? 0);
    const totalCost = Number(item.totalCost ?? item.total_cost ?? (quantityM2 * unitCost));
    const specialNumber = item.specialNumber ?? item.special_number ?? item.id;

    this.db.executeTransaction((txDb) => {
      const today = localDateString();
      const current = txDb.query<any>(`
        SELECT status FROM inventory_special_stocks WHERE id = ?
      `, [id])[0];
      if (current?.status !== 'INSPECTED') throw new Error('تم تغيير حالة السجل؛ أعد تحميله قبل اعتماد القرار.');

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
          WHERE id = ? AND status = 'INSPECTED'
        `, [notes.trim(), actor.id, id]);

      } else if (action === 'RESTORE_TO_STOCK') {
        // Restore back to warehouse stock + create cost layer
        txDb.run(`
          UPDATE warehouse_stock
          SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [quantityM2, productId, warehouseId]);

        InventoryLocationStockService.receive(txDb, {
          warehouseId,
          productId,
          quantity: quantityM2,
          actorId: actor.id,
          reason: `إعادة المخزون المفحوص للصالح للبيع (${specialNumber})`,
        });

        const txId = `tx_${uuidv4().substring(0, 8)}`;
        const txNum = txDb.nextNumber('TX-RES');
        const prod = txDb.query<any>(`SELECT meters_per_box AS metersPerBox, product_type AS productType, base_unit AS baseUnit FROM products WHERE id = ?`, [productId])[0];
        const boxes = prod?.productType === 'GENERAL'
          ? prod.baseUnit === 'BOX' ? quantityM2 : 0
          : Number((quantityM2 / (prod?.metersPerBox ?? 1.44)).toFixed(2));

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
          WHERE id = ? AND status = 'INSPECTED'
        `, [notes.trim(), actor.id, id]);

      } else if (action === 'DOWNGRADE_SALE') {
        const price = Number(discountedUnitPrice);
        const product = txDb.query<any>(`
          SELECT selling_price_m2 AS sellingPrice FROM products WHERE id = ?
        `, [productId])[0];
        if (!Number.isFinite(price) || price <= 0 || price >= Number(product?.sellingPrice || 0)) {
          throw new Error('يجب تحديد سعر بيع مخفض موجب وأقل من سعر البيع الأساسي.');
        }
        txDb.run(`
          UPDATE inventory_special_stocks
          SET status = 'DOWNGRADED_SALE', remaining_quantity_m2 = quantity_m2,
              discounted_unit_price = ?, resolution_notes = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'INSPECTED'
        `, [price, notes.trim(), actor.id, id]);
      }
    });
  }

public setSpecialStockSalePrice(id: string, discountedUnitPrice: number): void {
  this.assertInventoryModuleEnabled();
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.inventory.hub.adjust');
  const branchScope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
  const companyScope = this.branchAccess.companyScope('w.company_id', actor);
  const item = this.db.query<any>(`
    SELECT iss.status, iss.discounted_unit_price AS discountedUnitPrice,
      iss.product_id AS productId, iss.warehouse_id AS warehouseId,
      p.selling_price_m2 AS sellingPrice
    FROM inventory_special_stocks iss
    JOIN warehouses w ON w.id = iss.warehouse_id
    JOIN products p ON p.id = iss.product_id
    WHERE iss.id = ? AND ${branchScope.clause} AND ${companyScope.clause}
  `, [id, ...branchScope.params, ...companyScope.params])[0];
  if (!item) throw new Error('السجل غير موجود.');
  this.branchAccess.requireWarehouseAuthorization(item.warehouseId, actor);
  if (item.status !== 'DOWNGRADED_SALE' || item.discountedUnitPrice != null) {
    throw new Error('يمكن تحديد السعر مرة واحدة فقط لسجل بيع مخفض لم يُسعّر بعد.');
  }
  const price = Number(discountedUnitPrice);
  if (!Number.isFinite(price) || price <= 0 || price >= Number(item.sellingPrice || 0)) {
    throw new Error('يجب تحديد سعر بيع مخفض موجب وأقل من سعر البيع الأساسي.');
  }
  this.db.executeTransaction((txDb) => {
    const current = txDb.query<any>(`
      SELECT status, discounted_unit_price AS discountedUnitPrice
      FROM inventory_special_stocks WHERE id = ?
    `, [id])[0];
    if (current?.status !== 'DOWNGRADED_SALE' || current.discountedUnitPrice != null) {
      throw new Error('تم تغيير السجل؛ أعد تحميله قبل تحديد السعر.');
    }
    txDb.run(`
      UPDATE inventory_special_stocks SET discounted_unit_price = ?
      WHERE id = ? AND status = 'DOWNGRADED_SALE' AND discounted_unit_price IS NULL
    `, [price, id]);
  });
}

public getDiscountedSaleStocks(warehouseId: string): any[] {
  this.assertInventoryModuleEnabled();
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'sales.create');
  this.branchAccess.requireWarehouseAuthorization(warehouseId, actor);
  const branchScope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
  const companyScope = this.branchAccess.companyScope('w.company_id', actor);
  return this.db.query<any>(`
    SELECT iss.id, iss.special_number AS specialNumber, iss.product_id AS productId,
      iss.warehouse_id AS warehouseId, iss.remaining_quantity_m2 AS availableQuantityM2,
      iss.discounted_unit_price AS discountedUnitPrice, iss.unit_cost AS unitCost,
      p.name AS productName, p.sku, p.grade, p.size, p.product_type AS productType,
      p.base_unit AS baseUnit, p.custom_unit AS customUnit, p.meters_per_box AS metersPerBox,
      p.pieces_per_box AS piecesPerBox, p.selling_price_m2 AS originalUnitPrice
    FROM inventory_special_stocks iss
    JOIN warehouses w ON w.id = iss.warehouse_id
    JOIN products p ON p.id = iss.product_id
    WHERE iss.warehouse_id = ? AND iss.status = 'DOWNGRADED_SALE'
      AND iss.remaining_quantity_m2 > 0 AND iss.discounted_unit_price IS NOT NULL
      AND ${branchScope.clause} AND ${companyScope.clause}
    ORDER BY iss.created_at, iss.special_number
  `, [warehouseId, ...branchScope.params, ...companyScope.params]);
}

public getTransfersWithDetails(status?: string, warehouseId?: string): any[] {
  const actor = AuthService.requireAuth();
  PermissionService.requireAny(actor, [
    'inventory.transfer',
    'inventory.transfer.workflow.approve',
    'inventory.transfer.execute',
    'inventory.transfer.receive',
  ]);
  if (warehouseId) this.branchAccess.requireWarehouseAuthorization(warehouseId, actor);
  const fromScope = this.branchAccess.warehouseBranchScope('w_from', undefined, actor);
  const toScope = this.branchAccess.warehouseBranchScope('w_to', undefined, actor);
  const fromCompanyScope = this.branchAccess.companyScope('w_from.company_id', actor);
  const toCompanyScope = this.branchAccess.companyScope('w_to.company_id', actor);
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
      WHERE ${fromScope.clause} AND ${toScope.clause}
        AND ${fromCompanyScope.clause} AND ${toCompanyScope.clause}
    `;
    const params: any[] = [
      ...fromScope.params, ...toScope.params,
      ...fromCompanyScope.params, ...toCompanyScope.params,
    ];
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
