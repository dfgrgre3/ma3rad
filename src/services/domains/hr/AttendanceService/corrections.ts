import { v4 as uuidv4 } from 'uuid';
import type {
  AttendanceAuditEntry,
  AttendanceCorrection,
  AttendanceCorrectionHistory,
  AttendanceDeps,
  AttendanceSnapshot,
} from './types';
import { snapshot } from './utils';
import {
  employeeDataScope,
  requireApproval,
  requireEmployeeBranch,
  requireView,
} from './context';
import {
  assertPeriodEditable,
  getAttendanceRow,
  getShift,
  recalculate,
  recordAudit,
} from './core';
import { validateSnapshot } from './punches';

export function getCorrectionRequests(deps: AttendanceDeps): AttendanceCorrection[] {
  const { db } = deps;
  const actor = requireView();
  const scope = employeeDataScope(deps, actor);
  return db.query<AttendanceCorrection>(
    `SELECT r.id, r.employee_id AS employeeId, e.name AS employeeName,
            r.attendance_date AS attendanceDate, r.before_json AS beforeJson,
            r.proposed_json AS proposedJson, u.full_name AS requestedByName,
            r.requested_at AS requestedAt
     FROM attendance_correction_requests r
     JOIN employees e ON e.id = r.employee_id
     JOIN users u ON u.id = r.requested_by
     WHERE r.status = 'PENDING' AND ${scope.clause}
     ORDER BY r.requested_at`,
    scope.params
  );
}

export async function getCorrectionRequestsAsync(deps: AttendanceDeps): Promise<AttendanceCorrection[]> {
  const { db } = deps;
  const actor = requireView();
  const scope = employeeDataScope(deps, actor);
  return db.queryAsync<AttendanceCorrection>(
    `SELECT r.id, r.employee_id AS employeeId, e.name AS employeeName,
            r.attendance_date AS attendanceDate, r.before_json AS beforeJson,
            r.proposed_json AS proposedJson, u.full_name AS requestedByName,
            r.requested_at AS requestedAt
     FROM attendance_correction_requests r
     JOIN employees e ON e.id = r.employee_id
     JOIN users u ON u.id = r.requested_by
     WHERE r.status = 'PENDING' AND ${scope.clause}
     ORDER BY r.requested_at`,
    scope.params
  );
}

export function getCorrectionHistory(deps: AttendanceDeps, period: string): AttendanceCorrectionHistory[] {
  const { db } = deps;
  const actor = requireView();
  const scope = employeeDataScope(deps, actor);
  return db.query<AttendanceCorrectionHistory>(
    `SELECT r.id, r.employee_id AS employeeId, e.name AS employeeName,
            r.attendance_date AS attendanceDate, r.before_json AS beforeJson,
            r.proposed_json AS proposedJson, requester.full_name AS requestedByName,
            r.requested_at AS requestedAt, r.status,
            decider.full_name AS decidedByName, r.decided_at AS decidedAt,
            r.decision_notes AS decisionNotes
     FROM attendance_correction_requests r
     JOIN employees e ON e.id = r.employee_id
     JOIN users requester ON requester.id = r.requested_by
     LEFT JOIN users decider ON decider.id = r.decided_by
     WHERE r.status != 'PENDING' AND substr(r.attendance_date, 1, 7) = ?
       AND ${scope.clause}
     ORDER BY r.decided_at DESC LIMIT 200`,
    [period, ...scope.params]
  );
}

export async function getCorrectionHistoryAsync(deps: AttendanceDeps, period: string): Promise<AttendanceCorrectionHistory[]> {
  const { db } = deps;
  const actor = requireView();
  const scope = employeeDataScope(deps, actor);
  return db.queryAsync<AttendanceCorrectionHistory>(
    `SELECT r.id, r.employee_id AS employeeId, e.name AS employeeName,
            r.attendance_date AS attendanceDate, r.before_json AS beforeJson,
            r.proposed_json AS proposedJson, requester.full_name AS requestedByName,
            r.requested_at AS requestedAt, r.status,
            decider.full_name AS decidedByName, r.decided_at AS decidedAt,
            r.decision_notes AS decisionNotes
     FROM attendance_correction_requests r
     JOIN employees e ON e.id = r.employee_id
     JOIN users requester ON requester.id = r.requested_by
     LEFT JOIN users decider ON decider.id = r.decided_by
     WHERE r.status != 'PENDING' AND substr(r.attendance_date, 1, 7) = ?
       AND ${scope.clause}
     ORDER BY r.decided_at DESC LIMIT 200`,
    [period, ...scope.params]
  );
}

