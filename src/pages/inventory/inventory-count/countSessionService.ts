import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/db';
import { AuthService } from '../../../services/AuthService';
import { postLedgerEntry } from '../../../database/ledger';
import { localDateString } from '../../../utils/date';
import { InventoryCostingService } from '../../../services/InventoryCostingService';
import { PermissionService } from '../../../services/PermissionService';
import { getStockQuantityLabel } from '../../../utils/productUnits';
import { branchAccess } from './branchAccess';
import type { CountItem, CountSession, CountType } from './types';

export interface StartCountSessionInput {
  warehouseId: string;
  countType: CountType;
  selectedProductIds: string[];
  isBlindCount: boolean;
  notes: string;
}

export function startCountSession(input: StartCountSessionInput): void {
  const { warehouseId: selectedWarehouseId, countType, selectedProductIds, isBlindCount, notes } = input;
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
    const selectedIds = countType === 'FULL' ? [] : selectedProductIds;
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
      countId, countNum, selectedWarehouseId, today, countType, (isBlindCount || countType === 'BLIND') ? 1 : 0, products.length, notes.trim() || null, AuthService.requireAuth().id
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

export function saveCountDraft(activeSession: CountSession, sessionItems: CountItem[]): void {
  const db = DatabaseManager.getInstance();
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'inventory.count');
  const sessionRow = db.query<{ warehouseId: string }>(
    'SELECT warehouse_id AS warehouseId FROM stock_counts WHERE id = ?',
    [activeSession.id]
  )[0];
  if (!sessionRow) throw new Error('جلسة الجرد غير موجودة.');
  branchAccess.requireWarehouseAccess(sessionRow.warehouseId, actor);
  if (activeSession.status !== 'COUNTING') throw new Error('لا يمكن تعديل جلسة جرد غير مفتوحة.');
  db.executeTransaction((txDb) => {
    for (const item of sessionItems) {
      txDb.run(`
        UPDATE stock_count_items
        SET counted_quantity_m2 = ?, variance_m2 = ?, variance_value = ?,
            discrepancy_reason = ?, notes = ?, counted_by = ?,
            counted_at = CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END
        WHERE id = ? AND count_id = ?
      `, [
        item.countedQuantityM2, item.varianceM2, item.varianceValue,
        item.discrepancyReason || null, item.notes || null,
        item.countedQuantityM2 === null ? null : actor.id,
        item.countedQuantityM2, item.id, activeSession.id
      ]);
    }
  });
}

