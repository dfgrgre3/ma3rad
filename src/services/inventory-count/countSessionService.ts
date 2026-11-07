import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../database/db';
import { AuthService } from '../AuthService';
import { postLedgerEntry } from '../../database/ledger';
import { localDateString } from '../../utils/date';
import { InventoryCostingService } from '../InventoryCostingService';
import { PermissionService } from '../PermissionService';
import { AuditService } from '../AuditService';
import { getStockQuantityLabel } from '../../utils/productUnits';
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
      throw new Error('Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ù†ØªØ¬Ø§Øª Ù…Ø³Ø¬Ù„Ø© ÙÙŠ Ø§Ù„Ù†Ø¸Ø§Ù… Ù„Ø¨Ø¯Ø¡ Ø§Ù„Ø¬Ø±Ø¯.');
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

export function saveCountDraft(activeSession: CountSession, sessionItems: CountItem[]): void {
  const db = DatabaseManager.getInstance();
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.inventory.counts.count');
  const sessionRow = db.query<{ warehouseId: string }>(
    'SELECT warehouse_id AS warehouseId FROM stock_counts WHERE id = ?',
    [activeSession.id]
  )[0];
  if (!sessionRow) throw new Error('Ø¬Ù„Ø³Ø© Ø§Ù„Ø¬Ø±Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©.');
  branchAccess.requireWarehouseAccess(sessionRow.warehouseId, actor);
  if (activeSession.status !== 'COUNTING') throw new Error('Ù„Ø§ ÙŠÙ…ÙƒÙ† ØªØ¹Ø¯ÙŠÙ„ Ø¬Ù„Ø³Ø© Ø¬Ø±Ø¯ ØºÙŠØ± Ù…ÙØªÙˆØ­Ø©.');
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

interface CountStockInfo {
  reservedM2: number;
  metersPerBox: number;
}

interface CountVarianceTotals {
  varianceCount: number;
  totalVarianceVal: number;
}

function getCountStockInfo(txDb: DatabaseManager, item: CountItem, warehouseId: string): CountStockInfo {
  const stockRow = txDb.query<{ reservedM2: number | null; metersPerBox: number | null }>(
    `SELECT ws.reserved_m2 AS reservedM2, p.meters_per_box AS metersPerBox FROM warehouse_stock ws
     JOIN products p ON p.id = ws.product_id
     WHERE ws.product_id = ? AND ws.warehouse_id = ?`,
    [item.productId, warehouseId]
  )[0];
  return {
    reservedM2: stockRow ? Number(stockRow.reservedM2 || 0) : 0,
    metersPerBox: stockRow ? Number(stockRow.metersPerBox || 1.44) : 1.44,
  };
}

function validateCountItemMembership(item: CountItem, sessionItemIds: Set<string>): void {
  if (!sessionItemIds.has(item.id)) {
    throw new Error('Ø¨ÙŠØ§Ù†Ø§Øª Ø£ØµÙ†Ø§Ù Ø§Ù„Ø¬Ø±Ø¯ Ù„Ø§ ØªØªØ¨Ø¹ Ø§Ù„Ø¬Ù„Ø³Ø© Ø§Ù„Ù…ÙØªÙˆØ­Ø©.');
  }
}

function validateCountedQuantity(item: CountItem, reservedM2: number): void {
  if (item.countedQuantityM2 !== null && item.countedQuantityM2 < reservedM2) {
    const unit = getStockQuantityLabel(item);
    throw new Error(`Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø¹Ø¯ÙˆØ¯Ø© Ù„Ù„ØµÙ†Ù "${item.productName}" (${item.countedQuantityM2} ${unit}) Ø£Ù‚Ù„ Ù…Ù† Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø­Ø¬ÙˆØ²Ø© (${reservedM2} ${unit}). ÙŠØ¬Ø¨ ÙÙƒ Ø§Ù„Ø­Ø¬Ø² Ø£Ùˆ ØªØµØ­ÙŠØ­ Ø§Ù„ÙƒÙ…ÙŠØ© Ù‚Ø¨Ù„ Ø§Ù„ØªØ±Ø­ÙŠÙ„.`);
  }
}

function updateCountItem(txDb: DatabaseManager, item: CountItem, actorId: string, countId: string): void {
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

function updateWarehouseStock(
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

function postCountVariance(
  txDb: DatabaseManager,
  activeSession: CountSession,
  item: CountItem,
  actorId: string,
  warehouseId: string,
  metersPerBox: number
): void {
  const diffM2 = item.varianceM2;
  const fifoEnabled = InventoryCostingService.costingMethod(txDb) === 'FIFO';
  const fifoPlan = fifoEnabled && diffM2 < 0
    ? InventoryCostingService.planFifo(txDb, item.productId, warehouseId, Math.abs(diffM2))
    : null;
  const unitCost = fifoPlan?.unitCost ?? Number(item.unitCost);
  const value = Math.round(Math.abs(diffM2 * unitCost) * 100) / 100;

  updateWarehouseStock(txDb, item, warehouseId);

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
    txId, txNum, txType, item.productId, warehouseId,
    diffM2, boxesCount, unitCost, value, activeSession.id,
    `ØªØ³ÙˆÙŠØ© ÙØ±ÙˆÙ‚Ø§Øª Ø§Ù„Ø¬Ø±Ø¯ (${activeSession.code}): ${item.discrepancyReason || 'ÙØ§Ø±Ù‚ Ø¬Ø±Ø¯'}`, actorId,
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

function postCountItems(
  txDb: DatabaseManager,
  activeSession: CountSession,
  sessionItems: CountItem[],
  actorId: string,
  warehouseId: string
): CountVarianceTotals {
  const sessionItemIds = new Set(txDb.query<{ id: string }>(
    'SELECT id FROM stock_count_items WHERE count_id = ?',
    [activeSession.id]
  ).map(row => row.id));
  const totals: CountVarianceTotals = { varianceCount: 0, totalVarianceVal: 0 };
  const submitted = new Map(sessionItems.map(item => [item.id, item]));
  const canonicalItems = txDb.query<CountItem>(`
    SELECT id, product_id AS productId, product_name AS productName,
      system_quantity_m2 AS systemQuantityM2, counted_quantity_m2 AS countedQuantityM2,
      variance_m2 AS varianceM2, unit_cost AS unitCost, variance_value AS varianceValue,
      COALESCE(discrepancy_reason, '') AS discrepancyReason, COALESCE(notes, '') AS notes
    FROM stock_count_items WHERE count_id = ?`, [activeSession.id]);
  for (const item of canonicalItems) {
    const submittedItem = submitted.get(item.id);
    if (submittedItem) item.countedQuantityM2 = submittedItem.countedQuantityM2;
    if (item.countedQuantityM2 === null) continue;

    validateCountItemMembership(item, sessionItemIds);
    if (!Number.isFinite(item.countedQuantityM2) || item.countedQuantityM2 < 0) throw new Error(`Invalid counted quantity for ${item.productName}.`);
    item.varianceM2 = Number((item.countedQuantityM2 - item.systemQuantityM2).toFixed(3));
    item.varianceValue = Number((item.varianceM2 * item.unitCost).toFixed(2));
    if (submittedItem) {
      item.discrepancyReason = submittedItem.discrepancyReason;
      item.notes = submittedItem.notes;
    }
    if (item.varianceM2 !== 0 && !item.discrepancyReason?.trim()) {
      throw new Error(`Choose a discrepancy reason for ${item.productName} before posting.`);
    }
    const { reservedM2, metersPerBox } = getCountStockInfo(txDb, item, warehouseId);
    validateCountedQuantity(item, reservedM2);
    updateCountItem(txDb, item, actorId, activeSession.id);

    if (item.varianceM2 === 0) continue;
    totals.varianceCount++;
    totals.totalVarianceVal += Math.abs(item.varianceValue);
    postCountVariance(txDb, activeSession, item, actorId, warehouseId, metersPerBox);
  }
  return totals;
}

export function submitCountSession(activeSession: CountSession, sessionItems: CountItem[]): void {
  if (sessionItems.some(item => item.countedQuantityM2 === null)) throw new Error('Ø£ÙƒÙ…Ù„ Ø¹Ø¯ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£ØµÙ†Ø§Ù Ù‚Ø¨Ù„ Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø¬Ø±Ø¯ Ù„Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©.');
  for (const item of sessionItems) {
    if (item.countedQuantityM2 !== null && Number(item.countedQuantityM2) !== item.systemQuantityM2 && !item.discrepancyReason?.trim()) {
      throw new Error(`Ø­Ø¯Ø¯ Ø³Ø¨Ø¨ Ø§Ù„ÙØ±Ù‚ Ù„Ù„ØµÙ†Ù ${item.productName}.`);
    }
  }
  saveCountDraft(activeSession, sessionItems);
  const db = DatabaseManager.getInstance();
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.inventory.counts.count');
  db.executeTransaction(txDb => {
    const current = txDb.query<{ status: string }>('SELECT status FROM stock_counts WHERE id = ?', [activeSession.id])[0];
    if (!current || current.status !== 'COUNTING') throw new Error('Ø§Ù„Ø¬Ù„Ø³Ø© Ù„ÙŠØ³Øª Ù‚ÙŠØ¯ Ø§Ù„Ø¹Ø¯.');
    txDb.run("UPDATE stock_counts SET status = 'REVIEW', approval_status = 'PENDING', rejection_reason = NULL WHERE id = ? AND status = 'COUNTING'", [activeSession.id]);
  });
  new AuditService().log({ userId: actor.id, userName: actor.fullName, action: 'SUBMIT_FOR_REVIEW', module: 'INVENTORY_COUNT', recordId: activeSession.id, newValues: JSON.stringify({ status: 'REVIEW' }) });
}

export function approveCountSession(activeSession: CountSession): boolean {
  if (activeSession.status === 'POSTED' || activeSession.status === 'CANCELLED') return false;
  const db = DatabaseManager.getInstance();
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.inventory.counts.approve');
  const sessionRow = db.query<{ warehouseId: string; createdBy: string }>(
    'SELECT warehouse_id AS warehouseId, created_by AS createdBy FROM stock_counts WHERE id = ?',
    [activeSession.id]
  )[0];
  if (!sessionRow) throw new Error('Ø¬Ù„Ø³Ø© Ø§Ù„Ø¬Ø±Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©.');
  branchAccess.requireWarehouseAccess(sessionRow.warehouseId, actor);
  if (sessionRow.createdBy === actor.id) throw new Error('Ù„Ø§ ÙŠÙ…ÙƒÙ† Ù„Ù…Ù†Ø´Ø¦ Ø§Ù„Ø¬Ø±Ø¯ Ø§Ø¹ØªÙ…Ø§Ø¯Ù‡.');
  const countWarehouseId = sessionRow.warehouseId;
  db.executeTransaction((txDb) => {
    const currentSession = txDb.query<{ status: string }>('SELECT status FROM stock_counts WHERE id = ?', [activeSession.id])[0];
    if (!currentSession || currentSession.status !== 'REVIEW') {
      throw new Error('ØªÙ… ØªØ±Ø­ÙŠÙ„ Ø§Ù„Ø¬Ù„Ø³Ø© Ø£Ùˆ Ø¥ØºÙ„Ø§Ù‚Ù‡Ø§ Ø¨Ø§Ù„ÙØ¹Ù„. Ø£Ø¹Ø¯ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù‚Ø¨Ù„ Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø©.');
    }
    const { varianceCount, totalVarianceVal } = postCountItems(
      txDb, activeSession, [], actor.id, countWarehouseId
    );

    // 6. Close session status
    txDb.run(`
      UPDATE stock_counts
      SET status = 'POSTED', approval_status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP,
          posted_at = CURRENT_TIMESTAMP, posted_by = ?,
          items_with_variance = ?, total_variance_value = ?
      WHERE id = ?
    `, [actor.id, actor.id, varianceCount, totalVarianceVal, activeSession.id]);
  });
  new AuditService().log({ userId: actor.id, userName: actor.fullName, action: 'APPROVE_AND_POST', module: 'INVENTORY_COUNT', recordId: activeSession.id, newValues: JSON.stringify({ status: 'POSTED' }) });

  return true;
}

export function rejectCountSession(activeSession: CountSession, reason: string): void {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.inventory.counts.approve');
  const db = DatabaseManager.getInstance();
  const session = db.query<{ warehouseId: string; status: string; createdBy: string }>(
    'SELECT warehouse_id AS warehouseId, status, created_by AS createdBy FROM stock_counts WHERE id = ?', [activeSession.id]
  )[0];
  if (!session) throw new Error('Ø¬Ù„Ø³Ø© Ø§Ù„Ø¬Ø±Ø¯ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©.');
  branchAccess.requireWarehouseAccess(session.warehouseId, actor);
  if (session.status !== 'REVIEW') throw new Error('Ø§Ù„Ø¬Ù„Ø³Ø© Ù„ÙŠØ³Øª Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©.');
  if (session.createdBy === actor.id) throw new Error('Ù„Ø§ ÙŠÙ…ÙƒÙ† Ù„Ù…Ù†Ø´Ø¦ Ø§Ù„Ø¬Ø±Ø¯ Ù…Ø±Ø§Ø¬Ø¹ØªÙ‡.');
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error('Ø³Ø¨Ø¨ Ø§Ù„Ø±ÙØ¶ Ù…Ø·Ù„ÙˆØ¨.');
  db.executeTransaction(txDb => {
    const current = txDb.query<{ status: string }>('SELECT status FROM stock_counts WHERE id = ?', [activeSession.id])[0];
    if (!current || current.status !== 'REVIEW') throw new Error('ØªÙ… ØªØ­Ø¯ÙŠØ« Ø­Ø§Ù„Ø© Ø§Ù„Ø¬Ù„Ø³Ø©Ø› Ø£Ø¹Ø¯ ØªØ­Ù…ÙŠÙ„Ù‡Ø§.');
    txDb.run("UPDATE stock_counts SET status = 'COUNTING', approval_status = 'REJECTED', rejection_reason = ? WHERE id = ? AND status = 'REVIEW'", [cleanReason, activeSession.id]);
  });
  new AuditService().log({ userId: actor.id, userName: actor.fullName, action: 'REJECT', module: 'INVENTORY_COUNT', recordId: activeSession.id, newValues: JSON.stringify({ status: 'COUNTING', reason: cleanReason }) });
}

export function cancelCountSession(activeSession: CountSession): void {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.inventory.counts.count');
  const db = DatabaseManager.getInstance();
  const session = db.query<{ warehouseId: string; status: string }>(
    'SELECT warehouse_id AS warehouseId, status FROM stock_counts WHERE id = ?', [activeSession.id]
  )[0];
  if (!session) throw new Error('Count session not found.');
  branchAccess.requireWarehouseAccess(session.warehouseId, actor);
  if (session.status !== 'COUNTING') throw new Error('Only an open count session can be cancelled.');
  db.executeTransaction(txDb => {
    const latest = txDb.query<{ status: string }>('SELECT status FROM stock_counts WHERE id = ?', [activeSession.id])[0];
    if (!latest || latest.status !== 'COUNTING') throw new Error('The session status changed. Reload and try again.');
    txDb.run("UPDATE stock_counts SET status = 'CANCELLED' WHERE id = ? AND status = 'COUNTING'", [activeSession.id]);
  });
}
