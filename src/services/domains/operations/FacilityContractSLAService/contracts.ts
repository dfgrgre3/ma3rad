import {
  auditActor,
  branchAccess,
  currentCompanyId,
  db,
  requireManage,
  requireView,
  roundNumber,
} from './shared';
import type {
  ContractStatus,
  FacilityContractExtended,
} from './types';
import { localDateString, addLocalDays } from '../../../../utils/shared/date';

export function getExtendedContracts(): FacilityContractExtended[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const scope = branchAccess.sqlScope('fc.branch_id', undefined, actor);
  const today = localDateString();
  const inThirtyDays = localDateString(addLocalDays(new Date(), 30));
  const rows = db.query<any>(
    `SELECT fc.id, fc.contract_number AS contractNumber, fc.location_id AS locationId,
            fl.name AS locationName, fc.contract_type AS contractType, fc.title,
            fc.vendor_name AS vendorName, fc.supplier_id AS supplierId,
            s.name AS supplierName, fc.starts_at AS startsAt, fc.ends_at AS endsAt,
            fc.next_payment_date AS nextPaymentDate, fc.payment_amount / 100.0 AS paymentAmount,
            fc.payment_cycle AS paymentCycle, fc.status,
            fc.expense_reference AS expenseReference,
            fc.sla_response_time_minutes AS slaResponseTimeMinutes,
            fc.sla_resolution_time_minutes AS slaResolutionTimeMinutes,
            fc.sla_penalty_per_delay / 100.0 AS slaPenaltyPerDelay,
            fc.auto_renew AS autoRenew, fc.renewal_notice_days AS renewalNoticeDays,
            fc.vendor_rating AS vendorRating, fc.last_evaluation_date AS lastEvaluationDate,
            fc.amendment_count AS amendmentCount
     FROM facility_contracts fc
     JOIN facility_locations fl ON fl.id = fc.location_id
     LEFT JOIN suppliers s ON s.id = fc.supplier_id
     WHERE fc.company_id = ? AND ${scope.clause}
     ORDER BY fc.ends_at, fc.title`,
    [companyId, ...scope.params]
  );
  return rows.map((row) => {
    const endsAt = row.ends_at;
    const daysToExpiry = endsAt
      ? Math.max(0, Math.ceil((Date.parse(`${endsAt}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000))
      : null;
    const isExpiringSoon = endsAt
      ? endsAt <= inThirtyDays && endsAt >= today
      : false;
    return {
      ...row,
      status: row.status as ContractStatus,
      autoRenew: Boolean(row.autoRenew),
      isExpiringSoon,
      daysToExpiry,
      slaCompliance: calculateSLAClaims(row.id),
    };
  });
}

function calculateSLAClaims(contractId: string): number | null {
  // Calculate SLA compliance based on work orders linked to this contract's location/assets
  // Simplified: return null if no data
  const violations = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_work_orders wo
     JOIN facility_contracts fc ON fc.location_id = wo.location_id
     WHERE fc.id = ? AND wo.status = 'COMPLETED'
       AND wo.resolution_time_minutes > COALESCE(fc.sla_resolution_time_minutes, 0)
       AND fc.sla_resolution_time_minutes > 0`,
    [contractId]
  )[0]?.count ?? 0;
  const total = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_work_orders wo
     JOIN facility_contracts fc ON fc.location_id = wo.location_id
     WHERE fc.id = ? AND wo.status = 'COMPLETED'`,
    [contractId]
  )[0]?.count ?? 0;
  if (total === 0) return null;
  return roundNumber(((total - Number(violations)) / total) * 100);
}

export function updateContractSLA(
  contractId: string,
  input: {
    supplierId?: string | null;
    slaResponseTimeMinutes?: number;
    slaResolutionTimeMinutes?: number;
    slaPenaltyPerDelay?: number;
    autoRenew?: boolean;
    renewalNoticeDays?: number;
  }
): FacilityContractExtended {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const contract = db.query<{ id: string }>(
    'SELECT id FROM facility_contracts WHERE id = ? AND company_id = ?',
    [contractId, companyId]
  )[0];
  if (!contract) throw new Error('العقد غير موجود.');
  if (input.supplierId !== undefined) {
    const supplier = db.query<{ id: string }>(
      'SELECT id FROM suppliers WHERE id = ?',
      [input.supplierId]
    )[0];
    if (!supplier) throw new Error('المورد غير موجود.');
  }
  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  const setField = (column: string, value: string | number | null | undefined) => {
    if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
  };
  setField('supplier_id', input.supplierId);
  setField('sla_response_time_minutes', input.slaResponseTimeMinutes);
  setField('sla_resolution_time_minutes', input.slaResolutionTimeMinutes);
  if (input.slaPenaltyPerDelay !== undefined) { updates.push('sla_penalty_per_delay = ROUND(?*100)'); params.push(input.slaPenaltyPerDelay); }
  setField('auto_renew', input.autoRenew !== undefined ? (input.autoRenew ? 1 : 0) : undefined);
  setField('renewal_notice_days', input.renewalNoticeDays);
  if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(contractId);
  db.run(`UPDATE facility_contracts SET ${updates.join(', ')} WHERE id = ?`, params);
  auditActor(actor, 'تعديل اتفاقية مستوى الخدمة (SLA)', contractId, input);
  return getExtendedContracts().find((c) => c.id === contractId)!;
}

