import { v4 as uuidv4 } from 'uuid';
import type { ManufacturingContext } from './context';
import type { CreateProductionLineDTO, CreateWorkCenterDTO, ProductionLine, UpdateProductionLineDTO, UpdateWorkCenterDTO, WorkCenter } from './types';

/** Work-center (مراكز العمل) queries. Extracted verbatim from ManufacturingService. */
export class WorkCentersModule {
  private readonly ctx: ManufacturingContext;
  constructor(ctx: ManufacturingContext) { this.ctx = ctx; }

  public getWorkCenters(branchId?: string): WorkCenter[] {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.bom.view', 'manufacturing.orders.view', 'manufacturing.orders.execute']);
    if (branchId) this.ctx.branchAccess.requireBranchAccess(branchId, actor);
    const scope = this.ctx.branchAccess.sqlScope('wc.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string> = [...scope.params];
    if (branchId) {
      conditions.push('wc.branch_id = ?');
      params.push(branchId);
    }
    return this.ctx.db.query<WorkCenter>(
      `SELECT wc.*, pl.name AS production_line_name, pl.code AS production_line_code
       FROM work_centers wc
       LEFT JOIN production_lines pl ON pl.id = wc.production_line_id
       WHERE ${conditions.map((c) => c.replace(/wc\./g, 'wc.')).join(' AND ')} ORDER BY wc.code`,
      params
    ).map((row: any) => ({
      ...row,
      productionLineId: row.production_line_id ?? row.productionLineId ?? null,
      productionLineName: row.production_line_name ?? row.productionLineName ?? null,
      cost_per_hour: Number(row.cost_per_hour ?? 0) / 100,
      costPerHour: Number(row.cost_per_hour ?? row.costPerHour ?? 0) / 100,
      overhead_per_hour: Number(row.overhead_per_hour ?? 0) / 100,
      overheadPerHour: Number(row.overhead_per_hour ?? row.overheadPerHour ?? 0) / 100,
    }));
  }

  public createWorkCenter(input: CreateWorkCenterDTO): WorkCenter {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.bom.manage']);
    if (!input.code?.trim()) throw new Error('رمز مركز العمل مطلوب.');
    if (!input.name?.trim()) throw new Error('اسم مركز العمل مطلوب.');
    const branchId = input.branchId || this.ctx.branchAccess.getDefaultAccessibleBranchId(actor);
    this.ctx.branchAccess.requireBranchAccess(branchId, actor);
    this.assertLineBelongsToBranch(input.productionLineId, branchId);

    const id = `wc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.ctx.db.run(
      `INSERT INTO work_centers (id, code, name, description, cost_per_hour, overhead_per_hour, capacity_per_day, branch_id, production_line_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?, 1, ?, ?)`,
      [
        id, input.code.trim().toUpperCase(), input.name.trim(), input.description?.trim() || null,
        input.costPerHour ?? 0, input.overheadPerHour ?? 0, input.capacityPerDay ?? 0, branchId,
        input.productionLineId || null, now, now,
      ]
    );
    this.ctx.audit('إضافة مركز عمل', id, { code: input.code.trim(), name: input.name.trim(), branchId });
    const wc: any = this.ctx.db.query<WorkCenter>(`SELECT * FROM work_centers WHERE id = ?`, [id])[0];
    if (wc) {
      wc.cost_per_hour = Number(wc.cost_per_hour ?? 0) / 100;
      wc.costPerHour = Number(wc.cost_per_hour) / 100;
      wc.overhead_per_hour = Number(wc.overhead_per_hour ?? 0) / 100;
      wc.overheadPerHour = Number(wc.overhead_per_hour) / 100;
    }
    return wc;
  }

  public updateWorkCenter(id: string, input: UpdateWorkCenterDTO): WorkCenter {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.bom.manage']);
    const existing = this.ctx.db.query<any>(`SELECT * FROM work_centers WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('مركز العمل غير موجود.');
    this.ctx.branchAccess.requireBranchAccess(existing.branchId ?? existing.branch_id, actor);

    const updates: string[] = [];
    const params: Array<any> = [];
    if (input.code !== undefined) {
      const code = input.code?.trim();
      if (!code) throw new Error('رمز مركز العمل مطلوب.');
      updates.push('code = ?'); params.push(code.toUpperCase());
    }
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new Error('اسم مركز العمل مطلوب.');
      updates.push('name = ?'); params.push(name);
    }
    if (input.description !== undefined) {
      updates.push('description = ?'); params.push(input.description?.trim() || null);
    }
    if (input.costPerHour !== undefined) {
      const v = Number(input.costPerHour);
      if (!Number.isFinite(v) || v < 0) throw new Error('تكلفة الساعة غير صالحة.');
      updates.push('cost_per_hour = ROUND(?*100)'); params.push(v);
    }
    if (input.overheadPerHour !== undefined) {
      const v = Number(input.overheadPerHour);
      if (!Number.isFinite(v) || v < 0) throw new Error('الأوفرهيد غير صالح.');
      updates.push('overhead_per_hour = ROUND(?*100)'); params.push(v);
    }
    if (input.capacityPerDay !== undefined) {
      const v = Number(input.capacityPerDay);
      if (!Number.isFinite(v) || v < 0) throw new Error('السعة اليومية غير صالحة.');
      updates.push('capacity_per_day = ?'); params.push(v);
    }
    if (input.productionLineId !== undefined) {
      const lineId = this.assertLineBelongsToBranch(input.productionLineId, existing.branch_id ?? existing.branchId);
      updates.push('production_line_id = ?'); params.push(lineId);
    }
    if (input.isActive !== undefined) {
      updates.push('is_active = ?'); params.push(input.isActive ? 1 : 0);
    }
    if (updates.length === 0) return this.getWorkCenters().find((wc) => wc.id === id)!;
    updates.push('updated_at = ?'); params.push(new Date().toISOString());
    params.push(id);
    this.ctx.db.run(`UPDATE work_centers SET ${updates.join(', ')} WHERE id = ?`, params);
    this.ctx.audit('تحديث مركز عمل', id, { fields: Object.keys(input) });
    return this.getWorkCenters().find((wc) => wc.id === id)!;
  }