export function postCountSession(activeSession: CountSession, sessionItems: CountItem[]): boolean {
  if (activeSession.status === 'POSTED' || activeSession.status === 'CANCELLED') return false;

  // Check if all items are counted
  const uncounted = sessionItems.some(i => i.countedQuantityM2 === null);
  if (uncounted) {
    if (!confirm('بعض الأصناف لم يتم إدخال جردها بعد. الأصناف غير المجرودة لن يتأثر مخزونها. هل تريد المتابعة وترحيل الجرد الحالي؟')) {
      return false;
    }
  }

  const db = DatabaseManager.getInstance();
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'inventory.count');
  const sessionRow = db.query<{ warehouseId: string }>(
    'SELECT warehouse_id AS warehouseId FROM stock_counts WHERE id = ?',
    [activeSession.id]
  )[0];
  if (!sessionRow) throw new Error('جلسة الجرد غير موجودة.');
  branchAccess.requireWarehouseAccess(sessionRow.warehouseId, actor);
  const countWarehouseId = sessionRow.warehouseId;
  db.executeTransaction((txDb) => {
    const currentSession = txDb.query<{ status: string }>('SELECT status FROM stock_counts WHERE id = ?', [activeSession.id])[0];
    if (!currentSession || currentSession.status !== 'COUNTING') {
      throw new Error('تم ترحيل الجلسة أو إغلاقها بالفعل. أعد تحميل البيانات قبل المتابعة.');
    }
    let varianceCount = 0;
    let totalVarianceVal = 0;
    const sessionItemIds = new Set(txDb.query<{ id: string }>(
      'SELECT id FROM stock_count_items WHERE count_id = ?',
      [activeSession.id]
    ).map(row => row.id));

    for (const item of sessionItems) {
      if (item.countedQuantityM2 === null) continue;
      if (!sessionItemIds.has(item.id)) {
        throw new Error('بيانات أصناف الجرد لا تتبع الجلسة المفتوحة.');
      }

      // 1. Validate that counted quantity is not less than reserved quantity
      const stockRow = txDb.query(
        `SELECT ws.reserved_m2 AS reservedM2, p.meters_per_box AS metersPerBox FROM warehouse_stock ws
         JOIN products p ON p.id = ws.product_id
         WHERE ws.product_id = ? AND ws.warehouse_id = ?`,
        [item.productId, countWarehouseId]
      )[0] as any;
      const reservedM2 = stockRow ? Number(stockRow.reservedM2 || 0) : 0;
      const metersPerBox = stockRow ? Number(stockRow.metersPerBox || 1.44) : 1.44;

      if (item.countedQuantityM2 < reservedM2) {
        const unit = getStockQuantityLabel(item);
        throw new Error(`الكمية المعدودة للصنف "${item.productName}" (${item.countedQuantityM2} ${unit}) أقل من الكمية المحجوزة (${reservedM2} ${unit}). يجب فك الحجز أو تصحيح الكمية قبل الترحيل.`);
      }

      // 2. Update items in DB
      txDb.run(`
        UPDATE stock_count_items
        SET counted_quantity_m2 = ?, variance_m2 = ?, variance_value = ?,
            discrepancy_reason = ?, notes = ?, counted_by = ?, counted_at = CURRENT_TIMESTAMP
        WHERE id = ? AND count_id = ?
      `, [
        item.countedQuantityM2, item.varianceM2, item.varianceValue,
        item.discrepancyReason || null, item.notes || null, actor.id, item.id, activeSession.id
      ]);

      const diffM2 = item.varianceM2;
      if (diffM2 !== 0) {
        varianceCount++;
        totalVarianceVal += Math.abs(item.varianceValue);

        // 3. Calculate FIFO plan BEFORE updating stock quantity
        const fifoEnabled = InventoryCostingService.costingMethod(txDb) === 'FIFO';
        const fifoPlan = fifoEnabled && diffM2 < 0
          ? InventoryCostingService.planFifo(txDb, item.productId, countWarehouseId, Math.abs(diffM2))
          : null;
        const unitCost = fifoPlan?.unitCost ?? Number(item.unitCost);
        const value = Math.round(Math.abs(diffM2 * unitCost) * 100) / 100;

        // 4. Adjust warehouse stock quantity to the counted quantity
        const stockExists = txDb.query<any>(
          'SELECT id FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
          [countWarehouseId, item.productId]
        )[0];
        if (stockExists) {
          txDb.run(`UPDATE warehouse_stock SET quantity_m2 = ?, last_updated = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ?`,
            [item.countedQuantityM2, countWarehouseId, item.productId]);
        } else {
          txDb.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES (?, ?, ?, ?, 0)`,
            [`stk_${uuidv4().substring(0, 8)}`, countWarehouseId, item.productId, item.countedQuantityM2]);
        }

        // 5. Write record into inventory_transactions
        const txId = `tx_${uuidv4().substring(0, 8)}`;
        const txNum = txDb.nextNumber('TX-CNT');
        const txType = diffM2 > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_SUB';
        const boxesCount = Number((diffM2 / metersPerBox).toFixed(2));

        txDb.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type, reference_id,
            notes, performed_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'STOCK_COUNT', ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          txId, txNum, txType, item.productId, countWarehouseId,
          diffM2, boxesCount, unitCost, value, activeSession.id,
          `تسوية فروقات الجرد (${activeSession.code}): ${item.discrepancyReason || 'فارق جرد'}`, actor.id,
        ]);
        if (fifoPlan) InventoryCostingService.consumeFifo(txDb, txId, fifoPlan);
        else if (fifoEnabled && diffM2 > 0) InventoryCostingService.addLayer(txDb, {
          productId: item.productId, warehouseId: countWarehouseId, sourceTransactionId: txId,
          sourceType: 'STOCK_COUNT_GAIN', sourceId: activeSession.id, date: localDateString(),
          quantity: diffM2, unitCost,
        });
        if (value > 0) {
          postLedgerEntry(txDb.getDatabase(), {
            date: localDateString(),
            description: `Stock count adjustment ${activeSession.code} - ${item.discrepancyReason || ''}`,
            referenceType: 'INVENTORY_ADJUSTMENT',
            referenceId: txId,
            createdBy: actor.id,
            lines: diffM2 > 0
              ? [{ accountCode: '1104', debit: value, credit: 0 }, { accountCode: '5201', debit: 0, credit: value }]
              : [{ accountCode: '5201', debit: value, credit: 0 }, { accountCode: '1104', debit: 0, credit: value }],
          });
        }
      }
    }

    // 6. Close session status
    txDb.run(`
      UPDATE stock_counts
      SET status = 'POSTED', approval_status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP,
          posted_at = CURRENT_TIMESTAMP, posted_by = ?,
          items_with_variance = ?, total_variance_value = ?
      WHERE id = ?
    `, [actor.id, actor.id, varianceCount, totalVarianceVal, activeSession.id]);
  });

  return true;
}
