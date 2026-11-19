import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  assertDate,
  type ProjectTask,
  type ProjectTaskDependency,
  type ProjectTaskPriority,
  type ProjectTaskStatus,
} from './types';
import { ProductsLayer } from './products';

/** Project tasks, statuses, priorities and dependency graph (cycle-safe). */
export class TasksLayer extends ProductsLayer {
  protected requireTask(projectId: string, taskId: string): ProjectTask {
    const task = this.db.query<ProjectTask>(
      `SELECT * FROM project_tasks WHERE id = ? AND project_id = ?`,
      [taskId, projectId]
    )[0];
    if (!task) throw new Error('المهمة غير موجودة داخل هذا المشروع.');
    return task;
  }

  public getTasks(projectId: string): ProjectTask[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.view');
    this.requireProject(projectId);
    const tasks = this.db.query<ProjectTask>(
      `SELECT * FROM project_tasks WHERE project_id = ? ORDER BY sort_order, created_at`,
      [projectId]
    );
    if (tasks.length === 0) return tasks;
    const dependencies = this.db.query<ProjectTaskDependency>(
      `SELECT * FROM project_task_dependencies WHERE project_id = ?`,
      [projectId]
    );
    return tasks.map((task) => ({
      ...task,
      progress: Number(task.progress) || 0,
      dependencyIds: dependencies
        .filter((dependency) => dependency.taskId === task.id)
        .map((dependency) => dependency.dependsOnTaskId),
    }));
  }

