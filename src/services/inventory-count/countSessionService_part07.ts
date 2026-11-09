import { DatabaseManager } from '../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { branchAccess } from './branchAccess';
import type { CountSession } from '../../types/inventory/countSessions';

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
