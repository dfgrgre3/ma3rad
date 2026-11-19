import { localDateString, addLocalDays } from '../../../../utils/shared/date';
import type { SafetyContext } from './context';
import type { SafetyStats } from './types';

/* ========== Stats ========== */

export function getSafetyStats(ctx: SafetyContext): SafetyStats {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('rr.branch_id', undefined, actor);
  const today = localDateString();
  const inThirtyDays = localDateString(addLocalDays(new Date(), 30));
  const totalRisks = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_risk_register WHERE company_id = ? AND ${scope.clause}`,
    [companyId, ...scope.params]
  )[0]?.count ?? 0;
  const criticalRisks = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_risk_register WHERE company_id = ? AND risk_level = 'CRITICAL' AND status != 'CLOSED' AND ${scope.clause}`,
    [companyId, ...scope.params]
  )[0]?.count ?? 0;
  const highRisks = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_risk_register WHERE company_id = ? AND risk_level = 'HIGH' AND status != 'CLOSED' AND ${scope.clause}`,
    [companyId, ...scope.params]
  )[0]?.count ?? 0;
  const openRisks = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_risk_register WHERE company_id = ? AND status = 'OPEN' AND ${scope.clause}`,
    [companyId, ...scope.params]
  )[0]?.count ?? 0;
  const mitigatedRisks = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_risk_register WHERE company_id = ? AND status = 'MITIGATED' AND ${scope.clause}`,
    [companyId, ...scope.params]
  )[0]?.count ?? 0;
  const totalInspections = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_inspection_records WHERE company_id = ? AND ${scope.clause}`,
    [companyId, ...scope.params]
  )[0]?.count ?? 0;
  const failedInspections = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_inspection_records WHERE company_id = ? AND overall_result = 'FAIL' AND ${scope.clause}`,
    [companyId, ...scope.params]
  )[0]?.count ?? 0;
  const totalAccidents = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_accidents WHERE company_id = ? AND ${scope.clause}`,
    [companyId, ...scope.params]
  )[0]?.count ?? 0;
  const seriousAccidents = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_accidents WHERE company_id = ? AND severity IN ('SERIOUS', 'CRITICAL', 'FATAL') AND ${scope.clause}`,
    [companyId, ...scope.params]
  )[0]?.count ?? 0;
  const openAccidents = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_accidents WHERE company_id = ? AND status = 'OPEN' AND ${scope.clause}`,
    [companyId, ...scope.params]
  )[0]?.count ?? 0;
  const totalCAPA = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_capa WHERE company_id = ? AND ${scope.clause}`,
    [companyId, ...scope.params]
  )[0]?.count ?? 0;
  const overdueCAPA = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_capa WHERE company_id = ? AND status != 'CLOSED' AND due_date < ? AND ${scope.clause}`,
    [companyId, today, ...scope.params]
  )[0]?.count ?? 0;
  const fireEquipmentDueInspection = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_fire_equipment WHERE company_id = ? AND next_inspection_date <= ? AND status != 'RETIRED' AND ${scope.clause}`,
    [companyId, inThirtyDays, ...scope.params]
  )[0]?.count ?? 0;
  const ppeExpiringSoon = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_ppe_inventory WHERE company_id = ? AND expiry_date <= ? AND status != 'RETIRED' AND ${scope.clause}`,
    [companyId, inThirtyDays, ...scope.params]
  )[0]?.count ?? 0;
  const trainingExpiringSoon = ctx.db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_safety_training WHERE company_id = ? AND certificate_expiry_date <= ? AND status != 'EXPIRED' AND ${scope.clause}`,
    [companyId, inThirtyDays, ...scope.params]
  )[0]?.count ?? 0;
  return {
    totalRisks: Number(totalRisks),
    criticalRisks: Number(criticalRisks),
    highRisks: Number(highRisks),
    openRisks: Number(openRisks),
    mitigatedRisks: Number(mitigatedRisks),
    totalInspections: Number(totalInspections),
    failedInspections: Number(failedInspections),
    totalAccidents: Number(totalAccidents),
    seriousAccidents: Number(seriousAccidents),
    openAccidents: Number(openAccidents),
    totalCAPA: Number(totalCAPA),
    overdueCAPA: Number(overdueCAPA),
    fireEquipmentDueInspection: Number(fireEquipmentDueInspection),
    ppeExpiringSoon: Number(ppeExpiringSoon),
    trainingExpiringSoon: Number(trainingExpiringSoon),
  };
}

/* ========== Alerts ========== */

export function generateCriticalRiskAlerts(ctx: SafetyContext): void {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('rr.branch_id', undefined, actor);
  const criticalRisks = ctx.db.query<any>(
    `SELECT rr.id, rr.risk_title AS riskTitle, rr.location_id AS locationId,
            fl.name AS locationName, rr.responsible_employee_id AS responsibleEmployeeId
     FROM facility_risk_register rr
     JOIN facility_locations fl ON fl.id = rr.location_id
     WHERE rr.company_id = ? AND rr.risk_level = 'CRITICAL' AND rr.status = 'OPEN' AND ${scope.clause}`,
    [companyId, ...scope.params]
  );
  for (const risk of criticalRisks) {
    const referenceId = `SAFETY_RISK_ALERT:${risk.id}`;
    const exists = ctx.db.query<{ id: string }>(
      `SELECT id FROM notifications WHERE user_id = ? AND reference_type = 'SAFETY_RISK_ALERT' AND reference_id = ? LIMIT 1`,
      [actor.id, referenceId]
    );
    if (!exists.length) {
      ctx.notification.createNotification(
        'SYSTEM', 'مخاطر حرجة مفتوحة',
        `مخاطر حرجة غير مُعالجة: ${risk.riskTitle} في موقع ${risk.locationName}`,
        actor.id, 'SAFETY_RISK_ALERT', referenceId
      );
    }
  }
}
