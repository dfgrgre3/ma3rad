import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import type { SafetyContext } from './context';
import { computeRiskLevel, computeRiskScore } from './helpers';
import type {
  Impact,
  Probability,
  RiskCategory,
  RiskLevel,
  RiskRegisterInput,
  RiskRegisterItem,
  RiskStatus,
  RiskType,
} from './types';

/* ========== Risk Register ========== */

export function getRiskRegister(ctx: SafetyContext): RiskRegisterItem[] {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('rr.branch_id', undefined, actor);
  const rows = ctx.db.query<any>(
    `SELECT rr.id, rr.risk_code AS riskCode, rr.risk_title AS riskTitle,
            rr.location_id AS locationId, fl.name AS locationName,
            rr.branch_id AS branchId, b.name AS branchName,
            rr.asset_id AS assetId, fa.name AS assetName,
            rr.risk_category AS riskCategory, rr.risk_type AS riskType,
            rr.hazard_description AS hazardDescription, rr.probability,
            rr.impact, rr.risk_score AS riskScore, rr.risk_level AS riskLevel,
            rr.existing_controls AS existingControls, rr.mitigation_plan AS mitigationPlan,
            rr.responsible_employee_id AS responsibleEmployeeId,
            e.name AS responsibleEmployeeName,
            rr.target_date AS targetDate, rr.status, rr.review_date AS reviewDate,
            rr.created_by AS createdBy, u.full_name AS createdByName,
            rr.created_at AS createdAt, rr.updated_at AS updatedAt
     FROM facility_risk_register rr
     JOIN facility_locations fl ON fl.id = rr.location_id
     JOIN branches b ON b.id = rr.branch_id
     LEFT JOIN facility_assets fa ON fa.id = rr.asset_id
     LEFT JOIN employees e ON e.id = rr.responsible_employee_id
     LEFT JOIN users u ON u.id = rr.created_by
     WHERE rr.company_id = ? AND ${scope.clause}
     ORDER BY rr.risk_score DESC, rr.risk_title`,
    [companyId, ...scope.params]
  );
  return rows.map((row) => ({
    ...row,
    riskLevel: row.risk_level as RiskLevel,
    riskCategory: row.risk_category as RiskCategory,
    riskType: row.risk_type as RiskType,
    probability: row.probability as Probability,
    impact: row.impact as Impact,
    status: row.status as RiskStatus,
  }));
}

