import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { postLedgerEntry } from '../../../database/repositories/ledger';
import { localDateString } from '../../../utils/shared/date';
import { InventoryCostingService } from '../inventory/InventoryCostingService';
import { InventoryLocationStockService } from '../inventory/InventoryLocationStockService';
import type { CountItem, CountSession } from '../../../types/inventory/countSessions';
import { conversionFactor, fromBaseQuantity } from '../../../utils/products/uom';
import type { CountStockInfo } from './countSessionService_part02';
import { updateWarehouseStock } from './countSessionService_part03';

export function postCountVariance(
  txDb: DatabaseManager,
  activeSession: CountSession,
  item: CountItem,
  actorId: string,
  warehouseId: string,
  stockInfo: CountStockInfo
): void {
  const diffM2 = item.varianceM2;
  const fifoEnabled = InventoryCostingService.costingMethod(txDb) === 'FIFO';
  const fifoPlan = fifoEnabled && diffM2 < 0
    ? InventoryCostingService.planFifo(txDb, item.productId, warehouseId, Math.abs(diffM2))
    : null;
  const unitCost = fifoPlan?.unitCost ?? Number(item.unitCost);
  const value = Math.round(Math.abs(diffM2 * unitCost) * 100) / 100;

  if (item.locationId) {
    const delta = diffM2;
    const stockExists = txDb.query<{ id: string; quantityM2: number }>(
      'SELECT id, quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
      [warehouseId, item.productId]
    )[0];
    if (stockExists) {
      txDb.run('UPDATE warehouse_stock SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ?',
        [delta, warehouseId, item.productId]);
    } else if (delta > 0) {
      txDb.run('INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES (?, ?, ?, ?, 0)',
        [`stk_${uuidv4().substring(0, 8)}`, warehouseId, item.productId, delta]);
    }
    InventoryLocationStockService.adjustBin(txDb, {
      warehouseId,
      productId: item.productId,
      locationId: item.locationId,
      quantity: delta,
      actorId,
      reason: 'تسوية جرد الخانة',
    });
  } else {
    updateWarehouseStock(txDb, item, warehouseId, actorId, diffM2);
  }

  const txId = `tx_${uuidv4().substring(0, 8)}`;
  const txNum = txDb.nextNumber('TX-CNT');
  const txType = diffM2 > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_SUB';
  const boxFactor = stockInfo.productType === 'SERVICE' || stockInfo.baseUnit === 'SERVICE'
    ? null
    : conversionFactor(stockInfo.baseUnit, 'BOX', stockInfo);
  const boxesCount = boxFactor === null
    ? 0
    : Number(fromBaseQuantity(diffM2, 'BOX', stockInfo).toFixed(2));
  txDb.run(`
    INSERT INTO inventory_transactions (
      id, transaction_number, type, product_id, warehouse_id,
      quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id,
      notes, performed_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'STOCK_COUNT', ?, ?, ?, CURRENT_TIMESTAMP)
  `, [
    txId, txNum, txType, item.productId, warehouseId,
    diffM2, boxesCount, unitCost, value, activeSession.id,
    `تسوية فروقات الجرد (${activeSession.code}): ${item.discrepancyReason || 'فارق جرد'}`, actorId,
  ]);

  if (fifoPlan) {
    InventoryCostingService.consumeFifo(txDb, txId, fifoPlan);
  } else if (fifoEnabled && diffM2 > 0) {
    InventoryCostingService.addLayer(txDb, {
      productId: item.productId, warehouseId, sourceTransactionId: txId,
      sourceType: 'STOCK_COUNT_GAIN', sourceId: activeSession.id, date: localDateString(),
      quantity: diffM2, unitCost,
    });
  }
  if (value > 0) {
    postLedgerEntry(txDb.getDatabase(), {
      date: localDateString(),
      description: `Stock count adjustment ${activeSession.code} - ${item.discrepancyReason || ''}`,
      referenceType: 'INVENTORY_ADJUSTMENT',
      referenceId: txId,
      createdBy: actorId,
      lines: diffM2 > 0
        ? [{ accountCode: '1104', debit: value, credit: 0 }, { accountCode: '5201', debit: 0, credit: value }]
        : [{ accountCode: '5201', debit: value, credit: 0 }, { accountCode: '1104', debit: 0, credit: value }],
    });
  }
}
