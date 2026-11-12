import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { localDateString } from '../../../utils/shared/date';
import { PermissionService } from '../auth/PermissionService';
import { branchAccess } from './branchAccess';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import type { CountType } from '../../../types/inventory/countSessions';

export interface StartCountSessionInput {
  warehouseId: string;
  countType: CountType;
  selectedProductIds: string[];
  isBlindCount: boolean;
  notes: string;
  locationId?: string;
}

export function startCountSession(input: StartCountSessionInput): void {
  ModuleRegistryService.assertModuleEnabled('inventory');
  const { warehouseId: selectedWarehouseId, countType, selectedProductIds, isBlindCount, notes, locationId } = input;
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.inventory.counts.count');
  branchAccess.requireWarehouseAccess(selectedWarehouseId, actor);
  if (!['FULL', 'PARTIAL', 'SPOT', 'PERIODIC', 'SURPRISE', 'BLIND'].includes(countType)) throw new Error('Invalid count type.');
  if (countType !== 'FULL' && selectedProductIds.length === 0 && !locationId) throw new Error('Select at least one product for a partial count.');
  const db = DatabaseManager.getInstance();
  db.executeTransaction((txDb) => {
    // Validate the location belongs to this warehouse when a bin count is requested.
    if (locationId) {
      const loc = txDb.query<{ warehouseId: string; isActive: number }>(`
        SELECT warehouse_id AS warehouseId, is_active AS isActive
        FROM warehouse_locations WHERE id = ?
      `, [locationId])[0];
      if (!loc || loc.warehouseId !== selectedWarehouseId || !loc.isActive) {
        throw new Error('الرف المحدد غير موجود أو غير نشط في هذا المستودع.');
      }
    }

    const productsSql = locationId
      ? `SELECT p.id as productId, p.name as productName,
               COALESCE(pls.quantity_m2, 0) as systemQuantityM2,
               p.cost_price as costPrice, p.product_type as productType,
               p.base_unit as baseUnit, p.custom_unit as customUnit
         FROM product_location_stock pls
         JOIN products p ON p.id = pls.product_id
         WHERE pls.location_id = ? AND pls.quantity_m2 > 0`
      : `SELECT 
         p.id as productId,
         p.name as productName,
         COALESCE(ws.quantity_m2, 0) as systemQuantityM2,
         p.cost_price as costPrice,
         p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit
       FROM products p
       LEFT JOIN warehouse_stock ws ON p.id = ws.product_id AND ws.warehouse_id = ?
       WHERE p.is_active = 1`;
    const selectedIds = countType === 'FULL' ? [] : [...new Set(selectedProductIds)];
    const products = txDb.query<any>(locationId
      ? productsSql
      : (countType === 'FULL'
        ? productsSql
        : productsSql.replace('WHERE p.is_active = 1', `WHERE p.is_active = 1 AND p.id IN (${selectedIds.map(() => '?').join(',')})`)),
      locationId
        ? [locationId]
        : (countType === 'FULL' ? [selectedWarehouseId] : [selectedWarehouseId, ...selectedIds]));

    if (products.length === 0) {
      throw new Error('لا توجد منتجات مسجلة في هذا الرف لبدء الجرد.');
    }

    const countId = `cnt_${uuidv4().substring(0, 8)}`;
    const countNum = txDb.nextNumber('CNT');
    const today = localDateString();
    const notesValue = locationId
      ? `[BIN:${locationId}] ${notes.trim()}`.trim()
      : notes.trim() || null;

    txDb.run(`
      INSERT INTO stock_counts (
        id, count_number, warehouse_id, location_id, date, count_type, status,
        is_blind, approval_status,
        total_items, items_with_variance, total_variance_value, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'COUNTING', ?, 'PENDING', ?, 0, 0, ?, ?, CURRENT_TIMESTAMP)
    `, [
      countId, countNum, selectedWarehouseId, locationId || null, today, countType,
      (isBlindCount || countType === 'BLIND') ? 1 : 0, products.length, notesValue, actor.id
    ]);

    for (const p of products) {
      const itemId = `cnti_${uuidv4().substring(0, 8)}`;
      txDb.run(`
        INSERT INTO stock_count_items (
          id, count_id, product_id, product_name, system_quantity_m2,
          counted_quantity_m2, variance_m2, unit_cost, variance_value, location_id
        ) VALUES (?, ?, ?, ?, ?, NULL, 0, ?, 0, ?)
      `, [
        itemId, countId, p.productId, p.productName, p.systemQuantityM2, p.costPrice, locationId || null
      ]);
    }
  });
}
