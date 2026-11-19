import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { assertDate, type ProjectTimeEntry, type ProjectTimeSummary } from './types';
import { TasksLayer } from './tasks';

/** Project time entries and time summaries. */
export class TimeLayer extends TasksLayer {
  public getTimeEntries(projectId: string): ProjectTimeEntry[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.view');
    this.requireProject(projectId);
    return this.db.query<ProjectTimeEntry>(
      `SELECT t.*, task.title AS task_title
       FROM project_time_entries t
       LEFT JOIN project_tasks task ON task.id = t.task_id
       WHERE t.project_id = ?
       ORDER BY t.entry_date DESC, t.created_at DESC`,
      [projectId]
    );
  }

  public addTimeEntry(input: {
    projectId: string; taskId?: string; employeeName?: string; entryDate: string;
    hours: number; description?: string; billable?: boolean;
  }): ProjectTimeEntry {
    this.requireWrite('ui.projects.list.update');
    this.requireProject(input.projectId);
    if (!input.entryDate) throw new Error('تاريخ تسجيل الوقت مطلوب.');
    assertDate(input.entryDate, 'تاريخ تسجيل الوقت');
    if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > 24) {
      throw new Error('عدد الساعات يجب أن يكون أكبر من صفر ولا يتجاوز 24.');
    }
    if (input.taskId) this.requireTask(input.projectId, input.taskId);

    const actor = AuthService.requireAuth();
    const id = `time_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO project_time_entries (
         id, project_id, task_id, employee_name, entry_date, hours, description, billable, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.projectId, input.taskId || null, input.employeeName?.trim() || null,
        input.entryDate, input.hours, input.description?.trim() || null,
        input.billable === false ? 0 : 1, actor.id, new Date().toISOString(),
      ]
    );
    this.audit('تسجيل وقت مشروع', id, { projectId: input.projectId, hours: input.hours });
    return this.getTimeEntries(input.projectId).find((entry) => entry.id === id)!;
  }

  public deleteTimeEntry(id: string): void {
    this.requireWrite('ui.projects.list.update');
    const entry = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_time_entries WHERE id = ?`,
      [id]
    )[0];
    if (!entry) throw new Error('سجل الوقت غير موجود.');
    this.requireProject(entry.projectId);
    this.db.run(`DELETE FROM project_time_entries WHERE id = ?`, [id]);
    this.audit('حذف سجل وقت مشروع', id, { projectId: entry.projectId });
  }

  public getTimeSummary(projectId: string): ProjectTimeSummary {
    const entries = this.getTimeEntries(projectId);
    const summary: ProjectTimeSummary = {
      totalHours: 0,
      billableHours: 0,
      nonBillableHours: 0,
      byTask: [],
    };
    const byTask = new Map<string, { taskId: string | null; taskTitle: string; hours: number }>();
    for (const entry of entries) {
      const hours = Number(entry.hours) || 0;
      summary.totalHours += hours;
      if (Number(entry.billable) === 1) summary.billableHours += hours;
      else summary.nonBillableHours += hours;
      const key = entry.taskId || '__none__';
      const current = byTask.get(key) || {
        taskId: entry.taskId || null,
        taskTitle: entry.taskTitle || 'بدون مهمة',
        hours: 0,
      };
      current.hours += hours;
      byTask.set(key, current);
    }
    summary.byTask = [...byTask.values()].sort((a, b) => b.hours - a.hours);
    return summary;
  }
}
