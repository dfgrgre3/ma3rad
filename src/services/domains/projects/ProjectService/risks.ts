import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import {
  RISK_PROBABILITIES,
  RISK_SEVERITIES,
  RISK_STATUSES,
  type ProjectRisk,
  type ProjectRiskProbability,
  type ProjectRiskSeverity,
  type ProjectRiskStatus,
} from './types';
import { BudgetLayer } from './budget';

/** Project risk register (severity/probability/status). */
export class RisksLayer extends BudgetLayer {
  public getRisks(projectId: string): ProjectRisk[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.view');
    this.requireProject(projectId);
    return this.db.query<ProjectRisk>(
      `SELECT * FROM project_risks WHERE project_id = ? ORDER BY
         CASE status WHEN 'OPEN' THEN 0 WHEN 'MITIGATED' THEN 1 WHEN 'ACCEPTED' THEN 2 ELSE 3 END,
         CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
         created_at DESC`,
      [projectId]
    );
  }

  public createRisk(input: {
    projectId: string; title: string; description?: string; severity?: ProjectRiskSeverity;
    probability?: ProjectRiskProbability; mitigation?: string; ownerName?: string;
  }): ProjectRisk {
    this.requireWrite('ui.projects.list.update');
    this.requireProject(input.projectId);
    if (!input.title?.trim()) throw new Error('عنوان الخطر مطلوب.');
    const severity = input.severity || 'MEDIUM';
    if (!RISK_SEVERITIES.includes(severity)) throw new Error('درجة الخطورة غير صالحة.');
    const probability = input.probability || 'MEDIUM';
    if (!RISK_PROBABILITIES.includes(probability)) throw new Error('احتمالية الخطر غير صالحة.');

    const actor = AuthService.requireAuth();
    const id = `risk_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO project_risks (
         id, project_id, title, description, severity, probability, status,
         mitigation, owner_name, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)`,
      [
        id, input.projectId, input.title.trim(), input.description?.trim() || null,
        severity, probability, input.mitigation?.trim() || null,
        input.ownerName?.trim() || null, actor.id, now, now,
      ]
    );
    this.audit('إضافة خطر مشروع', id, { projectId: input.projectId, title: input.title.trim(), severity });
    return this.db.query<ProjectRisk>(`SELECT * FROM project_risks WHERE id = ?`, [id])[0];
  }

  public updateRisk(id: string, patch: {
    title?: string; description?: string; severity?: ProjectRiskSeverity;
    probability?: ProjectRiskProbability; status?: ProjectRiskStatus;
    mitigation?: string; ownerName?: string;
  }): ProjectRisk {
    this.requireWrite('ui.projects.list.update');
    const existing = this.db.query<ProjectRisk>(`SELECT * FROM project_risks WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('الخطر غير موجود.');
    this.requireProject(existing.projectId);
    if (patch.title !== undefined && !patch.title.trim()) throw new Error('عنوان الخطر مطلوب.');
    if (patch.severity && !RISK_SEVERITIES.includes(patch.severity)) throw new Error('درجة الخطورة غير صالحة.');
    if (patch.probability && !RISK_PROBABILITIES.includes(patch.probability)) throw new Error('احتمالية الخطر غير صالحة.');
    if (patch.status && !RISK_STATUSES.includes(patch.status)) throw new Error('حالة الخطر غير صالحة.');

    this.db.run(
      `UPDATE project_risks SET
         title = COALESCE(?, title), description = COALESCE(?, description),
         severity = COALESCE(?, severity), probability = COALESCE(?, probability),
         status = COALESCE(?, status), mitigation = COALESCE(?, mitigation),
         owner_name = COALESCE(?, owner_name), updated_at = ?
       WHERE id = ?`,
      [
        patch.title?.trim() || null, patch.description?.trim() || null,
        patch.severity ?? null, patch.probability ?? null, patch.status ?? null,
        patch.mitigation?.trim() || null, patch.ownerName?.trim() || null,
        new Date().toISOString(), id,
      ]
    );
    this.audit('تعديل خطر مشروع', id, patch);
    return this.db.query<ProjectRisk>(`SELECT * FROM project_risks WHERE id = ?`, [id])[0];
  }

  public deleteRisk(id: string): void {
    this.requireWrite('ui.projects.list.update');
    const existing = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_risks WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('الخطر غير موجود.');
    this.requireProject(existing.projectId);
    this.db.run(`DELETE FROM project_risks WHERE id = ?`, [id]);
    this.audit('حذف خطر مشروع', id, { projectId: existing.projectId });
  }
}
