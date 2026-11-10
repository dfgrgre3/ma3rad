import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { EmployeeDepartmentAccessService } from '../auth/EmployeeDepartmentAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import type { User } from '../../../types/auth/identity';
import type {
  CreateLeaveRequestDTO,
  EmployeeLeaveRequest,
  LeaveFilters,
  LeaveStatus,
  LeaveSummary,
  LeaveType,
} from '../../../types/hr/leave';

const LEAVE_TYPES: LeaveType[] = ['ANNUAL', 'SICK', 'UNPAID', 'OTHER'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string, label: string): void {
  const parsed = DATE_PATTERN.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD.`);
  }
}

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function yearStart(year: number): string {
  return `${year}-01-01`;
}

function yearEnd(year: number): string {
  return `${year}-12-31`;
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function monthEnd(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function roundLeaveDays(days: number): number {
  return Math.round(days * 10000) / 10000;
}

function dateYears(startDate: string, endDate: string): number[] {
  const years: number[] = [];
  for (let year = Number(startDate.slice(0, 4)); year <= Number(endDate.slice(0, 4)); year += 1) {
    years.push(year);
  }
  return years;
}

export interface LeaveBalanceSummary {
  year: number;
  grantedDays: number;
  approvedDays: number;
  pendingDays: number;
  availableDays: number;
}

export interface LeaveBalanceTransaction {
  id: string;
  employeeId: string;
  employeeName: string;
  year: number;
  daysDelta: number;
  transactionType: 'ALLOCATION' | 'CARRYOVER' | 'ADJUSTMENT';
  effectiveDate: string;
  reason: string;
  createdByName: string;
  createdAt: string;
}

export interface LeaveTypePolicy {
  leaveType: LeaveType;
  maxDaysPerYear: number | null;
}

export interface AnnualLeaveAccrualPolicy {
  id: string;
  branchId: string;
  employeeId: string | null;
  effectiveFrom: string;
  annualEntitlementDays: number | null;
  carryoverLimitDays: number | null;
  prorateOnService: boolean | null;
}

export interface AnnualLeaveAccrualPolicyState {
  branchPolicy: AnnualLeaveAccrualPolicy | null;
  employeePolicy: AnnualLeaveAccrualPolicy | null;
  effectivePolicy: AnnualLeaveAccrualPolicy | null;
}

export interface LeaveCalendarEntry {
  date: string;
  employeeId: string;
  employeeName: string;
  leaveType: LeaveType | null;
  status: 'PENDING' | 'APPROVED' | 'ABSENT';
}

interface LeaveScheduleRow {
  effectiveFrom: string;
  effectiveTo: string | null;
  workdaysJson: string;
}

interface AnnualLeavePolicyRow {
  id: string;
  branchId: string;
  employeeId: string | null;
  effectiveFrom: string;
  annualEntitlementDays: number | null;
  carryoverLimitDays: number | null;
  prorateOnService: number | null;
}

interface AttendanceSnapshot {
  id: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  breakMinutes: number;
  overtimeApproved: number;
  overtimeApprovedBy: string | null;
  overtimeApprovedAt: string | null;
  source: string;
  notes: string | null;
  recordedBy: string | null;
}

export class LeaveService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private departmentAccess = new EmployeeDepartmentAccessService();

  private employeeDataScope(actor: User) {
    const branch = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const department = this.departmentAccess.sqlScope('e.department_id', actor);
    return {
      clause: `(${branch.clause}) AND (${department.clause})`,
      params: [...branch.params, ...department.params],
    };
  }

  private require(permission: string): User {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, permission);
    return actor;
  }

  private guardWrites(): void {
    ModuleRegistryService.assertModuleEnabled('hr');
  }

  private queryAnnualLeavePolicy(
    branchId: string,
    employeeId: string | null,
    effectiveDate: string
  ): AnnualLeavePolicyRow | null {
    const scopeKey = employeeId ?? 'BRANCH';
    return this.db.query<AnnualLeavePolicyRow>(
      `SELECT id, branch_id AS branchId, employee_id AS employeeId,
              effective_from AS effectiveFrom,
              annual_entitlement_days AS annualEntitlementDays,
              carryover_limit_days AS carryoverLimitDays,
              prorate_on_service AS prorateOnService
       FROM employee_leave_accrual_policies
       WHERE branch_id = ? AND scope_key = ? AND effective_from <= ?
       ORDER BY effective_from DESC LIMIT 1`,
      [branchId, scopeKey, effectiveDate]
    )[0] ?? null;
  }

  private effectiveAnnualLeavePolicy(
    employeeId: string,
    branchId: string,
    effectiveDate: string
  ): AnnualLeavePolicyRow | null {
    const employeePolicy = this.queryAnnualLeavePolicy(branchId, employeeId, effectiveDate);
    if (employeePolicy) {
      if (employeePolicy.annualEntitlementDays !== null) return employeePolicy;
      return this.queryAnnualLeavePolicy(branchId, null, effectiveDate);
    }
    return this.queryAnnualLeavePolicy(branchId, null, effectiveDate);
  }

  private ensureAnnualLeaveAccrual(
    employeeId: string,
    branchId: string,
    asOfDate: string,
    actorId: string
  ): void {
    const today = new Date().toISOString().slice(0, 10);
    const accrualThroughDate = asOfDate < today ? asOfDate : today;
    const employee = this.db.query<{ joinedDate: string; terminatedAt: string | null }>(
      'SELECT joined_date AS joinedDate, terminated_at AS terminatedAt FROM employees WHERE id = ? AND branch_id = ?',
      [employeeId, branchId]
    )[0];
    if (!employee || employee.joinedDate > accrualThroughDate) return;

    const firstYear = Number(employee.joinedDate.slice(0, 4));
    const finalYear = Number(accrualThroughDate.slice(0, 4));
    for (let year = firstYear; year <= finalYear; year += 1) {
      const janFirst = yearStart(year);
      if (year > firstYear && janFirst <= accrualThroughDate) {
        const carryPolicy = this.effectiveAnnualLeavePolicy(employeeId, branchId, janFirst);
        const carrySource = `CARRYOVER:${year}`;
        if (carryPolicy) {
          const previousYear = year - 1;
          const priorBalance = Number(this.db.query<{ days: number }>(
            `SELECT COALESCE(SUM(days_delta), 0) AS days
             FROM employee_leave_balance_transactions
             WHERE employee_id = ? AND leave_year = ? AND effective_date <= ?`,
            [employeeId, previousYear, yearEnd(previousYear)]
          )[0]?.days ?? 0);
          const approvedDays = this.getYearlyRequestDays(
            employeeId, 'ANNUAL', previousYear, undefined, 'APPROVED', yearEnd(previousYear)
          );
          const carryoverDays = roundLeaveDays(Math.min(
            Math.max(0, priorBalance - approvedDays),
            Number(carryPolicy.carryoverLimitDays ?? 0)
          ));
          if (carryoverDays > 0) {
            this.insertGeneratedBalanceTransaction({
              employeeId,
              branchId,
              year,
              days: carryoverDays,
              type: 'CARRYOVER',
              effectiveDate: janFirst,
              sourceKey: carrySource,
              reason: `ترحيل تلقائي من رصيد ${previousYear}`,
              actorId,
            });
          }
        }
      }

      for (let month = 1; month <= 12; month += 1) {
        const periodEnd = monthEnd(year, month);
        const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
        if (employee.terminatedAt && employee.terminatedAt < periodStart) break;
        const effectiveDate = employee.terminatedAt && employee.terminatedAt < periodEnd
          ? employee.terminatedAt
          : periodEnd;
        if (effectiveDate > accrualThroughDate) break;
        if (effectiveDate < employee.joinedDate) continue;
        const serviceEnd = employee.terminatedAt && employee.terminatedAt < periodEnd
          ? employee.terminatedAt
          : periodEnd;
        if (serviceEnd < periodStart) continue;

        const policy = this.effectiveAnnualLeavePolicy(employeeId, branchId, periodStart);
        const entitlement = Number(policy?.annualEntitlementDays ?? 0);
        if (!policy || entitlement <= 0) continue;

        let accrual = entitlement / 12;
        if (policy.prorateOnService) {
          const activeStart = employee.joinedDate > periodStart ? employee.joinedDate : periodStart;
          const activeDays = Math.max(0, Math.floor(
            (new Date(`${serviceEnd}T00:00:00Z`).getTime() - new Date(`${activeStart}T00:00:00Z`).getTime())
              / 86400000
          ) + 1);
          accrual *= activeDays / daysInMonth(year, month);
        }
        accrual = roundLeaveDays(accrual);
        if (accrual <= 0) continue;
        this.insertGeneratedBalanceTransaction({
          employeeId,
          branchId,
          year,
          days: accrual,
          type: 'ALLOCATION',
          effectiveDate,
          sourceKey: `ACCRUAL:${year}-${String(month).padStart(2, '0')}`,
          reason: `استحقاق شهري تلقائي ${year}-${String(month).padStart(2, '0')}`,
          actorId,
        });
      }
    }
  }

  private insertGeneratedBalanceTransaction(input: {
    employeeId: string;
    branchId: string;
    year: number;
    days: number;
    type: 'ALLOCATION' | 'CARRYOVER';
    effectiveDate: string;
    sourceKey: string;
    reason: string;
    actorId: string;
  }): void {
    const existing = this.db.query<{ id: string }>(
      `SELECT id FROM employee_leave_balance_transactions
       WHERE employee_id = ? AND source_key = ?`,
      [input.employeeId, input.sourceKey]
    )[0];
    if (existing) return;
    this.db.run(
      `INSERT INTO employee_leave_balance_transactions
       (id, employee_id, branch_id, leave_year, days_delta, transaction_type,
        effective_date, reason, created_by, source_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `lbal_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
        input.employeeId,
        input.branchId,
        input.year,
        input.days,
        input.type,
        input.effectiveDate,
        input.reason,
        input.actorId,
        input.sourceKey,
      ]
    );
  }

  private queryRequest(actor: User, id: string): EmployeeLeaveRequest | null {
    const scope = this.employeeDataScope(actor);
    return this.db.query<EmployeeLeaveRequest>(
      `SELECT l.*, e.name AS employee_name, b.name AS branch_name,
              ru.full_name AS requester_name, du.full_name AS decider_name
       FROM employee_leave_requests l
       JOIN employees e ON e.id = l.employee_id
       LEFT JOIN branches b ON b.id = l.branch_id
       LEFT JOIN users ru ON ru.id = l.requested_by
       LEFT JOIN users du ON du.id = l.decided_by
       WHERE l.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    )[0] ?? null;
  }

  private requireRequestExists(actor: User, id: string): EmployeeLeaveRequest {
    const request = this.queryRequest(actor, id);
    if (!request) throw new Error('طلب الإجازة غير موجود أو ليس لديك صلاحية الوصول إليه.');
    return request;
  }

  private assertPayrollPeriodsEditable(request: Pick<EmployeeLeaveRequest, 'branchId' | 'startDate' | 'endDate'>): void {
    if (this.db.query(
      `SELECT id FROM payroll_runs
       WHERE branch_id = ? AND status != 'DRAFT'
         AND period BETWEEN substr(?, 1, 7) AND substr(?, 1, 7)
       LIMIT 1`,
      [request.branchId, request.startDate, request.endDate]
    ).length) {
      throw new Error('طلب الإجازة يؤثر في فترة رواتب معتمدة؛ لا يمكن تعديله.');
    }
  }

  private assertNoOverlap(
    employeeId: string,
    startDate: string,
    endDate: string,
    excludeId?: string
  ): void {
    const overlap = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM employee_leave_requests
       WHERE employee_id = ?
         AND status IN ('PENDING', 'APPROVED')
         AND start_date <= ? AND end_date >= ?
         ${excludeId ? 'AND id != ?' : ''}`,
      excludeId
        ? [employeeId, endDate, startDate, excludeId]
        : [employeeId, endDate, startDate]
    )[0]?.count ?? 0;
    if (Number(overlap) > 0) {
      throw new Error('يوجد طلب إجازة آخر متداخل مع هذه الفترة.');
    }
  }

  private getChargeableDates(employeeId: string, branchId: string, startDate: string, endDate: string): string[] {
    const shifts = this.db.query<LeaveScheduleRow>(
      `SELECT a.effective_from AS effectiveFrom, a.effective_to AS effectiveTo,
              s.workdays_json AS workdaysJson
       FROM employee_shift_assignments a
       JOIN attendance_shifts s ON s.id = a.shift_id AND s.is_active = 1
       WHERE a.employee_id = ? AND a.effective_from <= ?
         AND (a.effective_to IS NULL OR a.effective_to >= ?)
       ORDER BY a.effective_from DESC`,
      [employeeId, endDate, startDate]
    );
    const holidays = new Set(this.db.query<{ date: string }>(
      `SELECT date FROM attendance_holidays
       WHERE branch_id = ? AND date BETWEEN ? AND ?`,
      [branchId, startDate, endDate]
    ).map((row) => row.date));

    const dates: string[] = [];
    for (let date = startDate; date <= endDate; date = dateOffset(date, 1)) {
      if (holidays.has(date)) continue;
      const shift = shifts.find((row) =>
        row.effectiveFrom <= date && (!row.effectiveTo || row.effectiveTo >= date)
      );
      if (shift) {
        const weekdays = JSON.parse(shift.workdaysJson) as number[];
        if (!weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
      }
      dates.push(date);
    }
    return dates;
  }

  private getChargeableDays(employeeId: string, branchId: string, startDate: string, endDate: string): number {
    return this.getChargeableDates(employeeId, branchId, startDate, endDate).length;
  }

  private getYearlyRequests(
    employeeId: string,
    leaveType: LeaveType,
    year: number,
    excludeId?: string,
    status: 'PENDING' | 'APPROVED' | 'ALL' = 'ALL'
  ): Array<{ id: string; branchId: string; startDate: string; endDate: string }> {
    const statusCondition = status === 'ALL' ? "status IN ('PENDING', 'APPROVED')" : 'status = ?';
    const params: Array<string> = [employeeId, leaveType];
    if (status !== 'ALL') params.push(status);
    params.push(yearEnd(year), yearStart(year));
    if (excludeId) params.push(excludeId);
    return this.db.query(
      `SELECT id, branch_id AS branchId, start_date AS startDate, end_date AS endDate
       FROM employee_leave_requests
       WHERE employee_id = ? AND leave_type = ?
         AND ${statusCondition}
         AND start_date <= ? AND end_date >= ?
         ${excludeId ? 'AND id != ?' : ''}
       ORDER BY start_date`,
      params
    );
  }

  private getYearlyRequestDays(
    employeeId: string,
    leaveType: LeaveType,
    year: number,
    excludeId?: string,
    status: 'PENDING' | 'APPROVED' | 'ALL' = 'ALL',
    asOfDate = yearEnd(year)
  ): number {
    return this.getYearlyRequests(employeeId, leaveType, year, excludeId, status).reduce((total, request) => {
      const start = request.startDate > yearStart(year) ? request.startDate : yearStart(year);
      const requestEnd = request.endDate < yearEnd(year) ? request.endDate : yearEnd(year);
      const end = requestEnd < asOfDate ? requestEnd : asOfDate;
      if (start > end) return total;
      return total + this.getChargeableDays(employeeId, request.branchId, start, end);
    }, 0);
  }

  private assertAnnualBalance(
    employeeId: string,
    branchId: string,
    startDate: string,
    endDate: string,
    actorId: string,
    excludeId?: string
  ): void {
    for (const year of dateYears(startDate, endDate)) {
      const start = startDate > yearStart(year) ? startDate : yearStart(year);
      const end = endDate < yearEnd(year) ? endDate : yearEnd(year);
      const requestedDays = this.getChargeableDays(employeeId, branchId, start, end);
      this.ensureAnnualLeaveAccrual(employeeId, branchId, start, actorId);
      const grantedDays = this.db.query<{ days: number }>(
        `SELECT COALESCE(SUM(days_delta), 0) AS days
         FROM employee_leave_balance_transactions
         WHERE employee_id = ? AND branch_id = ? AND leave_year = ? AND effective_date <= ?`,
        [employeeId, branchId, year, start]
      )[0]?.days ?? 0;
      const reservedDays = this.getYearlyRequestDays(employeeId, 'ANNUAL', year, excludeId);
      if (reservedDays + requestedDays > Number(grantedDays) + 1e-8) {
        throw new Error(
          `رصيد الإجازة السنوية غير كافٍ لعام ${year}. المتاح بعد الطلبات الحالية ${Math.max(0, Number(grantedDays) - reservedDays)} يوم، والمطلوب ${requestedDays} يوم.`
        );
      }
    }
  }

  private assertTypeLimits(
    employeeId: string,
    branchId: string,
    leaveType: LeaveType,
    startDate: string,
    endDate: string,
    excludeId?: string
  ): void {
    for (const year of dateYears(startDate, endDate)) {
      const policy = this.db.query<{ maxDaysPerYear: number | null }>(
        `SELECT max_days_per_year AS maxDaysPerYear
         FROM employee_leave_type_policies WHERE branch_id = ? AND leave_type = ?`,
        [branchId, leaveType]
      )[0];
      if (policy?.maxDaysPerYear == null) continue;

      const start = startDate > yearStart(year) ? startDate : yearStart(year);
      const end = endDate < yearEnd(year) ? endDate : yearEnd(year);
      const requestedDays = this.getChargeableDays(employeeId, branchId, start, end);
      const usedDays = this.getYearlyRequestDays(employeeId, leaveType, year, excludeId);
      if (usedDays + requestedDays > policy.maxDaysPerYear + 1e-8) {
        throw new Error(
          `يتجاوز الطلب الحد السنوي المحدد لنوع الإجازة (${policy.maxDaysPerYear} يوم) لعام ${year}.`
        );
      }
    }
  }

  private attendanceSnapshot(employeeId: string, date: string): AttendanceSnapshot | null {
    return this.db.query<AttendanceSnapshot>(
      `SELECT id, status, check_in_at AS checkInAt, check_out_at AS checkOutAt,
              worked_minutes AS workedMinutes, late_minutes AS lateMinutes,
              early_leave_minutes AS earlyLeaveMinutes, overtime_minutes AS overtimeMinutes,
              break_minutes AS breakMinutes, overtime_approved AS overtimeApproved,
              overtime_approved_by AS overtimeApprovedBy, overtime_approved_at AS overtimeApprovedAt,
              source, notes, recorded_by AS recordedBy
       FROM attendance WHERE employee_id = ? AND date = ?`,
      [employeeId, date]
    )[0] ?? null;
  }

  private applyApprovedLeaveAttendance(request: EmployeeLeaveRequest, actor: User): void {
    const dates = this.getChargeableDates(request.employeeId, request.branchId, request.startDate, request.endDate);
    const conflicts = dates.filter((date) => {
      const current = this.attendanceSnapshot(request.employeeId, date);
      return current && (
        current.status !== 'ABSENT' || current.checkInAt || current.checkOutAt || current.source === 'LEAVE'
      );
    });
    if (conflicts.length) {
      throw new Error(`تعذر اعتماد الإجازة لوجود سجلات حضور فعلية في: ${conflicts.join('، ')}. راجع السجلات أولاً.`);
    }

    for (const date of dates) {
      const previous = this.attendanceSnapshot(request.employeeId, date);
      const attendanceId = previous?.id ?? `att_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
      if (previous) {
        this.db.run(
          `UPDATE attendance SET status = 'LEAVE', check_in_at = NULL, check_out_at = NULL,
           worked_minutes = 0, late_minutes = 0, early_leave_minutes = 0, overtime_minutes = 0,
           break_minutes = 0, overtime_approved = 0, overtime_approved_by = NULL,
           overtime_approved_at = NULL, source = 'LEAVE', notes = ?, recorded_by = ?,
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [`إجازة معتمدة: ${request.id}`, actor.id, attendanceId]
        );
      } else {
        this.db.run(
          `INSERT INTO attendance (id, employee_id, date, status, source, notes, recorded_by)
           VALUES (?, ?, ?, 'LEAVE', 'LEAVE', ?, ?)`,
          [attendanceId, request.employeeId, date, `إجازة معتمدة: ${request.id}`, actor.id]
        );
      }
      this.db.run(
        `INSERT INTO employee_leave_attendance_links
         (id, leave_request_id, attendance_id, previous_json, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [
          `leavelink_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
          request.id,
          attendanceId,
          previous ? JSON.stringify(previous) : null,
          actor.id,
        ]
      );
      this.db.run(
        `INSERT INTO attendance_audit_log
         (id, attendance_id, employee_id, attendance_date, action, before_json, after_json, actor_id)
         VALUES (?, ?, ?, ?, 'LEAVE_APPROVED', ?, ?, ?)`,
        [
          `attaud_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
          attendanceId,
          request.employeeId,
          date,
          previous ? JSON.stringify(previous) : null,
          JSON.stringify({ status: 'LEAVE', source: 'LEAVE', leaveRequestId: request.id }),
          actor.id,
        ]
      );
    }
  }

  private restoreLeaveAttendance(requestId: string, employeeId: string, actor: User): void {
    const links = this.db.query<{ id: string; attendanceId: string; date: string; previousJson: string | null }>(
      `SELECT l.id, l.attendance_id AS attendanceId, a.date, l.previous_json AS previousJson
       FROM employee_leave_attendance_links l
       JOIN attendance a ON a.id = l.attendance_id
       WHERE l.leave_request_id = ? ORDER BY a.date`,
      [requestId]
    );
    for (const link of links) {
      const current = this.attendanceSnapshot(employeeId, link.date);
      if (!current || current.source !== 'LEAVE' || current.status !== 'LEAVE') {
        throw new Error(`تغير سجل الحضور ${link.date} بعد اعتماد الإجازة؛ راجعه قبل الإلغاء.`);
      }
    }
    for (const link of links) {
      const before = link.previousJson ? JSON.parse(link.previousJson) as AttendanceSnapshot : null;
      if (!before) {
        this.db.run('DELETE FROM attendance WHERE id = ?', [link.attendanceId]);
      } else {
        this.db.run(
          `UPDATE attendance SET status = ?, check_in_at = ?, check_out_at = ?, worked_minutes = ?,
           late_minutes = ?, early_leave_minutes = ?, overtime_minutes = ?, break_minutes = ?,
           overtime_approved = ?, overtime_approved_by = ?, overtime_approved_at = ?,
           source = ?, notes = ?, recorded_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [
            before.status, before.checkInAt, before.checkOutAt, before.workedMinutes,
            before.lateMinutes, before.earlyLeaveMinutes, before.overtimeMinutes, before.breakMinutes,
            before.overtimeApproved, before.overtimeApprovedBy, before.overtimeApprovedAt,
            before.source, before.notes, before.recordedBy, before.id,
          ]
        );
      }
      this.db.run('DELETE FROM employee_leave_attendance_links WHERE id = ?', [link.id]);
      this.db.run(
        `INSERT INTO attendance_audit_log
         (id, attendance_id, employee_id, attendance_date, action, before_json, after_json, actor_id)
         VALUES (?, ?, ?, ?, 'LEAVE_CANCELLED', ?, ?, ?)`,
        [
          `attaud_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
          before?.id ?? null,
          employeeId,
          link.date,
          JSON.stringify({ status: 'LEAVE', source: 'LEAVE', leaveRequestId: requestId }),
          before ? JSON.stringify(before) : null,
          actor.id,
        ]
      );
    }
  }

  public getBalanceSummary(employeeId: string, year: number, asOfDate?: string): LeaveBalanceSummary {
    const actor = AuthService.requireAuth();
    if (!PermissionService.can(actor, 'hr.leave.view') && !PermissionService.can(actor, 'hr.leave.request')) {
      throw new Error('ليس لديك صلاحية عرض رصيد الإجازات.');
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('السنة غير صالحة.');
    const today = new Date().toISOString().slice(0, 10);
    const currentYear = Number(today.slice(0, 4));
    const balanceDate = asOfDate ?? (
      year < currentYear ? yearEnd(year) : year === currentYear ? today : yearStart(year)
    );
    assertDate(balanceDate, 'تاريخ الرصيد');
    if (balanceDate.slice(0, 4) !== String(year)) throw new Error('تاريخ الرصيد يجب أن يقع في السنة المحددة.');
    const employee = this.db.query<{ branchId: string }>(
      'SELECT branch_id AS branchId FROM employees WHERE id = ?',
      [employeeId]
    )[0];
    if (!employee) throw new Error('الموظف المحدد غير موجود.');
    this.branchAccess.requireBranchAccess(employee.branchId, actor);
    this.departmentAccess.requireEmployeeAccess(employeeId, actor);
    this.ensureAnnualLeaveAccrual(employeeId, employee.branchId, balanceDate, actor.id);
    const grantedDays = Number(this.db.query<{ days: number }>(
      `SELECT COALESCE(SUM(days_delta), 0) AS days
      FROM employee_leave_balance_transactions WHERE employee_id = ? AND leave_year = ? AND effective_date <= ?`,
      [employeeId, year, balanceDate]
    )[0]?.days ?? 0);
    const approvedDays = this.getYearlyRequestDays(employeeId, 'ANNUAL', year, undefined, 'APPROVED', balanceDate);
    const pendingDays = this.getYearlyRequestDays(employeeId, 'ANNUAL', year, undefined, 'PENDING', balanceDate);
    return {
      year,
      grantedDays,
      approvedDays,
      pendingDays,
      availableDays: grantedDays - approvedDays - pendingDays,
    };
  }

  public getAnnualBalanceAsOf(employeeId: string, asOfDate: string): number {
    const actor = AuthService.requireAuth();
    if (!PermissionService.canAny(actor, ['hr.leave.view', 'hr.contracts.terminate'])) {
      throw new Error('ليس لديك صلاحية عرض رصيد الإجازات.');
    }
    assertDate(asOfDate, 'تاريخ الرصيد');
    const employee = this.db.query<{ branchId: string | null; joinedDate: string }>(
      'SELECT branch_id AS branchId, joined_date AS joinedDate FROM employees WHERE id = ?',
      [employeeId]
    )[0];
    if (!employee?.branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
    this.branchAccess.requireBranchAccess(employee.branchId, actor);
    this.departmentAccess.requireEmployeeAccess(employeeId, actor);
    this.ensureAnnualLeaveAccrual(employeeId, employee.branchId, asOfDate, actor.id);
    let balance = 0;
    const targetYear = Number(asOfDate.slice(0, 4));
    for (let year = Number(employee.joinedDate.slice(0, 4)); year <= targetYear; year += 1) {
      const end = asOfDate < yearEnd(year) ? asOfDate : yearEnd(year);
      const yearBalance = Number(this.db.query<{ days: number }>(
        `SELECT COALESCE(SUM(days_delta), 0) AS days
         FROM employee_leave_balance_transactions
         WHERE employee_id = ? AND leave_year = ? AND effective_date <= ?`,
        [employeeId, year, end]
      )[0]?.days ?? 0);
      const remaining = yearBalance
        - this.getYearlyRequestDays(employeeId, 'ANNUAL', year, undefined, 'APPROVED', end);
      const policy = this.effectiveAnnualLeavePolicy(
        employeeId, employee.branchId, yearStart(year)
      );
      balance = year === Number(employee.joinedDate.slice(0, 4)) || policy
        ? remaining
        : balance + remaining;
    }
    return Math.max(0, balance);
  }

  public getBalanceTransactions(employeeId: string, year: number): LeaveBalanceTransaction[] {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, ['hr.leave.view', 'hr.leave.approve']);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('السنة غير صالحة.');
    const employee = this.db.query<{ branchId: string | null }>(
      'SELECT branch_id AS branchId FROM employees WHERE id = ?',
      [employeeId]
    )[0];
    if (!employee?.branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
    this.branchAccess.requireBranchAccess(employee.branchId, actor);
    this.departmentAccess.requireEmployeeAccess(employeeId, actor);
    const today = new Date().toISOString().slice(0, 10);
    this.ensureAnnualLeaveAccrual(
      employeeId, employee.branchId, yearEnd(year) < today ? yearEnd(year) : today, actor.id
    );
    const scope = this.employeeDataScope(actor);
    return this.db.query<LeaveBalanceTransaction>(
      `SELECT t.id, t.employee_id AS employeeId, e.name AS employeeName,
              t.leave_year AS year, t.days_delta AS daysDelta,
              t.transaction_type AS transactionType, t.effective_date AS effectiveDate,
              t.reason, u.full_name AS createdByName, t.created_at AS createdAt
       FROM employee_leave_balance_transactions t
       JOIN employees e ON e.id = t.employee_id
       JOIN users u ON u.id = t.created_by
       WHERE t.employee_id = ? AND t.leave_year = ? AND ${scope.clause}
       ORDER BY t.effective_date DESC, t.created_at DESC`,
      [employeeId, year, ...scope.params]
    );
  }

  public adjustAnnualBalance(input: {
    employeeId: string;
    year: number;
    daysDelta: number;
    transactionType: 'ALLOCATION' | 'CARRYOVER' | 'ADJUSTMENT';
    effectiveDate: string;
    reason: string;
  }): LeaveBalanceTransaction {
    this.guardWrites();
    const actor = this.require('hr.leave.approve');
    if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) throw new Error('السنة غير صالحة.');
    assertDate(input.effectiveDate, 'تاريخ الاستحقاق');
    if (input.effectiveDate.slice(0, 4) !== String(input.year)) throw new Error('تاريخ الاستحقاق يجب أن يقع في سنة الرصيد المحددة.');
    if (!['ALLOCATION', 'CARRYOVER', 'ADJUSTMENT'].includes(input.transactionType)) {
      throw new Error('نوع حركة الرصيد غير صالح.');
    }
    if (!Number.isFinite(input.daysDelta) || input.daysDelta === 0) throw new Error('أدخل عدد أيام صحيحًا غير صفري.');
    if (!input.reason.trim()) throw new Error('سبب تعديل الرصيد مطلوب.');

    const employee = this.db.query<{ branchId: string }>(
      'SELECT branch_id AS branchId FROM employees WHERE id = ?',
      [input.employeeId]
    )[0];
    if (!employee) throw new Error('الموظف المحدد غير موجود.');
    this.branchAccess.requireBranchAccess(employee.branchId, actor);
    this.departmentAccess.requireEmployeeAccess(input.employeeId, actor);
    this.ensureAnnualLeaveAccrual(input.employeeId, employee.branchId, input.effectiveDate, actor.id);
    this.assertPayrollPeriodsEditable({
      branchId: employee.branchId,
      startDate: input.effectiveDate,
      endDate: input.effectiveDate,
    });
    if (input.transactionType === 'CARRYOVER') {
      const policy = this.effectiveAnnualLeavePolicy(input.employeeId, employee.branchId, input.effectiveDate);
      if (policy) {
        const existingCarryover = Number(this.db.query<{ days: number }>(
          `SELECT COALESCE(SUM(days_delta), 0) AS days
           FROM employee_leave_balance_transactions
           WHERE employee_id = ? AND leave_year = ? AND transaction_type = 'CARRYOVER'
             AND effective_date <= ?`,
          [input.employeeId, input.year, input.effectiveDate]
        )[0]?.days ?? 0);
        if (existingCarryover + input.daysDelta > Number(policy.carryoverLimitDays ?? 0) + 1e-8) {
          throw new Error(`حركة الترحيل تتجاوز الحد المسموح (${policy.carryoverLimitDays} يوم).`);
        }
      }
    }
    const balanceAtEffectiveDate = Number(this.db.query<{ days: number }>(
      `SELECT COALESCE(SUM(days_delta), 0) AS days
       FROM employee_leave_balance_transactions
       WHERE employee_id = ? AND leave_year = ? AND effective_date <= ?`,
      [input.employeeId, input.year, input.effectiveDate]
    )[0]?.days ?? 0);
    const committedAtDate = this.getYearlyRequestDays(
      input.employeeId, 'ANNUAL', input.year, undefined, 'ALL', input.effectiveDate
    );
    const yearEndBalance = Number(this.db.query<{ days: number }>(
      `SELECT COALESCE(SUM(days_delta), 0) AS days
       FROM employee_leave_balance_transactions WHERE employee_id = ? AND leave_year = ?`,
      [input.employeeId, input.year]
    )[0]?.days ?? 0);
    const committedForYear = this.getYearlyRequestDays(input.employeeId, 'ANNUAL', input.year);
    if (balanceAtEffectiveDate + input.daysDelta < committedAtDate - 1e-8
      || yearEndBalance + input.daysDelta < committedForYear - 1e-8) {
      throw new Error('لا يمكن خفض الرصيد عن الأيام السنوية المعتمدة أو قيد الانتظار.');
    }

    const id = `lbal_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO employee_leave_balance_transactions
         (id, employee_id, branch_id, leave_year, days_delta, transaction_type, effective_date, reason, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, input.employeeId, employee.branchId, input.year, input.daysDelta,
          input.transactionType, input.effectiveDate, input.reason.trim(), actor.id,
        ]
      );
      this.db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'تعديل رصيد إجازة سنوية', 'HR', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
          JSON.stringify(input),
        ]
      );
    });
    return this.getBalanceTransactions(input.employeeId, input.year).find((row) => row.id === id)!;
  }

  public getAnnualAccrualPolicyState(
    employeeId?: string,
    asOfDate = new Date().toISOString().slice(0, 10)
  ): AnnualLeaveAccrualPolicyState {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, ['hr.leave.view', 'hr.leave.approve']);
    assertDate(asOfDate, 'تاريخ السياسة');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const effectiveDate = monthStart(asOfDate);
    const branchRow = this.queryAnnualLeavePolicy(branchId, null, effectiveDate);
    let employeeRow: AnnualLeavePolicyRow | null = null;
    if (employeeId) {
      const employee = this.db.query<{ branchId: string | null }>(
        'SELECT branch_id AS branchId FROM employees WHERE id = ?',
        [employeeId]
      )[0];
      if (!employee?.branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
      this.branchAccess.requireBranchAccess(employee.branchId, actor);
      this.departmentAccess.requireEmployeeAccess(employeeId, actor);
      if (employee.branchId !== branchId) throw new Error('اختر موظفًا من الفرع الحالي.');
      employeeRow = this.queryAnnualLeavePolicy(branchId, employeeId, effectiveDate);
    }

    const toPolicy = (row: AnnualLeavePolicyRow | null): AnnualLeaveAccrualPolicy | null => row ? ({
      id: row.id,
      branchId: row.branchId,
      employeeId: row.employeeId,
      effectiveFrom: row.effectiveFrom,
      annualEntitlementDays: row.annualEntitlementDays,
      carryoverLimitDays: row.carryoverLimitDays,
      prorateOnService: row.prorateOnService == null ? null : Boolean(row.prorateOnService),
    }) : null;
    const branchPolicy = toPolicy(branchRow);
    const employeePolicy = toPolicy(employeeRow);
    return {
      branchPolicy,
      employeePolicy: employeePolicy?.annualEntitlementDays == null ? null : employeePolicy,
      effectivePolicy: employeePolicy?.annualEntitlementDays != null ? employeePolicy : branchPolicy,
    };
  }

  public saveAnnualAccrualPolicy(input: {
    employeeId?: string;
    effectiveFrom: string;
    annualEntitlementDays?: number;
    carryoverLimitDays?: number;
    prorateOnService?: boolean;
    inheritBranchPolicy?: boolean;
  }): void {
    this.guardWrites();
    const actor = this.require('hr.leave.approve');
    assertDate(input.effectiveFrom, 'تاريخ سريان السياسة');
    if (input.effectiveFrom !== monthStart(input.effectiveFrom)) {
      throw new Error('يجب أن يبدأ سريان السياسة في اليوم الأول من الشهر.');
    }
    if (input.employeeId && input.inheritBranchPolicy) {
      if (input.annualEntitlementDays != null || input.carryoverLimitDays != null) {
        throw new Error('لا يمكن تحديد قيم مخصصة عند اختيار سياسة الفرع.');
      }
    } else {
      if (!Number.isFinite(input.annualEntitlementDays) || input.annualEntitlementDays! < 0
        || input.annualEntitlementDays! > 366) {
        throw new Error('الاستحقاق السنوي يجب أن يكون بين 0 و366 يومًا.');
      }
      if (!Number.isFinite(input.carryoverLimitDays) || input.carryoverLimitDays! < 0
        || input.carryoverLimitDays! > 366) {
        throw new Error('حد الترحيل يجب أن يكون بين 0 و366 يومًا.');
      }
      if (typeof input.prorateOnService !== 'boolean') {
        throw new Error('حدد ما إذا كان الاستحقاق سيُحتسب نسبيًا حسب مدة الخدمة.');
      }
    }

    let branchId: string;
    if (input.employeeId) {
      const employee = this.db.query<{ branchId: string | null }>(
        'SELECT branch_id AS branchId FROM employees WHERE id = ?',
        [input.employeeId]
      )[0];
      if (!employee?.branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
      this.branchAccess.requireBranchAccess(employee.branchId, actor);
      this.departmentAccess.requireEmployeeAccess(input.employeeId, actor);
      branchId = employee.branchId;
    } else {
      branchId = this.branchAccess.getCurrentBranchId(actor);
    }

    const scopeKey = input.employeeId ?? 'BRANCH';
    const generated = this.db.query<{ id: string }>(
      `SELECT id FROM employee_leave_balance_transactions
       WHERE branch_id = ? AND effective_date >= ?
         AND (source_key LIKE 'ACCRUAL:%' OR source_key LIKE 'CARRYOVER:%')
         ${input.employeeId ? 'AND employee_id = ?' : ''}
       LIMIT 1`,
      input.employeeId ? [branchId, input.effectiveFrom, input.employeeId] : [branchId, input.effectiveFrom]
    );
    if (generated.length) {
      throw new Error('لا يمكن تغيير سياسة بأثر رجعي بعد إنشاء حركات تلقائية؛ اختر شهرًا لاحقًا.');
    }
    this.assertPayrollPeriodsEditable({
      branchId,
      startDate: input.effectiveFrom,
      endDate: input.effectiveFrom,
    });

    const previous = this.queryAnnualLeavePolicy(branchId, input.employeeId ?? null, input.effectiveFrom);
    const id = `lpol_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const inherited = Boolean(input.employeeId && input.inheritBranchPolicy);
    const nextValues = inherited ? {
      annualEntitlementDays: null,
      carryoverLimitDays: null,
      prorateOnService: null,
    } : {
      annualEntitlementDays: input.annualEntitlementDays!,
      carryoverLimitDays: input.carryoverLimitDays!,
      prorateOnService: input.prorateOnService ? 1 : 0,
    };

    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO employee_leave_accrual_policies (
           id, branch_id, employee_id, scope_key, effective_from,
           annual_entitlement_days, carryover_limit_days, prorate_on_service, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(branch_id, scope_key, effective_from) DO UPDATE SET
           annual_entitlement_days = excluded.annual_entitlement_days,
           carryover_limit_days = excluded.carryover_limit_days,
           prorate_on_service = excluded.prorate_on_service,
           updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`,
        [
          id, branchId, input.employeeId ?? null, scopeKey, input.effectiveFrom,
          nextValues.annualEntitlementDays, nextValues.carryoverLimitDays,
          nextValues.prorateOnService, actor.id,
        ]
      );
      this.db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
         VALUES (?, ?, ?, 'تعديل سياسة استحقاق الإجازة السنوية', 'HR', ?, ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName,
          `${branchId}:${scopeKey}:${input.effectiveFrom}`,
          JSON.stringify(previous),
          JSON.stringify({ ...nextValues, effectiveFrom: input.effectiveFrom }),
        ]
      );
    });
  }

  public getTypePolicies(): LeaveTypePolicy[] {
    const actor = this.require('hr.leave.view');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    return LEAVE_TYPES.map((leaveType) => ({
      leaveType,
      maxDaysPerYear: this.db.query<{ maxDaysPerYear: number | null }>(
        `SELECT max_days_per_year AS maxDaysPerYear
         FROM employee_leave_type_policies WHERE branch_id = ? AND leave_type = ?`,
        [branchId, leaveType]
      )[0]?.maxDaysPerYear ?? null,
    }));
  }

  public saveTypePolicy(leaveType: LeaveType, maxDaysPerYear: number | null): void {
    this.guardWrites();
    const actor = this.require('hr.leave.approve');
    if (!LEAVE_TYPES.includes(leaveType)) throw new Error('نوع الإجازة غير صالح.');
    if (maxDaysPerYear !== null && (!Number.isFinite(maxDaysPerYear) || maxDaysPerYear < 0)) {
      throw new Error('الحد السنوي يجب أن يكون رقمًا موجبًا أو غير محدود.');
    }
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const previous = this.db.query<{ maxDaysPerYear: number | null }>(
      `SELECT max_days_per_year AS maxDaysPerYear
       FROM employee_leave_type_policies WHERE branch_id = ? AND leave_type = ?`,
      [branchId, leaveType]
    )[0]?.maxDaysPerYear ?? null;
    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO employee_leave_type_policies (branch_id, leave_type, max_days_per_year, updated_by)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(branch_id, leave_type) DO UPDATE SET
           max_days_per_year = excluded.max_days_per_year,
           updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`,
        [branchId, leaveType, maxDaysPerYear, actor.id]
      );
      this.db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
         VALUES (?, ?, ?, 'تعديل سياسة الإجازات', 'HR', ?, ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName,
          `${branchId}:${leaveType}`, JSON.stringify({ maxDaysPerYear: previous }),
          JSON.stringify({ maxDaysPerYear }),
        ]
      );
    });
  }

  public getCalendar(period: string): LeaveCalendarEntry[] {
    const actor = this.require('hr.leave.view');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('صيغة الشهر غير صحيحة (YYYY-MM).');
    const start = `${period}-01`;
    const month = Number(period.slice(5, 7));
    const year = Number(period.slice(0, 4));
    const end = `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
    const scope = this.employeeDataScope(actor);
    const requests = this.db.query<{
      employeeId: string; employeeName: string; branchId: string; leaveType: LeaveType;
      status: 'PENDING' | 'APPROVED'; startDate: string; endDate: string;
    }>(
      `SELECT l.employee_id AS employeeId, e.name AS employeeName,
              l.branch_id AS branchId, l.leave_type AS leaveType, l.status,
              l.start_date AS startDate, l.end_date AS endDate
       FROM employee_leave_requests l JOIN employees e ON e.id = l.employee_id
       WHERE l.status IN ('PENDING', 'APPROVED') AND l.start_date <= ? AND l.end_date >= ?
         AND ${scope.clause}
       ORDER BY l.start_date, e.name`,
      [end, start, ...scope.params]
    );
    const leaveEntries = requests.flatMap((request) => {
      const rangeStart = request.startDate > start ? request.startDate : start;
      const rangeEnd = request.endDate < end ? request.endDate : end;
      return this.getChargeableDates(request.employeeId, request.branchId, rangeStart, rangeEnd).map((date) => ({
        date,
        employeeId: request.employeeId,
        employeeName: request.employeeName,
        leaveType: request.leaveType,
        status: request.status,
      }));
    });
    const absenceScope = this.employeeDataScope(actor);
    const absences = this.db.query<{ date: string; employeeId: string; employeeName: string }>(
      `SELECT a.date, a.employee_id AS employeeId, e.name AS employeeName
       FROM attendance a JOIN employees e ON e.id = a.employee_id
       WHERE a.status = 'ABSENT' AND a.date BETWEEN ? AND ? AND ${absenceScope.clause}
       ORDER BY a.date, e.name`,
      [start, end, ...absenceScope.params]
    ).map((row) => ({ ...row, leaveType: null, status: 'ABSENT' as const }));
    return [...leaveEntries, ...absences].sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName));
  }

  public getRequests(filters: LeaveFilters = {}): EmployeeLeaveRequest[] {
    const actor = this.require('hr.leave.view');
    const scope = this.employeeDataScope(actor);
    const conditions = [scope.clause];
    const params: Array<string | number> = [...scope.params];

    if (filters.status && filters.status !== 'ALL') {
      conditions.push('l.status = ?');
      params.push(filters.status);
    }
    if (filters.type && filters.type !== 'ALL') {
      conditions.push('l.leave_type = ?');
      params.push(filters.type);
    }
    if (filters.employeeId) {
      conditions.push('l.employee_id = ?');
      params.push(filters.employeeId);
    }
    if (filters.from) {
      assertDate(filters.from, 'تاريخ البداية');
      conditions.push('l.end_date >= ?');
      params.push(filters.from);
    }
    if (filters.to) {
      assertDate(filters.to, 'تاريخ النهاية');
      conditions.push('l.start_date <= ?');
      params.push(filters.to);
    }

    return this.db.query<EmployeeLeaveRequest>(
      `SELECT l.*, e.name AS employee_name, b.name AS branch_name,
              ru.full_name AS requester_name, du.full_name AS decider_name
       FROM employee_leave_requests l
       JOIN employees e ON e.id = l.employee_id
       LEFT JOIN branches b ON b.id = l.branch_id
       LEFT JOIN users ru ON ru.id = l.requested_by
       LEFT JOIN users du ON du.id = l.decided_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY l.start_date DESC, l.created_at DESC`,
      params
    );
  }

  public getRequest(id: string): EmployeeLeaveRequest {
    const actor = this.require('hr.leave.view');
    return this.requireRequestExists(actor, id);
  }

  public requestLeave(input: CreateLeaveRequestDTO): EmployeeLeaveRequest {
    this.guardWrites();
    const actor = this.require('hr.leave.request');
    if (!input.employeeId) throw new Error('يجب اختيار الموظف.');
    assertDate(input.startDate, 'تاريخ البداية');
    assertDate(input.endDate, 'تاريخ النهاية');
    if (input.endDate < input.startDate) throw new Error('تاريخ النهاية يجب أن يكون بعد تاريخ البداية.');

    const leaveType = input.leaveType || 'ANNUAL';
    if (!LEAVE_TYPES.includes(leaveType)) throw new Error('نوع الإجازة غير صالح.');

    const employee = this.db.query<{ branchId: string | null; isActive: number | null }>(
      `SELECT branch_id AS branchId, is_active AS isActive FROM employees WHERE id = ?`,
      [input.employeeId]
    )[0];
    if (!employee) throw new Error('الموظف المحدد غير موجود.');
    if (employee.isActive === 0) throw new Error('لا يمكن تسجيل إجازة لموظف غير نشط.');
    if (!employee.branchId) throw new Error('الموظف غير مرتبط بفرع.');
    this.branchAccess.requireBranchAccess(employee.branchId, actor);
    this.departmentAccess.requireEmployeeAccess(input.employeeId, actor);

    const days = this.getChargeableDays(input.employeeId, employee.branchId, input.startDate, input.endDate);
    if (!days) throw new Error('الفترة المحددة لا تتضمن أيام دوام بعد استثناء العطلات وأيام الراحة المجدولة.');
    this.assertNoOverlap(input.employeeId, input.startDate, input.endDate);
    this.assertTypeLimits(input.employeeId, employee.branchId, leaveType, input.startDate, input.endDate);
    if (leaveType === 'ANNUAL') {
      this.assertAnnualBalance(input.employeeId, employee.branchId, input.startDate, input.endDate, actor.id);
    }

    const id = `leave_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO employee_leave_requests (
           id, employee_id, branch_id, leave_type, start_date, end_date, days, reason,
           status, requested_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
        [
          id, input.employeeId, employee.branchId, leaveType, input.startDate, input.endDate,
          days, input.reason?.trim() || null, actor.id, new Date().toISOString(), new Date().toISOString(),
        ]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'طلب إجازة', 'HR', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
          JSON.stringify({ employeeId: input.employeeId, leaveType, startDate: input.startDate, endDate: input.endDate, days }),
        ]
      );
    });

    return this.requireRequestExists(actor, id);
  }

  public decide(id: string, decision: 'APPROVED' | 'REJECTED', note?: string): EmployeeLeaveRequest {
    this.guardWrites();
    const actor = this.require('hr.leave.approve');
    const request = this.requireRequestExists(actor, id);
    if (request.status !== 'PENDING') throw new Error('لا يمكن البت في طلب ليس قيد الانتظار.');
    this.assertPayrollPeriodsEditable(request);
    if (decision === 'APPROVED') {
      this.assertNoOverlap(request.employeeId, request.startDate, request.endDate, request.id);
      this.assertTypeLimits(
        request.employeeId, request.branchId, request.leaveType, request.startDate, request.endDate, request.id
      );
      if (request.leaveType === 'ANNUAL') {
        this.assertAnnualBalance(
          request.employeeId, request.branchId, request.startDate, request.endDate, actor.id, request.id
        );
      }
    }
    this.db.executeTransaction(() => {
      if (decision === 'APPROVED') this.applyApprovedLeaveAttendance(request, actor);
      this.db.run(
        `UPDATE employee_leave_requests
         SET status = ?, days = ?, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ?
         WHERE id = ?`,
        [
          decision,
          this.getChargeableDays(request.employeeId, request.branchId, request.startDate, request.endDate),
          actor.id,
          new Date().toISOString(),
          note?.trim() || null,
          new Date().toISOString(),
          id,
        ]
      );
      this.db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
         VALUES (?, ?, ?, ?, 'HR', ?, ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName,
          decision === 'APPROVED' ? 'اعتماد إجازة' : 'رفض إجازة', id,
          JSON.stringify({ status: request.status }), JSON.stringify({ status: decision, note: note || null }),
        ]
      );
    });
    return this.requireRequestExists(actor, id);
  }

  public cancel(id: string, note?: string): EmployeeLeaveRequest {
    this.guardWrites();
    const actor = AuthService.requireAuth();
    const request = this.requireRequestExists(actor, id);
    this.assertPayrollPeriodsEditable(request);
    if (request.status === 'CANCELLED' || request.status === 'REJECTED') {
      throw new Error('الطلب غير قابل للإلغاء في حالته الحالية.');
    }
    const canManage = PermissionService.can(actor, 'hr.leave.approve');
    const isRequester = request.requestedBy === actor.id;
    if (!canManage && !isRequester) {
      throw new Error('ليس لديك صلاحية إلغاء هذا الطلب.');
    }
    this.db.executeTransaction(() => {
      if (request.status === 'APPROVED') this.restoreLeaveAttendance(request.id, request.employeeId, actor);
      this.db.run(
        `UPDATE employee_leave_requests
         SET status = 'CANCELLED', decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ?
         WHERE id = ?`,
        [actor.id, new Date().toISOString(), note?.trim() || null, new Date().toISOString(), id]
      );
      this.db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
         VALUES (?, ?, ?, 'إلغاء إجازة', 'HR', ?, ?, '{"status":"CANCELLED"}')`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ status: request.status })]
      );
    });
    return this.requireRequestExists(actor, id);
  }

  public getSummary(year?: number): LeaveSummary {
    const actor = this.require('hr.leave.view');
    const targetYear = year ?? new Date().getFullYear();
    if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
      throw new Error('السنة غير صالحة.');
    }
    const scope = this.employeeDataScope(actor);
    const rows = this.db.query<{
      id: string; employeeId: string; branchId: string; status: LeaveStatus; leaveType: LeaveType;
      startDate: string; endDate: string; days: number;
    }>(
      `SELECT l.id, l.employee_id AS employeeId, l.branch_id AS branchId,
              l.status, l.leave_type AS leaveType, l.start_date AS startDate,
              l.end_date AS endDate, l.days
       FROM employee_leave_requests l
       JOIN employees e ON e.id = l.employee_id
       WHERE ${scope.clause} AND l.start_date <= ? AND l.end_date >= ?`,
      [...scope.params, yearEnd(targetYear), yearStart(targetYear)]
    );
    const summary: LeaveSummary = {
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      approvedDays: 0,
      daysByType: { ANNUAL: 0, SICK: 0, UNPAID: 0, OTHER: 0 },
    };
    for (const row of rows) {
      if (row.status === 'PENDING') summary.pending += 1;
      if (row.status === 'APPROVED') {
        summary.approved += 1;
        const start = row.startDate > yearStart(targetYear) ? row.startDate : yearStart(targetYear);
        const end = row.endDate < yearEnd(targetYear) ? row.endDate : yearEnd(targetYear);
        const days = this.getChargeableDays(row.employeeId, row.branchId, start, end);
        summary.approvedDays += days;
        summary.daysByType[row.leaveType] += days;
      }
      if (row.status === 'REJECTED') summary.rejected += 1;
      if (row.status === 'CANCELLED') summary.cancelled += 1;
    }
    return summary;
  }
}
