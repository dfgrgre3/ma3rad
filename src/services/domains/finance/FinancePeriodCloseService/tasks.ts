import { v4 as uuidv4 } from 'uuid';
import { PeriodCloseRunsBase } from './closeRuns';
import { DEFAULT_CLOSE_TASKS } from './types';
import type { PeriodCloseTask, TaskInput } from './types';

export abstract class PeriodCloseTasksBase extends PeriodCloseRunsBase {
  // -----------------------------------------------------------------
  // Monthly close tasks
  // -----------------------------------------------------------------
  public getPeriodCloseTasks(periodId?: string): PeriodCloseTask[] {
    this.requireView();
    const params: any[] = [];
    let where = '';
    if (periodId) {
      where = 'WHERE t.fiscal_period_id = ?';
      params.push(periodId);
    }
    return this.db.query<any>(`
      SELECT t.id, t.fiscal_period_id AS fiscalPeriodId, t.close_run_id AS closeRunId,
             t.title, t.description, t.department, t.category,
             t.assignee_user_id AS assigneeUserId, u.full_name AS assigneeName,
             t.due_date AS dueDate, t.priority, t.status, t.notes,
             t.completed_at AS completedAt, t.completed_by AS completedBy,
             cu.full_name AS completedByName, t.reviewed_at AS reviewedAt,
             t.approved_at AS approvedAt, t.created_by AS createdBy,
             t.created_at AS createdAt, t.updated_at AS updatedAt
      FROM period_close_tasks t
      LEFT JOIN users u ON u.id = t.assignee_user_id
      LEFT JOIN users cu ON cu.id = t.completed_by
      ${where}
      ORDER BY
        CASE t.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
        t.due_date, t.created_at
    `, params);
  }

  public createPeriodCloseTask(input: TaskInput): string {
    const actor = this.requireManage();
    this.getPeriodRow(input.fiscalPeriodId);
    if (!input.title?.trim()) throw new Error('عنوان المهمة إلزامي.');
    if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
      throw new Error('تاريخ استحقاق المهمة غير صحيح.');
    }
    const id = `pct_${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    this.db.executeFinancialTransaction((tx) => {
      tx.run(`
        INSERT INTO period_close_tasks
          (id, fiscal_period_id, title, description, department, category, assignee_user_id,
           due_date, priority, status, notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
      `, [
        id, input.fiscalPeriodId, input.title.trim(), input.description?.trim() || null,
        input.department?.trim() || null, input.category || 'GENERAL',
        input.assigneeUserId || null, input.dueDate || null, input.priority || 'MEDIUM',
        input.notes?.trim() || null, actor.id, now, now,
      ]);
      this.fiscalAudit(tx, actor, 'TASK', id, 'CREATE_TASK', null, 'PENDING', null, {
        metadata: { fiscalPeriodId: input.fiscalPeriodId, title: input.title },
      });
    });
    return id;
  }

  public generateDefaultPeriodTasks(periodId: string): number {
    const actor = this.requireManage();
    this.getPeriodRow(periodId);
    const existing = Number(this.db.query<any>(
      'SELECT COUNT(*) AS count FROM period_close_tasks WHERE fiscal_period_id = ?',
      [periodId],
    )[0]?.count || 0);
    if (existing > 0) throw new Error('توجد مهام إقفال لهذه الفترة بالفعل.');
    const period = this.getPeriodRow(periodId);
    const dueDate = period.endDate;
    let created = 0;
    this.db.executeFinancialTransaction((tx) => {
      for (const task of DEFAULT_CLOSE_TASKS) {
        const id = `pct_${uuidv4().slice(0, 8)}`;
        const now = new Date().toISOString();
        tx.run(`
          INSERT INTO period_close_tasks
            (id, fiscal_period_id, title, description, department, category, due_date,
             priority, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
        `, [
          id, periodId, task.title,
          `مهمة إقفال دورية للفترة ${period.name}`,
          task.department, task.category, dueDate, task.priority, actor.id, now, now,
        ]);
        created += 1;
      }
      this.fiscalAudit(tx, actor, 'PERIOD', periodId, 'GENERATE_DEFAULT_TASKS', null, 'PENDING', null, {
        metadata: { count: created },
      });
    });
    return created;
  }

  public updatePeriodCloseTask(taskId: string, patch: Partial<Omit<TaskInput, 'fiscalPeriodId'>> & {
    status?: PeriodCloseTask['status'];
    assigneeUserId?: string;
    notes?: string;
    dueDate?: string;
  }): void {
    const actor = this.requireManage();
    const task = this.db.query<any>('SELECT * FROM period_close_tasks WHERE id = ?', [taskId])[0];
    if (!task) throw new Error('مهمة الإقفال غير موجودة.');
    if (task.status === 'CANCELLED' || task.status === 'APPROVED') {
      throw new Error('لا يمكن تعديل مهمة ملغاة أو معتمدة.');
    }
    const now = new Date().toISOString();
    const status = patch.status;
    const fields: Record<string, any> = {
      title: patch.title?.trim() ?? task.title,
      description: patch.description?.trim() ?? task.description,
      department: patch.department?.trim() ?? task.department,
      category: patch.category ?? task.category,
      assignee_user_id: patch.assigneeUserId ?? task.assigneeUserId ?? null,
      due_date: patch.dueDate ?? task.dueDate ?? null,
      priority: patch.priority ?? task.priority,
      status: status ?? task.status,
      notes: patch.notes ?? task.notes,
      updated_at: now,
    };
    if (status === 'COMPLETED' && task.status !== 'COMPLETED') {
      fields.completed_at = now;
      fields.completed_by = actor.id;
    }
    if (status === 'REVIEWED') {
      fields.reviewed_at = now;
      fields.reviewed_by = actor.id;
    }
    if (status === 'APPROVED') {
      fields.approved_at = now;
      fields.approved_by = actor.id;
    }
    this.db.executeFinancialTransaction((tx) => {
      const assignments = Object.keys(fields).map((key) => `${key} = ?`).join(', ');
      tx.run(`UPDATE period_close_tasks SET ${assignments} WHERE id = ?`, [...Object.values(fields), taskId]);
      this.fiscalAudit(tx, actor, 'TASK', taskId, 'UPDATE_TASK', task.status, fields.status, null, {
        metadata: { patch },
      });
    });
  }

  public deletePeriodCloseTask(taskId: string): void {
    const actor = this.requireManage();
    const task = this.db.query<any>('SELECT * FROM period_close_tasks WHERE id = ?', [taskId])[0];
    if (!task) throw new Error('مهمة الإقفال غير موجودة.');
    if (task.status === 'COMPLETED' || task.status === 'APPROVED') {
      throw new Error('لا يمكن حذف مهمة مكتملة أو معتمدة؛ يمكن إلغاؤها بدلًا من ذلك.');
    }
    this.db.executeFinancialTransaction((tx) => {
      tx.run('DELETE FROM period_close_tasks WHERE id = ?', [taskId]);
      this.fiscalAudit(tx, actor, 'TASK', taskId, 'DELETE_TASK', task.status, null);
    });
  }
}