  public createTask(input: {
    projectId: string; title: string; description?: string; status?: ProjectTaskStatus;
    priority?: ProjectTaskPriority; assigneeName?: string; startDate?: string; dueDate?: string;
    progress?: number; sortOrder?: number;
  }): ProjectTask {
    this.requireWrite('ui.projects.list.update');
    this.requireProject(input.projectId);
    if (!input.title?.trim()) throw new Error('عنوان المهمة مطلوب.');
    const status = input.status || 'TODO';
    if (!TASK_STATUSES.includes(status)) throw new Error('حالة المهمة غير صالحة.');
    const priority = input.priority || 'MEDIUM';
    if (!TASK_PRIORITIES.includes(priority)) throw new Error('أولوية المهمة غير صالحة.');
    const progress = input.progress ?? (status === 'DONE' ? 100 : 0);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      throw new Error('نسبة إنجاز المهمة يجب أن تكون بين 0 و100.');
    }
    assertDate(input.startDate, 'تاريخ بداية المهمة');
    assertDate(input.dueDate, 'تاريخ استحقاق المهمة');
    if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
      throw new Error('تاريخ استحقاق المهمة يجب أن يكون بعد تاريخ البداية.');
    }

    const actor = AuthService.requireAuth();
    const id = `task_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO project_tasks (
         id, project_id, title, description, status, priority, assignee_name,
         start_date, due_date, completed_at, progress, sort_order, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.projectId, input.title.trim(), input.description?.trim() || null, status, priority,
        input.assigneeName?.trim() || null, input.startDate || null, input.dueDate || null,
        status === 'DONE' ? now : null, Math.round(progress), input.sortOrder ?? 0, actor.id, now, now,
      ]
    );
    this.audit('إضافة مهمة مشروع', id, { projectId: input.projectId, title: input.title.trim(), status });
    return this.requireTask(input.projectId, id);
  }

  public updateTask(id: string, patch: {
    title?: string; description?: string; status?: ProjectTaskStatus; priority?: ProjectTaskPriority;
    assigneeName?: string; startDate?: string | null; dueDate?: string | null;
    progress?: number; sortOrder?: number;
  }): ProjectTask {
    this.requireWrite('ui.projects.list.update');
    const location = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_tasks WHERE id = ?`,
      [id]
    )[0];
    if (!location) throw new Error('المهمة غير موجودة.');
    this.requireProject(location.projectId);
    const existing = this.requireTask(location.projectId, id);

    if (patch.status && !TASK_STATUSES.includes(patch.status)) throw new Error('حالة المهمة غير صالحة.');
    if (patch.priority && !TASK_PRIORITIES.includes(patch.priority)) throw new Error('أولوية المهمة غير صالحة.');
    if (patch.progress !== undefined && (!Number.isFinite(patch.progress) || patch.progress < 0 || patch.progress > 100)) {
      throw new Error('نسبة إنجاز المهمة يجب أن تكون بين 0 و100.');
    }
    assertDate(patch.startDate, 'تاريخ بداية المهمة');
    assertDate(patch.dueDate, 'تاريخ استحقاق المهمة');

    const status = patch.status ?? existing.status;
    const progress = status === 'DONE'
      ? 100
      : patch.progress ?? Number(existing.progress);
    const completedAt = status === 'DONE'
      ? existing.completedAt || new Date().toISOString()
      : null;

    this.db.run(
      `UPDATE project_tasks SET
         title = COALESCE(?, title), description = COALESCE(?, description),
         status = ?, priority = COALESCE(?, priority),
         assignee_name = COALESCE(?, assignee_name),
         start_date = COALESCE(?, start_date), due_date = COALESCE(?, due_date),
         completed_at = ?, progress = ?, sort_order = COALESCE(?, sort_order),
         updated_at = ?
       WHERE id = ?`,
      [
        patch.title?.trim() || null, patch.description?.trim() || null, status,
        patch.priority ?? null, patch.assigneeName?.trim() || null,
        patch.startDate ?? null, patch.dueDate ?? null,
        completedAt, Math.round(progress), patch.sortOrder ?? null, new Date().toISOString(), id,
      ]
    );
    this.audit('تعديل مهمة مشروع', id, patch);
    return this.requireTask(location.projectId, id);
  }

  public deleteTask(id: string): void {
    this.requireWrite('ui.projects.list.update');
    const location = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_tasks WHERE id = ?`,
      [id]
    )[0];
    if (!location) throw new Error('المهمة غير موجودة.');
    this.requireProject(location.projectId);
    this.db.executeTransaction((db) => {
      db.run(`DELETE FROM project_task_dependencies WHERE task_id = ? OR depends_on_task_id = ?`, [id, id]);
      db.run(`DELETE FROM project_tasks WHERE id = ?`, [id]);
    });
    this.audit('حذف مهمة مشروع', id, { projectId: location.projectId });
  }

  public addTaskDependency(input: { projectId: string; taskId: string; dependsOnTaskId: string }): ProjectTaskDependency {
    this.requireWrite('ui.projects.list.update');
    this.requireProject(input.projectId);
    if (input.taskId === input.dependsOnTaskId) throw new Error('لا يمكن أن تعتمد المهمة على نفسها.');
    this.requireTask(input.projectId, input.taskId);
    this.requireTask(input.projectId, input.dependsOnTaskId);

    const duplicate = this.db.query<{ id: string }>(
      `SELECT id FROM project_task_dependencies WHERE task_id = ? AND depends_on_task_id = ?`,
      [input.taskId, input.dependsOnTaskId]
    )[0];
    if (duplicate) throw new Error('هذه التبعية مسجلة بالفعل.');

    // Reject cycles: the dependency target must not already (transitively) depend on the task.
    const edges = this.db.query<{ taskId: string; dependsOnTaskId: string }>(
      `SELECT task_id AS taskId, depends_on_task_id AS dependsOnTaskId
       FROM project_task_dependencies WHERE project_id = ?`,
      [input.projectId]
    );
    const stack = [input.dependsOnTaskId];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === input.taskId) throw new Error('هذه التبعية تنشئ حلقة دائرية بين المهام.');
      if (visited.has(current)) continue;
      visited.add(current);
      for (const edge of edges) {
        if (edge.taskId === current) stack.push(edge.dependsOnTaskId);
      }
    }

    const id = `dep_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO project_task_dependencies (id, project_id, task_id, depends_on_task_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, input.projectId, input.taskId, input.dependsOnTaskId, new Date().toISOString()]
    );
    this.audit('إضافة تبعية مهمة', id, input);
    return this.db.query<ProjectTaskDependency>(
      `SELECT * FROM project_task_dependencies WHERE id = ?`,
      [id]
    )[0];
  }

  public removeTaskDependency(projectId: string, dependencyId: string): void {
    this.requireWrite('ui.projects.list.update');
    this.requireProject(projectId);
    const dependency = this.db.query<{ id: string }>(
      `SELECT id FROM project_task_dependencies WHERE id = ? AND project_id = ?`,
      [dependencyId, projectId]
    )[0];
    if (!dependency) throw new Error('التبعية غير موجودة.');
    this.db.run(`DELETE FROM project_task_dependencies WHERE id = ?`, [dependencyId]);
    this.audit('حذف تبعية مهمة', dependencyId, { projectId });
  }

  public removeTaskDependencyByPair(projectId: string, taskId: string, dependsOnTaskId: string): void {
    this.requireWrite('ui.projects.list.update');
    this.requireProject(projectId);
    const dependency = this.db.query<{ id: string }>(
      `SELECT id FROM project_task_dependencies
       WHERE project_id = ? AND task_id = ? AND depends_on_task_id = ?`,
      [projectId, taskId, dependsOnTaskId]
    )[0];
    if (!dependency) throw new Error('التبعية غير موجودة.');
    this.removeTaskDependency(projectId, dependency.id);
  }
}