export function getAuditHistory(deps: AttendanceDeps, period: string): AttendanceAuditEntry[] {
  const { db } = deps;
  const actor = requireView();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('صيغة الشهر غير صحيحة (YYYY-MM).');
  const scope = employeeDataScope(deps, actor);
  return db.query<AttendanceAuditEntry>(
    `SELECT l.id, e.name AS employeeName, l.attendance_date AS date,
            l.action, l.before_json AS beforeJson, l.after_json AS afterJson,
            u.full_name AS actorName, l.created_at AS createdAt
     FROM attendance_audit_log l JOIN employees e ON e.id = l.employee_id
     JOIN users u ON u.id = l.actor_id
     WHERE substr(l.attendance_date, 1, 7) = ? AND ${scope.clause}
     ORDER BY l.created_at DESC LIMIT 200`,
    [period, ...scope.params]
  );
}

export async function getAuditHistoryAsync(deps: AttendanceDeps, period: string): Promise<AttendanceAuditEntry[]> {
  const { db } = deps;
  const actor = requireView();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('صيغة الشهر غير صحيحة (YYYY-MM).');
  const scope = employeeDataScope(deps, actor);
  return db.queryAsync<AttendanceAuditEntry>(
    `SELECT l.id, e.name AS employeeName, l.attendance_date AS date,
            l.action, l.before_json AS beforeJson, l.after_json AS afterJson,
            u.full_name AS actorName, l.created_at AS createdAt
     FROM attendance_audit_log l JOIN employees e ON e.id = l.employee_id
     JOIN users u ON u.id = l.actor_id
     WHERE substr(l.attendance_date, 1, 7) = ? AND ${scope.clause}
     ORDER BY l.created_at DESC LIMIT 200`,
    [period, ...scope.params]
  );
}

