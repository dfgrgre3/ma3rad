import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { localDateString } from '../../../utils/shared/date';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { EmployeeDepartmentAccessService } from '../auth/EmployeeDepartmentAccessService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import type { AttendanceStatus } from './EmployeeService';
import { AttendanceTimeService } from './AttendanceTimeService';

export interface AttendanceEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  branchId: string;
  date: string;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  breakMinutes: number;
  overtimeApproved: boolean;
  notes: string;
  source: string;
  recordedBy: string;
  activeBreak?: boolean;
}

export interface AttendanceShift {
  id: string;
  branchId: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  overtimeAfterMinutes: number;
  workdays: number[];
  isActive: boolean;
}

export interface AttendanceCorrection {
  id: string;
  employeeId: string;
  employeeName: string;
  attendanceDate: string;
  beforeJson: string | null;
  proposedJson: string;
  requestedByName: string;
  requestedAt: string;
}

export interface AttendanceCorrectionHistory extends AttendanceCorrection {
  status: 'APPROVED' | 'REJECTED';
  beforeJson: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
}

export interface AttendanceBreakEntry {
  id: string;
  attendanceId: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
}

export interface AttendanceAuditEntry {
  id: string;
  employeeName: string;
  date: string;
  action: string;
  beforeJson: string | null;
  afterJson: string | null;
  actorName: string;
  createdAt: string;
}

export interface AttendanceReportRow extends AttendanceEntry {
  shiftName: string | null;
}

export interface AttendanceSaveResult {
  pendingApproval: boolean;
  attendanceId: string | null;
}

export interface AttendanceEmployee {
  id: string;
  branchId: string;
  name: string;
  role: string;
  phone: string;
  status: string;
}

/**
 * An append-only attendance period. Unlike the daily `attendance` summary, an
 * employee can have several periods on the same day (double shift, replacement,
 * overtime after a break, ...).
 */
export interface AttendancePeriod {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  branchId: string;
  operationShiftId: string | null;
  shiftNumber: string | null;
  attendanceDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  status: 'OPEN' | 'CLOSED';
  source: string;
  notes: string | null;
}

interface AttendanceSnapshot {
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  notes: string;
  source: string;
}

interface ShiftRow extends Omit<AttendanceShift, 'workdays' | 'isActive'> {
  workdaysJson: string;
  isActive: number;
}

const VALID_STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'LEAVE'];

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toLocalDateTime(date: string, time: string): string {
  return `${date}T${time.length === 5 ? `${time}:00` : time}`;
}

function localNow(): string {
  const now = new Date();
  return `${localDateString(now)}T${now.toTimeString().slice(0, 8)}`;
}

function durationMinutes(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 60_000));
}

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateRangesOverlap(startA: string, endA: string | null, startB: string, endB: string | null): boolean {
  return startA <= (endB ?? '9999-12-31') && (endA ?? '9999-12-31') >= startB;
}

function timeMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

function snapshot(row: any): AttendanceSnapshot {
  return {
    status: row.status,
    checkInAt: row.checkInAt ?? null,
    checkOutAt: row.checkOutAt ?? null,
    lateMinutes: Number(row.lateMinutes) || 0,
    overtimeMinutes: Number(row.overtimeMinutes) || 0,
    notes: row.notes ?? '',
    source: row.source ?? 'MANUAL',
  };
}

