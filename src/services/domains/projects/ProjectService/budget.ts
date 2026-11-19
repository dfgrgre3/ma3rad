import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { unscaleMoneyRow } from '../../../../utils/money';
import {
  PROJECT_BUDGET_MONEY_FIELDS,
  assertAmount,
  type ProjectBudgetLine,
  type ProjectBudgetSummary,
} from './types';
import { TimeLayer } from './time';

/** Project budget lines and budget summary. */
export class BudgetLayer extends TimeLayer {
  public getBudgetLines(projectId: string): ProjectBudgetLine[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.view');
    this.requireProject(projectId);
    return this.db.query<ProjectBudgetLine>(
      `SELECT * FROM project_budget_lines WHERE project_id = ? ORDER BY category, created_at`,
      [projectId]
    ).map((row) => unscaleMoneyRow(row, PROJECT_BUDGET_MONEY_FIELDS));
  }

  public addBudgetLine(input: {
    projectId: string; category: string; description?: string;
    plannedAmount: number; actualAmount?: number; notes?: string;
  }): ProjectBudgetLine {
    this.requireWrite('ui.projects.list.update');
    this.requireProject(input.projectId);
    if (!input.category?.trim()) throw new Error('بند الميزانية مطلوب.');
    assertAmount(input.plannedAmount, 'المبلغ المخطط');
    assertAmount(input.actualAmount ?? 0, 'المبلغ الفعلي');

    const id = `bud_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO project_budget_lines (
         id, project_id, category, description, planned_amount, actual_amount, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?)`,
      [
        id, input.projectId, input.category.trim(), input.description?.trim() || null,
        input.plannedAmount, input.actualAmount ?? 0, input.notes?.trim() || null, now, now,
      ]
    );
    this.audit('إضافة بند ميزانية مشروع', id, { projectId: input.projectId, category: input.category.trim() });
    return unscaleMoneyRow(this.db.query<ProjectBudgetLine>(`SELECT * FROM project_budget_lines WHERE id = ?`, [id])[0], PROJECT_BUDGET_MONEY_FIELDS);
  }

  public updateBudgetLine(id: string, patch: {
    category?: string; description?: string; plannedAmount?: number; actualAmount?: number; notes?: string;
  }): ProjectBudgetLine {
    this.requireWrite('ui.projects.list.update');
    const existing = unscaleMoneyRow(this.db.query<ProjectBudgetLine>(
      `SELECT * FROM project_budget_lines WHERE id = ?`,
      [id]
    )[0], PROJECT_BUDGET_MONEY_FIELDS);
    if (!existing) throw new Error('بند الميزانية غير موجود.');
    this.requireProject(existing.projectId);
    if (patch.category !== undefined && !patch.category.trim()) throw new Error('بند الميزانية مطلوب.');
    if (patch.plannedAmount !== undefined) assertAmount(patch.plannedAmount, 'المبلغ المخطط');
    if (patch.actualAmount !== undefined) assertAmount(patch.actualAmount, 'المبلغ الفعلي');

    this.db.run(
      `UPDATE project_budget_lines SET
         category = COALESCE(?, category), description = COALESCE(?, description),
         planned_amount = COALESCE(ROUND(?*100), planned_amount), actual_amount = COALESCE(ROUND(?*100), actual_amount),
         notes = COALESCE(?, notes), updated_at = ?
       WHERE id = ?`,
      [
        patch.category?.trim() || null, patch.description?.trim() || null,
        patch.plannedAmount ?? null, patch.actualAmount ?? null,
        patch.notes?.trim() || null, new Date().toISOString(), id,
      ]
    );
    this.audit('تعديل بند ميزانية مشروع', id, patch);
    return unscaleMoneyRow(this.db.query<ProjectBudgetLine>(`SELECT * FROM project_budget_lines WHERE id = ?`, [id])[0], PROJECT_BUDGET_MONEY_FIELDS);
  }

  public deleteBudgetLine(id: string): void {
    this.requireWrite('ui.projects.list.update');
    const existing = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_budget_lines WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('بند الميزانية غير موجود.');
    this.requireProject(existing.projectId);
    this.db.run(`DELETE FROM project_budget_lines WHERE id = ?`, [id]);
    this.audit('حذف بند ميزانية مشروع', id, { projectId: existing.projectId });
  }

  public getBudgetSummary(projectId: string): ProjectBudgetSummary {
    const lines = this.getBudgetLines(projectId);
    const project = this.requireProject(projectId);
    const byCategory = new Map<string, { category: string; plannedAmount: number; actualAmount: number }>();
    let plannedTotal = 0;
    let actualTotal = 0;
    for (const line of lines) {
      const planned = Number(line.plannedAmount) || 0;
      const actual = Number(line.actualAmount) || 0;
      plannedTotal += planned;
      actualTotal += actual;
      const current = byCategory.get(line.category) || {
        category: line.category,
        plannedAmount: 0,
        actualAmount: 0,
      };
      current.plannedAmount += planned;
      current.actualAmount += actual;
      byCategory.set(line.category, current);
    }
    return {
      plannedTotal,
      actualTotal,
      variance: plannedTotal - actualTotal,
      contractValue: Number(project.contractValue) || 0,
      remainingContract: (Number(project.contractValue) || 0) - actualTotal,
      byCategory: [...byCategory.values()].sort((a, b) => b.plannedAmount - a.plannedAmount),
    };
  }
}
