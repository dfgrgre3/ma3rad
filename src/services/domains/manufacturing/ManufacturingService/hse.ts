import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import type { ManufacturingContext } from './context';
import { assertDate } from './shared';

export interface HseIncident {
  id: string; branchId: string | null; incidentDate: string;
  incidentType: string; severity: string; description: string;
  location: string | null; workCenterId: string | null; workCenterName?: string | null;
  productionOrderId: string | null; injuredEmployeeId: string | null;
  injuredEmployeeName?: string | null;
  lostTimeHours: number; correctiveAction: string | null;
  status: 'OPEN' | 'INVESTIGATING' | 'CLOSED';
  reportedBy: string | null; createdAt: string; updatedAt: string;
}

export interface HsePermit {
  id: string; branchId: string; permitNumber: string; permitType: string;
  title: string; location: string | null; workCenterId: string | null;
  validFrom: string; validTo: string;
  status: 'REQUESTED' | 'APPROVED' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'CLOSED';
  requestedBy: string | null; approvedBy: string | null; approvedAt: string | null;
  conditions: string | null; createdAt: string; updatedAt: string;
}

export interface HseInspection {
  id: string; branchId: string | null; inspectionDate: string;
  area: string; inspectionType: string; result: 'PASS' | 'FAIL' | 'CONDITIONAL';
  findings: string | null; correctiveAction: string | null;
  inspectorId: string | null; inspectorName?: string | null;
  workCenterId: string | null; workCenterName?: string | null;
  createdAt: string;
}

export interface HseTraining {
  id: string; branchId: string | null; employeeId: string;
  employeeName?: string | null; trainingName: string; provider: string | null;
  trainingDate: string; expiryDate: string | null;
  certificateRef: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  notes: string | null; createdAt: string;
}

const INCIDENT_TYPES = ['INJURY', 'NEAR_MISS', 'PROPERTY_DAMAGE', 'ENVIRONMENTAL', 'ILLNESS', 'OTHER'];
const SEVERITIES = ['MINOR', 'MODERATE', 'SERIOUS', 'CRITICAL'];
const PERMIT_TYPES = ['HOT_WORK', 'CONFINED_SPACE', 'HEIGHT', 'ELECTRICAL', 'EXCAVATION', 'OTHER'];
const INSPECTION_TYPES = ['GENERAL', 'FIRE', 'ELECTRICAL', 'HOUSEKEEPING', 'PPE', 'MACHINERY', 'ENVIRONMENTAL', 'OTHER'];
const TRAINING_STATUSES = ['SCHEDULED', 'COMPLETED', 'EXPIRED', 'CANCELLED'];

/**
 * HSE records: incidents, work permits, safety inspections and training.
 * Read access mirrors maintenance viewers; writes need manage-level rights.
 */
export class HseModule {
  private readonly ctx: ManufacturingContext;
  constructor(ctx: ManufacturingContext) { this.ctx = ctx; }

  private requireView() {
    return this.ctx.requireAny(['manufacturing.view', 'manufacturing.maintenance.view', 'manufacturing.orders.view']);
  }
  private requireManage() {
    return this.ctx.requireAny(['manufacturing.manage', 'manufacturing.maintenance.manage']);
  }
  private branchOrDefault(actor: any, branchId?: string | null): string {
    const branch = branchId || this.ctx.branchAccess.getDefaultAccessibleBranchId(actor);
    this.ctx.branchAccess.requireBranchAccess(branch, actor);
    return branch;
  }

  // ── Incidents ────────────────────────────────────────────────────────────

