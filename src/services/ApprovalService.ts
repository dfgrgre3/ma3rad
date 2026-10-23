import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';

export type ApprovalType =
  | 'DISCOUNT' | 'PRICE_CHANGE' | 'SALES_RETURN' | 'PURCHASE_RETURN'
  | 'STOCK_ADJUSTMENT' | 'PURCHASE_ORDER' | 'EXPENSE' | 'CREDIT_LIMIT' | 'LEAVE' | 'OTHER';

export interface ApprovalRequest {
  id: string;
  requestNumber: string;
  requestType: ApprovalType;
  referenceType?: string | null;
  referenceId?: string | null;
  title: string;
  description?: string | null;
  requestedValue?: number | null;
  currentValue?: number | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  requestedBy: string;
  requestedByName?: string;
  decidedBy?: string | null;
  decidedByName?: string;
  decidedAt?: string | null;
  decisionNotes?: string | null;
  createdAt: string;
}

export class ApprovalService {
  private db = DatabaseManager.getInstance();

  public getRequests(status = 'ALL', search = '', type = 'ALL'): ApprovalRequest[] {
    let sql = `
      SELECT a.*, ru.full_name AS requested_by_name, du.full_name AS decided_by_name
      FROM approval_requests a
      LEFT JOIN users ru ON ru.id = a.requested_by
      LEFT JOIN users du ON du.id = a.decided_by
      WHERE 1 = 1`;
    const params: any[] = [];
    if (status !== 'ALL') { sql += ` AND a.status = ?`; params.push(status); }
    if (type !== 'ALL') { sql += ` AND a.request_type = ?`; params.push(type); }
    if (search.trim()) {
      sql += ` AND (a.title LIKE ? OR a.description LIKE ? OR a.request_number LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY CASE a.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END, a.created_at DESC`;
    return this.db.query<ApprovalRequest>(sql, params);
  }

  public getStats(): { pending: number; approved: number; rejected: number } {
    const rows = this.db.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) AS count FROM approval_requests WHERE status IN ('PENDING','APPROVED','REJECTED') GROUP BY status`
    );
    const map = new Map(rows.map((r) => [r.status, Number(r.count)]));
    return {
      pending: map.get('PENDING') || 0,
      approved: map.get('APPROVED') || 0,
      rejected: map.get('REJECTED') || 0,
    };
  }

  public createRequest(input: {
    requestType: ApprovalType; title: string; description?: string;
    requestedValue?: number; currentValue?: number;
    priority?: ApprovalRequest['priority']; referenceType?: string; referenceId?: string;
  }): ApprovalRequest {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'approvals.view');
    if (!input.title.trim()) throw new Error('عنوان الطلب مطلوب.');

    const id = `apr_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const requestNumber = db.nextNumber('APR');
      db.run(
        `INSERT INTO approval_requests (
          id, request_number, request_type, reference_type, reference_id, title, description,
          requested_value, current_value, priority, requested_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, requestNumber, input.requestType, input.referenceType || null, input.referenceId || null,
          input.title.trim(), input.description || null, input.requestedValue ?? null,
          input.currentValue ?? null, input.priority || 'NORMAL', actor.id,
        ]
      );
      return this.db.query<ApprovalRequest>(`SELECT * FROM approval_requests WHERE id = ?`, [id])[0];
    });
  }

  public decide(id: string, approved: boolean, notes?: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'approvals.approve');
    const row = this.db.query<ApprovalRequest>(`SELECT * FROM approval_requests WHERE id = ?`, [id])[0];
    if (!row) throw new Error('الطلب غير موجود.');
    if (row.status !== 'PENDING') throw new Error('تم اتخاذ قرار في هذا الطلب بالفعل.');

    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE approval_requests SET status = ?, decided_by = ?, decided_at = ?, decision_notes = ? WHERE id = ?`,
        [approved ? 'APPROVED' : 'REJECTED', actor.id, new Date().toISOString(), notes || null, id]
      );
      const applied = approved ? this.applyApprovedEffect(row, db) : null;
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, ?, 'APPROVALS', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName,
          approved ? 'اعتماد طلب' : 'رفض طلب', id,
          JSON.stringify({ decision: approved ? 'APPROVED' : 'REJECTED', notes, applied }),
        ]
      );
    });
  }

  /** Execute the approved operation when it has an unambiguous system effect. */
  private applyApprovedEffect(row: ApprovalRequest, db: any): string | null {
    if (!row.referenceId || row.requestedValue == null) return null;
    const value = Number(row.requestedValue);
    if (!Number.isFinite(value) || value < 0) return null;

    if (row.requestType === 'CREDIT_LIMIT') {
      const customer = db.query(`SELECT id, credit_limit FROM customers WHERE id = ?`, [row.referenceId])[0];
      if (!customer) return null;
      db.run(
        `UPDATE customers SET credit_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [value, row.referenceId]
      );
      return `تم تحديث حد الائتمان من ${Number(customer.credit_limit) || 0} إلى ${value}`;
    }

    if (row.requestType === 'PRICE_CHANGE') {
      const product = db.query(`SELECT id, selling_price_m2 FROM products WHERE id = ?`, [row.referenceId])[0];
      if (!product) return null;
      db.run(
        `UPDATE products SET selling_price_m2 = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [value, row.referenceId]
      );
      return `تم تحديث سعر البيع من ${Number(product.selling_price_m2) || 0} إلى ${value}`;
    }

    return null;
  }

  public cancel(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'approvals.view');
    this.db.run(
      `UPDATE approval_requests SET status = 'CANCELLED', decided_by = ?, decided_at = ? WHERE id = ? AND status = 'PENDING'`,
      [actor.id, new Date().toISOString(), id]
    );
  }
}
