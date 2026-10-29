import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryServicePart02 } from './InventoryServicePart02';

export class InventoryServicePart03 extends InventoryServicePart02 {
public transferStock(
    fromWarehouseId: string,
    toWarehouseId: string,
    productId: string,
    quantityM2: number,
    notes = '',
    performedBy = 'usr_admin'
  ): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.transfer');
    const performedBy2 = actor.id;
    if (fromWarehouseId === toWarehouseId) {
      throw new Error('لا يمكن التحويل لنفس المخزن.');
    }
    if (quantityM2 <= 0) {
      throw new Error('يجب أن تكون كمية التحويل أكبر من الصفر.');
    }

    const fromStock = this.getProductStock(productId, fromWarehouseId);
    if (!fromStock || fromStock.availableM2 < quantityM2) {
      throw new Error(`الرصيد المتاح في مخزن المصدر غير كافٍ. المتاح: ${fromStock?.availableM2 || 0} ${this.getUnitLabel(productId)}`);
    }

    this.db.executeTransaction((sqliteDb) => {
      // 1. Calculate FIFO plan BEFORE changing any stock quantities
      const prod = sqliteDb.query(`SELECT cost_price AS costPrice, meters_per_box AS metersPerBox, product_type AS productType, base_unit AS baseUnit FROM products WHERE id = ?`, [productId])[0];
      const costPlan = InventoryCostingService.costingMethod(sqliteDb) === 'FIFO'
        ? InventoryCostingService.planFifo(sqliteDb, productId, fromWarehouseId, quantityM2)
        : null;
      const unitCost = costPlan ? costPlan.unitCost : (prod ? (prod as any).costPrice : 0);
      const metersPerBox = prod ? (prod as any).metersPerBox : 1.44;
      const boxes = prod?.productType === 'GENERAL'
        ? prod.baseUnit === 'BOX' ? quantityM2 : 0
        : Number((quantityM2 / metersPerBox).toFixed(2));
      const refOut = sqliteDb.nextNumber('TX-TRF-OUT');
      const refIn = sqliteDb.nextNumber('TX-TRF-IN');
      // `inventory_cost_layers.source_transaction_id` references
      // `inventory_transactions.id`, not the human-readable number.
      const outTxId = `tx_${uuidv4().substring(0, 8)}`;
      const inTxId = `tx_${uuidv4().substring(0, 8)}`;

      // 2. Decrease source warehouse
      sqliteDb.run(`
        UPDATE warehouse_stock 
        SET quantity_m2 = quantity_m2 - ?, last_updated = CURRENT_TIMESTAMP
        WHERE product_id = ? AND warehouse_id = ?
      `, [quantityM2, productId, fromWarehouseId]);

      // 3. Increase destination warehouse
      const toStock = this.getProductStock(productId, toWarehouseId);
      if (toStock) {
        sqliteDb.run(`
          UPDATE warehouse_stock 
          SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [quantityM2, productId, toWarehouseId]);
      } else {
        const stockId = `stk_${uuidv4().substring(0, 8)}`;
        sqliteDb.run(`
          INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
          VALUES (?, ?, ?, ?, 0)
        `, [stockId, toWarehouseId, productId, quantityM2]);
      }

      // 4. Log 2 Inventory Transactions (Transfer OUT & Transfer IN)
      sqliteDb.run(`
        INSERT INTO inventory_transactions (
          id, transaction_number, type, product_id, warehouse_id,
          quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
          notes, performed_by
        ) VALUES (?, ?, 'TRANSFER_OUT', ?, ?, ?, ?, ?, ?, 'TRANSFER', ?, ?)
      `, [
        outTxId, refOut, productId, fromWarehouseId,
        -quantityM2, -boxes, unitCost, quantityM2 * unitCost,
        `تحويل مخزني صادر إلى ${toWarehouseId}. ${notes}`, performedBy2
      ]);

      sqliteDb.run(`
        INSERT INTO inventory_transactions (
          id, transaction_number, type, product_id, warehouse_id,
          quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
          notes, performed_by
        ) VALUES (?, ?, 'TRANSFER_IN', ?, ?, ?, ?, ?, ?, 'TRANSFER', ?, ?)
      `, [
        inTxId, refIn, productId, toWarehouseId,
        quantityM2, boxes, unitCost, quantityM2 * unitCost,
        `تحويل مخزني وارد من ${fromWarehouseId}. ${notes}`, performedBy2
      ]);

      // 5. Transfer cost layers using the pre-calculated plan
      if (costPlan) {
        for (const allocation of costPlan.allocations) {
          sqliteDb.run('UPDATE inventory_cost_layers SET quantity_remaining=MAX(0,quantity_remaining-?) WHERE id=?', [allocation.quantity, allocation.layerId]);
          InventoryCostingService.addLayer(sqliteDb, { productId, warehouseId: toWarehouseId, sourceTransactionId: inTxId, sourceType: 'TRANSFER', sourceId: refIn,
            date: localDateString(), quantity: allocation.quantity, unitCost: allocation.unitCost });
        }
      }
    });
  }

public getTransactions(limit = 100): InventoryTransaction[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.view');
    const scope = this.branchAccess.sqlScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id AND bw.is_primary = 1)',
      actor
    );
    const company = this.branchAccess.companyScope('w.company_id', actor);
    return this.db.query<InventoryTransaction>(`
      SELECT it.*, p.name as productName, p.sku as productSku,
             p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
             w.name as warehouseName, u.full_name as performedByName
      FROM inventory_transactions it
      JOIN products p ON it.product_id = p.id
      JOIN warehouses w ON it.warehouse_id = w.id
      LEFT JOIN users u ON it.performed_by = u.id
      WHERE ${scope.clause} AND ${company.clause}
      ORDER BY it.created_at DESC
      LIMIT ?
    `, [...scope.params, ...company.params, limit]);
  }
}
