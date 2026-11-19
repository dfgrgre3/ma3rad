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
  UtilityContract,
  UtilityContractInput,
  UtilityType,
} from './types';
import { localDateString, addLocalDays } from '../../../../utils/shared/date';

export function getUtilityContracts(): UtilityContract[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const scope = branchAccess.sqlScope('um.branch_id', undefined, actor);
  const today = localDateString();
  const inThirtyDays = localDateString(addLocalDays(new Date(), 30));
  const rows = db.query<any>(
    `SELECT fuc.id, fuc.meter_id AS meterId, um.meter_code AS meterCode,
            um.meter_name AS meterName, um.utility_type AS utilityType,
            fuc.supplier_id AS supplierId, s.name AS supplierName,
            fuc.contract_number AS contractNumber, fuc.title,
            fuc.starts_at AS startsAt, fuc.ends_at AS endsAt,
            fuc.auto_renew AS autoRenew, fuc.renewal_notice_days AS renewalNoticeDays,
            fuc.sla_response_time_hours AS slaResponseTimeHours,
            fuc.sla_resolution_time_hours AS slaResolutionTimeHours,
            fuc.status, fuc.notes,
            fuc.created_by AS createdBy, u.full_name AS createdByName,
            fuc.created_at AS createdAt, fuc.updated_at AS updatedAt
     FROM facility_utility_contracts fuc
     JOIN facility_utility_meters um ON um.id = fuc.meter_id
     JOIN suppliers s ON s.id = fuc.supplier_id
     LEFT JOIN users u ON u.id = fuc.created_by
     WHERE um.company_id = ? AND ${scope.clause}
     ORDER BY fuc.ends_at, fuc.title`,
    [companyId, ...scope.params]
  );
  return rows.map((row) => {
    const endsAt = row.ends_at;
    const daysToExpiry = endsAt
      ? Math.max(0, Math.ceil((Date.parse(`${endsAt}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000))
      : null;
    const isExpiringSoon = endsAt ? endsAt <= inThirtyDays && endsAt >= today : false;
    return {
      ...row,
      utilityType: row.utility_type as UtilityType,
      autoRenew: Boolean(row.autoRenew),
      status: row.status as string,
      daysToExpiry,
      isExpiringSoon,
      createdByName: row.created_by_name || null,
    };
  });
}

export function createUtilityContract(input: UtilityContractInput): UtilityContract {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const meter = db.query<{ id: string; meterCode: string; meterName: string; utilityType: UtilityType }>(
    `SELECT um.id, um.meter_code AS meterCode, um.meter_name AS meterName,
            um.utility_type AS utilityType
     FROM facility_utility_meters um
     WHERE um.id = ? AND um.company_id = ?`,
    [input.meterId, companyId]
  )[0];
  if (!meter) throw new Error('العداد غير موجود.');
  const supplier = db.query<{ id: string; name: string }>(
    'SELECT id, name FROM suppliers WHERE id = ?',
    [input.supplierId]
  )[0];
  if (!supplier) throw new Error('المورد غير موجود.');
  if (!input.contractNumber?.trim()) throw new Error('رقم العقد مطلوب.');
  if (!input.title?.trim()) throw new Error('عنوان العقد مطلوب.');
  if (!isValidDate(input.startsAt)) throw new Error('تاريخ بداية العقد غير صالح.');
  if (input.endsAt && !isValidDate(input.endsAt)) throw new Error('تاريخ نهاية العقد غير صالح.');
  if (input.endsAt && input.endsAt < input.startsAt) {
    throw new Error('تاريخ نهاية العقد يسبق تاريخ بدايته.');
  }
  const existing = db.query<{ id: string }>(
    'SELECT id FROM facility_utility_contracts WHERE meter_id = ? AND contract_number = ?',
    [input.meterId, input.contractNumber.trim()]
  )[0];
  if (existing) throw new Error('رقم العقد مسجل مسبقاً لهذا العداد.');
  const id = `uc_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO facility_utility_contracts
       (id, meter_id, supplier_id, contract_number, title, starts_at, ends_at,
        auto_renew, renewal_notice_days, sla_response_time_hours,
        sla_resolution_time_hours, status, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    [id, input.meterId, input.supplierId, input.contractNumber.trim(),
      input.title.trim(), input.startsAt, input.endsAt || null,
      input.autoRenew ? 1 : 0, input.renewalNoticeDays ?? 30,
      input.slaResponseTimeHours ?? 24, input.slaResolutionTimeHours ?? 48,
      input.notes || null, actor.id]
  );
  auditActor(actor, 'إضافة عقد خدمة مرافق', id, {
    meterId: input.meterId, contractNumber: input.contractNumber, supplierId: input.supplierId,
  });
  return getUtilityContract(id)!;
}

function getUtilityContract(id: string): UtilityContract | null {
  const contracts = getUtilityContracts().filter((c) => c.id === id);
  return contracts[0] ?? null;
}

export function updateUtilityContractStatus(id: string, status: string): UtilityContract {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const contract = db.query<{ id: string }>(
    `SELECT fuc.id FROM facility_utility_contracts fuc
     JOIN facility_utility_meters um ON um.id = fuc.meter_id
     WHERE fuc.id = ? AND um.company_id = ?`,
    [id, companyId]
  )[0];
  if (!contract) throw new Error('العقد غير موجود.');
  db.run(
    `UPDATE facility_utility_contracts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, id]
  );
  auditActor(actor, 'تعديل عقد خدمة مرافق', id, { status });
  return getUtilityContract(id)!;
}
