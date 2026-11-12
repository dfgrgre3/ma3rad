import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { InventoryLocationStockService } from '../inventory/InventoryLocationStockService';
import type { CountItem } from '../../../types/inventory/countSessions';

export function updateCountItem(txDb: DatabaseManager, item: CountItem, actorId: string, countId: string): void {
  txDb.run(`
    UPDATE stock_count_items
    SET counted_quantity_m2 = ?, variance_m2 = ?, variance_value = ?,
        discrepancy_reason = ?, notes = ?, counted_by = ?, counted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND count_id = ?
  `, [
    item.countedQuantityM2, item.varianceM2, item.varianceValue,
    item.discrepancyReason || null, item.notes || null, actorId, item.id, countId
  ]);
}

export function updateWarehouseStock(
  txDb: DatabaseManager,
  item: CountItem,
  warehouseId: string,
  actorId: string,
  delta: number
): void {
  const stockExists = txDb.query<{ id: string; quantityM2: number }>(
    'SELECT id, quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
    [warehouseId, item.productId]
  )[0];
  if (stockExists) {
    txDb.run(
      'UPDATE warehouse_stock SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ?',
      [delta, warehouseId, item.productId]
    );
  } else {
    txDb.run(
      'INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES (?, ?, ?, ?, 0)',
      [`stk_${uuidv4().substring(0, 8)}`, warehouseId, item.productId, Math.max(0, delta)]
    );
  }
  InventoryLocationStockService.applyDelta(txDb, {
    warehouseId,
    productId: item.productId,
    quantity: delta,
    actorId,
    reason: 'تسوية نتيجة الجرد الفعلي',
  }, delta > 0 ? 'ASSIGN' : 'RELEASE');
}
