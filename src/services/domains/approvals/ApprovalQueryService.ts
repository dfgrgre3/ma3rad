import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import type { ApprovalRequest } from './approvalTypes';

export class ApprovalQueryService {
  private readonly db = DatabaseManager.getInstance();
  private readonly branchAccess = new BranchAccessService();

  getRequests(status = 'ALL', search = '', type = 'ALL'): ApprovalRequest[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.approvals.inbox.view');
    this.expireRequests();
    const scope = this.branchAccess.sqlScope('a.branch_id', undefined, actor);
    let sql = `
      SELECT a.*, a.payload AS payload, ru.full_name AS requested_by_name, du.full_name AS decided_by_name,
        (SELECT COUNT(*) FROM approval_decisions ad WHERE ad.approval_request_id = a.id AND ad.decision = 'APPROVED') AS approval_count,
        (SELECT json_group_array(json_object('decision', ad.decision, 'user', u.full_name, 'notes', ad.notes, 'at', ad.decided_at))
         FROM approval_decisions ad LEFT JOIN users u ON u.id = ad.decided_by WHERE ad.approval_request_id = a.id) AS decision_history
      FROM approval_requests a
      LEFT JOIN users ru ON ru.id = a.requested_by
      LEFT JOIN users du ON du.id = a.decided_by
      WHERE ${scope.clause}`;
    const params: any[] = [...scope.params];
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

  getStats(): { pending: number; approved: number; rejected: number; cancelled: number; expired: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.approvals.inbox.view');
    this.expireRequests();
    const scope = this.branchAccess.sqlScope('branch_id', undefined, actor);
    const rows = this.db.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) AS count FROM approval_requests
       WHERE ${scope.clause} AND status IN ('PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED') GROUP BY status`,
      scope.params
    );
    const map = new Map(rows.map((row) => [row.status, Number(row.count)]));
    const counts = {
      pending: map.get('PENDING') || 0,
      approved: map.get('APPROVED') || 0,
      rejected: map.get('REJECTED') || 0,
      cancelled: map.get('CANCELLED') || 0,
      expired: map.get('EXPIRED') || 0,
    };
    return counts;
  }

  private expireRequests(): void {
    this.db.executeTransaction((db) => {
      const expired = db.query<{ id: string; referenceType: string | null; referenceId: string | null }>(
        `SELECT id, reference_type AS referenceType, reference_id AS referenceId
         FROM approval_requests WHERE status = 'PENDING' AND expires_at IS NOT NULL AND julianday(expires_at) <= julianday('now')`
      );
      for (const request of expired) {
        db.run(`UPDATE approval_requests SET status = 'EXPIRED', decided_at = CURRENT_TIMESTAMP, decision_notes = 'انتهت صلاحية الطلب' WHERE id = ? AND status = 'PENDING'`, [request.id]);
        if (request.referenceType === 'STOCK_ADJUSTMENT' && request.referenceId) {
          db.run(`UPDATE stock_adjustments SET status = 'REJECTED', approval_status = 'REJECTED' WHERE id = ? AND status = 'PENDING_APPROVAL' AND approval_status = 'PENDING'`, [request.referenceId]);
        }
      }
    });
  }
}
