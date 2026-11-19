import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import type { ManufacturingContext } from './context';
import type {
  CreateMaintenanceDTO,
  MaintenanceRecord,
  UpdateMaintenanceDTO,
} from './types';

/** Equipment maintenance queries. Extracted verbatim from ManufacturingService. */
export class MaintenanceModule {
  private readonly ctx: ManufacturingContext;
  constructor(ctx: ManufacturingContext) { this.ctx = ctx; }

  public createMaintenance(input: CreateMaintenanceDTO): MaintenanceRecord {
    this.ctx.guardWrites();
    const actor = this.ctx.require('manufacturing.manage');
    if (!input?.equipmentName?.trim()) throw new Error('اسم المعدة مطلوب.');
    let branchId = input.branchId;
    if (input.workCenterId) {
      const wc = this.ctx.db.query<any>(`SELECT branch_id AS branchId FROM work_centers WHERE id = ?`, [input.workCenterId])[0];
      if (!wc) throw new Error('مركز العمل غير موجود.');
      if (branchId && branchId !== wc.branchId) throw new Error('مركز العمل لا يتبع هذا الفرع.');
      branchId = branchId || wc.branchId;
    }
    branchId = branchId || this.ctx.branchAccess.getDefaultAccessibleBranchId(actor);
    this.ctx.branchAccess.requireBranchAccess(branchId, actor);

    const maintenanceType = input.maintenanceType || 'PREVENTIVE';
    if (!['PREVENTIVE', 'CORRECTIVE', 'PREDICTIVE'].includes(maintenanceType)) {
      throw new Error('نوع الصيانة غير صالح.');
    }
    if (input.scheduledDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) throw new Error('تاريخ الجدولة غير صالح.');
    }

    const id = `mnt_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    const notes = input.notes === undefined ? null : (input.notes?.trim() || null);
    this.ctx.db.run(
      `INSERT INTO manufacturing_maintenance
        (id, work_center_id, equipment_name, maintenance_type, status, scheduled_date, cost, notes, performed_by, branch_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'SCHEDULED', ?, 0, ?, ?, ?, ?, ?)`,
      [id, input.workCenterId || null, input.equipmentName.trim(), maintenanceType, input.scheduledDate || null, notes, actor.id, branchId, now, now]
    );
    this.ctx.audit('جدولة صيانة', id, { equipmentName: input.equipmentName.trim(), maintenanceType });
    return this.getMaintenance(id);
  }

  public getMaintenance(id: string): MaintenanceRecord {
    const actor = this.ctx.require('manufacturing.view');
    const row = this.ctx.db.query<any>(`SELECT * FROM manufacturing_maintenance WHERE id = ?`, [id])[0];
    if (!row) throw new Error('سجل الصيانة غير موجود.');
    if (row.branchId) this.ctx.branchAccess.requireBranchAccess(row.branchId, actor);
    return this.mapMaintenance(row);
  }

  public getMaintenanceRecords(filters?: { status?: string; workCenterId?: string }): MaintenanceRecord[] {
    const actor = this.ctx.require('manufacturing.view');
    const conditions: string[] = [];
    const params: Array<string> = [];
    if (filters?.status) {
      conditions.push('m.status = ?');
      params.push(filters.status);
    }
    if (filters?.workCenterId) {
      conditions.push('m.work_center_id = ?');
      params.push(filters.workCenterId);
    }
    const scope = this.ctx.branchAccess.sqlScope('m.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);
    const rows = this.ctx.db.query<any>(
      `SELECT m.* FROM manufacturing_maintenance m
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY m.created_at DESC`,
      params
    );
    return rows.map((row) => this.mapMaintenance(row));
  }

  public updateMaintenance(id: string, input: UpdateMaintenanceDTO): MaintenanceRecord {
    this.ctx.guardWrites();
    const actor = this.ctx.require('manufacturing.manage');
    const existing = this.ctx.db.query<any>(`SELECT * FROM manufacturing_maintenance WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('سجل الصيانة غير موجود.');
    if (existing.branchId) this.ctx.branchAccess.requireBranchAccess(existing.branchId, actor);

    const updates: string[] = [];
    const params: Array<any> = [];
    if (input.maintenanceType !== undefined) {
      if (!['PREVENTIVE', 'CORRECTIVE', 'PREDICTIVE'].includes(input.maintenanceType)) throw new Error('نوع الصيانة غير صالح.');
      updates.push('maintenance_type = ?'); params.push(input.maintenanceType);
    }
    if (input.status !== undefined) {
      if (!['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(input.status)) throw new Error('حالة الصيانة غير صالحة.');
      updates.push('status = ?'); params.push(input.status);
      if (input.status === 'COMPLETED' && !input.completedDate) {
        updates.push('completed_date = ?'); params.push(localDateString());
      }
    }
    if (input.completedDate !== undefined) {
      if (input.completedDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.completedDate)) throw new Error('تاريخ الإكمال غير صالح.');
      updates.push('completed_date = ?'); params.push(input.completedDate || null);
    }
    if (input.cost !== undefined) {
      const v = Number(input.cost);
      if (!Number.isFinite(v) || v < 0) throw new Error('التكلفة غير صالحة.');
      updates.push('cost = ROUND(?*100)'); params.push(v);
    }
    if (input.notes !== undefined) {
      updates.push('notes = ?');
      params.push(input.notes === null ? null : (input.notes?.trim() || null));
    }
    if (updates.length === 0) return this.getMaintenance(id);
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    this.ctx.db.run(`UPDATE manufacturing_maintenance SET ${updates.join(', ')} WHERE id = ?`, params);
    this.ctx.audit('تحديث صيانة', id, { status: input.status });
    return this.getMaintenance(id);
  }

  /** Preventive-maintenance alerts: overdue and due-within-N-days schedules. */
  public getMaintenanceAlerts(withinDays = 7): { overdue: MaintenanceRecord[]; dueSoon: MaintenanceRecord[] } {
    this.ctx.require('manufacturing.view');
    const records = this.getMaintenanceRecords({ status: 'SCHEDULED' })
      .filter((record) => record.maintenanceType === 'PREVENTIVE' && record.scheduledDate);
    const today = localDateString();
    const horizon = new Date(`${today}T00:00:00`);
    horizon.setDate(horizon.getDate() + withinDays);
    const horizonString = horizon.toISOString().slice(0, 10);
    return {
      overdue: records.filter((record) => record.scheduledDate! < today),
      dueSoon: records.filter((record) => record.scheduledDate! >= today && record.scheduledDate! <= horizonString),
    };
  }

  private mapMaintenance(row: any): MaintenanceRecord {
    return {
      id: row.id,
      workCenterId: row.workCenterId ?? null,
      equipmentName: row.equipmentName,
      maintenanceType: row.maintenanceType,
      status: row.status,
      scheduledDate: row.scheduledDate ?? null,
      completedDate: row.completedDate ?? null,
      cost: Number(row.cost || 0) / 100,
      notes: row.notes ?? null,
      performedBy: row.performedBy ?? null,
      branchId: row.branchId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
