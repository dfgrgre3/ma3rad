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
    const scope = this.branchAccess.sqlScope('a.branch_id', undefined, actor);
    let sql = `
      SELECT a.*, ru.full_name AS requested_by_name, du.full_name AS decided_by_name
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

  getStats(): { pending: number; approved: number; rejected: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.approvals.inbox.view');
    const scope = this.branchAccess.sqlScope('branch_id', undefined, actor);
    const rows = this.db.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) AS count FROM approval_requests
       WHERE ${scope.clause} AND status IN ('PENDING','APPROVED','REJECTED') GROUP BY status`,
      scope.params
    );
    const map = new Map(rows.map((row) => [row.status, Number(row.count)]));
    return {
      pending: map.get('PENDING') || 0,
      approved: map.get('APPROVED') || 0,
      rejected: map.get('REJECTED') || 0,
    };
  }
}
