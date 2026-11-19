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
import type { ContractAmendment } from './types';
import { localDateString } from '../../../../utils/shared/date';

export function getContractAmendments(contractId: string): ContractAmendment[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const scope = branchAccess.sqlScope('fc.branch_id', undefined, actor);
  const rows = db.query<any>(
    `SELECT fca.id, fca.contract_id AS contractId, fc.title AS contractTitle,
            fca.amendment_number AS amendmentNumber, fca.amendment_date AS amendmentDate,
            fca.field_changed AS fieldChanged, fca.old_value AS oldValue,
            fca.new_value AS newValue, fca.reason, fca.approved_by AS approvedBy,
            u.full_name AS approvedByName, fca.approved_at AS approvedAt,
            fca.notes, fca.created_by AS createdBy, cu.full_name AS createdByName,
            fca.created_at AS createdAt
     FROM facility_contract_amendments fca
     JOIN facility_contracts fc ON fc.id = fca.contract_id
     LEFT JOIN users u ON u.id = fca.approved_by
     LEFT JOIN users cu ON cu.id = fca.created_by
     WHERE fca.contract_id = ? AND fc.company_id = ? AND ${scope.clause}
     ORDER BY fca.amendment_date DESC`,
    [contractId, companyId, ...scope.params]
  );
  return rows.map((row) => ({
    ...row,
    approvedByName: row.approvedByName || null,
  }));
}

export function createContractAmendment(
  contractId: string,
  input: {
    amendmentDate: string;
    fieldChanged: string;
    oldValue?: string | null;
    newValue?: string | null;
    reason: string;
    notes?: string | null;
  }
): ContractAmendment {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const contract = db.query<{ id: string; amendmentCount: number }>(
    `SELECT id, amendment_count AS amendmentCount FROM facility_contracts WHERE id = ? AND company_id = ?`,
    [contractId, companyId]
  )[0];
  if (!contract) throw new Error('العقد غير موجود.');
  if (!isValidDate(input.amendmentDate)) throw new Error('تاريخ التعديل غير صالح.');
  if (!input.fieldChanged?.trim()) throw new Error('الحقل المعدل مطلوب.');
  if (!input.reason?.trim()) throw new Error('سبب التعديل مطلوب.');

  const amendmentNumber = `AM-${localDateString().slice(0, 7)}-${String(contract.amendmentCount + 1).padStart(3, '0')}`;
  const id = `fca_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO facility_contract_amendments
       (id, contract_id, amendment_number, amendment_date, field_changed,
        old_value, new_value, reason, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, contractId, amendmentNumber, input.amendmentDate, input.fieldChanged.trim(),
      input.oldValue || null, input.newValue || null, input.reason.trim(),
      input.notes || null, actor.id]
  );
  db.run(
    `UPDATE facility_contracts SET amendment_count = amendment_count + 1,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [contractId]
  );
  auditActor(actor, 'إضافة تعديل عقد خدمة', id, {
    contractId, fieldChanged: input.fieldChanged, reason: input.reason,
  });
  return getContractAmendments(contractId).find((a) => a.id === id)!;
}
