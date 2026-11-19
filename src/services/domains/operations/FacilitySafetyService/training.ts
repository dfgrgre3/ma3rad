import { v4 as uuidv4 } from 'uuid';
import { localDateString, addLocalDays } from '../../../../utils/shared/date';
import type { SafetyContext } from './context';
import { isValidDate } from './helpers';
import type {
  AttendanceStatus,
  SafetyTraining,
  SafetyTrainingAttendee,
  SafetyTrainingInput,
  TrainingStatus,
  TrainingType,
} from './types';

/* ========== Safety Training ========== */

export function getSafetyTraining(ctx: SafetyContext): SafetyTraining[] {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('st.branch_id', undefined, actor);
  const _today = localDateString();
  const _inThirtyDays = localDateString(addLocalDays(new Date(), 30));
  const rows = ctx.db.query<any>(
    `SELECT st.id, st.training_code AS trainingCode, st.training_name AS trainingName,
            st.training_type AS trainingType, st.trainer_name AS trainerName,
            st.training_date AS trainingDate, st.duration_hours AS durationHours,
            st.location_id AS locationId, fl.name AS locationName,
            st.branch_id AS branchId, b.name AS branchName,
            st.certificate_number AS certificateNumber,
            st.certificate_expiry_date AS certificateExpiryDate, st.status,
            COUNT(sta.id) AS attendeeCount,
            st.created_by AS createdBy, u.full_name AS createdByName,
            st.created_at AS createdAt, st.updated_at AS updatedAt
     FROM facility_safety_training st
     LEFT JOIN facility_locations fl ON fl.id = st.location_id
     JOIN branches b ON b.id = st.branch_id
     LEFT JOIN facility_safety_training_attendees sta ON sta.training_id = st.id
     LEFT JOIN users u ON u.id = st.created_by
     WHERE st.company_id = ? AND ${scope.clause}
     GROUP BY st.id
     ORDER BY st.training_date DESC`,
    [companyId, ...scope.params]
  );
  return rows.map((row) => ({
    ...row,
    trainingType: row.training_type as TrainingType,
    status: row.status as TrainingStatus,
    attendeeCount: Number(row.attendeeCount) || 0,
    createdByName: row.created_by_name || null,
    locationName: row.location_name || null,
  }));
}

export function createSafetyTraining(ctx: SafetyContext, input: SafetyTrainingInput): SafetyTraining {
  const actor = ctx.requireManage();
  const companyId = ctx.currentCompanyId(actor);
  if (!input.trainingName?.trim()) throw new Error('اسم التدريب مطلوب.');
  if (!isValidDate(input.trainingDate)) throw new Error('تاريخ التدريب غير صالح.');
  const trainingCode = `TRN-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const id = `trn_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  ctx.db.run(
    `INSERT INTO facility_safety_training
       (id, training_code, training_name, training_type, trainer_name,
        training_date, duration_hours, location_id, branch_id,
        certificate_number, certificate_expiry_date, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, trainingCode, input.trainingName.trim(), input.trainingType,
      input.trainerName || null, input.trainingDate,
      input.durationHours ?? 0, input.locationId || null,
      companyId, input.certificateNumber || null,
      input.certificateExpiryDate || null, input.status ?? 'SCHEDULED', actor.id]
  );
  ctx.auditActor(actor, 'إضافة تدريب سلامة', id, {
    trainingCode, trainingName: input.trainingName, trainingType: input.trainingType,
  });
  return getSafetyTrainingItem(ctx, id)!;
}

function getSafetyTrainingItem(ctx: SafetyContext, id: string): SafetyTraining | null {
  const trainings = getSafetyTraining(ctx).filter((t) => t.id === id);
  return trainings[0] ?? null;
}

export function addTrainingAttendee(
  ctx: SafetyContext,
  trainingId: string,
  input: {
    employeeId: string;
    attendanceStatus: AttendanceStatus;
    testScore?: number | null;
    certificateIssued?: boolean;
    notes?: string | null;
  }
): SafetyTrainingAttendee {
  const actor = ctx.requireManage();
  const companyId = ctx.currentCompanyId(actor);
  const training = ctx.db.query<{ id: string }>(
    'SELECT id FROM facility_safety_training WHERE id = ? AND company_id = ?',
    [trainingId, companyId]
  )[0];
  if (!training) throw new Error('التدريب غير موجود.');
  const employee = ctx.db.query<{ id: string; name: string }>(
    'SELECT id, name FROM employees WHERE id = ?',
    [input.employeeId]
  )[0];
  if (!employee) throw new Error('الموظف غير موجود.');
  const id = `trna_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  ctx.db.run(
    `INSERT INTO facility_safety_training_attendees
       (id, training_id, employee_id, employee_name, attendance_status,
        test_score, certificate_issued, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, trainingId, input.employeeId, employee.name, input.attendanceStatus,
      input.testScore ?? null, input.certificateIssued ? 1 : 0, input.notes || null]
  );
  ctx.auditActor(actor, 'إضافة متدرب للتدريب', id, {
    trainingId, employeeId: input.employeeId, attendanceStatus: input.attendanceStatus,
  });
  return getTrainingAttendee(ctx, id)!;
}

function getTrainingAttendee(ctx: SafetyContext, id: string): SafetyTrainingAttendee | null {
  const attendees = getTrainingAttendees(ctx).filter((a) => a.id === id);
  return attendees[0] ?? null;
}

export function getTrainingAttendees(ctx: SafetyContext): SafetyTrainingAttendee[] {
  const actor = ctx.requireView();
  const companyId = ctx.currentCompanyId(actor);
  const scope = ctx.branchAccess.sqlScope('sta.branch_id', undefined, actor);
  return ctx.db.query<any>(
    `SELECT sta.id, sta.employee_id AS employeeId, e.name AS employeeName,
            sta.attendance_status AS attendanceStatus, sta.test_score AS testScore,
            sta.certificate_issued AS certificateIssued, sta.notes, sta.created_at AS createdAt
     FROM facility_safety_training_attendees sta
     JOIN employees e ON e.id = sta.employee_id
     JOIN facility_safety_training st ON st.id = sta.training_id
     WHERE st.company_id = ? AND ${scope.clause}
     ORDER BY sta.created_at DESC`,
    [companyId, ...scope.params]
  ).map((row) => ({
    ...row,
    attendanceStatus: row.attendance_status as AttendanceStatus,
    certificateIssued: Boolean(row.certificate_issued),
  }));
}
