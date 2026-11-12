import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { getStockQuantityLabel } from '../../../utils/products/productUnits';
import { branchAccess } from './branchAccess';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import type { CountItem, CountSession } from '../../../types/inventory/countSessions';

export function saveCountDraft(activeSession: CountSession, sessionItems: CountItem[]): void {
  ModuleRegistryService.assertModuleEnabled('inventory');
  const db = DatabaseManager.getInstance();
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.inventory.counts.count');
  const sessionRow = db.query<{ warehouseId: string }>(
    'SELECT warehouse_id AS warehouseId FROM stock_counts WHERE id = ?',
    [activeSession.id]
  )[0];
  if (!sessionRow) throw new Error('جلسة الجرد غير موجودة.');
  branchAccess.requireWarehouseAccess(sessionRow.warehouseId, actor);
  if (activeSession.status !== 'COUNTING') throw new Error('لا يمكن تعديل جلسة جرد غير مفتوحة.');
  db.executeTransaction((txDb) => {
    const current = txDb.query<{ status: string }>('SELECT status FROM stock_counts WHERE id = ?', [activeSession.id])[0];
    if (!current || current.status !== 'COUNTING') throw new Error('Session is no longer open. Reload it before saving.');
    const members = new Set(txDb.query<{ id: string }>('SELECT id FROM stock_count_items WHERE count_id = ?', [activeSession.id]).map(row => row.id));
    for (const item of sessionItems) {
      if (!members.has(item.id)) throw new Error('A product does not belong to this count session.');
      if (item.countedQuantityM2 !== null && (!Number.isFinite(item.countedQuantityM2) || item.countedQuantityM2 < 0)) throw new Error(`Invalid counted quantity for ${item.productName}.`);
      const canonical = txDb.query<{ systemQuantityM2: number; unitCost: number }>('SELECT system_quantity_m2 AS systemQuantityM2, unit_cost AS unitCost FROM stock_count_items WHERE id = ? AND count_id = ?', [item.id, activeSession.id])[0];
      const variance = item.countedQuantityM2 === null ? 0 : Number((item.countedQuantityM2 - canonical.systemQuantityM2).toFixed(3));
      txDb.run(`
        UPDATE stock_count_items
        SET counted_quantity_m2 = ?, variance_m2 = ?, variance_value = ?,
            discrepancy_reason = ?, notes = ?, counted_by = ?,
            counted_at = CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END
        WHERE id = ? AND count_id = ?
      `, [
        item.countedQuantityM2, variance, Number((variance * canonical.unitCost).toFixed(2)),
        item.discrepancyReason || null, item.notes || null,
        item.countedQuantityM2 === null ? null : actor.id,
        item.countedQuantityM2, item.id, activeSession.id
      ]);
    }
  });
}

export interface CountStockInfo {
  reservedM2: number;
  metersPerBox: number;
  piecesPerBox: number;
  productType: string;
  baseUnit: string;
  customUnit: string | null;
}

export interface CountVarianceTotals {
  varianceCount: number;
  totalVarianceVal: number;
}

export function getCountStockInfo(txDb: DatabaseManager, item: CountItem, warehouseId: string): CountStockInfo {
  const stockRow = txDb.query<{
    reservedM2: number | null;
    metersPerBox: number | null;
    piecesPerBox: number | null;
    productType: string | null;
    baseUnit: string | null;
    customUnit: string | null;
  }>(`
    SELECT ws.reserved_m2 AS reservedM2, p.meters_per_box AS metersPerBox,
      p.pieces_per_box AS piecesPerBox, p.product_type AS productType,
      p.base_unit AS baseUnit, p.custom_unit AS customUnit
    FROM products p
    LEFT JOIN warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = ?
    WHERE p.id = ?
  `, [warehouseId, item.productId])[0];
  return {
    reservedM2: stockRow ? Number(stockRow.reservedM2 || 0) : 0,
    metersPerBox: stockRow ? Number(stockRow.metersPerBox || 1.44) : 1.44,
    piecesPerBox: stockRow ? Number(stockRow.piecesPerBox || 0) : 0,
    productType: stockRow?.productType || item.productType || 'CERAMIC',
    baseUnit: stockRow?.baseUnit || item.baseUnit || 'M2',
    customUnit: stockRow?.customUnit || item.customUnit || null,
  };
}

export function validateCountItemMembership(item: CountItem, sessionItemIds: Set<string>): void {
  if (!sessionItemIds.has(item.id)) {
    throw new Error('بيانات أصناف الجرد لا تتبع الجلسة المفتوحة.');
  }
}

export function validateCountedQuantity(item: CountItem, reservedM2: number, resultingQuantityM2?: number): void {
  const targetQuantity = resultingQuantityM2 !== undefined ? resultingQuantityM2 : item.countedQuantityM2;
  if (targetQuantity !== null && targetQuantity !== undefined && targetQuantity < reservedM2) {
    const unit = getStockQuantityLabel(item);
    if (item.locationId) {
      throw new Error(`الرصيد الإجمالي الناتج في المستودع للصنف "${item.productName}" (${targetQuantity} ${unit}) بعد تسوية الرف سيكون أقل من الكمية المحجوزة بالمستودع (${reservedM2} ${unit}). يجب فك الحجز أو تصحيح الكمية قبل الترحيل.`);
    }
    throw new Error(`الكمية المعدودة للصنف "${item.productName}" (${targetQuantity} ${unit}) أقل من الكمية المحجوزة (${reservedM2} ${unit}). يجب فك الحجز أو تصحيح الكمية قبل الترحيل.`);
  }
}
