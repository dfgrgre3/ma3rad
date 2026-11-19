import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import type { AttendanceStatus } from '../EmployeeService';
import type {
  AttendanceDeps,
  AttendanceEntry,
  AttendanceSaveResult,
  AttendanceSnapshot,
} from './types';
import {
  dateOffset,
  isValidDate,
  isValidTime,
  localNow,
  snapshot,
  timeMinutes,
  toLocalDateTime,
  VALID_STATUSES,
} from './utils';
import {
  requireEmployeeBranch,
  requireManage,
} from './context';
import {
  assertPeriodEditable,
  getAttendanceRow,
  getShift,
  recalculate,
  recordAudit,
} from './core';

export function validateSnapshot(value: AttendanceSnapshot, date: string): void {
  for (const [label, dateTime] of [['الدخول', value.checkInAt], ['الانصراف', value.checkOutAt]] as const) {
    if (!dateTime) continue;
    const [entryDate, time] = dateTime.split('T');
    if (!isValidDate(entryDate) || !isValidTime(time?.slice(0, 5))) {
      throw new Error(`وقت ${label} غير صالح.`);
    }
    if (entryDate < date || entryDate > dateOffset(date, 1)) {
      throw new Error(`وقت ${label} يجب أن يكون في يوم الحضور أو اليوم التالي للوردية الليلية.`);
    }
  }
  if (value.checkInAt && value.checkOutAt && Date.parse(value.checkOutAt) <= Date.parse(value.checkInAt)) {
    throw new Error('يجب أن يكون وقت الانصراف بعد وقت الدخول.');
  }
}

function requestCorrection(
  deps: AttendanceDeps,
  employeeId: string,
  date: string,
  proposed: AttendanceSnapshot,
  actorId: string
): string {
  const { db } = deps;
  const existing = getAttendanceRow(db, employeeId, date);
  const before = existing ? snapshot(existing) : null;
  const pending = db.query<{ id: string }>(
    `SELECT id FROM attendance_correction_requests
     WHERE employee_id = ? AND attendance_date = ? AND status = 'PENDING'`,
    [employeeId, date]
  )[0];
  if (pending) throw new Error('يوجد طلب تصحيح معلق لهذا السجل بالفعل.');
  const id = `attreq_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO attendance_correction_requests
     (id, attendance_id, employee_id, attendance_date, before_json, proposed_json, requested_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, existing?.id ?? null, employeeId, date,
      before ? JSON.stringify(before) : null, JSON.stringify(proposed), actorId]
  );
  return id;
}

export function punch(
  deps: AttendanceDeps,
  employeeId: string,
  direction: 'IN' | 'OUT'
): AttendanceEntry {
  const { db } = deps;
  const actor = requireManage();
  const now = localNow();
  const date = now.slice(0, 10);
  const branchId = requireEmployeeBranch(deps, employeeId, actor);
  const existing = direction === 'IN'
    ? getAttendanceRow(db, employeeId, date)
    : db.query<{ id: string; date: string; checkInAt: string }>(
      `SELECT id, date, check_in_at AS checkInAt FROM attendance
       WHERE employee_id = ? AND date BETWEEN ? AND ?
         AND check_in_at IS NOT NULL AND check_out_at IS NULL
       ORDER BY date DESC LIMIT 1`,
      [employeeId, dateOffset(date, -1), date]
    ).map((candidate) => getAttendanceRow(db, employeeId, candidate.date))[0];
  if (direction === 'OUT' && !existing?.checkInAt) throw new Error('يجب تسجيل الدخول قبل تسجيل الانصراف.');
  const attendanceDate = existing?.date ?? date;
  assertPeriodEditable(db, branchId, attendanceDate);
  if (direction === 'IN' && existing?.checkInAt) throw new Error('تم تسجيل وقت الدخول لهذا اليوم بالفعل.');
  if (direction === 'OUT' && existing?.checkOutAt) throw new Error('تم تسجيل وقت الانصراف لهذا اليوم بالفعل.');
  if (existing?.status === 'ABSENT' || existing?.status === 'LEAVE') {
    throw new Error('سجل اليوم بحالة غياب أو إجازة؛ أرسل طلب تصحيح أولاً.');
  }
  if (direction === 'OUT' && Date.parse(now) - Date.parse(existing!.checkInAt!) > 36 * 60 * 60 * 1000) {
    throw new Error('وقت الدخول أقدم من الحد المسموح؛ أنشئ طلب تصحيح يدويًا.');
  }
  if (existing && direction === 'OUT' && db.query(
    'SELECT id FROM attendance_breaks WHERE attendance_id = ? AND ended_at IS NULL',
    [existing.id]
  ).length) {
    throw new Error('أنه الاستراحة المفتوحة قبل تسجيل الانصراف.');
  }

  let attendanceId = existing?.id;
  db.executeTransaction((txnDb) => {
    if (!attendanceId) {
      attendanceId = `att_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
      txnDb.run(
        `INSERT INTO attendance (id, employee_id, date, status, source, recorded_by)
         VALUES (?, ?, ?, 'PRESENT', 'PUNCH', ?)`,
        [attendanceId, employeeId, date, actor.id]
      );
    }
    const before = getAttendanceRow(txnDb, employeeId, attendanceDate);
    txnDb.run(
      direction === 'IN'
        ? 'UPDATE attendance SET check_in_at = ?, recorded_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        : 'UPDATE attendance SET check_out_at = ?, recorded_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [now, actor.id, attendanceId]
    );
    const updated = getAttendanceRow(txnDb, employeeId, attendanceDate)!;
    const calculated = recalculate(txnDb, updated, getShift(txnDb, employeeId, attendanceDate));
    recordAudit(txnDb, attendanceId!, employeeId, attendanceDate, `PUNCH_${direction}`, before, calculated, actor.id);
  });
  return getAttendanceRow(db, employeeId, attendanceDate)!;
}

