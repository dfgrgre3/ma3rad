import {
  branchAccess,
  currentCompanyId,
  db,
  requireView,
  roundNumber,
} from './shared';
import type {
  UtilityConsumptionComparison,
  UtilityStats,
  UtilityType,
} from './types';
import { localDateString, addLocalDays } from '../../../../utils/shared/date';

export function getConsumptionComparison(periodMonth: string): UtilityConsumptionComparison[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth)) {
    throw new Error('الفترة غير صالحة (صيغة YYYY-MM).');
  }
  const periodStart = `${periodMonth}-01`;
  const periodEnd = new Date(
    Number(periodMonth.slice(0, 4)),
    Number(periodMonth.slice(5, 7)),
    0
  ).toISOString().slice(0, 10);
  const scope = branchAccess.sqlScope('b.id', undefined, actor);
  const rows = db.query<any>(
    `SELECT b.id AS branchId, b.name AS branchName, um.utility_type AS utilityType,
            SUM(ur.consumption) AS totalConsumption, SUM(ur.cost) AS totalCost,
            COUNT(DISTINCT um.id) AS meterCount
     FROM facility_utility_readings ur
     JOIN facility_utility_meters um ON um.id = ur.meter_id
     JOIN branches b ON b.id = um.branch_id
     WHERE um.company_id = ? AND ur.reading_date BETWEEN ? AND ? AND ${scope.clause}
     GROUP BY b.id, um.utility_type
     ORDER BY b.name, um.utility_type`,
    [companyId, periodStart, periodEnd, ...scope.params]
  );
  return rows.map((row) => ({
    branchId: row.branchId,
    branchName: row.branchName,
    utilityType: row.utility_type as UtilityType,
    periodMonth,
    totalConsumption: roundNumber(Number(row.totalConsumption) || 0),
    totalCost: roundNumber(Number(row.totalCost) || 0),
    meterCount: Number(row.meterCount) || 0,
  }));
}

export function getUtilityStats(): UtilityStats {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const _scope = branchAccess.sqlScope('um.branch_id', undefined, actor);
  const today = localDateString();
  const _inThirtyDays = localDateString(addLocalDays(new Date(), 30));
  const totalMeters = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_utility_meters WHERE company_id = ?`,
    [companyId]
  )[0]?.count ?? 0;
  const activeMeters = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_utility_meters WHERE company_id = ? AND is_active = 1`,
    [companyId]
  )[0]?.count ?? 0;
  const metersByType = db.query<any>(
    `SELECT utility_type AS type, COUNT(*) AS count
     FROM facility_utility_meters WHERE company_id = ? AND is_active = 1
     GROUP BY utility_type`,
    [companyId]
  );
  const pendingBills = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_utility_bills fub
     JOIN facility_utility_meters um ON um.id = fub.meter_id
     WHERE um.company_id = ? AND fub.status = 'PENDING'`,
    [companyId]
  )[0]?.count ?? 0;
  const overdueBills = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_utility_bills fub
     JOIN facility_utility_meters um ON um.id = fub.meter_id
     WHERE um.company_id = ? AND fub.status IN ('PENDING', 'PARTIAL')
       AND fub.due_date < ?`,
    [companyId, today]
  )[0]?.count ?? 0;
  const totalAmountDue = db.query<{ total: number }>(
    `SELECT COALESCE(SUM(amount_due), 0) AS total FROM facility_utility_bills fub
     JOIN facility_utility_meters um ON um.id = fub.meter_id
     WHERE um.company_id = ?`,
    [companyId]
  )[0]?.total ?? 0;
  const totalAmountPaid = db.query<{ total: number }>(
    `SELECT COALESCE(SUM(amount_paid), 0) AS total FROM facility_utility_bills fub
     JOIN facility_utility_meters um ON um.id = fub.meter_id
     WHERE um.company_id = ?`,
    [companyId]
  )[0]?.total ?? 0;
  const openOutages = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM facility_utility_outages uo
     JOIN facility_utility_meters um ON um.id = uo.meter_id
     WHERE um.company_id = ? AND uo.status = 'OPEN'`,
    [companyId]
  )[0]?.count ?? 0;
  const monthlyConsumptionByType = db.query<any>(
    `SELECT um.utility_type AS type,
            substr(ur.reading_date, 1, 7) AS month,
            SUM(ur.consumption) AS consumption, SUM(ur.cost) AS cost
     FROM facility_utility_readings ur
     JOIN facility_utility_meters um ON um.id = ur.meter_id
     WHERE um.company_id = ?
     GROUP BY um.utility_type, substr(ur.reading_date, 1, 7)
     ORDER BY month DESC, um.utility_type
     LIMIT 24`,
    [companyId]
  );
  const topConsumingBranches = db.query<any>(
    `SELECT b.id AS branchId, b.name AS branchName,
            SUM(ur.cost) AS totalCost
     FROM facility_utility_readings ur
     JOIN facility_utility_meters um ON um.id = ur.meter_id
     JOIN branches b ON b.id = um.branch_id
     WHERE um.company_id = ?
     GROUP BY b.id
     ORDER BY totalCost DESC
     LIMIT 10`,
    [companyId]
  );
  return {
    totalMeters: Number(totalMeters),
    activeMeters: Number(activeMeters),
    metersByType: metersByType.map((row) => ({ type: row.type, count: Number(row.count) })),
    pendingBills: Number(pendingBills),
    overdueBills: Number(overdueBills),
    totalAmountDue: roundNumber(Number(totalAmountDue)),
    totalAmountPaid: roundNumber(Number(totalAmountPaid)),
    openOutages: Number(openOutages),
    monthlyConsumptionByType: monthlyConsumptionByType.map((row) => ({
      type: row.type, month: row.month,
      consumption: roundNumber(Number(row.consumption) || 0),
      cost: roundNumber(Number(row.cost) || 0),
    })),
    topConsumingBranches: topConsumingBranches.map((row) => ({
      branchId: row.branchId, branchName: row.branchName,
      totalCost: roundNumber(Number(row.totalCost) || 0),
    })),
  };
}
