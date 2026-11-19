import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { unscaleMoneyRow } from '../../../../utils/money';
import { CHANGE_REQUEST_MONEY_FIELDS, type ProjectChangeRequest, type ProjectChangeStatus } from './types';
import { RisksLayer } from './risks';

/** Project change requests with approve/reject/cancel workflow. */
export class ChangeRequestsLayer extends RisksLayer {
  public getChangeRequests(projectId: string): ProjectChangeRequest[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.view');
    this.requireProject(projectId);
    return this.db.query<ProjectChangeRequest>(
      `SELECT c.*, ru.full_name AS requester_name, du.full_name AS decider_name
       FROM project_change_requests c
       LEFT JOIN users ru ON ru.id = c.requested_by
       LEFT JOIN users du ON du.id = c.decided_by
       WHERE c.project_id = ?
       ORDER BY CASE c.status WHEN 'PENDING' THEN 0 ELSE 1 END, c.created_at DESC`,
      [projectId]
    ).map((row) => unscaleMoneyRow(row, CHANGE_REQUEST_MONEY_FIELDS));
  }

  public createChangeRequest(input: {
    projectId: string; title: string; description?: string;
    costImpact?: number; timeImpactDays?: number;
  }): ProjectChangeRequest {
    this.requireWrite('ui.projects.list.update');
    this.requireProject(input.projectId);
    if (!input.title?.trim()) throw new Error('عنوان طلب التغيير مطلوب.');
    const costImpact = input.costImpact ?? 0;
    if (!Number.isFinite(costImpact)) throw new Error('الأثر المالي غير صالح.');
    const timeImpactDays = input.timeImpactDays ?? 0;
    if (!Number.isInteger(timeImpactDays)) throw new Error('الأثر الزمني يجب أن يكون عدداً صحيحاً من الأيام.');

    const actor = AuthService.requireAuth();
    const id = `chg_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO project_change_requests (
         id, project_id, title, description, cost_impact, time_impact_days, status,
         requested_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ROUND(?*100), ?, 'PENDING', ?, ?, ?)`,
      [
        id, input.projectId, input.title.trim(), input.description?.trim() || null,
        costImpact, timeImpactDays, actor.id, now, now,
      ]
    );
    this.audit('طلب تغيير مشروع', id, { projectId: input.projectId, title: input.title.trim(), costImpact, timeImpactDays });
    return this.getChangeRequests(input.projectId).find((request) => request.id === id)!;
  }

  public decideChangeRequest(id: string, decision: 'APPROVED' | 'REJECTED', note?: string): ProjectChangeRequest {
    this.requireApprove();
    const existing = this.db.query<{ projectId: string; status: ProjectChangeStatus }>(
      `SELECT project_id AS projectId, status FROM project_change_requests WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('طلب التغيير غير موجود.');
    this.requireProject(existing.projectId);
    if (existing.status !== 'PENDING') throw new Error('لا يمكن البت في طلب تغيير ليس قيد الانتظار.');

    const actor = AuthService.requireAuth();
    this.db.run(
      `UPDATE project_change_requests SET
         status = ?, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ?
       WHERE id = ?`,
      [decision, actor.id, new Date().toISOString(), note?.trim() || null, new Date().toISOString(), id]
    );
    this.audit(decision === 'APPROVED' ? 'اعتماد طلب تغيير' : 'رفض طلب تغيير', id, { decision, note: note || null });
    return this.getChangeRequests(existing.projectId).find((request) => request.id === id)!;
  }

  public cancelChangeRequest(id: string, note?: string): ProjectChangeRequest {
    const actor = AuthService.requireAuth();
    this.requireWrite('ui.projects.list.update');
    const existing = this.db.query<{ projectId: string; status: ProjectChangeStatus; requestedBy: string | null }>(
      `SELECT project_id AS projectId, status, requested_by AS requestedBy
       FROM project_change_requests WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('طلب التغيير غير موجود.');
    this.requireProject(existing.projectId);
    if (existing.status !== 'PENDING') throw new Error('لا يمكن إلغاء طلب تغيير تم البت فيه.');
    if (existing.requestedBy !== actor.id && !PermissionService.can(actor, 'ui.projects.list.approve')) {
      throw new Error('ليس لديك صلاحية إلغاء طلب التغيير هذا.');
    }
    this.db.run(
      `UPDATE project_change_requests SET
         status = 'CANCELLED', decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ?
       WHERE id = ?`,
      [actor.id, new Date().toISOString(), note?.trim() || null, new Date().toISOString(), id]
    );
    this.audit('إلغاء طلب تغيير', id, { note: note || null });
    return this.getChangeRequests(existing.projectId).find((request) => request.id === id)!;
  }
}
