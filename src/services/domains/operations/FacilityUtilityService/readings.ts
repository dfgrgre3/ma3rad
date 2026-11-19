import { v4 as uuidv4 } from 'uuid';
import {
  auditDB,
  branchAccess,
  currentCompanyId,
  db,
  isValidDate,
  requireManage,
  requireView,
  roundNumber,
} from './shared';
import type {
  UtilityReading,
  UtilityReadingInput,
} from './types';

export function getUtilityReadings(options: {
  meterId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): UtilityReading[] {
  const actor = requireView();
  const companyId = currentCompanyId(actor);
  const conditions: string[] = ['um.company_id = ?'];
  const params: (string | number)[] = [companyId];
  if (options.meterId) {
    conditions.push('ur.meter_id = ?');
    params.push(options.meterId);
  }
  if (options.from) {
    conditions.push('ur.reading_date >= ?');
    params.push(options.from);
  }
  if (options.to) {
    conditions.push('ur.reading_date <= ?');
    params.push(options.to);
  }
  const scope = branchAccess.sqlScope('um.branch_id', undefined, actor);
  conditions.push(scope.clause);
  params.push(...scope.params);
  const limit = options.limit ? `LIMIT ${Math.min(options.limit, 500)}` : '';

  const rows = db.query<any>(
    `SELECT ur.id, ur.meter_id AS meterId, um.meter_code AS meterCode,
            um.meter_name AS meterName, ur.reading_date AS readingDate,
            ur.reading_value AS readingValue, ur.previous_value AS previousValue,
            ur.consumption, ur.cost / 100.0 AS cost, ur.is_estimated AS isEstimated,
            ur.recorded_by AS recordedBy, u.full_name AS recordedByName,
            ur.recorded_at AS recordedAt, ur.notes
     FROM facility_utility_readings ur
     JOIN facility_utility_meters um ON um.id = ur.meter_id
     LEFT JOIN users u ON u.id = ur.recorded_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY ur.reading_date DESC ${limit}`,
    params
  );
  return rows.map((row) => ({
    ...row,
    isEstimated: Boolean(row.is_estimated),
  }));
}

export function createUtilityReading(input: UtilityReadingInput): UtilityReading {
  const actor = requireManage();
  const companyId = currentCompanyId(actor);
  const meter = db.query<{ id: string; meterCode: string; meterName: string; lastReadingValue: number; tariffPerUnit: number }>(
    `SELECT um.id, um.meter_code AS meterCode, um.meter_name AS meterName,
            um.last_reading_value AS lastReadingValue, um.tariff_per_unit / 100.0 AS tariffPerUnit
     FROM facility_utility_meters um
     WHERE um.id = ? AND um.company_id = ? AND um.is_active = 1`,
    [input.meterId, companyId]
  )[0];
  if (!meter) throw new Error('العداد غير موجود أو غير نشط.');
  if (!isValidDate(input.readingDate)) throw new Error('تاريخ القراءة غير صالح.');
  if (Number(input.readingValue) < 0) throw new Error('قيمة القراءة يجب أن تكون غير سالبة.');
  const existing = db.query<{ id: string }>(
    'SELECT id FROM facility_utility_readings WHERE meter_id = ? AND reading_date = ?',
    [input.meterId, input.readingDate]
  )[0];
  if (existing) throw new Error('يوجد قراءة مسجلة لهذا العداد في نفس التاريخ.');
  const previousValue = meter.lastReadingValue;
  const consumption = roundNumber(Math.max(0, Number(input.readingValue) - previousValue));
  const cost = roundNumber(consumption * meter.tariffPerUnit);
  const id = `ur_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.executeTransaction((dbTx) => {
    dbTx.run(
      `INSERT INTO facility_utility_readings
         (id, meter_id, reading_date, reading_value, previous_value, consumption,
          cost, is_estimated, recorded_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?)`,
      [id, input.meterId, input.readingDate, Number(input.readingValue),
        previousValue, consumption, cost, input.isEstimated ? 1 : 0, actor.id,
        input.notes || null]
    );
    dbTx.run(
      `UPDATE facility_utility_meters
       SET last_reading_date = ?, last_reading_value = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [input.readingDate, Number(input.readingValue), input.meterId]
    );
    auditDB(dbTx, actor, 'إضافة قراءة عداد', id, {
      meterId: input.meterId, readingValue: input.readingValue, consumption, cost,
    });
  });
  return getUtilityReading(id)!;
}

function getUtilityReading(id: string): UtilityReading | null {
  const readings = getUtilityReadings({ limit: 1000 }).filter((r) => r.id === id);
  return readings[0] ?? null;
}
