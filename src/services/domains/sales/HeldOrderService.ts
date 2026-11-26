import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';

export interface HeldOrderRecord { id: string; data: string; createdAt: string; createdBy: string | null; }

export interface ManagedHeldOrderRecord extends HeldOrderRecord {
  userName: string | null;
  branchId: string | null;
  branchName: string | null;
}

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

  /** All held orders across employees — supervisors/managers only (sales.pos.held.manage). */
  listAll(): ManagedHeldOrderRecord[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.pos.held.manage');
    const rows = this.db.query<HeldOrderRecord & { userName: string | null }>(
      `SELECT h.id, h.data, h.created_at AS createdAt, h.created_by AS createdBy, u.full_name AS userName
       FROM held_orders h
       LEFT JOIN users u ON u.id = h.created_by
       ORDER BY h.created_at DESC`
    );
    const warehouses = new Map(
      this.db.query<{ id: string; branchId: string | null }>(
        `SELECT id, branch_id AS branchId FROM warehouses`
      ).map((w) => [w.id, w.branchId])
    );
    const branches = new Map(
      this.db.query<{ id: string; name: string }>(`SELECT id, name FROM branches`).map((b) => [b.id, b.name])
    );
    return rows.map((row) => {
      let warehouseId = '';
      try {
        warehouseId = String((JSON.parse(row.data) as { warehouseId?: string })?.warehouseId || '');
      } catch { /* corrupt payload — branch stays unresolved */ }
      const branchId = warehouseId ? (warehouses.get(warehouseId) ?? null) : null;
      return {
        ...row,
        branchId,
        branchName: branchId ? (branches.get(branchId) ?? null) : null,
      };
    });
  }

  /** Fetch a single held order owned by another employee (sales.pos.held.manage). */
  getManaged(id: string): ManagedHeldOrderRecord | null {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.pos.held.manage');
    return this.listAll().find((row) => row.id === id) ?? null;
  }

  /** Delete a held order owned by another employee (sales.pos.held.manage). */
  deleteManaged(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.pos.held.manage');
    this.db.run(`DELETE FROM held_orders WHERE id = ?`, [id]);
  }

  /**
   * حذف الطلبات المعلقة الأقدم من `olderThanIso` نهائياً — تنظيف تلقائي
   * لسياسة انتهاء الصلاحية. الطلب المنتهي لا يمكن استرجاعه أصلاً، فإبقاؤه
   * في القاعدة مجرد حمل ميت. يُعيد عدد الصفوف المحذوفة للتدقيق.
   */
  purgeExpired(olderThanIso: string): number {
    AuthService.requireAuth();
    const before = this.db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM held_orders`)[0]?.n || 0;
    this.db.run(`DELETE FROM held_orders WHERE created_at < ?`, [olderThanIso]);
    const after = this.db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM held_orders`)[0]?.n || 0;
    return Math.max(0, Number(before) - Number(after));
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
