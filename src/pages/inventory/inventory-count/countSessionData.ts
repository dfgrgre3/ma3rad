import { DatabaseManager } from '../../../database/db';
import { branchAccess } from './branchAccess';
import type { CountItem, CountProductOption, CountSession, WarehouseOption } from './types';

export function loadBranchCountSessions(): CountSession[] {
  const db = DatabaseManager.getInstance();
  const scope = branchAccess.warehouseBranchScope('w');
  return db.query<any>(`
    SELECT 
      sc.id,
      sc.count_number as code,
      sc.warehouse_id as warehouseId,
      w.name as warehouse,
      sc.status,
      sc.count_type as countType,
      COALESCE(sc.is_blind, 0) as isBlind,
      COALESCE(sc.approval_status, 'PENDING') as approvalStatus,
      sc.date as startDate,
      COALESCE(u.full_name, 'النظام') as countedBy,
      sc.total_items as itemsCount,
      sc.items_with_variance as itemsWithVariance,
      sc.total_variance_value as totalVarianceValue
    FROM stock_counts sc
    JOIN warehouses w ON sc.warehouse_id = w.id
    LEFT JOIN users u ON sc.created_by = u.id
    WHERE ${scope.clause}
    ORDER BY sc.date DESC, sc.count_number DESC
  `, scope.params).map((r: any) => ({ ...r, isBlind: Boolean(r.isBlind) }));
}

export function loadCountWarehouses(): WarehouseOption[] {
  const db = DatabaseManager.getInstance();
  const scope = branchAccess.warehouseBranchScope('w');
  return db.query<any>(
    `SELECT w.id, w.name FROM warehouses w WHERE w.is_active = 1 AND ${scope.clause} ORDER BY w.name`,
    scope.params
  );
}

export function loadCountProducts(warehouseId: string): CountProductOption[] {
  branchAccess.requireWarehouseAccess(warehouseId);
  return DatabaseManager.getInstance().query<any>(`
    SELECT p.id, p.name, p.sku, COALESCE(ws.quantity_m2, 0) AS quantityM2,
      p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
    FROM products p
    LEFT JOIN warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = ?
    WHERE p.is_active = 1
    ORDER BY p.name
  `, [warehouseId]);
}

export function loadCountSessionItems(session: CountSession): CountItem[] {
  const db = DatabaseManager.getInstance();
  branchAccess.requireWarehouseAccess(session.warehouseId);
  const sql = `
    SELECT 
      sci.id,
      sci.product_id as productId,
      sci.product_name as productName,
      sci.system_quantity_m2 as systemQuantityM2,
      sci.counted_quantity_m2 as countedQuantityM2,
      sci.variance_m2 as varianceM2,
      sci.unit_cost as unitCost,
      sci.variance_value as varianceValue,
      COALESCE(sci.discrepancy_reason, '') as discrepancyReason,
      COALESCE(sci.notes, '') as notes,
      COALESCE(p.product_type, 'CERAMIC') as productType,
      p.base_unit as baseUnit, p.custom_unit as customUnit
    FROM stock_count_items sci
    LEFT JOIN products p ON p.id = sci.product_id
    WHERE sci.count_id = ?
  `;
  return db.query<any>(sql, [session.id]);
}