  public getHseIncidents(filter?: { status?: string; branchId?: string }): HseIncident[] {
    const actor = this.requireView();
    const scope = this.ctx.branchAccess.sqlScope('i.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string> = [...scope.params];
    if (filter?.status) { conditions.push('i.status = ?'); params.push(filter.status); }
    if (filter?.branchId) { conditions.push('i.branch_id = ?'); params.push(filter.branchId); }
    return this.ctx.db.query<HseIncident>(
      `SELECT i.*, wc.name AS workCenterName, emp.full_name AS injuredEmployeeName
       FROM hse_incidents i
       LEFT JOIN work_centers wc ON wc.id = i.work_center_id
       LEFT JOIN employees emp ON emp.id = i.injured_employee_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY i.incident_date DESC, i.created_at DESC`,
      params
    );
  }

  public createHseIncident(input: {
    incidentDate: string; incidentType?: string; severity?: string; description: string;
    location?: string; workCenterId?: string; productionOrderId?: string;
    injuredEmployeeId?: string; lostTimeHours?: number; correctiveAction?: string;
    branchId?: string;
  }): HseIncident {
    this.ctx.guardWrites();
    const actor = this.requireManage();
    if (!input.description?.trim()) throw new Error('وصف الحادث مطلوب.');
    assertDate(input.incidentDate, 'تاريخ الحادث');
    const incidentType = input.incidentType || 'INJURY';
    const severity = input.severity || 'MINOR';
    if (!INCIDENT_TYPES.includes(incidentType)) throw new Error('نوع الحادث غير صالح.');
    if (!SEVERITIES.includes(severity)) throw new Error('درجة الخطورة غير صالحة.');
    const branchId = this.branchOrDefault(actor, input.branchId);
    const id = `hsi_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.ctx.db.run(
      `INSERT INTO hse_incidents
        (id, branch_id, incident_date, incident_type, severity, description, location,
         work_center_id, production_order_id, injured_employee_id, lost_time_hours,
         corrective_action, status, reported_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
      [
        id, branchId, input.incidentDate, incidentType, severity, input.description.trim(),
        input.location?.trim() || null, input.workCenterId || null, input.productionOrderId || null,
        input.injuredEmployeeId || null, Number(input.lostTimeHours) || 0,
        input.correctiveAction?.trim() || null, actor.id, now, now,
      ]
    );
    this.ctx.audit('تسجيل حادث سلامة', id, { incidentType, severity });
    return this.getHseIncidents().find((row) => row.id === id)!;
  }

  public updateHseIncidentStatus(id: string, status: 'OPEN' | 'INVESTIGATING' | 'CLOSED', correctiveAction?: string): HseIncident {
    this.ctx.guardWrites();
    const actor = this.requireManage();
    const row = this.ctx.db.query<any>(`SELECT * FROM hse_incidents WHERE id = ?`, [id])[0];
    if (!row) throw new Error('الحادث غير موجود.');
    if (row.branch_id) this.ctx.branchAccess.requireBranchAccess(row.branch_id, actor);
    if (!['OPEN', 'INVESTIGATING', 'CLOSED'].includes(status)) throw new Error('حالة الحادث غير صالحة.');
    this.ctx.db.run(
      `UPDATE hse_incidents SET status = ?, corrective_action = COALESCE(?, corrective_action), updated_at = ? WHERE id = ?`,
      [status, correctiveAction?.trim() || null, new Date().toISOString(), id]
    );
    this.ctx.audit('تحديث حالة حادث سلامة', id, { status });
    return this.getHseIncidents().find((item) => item.id === id)!;
  }

  // ── Permits ──────────────────────────────────────────────────────────────

  public getHsePermits(filter?: { status?: string }): HsePermit[] {
    const actor = this.requireView();
    const scope = this.ctx.branchAccess.sqlScope('p.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string> = [...scope.params];
    if (filter?.status) { conditions.push('p.status = ?'); params.push(filter.status); }
    return this.ctx.db.query<HsePermit>(
      `SELECT p.* FROM hse_permits p WHERE ${conditions.join(' AND ')}
       ORDER BY p.valid_to, p.created_at DESC`,
      params
    );
  }

  public createHsePermit(input: {
    permitType?: string; title: string; location?: string; workCenterId?: string;
    validFrom: string; validTo: string; conditions?: string; branchId?: string;
  }): HsePermit {
    this.ctx.guardWrites();
    const actor = this.requireManage();
    if (!input.title?.trim()) throw new Error('عنوان التصريح مطلوب.');
    assertDate(input.validFrom, 'بداية السريان');
    assertDate(input.validTo, 'نهاية السريان');
    if (input.validTo < input.validFrom) throw new Error('نهاية السريان يجب أن تكون بعد البداية.');
    const permitType = input.permitType || 'HOT_WORK';
    if (!PERMIT_TYPES.includes(permitType)) throw new Error('نوع التصريح غير صالح.');
    const branchId = this.branchOrDefault(actor, input.branchId);
    const id = `hsp_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const permitNumber = `HSE-${new Date().getFullYear()}-${String(this.ctx.db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM hse_permits WHERE branch_id = ?`, [branchId]
    )[0]?.c || 0 + 1).padStart(4, '0')}`;
    const now = new Date().toISOString();
    this.ctx.db.run(
      `INSERT INTO hse_permits
        (id, branch_id, permit_number, permit_type, title, location, work_center_id,
         valid_from, valid_to, status, requested_by, conditions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', ?, ?, ?, ?)`,
      [
        id, branchId, permitNumber, permitType, input.title.trim(),
        input.location?.trim() || null, input.workCenterId || null,
        input.validFrom, input.validTo, actor.id,
        input.conditions?.trim() || null, now, now,
      ]
    );
    this.ctx.audit('طلب تصريح عمل خطرة', id, { permitType });
    return this.getHsePermits().find((row) => row.id === id)!;
  }

  public approveHsePermit(id: string, conditions?: string): HsePermit {
    this.ctx.guardWrites();
    const actor = this.requireManage();
    const row = this.ctx.db.query<any>(`SELECT * FROM hse_permits WHERE id = ?`, [id])[0];
    if (!row) throw new Error('التصريح غير موجود.');
    this.ctx.branchAccess.requireBranchAccess(row.branch_id, actor);
    if (row.status !== 'REQUESTED') throw new Error('لا يمكن اعتماد تصريح ليس في حالة طلب.');
    const now = new Date().toISOString();
    this.ctx.db.run(
      `UPDATE hse_permits SET status = 'ACTIVE', approved_by = ?, approved_at = ?,
        conditions = COALESCE(?, conditions), updated_at = ? WHERE id = ?`,
      [actor.id, now, conditions?.trim() || null, now, id]
    );
    this.ctx.audit('اعتماد تصريح عمل خطرة', id, {});
    return this.getHsePermits().find((item) => item.id === id)!;
  }

  public cancelHsePermit(id: string): HsePermit {
    this.ctx.guardWrites();
    const actor = this.requireManage();
    const row = this.ctx.db.query<any>(`SELECT * FROM hse_permits WHERE id = ?`, [id])[0];
    if (!row) throw new Error('التصريح غير موجود.');
    this.ctx.branchAccess.requireBranchAccess(row.branch_id, actor);
    if (['CLOSED', 'CANCELLED'].includes(row.status)) throw new Error('التصريح مغلق أو ملغى بالفعل.');
    this.ctx.db.run(
      `UPDATE hse_permits SET status = 'CANCELLED', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    this.ctx.audit('إلغاء تصريح عمل خطرة', id, {});
    return this.getHsePermits().find((item) => item.id === id)!;
  }

  /** Permits expiring within N days plus already-expired ACTIVE ones. */
  public getHsePermitAlerts(withinDays = 7): { expiring: HsePermit[]; expired: HsePermit[] } {
    const actor = this.requireView();
    const today = localDateString();
    const horizon = new Date(`${today}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + withinDays);
    const horizonStr = horizon.toISOString().slice(0, 10);
    const scope = this.ctx.branchAccess.sqlScope('p.branch_id', undefined, actor);
    const rows = this.ctx.db.query<HsePermit>(
      `SELECT p.* FROM hse_permits p
       WHERE ${scope.clause} AND p.status IN ('REQUESTED','ACTIVE','APPROVED')
         AND p.valid_to <= ?
       ORDER BY p.valid_to`,
      [...scope.params, horizonStr]
    );
    return {
      expired: rows.filter((row) => row.validTo < today),
      expiring: rows.filter((row) => row.validTo >= today),
    };
  }

  // ── Inspections ──────────────────────────────────────────────────────────

  public getHseInspections(filter?: { result?: string }): HseInspection[] {
    const actor = this.requireView();
    const scope = this.ctx.branchAccess.sqlScope('i.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string> = [...scope.params];
    if (filter?.result) { conditions.push('i.result = ?'); params.push(filter.result); }
    return this.ctx.db.query<HseInspection>(
      `SELECT i.*, emp.full_name AS inspectorName, wc.name AS workCenterName
       FROM hse_inspections i
       LEFT JOIN employees emp ON emp.id = i.inspector_id
       LEFT JOIN work_centers wc ON wc.id = i.work_center_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY i.inspection_date DESC, i.created_at DESC`,
      params
    );
  }

  public createHseInspection(input: {
    inspectionDate: string; area: string; inspectionType?: string; result?: string;
    findings?: string; correctiveAction?: string; inspectorId?: string;
    workCenterId?: string; branchId?: string;
  }): HseInspection {
    this.ctx.guardWrites();
    const actor = this.requireManage();
    if (!input.area?.trim()) throw new Error('منطقة الفحص مطلوبة.');
    assertDate(input.inspectionDate, 'تاريخ الفحص');
    const inspectionType = input.inspectionType || 'GENERAL';
    const result = input.result || 'PASS';
    if (!INSPECTION_TYPES.includes(inspectionType)) throw new Error('نوع الفحص غير صالح.');
    if (!['PASS', 'FAIL', 'CONDITIONAL'].includes(result)) throw new Error('نتيجة الفحص غير صالحة.');
    const branchId = this.branchOrDefault(actor, input.branchId);
    const id = `hse_i_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.ctx.db.run(
      `INSERT INTO hse_inspections
        (id, branch_id, inspection_date, area, inspection_type, result, findings,
         corrective_action, inspector_id, work_center_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, branchId, input.inspectionDate, input.area.trim(), inspectionType, result,
        input.findings?.trim() || null, input.correctiveAction?.trim() || null,
        input.inspectorId || null, input.workCenterId || null, new Date().toISOString(),
      ]
    );
    this.ctx.audit('تسجيل فحص سلامة', id, { result });
    return this.getHseInspections().find((row) => row.id === id)!;
  }

  // ── Trainings ────────────────────────────────────────────────────────────

  public getHseTrainings(filter?: { employeeId?: string; expiringWithinDays?: number }): HseTraining[] {
    const actor = this.requireView();
    const scope = this.ctx.branchAccess.sqlScope('t.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string> = [...scope.params];
    if (filter?.employeeId) { conditions.push('t.employee_id = ?'); params.push(filter.employeeId); }
    if (filter?.expiringWithinDays) {
      const horizon = new Date(`${localDateString()}T00:00:00Z`);
      horizon.setUTCDate(horizon.getUTCDate() + filter.expiringWithinDays);
      conditions.push(`t.expiry_date IS NOT NULL AND t.expiry_date <= ? AND t.status = 'COMPLETED'`);
      params.push(horizon.toISOString().slice(0, 10));
    }
    return this.ctx.db.query<HseTraining>(
      `SELECT t.*, emp.full_name AS employeeName
       FROM hse_trainings t
       JOIN employees emp ON emp.id = t.employee_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.expiry_date IS NULL, t.expiry_date, t.training_date DESC`,
      params
    );
  }

  public createHseTraining(input: {
    employeeId: string; trainingName: string; provider?: string; trainingDate: string;
    expiryDate?: string; certificateRef?: string; status?: string; notes?: string; branchId?: string;
  }): HseTraining {
    this.ctx.guardWrites();
    const actor = this.requireManage();
    if (!input.trainingName?.trim()) throw new Error('اسم التدريب مطلوب.');
    assertDate(input.trainingDate, 'تاريخ التدريب');
    assertDate(input.expiryDate, 'تاريخ الانتهاء');
    const employee = this.ctx.db.query<{ id: string }>(`SELECT id FROM employees WHERE id = ?`, [input.employeeId])[0];
    if (!employee) throw new Error('الموظف المحدد غير موجود.');
    const status = input.status || 'COMPLETED';
    if (!TRAINING_STATUSES.includes(status)) throw new Error('حالة التدريب غير صالحة.');
    const branchId = this.branchOrDefault(actor, input.branchId);
    const id = `hst_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.ctx.db.run(
      `INSERT INTO hse_trainings
        (id, branch_id, employee_id, training_name, provider, training_date,
         expiry_date, certificate_ref, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, branchId, input.employeeId, input.trainingName.trim(),
        input.provider?.trim() || null, input.trainingDate,
        input.expiryDate || null, input.certificateRef?.trim() || null,
        status, input.notes?.trim() || null, new Date().toISOString(),
      ]
    );
    this.ctx.audit('تسجيل تدريب سلامة', id, { trainingName: input.trainingName });
    return this.getHseTrainings().find((row) => row.id === id)!;
  }
}
