import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';

export interface UnifiedAttendanceDay {
  employeeId: string;
  date: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  approvedOvertimeMinutes: number;
  breakMinutes: number;
  overtimeApproved: boolean;
  earlyLeaveMinutes: number;
  periodCount: number;
  sources: string[];
}

interface PeriodAggregate {
  employeeId: string;
  date: string;
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  openCount: number;
  periodCount: number;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  approvedOvertimeMinutes: number;
  breakMinutes: number;
  approvedCount: number;
}

interface StaffRow {
  employeeId: string;
  date: string;
  checkInAt: string;
  checkOutAt: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
}

interface DailyRow {
  id?: string;
  employeeId: string;
  date: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  breakMinutes: number;
  overtimeApproved: boolean | number;
  source: string | null;
}

function durationMinutes(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 60_000));
}

function number(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

/**
 * Single read model for actual employee time.
 *
 * The ERP records time in the daily `attendance` summary, the append-only
 * `employee_attendance_periods` log (multiple periods per day, overnight
 * shifts, breaks) and `operation_shift_staff` presence rows. This service
 * merges them without double counting so payroll, reports and screens all
 * consume the same approved minutes.
 */
export class AttendanceTimeService {
  private static db = DatabaseManager.getInstance();

  private static getPeriodAggregates(branchId: string, from: string, to: string): PeriodAggregate[] {
    return this.db.query<PeriodAggregate>(
      `SELECT p.employee_id AS employeeId, p.attendance_date AS date,
              MIN(p.check_in_at) AS firstCheckIn, MAX(p.check_out_at) AS lastCheckOut,
              SUM(CASE WHEN p.check_out_at IS NULL THEN 1 ELSE 0 END) AS openCount,
              COUNT(*) AS periodCount,
              COALESCE(SUM(p.worked_minutes), 0) AS workedMinutes,
              COALESCE(SUM(p.late_minutes), 0) AS lateMinutes,
              COALESCE(SUM(p.overtime_minutes), 0) AS overtimeMinutes,
              COALESCE(SUM(CASE WHEN p.overtime_approved = 1 THEN p.overtime_minutes ELSE 0 END), 0)
                AS approvedOvertimeMinutes,
              COALESCE(SUM(p.break_minutes), 0) AS breakMinutes,
              COALESCE(SUM(CASE WHEN p.overtime_approved = 1 THEN 1 ELSE 0 END), 0) AS approvedCount
       FROM employee_attendance_periods p
       JOIN employees e ON e.id = p.employee_id
       WHERE e.branch_id = ? AND p.attendance_date BETWEEN ? AND ?
       GROUP BY p.employee_id, p.attendance_date
       ORDER BY p.attendance_date, p.employee_id`,
      [branchId, from, to]
    ).map((row) => ({
      ...row,
      workedMinutes: number(row.workedMinutes),
      lateMinutes: number(row.lateMinutes),
      overtimeMinutes: number(row.overtimeMinutes),
      approvedOvertimeMinutes: number(row.approvedOvertimeMinutes),
      breakMinutes: number(row.breakMinutes),
      periodCount: number(row.periodCount),
      openCount: number(row.openCount),
      approvedCount: number(row.approvedCount),
    }));
  }

  /**
   * Staff presence rows created directly (for example `addStaff` or the
   * handover "next shift" list) may not have a matching attendance period.
   * Use them as a fallback only, never in addition to the period log, so the
   * same minutes are never counted twice.
   */
  private static getStaffFallback(branchId: string, from: string, to: string): StaffRow[] {
    return this.db.query<StaffRow>(
      `SELECT st.employee_id AS employeeId, os.business_date AS date,
              st.check_in_at AS checkInAt, st.check_out_at AS checkOutAt,
              COALESCE(st.late_minutes, 0) AS lateMinutes,
              COALESCE(st.overtime_minutes, 0) AS overtimeMinutes
       FROM operation_shift_staff st
       JOIN operation_shifts os ON os.id = st.operation_shift_id
       JOIN employees e ON e.id = st.employee_id
       WHERE os.branch_id = ? AND os.business_date BETWEEN ? AND ?
         AND st.check_in_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM employee_attendance_periods p
           WHERE p.employee_id = st.employee_id
             AND p.operation_shift_id = st.operation_shift_id
         )
       ORDER BY os.business_date, st.employee_id, st.check_in_at`,
      [branchId, from, to]
    ).map((row) => ({
      ...row,
      lateMinutes: number(row.lateMinutes),
      overtimeMinutes: number(row.overtimeMinutes),
    }));
  }

  private static getDailyRows(branchId: string, from: string, to: string): DailyRow[] {
    return this.db.query<DailyRow>(
      `SELECT a.employee_id AS employeeId, a.date, a.status,
              a.check_in_at AS checkInAt, a.check_out_at AS checkOutAt,
              COALESCE(a.worked_minutes, 0) AS workedMinutes,
              COALESCE(a.late_minutes, 0) AS lateMinutes,
              COALESCE(a.early_leave_minutes, 0) AS earlyLeaveMinutes,
              COALESCE(a.overtime_minutes, 0) AS overtimeMinutes,
              COALESCE(a.break_minutes, 0) AS breakMinutes,
              COALESCE(a.overtime_approved, 0) AS overtimeApproved,
              a.source
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       WHERE e.branch_id = ? AND a.date BETWEEN ? AND ?
       ORDER BY a.date, a.employee_id`,
      [branchId, from, to]
    );
  }

  private static aggregateForEmployeeDay(
    employeeId: string,
    date: string
  ): { periods: PeriodAggregate | null; staff: StaffRow[] } {
    const periods = this.db.query<PeriodAggregate>(
      `SELECT p.employee_id AS employeeId, p.attendance_date AS date,
              MIN(p.check_in_at) AS firstCheckIn, MAX(p.check_out_at) AS lastCheckOut,
              SUM(CASE WHEN p.check_out_at IS NULL THEN 1 ELSE 0 END) AS openCount,
              COUNT(*) AS periodCount,
              COALESCE(SUM(p.worked_minutes), 0) AS workedMinutes,
              COALESCE(SUM(p.late_minutes), 0) AS lateMinutes,
              COALESCE(SUM(p.overtime_minutes), 0) AS overtimeMinutes,
              COALESCE(SUM(CASE WHEN p.overtime_approved = 1 THEN p.overtime_minutes ELSE 0 END), 0)
                AS approvedOvertimeMinutes,
              COALESCE(SUM(p.break_minutes), 0) AS breakMinutes,
              COALESCE(SUM(CASE WHEN p.overtime_approved = 1 THEN 1 ELSE 0 END), 0) AS approvedCount
       FROM employee_attendance_periods p
       WHERE p.employee_id = ? AND p.attendance_date = ?
       GROUP BY p.employee_id, p.attendance_date`,
      [employeeId, date]
    )[0] ?? null;
    const staff = this.db.query<StaffRow>(
      `SELECT st.employee_id AS employeeId, os.business_date AS date,
              st.check_in_at AS checkInAt, st.check_out_at AS checkOutAt,
              COALESCE(st.late_minutes, 0) AS lateMinutes,
              COALESCE(st.overtime_minutes, 0) AS overtimeMinutes
       FROM operation_shift_staff st
       JOIN operation_shifts os ON os.id = st.operation_shift_id
       WHERE st.employee_id = ? AND os.business_date = ? AND st.check_in_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM employee_attendance_periods p
           WHERE p.employee_id = st.employee_id
             AND p.operation_shift_id = st.operation_shift_id
         )`,
      [employeeId, date]
    );
    return {
      periods: periods
        ? {
          ...periods,
          workedMinutes: number(periods.workedMinutes),
          lateMinutes: number(periods.lateMinutes),
          overtimeMinutes: number(periods.overtimeMinutes),
          approvedOvertimeMinutes: number(periods.approvedOvertimeMinutes),
          breakMinutes: number(periods.breakMinutes),
          periodCount: number(periods.periodCount),
          openCount: number(periods.openCount),
          approvedCount: number(periods.approvedCount),
        }
        : null,
      staff,
    };
  }

  private static mergeDay(
    daily: DailyRow | undefined,
    periods: PeriodAggregate | null,
    staff: StaffRow[]
  ): UnifiedAttendanceDay | null {
    const hasActual = Boolean(periods?.periodCount) || staff.length > 0;
    if (!hasActual) {
      if (!daily) return null;
      return {
        employeeId: daily.employeeId,
        date: daily.date,
        status: daily.status,
        checkInAt: daily.checkInAt,
        checkOutAt: daily.checkOutAt,
        workedMinutes: number(daily.workedMinutes),
        lateMinutes: number(daily.lateMinutes),
        earlyLeaveMinutes: number(daily.earlyLeaveMinutes),
        overtimeMinutes: number(daily.overtimeMinutes),
        approvedOvertimeMinutes: Boolean(daily.overtimeApproved) ? number(daily.overtimeMinutes) : 0,
        breakMinutes: number(daily.breakMinutes),
        overtimeApproved: Boolean(daily.overtimeApproved),
        periodCount: 0,
        sources: [daily.source || 'MANUAL'],
      };
    }

    const staffWorked = staff.reduce((sum, row) => sum + durationMinutes(row.checkInAt, row.checkOutAt), 0);
    const workedMinutes = number(periods?.workedMinutes) + staffWorked;
    const lateMinutes = number(periods?.lateMinutes)
      + staff.reduce((sum, row) => sum + number(row.lateMinutes), 0);
    const overtimeMinutes = number(periods?.overtimeMinutes)
      + staff.reduce((sum, row) => sum + number(row.overtimeMinutes), 0);
    const approvedByPeriod = number(periods?.approvedCount) > 0;
    const approvedByDaily = Boolean(daily?.overtimeApproved);
    const approvedOvertimeMinutes = periods?.periodCount
      ? number(periods.approvedOvertimeMinutes)
        + (approvedByDaily && !approvedByPeriod
          ? Math.max(0, number(daily?.overtimeMinutes) - number(periods.overtimeMinutes))
          : 0)
      : staff.length
        ? approvedByDaily
          ? Math.min(number(daily?.overtimeMinutes), staff.reduce((sum, row) => sum + number(row.overtimeMinutes), 0))
          : 0
        : approvedByDaily ? number(daily?.overtimeMinutes) : 0;
    const checkIns = [
      periods?.firstCheckIn || null,
      ...staff.map((row) => row.checkInAt),
    ].filter((value): value is string => Boolean(value)).sort();
    const checkOuts = [
      periods?.lastCheckOut || null,
      ...staff.map((row) => row.checkOutAt || null),
    ].filter((value): value is string => Boolean(value)).sort();
    const hasOpen = number(periods?.openCount) > 0 || staff.some((row) => !row.checkOutAt);
    const status = lateMinutes > 0 ? 'LATE' : 'PRESENT';
    const sourceSet = new Set<string>([
      ...(periods ? ['PERIODS'] : []),
      ...(staff.length ? ['OPERATION_SHIFT'] : []),
      ...(daily ? [daily.source || 'MANUAL'] : []),
    ]);
    return {
      employeeId: periods?.employeeId ?? staff[0].employeeId,
      date: periods?.date ?? staff[0].date,
      status,
      checkInAt: checkIns[0] ?? null,
      checkOutAt: hasOpen ? null : (checkOuts[checkOuts.length - 1] ?? null),
      workedMinutes,
      lateMinutes,
      earlyLeaveMinutes: number(daily?.earlyLeaveMinutes),
      overtimeMinutes,
      approvedOvertimeMinutes,
      breakMinutes: number(periods?.breakMinutes),
      overtimeApproved: approvedByPeriod || approvedByDaily,
      periodCount: number(periods?.periodCount) + staff.length,
      sources: [...sourceSet],
    };
  }

  static getUnifiedRows(branchId: string, from: string, to: string): UnifiedAttendanceDay[] {
    const dailyRows = this.getDailyRows(branchId, from, to);
    const periodRows = this.getPeriodAggregates(branchId, from, to);
    const staffRows = this.getStaffFallback(branchId, from, to);
    const dailyByKey = new Map(dailyRows.map((row) => [`${row.employeeId}:${row.date}`, row]));
    const periodsByKey = new Map(periodRows.map((row) => [`${row.employeeId}:${row.date}`, row]));
    const staffByKey = new Map<string, StaffRow[]>();
    for (const row of staffRows) {
      const key = `${row.employeeId}:${row.date}`;
      staffByKey.set(key, [...(staffByKey.get(key) ?? []), row]);
    }
    const keys = new Set([...dailyByKey.keys(), ...periodsByKey.keys(), ...staffByKey.keys()]);
    return [...keys].sort().map((key) => this.mergeDay(
      dailyByKey.get(key),
      periodsByKey.get(key) ?? null,
      staffByKey.get(key) ?? []
    )).filter((row): row is UnifiedAttendanceDay => Boolean(row));
  }

  /**
   * Keep the daily `attendance` summary in sync after a period is opened,
   * closed or corrected. The daily table remains the screen/report surface,
   * but periods are authoritative for actual minutes.
   */
  static syncDailySummary(employeeId: string, date: string, recordedBy?: string | null): void {
    const { periods, staff } = this.aggregateForEmployeeDay(employeeId, date);
    if (!periods && !staff.length) return;
    const existing = this.db.query<DailyRow>(
      `SELECT id, employee_id AS employeeId, date, status, check_in_at AS checkInAt,
              check_out_at AS checkOutAt, COALESCE(worked_minutes, 0) AS workedMinutes,
              COALESCE(late_minutes, 0) AS lateMinutes,
              COALESCE(early_leave_minutes, 0) AS earlyLeaveMinutes,
              COALESCE(overtime_minutes, 0) AS overtimeMinutes,
              COALESCE(break_minutes, 0) AS breakMinutes,
              COALESCE(overtime_approved, 0) AS overtimeApproved, source
       FROM attendance WHERE employee_id = ? AND date = ?`,
      [employeeId, date]
    )[0];
    const merged = this.mergeDay(existing, periods, staff);
    if (!merged) return;
    const overtimeChanged = number(existing?.overtimeMinutes) !== merged.overtimeMinutes;
    const approved = merged.overtimeApproved && !overtimeChanged;
    if (existing) {
      this.db.run(
        `UPDATE attendance SET status = ?, check_in_at = ?, check_out_at = ?,
           worked_minutes = ?, late_minutes = ?, overtime_minutes = ?, break_minutes = ?,
           overtime_approved = ?, overtime_approved_by = CASE WHEN ? = 1 THEN overtime_approved_by ELSE NULL END,
           overtime_approved_at = CASE WHEN ? = 1 THEN overtime_approved_at ELSE NULL END,
           source = 'PERIODS', recorded_by = COALESCE(?, recorded_by), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [merged.status, merged.checkInAt, merged.checkOutAt, merged.workedMinutes, merged.lateMinutes,
          merged.overtimeMinutes, merged.breakMinutes, approved ? 1 : 0, approved ? 1 : 0, approved ? 1 : 0,
          recordedBy || null, existing.id]
      );
      return;
    }
    const id = `att_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO attendance
         (id, employee_id, date, status, check_in_at, check_out_at, worked_minutes, late_minutes,
          overtime_minutes, break_minutes, overtime_approved, source, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PERIODS', ?)`,
      [id, employeeId, date, merged.status, merged.checkInAt, merged.checkOutAt, merged.workedMinutes,
        merged.lateMinutes, merged.overtimeMinutes, merged.breakMinutes, approved ? 1 : 0, recordedBy || null]
    );
  }
}
