import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import type { SafetyContext } from './context';
import { isValidDate } from './helpers';
import type {
  AccidentRecord,
  AccidentRecordInput,
  AccidentSeverity,
  AccidentStatus,
  AccidentType,
  InvestigationStatus,
} from './types';

/* ========== Accidents ========== */

export function getAccidents(ctx: SafetyContext): AccidentRecord[] {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('a.branch_id', undefined, actor);
  const rows = ctx.db.query<any>(
    `SELECT a.id, a.accident_code AS accidentCode, a.location_id AS locationId,
            fl.name AS locationName, a.branch_id AS branchId, b.name AS branchName,
            a.asset_id AS assetId, fa.name AS assetName,
            a.accident_date AS accidentDate, a.accident_type AS accidentType,
            a.severity, a.injured_employee_id AS injuredEmployeeId,
            e.name AS injuredEmployeeName, a.description, a.immediate_action AS immediateAction,
            a.investigation_required AS investigationRequired,
            a.investigation_status AS investigationStatus,
            a.root_cause AS rootCause, a.corrective_action AS correctiveAction,
            a.preventive_action AS preventiveAction, a.days_lost AS daysLost,
            a.reported_by AS reportedBy, u.full_name AS reportedByName,
            a.reported_at AS reportedAt, a.closed_at AS closedAt, a.status
     FROM facility_accidents a
     JOIN facility_locations fl ON fl.id = a.location_id
     JOIN branches b ON b.id = a.branch_id
     LEFT JOIN facility_assets fa ON fa.id = a.asset_id
     LEFT JOIN employees e ON e.id = a.injured_employee_id
     LEFT JOIN users u ON u.id = a.reported_by
     WHERE a.company_id = ? AND ${scope.clause}
     ORDER BY a.accident_date DESC`,
    [companyId, ...scope.params]
  );
  return rows.map((row) => ({
    ...row,
    accidentType: row.accident_type as AccidentType,
    severity: row.severity as AccidentSeverity,
    investigationStatus: row.investigation_status as InvestigationStatus,
    investigationRequired: Boolean(row.investigation_required),
    status: row.status as AccidentStatus,
  }));
}

export function createAccidentRecord(ctx: SafetyContext, input: AccidentRecordInput): AccidentRecord {
  const actor = ctx.requireManage();
  const _companyId = ctx.currentCompanyId(actor);
  const location = ctx.db.query<{ id: string; name: string; branch_id: string }>(
    'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
    [input.locationId]
  )[0];
  if (!location) throw new Error('الموقع غير موجود.');
  if (input.assetId) {
    const asset = ctx.db.query<{ id: string }>(
      'SELECT id FROM facility_assets WHERE id = ? AND location_id = ?',
      [input.assetId, input.locationId]
    )[0];
    if (!asset) throw new Error('الأصل المحدد لا يتبع الموقع المختار.');
  }
  if (!isValidDate(input.accidentDate)) throw new Error('تاريخ الحادث غير صالح.');
  if (!input.description?.trim()) throw new Error('وصف الحادث مطلوب.');
  const accidentCode = `ACC-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const id = `acc_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  ctx.db.run(
    `INSERT INTO facility_accidents
       (id, accident_code, location_id, branch_id, asset_id, accident_date,
        accident_type, severity, injured_employee_id, description,
        immediate_action, investigation_required, investigation_status,
        reported_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
    [id, accidentCode, input.locationId, location.branch_id,
      input.assetId || null, input.accidentDate, input.accidentType,
      input.severity, input.injuredEmployeeId || null,
      input.description.trim(), input.immediateAction || null,
      input.investigationRequired ? 1 : 0,
      input.investigationRequired ? 'PENDING' : 'NOT_REQUIRED',
      actor.id]
  );
  ctx.auditActor(actor, 'تسجيل حادث سلامة', id, {
    accidentCode, accidentType: input.accidentType, severity: input.severity,
  });
  // Notify if serious
  if (input.severity === 'SERIOUS' || input.severity === 'CRITICAL' || input.severity === 'FATAL') {
    ctx.notification.createNotification(
      'SYSTEM', 'حادث سلامة خطير',
      `تم تسجيل حادث ${input.severity}: ${input.description} في ${location.name}`,
      actor.id, 'SAFETY_ACCIDENT', `${id}:serious`
    );
  }
  return getAccidentRecord(ctx, id)!;
}

function getAccidentRecord(ctx: SafetyContext, id: string): AccidentRecord | null {
  const records = getAccidents(ctx).filter((r) => r.id === id);
  return records[0] ?? null;
}

export function investigateAccident(
  ctx: SafetyContext,
  id: string,
  input: {
    investigationStatus: InvestigationStatus;
    rootCause?: string | null;
    correctiveAction?: string | null;
    preventiveAction?: string | null;
    daysLost?: number;
  }
): AccidentRecord {
  const actor = ctx.requireManage();
  const companyId = ctx.currentCompanyId(actor);
  const existing = ctx.db.query<{ id: string; status: AccidentStatus }>(
    'SELECT id, status FROM facility_accidents WHERE id = ? AND company_id = ?',
    [id, companyId]
  )[0];
  if (!existing) throw new Error('الحادث غير موجود.');
  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  const setField = (column: string, value: string | number | null | undefined) => {
    if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
  };
  setField('investigation_status', input.investigationStatus || null);
  setField('root_cause', input.rootCause || null);
  setField('corrective_action', input.correctiveAction || null);
  setField('preventive_action', input.preventiveAction || null);
  setField('days_lost', input.daysLost !== undefined ? Math.max(0, input.daysLost) : undefined);
  if (input.investigationStatus === 'COMPLETED') {
    updates.push('status = ?');
    params.push('CLOSED');
    updates.push('closed_at = ?');
    params.push(localDateString());
  }
  if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  ctx.db.run(`UPDATE facility_accidents SET ${updates.join(', ')} WHERE id = ?`, params);
  ctx.auditActor(actor, 'تحقيق حادث سلامة', id, input);
  return getAccidentRecord(ctx, id)!;
}
