import { v4 as uuidv4 } from 'uuid';
import {
  auditActor,
  branchAccess,
  currentCompanyId,
  db,
  isValidDate,
  requireManage,
  requireView,
  roundNumber,
} from './shared';
import type { VendorEvaluation } from './types';

export function getVendorEvaluations(vendorId?: string): VendorEvaluation[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const conditions: string[] = ['fve.company_id = ?'];
  const params: (string | number)[] = [companyId];
  if (vendorId) {
    conditions.push('fve.vendor_id = ?');
    params.push(vendorId);
  }
  const scope = branchAccess.sqlScope('fve.branch_id', undefined, actor);
  conditions.push(scope.clause);
  params.push(...scope.params);

  const rows = db.query<any>(
    `SELECT fve.id, fve.vendor_id AS vendorId, fsv.supplier_name AS vendorName,
            fve.contract_id AS contractId, fc.title AS contractTitle,
            fve.evaluation_date AS evaluationDate, fve.evaluator_id AS evaluatorId,
            ev.full_name AS evaluatorName, fve.quality_rating AS qualityRating,
            fve.timeliness_rating AS timelinessRating,
            fve.communication_rating AS communicationRating,
            fve.overall_rating AS overallRating, fve.comments,
            fve.issues_found AS issuesFound, fve.actions_required AS actionsRequired,
            fve.follow_up_date AS followUpDate, fve.created_at AS createdAt
     FROM facility_vendor_evaluations fve
     JOIN facility_service_vendors fsv ON fsv.id = fve.vendor_id
     JOIN suppliers s ON s.id = fsv.supplier_id
     LEFT JOIN facility_contracts fc ON fc.id = fve.contract_id
     LEFT JOIN users ev ON ev.id = fve.evaluator_id
     WHERE fve.company_id = ? AND ${conditions.slice(1).join(' AND ')}
     ORDER BY fve.evaluation_date DESC`,
    params
  );
  return rows.map((row) => ({
    ...row,
    evaluatorName: row.evaluatorName || null,
  }));
}

export function createVendorEvaluation(
  vendorId: string,
  input: {
    contractId?: string | null;
    evaluationDate: string;
    qualityRating: number;
    timelinessRating: number;
    communicationRating: number;
    comments?: string | null;
    issuesFound?: string | null;
    actionsRequired?: string | null;
    followUpDate?: string | null;
  }
): VendorEvaluation {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const vendor = db.query<{ id: string; supplierName: string }>(
    `SELECT fsv.id, s.name AS supplierName FROM facility_service_vendors fsv
     JOIN suppliers s ON s.id = fsv.supplier_id
     WHERE fsv.id = ? AND fsv.company_id = ?`,
    [vendorId, companyId]
  )[0];
  if (!vendor) throw new Error('المورد غير موجود.');
  if (!isValidDate(input.evaluationDate)) throw new Error('تاريخ التقييم غير صالح.');
  for (const [field, value] of [
    ['جودة الخدمة', input.qualityRating],
    ['الالتزام بالمواعيد', input.timelinessRating],
    ['التواصل', input.communicationRating],
  ]) {
    if (Number(value) < 0 || Number(value) > 5) throw new Error(`تقييم ${field} يجب أن يكون بين 0 و 5.`);
  }
  const overallRating = roundNumber((input.qualityRating + input.timelinessRating + input.communicationRating) / 3);

  const id = `fve_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO facility_vendor_evaluations
       (id, vendor_id, contract_id, evaluation_date, evaluator_id, evaluator_name,
        quality_rating, timeliness_rating, communication_rating, overall_rating,
        comments, issues_found, actions_required, follow_up_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, vendorId, input.contractId || null, input.evaluationDate, actor.id, actor.fullName,
      input.qualityRating, input.timelinessRating, input.communicationRating, overallRating,
      input.comments || null, input.issuesFound || null, input.actionsRequired || null,
      input.followUpDate || null, actor.id]
  );

  // Update vendor rating
  const allEvals = db.query<{ overall: number }>(
    `SELECT overall_rating AS overall FROM facility_vendor_evaluations WHERE vendor_id = ?`,
    [vendorId]
  );
  const avgRating = roundNumber(allEvals.reduce((sum, row) => sum + Number(row.overall), 0) / allEvals.length);
  db.run(
    `UPDATE facility_service_vendors SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [avgRating, vendorId]
  );

  auditActor(actor, 'تقييم أداء مورد خدمة', id, {
    vendorId, vendorName: vendor.supplierName, overallRating,
  });
  return getVendorEvaluations(vendorId).find((e) => e.id === id)!;
}