export function decideCorrection(deps: AttendanceDeps, id: string, approve: boolean, notes = ''): void {
  const { db } = deps;
  const actor = requireApproval();
  const request = db.query<any>(
    `SELECT r.id, r.attendance_id AS attendanceId, r.employee_id AS employeeId,
            r.attendance_date AS attendanceDate, r.before_json AS beforeJson,
            r.proposed_json AS proposedJson, r.requested_by AS requestedBy,
            r.status, e.branch_id AS branchId
     FROM attendance_correction_requests r
     JOIN employees e ON e.id = r.employee_id
     WHERE r.id = ? AND r.status = 'PENDING'`,
    [id]
  )[0];
  if (!request) throw new Error('طلب تصحيح الحضور غير موجود أو سبق البت فيه.');
  requireEmployeeBranch(deps, request.employeeId, actor);
  assertPeriodEditable(db, request.branchId, request.attendanceDate);
  const current = getAttendanceRow(db, request.employeeId, request.attendanceDate);
  const before = request.beforeJson ? JSON.parse(request.beforeJson) as AttendanceSnapshot : null;
  const proposed = JSON.parse(request.proposedJson) as AttendanceSnapshot;
  if (approve && before && (!current || JSON.stringify(snapshot(current)) !== JSON.stringify(before))) {
    throw new Error('تغير سجل الحضور بعد إنشاء طلب التصحيح؛ أعد تقديم الطلب بالبيانات الحالية.');
  }
  if (approve && !before && current) throw new Error('أُنشئ سجل لهذا اليوم بعد طلب التصحيح؛ راجع السجل وأعد تقديم الطلب.');
  validateSnapshot(proposed, request.attendanceDate);
  if (approve && current && proposed.checkOutAt && db.query(
    'SELECT id FROM attendance_breaks WHERE attendance_id = ? AND ended_at IS NULL',
    [current.id]
  ).length) throw new Error('أنه الاستراحة المفتوحة قبل اعتماد الانصراف.');
  db.executeTransaction((txnDb) => {
    const currentRow = current;
    let attendanceId = currentRow?.id ?? null;
    if (approve) {
      if (!attendanceId) {
        attendanceId = `att_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
        txnDb.run(
          `INSERT INTO attendance (id, employee_id, date, status, source, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [attendanceId, request.employeeId, request.attendanceDate, proposed.status, proposed.source, request.requestedBy]
        );
      }
      txnDb.run(
        `UPDATE attendance SET status = ?, check_in_at = ?, check_out_at = ?, source = ?,
         late_minutes = ?, overtime_minutes = ?, overtime_approved = 0,
         overtime_approved_by = NULL, overtime_approved_at = NULL,
         notes = ?, recorded_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [proposed.status, proposed.checkInAt, proposed.checkOutAt, proposed.source,
          proposed.lateMinutes, proposed.overtimeMinutes, proposed.notes || null,
          request.requestedBy, attendanceId]
      );
      const updated = getAttendanceRow(txnDb, request.employeeId, request.attendanceDate)!;
      const calculated = recalculate(txnDb, updated, getShift(txnDb, request.employeeId, request.attendanceDate));
      recordAudit(txnDb, attendanceId, request.employeeId, request.attendanceDate,
        'CORRECTION_APPROVED', currentRow ? snapshot(currentRow) : null, calculated, actor.id);
    }
    txnDb.run(
      `UPDATE attendance_correction_requests
       SET status = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, decision_notes = ?
       WHERE id = ? AND status = 'PENDING'`,
      [approve ? 'APPROVED' : 'REJECTED', actor.id, notes || null, id]
    );
  });
}

export function approveOvertime(deps: AttendanceDeps, attendanceId: string): void {
  const { db } = deps;
  const actor = requireApproval();
  const row = db.query<any>(
    `SELECT a.id, a.employee_id AS employeeId, a.date, a.check_out_at AS checkOutAt,
            a.overtime_minutes AS overtimeMinutes, a.overtime_approved AS overtimeApproved,
            e.branch_id AS branchId FROM attendance a
     JOIN employees e ON e.id = a.employee_id WHERE a.id = ?`,
    [attendanceId]
  )[0];
  if (!row) throw new Error('سجل الحضور غير موجود.');
  requireEmployeeBranch(deps, row.employeeId, actor);
  assertPeriodEditable(db, row.branchId, row.date);
  if (!row.checkOutAt || Number(row.overtimeMinutes) <= 0) throw new Error('لا توجد ساعات إضافية مكتملة لاعتمادها.');
  if (row.overtimeApproved) throw new Error('تم اعتماد العمل الإضافي لهذا السجل بالفعل.');
  if (db.query(
    `SELECT id FROM attendance_correction_requests
     WHERE employee_id = ? AND attendance_date = ? AND status = 'PENDING'`,
    [row.employeeId, row.date]
  ).length) throw new Error('يوجد تصحيح حضور معلق؛ اعتمده أو ارفضه قبل اعتماد الإضافي.');
  db.executeTransaction((txnDb) => {
    txnDb.run(
      `UPDATE attendance SET overtime_approved = 1, overtime_approved_by = ?,
       overtime_approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [actor.id, attendanceId]
    );
    txnDb.run(
      `UPDATE employee_attendance_periods SET overtime_approved = 1,
         overtime_approved_by = ?, overtime_approved_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE employee_id = ? AND attendance_date = ? AND check_out_at IS NOT NULL
         AND overtime_minutes > 0 AND overtime_approved = 0`,
      [actor.id, row.employeeId, row.date]
    );
    const after = getAttendanceRow(txnDb, row.employeeId, row.date)!;
    recordAudit(txnDb, attendanceId, row.employeeId, row.date, 'OVERTIME_APPROVED', row, after, actor.id);
  });
}
