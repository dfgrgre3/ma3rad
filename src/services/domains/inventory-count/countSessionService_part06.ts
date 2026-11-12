import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { AuditService } from '../security/AuditService';
import { branchAccess } from './branchAccess';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import type { CountSession } from '../../../types/inventory/countSessions';
import { postCountItems } from './countSessionService_part05';

export function approveCountSession(activeSession: CountSession): boolean {
  ModuleRegistryService.assertModuleEnabled('inventory');
  if (activeSession.status === 'POSTED' || activeSession.status === 'CANCELLED') return false;
  const db = DatabaseManager.getInstance();
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.inventory.counts.approve');
  const sessionRow = db.query<{ warehouseId: string; createdBy: string }>(
    'SELECT warehouse_id AS warehouseId, created_by AS createdBy FROM stock_counts WHERE id = ?',
    [activeSession.id]
  )[0];
  if (!sessionRow) throw new Error('جلسة الجرد غير موجودة.');
  branchAccess.requireWarehouseAccess(sessionRow.warehouseId, actor);
  if (sessionRow.createdBy === actor.id) throw new Error('لا يمكن لمنشئ الجرد اعتماده.');
  const countWarehouseId = sessionRow.warehouseId;
  db.executeTransaction((txDb) => {
    const currentSession = txDb.query<{ status: string }>('SELECT status FROM stock_counts WHERE id = ?', [activeSession.id])[0];
    if (!currentSession || currentSession.status !== 'REVIEW') {
      throw new Error('تم ترحيل الجلسة أو إغلاقها بالفعل. أعد تحميل البيانات قبل المتابعة.');
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
  ModuleRegistryService.assertModuleEnabled('inventory');
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.inventory.counts.approve');
  const db = DatabaseManager.getInstance();
  const session = db.query<{ warehouseId: string; status: string; createdBy: string }>(
    'SELECT warehouse_id AS warehouseId, status, created_by AS createdBy FROM stock_counts WHERE id = ?', [activeSession.id]
  )[0];
  if (!session) throw new Error('جلسة الجرد غير موجودة.');
  branchAccess.requireWarehouseAccess(session.warehouseId, actor);
  if (session.status !== 'REVIEW') throw new Error('الجلسة ليست بانتظار المراجعة.');
  if (session.createdBy === actor.id) throw new Error('لا يمكن لمنشئ الجرد مراجعته.');
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error('سبب الرفض مطلوب.');
  db.executeTransaction(txDb => {
    const current = txDb.query<{ status: string }>('SELECT status FROM stock_counts WHERE id = ?', [activeSession.id])[0];
    if (!current || current.status !== 'REVIEW') throw new Error('تم تحديث حالة الجلسة؛ أعد تحميلها.');
    txDb.run("UPDATE stock_counts SET status = 'COUNTING', approval_status = 'REJECTED', rejection_reason = ? WHERE id = ? AND status = 'REVIEW'", [cleanReason, activeSession.id]);
  });
  new AuditService().log({ userId: actor.id, userName: actor.fullName, action: 'REJECT', module: 'INVENTORY_COUNT', recordId: activeSession.id, newValues: JSON.stringify({ status: 'COUNTING', reason: cleanReason }) });
}