export function manageBreak(
  deps: AttendanceDeps,
  employeeId: string,
  action: 'START' | 'END'
): void {
  const { db } = deps;
  const actor = requireManage();
  const date = localDateString();
  const branchId = requireEmployeeBranch(deps, employeeId, actor);
  assertPeriodEditable(db, branchId, date);
  const row = getAttendanceRow(db, employeeId, date);
  if (!row?.checkInAt || row.checkOutAt) throw new Error('يجب أن يكون الموظف قد سجل الدخول ولم يسجل الانصراف.');
  const active = db.query<{ id: string }>(
    'SELECT id FROM attendance_breaks WHERE attendance_id = ? AND ended_at IS NULL',
    [row.id]
  )[0];
  if (action === 'START' && active) throw new Error('توجد استراحة مفتوحة بالفعل.');
  if (action === 'END' && !active) throw new Error('لا توجد استراحة مفتوحة لإنهائها.');
  const now = localNow();
  db.executeTransaction((txnDb) => {
    const before = getAttendanceRow(txnDb, employeeId, date)!;
    if (action === 'START') {
      txnDb.run(
        'INSERT INTO attendance_breaks (id, attendance_id, started_at, created_by) VALUES (?, ?, ?, ?)',
        [`brk_${uuidv4().replace(/-/g, '').slice(0, 16)}`, row.id, now, actor.id]
      );
    } else {
      txnDb.run('UPDATE attendance_breaks SET ended_at = ? WHERE id = ?', [now, active!.id]);
    }
    const updated = getAttendanceRow(txnDb, employeeId, date)!;
    const calculated = recalculate(txnDb, updated, getShift(txnDb, employeeId, date));
    recordAudit(txnDb, row.id, employeeId, date, `BREAK_${action}`, before, calculated, actor.id);
  });
}

