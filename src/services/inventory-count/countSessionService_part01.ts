import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { localDateString } from '../../utils/shared/date';
import { PermissionService } from '../auth/PermissionService';
import { branchAccess } from './branchAccess';
import type { CountType } from '../../types/inventory/countSessions';

export interface StartCountSessionInput {
  warehouseId: string;
  countType: CountType;
  selectedProductIds: string[];
  isBlindCount: boolean;
  notes: string;
}

export function startCountSession(input: StartCountSessionInput): void {
  const { warehouseId: selectedWarehouseId, countType, selectedProductIds, isBlindCount, notes } = input;
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.inventory.counts.count');
  branchAccess.requireWarehouseAccess(selectedWarehouseId, actor);
  if (!['FULL', 'PARTIAL', 'SPOT', 'PERIODIC', 'SURPRISE', 'BLIND'].includes(countType)) throw new Error('Invalid count type.');
  if (countType !== 'FULL' && selectedProductIds.length === 0) throw new Error('Select at least one product for a partial count.');
  const db = DatabaseManager.getInstance();
  db.executeTransaction((txDb) => {
    const countId = `cnt_${uuidv4().substring(0, 8)}`;
    const countNum = txDb.nextNumber('CNT');
    const today = localDateString();

    // 1. Get all active products & their current stocks in this warehouse
    const productsSql = `
      SELECT 
        p.id as productId,
        p.name as productName,
        COALESCE(ws.quantity_m2, 0) as systemQuantityM2,
        p.cost_price as costPrice,
        p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit
      FROM products p
      LEFT JOIN warehouse_stock ws ON p.id = ws.product_id AND ws.warehouse_id = ?
      WHERE p.is_active = 1
    `;
    const selectedIds = countType === 'FULL' ? [] : [...new Set(selectedProductIds)];
    const products = txDb.query<any>(countType === 'FULL'
      ? productsSql
      : productsSql.replace('WHERE p.is_active = 1', `WHERE p.is_active = 1 AND p.id IN (${selectedIds.map(() => '?').join(',')})`),
    countType === 'FULL' ? [selectedWarehouseId] : [selectedWarehouseId, ...selectedIds]);

    if (products.length === 0) {
      throw new Error('لا توجد منتجات مسجلة في النظام لبدء الجرد.');
    }

    // 2. Insert master session into stock_counts
    txDb.run(`
      INSERT INTO stock_counts (
        id, count_number, warehouse_id, date, count_type, status,
        is_blind, approval_status,
        total_items, items_with_variance, total_variance_value, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, 'COUNTING', ?, 'PENDING', ?, 0, 0, ?, ?, CURRENT_TIMESTAMP)
    `, [
      countId, countNum, selectedWarehouseId, today, countType, (isBlindCount || countType === 'BLIND') ? 1 : 0, products.length, notes.trim() || null, actor.id
    ]);

    // 3. Insert items into stock_count_items
    for (const p of products) {
      const itemId = `cnti_${uuidv4().substring(0, 8)}`;
      txDb.run(`
        INSERT INTO stock_count_items (
          id, count_id, product_id, product_name, system_quantity_m2,
          counted_quantity_m2, variance_m2, unit_cost, variance_value
        ) VALUES (?, ?, ?, ?, ?, NULL, 0, ?, 0)
      `, [
        itemId, countId, p.productId, p.productName, p.systemQuantityM2, p.costPrice
      ]);
    }
  });
}
