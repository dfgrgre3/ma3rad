import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';

export interface HeldOrderRecord { id: string; data: string; createdAt: string; createdBy: string | null; }

export class HeldOrderService {
  private db = DatabaseManager.getInstance();

  getAll(createdBy: string): HeldOrderRecord[] {
    const actor = AuthService.requireAuth();
    if (!createdBy || actor.id !== createdBy) throw new Error('لا يمكن عرض طلبات مستخدم آخر.');
    return this.db.query<HeldOrderRecord>(
      `SELECT id, data, created_at AS createdAt, created_by AS createdBy FROM held_orders WHERE created_by = ? ORDER BY created_at DESC`,
      [createdBy]
    );
  }

  save(id: string, data: string, createdBy?: string): void {
    const actor = AuthService.requireAuth();
    if (!createdBy || actor.id !== createdBy) throw new Error('لا يمكن حفظ طلب باسم مستخدم آخر.');
    this.db.run(
      `INSERT INTO held_orders (id, data, created_by) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
       WHERE held_orders.created_by = excluded.created_by`,
      [id, data, createdBy]
    );
  }

  delete(id: string, createdBy: string): void {
    const actor = AuthService.requireAuth();
    if (!createdBy || actor.id !== createdBy) throw new Error('لا يمكن حذف طلب مستخدم آخر.');
    this.db.run(`DELETE FROM held_orders WHERE id = ? AND created_by = ?`, [id, createdBy]);
  }
}
