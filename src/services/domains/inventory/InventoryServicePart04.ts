import { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../../../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { postLedgerEntry } from '../../../database/repositories/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import { InventoryServicePart03 } from './InventoryServicePart03';

export class InventoryServicePart04 extends InventoryServicePart03 {
public getTransfersList(dateFrom?: string, dateTo?: string, warehouseId?: string): any[] {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'inventory.transfer',
      'inventory.transfer.workflow.approve',
      'inventory.transfer.execute',
      'inventory.transfer.receive',
    ]);
    if (warehouseId) this.branchAccess.requireWarehouseAuthorization(warehouseId, actor);
    const fromScope = this.branchAccess.sqlScope(
      'w_out.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w_out.id ORDER BY bw.is_primary DESC, bw.branch_id LIMIT 1)',
      actor,
      true
    );
    const toScope = this.branchAccess.sqlScope(
      'w_in.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w_in.id ORDER BY bw.is_primary DESC, bw.branch_id LIMIT 1)',
      actor,
      true
    );
    let sql = `
      SELECT 
        out_tx.transaction_number as transferNumber,
        out_tx.created_at as transferDate,
        out_tx.notes as transferNotes,
        p.name as productName,
        p.sku as productSku,
        p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
        w_out.name as fromWarehouse,
        w_in.name as toWarehouse,
        ABS(out_tx.quantity_m2) as quantityM2,
        ABS(out_tx.boxes_count) as boxesCount,
        out_tx.unit_cost as unitCost,
        out_tx.total_cost as totalCost,
        u.full_name as performedByName
      FROM inventory_transactions out_tx
      JOIN (
        SELECT reference_id, product_id, warehouse_id, quantity_m2, unit_cost,
               created_at, performed_by, notes
        FROM inventory_transactions
        WHERE reference_type = 'TRANSFER'
          AND type = 'TRANSFER_IN'
      ) in_tx
        ON out_tx.reference_type = 'TRANSFER' 
        AND out_tx.product_id = in_tx.product_id
        AND (
          (out_tx.reference_id IS NOT NULL AND in_tx.reference_id = out_tx.reference_id)
          OR (
            out_tx.reference_id IS NULL AND in_tx.reference_id IS NULL
            AND out_tx.quantity_m2 = -in_tx.quantity_m2
            AND out_tx.unit_cost = in_tx.unit_cost
            AND out_tx.created_at = in_tx.created_at
            AND out_tx.performed_by = in_tx.performed_by
            AND out_tx.notes LIKE '% إلى ' || in_tx.warehouse_id || '.%'
            AND in_tx.notes LIKE '% من ' || out_tx.warehouse_id || '.%'
          )
        )
      JOIN products p ON out_tx.product_id = p.id
      JOIN warehouses w_out ON out_tx.warehouse_id = w_out.id
      JOIN warehouses w_in ON in_tx.warehouse_id = w_in.id
      LEFT JOIN users u ON out_tx.performed_by = u.id
      WHERE out_tx.type = 'TRANSFER_OUT'
        AND ${fromScope.clause} AND ${toScope.clause}
    `;
    const params: any[] = [...fromScope.params, ...toScope.params];

    if (dateFrom) {
      sql += ' AND out_tx.created_at >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ' AND out_tx.created_at <= ?';
      params.push(dateTo + ' 23:59:59');
    }
    if (warehouseId) {
      sql += ' AND (out_tx.warehouse_id = ? OR in_tx.warehouse_id = ?)';
      params.push(warehouseId, warehouseId);
    }

    sql += ' GROUP BY out_tx.id, in_tx.warehouse_id ORDER BY out_tx.created_at DESC LIMIT 200';

    return this.db.query(sql, params);
  }

public getTransferSummaryByWarehouse(): { warehouseId: string; warehouseName: string; unitLabel: string; totalIn: number; totalOut: number }[] {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'inventory.transfer',
      'inventory.transfer.workflow.approve',
      'inventory.transfer.execute',
      'inventory.transfer.receive',
    ]);
    const scope = this.branchAccess.sqlScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id ORDER BY bw.is_primary DESC, bw.branch_id LIMIT 1)',
      actor,
      true
    );
    const rows = this.db.query<any>(`
      SELECT 
        w.id as warehouseId,
        w.name as warehouseName,
        p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
        COALESCE(SUM(CASE WHEN it.type = 'TRANSFER_IN' THEN it.quantity_m2 ELSE 0 END), 0) as totalIn,
        COALESCE(SUM(CASE WHEN it.type = 'TRANSFER_OUT' THEN ABS(it.quantity_m2) ELSE 0 END), 0) as totalOut
      FROM warehouses w
      LEFT JOIN inventory_transactions it ON w.id = it.warehouse_id AND it.type IN ('TRANSFER_IN', 'TRANSFER_OUT')
      LEFT JOIN products p ON p.id = it.product_id
      WHERE w.is_active = 1 AND ${scope.clause}
      GROUP BY w.id, w.name, p.product_type, p.base_unit, p.custom_unit
      ORDER BY w.name
    `, scope.params);
    return rows.map((row) => ({
      ...row,
      unitLabel: row.productType ? getProductUnitLabel(row) : '',
    }));
  }
}