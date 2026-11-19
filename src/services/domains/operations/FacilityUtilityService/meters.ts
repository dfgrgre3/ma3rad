import { v4 as uuidv4 } from 'uuid';
import {
  auditActor,
  branchAccess,
  currentCompanyId,
  db,
  isValidDate,
  requireManage,
  requireView,
} from './shared';
import type {
  UnitOfMeasure,
  UtilityMeter,
  UtilityMeterInput,
  UtilityType,
} from './types';
import { localDateString } from '../../../../utils/shared/date';

export function getUtilityMeters(utilityType?: UtilityType): UtilityMeter[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const conditions: string[] = ['um.company_id = ?'];
  const params: (string | number)[] = [companyId];
  if (utilityType) {
    conditions.push('um.utility_type = ?');
    params.push(utilityType);
  }
  const scope = branchAccess.sqlScope('um.branch_id', undefined, actor);
  conditions.push(scope.clause);
  params.push(...scope.params);

  const rows = db.query<any>(
    `SELECT um.id, um.location_id AS locationId, fl.name AS locationName,
            um.branch_id AS branchId, b.name AS branchName,
            um.meter_code AS meterCode, um.meter_name AS meterName,
            um.utility_type AS utilityType, um.unit_of_measure AS unitOfMeasure,
            um.tariff_per_unit / 100.0 AS tariffPerUnit, um.fixed_monthly_fee / 100.0 AS fixedMonthlyFee,
            um.installation_date AS installationDate, um.last_reading_date AS lastReadingDate,
            um.last_reading_value AS lastReadingValue, um.is_active AS isActive,
            um.notes, um.created_by AS createdBy, u.full_name AS createdByName,
            um.created_at AS createdAt, um.updated_at AS updatedAt
     FROM facility_utility_meters um
     JOIN facility_locations fl ON fl.id = um.location_id
     JOIN branches b ON b.id = um.branch_id
     LEFT JOIN users u ON u.id = um.created_by
     WHERE um.company_id = ? AND ${conditions.slice(1).join(' AND ')}
     ORDER BY um.utility_type, um.meter_name`,
    params
  );
  return rows.map((row) => ({
    ...row,
    utilityType: row.utility_type as UtilityType,
    unitOfMeasure: row.unit_of_measure as UnitOfMeasure,
    isActive: Boolean(row.isActive),
  }));
}

export function createUtilityMeter(input: UtilityMeterInput): UtilityMeter {
  const actor = requireManage();
  const _companyId = currentCompanyId(actor);
  const location = db.query<{ id: string; name: string; branch_id: string }>(
    'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
    [input.locationId]
  )[0];
  if (!location) throw new Error('الموقع غير موجود.');
  const branch = db.query<{ id: string; name: string }>(
    'SELECT id, name FROM branches WHERE id = ?',
    [location.branch_id]
  )[0];
  if (!branch) throw new Error('الفرع غير موجود.');
  if (!input.meterName?.trim()) throw new Error('اسم العداد مطلوب.');
  if (!isValidDate(input.installationDate || '')) {
    // installation date is optional, skip validation if empty
  }
  const meterCode = `UM-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const id = `um_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO facility_utility_meters
       (id, location_id, branch_id, meter_code, meter_name, utility_type,
        unit_of_measure, tariff_per_unit, fixed_monthly_fee, installation_date,
        is_active, notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?)`,
    [id, input.locationId, location.branch_id, meterCode, input.meterName.trim(),
      input.utilityType, input.unitOfMeasure ?? 'kWh',
      input.tariffPerUnit ?? 0, input.fixedMonthlyFee ?? 0,
      input.installationDate || null, 1, input.notes || null, actor.id,
      new Date().toISOString(), new Date().toISOString()]
  );
  auditActor(actor, 'إضافة عداد مرافق', id, {
    meterCode, meterName: input.meterName, utilityType: input.utilityType,
  });
  return getUtilityMeter(id)!;
}

function getUtilityMeter(id: string): UtilityMeter | null {
  const meters = getUtilityMeters().filter((m) => m.id === id);
  return meters[0] ?? null;
}

export function updateUtilityMeter(id: string, input: Partial<UtilityMeterInput>): UtilityMeter {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const meter = db.query<{ id: string }>(
    'SELECT id FROM facility_utility_meters WHERE id = ? AND company_id = ?',
    [id, companyId]
  )[0];
  if (!meter) throw new Error('العداد غير موجود.');
  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  const setField = (column: string, value: string | number | null | undefined) => {
    if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
  };
  setField('meter_name', input.meterName?.trim() || null);
  setField('utility_type', input.utilityType || null);
  setField('unit_of_measure', input.unitOfMeasure || null);
  if (input.tariffPerUnit !== undefined) { updates.push('tariff_per_unit = ROUND(?*100)'); params.push(input.tariffPerUnit); }
  if (input.fixedMonthlyFee !== undefined) { updates.push('fixed_monthly_fee = ROUND(?*100)'); params.push(input.fixedMonthlyFee); }
  setField('installation_date', input.installationDate || null);
  setField('notes', input.notes || null);
  if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  db.run(`UPDATE facility_utility_meters SET ${updates.join(', ')} WHERE id = ?`, params);
  auditActor(actor, 'تعديل عداد مرافق', id, input);
  return getUtilityMeter(id)!;
}

export function toggleMeterActive(id: string, isActive: boolean): UtilityMeter {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const meter = db.query<{ id: string }>(
    'SELECT id FROM facility_utility_meters WHERE id = ? AND company_id = ?',
    [id, companyId]
  )[0];
  if (!meter) throw new Error('العداد غير موجود.');
  db.run(
    `UPDATE facility_utility_meters SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [isActive ? 1 : 0, id]
  );
  auditActor(actor, isActive ? 'تفعيل عداد مرافق' : 'تعطيل عداد مرافق', id, { isActive });
  return getUtilityMeter(id)!;
}