export function createRiskRegisterItem(ctx: SafetyContext, input: RiskRegisterInput): RiskRegisterItem {
  const actor = ctx.requireManage();
  const _companyId = ctx.currentCompanyId(actor);
  const location = ctx.db.query<{ id: string; name: string; branch_id: string }>(
    'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
    [input.locationId]
  )[0];
  if (!location) throw new Error('الموقع غير موجود.');
  const branch = ctx.db.query<{ id: string; name: string }>(
    'SELECT id, name FROM branches WHERE id = ?',
    [location.branch_id]
  )[0];
  if (!branch) throw new Error('الفرع غير موجود.');
  if (input.assetId) {
    const asset = ctx.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM facility_assets WHERE id = ? AND location_id = ?',
      [input.assetId, input.locationId]
    )[0];
    if (!asset) throw new Error('الأصل المحدد لا يتبع الموقع المختار.');
  }
  const riskScore = computeRiskScore(input.probability, input.impact);
  const riskLevel = computeRiskLevel(riskScore);
  const riskCode = `RSK-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const id = `rsk_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  ctx.db.run(
    `INSERT INTO facility_risk_register
       (id, risk_code, risk_title, location_id, branch_id, asset_id,
        risk_category, risk_type, hazard_description, probability, impact,
        risk_score, risk_level, existing_controls, mitigation_plan,
        responsible_employee_id, target_date, review_date, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
    [id, riskCode, input.riskTitle, input.locationId, location.branch_id,
      input.assetId || null, input.riskCategory, input.riskType,
      input.hazardDescription, input.probability, input.impact,
      riskScore, riskLevel, input.existingControls || null,
      input.mitigationPlan || null, input.responsibleEmployeeId || null,
      input.targetDate || null, input.reviewDate || null, actor.id]
  );
  ctx.auditActor(actor, 'إضافة سجل مخاطر', id, {
    riskCode, riskTitle: input.riskTitle, riskLevel, riskScore,
  });
  // Notify if critical risk
  if (riskLevel === 'CRITICAL') {
    ctx.notification.createNotification(
      'SYSTEM', 'مخاطر حرجة مسجلة',
      `تم تسجيل مخاطر حرجة: ${input.riskTitle} في موقع ${location.name}`,
      actor.id, 'SAFETY_RISK', `${id}:critical`
    );
  }
  return getRiskRegisterItem(ctx, id)!;
}

function getRiskRegisterItem(ctx: SafetyContext, id: string): RiskRegisterItem | null {
  const items = getRiskRegister(ctx).filter((i) => i.id === id);
  return items[0] ?? null;
}

export function updateRiskRegisterItem(ctx: SafetyContext, id: string, input: Partial<RiskRegisterInput> & { status?: RiskStatus }): RiskRegisterItem {
  const actor = ctx.requireManage();
  const companyId = ctx.currentCompanyId(actor);
  const existing = ctx.db.query<{ id: string; riskScore: number; riskLevel: RiskLevel }>(
    'SELECT id, risk_score AS riskScore, risk_level AS riskLevel FROM facility_risk_register WHERE id = ? AND company_id = ?',
    [id, companyId]
  )[0];
  if (!existing) throw new Error('سجل المخاطر غير موجود.');
  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  const setField = (column: string, value: string | number | null | undefined) => {
    if (value !== undefined) { updates.push(`${column} = ?`); params.push(value); }
  };
  setField('risk_title', input.riskTitle?.trim() || null);
  setField('risk_category', input.riskCategory || null);
  setField('risk_type', input.riskType || null);
  setField('hazard_description', input.hazardDescription || null);
  setField('probability', input.probability || null);
  setField('impact', input.impact || null);
  setField('existing_controls', input.existingControls || null);
  setField('mitigation_plan', input.mitigationPlan || null);
  setField('responsible_employee_id', input.responsibleEmployeeId || null);
  setField('target_date', input.targetDate || null);
  setField('review_date', input.reviewDate || null);
  setField('status', input.status || null);
  // Recalculate score if probability or impact changed
  if (input.probability !== undefined || input.impact !== undefined) {
    const prob = input.probability as Probability;
    const imp = input.impact as Impact;
    const score = computeRiskScore(prob, imp);
    const level = computeRiskLevel(score);
    updates.push('risk_score = ?', 'risk_level = ?');
    params.push(score, level);
  }
  if (!updates.length) throw new Error('لا توجد بيانات للتعديل.');
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  ctx.db.run(`UPDATE facility_risk_register SET ${updates.join(', ')} WHERE id = ?`, params);
  ctx.auditActor(actor, 'تعديل سجل مخاطر', id, input);
  return getRiskRegisterItem(ctx, id)!;
}

export function closeRiskRegisterItem(ctx: SafetyContext, id: string): RiskRegisterItem {
  const actor = ctx.requireManage();
  const companyId = ctx.currentCompanyId(actor);
  const existing = ctx.db.query<{ id: string; status: RiskStatus }>(
    'SELECT id, status FROM facility_risk_register WHERE id = ? AND company_id = ?',
    [id, companyId]
  )[0];
  if (!existing) throw new Error('سجل المخاطر غير موجود.');
  if (existing.status === 'CLOSED') throw new Error('سجل المخاطر مغلق مسبقاً.');
  ctx.db.run(
    `UPDATE facility_risk_register SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [id]
  );
  ctx.auditActor(actor, 'إغلاق سجل مخاطر', id, {});
  return getRiskRegisterItem(ctx, id)!;
}
