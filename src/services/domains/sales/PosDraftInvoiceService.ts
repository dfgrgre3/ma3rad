import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { AppConfigService } from '../config/AppConfigService';

export interface PosInvoiceDraft {
  id: string;
  userId: string;
  customerId: string | null;
  customerName: string | null;
  warehouseId: string | null;
  itemCount: number;
  totalAmount: number;
  payload: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * PosDraftInvoiceService — مسودات فاتورة حية لنقطة البيع.
 *
 * على عكس held_orders (لقطات «طلبات معلقة» يدوية)، هذه المسودة تُحدَّث
 * تلقائياً مع كل تغيير في السلة عند تفعيل posAutoSaveInvoice — سجل واحد
 * لكل كاشير، قابل للاستعلام (عميل/إجمالي/عدد أصناف) وقابل لانتهاء
 * الصلاحية. لا تمس المخزون أو القيود أو الفواتير — مجرد لقطة تُسترجع
 * وتُحذف عند الاعتماد أو إفراغ السلة.
 */
export class PosDraftInvoiceService {
  private db = DatabaseManager.getInstance();

  private requireActor() {
    return AuthService.requireAuth();
  }

  /** TTL للمسودة بالساعات — نفس سياسة الطلبات المعلقة افتراضياً. */
  private ttlHours(): number {
    try {
      return AppConfigService.getPolicyNumber('pos.heldOrderTtlHours', 72);
    } catch {
      return 72;
    }
  }

  /** يحفظ/يحدّث مسودة الكاشير الحالي. المعرف = draft_{userId}. */
  public save(userId: string, draft: {
    customerId?: string | null;
    customerName?: string | null;
    warehouseId?: string | null;
    itemCount: number;
    totalAmount: number;
    payload: string;
  }): void {
    const actor = this.requireActor();
    if (actor.id !== userId) throw new Error('لا يمكن حفظ مسودة باسم مستخدم آخر.');
    const id = `draft_${userId}`;
    this.db.run(
      `INSERT INTO pos_invoice_drafts
         (id, user_id, customer_id, customer_name, warehouse_id, item_count, total_amount, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         customer_id = excluded.customer_id,
         customer_name = excluded.customer_name,
         warehouse_id = excluded.warehouse_id,
         item_count = excluded.item_count,
         total_amount = excluded.total_amount,
         payload = excluded.payload,
         updated_at = CURRENT_TIMESTAMP`,
      [
        id, userId,
        draft.customerId || null, draft.customerName || null, draft.warehouseId || null,
        Math.max(0, Math.round(draft.itemCount)), round2Safe(draft.totalAmount), draft.payload,
      ]
    );
  }

  public get(userId: string): PosInvoiceDraft | null {
    const actor = this.requireActor();
    if (actor.id !== userId) {
      // المدير/المشرف قد يطّلع على مسودة غيره عبر صلاحية الطلبات المعلقة.
      PermissionService.require(actor, 'sales.pos.held.manage');
    }
    return this.db.query<PosInvoiceDraft>(
      `SELECT id, user_id AS userId, customer_id AS customerId, customer_name AS customerName,
              warehouse_id AS warehouseId, item_count AS itemCount, total_amount AS totalAmount,
              payload, created_at AS createdAt, updated_at AS updatedAt
       FROM pos_invoice_drafts WHERE id = ?`,
      [`draft_${userId}`]
    )[0] || null;
  }

  public delete(userId: string): void {
    const actor = this.requireActor();
    if (actor.id !== userId) PermissionService.require(actor, 'sales.pos.held.manage');
    this.db.run(`DELETE FROM pos_invoice_drafts WHERE id = ?`, [`draft_${userId}`]);
  }

  /** حذف المسودات الأقدم من TTL — يُستدعى عند فتح نقطة البيع. */
  public purgeExpired(): number {
    this.requireActor();
    const hours = this.ttlHours();
    const cutoff = new Date(Date.now() - hours * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
    const before = this.db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM pos_invoice_drafts`)[0]?.n || 0;
    this.db.run(`DELETE FROM pos_invoice_drafts WHERE updated_at < ?`, [cutoff]);
    const after = this.db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM pos_invoice_drafts`)[0]?.n || 0;
    // Legacy drafts saved into held_orders by the previous JSON-snapshot
    // implementation — remove them so they don't linger as fake held orders.
    this.db.run(`DELETE FROM held_orders WHERE id LIKE 'draft_%'`);
    return Math.max(0, Number(before) - Number(after));
  }
}

function round2Safe(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
