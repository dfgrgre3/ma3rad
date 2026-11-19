import { v4 as uuidv4 } from 'uuid';
import { localDateString, addLocalDays } from '../../../../utils/shared/date';
import type { SafetyContext } from './context';
import type {
  FireEquipment,
  FireEquipmentInput,
  FireEquipmentStatus,
  FireEquipmentType,
} from './types';

/* ========== Fire Equipment ========== */

export function getFireEquipment(ctx: SafetyContext): FireEquipment[] {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('fe.branch_id', undefined, actor);
  const today = localDateString();
  const inThirtyDays = localDateString(addLocalDays(new Date(), 30));
  const rows = ctx.db.query<any>(
    `SELECT fe.id, fe.equipment_code AS equipmentCode, fe.equipment_name AS equipmentName,
            fe.location_id AS locationId, fl.name AS locationName,
            fe.branch_id AS branchId, b.name AS branchName,
            fe.asset_id AS assetId, fa.name AS assetName,
            fe.equipment_type AS equipmentType, fe.installation_date AS installationDate,
            fe.last_inspection_date AS lastInspectionDate,
            fe.next_inspection_date AS nextInspectionDate,
            fe.inspection_frequency_months AS inspectionFrequencyMonths,
            fe.last_service_date AS lastServiceDate,
            fe.next_service_date AS nextServiceDate,
            fe.service_frequency_months AS serviceFrequencyMonths,
            fe.expiry_date AS expiryDate, fe.manufacturer, fe.model,
            fe.serial_number AS serialNumber, fe.capacity_rating AS capacityRating,
            fe.status, fe.location_description AS locationDescription,
            fe.responsible_employee_id AS responsibleEmployeeId,
            emp.name AS responsibleEmployeeName,
            fe.created_by AS createdBy, u.full_name AS createdByName,
            fe.created_at AS createdAt, fe.updated_at AS updatedAt
     FROM facility_fire_equipment fe
     JOIN facility_locations fl ON fl.id = fe.location_id
     JOIN branches b ON b.id = fe.branch_id
     LEFT JOIN facility_assets fa ON fa.id = fe.asset_id
     LEFT JOIN employees emp ON emp.id = fe.responsible_employee_id
     LEFT JOIN users u ON u.id = fe.created_by
     WHERE fe.company_id = ? AND ${scope.clause}
     ORDER BY fe.equipment_name`,
    [companyId, ...scope.params]
  );
  return rows.map((row) => {
    const nextInspection = row.next_inspection_date;
    const nextService = row.next_service_date;
    const expiry = row.expiry_date;
    return {
      ...row,
      equipmentType: row.equipment_type as FireEquipmentType,
      status: row.status as FireEquipmentStatus,
      isInspectionDue: nextInspection ? nextInspection <= inThirtyDays : false,
      isServiceDue: nextService ? nextService <= inThirtyDays : false,
      isExpired: expiry ? expiry <= today : false,
      responsibleEmployeeName: row.responsible_employee_name || null,
    };
  });
}

export function createFireEquipment(ctx: SafetyContext, input: FireEquipmentInput): FireEquipment {
  const actor = ctx.requireManage();
  const _companyId = ctx.currentCompanyId(actor);
  const location = ctx.db.query<{ id: string; name: string; branch_id: string }>(
    'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
    [input.locationId]
  )[0];
  if (!location) throw new Error('الموقع غير موجود.');
  if (!input.equipmentName?.trim()) throw new Error('اسم المعدة مطلوب.');
  const equipmentCode = `FE-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const id = `fe_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  ctx.db.run(
    `INSERT INTO facility_fire_equipment
       (id, equipment_code, equipment_name, location_id, branch_id, asset_id,
        equipment_type, installation_date, inspection_frequency_months,
        service_frequency_months, expiry_date, manufacturer, model,
        serial_number, capacity_rating, location_description,
        responsible_employee_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, equipmentCode, input.equipmentName.trim(), input.locationId, location.branch_id,
      input.assetId || null, input.equipmentType, input.installationDate || null,
      input.inspectionFrequencyMonths ?? 6, input.serviceFrequencyMonths ?? 12,
      input.expiryDate || null, input.manufacturer || null, input.model || null,
      input.serialNumber || null, input.capacityRating || null,
      input.locationDescription || null, input.responsibleEmployeeId || null, actor.id]
  );
  ctx.auditActor(actor, 'إضافة معدات إطفاء', id, {
    equipmentCode, equipmentName: input.equipmentName, equipmentType: input.equipmentType,
  });
  return getFireEquipmentItem(ctx, id)!;
}

function getFireEquipmentItem(ctx: SafetyContext, id: string): FireEquipment | null {
  const items = getFireEquipment(ctx).filter((i) => i.id === id);
  return items[0] ?? null;
}

export function updateFireEquipmentStatus(ctx: SafetyContext, id: string, status: FireEquipmentStatus): FireEquipment {
  const actor = ctx.requireManage();
  const companyId = ctx.currentCompanyId(actor);
  const existing = ctx.db.query<{ id: string; status: FireEquipmentStatus }>(
    'SELECT id, status FROM facility_fire_equipment WHERE id = ? AND company_id = ?',
    [id, companyId]
  )[0];
  if (!existing) throw new Error('معدات الإطفاء غير موجودة.');
  ctx.db.run(
    `UPDATE facility_fire_equipment SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, id]
  );
  ctx.auditActor(actor, 'تعديل حالة معدات إطفاء', id, { status });
  return getFireEquipmentItem(ctx, id)!;
}