  /** Returns the line id when valid for the branch; null clears the assignment. */
  private assertLineBelongsToBranch(lineId: string | null | undefined, branchId: string): string | null {
    if (!lineId) return null;
    const line = this.ctx.db.query<any>(
      `SELECT id, branch_id AS branchId, is_active AS isActive FROM production_lines WHERE id = ?`, [lineId]
    )[0];
    if (!line) throw new Error('خط الإنتاج المحدد غير موجود.');
    if (line.branchId !== branchId) throw new Error('خط الإنتاج يجب أن يتبع نفس فرع مركز العمل.');
    if (!line.isActive) throw new Error('خط الإنتاج المحدد غير نشط.');
    return line.id;
  }

  // ── Production lines ──────────────────────────────────────────────────────

  public getProductionLines(branchId?: string): ProductionLine[] {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.bom.view', 'manufacturing.orders.view', 'manufacturing.orders.execute']);
    const scope = this.ctx.branchAccess.sqlScope('pl.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string> = [...scope.params];
    if (branchId) { this.ctx.branchAccess.requireBranchAccess(branchId, actor); conditions.push('pl.branch_id = ?'); params.push(branchId); }
    return this.ctx.db.query<any>(
      `SELECT pl.*, b.name AS branch_name,
              (SELECT COUNT(*) FROM work_centers wc WHERE wc.production_line_id = pl.id) AS work_centers_count
       FROM production_lines pl
       LEFT JOIN branches b ON b.id = pl.branch_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY pl.code`,
      params
    ).map((row) => ({
      ...row,
      branchName: row.branch_name ?? null,
      workCentersCount: Number(row.work_centers_count ?? 0),
    }));
  }

  public createProductionLine(input: CreateProductionLineDTO): ProductionLine {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.bom.manage']);
    if (!input.code?.trim()) throw new Error('رمز خط الإنتاج مطلوب.');
    if (!input.name?.trim()) throw new Error('اسم خط الإنتاج مطلوب.');
    const branchId = input.branchId || this.ctx.branchAccess.getDefaultAccessibleBranchId(actor);
    this.ctx.branchAccess.requireBranchAccess(branchId, actor);
    const id = `pl_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    try {
      this.ctx.db.run(
        `INSERT INTO production_lines (id, branch_id, code, name, description, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, branchId, input.code.trim().toUpperCase(), input.name.trim(), input.description?.trim() || null, now, now]
      );
    } catch (error: any) {
      if (String(error?.message || '').includes('UNIQUE')) throw new Error('رمز خط الإنتاج مستخدم في هذا الفرع.');
      throw error;
    }
    this.ctx.audit('إضافة خط إنتاج', id, { code: input.code.trim(), branchId });
    return this.getProductionLines().find((line) => line.id === id)!;
  }

  public updateProductionLine(id: string, input: UpdateProductionLineDTO): ProductionLine {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.bom.manage']);
    const existing = this.ctx.db.query<any>(`SELECT * FROM production_lines WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('خط الإنتاج غير موجود.');
    this.ctx.branchAccess.requireBranchAccess(existing.branch_id ?? existing.branchId, actor);

    const updates: string[] = [];
    const params: Array<any> = [];
    if (input.code !== undefined) {
      const code = input.code?.trim();
      if (!code) throw new Error('رمز خط الإنتاج مطلوب.');
      updates.push('code = ?'); params.push(code.toUpperCase());
    }
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new Error('اسم خط الإنتاج مطلوب.');
      updates.push('name = ?'); params.push(name);
    }
    if (input.description !== undefined) {
      updates.push('description = ?'); params.push(input.description?.trim() || null);
    }
    if (input.isActive !== undefined) {
      updates.push('is_active = ?'); params.push(input.isActive ? 1 : 0);
    }
    if (updates.length === 0) return this.getProductionLines().find((line) => line.id === id)!;
    updates.push('updated_at = ?'); params.push(new Date().toISOString());
    params.push(id);
    this.ctx.db.run(`UPDATE production_lines SET ${updates.join(', ')} WHERE id = ?`, params);
    this.ctx.audit('تحديث خط إنتاج', id, { fields: Object.keys(input) });
    return this.getProductionLines().find((line) => line.id === id)!;
  }
}
