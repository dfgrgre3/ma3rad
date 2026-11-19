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
  ContractRenewal,
  RenewalStatus,
} from './types';
import { localDateString } from '../../../../utils/shared/date';

export function getContractRenewals(contractId?: string): ContractRenewal[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const conditions: string[] = ['fcr.company_id = ?'];
  const params: (string | number)[] = [companyId];
  if (contractId) {
    conditions.push('fcr.contract_id = ?');
    params.push(contractId);
  }
  const scope = branchAccess.sqlScope('fc.branch_id', undefined, actor);
  conditions.push(scope.clause);
  params.push(...scope.params);

  const rows = db.query<any>(
    `SELECT fcr.id, fcr.contract_id AS contractId, fc.title AS contractTitle,
            fcr.renewal_number AS renewalNumber, fcr.previous_ends_at AS previousEndsAt,
            fcr.new_ends_at AS newEndsAt, fcr.new_payment_amount / 100.0 AS newPaymentAmount,
            fcr.new_payment_cycle AS newPaymentCycle, fcr.status,
            fcr.approved_by AS approvedBy, u.full_name AS approvedByName,
            fcr.approved_at AS approvedAt, fcr.notes,
            fcr.created_by AS createdBy, cu.full_name AS createdByName,
            fcr.created_at AS createdAt
     FROM facility_contract_renewals fcr
     JOIN facility_contracts fc ON fc.id = fcr.contract_id
     LEFT JOIN users u ON u.id = fcr.approved_by
     LEFT JOIN users cu ON cu.id = fcr.created_by
     WHERE fc.company_id = ? AND ${conditions.slice(1).join(' AND ')}
     ORDER BY fcr.created_at DESC`,
    params
  );
  return rows.map((row) => ({
    ...row,
    status: row.status as RenewalStatus,
    approvedByName: row.approvedByName || null,
  }));
}

export function createContractRenewal(
  contractId: string,
  input: {
    newEndsAt: string;
    newPaymentAmount: number;
    newPaymentCycle: string;
    notes?: string | null;
  }
): ContractRenewal {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const contract = db.query<any>(
    `SELECT fc.id, fc.title, fc.ends_at AS endsAt FROM facility_contracts fc
     WHERE fc.id = ? AND fc.company_id = ?`,
    [contractId, companyId]
  )[0];
  if (!contract) throw new Error('العقد غير موجود.');
  if (!isValidDate(input.newEndsAt)) throw new Error('تاريخ نهاية العقد الجديد غير صالح.');
  if (contract.endsAt && input.newEndsAt <= contract.endsAt) {
    throw new Error('تاريخ نهاية العقد الجديد يجب أن يكون بعد تاريخ نهاية العقد الحالي.');
  }
  if (Number(input.newPaymentAmount) < 0) throw new Error('مبلغ الدفعة يجب أن يكون غير سالب.');

  const renewalNumber = `RN-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const id = `fcr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO facility_contract_renewals
       (id, contract_id, renewal_number, previous_ends_at, new_ends_at,
        new_payment_amount, new_payment_cycle, status, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ROUND(?*100), ?, 'PENDING', ?, ?)`,
    [id, contractId, renewalNumber, contract.endsAt, input.newEndsAt,
      Math.max(0, Number(input.newPaymentAmount)), input.newPaymentCycle,
      input.notes || null, actor.id]
  );
  auditActor(actor, 'إنشاء تجديد عقد خدمة', id, {
    contractId, newEndsAt: input.newEndsAt, newPaymentAmount: input.newPaymentAmount,
  });
  return getContractRenewals(contractId).find((r) => r.id === id)!;
}

export function decideContractRenewal(renewalId: string, approve: boolean, notes?: string | null): ContractRenewal {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const renewal = db.query<any>(
    `SELECT fcr.*, fc.title AS contractTitle, fc.ends_at AS currentEndsAt
     FROM facility_contract_renewals fcr
     JOIN facility_contracts fc ON fc.id = fcr.contract_id
     WHERE fcr.id = ? AND fc.company_id = ?`,
    [renewalId, companyId]
  )[0];
  if (!renewal) throw new Error('طلب التجديد غير موجود.');
  if (renewal.status !== 'PENDING') throw new Error('تم البت في طلب التجديد مسبقاً.');
  const now = new Date().toISOString();
  const newStatus = approve ? 'APPROVED' : 'REJECTED';
  db.run(
    `UPDATE facility_contract_renewals SET status = ?, approved_by = ?,
       approved_at = ?, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [newStatus, actor.id, now, notes || null, renewalId]
  );
  if (approve) {
    // Execute renewal: update contract end date and payment
    db.run(
      `UPDATE facility_contracts SET ends_at = ?, payment_amount = ?,
         payment_cycle = ?, status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [renewal.new_ends_at, renewal.new_payment_amount, renewal.new_payment_cycle, renewal.contract_id]
    );
  }
  auditActor(actor, approve ? 'اعتماد تجديد عقد خدمة' : 'رفض تجديد عقد خدمة', renewalId, {
    previousStatus: renewal.status, newStatus, notes,
  });
  return getContractRenewals(renewal.contract_id).find((r) => r.id === renewalId)!;
}
