import { DatabaseManager } from '../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { AuditService } from '../security/AuditService';
import type { CountItem, CountSession } from '../../types/inventory/countSessions';
import { getCountStockInfo, saveCountDraft, validateCountItemMembership, validateCountedQuantity } from './countSessionService_part02';
import type { CountVarianceTotals } from './countSessionService_part02';
import { updateCountItem } from './countSessionService_part03';
import { postCountVariance } from './countSessionService_part04';

export function postCountItems(
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
  if (sessionItems.some(item => item.countedQuantityM2 === null)) throw new Error('أكمل عد جميع الأصناف قبل إرسال الجرد للمراجعة.');
  for (const item of sessionItems) {
    if (item.countedQuantityM2 !== null && Number(item.countedQuantityM2) !== item.systemQuantityM2 && !item.discrepancyReason?.trim()) {
      throw new Error(`حدد سبب الفرق للصنف ${item.productName}.`);
    }
  }
  saveCountDraft(activeSession, sessionItems);
  const db = DatabaseManager.getInstance();
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.inventory.counts.count');
  db.executeTransaction(txDb => {
    const current = txDb.query<{ status: string }>('SELECT status FROM stock_counts WHERE id = ?', [activeSession.id])[0];
    if (!current || current.status !== 'COUNTING') throw new Error('الجلسة ليست قيد العد.');
    txDb.run("UPDATE stock_counts SET status = 'REVIEW', approval_status = 'PENDING', rejection_reason = NULL WHERE id = ? AND status = 'COUNTING'", [activeSession.id]);
  });
  new AuditService().log({ userId: actor.id, userName: actor.fullName, action: 'SUBMIT_FOR_REVIEW', module: 'INVENTORY_COUNT', recordId: activeSession.id, newValues: JSON.stringify({ status: 'REVIEW' }) });
}