export class AttendanceService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();
  private static departmentAccess = new EmployeeDepartmentAccessService();

  private static employeeDataScope(actor: ReturnType<typeof AuthService.requireAuth>) {
    const branch = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const department = this.departmentAccess.sqlScope('e.department_id', actor);
    return {
      clause: `(${branch.clause}) AND (${department.clause})`,
      params: [...branch.params, ...department.params],
    };
  }

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'employees.attendance.view', 'employees.attendance.manage', 'employees.attendance.approve',
    ]);
    return actor;
  }

  private static requireManage() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.require(actor, 'employees.attendance.manage');
    return actor;
  }

  private static requireApproval() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.require(actor, 'employees.attendance.approve');
    return actor;
  }

  private static requireEmployeeBranch(employeeId: string, actor: ReturnType<typeof AuthService.requireAuth>): string {
    const employee = this.db.query<{ branchId: string | null; departmentId: string | null }>(
      'SELECT branch_id AS branchId, department_id AS departmentId FROM employees WHERE id = ?',
      [employeeId]
    )[0];
    const branchId = employee?.branchId;
    if (!branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
    this.branchAccess.requireBranchAccess(branchId, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    const allowed = this.db.query(
      `SELECT 1 FROM employees e WHERE e.id = ? AND ${departmentScope.clause}`,
      [employeeId, ...departmentScope.params]
    ).length > 0;
    if (!allowed) throw new Error('الموظف خارج نطاق الأقسام المصرح بها.');
    return branchId;
  }

  static getEmployees(): AttendanceEmployee[] {
    const actor = this.requireView();
    const scope = this.employeeDataScope(actor);
    return this.db.query<AttendanceEmployee>(
      `SELECT e.id, e.branch_id AS branchId, e.name, e.role, e.phone, e.status
       FROM employees e WHERE e.status != 'SUSPENDED' AND ${scope.clause}
       ORDER BY e.name`,
      scope.params
    );
  }

  private static assertPeriodEditable(branchId: string, date: string): void {
    const run = this.db.query<{ status: string }>(
      'SELECT status FROM payroll_runs WHERE branch_id = ? AND period = ?',
      [branchId, date.slice(0, 7)]
    )[0];
    if (run && run.status !== 'DRAFT') {
      throw new Error('فترة الحضور مرتبطة بدورة رواتب معتمدة؛ لا يمكن تعديلها.');
    }
  }

  private static getShift(employeeId: string, date: string, db = this.db): ShiftRow | undefined {
    const shift = db.query<ShiftRow>(
      `SELECT s.id, s.branch_id AS branchId, s.name, s.start_time AS startTime,
              s.end_time AS endTime, s.break_minutes AS breakMinutes,
              s.grace_minutes AS graceMinutes, s.overtime_after_minutes AS overtimeAfterMinutes,
              s.workdays_json AS workdaysJson, s.is_active AS isActive
       FROM employee_shift_assignments a
       JOIN attendance_shifts s ON s.id = a.shift_id AND s.is_active = 1
       WHERE a.employee_id = ? AND a.effective_from <= ?
         AND (a.effective_to IS NULL OR a.effective_to >= ?)
       ORDER BY a.effective_from DESC LIMIT 1`,
      [employeeId, date, date]
    )[0];
    if (!shift) return undefined;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!(JSON.parse(shift.workdaysJson) as number[]).includes(weekday)) return undefined;
    if (db.query(
      'SELECT id FROM attendance_holidays WHERE branch_id = ? AND date = ? LIMIT 1',
      [shift.branchId, date]
    ).length) return undefined;
    return shift;
  }

  private static getAttendanceRow(employeeId: string, date: string, db = this.db): AttendanceEntry | undefined {
    const row = db.query<AttendanceEntry>(
      `SELECT a.id, a.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode,
              e.branch_id AS branchId, a.date, a.status, a.check_in_at AS checkInAt,
              a.check_out_at AS checkOutAt, a.worked_minutes AS workedMinutes,
              a.late_minutes AS lateMinutes, a.early_leave_minutes AS earlyLeaveMinutes,
              a.overtime_minutes AS overtimeMinutes, a.break_minutes AS breakMinutes,
              a.overtime_approved AS overtimeApproved, a.notes, a.source,
              a.recorded_by AS recordedBy,
              EXISTS (SELECT 1 FROM attendance_breaks b
                      WHERE b.attendance_id = a.id AND b.ended_at IS NULL) AS activeBreak
       FROM attendance a JOIN employees e ON e.id = a.employee_id
       WHERE a.employee_id = ? AND a.date = ?`,
      [employeeId, date]
    )[0];
    return row ? { ...row, overtimeApproved: Boolean(row.overtimeApproved), activeBreak: Boolean(row.activeBreak) } : undefined;
  }

  private static recordAudit(
    db: DatabaseManager,
    attendanceId: string | null,
    employeeId: string,
    date: string,
    action: string,
    before: unknown,
    after: unknown,
    actorId: string
  ): void {
    db.run(
      `INSERT INTO attendance_audit_log
       (id, attendance_id, employee_id, attendance_date, action, before_json, after_json, actor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `attlog_${uuidv4().replace(/-/g, '')}`, attendanceId, employeeId, date, action,
        before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), actorId,
      ]
    );
  }

  private static recalculate(db: DatabaseManager, row: AttendanceEntry, shift?: ShiftRow): AttendanceEntry {
    const breaks = db.query<{ startedAt: string; endedAt: string | null }>(
      'SELECT started_at AS startedAt, ended_at AS endedAt FROM attendance_breaks WHERE attendance_id = ?',
      [row.id]
    );
    const breakMinutes = breaks.reduce((total, item) => total + durationMinutes(item.startedAt, item.endedAt), 0);
    const workedMinutes = Math.max(0, durationMinutes(row.checkInAt, row.checkOutAt) - breakMinutes);
    let lateMinutes = Number(row.lateMinutes) || 0;
    let earlyLeaveMinutes = Number(row.earlyLeaveMinutes) || 0;
    let overtimeMinutes = Number(row.overtimeMinutes) || 0;

    if (shift && row.checkInAt) {
      const shiftStart = timeMinutes(shift.startTime);
      const checkInTime = timeMinutes(row.checkInAt.slice(11, 16));
      lateMinutes = Math.max(0, checkInTime - shiftStart - Number(shift.graceMinutes));
    }
    if (shift && row.checkOutAt) {
      const date = row.date;
      const start = timeMinutes(shift.startTime);
      const endRaw = timeMinutes(shift.endTime);
      const end = endRaw <= start ? endRaw + 1440 : endRaw;
      const checkOutDate = row.checkOutAt.slice(0, 10);
      const dayOffset = checkOutDate > date ? 1440 : 0;
      const checkOutTime = timeMinutes(row.checkOutAt.slice(11, 16)) + dayOffset;
      earlyLeaveMinutes = Math.max(0, end - checkOutTime);
      overtimeMinutes = Math.max(0, checkOutTime - end - Number(shift.overtimeAfterMinutes));
    }

    const status = shift && row.checkInAt && !['ABSENT', 'LEAVE'].includes(row.status)
      ? (lateMinutes > 0 ? 'LATE' : 'PRESENT')
      : row.status;
    const updated = {
      ...row, status: status as AttendanceStatus, workedMinutes, lateMinutes,
      earlyLeaveMinutes, overtimeMinutes, breakMinutes,
    };
    db.run(
      `UPDATE attendance SET status = ?, worked_minutes = ?, late_minutes = ?,
       early_leave_minutes = ?, overtime_minutes = ?, break_minutes = ?,
       overtime_approved = CASE WHEN overtime_minutes != ? THEN 0 ELSE overtime_approved END,
       overtime_approved_by = CASE WHEN overtime_minutes != ? THEN NULL ELSE overtime_approved_by END,
       overtime_approved_at = CASE WHEN overtime_minutes != ? THEN NULL ELSE overtime_approved_at END,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [updated.status, workedMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes,
       breakMinutes, overtimeMinutes, overtimeMinutes, overtimeMinutes, row.id]
    );
    return { ...updated, overtimeApproved: row.overtimeApproved && row.overtimeMinutes === overtimeMinutes };
  }

  static getAttendanceByDate(date: string): AttendanceEntry[] {
    const actor = this.requireView();
    if (!isValidDate(date)) throw new Error('تاريخ الحضور غير صالح.');
    const scope = this.employeeDataScope(actor);
    return this.db.query<AttendanceEntry>(
      `SELECT a.id, a.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode,
              e.branch_id AS branchId, a.date, a.status, a.check_in_at AS checkInAt,
              a.check_out_at AS checkOutAt, a.worked_minutes AS workedMinutes,
              a.late_minutes AS lateMinutes, a.early_leave_minutes AS earlyLeaveMinutes,
              a.overtime_minutes AS overtimeMinutes, a.break_minutes AS breakMinutes,
              a.overtime_approved AS overtimeApproved, a.notes, a.source,
              a.recorded_by AS recordedBy,
              EXISTS (SELECT 1 FROM attendance_breaks b
                      WHERE b.attendance_id = a.id AND b.ended_at IS NULL) AS activeBreak
       FROM attendance a JOIN employees e ON e.id = a.employee_id
       WHERE a.date = ? AND ${scope.clause} ORDER BY e.name`,
      [date, ...scope.params]
    ).map((row) => ({
      ...row, overtimeApproved: Boolean(row.overtimeApproved), activeBreak: Boolean(row.activeBreak),
    }));
  }

  static getMonthlyReport(period: string): AttendanceReportRow[] {
    const actor = this.requireView();
    return this.buildMonthlyReport(period, actor);
  }

  static getMonthlyReportForExport(period: string): AttendanceReportRow[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'employees.attendance.export');
    return this.buildMonthlyReport(period, actor);
  }

  private static buildMonthlyReport(
    period: string,
    actor: ReturnType<typeof AuthService.requireAuth>,
  ): AttendanceReportRow[] {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('صيغة الشهر غير صحيحة (YYYY-MM).');
    const scope = this.employeeDataScope(actor);
    return this.db.query<AttendanceReportRow>(
      `SELECT a.id, a.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode,
              e.branch_id AS branchId, a.date, a.status, a.check_in_at AS checkInAt,
              a.check_out_at AS checkOutAt, a.worked_minutes AS workedMinutes,
              a.late_minutes AS lateMinutes, a.early_leave_minutes AS earlyLeaveMinutes,
              a.overtime_minutes AS overtimeMinutes, a.break_minutes AS breakMinutes,
              a.overtime_approved AS overtimeApproved, a.notes, a.source,
              a.recorded_by AS recordedBy, s.name AS shiftName
       FROM attendance a JOIN employees e ON e.id = a.employee_id
       LEFT JOIN employee_shift_assignments sa
         ON sa.employee_id = e.id AND sa.effective_from <= a.date
         AND (sa.effective_to IS NULL OR sa.effective_to >= a.date)
       LEFT JOIN attendance_shifts s ON s.id = sa.shift_id
       WHERE substr(a.date, 1, 7) = ? AND ${scope.clause}
       ORDER BY a.date, e.name`,
      [period, ...scope.params]
    ).map((row) => ({ ...row, overtimeApproved: Boolean(row.overtimeApproved) }));
  }

  static punchIn(employeeId: string): AttendanceEntry {
    return this.punch(employeeId, 'IN');
  }

  static punchOut(employeeId: string): AttendanceEntry {
    return this.punch(employeeId, 'OUT');
  }

  private static punch(employeeId: string, direction: 'IN' | 'OUT'): AttendanceEntry {
    const actor = this.requireManage();
    const now = localNow();
    const date = now.slice(0, 10);
    const branchId = this.requireEmployeeBranch(employeeId, actor);
    const existing = direction === 'IN'
      ? this.getAttendanceRow(employeeId, date)
      : this.db.query<{ id: string; date: string; checkInAt: string }>(
        `SELECT id, date, check_in_at AS checkInAt FROM attendance
         WHERE employee_id = ? AND date BETWEEN ? AND ?
           AND check_in_at IS NOT NULL AND check_out_at IS NULL
         ORDER BY date DESC LIMIT 1`,
        [employeeId, dateOffset(date, -1), date]
      ).map((candidate) => this.getAttendanceRow(employeeId, candidate.date))[0];
    if (direction === 'OUT' && !existing?.checkInAt) throw new Error('يجب تسجيل الدخول قبل تسجيل الانصراف.');
    const attendanceDate = existing?.date ?? date;
    this.assertPeriodEditable(branchId, attendanceDate);
    if (direction === 'IN' && existing?.checkInAt) throw new Error('تم تسجيل وقت الدخول لهذا اليوم بالفعل.');
    if (direction === 'OUT' && existing?.checkOutAt) throw new Error('تم تسجيل وقت الانصراف لهذا اليوم بالفعل.');
    if (existing?.status === 'ABSENT' || existing?.status === 'LEAVE') {
      throw new Error('سجل اليوم بحالة غياب أو إجازة؛ أرسل طلب تصحيح أولاً.');
    }
    if (direction === 'OUT' && Date.parse(now) - Date.parse(existing!.checkInAt!) > 36 * 60 * 60 * 1000) {
      throw new Error('وقت الدخول أقدم من الحد المسموح؛ أنشئ طلب تصحيح يدويًا.');
    }
    if (existing && direction === 'OUT' && this.db.query(
      'SELECT id FROM attendance_breaks WHERE attendance_id = ? AND ended_at IS NULL',
      [existing.id]
    ).length) {
      throw new Error('أنه الاستراحة المفتوحة قبل تسجيل الانصراف.');
    }

    let attendanceId = existing?.id;
    this.db.executeTransaction((db) => {
      if (!attendanceId) {
        attendanceId = `att_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
        db.run(
          `INSERT INTO attendance (id, employee_id, date, status, source, recorded_by)
           VALUES (?, ?, ?, 'PRESENT', 'PUNCH', ?)`,
          [attendanceId, employeeId, date, actor.id]
        );
      }
      const before = this.getAttendanceRow(employeeId, attendanceDate, db);
      db.run(
        direction === 'IN'
          ? 'UPDATE attendance SET check_in_at = ?, recorded_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          : 'UPDATE attendance SET check_out_at = ?, recorded_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [now, actor.id, attendanceId]
      );
      const updated = this.getAttendanceRow(employeeId, attendanceDate, db)!;
      const calculated = this.recalculate(db, updated, this.getShift(employeeId, attendanceDate, db));
      this.recordAudit(db, attendanceId!, employeeId, attendanceDate, `PUNCH_${direction}`, before, calculated, actor.id);
    });
    return this.getAttendanceRow(employeeId, attendanceDate)!;
  }

  static startBreak(employeeId: string): void {
    this.manageBreak(employeeId, 'START');
  }

  static endBreak(employeeId: string): void {
    this.manageBreak(employeeId, 'END');
  }

  private static manageBreak(employeeId: string, action: 'START' | 'END'): void {
    const actor = this.requireManage();
    const date = localDateString();
    const branchId = this.requireEmployeeBranch(employeeId, actor);
    this.assertPeriodEditable(branchId, date);
    const row = this.getAttendanceRow(employeeId, date);
    if (!row?.checkInAt || row.checkOutAt) throw new Error('يجب أن يكون الموظف قد سجل الدخول ولم يسجل الانصراف.');
    const active = this.db.query<{ id: string }>(
      'SELECT id FROM attendance_breaks WHERE attendance_id = ? AND ended_at IS NULL',
      [row.id]
    )[0];
    if (action === 'START' && active) throw new Error('توجد استراحة مفتوحة بالفعل.');
    if (action === 'END' && !active) throw new Error('لا توجد استراحة مفتوحة لإنهائها.');
    const now = localNow();
    this.db.executeTransaction((db) => {
      const before = this.getAttendanceRow(employeeId, date, db)!;
      if (action === 'START') {
        db.run(
          'INSERT INTO attendance_breaks (id, attendance_id, started_at, created_by) VALUES (?, ?, ?, ?)',
          [`brk_${uuidv4().replace(/-/g, '').slice(0, 16)}`, row.id, now, actor.id]
        );
      } else {
        db.run('UPDATE attendance_breaks SET ended_at = ? WHERE id = ?', [now, active!.id]);
      }
      const updated = this.getAttendanceRow(employeeId, date, db)!;
      const calculated = this.recalculate(db, updated, this.getShift(employeeId, date, db));
      this.recordAudit(db, row.id, employeeId, date, `BREAK_${action}`, before, calculated, actor.id);
    });
  }

  static getBreaks(attendanceId: string): Array<{ id: string; startedAt: string; endedAt: string | null; minutes: number }> {
    const actor = this.requireView();
    const scope = this.employeeDataScope(actor);
    const breaks = this.db.query<{ id: string; startedAt: string; endedAt: string | null; employeeId: string; date: string }>(
      `SELECT b.id, b.started_at AS startedAt, b.ended_at AS endedAt,
              a.employee_id AS employeeId, a.date
       FROM attendance_breaks b
       JOIN attendance a ON a.id = b.attendance_id
       JOIN employees e ON e.id = a.employee_id
       WHERE b.attendance_id = ? AND ${scope.clause} ORDER BY b.started_at`,
      [attendanceId, ...scope.params]
    );
    return breaks.map((item) => ({
      id: item.id, startedAt: item.startedAt, endedAt: item.endedAt,
      minutes: durationMinutes(item.startedAt, item.endedAt),
    }));
  }

  static getBreaksByDate(date: string): AttendanceBreakEntry[] {
    const actor = this.requireView();
    const scope = this.employeeDataScope(actor);
    return this.db.query<AttendanceBreakEntry>(
      `SELECT b.id, b.attendance_id AS attendanceId, b.started_at AS startedAt,
              b.ended_at AS endedAt,
              CASE WHEN b.ended_at IS NULL THEN 0
                   ELSE MAX(0, CAST((julianday(b.ended_at) - julianday(b.started_at)) * 1440 AS INTEGER))
              END AS minutes
       FROM attendance_breaks b JOIN attendance a ON a.id = b.attendance_id
       JOIN employees e ON e.id = a.employee_id
       WHERE a.date = ? AND ${scope.clause}
       ORDER BY b.started_at`,
      [date, ...scope.params]
    );
  }

  static saveManualRecord(data: {
    employeeId: string;
    date: string;
    status: AttendanceStatus;
    lateMinutes?: number;
    overtimeMinutes?: number;
    notes?: string;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    source?: 'MANUAL' | 'IMPORT';
  }): AttendanceSaveResult {
    const actor = this.requireManage();
    if (!isValidDate(data.date)) throw new Error('تاريخ الحضور غير صالح.');
    if (data.date > localDateString()) throw new Error('لا يمكن تسجيل حضور بتاريخ مستقبلي.');
    if (!VALID_STATUSES.includes(data.status)) throw new Error('حالة الحضور غير صحيحة.');
    const lateMinutes = Number(data.lateMinutes ?? 0);
    const overtimeMinutes = Number(data.overtimeMinutes ?? 0);
    if (!Number.isInteger(lateMinutes) || lateMinutes < 0 || !Number.isInteger(overtimeMinutes) || overtimeMinutes < 0) {
      throw new Error('يجب أن تكون دقائق التأخير والعمل الإضافي أعداداً صحيحة غير سالبة.');
    }
    const branchId = this.requireEmployeeBranch(data.employeeId, actor);
    this.assertPeriodEditable(branchId, data.date);
    const existing = this.getAttendanceRow(data.employeeId, data.date);
    const proposed: AttendanceSnapshot = {
      status: data.status,
      checkInAt: data.checkInAt || null,
      checkOutAt: data.checkOutAt || null,
      lateMinutes,
      overtimeMinutes,
      notes: data.notes ?? '',
      source: data.source ?? existing?.source ?? 'MANUAL',
    };
    this.validateSnapshot(proposed, data.date);
    if (existing || data.date < localDateString()) {
      this.requestCorrection(data.employeeId, data.date, proposed, actor.id);
      return { pendingApproval: true, attendanceId: existing?.id ?? null };
    }

    const attendanceId = `att_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO attendance
         (id, employee_id, date, status, check_in_at, check_out_at, late_minutes, overtime_minutes,
          overtime_approved, source, notes, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [attendanceId, data.employeeId, data.date, proposed.status, proposed.checkInAt, proposed.checkOutAt,
          proposed.lateMinutes, proposed.overtimeMinutes, proposed.source, proposed.notes || null, actor.id]
      );
      const inserted = this.getAttendanceRow(data.employeeId, data.date, db)!;
      const calculated = this.recalculate(db, inserted, this.getShift(data.employeeId, data.date, db));
      this.recordAudit(db, attendanceId, data.employeeId, data.date, 'MANUAL_ENTRY', null, calculated, actor.id);
    });
    return { pendingApproval: false, attendanceId };
  }

  private static validateSnapshot(value: AttendanceSnapshot, date: string): void {
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

  private static requestCorrection(
    employeeId: string,
    date: string,
    proposed: AttendanceSnapshot,
    actorId: string
  ): string {
    const existing = this.getAttendanceRow(employeeId, date);
    const before = existing ? snapshot(existing) : null;
    const pending = this.db.query<{ id: string }>(
      `SELECT id FROM attendance_correction_requests
       WHERE employee_id = ? AND attendance_date = ? AND status = 'PENDING'`,
      [employeeId, date]
    )[0];
    if (pending) throw new Error('يوجد طلب تصحيح معلق لهذا السجل بالفعل.');
    const id = `attreq_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO attendance_correction_requests
       (id, attendance_id, employee_id, attendance_date, before_json, proposed_json, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, existing?.id ?? null, employeeId, date,
        before ? JSON.stringify(before) : null, JSON.stringify(proposed), actorId]
    );
    return id;
  }

  static getCorrectionRequests(): AttendanceCorrection[] {
    const actor = this.requireView();
    const scope = this.employeeDataScope(actor);
    return this.db.query<AttendanceCorrection>(
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

  static getCorrectionHistory(period: string): AttendanceCorrectionHistory[] {
    const actor = this.requireView();
    const scope = this.employeeDataScope(actor);
    return this.db.query<AttendanceCorrectionHistory>(
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

  static getAuditHistory(period: string): AttendanceAuditEntry[] {
    const actor = this.requireView();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('صيغة الشهر غير صحيحة (YYYY-MM).');
    const scope = this.employeeDataScope(actor);
    return this.db.query<AttendanceAuditEntry>(
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

  static decideCorrection(id: string, approve: boolean, notes = ''): void {
    const actor = this.requireApproval();
    const request = this.db.query<any>(
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
    this.requireEmployeeBranch(request.employeeId, actor);
    this.assertPeriodEditable(request.branchId, request.attendanceDate);
    const current = this.getAttendanceRow(request.employeeId, request.attendanceDate);
    const before = request.beforeJson ? JSON.parse(request.beforeJson) as AttendanceSnapshot : null;
    const proposed = JSON.parse(request.proposedJson) as AttendanceSnapshot;
    if (approve && before && (!current || JSON.stringify(snapshot(current)) !== JSON.stringify(before))) {
      throw new Error('تغير سجل الحضور بعد إنشاء طلب التصحيح؛ أعد تقديم الطلب بالبيانات الحالية.');
    }
    if (approve && !before && current) throw new Error('أُنشئ سجل لهذا اليوم بعد طلب التصحيح؛ راجع السجل وأعد تقديم الطلب.');
    this.validateSnapshot(proposed, request.attendanceDate);
    if (approve && current && proposed.checkOutAt && this.db.query(
      'SELECT id FROM attendance_breaks WHERE attendance_id = ? AND ended_at IS NULL',
      [current.id]
    ).length) throw new Error('أنه الاستراحة المفتوحة قبل اعتماد الانصراف.');
    this.db.executeTransaction((db) => {
      const currentRow = current;
      let attendanceId = currentRow?.id ?? null;
      if (approve) {
        if (!attendanceId) {
          attendanceId = `att_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
          db.run(
            `INSERT INTO attendance (id, employee_id, date, status, source, recorded_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [attendanceId, request.employeeId, request.attendanceDate, proposed.status, proposed.source, request.requestedBy]
          );
        }
        db.run(
          `UPDATE attendance SET status = ?, check_in_at = ?, check_out_at = ?, source = ?,
           late_minutes = ?, overtime_minutes = ?, overtime_approved = 0,
           overtime_approved_by = NULL, overtime_approved_at = NULL,
           notes = ?, recorded_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [proposed.status, proposed.checkInAt, proposed.checkOutAt, proposed.source,
            proposed.lateMinutes, proposed.overtimeMinutes, proposed.notes || null,
            request.requestedBy, attendanceId]
        );
        const updated = this.getAttendanceRow(request.employeeId, request.attendanceDate, db)!;
        const calculated = this.recalculate(db, updated, this.getShift(request.employeeId, request.attendanceDate, db));
        this.recordAudit(db, attendanceId, request.employeeId, request.attendanceDate,
          'CORRECTION_APPROVED', currentRow ? snapshot(currentRow) : null, calculated, actor.id);
      }
      db.run(
        `UPDATE attendance_correction_requests
         SET status = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, decision_notes = ?
         WHERE id = ? AND status = 'PENDING'`,
        [approve ? 'APPROVED' : 'REJECTED', actor.id, notes || null, id]
      );
    });
  }

  static approveOvertime(attendanceId: string): void {
    const actor = this.requireApproval();
    const row = this.db.query<any>(
      `SELECT a.id, a.employee_id AS employeeId, a.date, a.check_out_at AS checkOutAt,
              a.overtime_minutes AS overtimeMinutes, a.overtime_approved AS overtimeApproved,
              e.branch_id AS branchId FROM attendance a
       JOIN employees e ON e.id = a.employee_id WHERE a.id = ?`,
      [attendanceId]
    )[0];
    if (!row) throw new Error('سجل الحضور غير موجود.');
    this.requireEmployeeBranch(row.employeeId, actor);
    this.assertPeriodEditable(row.branchId, row.date);
    if (!row.checkOutAt || Number(row.overtimeMinutes) <= 0) throw new Error('لا توجد ساعات إضافية مكتملة لاعتمادها.');
    if (row.overtimeApproved) throw new Error('تم اعتماد العمل الإضافي لهذا السجل بالفعل.');
    if (this.db.query(
      `SELECT id FROM attendance_correction_requests
       WHERE employee_id = ? AND attendance_date = ? AND status = 'PENDING'`,
      [row.employeeId, row.date]
    ).length) throw new Error('يوجد تصحيح حضور معلق؛ اعتمده أو ارفضه قبل اعتماد الإضافي.');
    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE attendance SET overtime_approved = 1, overtime_approved_by = ?,
         overtime_approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [actor.id, attendanceId]
      );
      db.run(
        `UPDATE employee_attendance_periods SET overtime_approved = 1,
           overtime_approved_by = ?, overtime_approved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         WHERE employee_id = ? AND attendance_date = ? AND check_out_at IS NOT NULL
           AND overtime_minutes > 0 AND overtime_approved = 0`,
        [actor.id, row.employeeId, row.date]
      );
      const after = this.getAttendanceRow(row.employeeId, row.date, db)!;
      this.recordAudit(db, attendanceId, row.employeeId, row.date, 'OVERTIME_APPROVED', row, after, actor.id);
    });
  }

  static getShifts(): AttendanceShift[] {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('s.branch_id', undefined, actor);
    return this.db.query<ShiftRow>(
      `SELECT s.id, s.branch_id AS branchId, s.name, s.start_time AS startTime,
              s.end_time AS endTime, s.break_minutes AS breakMinutes,
              s.grace_minutes AS graceMinutes, s.overtime_after_minutes AS overtimeAfterMinutes,
              s.workdays_json AS workdaysJson, s.is_active AS isActive
       FROM attendance_shifts s WHERE ${scope.clause} ORDER BY s.name`,
      scope.params
    ).map((row) => ({
      id: row.id, branchId: row.branchId, name: row.name, startTime: row.startTime,
      endTime: row.endTime, breakMinutes: Number(row.breakMinutes),
      graceMinutes: Number(row.graceMinutes), overtimeAfterMinutes: Number(row.overtimeAfterMinutes),
      workdays: JSON.parse(row.workdaysJson) as number[], isActive: Boolean(row.isActive),
    }));
  }

  static saveShift(data: Omit<AttendanceShift, 'id' | 'branchId' | 'isActive'> & { id?: string }): AttendanceShift {
    const actor = this.requireManage();
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    if (!data.name.trim() || !isValidTime(data.startTime) || !isValidTime(data.endTime)) {
      throw new Error('اسم الوردية ووقتا البداية والنهاية حقول مطلوبة.');
    }
    for (const [label, value] of [
      ['مدة الاستراحة', data.breakMinutes], ['السماح بالتأخير', data.graceMinutes],
      ['مهلة الإضافي', data.overtimeAfterMinutes],
    ] as const) {
      if (!Number.isInteger(value) || value < 0 || value > 1440) throw new Error(`${label} غير صحيحة.`);
    }
    const workdays = [...new Set(data.workdays)].sort((a, b) => a - b);
    if (!workdays.length || workdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error('حدد يوم عمل أسبوعياً واحداً على الأقل.');
    }
    const id = data.id || `shift_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    if (data.id && this.db.query(
      'SELECT id FROM employee_shift_assignments WHERE shift_id = ? LIMIT 1',
      [data.id]
    ).length) {
      throw new Error('الوردية مستخدمة في جداول موظفين؛ أنشئ وردية جديدة للحفاظ على سجل الدوام السابق.');
    }
    this.db.run(
      `INSERT INTO attendance_shifts
       (id, branch_id, name, start_time, end_time, break_minutes, grace_minutes,
        overtime_after_minutes, workdays_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, start_time = excluded.start_time,
         end_time = excluded.end_time, break_minutes = excluded.break_minutes,
         grace_minutes = excluded.grace_minutes, overtime_after_minutes = excluded.overtime_after_minutes,
         workdays_json = excluded.workdays_json, updated_at = CURRENT_TIMESTAMP
       WHERE attendance_shifts.branch_id = excluded.branch_id`,
      [id, branchId, data.name.trim(), data.startTime, data.endTime, data.breakMinutes,
        data.graceMinutes, data.overtimeAfterMinutes, JSON.stringify(workdays), actor.id]
    );
    const saved = this.getShifts().find((shift) => shift.id === id);
    if (!saved) throw new Error('تعذر حفظ الوردية ضمن الفرع الحالي.');
    return saved;
  }

  static assignShift(employeeId: string, shiftId: string, from: string, to?: string): void {
    const actor = this.requireManage();
    if (!isValidDate(from) || (to && (!isValidDate(to) || to < from))) throw new Error('فترة تعيين الوردية غير صالحة.');
    const branchId = this.requireEmployeeBranch(employeeId, actor);
    const shift = this.db.query<{ branchId: string }>(
      'SELECT branch_id AS branchId FROM attendance_shifts WHERE id = ? AND is_active = 1',
      [shiftId]
    )[0];
    if (!shift || shift.branchId !== branchId) throw new Error('الوردية غير نشطة أو لا تتبع فرع الموظف.');
    const overlaps = this.db.query<{ id: string; effectiveFrom: string; effectiveTo: string | null }>(
      `SELECT id, effective_from AS effectiveFrom, effective_to AS effectiveTo
       FROM employee_shift_assignments WHERE employee_id = ?`,
      [employeeId]
    ).filter((row) => dateRangesOverlap(row.effectiveFrom, row.effectiveTo, from, to ?? null));
    const prior = overlaps.length === 1 && overlaps[0].effectiveFrom < from ? overlaps[0] : undefined;
    if (overlaps.length && !prior) throw new Error('توجد وردية أخرى متداخلة مع فترة التعيين.');
    this.assertDateRangeEditable(branchId, from, to ?? localDateString());
    if (prior) this.assertDateRangeEditable(branchId, prior.effectiveFrom, dateOffset(from, -1));
    this.db.executeTransaction((db) => {
      if (prior) {
        db.run('UPDATE employee_shift_assignments SET effective_to = ? WHERE id = ?', [dateOffset(from, -1), prior.id]);
      }
      db.run(
        `INSERT INTO employee_shift_assignments
         (id, employee_id, shift_id, effective_from, effective_to, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`assign_${uuidv4().replace(/-/g, '').slice(0, 16)}`, employeeId, shiftId, from, to ?? null, actor.id]
      );
    });
  }

  static getAssignments(): Array<{
    id: string; employeeId: string; employeeName: string; shiftId: string;
    shiftName: string; effectiveFrom: string; effectiveTo: string | null;
  }> {
    const actor = this.requireView();
    const scope = this.employeeDataScope(actor);
    return this.db.query(
      `SELECT a.id, a.employee_id AS employeeId, e.name AS employeeName,
              a.shift_id AS shiftId, s.name AS shiftName,
              a.effective_from AS effectiveFrom, a.effective_to AS effectiveTo
       FROM employee_shift_assignments a JOIN employees e ON e.id = a.employee_id
       JOIN attendance_shifts s ON s.id = a.shift_id
       WHERE ${scope.clause} ORDER BY e.name, a.effective_from DESC`,
      scope.params
    );
  }

  static addHoliday(date: string, name: string): void {
    const actor = this.requireManage();
    if (!isValidDate(date) || !name.trim()) throw new Error('تاريخ العطلة واسمها مطلوبان.');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    this.assertPeriodEditable(branchId, date);
    this.db.run(
      `INSERT INTO attendance_holidays (id, branch_id, date, name, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [`holiday_${uuidv4().replace(/-/g, '').slice(0, 16)}`, branchId, date, name.trim(), actor.id]
    );
  }

  static removeHoliday(id: string): void {
    const actor = this.requireManage();
    const holiday = this.db.query<{ branchId: string; date: string }>(
      'SELECT branch_id AS branchId, date FROM attendance_holidays WHERE id = ?',
      [id]
    )[0];
    if (!holiday) throw new Error('العطلة غير موجودة.');
    this.branchAccess.requireBranchAccess(holiday.branchId, actor);
    this.assertPeriodEditable(holiday.branchId, holiday.date);
    this.db.run('DELETE FROM attendance_holidays WHERE id = ?', [id]);
  }

  static getHolidays(period: string): Array<{ id: string; date: string; name: string }> {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('h.branch_id', undefined, actor);
    return this.db.query(
      `SELECT h.id, h.date, h.name FROM attendance_holidays h
       WHERE substr(h.date, 1, 7) = ? AND ${scope.clause} ORDER BY h.date`,
      [period, ...scope.params]
    );
  }

  private static assertDateRangeEditable(branchId: string, start: string, end: string): void {
    if (end < start) return;
    const currentMonth = localDateString().slice(0, 7);
    const endMonth = end.slice(0, 7) > currentMonth ? `${currentMonth}-31` : end;
    let month = start.slice(0, 7);
    while (`${month}-01` <= endMonth) {
      this.assertPeriodEditable(branchId, `${month}-01`);
      const [year, value] = month.split('-').map(Number);
      month = `${value === 12 ? year + 1 : year}-${String(value === 12 ? 1 : value + 1).padStart(2, '0')}`;
    }
  }

  static importPunches(rows: Array<{
    employeeCode: string;
    date: string;
    checkIn: string;
    checkOut: string;
  }>): { imported: number; pendingApproval: number; errors: string[] } {
    const actor = this.requireManage();
    if (!rows.length) throw new Error('ملف الاستيراد لا يحتوي على سجلات.');
    const errors: string[] = [];
    let imported = 0;
    let pendingApproval = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const input = rows[index];
      try {
        const employee = this.db.query<{ id: string }>(
          'SELECT id FROM employees WHERE code = ?',
          [input.employeeCode.trim()]
        )[0];
        if (!employee) throw new Error(`كود الموظف غير موجود: ${input.employeeCode}`);
        const checkInAt = toLocalDateTime(input.date, input.checkIn);
        const checkoutDate = timeMinutes(input.checkOut) < timeMinutes(input.checkIn)
          ? dateOffset(input.date, 1) : input.date;
        const checkOutAt = toLocalDateTime(checkoutDate, input.checkOut);
        const saved = this.saveManualRecord({
          employeeId: employee.id, date: input.date,
          status: 'PRESENT', checkInAt, checkOutAt, source: 'IMPORT',
        });
        if (saved.pendingApproval) pendingApproval += 1;
        else imported += 1;
      } catch (error) {
        errors.push(`السطر ${index + 2}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, 'Import attendance punches', 'HR', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 16)}`, actor.id, actor.fullName, localDateString(),
        JSON.stringify({ imported, pendingApproval, errors: errors.length })]
    );
    return { imported, pendingApproval, errors };
  }

  static getAttendancePeriods(filters: {
    employeeId?: string;
    date?: string;
    from?: string;
    to?: string;
    operationShiftId?: string;
  } = {}): AttendancePeriod[] {
    const actor = this.requireView();
    const scope = this.employeeDataScope(actor);
    const conditions = [scope.clause];
    const params: string[] = [...scope.params];
    if (filters.employeeId) {
      conditions.push('p.employee_id = ?');
      params.push(filters.employeeId);
    }
    if (filters.date) {
      if (!isValidDate(filters.date)) throw new Error('تاريخ الحضور غير صالح.');
      conditions.push('p.attendance_date = ?');
      params.push(filters.date);
    }
    if (filters.from) {
      if (!isValidDate(filters.from)) throw new Error('تاريخ بداية الفترة غير صالح.');
      conditions.push('p.attendance_date >= ?');
      params.push(filters.from);
    }
    if (filters.to) {
      if (!isValidDate(filters.to)) throw new Error('تاريخ نهاية الفترة غير صالح.');
      conditions.push('p.attendance_date <= ?');
      params.push(filters.to);
    }
    if (filters.operationShiftId) {
      conditions.push('p.operation_shift_id = ?');
      params.push(filters.operationShiftId);
    }
    return this.db.query<any>(
      `SELECT p.id, p.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode,
              e.branch_id AS branchId, p.operation_shift_id AS operationShiftId,
              os.shift_number AS shiftNumber, p.attendance_date AS attendanceDate,
              p.check_in_at AS checkInAt, p.check_out_at AS checkOutAt,
              p.worked_minutes AS workedMinutes, p.late_minutes AS lateMinutes,
              p.overtime_minutes AS overtimeMinutes, p.status, p.source, p.notes
       FROM employee_attendance_periods p
       JOIN employees e ON e.id = p.employee_id
       LEFT JOIN operation_shifts os ON os.id = p.operation_shift_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.check_in_at DESC LIMIT 500`,
      params
    ).map((row) => ({
      ...row,
      workedMinutes: Number(row.workedMinutes) || 0,
      lateMinutes: Number(row.lateMinutes) || 0,
      overtimeMinutes: Number(row.overtimeMinutes) || 0,
    }));
  }

  static getOpenAttendancePeriod(employeeId: string): AttendancePeriod | null {
    const actor = this.requireView();
    this.requireEmployeeBranch(employeeId, actor);
    const row = this.db.query<any>(
      `SELECT p.id, p.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode,
              e.branch_id AS branchId, p.operation_shift_id AS operationShiftId,
              os.shift_number AS shiftNumber, p.attendance_date AS attendanceDate,
              p.check_in_at AS checkInAt, p.check_out_at AS checkOutAt,
              p.worked_minutes AS workedMinutes, p.late_minutes AS lateMinutes,
              p.overtime_minutes AS overtimeMinutes, p.status, p.source, p.notes
       FROM employee_attendance_periods p
       JOIN employees e ON e.id = p.employee_id
       LEFT JOIN operation_shifts os ON os.id = p.operation_shift_id
       WHERE p.employee_id = ? AND p.check_out_at IS NULL
       ORDER BY p.check_in_at DESC LIMIT 1`,
      [employeeId]
    )[0];
    return row ? {
      ...row,
      workedMinutes: Number(row.workedMinutes) || 0,
      lateMinutes: Number(row.lateMinutes) || 0,
      overtimeMinutes: Number(row.overtimeMinutes) || 0,
    } : null;
  }

  /**
   * Standalone clock-in/out that is independent from the daily attendance
   * summary. Safe to call several times a day; one employee may only have one
   * open period at a time.
   */
  static clockAttendancePeriod(
    employeeId: string,
    direction: 'IN' | 'OUT',
    options: {
      operationShiftId?: string | null;
      at?: string;
      lateMinutes?: number;
      overtimeMinutes?: number;
      notes?: string;
      source?: string;
    } = {}
  ): AttendancePeriod {
    const actor = this.requireManage();
    const branchId = this.requireEmployeeBranch(employeeId, actor);
    const now = options.at || `${localDateString()}T${new Date().toTimeString().slice(0, 8)}`;
    this.assertPeriodEditable(branchId, now.slice(0, 10));
    const date = now.slice(0, 10);
    if (!isValidDate(date) || !/^\d{2}:\d{2}/.test(now.slice(11))) {
      throw new Error('وقت تسجيل الحضور غير صالح.');
    }
    if (options.operationShiftId) {
      const shift = this.db.query<{ branchId: string }>(
        'SELECT branch_id AS branchId FROM operation_shifts WHERE id = ?',
        [options.operationShiftId]
      )[0];
      if (!shift) throw new Error('وردية التشغيل غير موجودة.');
      if (shift.branchId !== branchId) throw new Error('وردية التشغيل لا تتبع فرع الموظف.');
    }
    const open = this.db.query<{ id: string; checkInAt: string; operationShiftId: string | null }>(
      `SELECT id, check_in_at AS checkInAt, operation_shift_id AS operationShiftId
       FROM employee_attendance_periods WHERE employee_id = ? AND check_out_at IS NULL
       ORDER BY check_in_at DESC LIMIT 1`,
      [employeeId]
    )[0];

    if (direction === 'IN') {
      if (open) throw new Error('يوجد سجل حضور مفتوح لهذا الموظف؛ سجّل الانصراف أولاً.');
      const id = `attperiod_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
      this.db.run(
        `INSERT INTO employee_attendance_periods
           (id, employee_id, operation_shift_id, attendance_date, check_in_at,
            late_minutes, overtime_minutes, status, source, notes, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'OPEN', ?, ?, ?)`,
        [id, employeeId, options.operationShiftId || null, date, now,
          Math.max(0, options.lateMinutes || 0), options.source || 'MANUAL',
          options.notes?.trim() || null, actor.id]
      );
      AttendanceTimeService.syncDailySummary(employeeId, date, actor.id);
      return this.getAttendancePeriods({ employeeId }).find((row) => row.id === id)!;
    }

    if (!open) throw new Error('لا يوجد سجل حضور مفتوح لهذا الموظف.');
    const workedMinutes = Math.max(0, durationMinutes(open.checkInAt, now));
    this.db.run(
      `UPDATE employee_attendance_periods
       SET check_out_at = ?, worked_minutes = ?, overtime_minutes = ?, status = 'CLOSED',
           notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [now, workedMinutes, Math.max(0, options.overtimeMinutes || 0),
        options.notes?.trim() || null, open.id]
    );
    AttendanceTimeService.syncDailySummary(employeeId, date, actor.id);
    return this.getAttendancePeriods({ employeeId }).find((row) => row.id === open.id)!;
  }
}
