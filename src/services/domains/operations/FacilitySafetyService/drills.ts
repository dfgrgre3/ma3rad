import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import type { SafetyContext } from './context';
import { isValidDate } from './helpers';
import type {
  DrillResult,
  DrillType,
  EvacuationDrill,
  EvacuationDrillInput,
} from './types';

/* ========== Evacuation Drills ========== */

export function getEvacuationDrills(ctx: SafetyContext): EvacuationDrill[] {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('ed.branch_id', undefined, actor);
  const rows = ctx.db.query<any>(
    `SELECT ed.id, ed.drill_code AS drillCode, ed.location_id AS locationId,
            fl.name AS locationName, ed.branch_id AS branchId, b.name AS branchName,
            ed.drill_date AS drillDate, ed.drill_type AS drillType,
            ed.planned_evacuation_time_minutes AS plannedEvacuationTimeMinutes,
            ed.actual_evacuation_time_minutes AS actualEvacuationTimeMinutes,
            ed.participants_count AS participantsCount, ed.evacuated_count AS evacuatedCount,
            ed.result, ed.observations, ed.lessons_learned AS lessonsLearned,
            ed.improvements, ed.conducted_by AS conductedBy,
            u.full_name AS conductedByName, ed.created_at AS createdAt
     FROM facility_evacuation_drills ed
     JOIN facility_locations fl ON fl.id = ed.location_id
     JOIN branches b ON b.id = ed.branch_id
     LEFT JOIN users u ON u.id = ed.conducted_by
     WHERE ed.company_id = ? AND ${scope.clause}
     ORDER BY ed.drill_date DESC`,
    [companyId, ...scope.params]
  );
  return rows.map((row) => ({
    ...row,
    drillType: row.drill_type as DrillType,
    result: row.result as DrillResult,
    conductedByName: row.conducted_by_name || null,
  }));
}

export function createEvacuationDrill(ctx: SafetyContext, input: EvacuationDrillInput): EvacuationDrill {
  const actor = ctx.requireManage();
  const _companyId = ctx.currentCompanyId(actor);
  const location = ctx.db.query<{ id: string; name: string; branch_id: string }>(
    'SELECT id, name, branch_id AS branchId FROM facility_locations WHERE id = ?',
    [input.locationId]
  )[0];
  if (!location) throw new Error('الموقع غير موجود.');
  if (!isValidDate(input.drillDate)) throw new Error('تاريخ التدريب غير صالح.');
  const drillCode = `DRILL-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const id = `drill_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  ctx.db.run(
    `INSERT INTO facility_evacuation_drills
       (id, drill_code, location_id, branch_id, drill_date, drill_type,
        planned_evacuation_time_minutes, actual_evacuation_time_minutes,
        participants_count, evacuated_count, result, observations,
        lessons_learned, improvements, conducted_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, drillCode, input.locationId, location.branch_id, input.drillDate,
      input.drillType, input.plannedEvacuationTimeMinutes ?? 0,
      input.actualEvacuationTimeMinutes ?? 0, input.participantsCount ?? 0,
      input.evacuatedCount ?? 0, input.result, input.observations || null,
      input.lessonsLearned || null, input.improvements || null, actor.id]
  );
  ctx.auditActor(actor, 'إضافة تدريب إخلاء', id, {
    drillCode, drillType: input.drillType, result: input.result,
  });
  return getEvacuationDrill(ctx, id)!;
}

function getEvacuationDrill(ctx: SafetyContext, id: string): EvacuationDrill | null {
  const drills = getEvacuationDrills(ctx).filter((d) => d.id === id);
  return drills[0] ?? null;
}