export function saveManualRecord(
  deps: AttendanceDeps,
  data: {
    employeeId: string;
    date: string;
    status: AttendanceStatus;
    lateMinutes?: number;
    overtimeMinutes?: number;
    notes?: string;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    source?: 'MANUAL' | 'IMPORT';
  }
): AttendanceSaveResult {
  const { db } = deps;
  const actor = requireManage();
  if (!isValidDate(data.date)) throw new Error('تاريخ الحضور غير صالح.');
  if (data.date > localDateString()) throw new Error('لا يمكن تسجيل حضور بتاريخ مستقبلي.');
  if (!VALID_STATUSES.includes(data.status)) throw new Error('حالة الحضور غير صحيحة.');
  const lateMinutes = Number(data.lateMinutes ?? 0);
  const overtimeMinutes = Number(data.overtimeMinutes ?? 0);
  if (!Number.isInteger(lateMinutes) || lateMinutes < 0 || !Number.isInteger(overtimeMinutes) || overtimeMinutes < 0) {
    throw new Error('يجب أن تكون دقائق التأخير والعمل الإضافي أعداداً صحيحة غير سالبة.');
  }
  const branchId = requireEmployeeBranch(deps, data.employeeId, actor);
  assertPeriodEditable(db, branchId, data.date);
  const existing = getAttendanceRow(db, data.employeeId, data.date);
  const proposed: AttendanceSnapshot = {
    status: data.status,
    checkInAt: data.checkInAt || null,
    checkOutAt: data.checkOutAt || null,
    lateMinutes,
    overtimeMinutes,
    notes: data.notes ?? '',
    source: data.source ?? existing?.source ?? 'MANUAL',
  };
  validateSnapshot(proposed, data.date);
  if (existing || data.date < localDateString()) {
    requestCorrection(deps, data.employeeId, data.date, proposed, actor.id);
    return { pendingApproval: true, attendanceId: existing?.id ?? null };
  }

  const attendanceId = `att_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.executeTransaction((txnDb) => {
    txnDb.run(
      `INSERT INTO attendance
       (id, employee_id, date, status, check_in_at, check_out_at, late_minutes, overtime_minutes,
        overtime_approved, source, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [attendanceId, data.employeeId, data.date, proposed.status, proposed.checkInAt, proposed.checkOutAt,
        proposed.lateMinutes, proposed.overtimeMinutes, proposed.source, proposed.notes || null, actor.id]
    );
    const inserted = getAttendanceRow(txnDb, data.employeeId, data.date)!;
    const calculated = recalculate(txnDb, inserted, getShift(txnDb, data.employeeId, data.date));
    recordAudit(txnDb, attendanceId, data.employeeId, data.date, 'MANUAL_ENTRY', null, calculated, actor.id);
  });
  return { pendingApproval: false, attendanceId };
}

export function importPunches(
  deps: AttendanceDeps,
  rows: Array<{
    employeeCode: string;
    date: string;
    checkIn: string;
    checkOut: string;
  }>
): { imported: number; pendingApproval: number; errors: string[] } {
  const { db } = deps;
  const actor = requireManage();
  if (!rows.length) throw new Error('ملف الاستيراد لا يحتوي على سجلات.');
  const errors: string[] = [];
  let imported = 0;
  let pendingApproval = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const input = rows[index];
    try {
      const employee = db.query<{ id: string }>(
        'SELECT id FROM employees WHERE code = ?',
        [input.employeeCode.trim()]
      )[0];
      if (!employee) throw new Error(`كود الموظف غير موجود: ${input.employeeCode}`);
      const checkInAt = toLocalDateTime(input.date, input.checkIn);
      const checkoutDate = timeMinutes(input.checkOut) < timeMinutes(input.checkIn)
        ? dateOffset(input.date, 1) : input.date;
      const checkOutAt = toLocalDateTime(checkoutDate, input.checkOut);
      const saved = saveManualRecord(deps, {
        employeeId: employee.id, date: input.date,
        status: 'PRESENT', checkInAt, checkOutAt, source: 'IMPORT',
      });
      if (saved.pendingApproval) pendingApproval += 1;
      else imported += 1;
    } catch (error) {
      errors.push(`السطر ${index + 2}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  db.run(
    `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
     VALUES (?, ?, ?, 'Import attendance punches', 'HR', ?, ?)`,
    [`aud_${uuidv4().replace(/-/g, '').slice(0, 16)}`, actor.id, actor.fullName, localDateString(),
      JSON.stringify({ imported, pendingApproval, errors: errors.length })]
  );
  return { imported, pendingApproval, errors };
}
