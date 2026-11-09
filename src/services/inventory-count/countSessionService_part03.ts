import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../database/repositories/databaseManager';
import type { CountItem } from '../../types/inventory/countSessions';

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
  warehouseId: string
): void {
  const stockExists = txDb.query<{ id: string }>(
    'SELECT id FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
    [warehouseId, item.productId]
  )[0];
  if (stockExists) {
    txDb.run(
      'UPDATE warehouse_stock SET quantity_m2 = ?, last_updated = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ?',
      [item.countedQuantityM2, warehouseId, item.productId]
    );
    return;
  }
  txDb.run(
    'INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES (?, ?, ?, ?, 0)',
    [`stk_${uuidv4().substring(0, 8)}`, warehouseId, item.productId, item.countedQuantityM2]
  );
}
