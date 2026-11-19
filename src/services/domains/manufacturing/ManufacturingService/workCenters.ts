import { v4 as uuidv4 } from 'uuid';
import type { ManufacturingContext } from './context';
import type { CreateWorkCenterDTO, WorkCenter } from './types';

/** Work-center (مراكز العمل) queries. Extracted verbatim from ManufacturingService. */
export class WorkCentersModule {
  constructor(private ctx: ManufacturingContext) {}

  public getWorkCenters(branchId?: string): WorkCenter[] {
    const actor = this.ctx.require('manufacturing.view');
    if (branchId) this.ctx.branchAccess.requireBranchAccess(branchId, actor);
    const scope = this.ctx.branchAccess.sqlScope('wc.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string> = [...scope.params];
    if (branchId) {
      conditions.push('wc.branch_id = ?');
      params.push(branchId);
    }
    return this.ctx.db.query<WorkCenter>(
      `SELECT * FROM work_centers wc WHERE ${conditions.join(' AND ')} ORDER BY wc.code`,
      params
    ).map((row: any) => ({ ...row, cost_per_hour: Number(row.cost_per_hour ?? 0) / 100, costPerHour: Number(row.cost_per_hour ?? row.costPerHour ?? 0) / 100 }));
  }

  public createWorkCenter(input: CreateWorkCenterDTO): WorkCenter {
    this.ctx.guardWrites();
    const actor = this.ctx.require('manufacturing.manage');
    if (!input.code?.trim()) throw new Error('رمز مركز العمل مطلوب.');
    if (!input.name?.trim()) throw new Error('اسم مركز العمل مطلوب.');
    const branchId = input.branchId || this.ctx.branchAccess.getDefaultAccessibleBranchId(actor);
    this.ctx.branchAccess.requireBranchAccess(branchId, actor);

    const id = `wc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.ctx.db.run(
      `INSERT INTO work_centers (id, code, name, description, cost_per_hour, capacity_per_day, branch_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ROUND(?*100), ?, ?, 1, ?, ?)`,
      [
        id, input.code.trim().toUpperCase(), input.name.trim(), input.description?.trim() || null,
        input.costPerHour ?? 0, input.capacityPerDay ?? 0, branchId, now, now,
      ]
    );
    this.ctx.audit('إضافة مركز عمل', id, { code: input.code.trim(), name: input.name.trim(), branchId });
    const wc: any = this.ctx.db.query<WorkCenter>(`SELECT * FROM work_centers WHERE id = ?`, [id])[0];
    if (wc) { wc.cost_per_hour = Number(wc.cost_per_hour ?? 0) / 100; wc.costPerHour = Number(wc.cost_per_hour) / 100; }
    return wc;
  }
}
