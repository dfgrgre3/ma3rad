import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import type { ProjectUnit } from './types';
import { ProjectsLayer } from './projects';

/** Project unit (building/floor/apartment/room) hierarchy management. */
export class UnitsLayer extends ProjectsLayer {
  public getUnits(projectId: string): ProjectUnit[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.view');
    this.requireProject(projectId);
    return this.db.query<ProjectUnit>(
      `SELECT * FROM project_units WHERE project_id = ? ORDER BY sort_order, name`,
      [projectId]
    );
  }

  public createUnit(input: {
    projectId: string; parentId?: string; unitType: ProjectUnit['unitType'];
    name: string; areaM2?: number; status?: ProjectUnit['status']; notes?: string;
  }): ProjectUnit {
    this.requireWrite('ui.projects.list.update');
    this.requireProject(input.projectId);
    if (!input.name.trim()) throw new Error('اسم الوحدة مطلوب.');
    if (input.parentId) {
      const parent = this.db.query<{ projectId: string }>(
        `SELECT project_id AS projectId FROM project_units WHERE id = ?`,
        [input.parentId]
      )[0];
      if (!parent || parent.projectId !== input.projectId) {
        throw new Error('الوحدة الأصلية لا تتبع المشروع المحدد.');
      }
    }
    const id = `unit_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO project_units (id, project_id, parent_id, unit_type, name, area_m2, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.projectId, input.parentId || null, input.unitType, input.name.trim(),
        input.areaM2 || 0, input.status || 'PENDING', input.notes || null,
      ]
    );
    return this.db.query<ProjectUnit>(`SELECT * FROM project_units WHERE id = ?`, [id])[0];
  }

  public updateUnit(id: string, patch: Partial<ProjectUnit>): void {
    this.requireWrite('ui.projects.list.update');
    const unit = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_units WHERE id = ?`,
      [id]
    )[0];
    if (!unit) throw new Error('الوحدة غير موجودة.');
    this.requireProject(unit.projectId);
    this.db.run(
      `UPDATE project_units SET
        name = COALESCE(?, name), unit_type = COALESCE(?, unit_type),
        area_m2 = COALESCE(?, area_m2), status = COALESCE(?, status), notes = COALESCE(?, notes)
       WHERE id = ?`,
      [patch.name ?? null, patch.unitType ?? null, patch.areaM2 ?? null, patch.status ?? null, patch.notes ?? null, id]
    );
  }

  public deleteUnit(id: string): void {
    this.requireWrite('ui.projects.list.update');
    const unit = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_units WHERE id = ?`,
      [id]
    )[0];
    if (!unit) throw new Error('الوحدة غير موجودة.');
    this.requireProject(unit.projectId);
    this.db.run(`DELETE FROM project_units WHERE id = ?`, [id]);
  }
}
