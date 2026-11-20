import { v4 as uuidv4 } from 'uuid';
import type { ManufacturingContext } from './context';
import type { CreateDowntimeDTO, DowntimeRecord } from './types';

/**
 * Shop-floor downtime events (unplanned breakdowns, planned maintenance
 * windows, changeovers). They feed capacity load and OEE-style analytics.
 */
export class DowntimeModule {
  private readonly ctx: ManufacturingContext;
  constructor(ctx: ManufacturingContext) { this.ctx = ctx; }

  public recordDowntime(input: CreateDowntimeDTO): DowntimeRecord {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.maintenance.manage']);
    const minutes = Number(input.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new Error('مدة التوقف يجب أن تكون رقماً أكبر من صفر.');
    }

    // Resolve branch scope from the linked entities, falling back to input/default.
    let branchId: string | null = input.branchId || null;
    if (input.workCenterId) {
      const wc = this.ctx.db.query<{ branchId: string | null }>(
        `SELECT branch_id AS branchId FROM work_centers WHERE id = ?`, [input.workCenterId]
      )[0];
      if (!wc) throw new Error('مركز العمل غير موجود.');
      branchId = branchId || wc.branchId;
    }
    if (input.operationId) {
      const op = this.ctx.db.query<{ branchId: string | null }>(
        `SELECT o.branch_id AS branchId FROM production_order_operations pop
         JOIN production_orders o ON o.id = pop.order_id WHERE pop.id = ?`,
        [input.operationId]
      )[0];
      if (!op) throw new Error('العملية غير موجودة.');
      branchId = branchId || op.branchId;
    }
    if (input.productionOrderId) {
      const order = this.ctx.db.query<{ branchId: string | null }>(
        `SELECT branch_id AS branchId FROM production_orders WHERE id = ?`, [input.productionOrderId]
      )[0];
      if (!order) throw new Error('أمر الإنتاج غير موجود.');
      branchId = branchId || order.branchId;
    }
    if (!branchId) branchId = this.ctx.branchAccess.getDefaultAccessibleBranchId(actor);
    this.ctx.branchAccess.requireBranchAccess(branchId, actor);

    const id = `dt_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.ctx.db.run(
      `INSERT INTO manufacturing_downtime
        (id, work_center_id, operation_id, production_order_id, minutes, reason,
         started_at, ended_at, branch_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.workCenterId || null, input.operationId || null, input.productionOrderId || null,
        minutes, input.reason?.trim() || null,
        input.startedAt || null, input.endedAt || null,
        branchId, actor.id, now,
      ]
    );
    this.ctx.audit('تسجيل توقف إنتاج', id, {
      workCenterId: input.workCenterId || null,
      minutes,
      reason: input.reason || null,
    });
    return this.getDowntimeRecord(id);
  }

  public getDowntimeRecords(filter?: {
    workCenterId?: string;
    productionOrderId?: string;
    from?: string;
    to?: string;
  }): DowntimeRecord[] {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.maintenance.view']);
    const scope = this.ctx.branchAccess.sqlScope('d.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string | number> = [...scope.params];
    if (filter?.workCenterId) { conditions.push('d.work_center_id = ?'); params.push(filter.workCenterId); }
    if (filter?.productionOrderId) { conditions.push('d.production_order_id = ?'); params.push(filter.productionOrderId); }
    if (filter?.from) { conditions.push('d.created_at >= ?'); params.push(`${filter.from}T00:00:00`); }
    if (filter?.to) { conditions.push('d.created_at <= ?'); params.push(`${filter.to}T23:59:59`); }
    return this.ctx.db.query<DowntimeRecord>(
      `SELECT d.*, w.name AS work_center_name, po.order_number AS order_number
       FROM manufacturing_downtime d
       LEFT JOIN work_centers w ON w.id = d.work_center_id
       LEFT JOIN production_orders po ON po.id = d.production_order_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.created_at DESC`,
      params
    );
  }

  private getDowntimeRecord(id: string): DowntimeRecord {
    return this.ctx.db.query<DowntimeRecord>(
      `SELECT d.*, w.name AS work_center_name, po.order_number AS order_number
       FROM manufacturing_downtime d
       LEFT JOIN work_centers w ON w.id = d.work_center_id
       LEFT JOIN production_orders po ON po.id = d.production_order_id
       WHERE d.id = ?`,
      [id]
    )[0];
  }
}
