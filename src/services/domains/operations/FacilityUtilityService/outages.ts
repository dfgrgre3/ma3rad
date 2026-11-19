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
  OutageStatus,
  OutageType,
  UtilityOutage,
  UtilityOutageInput,
  UtilityType,
} from './types';

export function getUtilityOutages(options: {
  meterId?: string;
  status?: OutageStatus;
  from?: string;
  to?: string;
  limit?: number;
}): UtilityOutage[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const conditions: string[] = ['um.company_id = ?'];
  const params: (string | number)[] = [companyId];
  if (options.meterId) {
    conditions.push('uo.meter_id = ?');
    params.push(options.meterId);
  }
  if (options.status) {
    conditions.push('uo.status = ?');
    params.push(options.status);
  }
  if (options.from) {
    conditions.push('uo.outage_start >= ?');
    params.push(options.from);
  }
  if (options.to) {
    conditions.push('uo.outage_start <= ?');
    params.push(options.to);
  }
  const scope = branchAccess.sqlScope('um.branch_id', undefined, actor);
  conditions.push(scope.clause);
  params.push(...scope.params);

  const rows = db.query<any>(
    `SELECT uo.id, uo.meter_id AS meterId, um.meter_code AS meterCode,
            um.meter_name AS meterName, um.utility_type AS utilityType,
            uo.outage_type AS outageType, uo.outage_start AS outageStart,
            uo.outage_end AS outageEnd, uo.duration_minutes AS durationMinutes,
            uo.affected_areas AS affectedAreas, uo.cause,
            uo.reported_by AS reportedBy, r.full_name AS reportedByName,
            uo.reported_at AS reportedAt, uo.resolved_by AS resolvedBy,
            res.full_name AS resolvedByName, uo.resolved_at AS resolvedAt,
            uo.status, uo.notes
     FROM facility_utility_outages uo
     JOIN facility_utility_meters um ON um.id = uo.meter_id
     LEFT JOIN users r ON r.id = uo.reported_by
     LEFT JOIN users res ON res.id = uo.resolved_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY uo.outage_start DESC`,
    params
  );
  return rows.map((row) => ({
    ...row,
    utilityType: row.utility_type as UtilityType,
    outageType: row.outage_type as OutageType,
    status: row.status as OutageStatus,
    reportedByName: row.reported_by_name || null,
    resolvedByName: row.resolved_by_name || null,
  }));
}

export function createUtilityOutage(input: UtilityOutageInput): UtilityOutage {
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
  if (!isValidDate(input.outageStart)) throw new Error('تاريخ بدء الانقطاع غير صالح.');
  if (input.outageEnd && !isValidDate(input.outageEnd)) throw new Error('تاريخ نهاية الانقطاع غير صالح.');
  if (input.outageEnd && input.outageEnd < input.outageStart) {
    throw new Error('تاريخ نهاية الانقطاع يسبق تاريخ بدايته.');
  }
  const id = `uo_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  let durationMinutes = 0;
  if (input.outageEnd) {
    durationMinutes = Math.max(0, Math.round(
      (Date.parse(`${input.outageEnd}T00:00:00`) - Date.parse(`${input.outageStart}T00:00:00`)) / 60000
    ));
  }
  db.run(
    `INSERT INTO facility_utility_outages
       (id, meter_id, outage_type, outage_start, outage_end, duration_minutes,
        affected_areas, cause, reported_by, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
    [id, input.meterId, input.outageType, input.outageStart, input.outageEnd || null,
      durationMinutes, input.affectedAreas || null, input.cause || null,
      actor.id, input.notes || null]
  );
  auditActor(actor, 'تسجيل انقطاع مرافق', id, {
    meterId: input.meterId, outageType: input.outageType, durationMinutes,
  });
  return getUtilityOutage(id)!;
}

function getUtilityOutage(id: string): UtilityOutage | null {
  const outages = getUtilityOutages({ limit: 1000 }).filter((o) => o.id === id);
  return outages[0] ?? null;
}

export function resolveUtilityOutage(id: string, resolvedByNote?: string | null): UtilityOutage {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const outage = db.query<{ id: string; outageStart: string }>(
    `SELECT uo.id, uo.outage_start AS outageStart FROM facility_utility_outages uo
     JOIN facility_utility_meters um ON um.id = uo.meter_id
     WHERE uo.id = ? AND um.company_id = ?`,
    [id, companyId]
  )[0];
  if (!outage) throw new Error('سجل الانقطاع غير موجود.');
  const now = new Date().toISOString();
  const durationMinutes = Math.max(0, Math.round(
    (Date.parse(now) - Date.parse(`${outage.outageStart}T00:00:00`)) / 60000
  ));
  db.run(
    `UPDATE facility_utility_outages
     SET status = 'RESOLVED', resolved_by = ?, resolved_at = ?,
         duration_minutes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [actor.id, now, durationMinutes, id]
  );
  auditActor(actor, 'إنهاء انقطاع مرافق', id, { durationMinutes, note: resolvedByNote });
  return getUtilityOutage(id)!;
}
