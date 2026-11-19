import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { DELIVERABLE_STATUSES, assertDate, type ProjectDeliverable, type ProjectDeliverableStatus } from './types';
import { ChangeRequestsLayer } from './changeRequests';

/** Project deliverables lifecycle (pending → delivered → accepted/rejected). */
export class DeliverablesLayer extends ChangeRequestsLayer {
  public getDeliverables(projectId: string): ProjectDeliverable[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.view');
    this.requireProject(projectId);
    return this.db.query<ProjectDeliverable>(
      `SELECT * FROM project_deliverables WHERE project_id = ?
       ORDER BY CASE status WHEN 'PENDING' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'DELIVERED' THEN 2 ELSE 3 END,
                due_date, created_at`,
      [projectId]
    );
  }

  public createDeliverable(input: {
    projectId: string; title: string; description?: string; dueDate?: string; notes?: string;
  }): ProjectDeliverable {
    this.requireWrite('ui.projects.list.update');
    this.requireProject(input.projectId);
    if (!input.title?.trim()) throw new Error('عنوان المخرج مطلوب.');
    assertDate(input.dueDate, 'تاريخ استحقاق المخرج');

    const id = `dlv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO project_deliverables (
         id, project_id, title, description, due_date, status, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [
        id, input.projectId, input.title.trim(), input.description?.trim() || null,
        input.dueDate || null, input.notes?.trim() || null, now, now,
      ]
    );
    this.audit('إضافة مخرج مشروع', id, { projectId: input.projectId, title: input.title.trim() });
    return this.db.query<ProjectDeliverable>(`SELECT * FROM project_deliverables WHERE id = ?`, [id])[0];
  }

  public updateDeliverable(id: string, patch: {
    title?: string; description?: string; dueDate?: string | null;
    status?: ProjectDeliverableStatus; notes?: string;
  }): ProjectDeliverable {
    this.requireWrite('ui.projects.list.update');
    const existing = this.db.query<ProjectDeliverable>(`SELECT * FROM project_deliverables WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('المخرج غير موجود.');
    this.requireProject(existing.projectId);
    if (patch.title !== undefined && !patch.title.trim()) throw new Error('عنوان المخرج مطلوب.');
    if (patch.status && !DELIVERABLE_STATUSES.includes(patch.status)) throw new Error('حالة المخرج غير صالحة.');
    assertDate(patch.dueDate, 'تاريخ استحقاق المخرج');

    const status = patch.status ?? existing.status;
    const now = new Date().toISOString();
    const deliveredAt = status === 'DELIVERED' || status === 'ACCEPTED'
      ? existing.deliveredAt || now
      : null;
    const acceptedAt = status === 'ACCEPTED'
      ? existing.acceptedAt || now
      : null;

    this.db.run(
      `UPDATE project_deliverables SET
         title = COALESCE(?, title), description = COALESCE(?, description),
         due_date = COALESCE(?, due_date), status = ?,
         delivered_at = ?, accepted_at = ?, notes = COALESCE(?, notes), updated_at = ?
       WHERE id = ?`,
      [
        patch.title?.trim() || null, patch.description?.trim() || null, patch.dueDate ?? null,
        status, deliveredAt, acceptedAt, patch.notes?.trim() || null, now, id,
      ]
    );
    this.audit('تعديل مخرج مشروع', id, { status, ...patch });
    return this.db.query<ProjectDeliverable>(`SELECT * FROM project_deliverables WHERE id = ?`, [id])[0];
  }

  public deleteDeliverable(id: string): void {
    this.requireWrite('ui.projects.list.update');
    const existing = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_deliverables WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('المخرج غير موجود.');
    this.requireProject(existing.projectId);
    this.db.run(`DELETE FROM project_deliverables WHERE id = ?`, [id]);
    this.audit('حذف مخرج مشروع', id, { projectId: existing.projectId });
  }
}
