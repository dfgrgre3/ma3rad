import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { localDateString } from '../../../utils/shared/date';
import { AttendanceTimeService } from '../hr/AttendanceTimeService';

export type OperationsWorkMode = 'NORMAL' | 'TWO_SHIFTS' | 'THREE_SHIFTS' | 'CONTINUOUS';
export type OperationShiftStatus = 'PLANNED' | 'OPEN' | 'HANDOVER_PENDING' | 'CLOSED' | 'MISSED' | 'CANCELLED';
export type OperationStaffRole = 'SUPERVISOR' | 'STAFF';
export type OperationStaffStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE';

export interface OperationShiftDefinition {
  id: string;
  branchId: string;
  name: string;
  department: string | null;
  location: string | null;
  shiftCode: string | null;
  color: string | null;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  breakMinutes: number;
  graceMinutes: number;
  overtimeAfterMinutes: number;
  minimumStaffCount: number;
  requiredRestMinutes: number;
  workdays: number[];
  shiftOrder: number;
  isActive: boolean;
  assignedCount: number;
}

export interface OperationShiftInstance {
  id: string;
  shiftNumber: string;
  definitionId: string;
  definitionName: string;
  department: string | null;
  location: string | null;
  branchId: string;
  businessDate: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: OperationShiftStatus;
  supervisorId: string | null;
  supervisorName: string | null;
  openedBy: string | null;
  openedByName: string | null;
  openedAt: string | null;
  closedAt: string | null;
  staffCount: number;
  presentCount: number;
  minimumStaffCount: number;
  shortageCount: number;
  handoverStatus: string | null;
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
  producedQty: number;
  scrapQty: number;
  openIncidents: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperationShiftStaff {
  id: string;
  operationShiftId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  role: OperationStaffRole;
  status: OperationStaffStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  notes: string | null;
}

export interface OperationShiftHandover {
  id: string;
  operationShiftId: string;
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
  cashDelivered: number;
  pendingOrders: string[];
  inventoryStatus: string;
  equipmentStatus: string;
  notes: string;
  nextStaffIds: string[];
  status: 'PENDING' | 'RECEIVED' | 'REJECTED';
  submittedBy: string;
  submittedByName?: string;
  submittedAt: string;
  receivedBy: string | null;
  receivedByName?: string | null;
  receivedAt: string | null;
  receivedNotes: string | null;
}

export interface OperationShiftIncident {
  id: string;
  operationShiftId: string;
  type: 'BREAKDOWN' | 'NOTE' | 'SAFETY' | 'QUALITY' | 'OTHER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string | null;
  startedAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  reportedBy: string;
  reportedByName?: string;
}

export interface OperationShiftProductionRow {
  id: string;
  operationShiftId: string;
  productionOrderId: string | null;
  orderNumber: string | null;
  productId: string | null;
  productName: string | null;
  workCenterId: string | null;
  workCenterName: string | null;
  targetQty: number;
  producedQty: number;
  goodQty: number;
  scrapQty: number;
  downtimeMinutes: number;
  downtimeReason: string | null;
  notes: string | null;
  createdAt: string;
}

export interface OperationShiftDetail {
  shift: OperationShiftInstance;
  staff: OperationShiftStaff[];
  handover: OperationShiftHandover | null;
  incidents: OperationShiftIncident[];
  production: OperationShiftProductionRow[];
  cashShifts: Array<Record<string, unknown>>;
  cashSummary: OperationCashSummary;
  attendancePeriods: EmployeeAttendancePeriod[];
  openProductionOrders: Array<Record<string, unknown>>;
}

export interface OperationCashSummary {
  expected: number;
  actual: number;
  difference: number;
  delivered: number;
  openShifts: number;
  closedShifts: number;
}

export interface EmployeeAttendancePeriod {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  operationShiftId: string | null;
  shiftNumber?: string | null;
  attendanceDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  overtimeApproved?: boolean;
  overtimeApprovedBy?: string | null;
  overtimeApprovedAt?: string | null;
  status: 'OPEN' | 'CLOSED';
  source: string;
  notes: string | null;
}

export interface OperationShiftReportRow {
  shiftId: string;
  shiftNumber: string;
  definitionName: string;
  department: string | null;
  businessDate: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: OperationShiftStatus;
  supervisorName: string | null;
  staffCount: number;
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
  cashDelivered: number;
  producedQty: number;
  goodQty: number;
  scrapQty: number;
  downtimeMinutes: number;
  incidents: number;
  workedMinutes: number;
  approvedOvertimeMinutes: number;
  laborCost: number;
  productivityPerLaborHour: number;
  costPerGoodUnit: number;
}

export interface OperationEmployee {
  id: string;
  branchId: string;
  code: string;
  name: string;
  role: string;
  status: string;
}

export type ShiftPayrollRow = {
  employeeId: string; employeeName: string; employeeCode: string; branchId: string;
  date: string; shiftId: string; shiftNumber: string; shiftName: string;
  scheduledStart: string; scheduledEnd: string;
  checkInAt: string | null; checkOutAt: string | null;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE';
  lateMinutes: number; overtimeMinutes: number; workedMinutes: number;
  isApprovedOvertime: boolean;
};

export interface OperationShiftAssignmentRow {
  id: string;
  definitionId: string;
  definitionName: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  role: OperationStaffRole;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface OperationShiftSwapRequest {
  id: string;
  requesterEmployeeId: string;
  requesterEmployeeName: string;
  targetEmployeeId: string;
  targetEmployeeName: string;
  requesterShiftId: string;
  requesterShiftName: string;
  requesterShiftDate: string;
  targetShiftId: string;
  targetShiftName: string;
  targetShiftDate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedByName: string;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
}

const WORK_MODES: OperationsWorkMode[] = ['NORMAL', 'TWO_SHIFTS', 'THREE_SHIFTS', 'CONTINUOUS'];
const WORK_MODE_KEY = 'operationsWorkMode';

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function localNow(): string {
  const now = new Date();
  return `${localDateString(now)}T${now.toTimeString().slice(0, 8)}`;
}

function toDateTime(date: string, time: string): string {
  return `${date}T${time.length === 5 ? `${time}:00` : time}`;
}

function timeMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

function durationMinutes(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 60_000));
}

function bool(value: unknown): boolean {
  return Boolean(Number(value));
}

function scheduledWindow(businessDate: string, startTime: string, endTime: string): { start: string; end: string } {
  const start = toDateTime(businessDate, startTime);
  const endSameDay = toDateTime(businessDate, endTime);
  const end = timeMinutes(endTime) <= timeMinutes(startTime)
    ? toDateTime(dateOffset(businessDate, 1), endTime)
    : endSameDay;
  return { start, end };
}

export class OperationsShiftService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'operations.view', 'cashier.view', 'employees.attendance.view',
      'employees.view', 'manufacturing.view',
    ]);
    return actor;
  }

  private requireManage() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'operations.update', 'cashier.manage', 'employees.attendance.manage',
      'employees.manage', 'manufacturing.manage',
    ]);
    return actor;
  }

  private audit(action: string, recordId: string, values?: unknown): void {
    const actor = AuthService.requireAuth();
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'OPERATIONS', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        values == null ? null : JSON.stringify(values)]
    );
  }

  private definitionRows(branchId?: string) {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('s.branch_id', undefined, actor);
    const params: string[] = [...scope.params];
    let sql = `
      SELECT s.id, s.branch_id AS branchId, s.name, s.department, s.location,
             s.shift_code AS shiftCode, s.color, s.start_time AS startTime,
             s.end_time AS endTime, s.break_minutes AS breakMinutes,
             s.grace_minutes AS graceMinutes, s.overtime_after_minutes AS overtimeAfterMinutes,
             s.minimum_staff_count AS minimumStaffCount,
             s.required_rest_minutes AS requiredRestMinutes,
             s.workdays_json AS workdaysJson, s.shift_order AS shiftOrder, s.is_active AS isActive,
             (SELECT COUNT(DISTINCT a.employee_id) FROM operation_shift_assignments a
              WHERE a.definition_id = s.id AND a.effective_from <= date('now')
                AND (a.effective_to IS NULL OR a.effective_to >= date('now'))) AS assignedCount
      FROM attendance_shifts s
      WHERE s.is_active = 1 AND s.is_operations = 1 AND ${scope.clause}`;
    if (branchId) {
      this.branchAccess.requireBranchAccess(branchId, actor);
      sql += ' AND s.branch_id = ?';
      params.push(branchId);
    }
    sql += ' ORDER BY s.shift_order, s.start_time, s.name';
    return this.db.query<any>(sql, params);
  }

  public getShiftDefinitions(branchId?: string): OperationShiftDefinition[] {
    return this.definitionRows(branchId).map((row) => ({
      ...row,
      crossesMidnight: timeMinutes(row.endTime) <= timeMinutes(row.startTime),
      breakMinutes: Number(row.breakMinutes) || 0,
      graceMinutes: Number(row.graceMinutes) || 0,
      overtimeAfterMinutes: Number(row.overtimeAfterMinutes) || 0,
      minimumStaffCount: Number(row.minimumStaffCount) || 0,
      requiredRestMinutes: Number(row.requiredRestMinutes) || 0,
      workdays: JSON.parse(row.workdaysJson || '[0,1,2,3,4]') as number[],
      shiftOrder: Number(row.shiftOrder) || 0,
      isActive: bool(row.isActive),
      assignedCount: Number(row.assignedCount) || 0,
    }));
  }

  public getWorkMode(): OperationsWorkMode {
    this.requireView();
    const row = this.db.query<{ value: string }>(
      'SELECT value FROM system_settings WHERE key = ?',
      [WORK_MODE_KEY]
    )[0];
    return WORK_MODES.includes(row?.value as OperationsWorkMode)
      ? row!.value as OperationsWorkMode
      : 'CONTINUOUS';
  }

  public saveWorkMode(mode: OperationsWorkMode): void {
    this.requireManage();
    if (!WORK_MODES.includes(mode)) throw new Error('نظام العمل المحدد غير صالح.');
    this.db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [WORK_MODE_KEY, mode]);
    this.audit('تعديل نظام تشغيل الورديات', WORK_MODE_KEY, { mode });
  }

  public saveShiftDefinition(input: {
    id?: string;
    branchId?: string;
    name: string;
    department?: string | null;
    location?: string | null;
    shiftCode?: string | null;
    color?: string | null;
    startTime: string;
    endTime: string;
    breakMinutes?: number;
    graceMinutes?: number;
    overtimeAfterMinutes?: number;
    minimumStaffCount?: number;
    requiredRestMinutes?: number;
    workdays?: number[];
    shiftOrder?: number;
    isActive?: boolean;
  }): OperationShiftDefinition {
    const actor = this.requireManage();
    const branchId = input.branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    if (!input.name?.trim()) throw new Error('اسم الوردية مطلوب.');
    if (!isValidTime(input.startTime) || !isValidTime(input.endTime)) {
      throw new Error('وقت بداية ونهاية الوردية غير صالح.');
    }
    for (const [label, value] of [
      ['مدة الاستراحة', input.breakMinutes ?? 0],
      ['مهلة التأخير', input.graceMinutes ?? 0],
      ['مهلة العمل الإضافي', input.overtimeAfterMinutes ?? 0],
      ['الحد الأدنى للعاملين', input.minimumStaffCount ?? 0],
      ['الراحة بين الورديات', input.requiredRestMinutes ?? 480],
    ] as const) {
      if (!Number.isInteger(value) || value < 0 || value > 1440) throw new Error(`${label} غير صحيحة.`);
    }
    const workdays = [...new Set(input.workdays?.length ? input.workdays : [0, 1, 2, 3, 4, 5, 6])]
      .sort((a, b) => a - b);
    if (workdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error('أيام عمل الوردية غير صالحة.');
    }
    if (input.id && this.db.query(
      'SELECT id FROM operation_shifts WHERE definition_id = ? LIMIT 1',
      [input.id]
    ).length) {
      throw new Error('الوردية مستخدمة في ورديات تشغيل سابقة؛ أنشئ وردية جديدة للحفاظ على السجل.');
    }
    const id = input.id || `opsdef_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    this.db.run(
      `INSERT INTO attendance_shifts
         (id, branch_id, name, start_time, end_time, break_minutes, grace_minutes,
          overtime_after_minutes, workdays_json, is_active, department, location,
          shift_code, color, shift_order, is_operations, created_by,
          minimum_staff_count, required_rest_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         break_minutes = excluded.break_minutes,
         grace_minutes = excluded.grace_minutes,
         overtime_after_minutes = excluded.overtime_after_minutes,
         workdays_json = excluded.workdays_json,
         is_active = excluded.is_active,
         department = excluded.department,
         location = excluded.location,
         shift_code = excluded.shift_code,
         color = excluded.color,
         shift_order = excluded.shift_order,
         minimum_staff_count = excluded.minimum_staff_count,
         required_rest_minutes = excluded.required_rest_minutes,
         is_operations = 1,
         updated_at = CURRENT_TIMESTAMP
       WHERE attendance_shifts.branch_id = excluded.branch_id`,
      [id, branchId, input.name.trim(), input.startTime, input.endTime,
        input.breakMinutes ?? 0, input.graceMinutes ?? 0, input.overtimeAfterMinutes ?? 0,
        JSON.stringify(workdays), input.isActive === false ? 0 : 1,
        input.department?.trim() || null, input.location?.trim() || null,
        input.shiftCode?.trim() || null, input.color?.trim() || null,
        input.shiftOrder ?? 0, actor.id, input.minimumStaffCount ?? 0, input.requiredRestMinutes ?? 480]
    );
    const saved = this.getShiftDefinitions(branchId).find((row) => row.id === id);
    if (!saved) throw new Error('تعذر حفظ وردية التشغيل.');
    this.audit(input.id ? 'تعديل وردية تشغيل' : 'إنشاء وردية تشغيل', id, {
      name: saved.name, startTime: saved.startTime, endTime: saved.endTime,
    });
    return saved;
  }

  public deactivateShiftDefinition(id: string): void {
    const actor = this.requireManage();
    const definition = this.db.query<{ branchId: string }>(
      'SELECT branch_id AS branchId FROM attendance_shifts WHERE id = ?',
      [id]
    )[0];
    if (!definition) throw new Error('وردية التشغيل غير موجودة.');
    this.branchAccess.requireBranchAccess(definition.branchId, actor);
    this.db.run('UPDATE attendance_shifts SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    this.audit('إيقاف وردية تشغيل', id);
  }

  public getEmployees(branchId?: string): OperationEmployee[] {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const params: string[] = [...scope.params];
    let sql = `
      SELECT e.id, e.branch_id AS branchId, e.code, e.name, e.role, e.status
      FROM employees e
      WHERE e.status != 'SUSPENDED' AND ${scope.clause}`;
    if (branchId) {
      this.branchAccess.requireBranchAccess(branchId, actor);
      sql += ' AND e.branch_id = ?';
      params.push(branchId);
    }
    sql += ' ORDER BY e.name';
    return this.db.query<OperationEmployee>(sql, params);
  }

  public getAssignments(definitionId?: string): OperationShiftAssignmentRow[] {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('s.branch_id', undefined, actor);
    const params: string[] = [...scope.params];
    let sql = `
      SELECT a.id, a.definition_id AS definitionId, s.name AS definitionName,
             a.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode,
             a.role, a.effective_from AS effectiveFrom, a.effective_to AS effectiveTo
      FROM operation_shift_assignments a
      JOIN attendance_shifts s ON s.id = a.definition_id
      JOIN employees e ON e.id = a.employee_id
      WHERE ${scope.clause}`;
    if (definitionId) {
      sql += ' AND a.definition_id = ?';
      params.push(definitionId);
    }
    sql += ' ORDER BY s.name, a.role DESC, e.name, a.effective_from DESC';
    return this.db.query<OperationShiftAssignmentRow>(sql, params);
  }

  private assertRecurringAssignmentCompatible(
    employeeId: string,
    definitionId: string,
    effectiveFrom: string,
    effectiveTo: string | null
  ): void {
    const candidate = this.db.query<any>(
      `SELECT name, start_time AS startTime, end_time AS endTime,
              workdays_json AS workdaysJson, required_rest_minutes AS requiredRestMinutes
       FROM attendance_shifts WHERE id = ?`,
      [definitionId]
    )[0];
    const existing = this.db.query<any>(
      `SELECT a.definition_id AS definitionId, a.effective_from AS effectiveFrom,
              a.effective_to AS effectiveTo, s.name, s.start_time AS startTime,
              s.end_time AS endTime, s.workdays_json AS workdaysJson,
              s.required_rest_minutes AS requiredRestMinutes
       FROM operation_shift_assignments a
       JOIN attendance_shifts s ON s.id = a.definition_id AND s.is_active = 1
       WHERE a.employee_id = ? AND a.definition_id != ?
         AND a.effective_from <= COALESCE(?, '9999-12-31')
         AND COALESCE(a.effective_to, '9999-12-31') >= ?`,
      [employeeId, definitionId, effectiveTo, effectiveFrom]
    );
    if (!candidate) throw new Error('تعريف الوردية غير موجود.');
    const candidateDays = JSON.parse(candidate.workdaysJson || '[]') as number[];
    for (const assignment of existing) {
      const start = effectiveFrom > assignment.effectiveFrom ? effectiveFrom : assignment.effectiveFrom;
      const ends = [effectiveTo, assignment.effectiveTo].filter((value): value is string => Boolean(value));
      const end = ends.length ? ends.sort()[0] : dateOffset(start, 13);
      const checkedThrough = end < dateOffset(start, 13) ? end : dateOffset(start, 13);
      const existingDays = JSON.parse(assignment.workdaysJson || '[]') as number[];
      for (let date = start; date <= checkedThrough; date = dateOffset(date, 1)) {
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        if (!candidateDays.includes(weekday)) continue;
        const candidateWindow = scheduledWindow(date, candidate.startTime, candidate.endTime);
        const candidateStart = Date.parse(candidateWindow.start);
        const candidateEnd = Date.parse(candidateWindow.end);
        const restMinutes = Math.max(
          Number(candidate.requiredRestMinutes) || 0,
          Number(assignment.requiredRestMinutes) || 0
        );
        for (const existingDate of [dateOffset(date, -1), date, dateOffset(date, 1)]) {
          if (existingDate < assignment.effectiveFrom
            || (assignment.effectiveTo && existingDate > assignment.effectiveTo)
            || !existingDays.includes(new Date(`${existingDate}T00:00:00Z`).getUTCDay())) continue;
          const existingWindow = scheduledWindow(existingDate, assignment.startTime, assignment.endTime);
          const existingStart = Date.parse(existingWindow.start);
          const existingEnd = Date.parse(existingWindow.end);
          const overlap = candidateStart < existingEnd && existingStart < candidateEnd;
          const restGap = candidateStart >= existingEnd
            ? candidateStart - existingEnd
            : existingStart >= candidateEnd
              ? existingStart - candidateEnd
              : -1;
          if (overlap || restGap < restMinutes * 60_000) {
            throw new Error(`تعارض وردية أو راحة غير كافية مع «${assignment.name}» للموظف.`);
          }
        }
      }
    }
  }

  public assignEmployee(input: {
    definitionId: string;
    employeeId: string;
    role?: OperationStaffRole;
    effectiveFrom: string;
    effectiveTo?: string | null;
  }): OperationShiftAssignmentRow {
    const actor = this.requireManage();
    if (!isValidDate(input.effectiveFrom)) throw new Error('تاريخ بدء التعيين غير صالح.');
    if (input.effectiveTo && (!isValidDate(input.effectiveTo) || input.effectiveTo < input.effectiveFrom)) {
      throw new Error('تاريخ انتهاء التعيين غير صالح.');
    }
    const definition = this.db.query<{ branchId: string }>(
      'SELECT branch_id AS branchId FROM attendance_shifts WHERE id = ? AND is_active = 1',
      [input.definitionId]
    )[0];
    if (!definition) throw new Error('وردية التشغيل غير موجودة أو غير نشطة.');
    this.branchAccess.requireBranchAccess(definition.branchId, actor);
    const employee = this.db.query<{ branchId: string }>(
      'SELECT branch_id AS branchId FROM employees WHERE id = ? AND status != ?',
      [input.employeeId, 'SUSPENDED']
    )[0];
    if (!employee) throw new Error('الموظف غير موجود.');
    if (employee.branchId !== definition.branchId) throw new Error('الموظف لا يتبع فرع وردية التشغيل.');
    this.assertRecurringAssignmentCompatible(
      input.employeeId, input.definitionId, input.effectiveFrom, input.effectiveTo || null
    );
    const id = `opsassign_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    this.db.run(
      `INSERT INTO operation_shift_assignments
         (id, definition_id, employee_id, role, effective_from, effective_to, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(definition_id, employee_id, effective_from) DO UPDATE SET
         role = excluded.role, effective_to = excluded.effective_to`,
      [id, input.definitionId, input.employeeId, input.role === 'SUPERVISOR' ? 'SUPERVISOR' : 'STAFF',
        input.effectiveFrom, input.effectiveTo || null, actor.id]
    );
    this.audit('تعيين موظف على وردية تشغيل', input.definitionId, {
      employeeId: input.employeeId, role: input.role || 'STAFF', from: input.effectiveFrom,
    });
    return this.getAssignments(input.definitionId)
      .find((row) => row.employeeId === input.employeeId && row.effectiveFrom === input.effectiveFrom)!;
  }

  public removeAssignment(id: string): void {
    const actor = this.requireManage();
    const row = this.db.query<{ branchId: string }>(
      `SELECT s.branch_id AS branchId
       FROM operation_shift_assignments a
       JOIN attendance_shifts s ON s.id = a.definition_id
       WHERE a.id = ?`,
      [id]
    )[0];
    if (!row) throw new Error('تعيين الوردية غير موجود.');
    this.branchAccess.requireBranchAccess(row.branchId, actor);
    this.db.run('DELETE FROM operation_shift_assignments WHERE id = ?', [id]);
    this.audit('إلغاء تعيين موظف على وردية تشغيل', id);
  }

  /**
   * Materialise shift instances from the active definitions for a date range.
   * Safe to call on every page load; duplicates are ignored by the unique
   * (definition_id, business_date) constraint.
   */
  public ensureShiftInstances(from: string, to: string, branchId?: string): number {
    const actor = this.requireView();
    if (!isValidDate(from) || !isValidDate(to) || to < from) {
      throw new Error('فترة إنشاء الورديات غير صالحة.');
    }
    const targetBranch = branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(targetBranch, actor);
    const definitions = this.definitionRows(targetBranch);
    if (!definitions.length) return 0;

    const holidays = new Set(this.db.query<{ date: string }>(
      'SELECT date FROM attendance_holidays WHERE branch_id = ? AND date BETWEEN ? AND ?',
      [targetBranch, from, to]
    ).map((row) => row.date));
    const now = localNow();
    let created = 0;

    this.db.executeTransaction((db) => {
      for (let date = from; date <= to; date = dateOffset(date, 1)) {
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        for (const definition of definitions) {
          const workdays = JSON.parse(definition.workdaysJson || '[]') as number[];
          if (!workdays.includes(weekday) || holidays.has(date)) continue;
          const window = scheduledWindow(date, definition.startTime, definition.endTime);
          const status = window.end < now ? 'MISSED' : 'PLANNED';
          const before = this.db.query<{ id: string }>(
            'SELECT id FROM operation_shifts WHERE definition_id = ? AND business_date = ?',
            [definition.id, date]
          ).length;
          if (before) continue;
          db.run(
            `INSERT OR IGNORE INTO operation_shifts
               (id, shift_number, definition_id, branch_id, business_date,
                scheduled_start, scheduled_end, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [`opshift_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
              `OP-${date.replace(/-/g, '')}-${uuidv4().replace(/-/g, '').slice(0, 4).toUpperCase()}`,
              definition.id, targetBranch, date, window.start, window.end, status]
          );
          if (!before) created += 1;
        }
      }
    });
    this.seedAssignedStaff(from, to, targetBranch);
    this.refreshMissedShifts(targetBranch);
    return created;
  }

  /** Auto-generate the current week and the next seven days. */
  public syncShiftLifecycle(today = localDateString()): number {
    return this.ensureShiftInstances(dateOffset(today, -1), dateOffset(today, 7));
  }

  private isOnApprovedLeave(employeeId: string, date: string): boolean {
    return this.db.query(
      `SELECT id FROM employee_leave_requests
       WHERE employee_id = ? AND status = 'APPROVED'
         AND start_date <= ? AND end_date >= ? LIMIT 1`,
      [employeeId, date, date]
    ).length > 0;
  }

  private scheduleConflict(
    employeeId: string,
    shift: Pick<OperationShiftInstance, 'id' | 'branchId' | 'scheduledStart' | 'scheduledEnd'>,
    excludedShiftIds: string[] = []
  ): string | null {
    const rows = this.db.query<any>(
      `SELECT os.id, os.scheduled_start AS scheduledStart, os.scheduled_end AS scheduledEnd,
              d.name AS definitionName, d.required_rest_minutes AS requiredRestMinutes
       FROM operation_shift_staff st
       JOIN operation_shifts os ON os.id = st.operation_shift_id
       JOIN attendance_shifts d ON d.id = os.definition_id
       WHERE st.employee_id = ? AND os.branch_id = ?
         AND os.status != 'CANCELLED'
         AND os.business_date BETWEEN ? AND ?
         AND st.status NOT IN ('ABSENT', 'LEAVE')`,
      [employeeId, shift.branchId,
        dateOffset(shift.scheduledStart.slice(0, 10), -2),
        dateOffset(shift.scheduledStart.slice(0, 10), 2)]
    );
    const targetStart = Date.parse(shift.scheduledStart);
    const targetEnd = Date.parse(shift.scheduledEnd);
    for (const row of rows) {
      if (row.id === shift.id || excludedShiftIds.includes(row.id)) continue;
      const currentStart = Date.parse(row.scheduledStart);
      const currentEnd = Date.parse(row.scheduledEnd);
      const overlap = targetStart < currentEnd && currentStart < targetEnd;
      const restGap = targetStart >= currentEnd
        ? targetStart - currentEnd
        : currentStart >= targetEnd
          ? currentStart - targetEnd
          : -1;
      const candidateRest = this.db.query<{ requiredRestMinutes: number }>(
        `SELECT required_rest_minutes AS requiredRestMinutes FROM attendance_shifts
         WHERE id = (SELECT definition_id FROM operation_shifts WHERE id = ?)`,
        [shift.id]
      )[0]?.requiredRestMinutes || 0;
      const requiredRest = Math.max(Number(row.requiredRestMinutes) || 0, Number(candidateRest) || 0);
      if (overlap) return `تعارض مع وردية «${row.definitionName}».`;
      if (restGap < requiredRest * 60_000) {
        return `فترة الراحة بين الورديات أقل من ${requiredRest} دقيقة.`;
      }
    }
    return null;
  }

  private assertEmployeeAvailable(
    employeeId: string,
    shift: Pick<OperationShiftInstance, 'id' | 'branchId' | 'scheduledStart' | 'scheduledEnd' | 'businessDate'>,
    excludedShiftIds: string[] = []
  ): void {
    if (this.isOnApprovedLeave(employeeId, shift.businessDate)) {
      throw new Error('الموظف في إجازة معتمدة خلال تاريخ الوردية.');
    }
    const conflict = this.scheduleConflict(employeeId, shift, excludedShiftIds);
    if (conflict) throw new Error(conflict);
  }

  private seedAssignedStaff(from: string, to: string, branchId: string): void {
    const rows = this.db.query<{ id: string; definitionId: string; businessDate: string; branchId: string;
      scheduledStart: string; scheduledEnd: string }>(
      `SELECT id, definition_id AS definitionId, business_date AS businessDate,
              branch_id AS branchId, scheduled_start AS scheduledStart, scheduled_end AS scheduledEnd
       FROM operation_shifts WHERE branch_id = ? AND business_date BETWEEN ? AND ?
         AND status IN ('PLANNED', 'MISSED') ORDER BY scheduled_start`,
      [branchId, from, to]
    );
    for (const shift of rows) {
      for (const assignment of this.currentAssignments(shift.definitionId, shift.businessDate)) {
        if (this.db.query(
          'SELECT id FROM operation_shift_staff WHERE operation_shift_id = ? AND employee_id = ?',
          [shift.id, assignment.employeeId]
        ).length || this.isOnApprovedLeave(assignment.employeeId, shift.businessDate)) continue;
        if (this.scheduleConflict(assignment.employeeId, shift)) continue;
        this.db.run(
          `INSERT OR IGNORE INTO operation_shift_staff
             (id, operation_shift_id, employee_id, role, status)
           VALUES (?, ?, ?, ?, 'PRESENT')`,
          [`opstaff_${uuidv4().replace(/-/g, '').slice(0, 14)}`, shift.id,
            assignment.employeeId, assignment.role]
        );
      }
    }
  }

  public generateWorkforceSchedule(from: string, to: string, branchId?: string): {
    shiftsCreated: number;
    staffAssigned: number;
    shortages: Array<{ shiftId: string; name: string; date: string; shortageCount: number }>;
  } {
    const actor = this.requireManage();
    if (!isValidDate(from) || !isValidDate(to) || to < from) {
      throw new Error('فترة إنشاء جدول الورديات غير صالحة.');
    }
    const targetBranch = branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(targetBranch, actor);
    const shiftsCreated = this.ensureShiftInstances(from, to, targetBranch);
    const shifts = this.db.query<any>(
      `SELECT os.id, os.definition_id AS definitionId, os.branch_id AS branchId,
              os.business_date AS businessDate, os.scheduled_start AS scheduledStart,
              os.scheduled_end AS scheduledEnd, d.name, d.minimum_staff_count AS minimumStaffCount
       FROM operation_shifts os JOIN attendance_shifts d ON d.id = os.definition_id
       WHERE os.branch_id = ? AND os.business_date BETWEEN ? AND ?
         AND os.status IN ('PLANNED', 'MISSED') ORDER BY os.scheduled_start`,
      [targetBranch, from, to]
    );
    const employees = this.db.query<OperationEmployee>(
      `SELECT id, branch_id AS branchId, code, name, role, status FROM employees
       WHERE branch_id = ? AND status IN ('ACTIVE', 'PROBATION') ORDER BY name`,
      [targetBranch]
    );
    let staffAssigned = 0;
    for (const row of shifts) {
      const existing = this.db.query<{ employeeId: string; role: OperationStaffRole; status: string }>(
        `SELECT employee_id AS employeeId, role, status FROM operation_shift_staff
         WHERE operation_shift_id = ?`,
        [row.id]
      );
      let eligibleCount = existing.filter((staff) => !['ABSENT', 'LEAVE'].includes(staff.status)).length;
      const required = Math.max(0, Number(row.minimumStaffCount) || 0);
      if (eligibleCount >= required) continue;
      const assigned = this.currentAssignments(row.definitionId, row.businessDate);
      const assignedIds = new Set(assigned.map((assignment) => assignment.employeeId));
      const scheduledCounts = new Map(this.db.query<{ employeeId: string; count: number }>(
        `SELECT st.employee_id AS employeeId, COUNT(*) AS count
         FROM operation_shift_staff st JOIN operation_shifts os ON os.id = st.operation_shift_id
         WHERE os.branch_id = ? AND os.business_date BETWEEN ? AND ?
           AND st.status NOT IN ('ABSENT', 'LEAVE')
         GROUP BY st.employee_id`,
        [targetBranch, from, to]
      ).map((entry) => [entry.employeeId, Number(entry.count) || 0]));
      const candidates = [
        ...assigned.map((assignment) => employees.find((employee) => employee.id === assignment.employeeId))
          .filter((employee): employee is OperationEmployee => Boolean(employee)),
        ...employees.filter((employee) => !assignedIds.has(employee.id)),
      ].sort((left, right) => (scheduledCounts.get(left.id) || 0) - (scheduledCounts.get(right.id) || 0)
        || left.name.localeCompare(right.name));
      for (const employee of candidates) {
        if (eligibleCount >= required) break;
        if (existing.some((staff) => staff.employeeId === employee.id)
          || this.isOnApprovedLeave(employee.id, row.businessDate)) continue;
        const conflict = this.scheduleConflict(employee.id, row);
        if (conflict) continue;
        const role = assigned.find((assignment) => assignment.employeeId === employee.id)?.role || 'STAFF';
        this.db.run(
          `INSERT OR IGNORE INTO operation_shift_staff
             (id, operation_shift_id, employee_id, role, status)
           VALUES (?, ?, ?, ?, 'PRESENT')`,
          [`opstaff_${uuidv4().replace(/-/g, '').slice(0, 14)}`, row.id, employee.id, role]
        );
        existing.push({ employeeId: employee.id, role, status: 'PRESENT' });
        eligibleCount += 1;
        staffAssigned += 1;
      }
    }
    const roster = this.getShiftBoard({ from, to, branchId: targetBranch });
    const shortages = roster.filter((shift) => shift.shortageCount > 0).map((shift) => ({
      shiftId: shift.id,
      name: shift.definitionName,
      date: shift.businessDate,
      shortageCount: shift.shortageCount,
    }));
    return { shiftsCreated, staffAssigned, shortages };
  }

  public getShiftSwapRequests(from?: string, to?: string): OperationShiftSwapRequest[] {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('rs.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string> = [...scope.params];
    if (from) {
      if (!isValidDate(from)) throw new Error('تاريخ بداية طلبات التبديل غير صالح.');
      conditions.push('rs.business_date >= ?');
      params.push(from);
    }
    if (to) {
      if (!isValidDate(to)) throw new Error('تاريخ نهاية طلبات التبديل غير صالح.');
      conditions.push('rs.business_date <= ?');
      params.push(to);
    }
    return this.db.query<OperationShiftSwapRequest>(
      `SELECT r.id, r.requester_employee_id AS requesterEmployeeId,
              requester.name AS requesterEmployeeName,
              r.target_employee_id AS targetEmployeeId, target.name AS targetEmployeeName,
              r.requester_shift_id AS requesterShiftId, rd.name AS requesterShiftName,
              rs.business_date AS requesterShiftDate,
              r.target_shift_id AS targetShiftId, td.name AS targetShiftName,
              ts.business_date AS targetShiftDate, r.status,
              requested.full_name AS requestedByName, r.requested_at AS requestedAt,
              decided.full_name AS decidedByName, r.decided_at AS decidedAt,
              r.decision_notes AS decisionNotes
       FROM operation_shift_swap_requests r
       JOIN operation_shifts rs ON rs.id = r.requester_shift_id
       JOIN operation_shifts ts ON ts.id = r.target_shift_id
       JOIN attendance_shifts rd ON rd.id = rs.definition_id
       JOIN attendance_shifts td ON td.id = ts.definition_id
       JOIN employees requester ON requester.id = r.requester_employee_id
       JOIN employees target ON target.id = r.target_employee_id
       JOIN users requested ON requested.id = r.requested_by
       LEFT JOIN users decided ON decided.id = r.decided_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END, r.requested_at DESC LIMIT 200`,
      params
    );
  }

  public requestShiftSwap(input: {
    requesterEmployeeId: string;
    targetEmployeeId: string;
    requesterShiftId: string;
    targetShiftId: string;
  }): OperationShiftSwapRequest {
    const actor = this.requireManage();
    if (input.requesterEmployeeId === input.targetEmployeeId || input.requesterShiftId === input.targetShiftId) {
      throw new Error('اختر موظفين وورديتين مختلفتين لطلب التبديل.');
    }
    const requesterShift = this.getInstance(input.requesterShiftId);
    const targetShift = this.getInstance(input.targetShiftId);
    if (requesterShift.branchId !== targetShift.branchId) throw new Error('يجب أن تكون الوردية في الفرع نفسه.');
    if (![requesterShift.status, targetShift.status].every((status) => status === 'PLANNED')) {
      throw new Error('يمكن طلب التبديل بين ورديات لم تبدأ فقط.');
    }
    for (const [shiftId, employeeId] of [
      [input.requesterShiftId, input.requesterEmployeeId],
      [input.targetShiftId, input.targetEmployeeId],
    ]) {
      if (!this.db.query(
        `SELECT id FROM operation_shift_staff
         WHERE operation_shift_id = ? AND employee_id = ? AND status NOT IN ('ABSENT', 'LEAVE')`,
        [shiftId, employeeId]
      ).length) throw new Error('يجب أن يكون كل موظف مسجلاً في ورديته قبل طلب التبديل.');
    }
    const id = `opsswap_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    this.db.run(
      `INSERT INTO operation_shift_swap_requests
         (id, requester_employee_id, target_employee_id, requester_shift_id, target_shift_id, requested_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.requesterEmployeeId, input.targetEmployeeId,
        input.requesterShiftId, input.targetShiftId, actor.id]
    );
    this.audit('طلب تبديل وردية', id, input);
    return this.getShiftSwapRequests().find((request) => request.id === id)!;
  }

  public decideShiftSwap(requestId: string, approve: boolean, notes = ''): void {
    const actor = this.requireManage();
    const request = this.db.query<any>(
      `SELECT r.*, rs.branch_id AS requesterBranchId, ts.branch_id AS targetBranchId,
              rs.scheduled_start AS requesterStart, rs.scheduled_end AS requesterEnd,
              ts.scheduled_start AS targetStart, ts.scheduled_end AS targetEnd,
              rs.business_date AS requesterDate, ts.business_date AS targetDate
       FROM operation_shift_swap_requests r
       JOIN operation_shifts rs ON rs.id = r.requester_shift_id
       JOIN operation_shifts ts ON ts.id = r.target_shift_id WHERE r.id = ?`,
      [requestId]
    )[0];
    if (!request) throw new Error('طلب تبديل الوردية غير موجود.');
    this.branchAccess.requireBranchAccess(request.requesterBranchId, actor);
    if (request.requesterBranchId !== request.targetBranchId) throw new Error('الوردية المستهدفة خارج الفرع.');
    if (request.status !== 'PENDING') throw new Error('تم البت في طلب التبديل سابقاً.');
    if (approve) {
      const requesterTarget = this.getInstance(request.targetShiftId);
      const targetTarget = this.getInstance(request.requesterShiftId);
      if (requesterTarget.status !== 'PLANNED' || targetTarget.status !== 'PLANNED') {
        throw new Error('لا يمكن اعتماد التبديل بعد بدء إحدى الورديتين.');
      }
      this.assertEmployeeAvailable(request.requesterEmployeeId, requesterTarget,
        [request.requesterShiftId, request.targetShiftId]);
      this.assertEmployeeAvailable(request.targetEmployeeId, targetTarget,
        [request.requesterShiftId, request.targetShiftId]);
      this.db.executeTransaction((db) => {
        db.run(
          `UPDATE operation_shift_staff SET employee_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE operation_shift_id = ? AND employee_id = ?`,
          [request.targetEmployeeId, request.requesterShiftId, request.requesterEmployeeId]
        );
        db.run(
          `UPDATE operation_shift_staff SET employee_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE operation_shift_id = ? AND employee_id = ?`,
          [request.requesterEmployeeId, request.targetShiftId, request.targetEmployeeId]
        );
        db.run(
          `UPDATE operation_shift_swap_requests SET status = 'APPROVED', decided_by = ?,
             decided_at = CURRENT_TIMESTAMP, decision_notes = ? WHERE id = ? AND status = 'PENDING'`,
          [actor.id, notes.trim() || null, requestId]
        );
      });
    } else {
      this.db.run(
        `UPDATE operation_shift_swap_requests SET status = 'REJECTED', decided_by = ?,
           decided_at = CURRENT_TIMESTAMP, decision_notes = ? WHERE id = ? AND status = 'PENDING'`,
        [actor.id, notes.trim() || null, requestId]
      );
    }
    this.audit(approve ? 'اعتماد تبديل وردية' : 'رفض تبديل وردية', requestId, { notes });
  }

  private refreshMissedShifts(branchId: string): void {
    this.db.run(
      `UPDATE operation_shifts
       SET status = 'MISSED', updated_at = CURRENT_TIMESTAMP
       WHERE branch_id = ? AND status = 'PLANNED' AND scheduled_end < ?`,
      [branchId, localNow()]
    );
  }

  public getShiftBoard(options: { from?: string; to?: string; branchId?: string } = {}): OperationShiftInstance[] {
    const actor = this.requireView();
    const branchId = options.branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    const today = localDateString();
    const from = options.from || dateOffset(today, -7);
    const to = options.to || dateOffset(today, 7);
    this.ensureShiftInstances(from, to, branchId);
    const rows = this.db.query<any>(
      `SELECT os.*, d.name AS definitionName, d.department, d.location,
              d.minimum_staff_count AS minimumStaffCount,
              sup.name AS supervisorName, opener.full_name AS openedByName,
              h.status AS handoverStatus, h.expected_cash AS handoverExpected,
              h.actual_cash AS handoverActual, h.cash_difference AS handoverDifference,
              (SELECT COUNT(*) FROM operation_shift_staff st
               WHERE st.operation_shift_id = os.id AND st.status NOT IN ('ABSENT', 'LEAVE')) AS staffCount,
              (SELECT COUNT(*) FROM operation_shift_staff st
               WHERE st.operation_shift_id = os.id AND st.check_in_at IS NOT NULL) AS presentCount,
              (SELECT COALESCE(SUM(p.produced_qty), 0) FROM operation_shift_production p
               WHERE p.operation_shift_id = os.id) AS producedQty,
              (SELECT COALESCE(SUM(p.scrap_qty), 0) FROM operation_shift_production p
               WHERE p.operation_shift_id = os.id) AS scrapQty,
              (SELECT COUNT(*) FROM operation_shift_incidents i
               WHERE i.operation_shift_id = os.id AND i.resolved_at IS NULL) AS openIncidents
       FROM operation_shifts os
       JOIN attendance_shifts d ON d.id = os.definition_id
       LEFT JOIN employees sup ON sup.id = os.supervisor_id
       LEFT JOIN users opener ON opener.id = os.opened_by
       LEFT JOIN operation_shift_handovers h ON h.operation_shift_id = os.id
       WHERE os.branch_id = ? AND os.business_date BETWEEN ? AND ?
       ORDER BY os.scheduled_start DESC`,
      [branchId, from, to]
    );
    return rows.map((row) => this.mapInstance(row));
  }

  private mapInstance(row: any): OperationShiftInstance {
    const cash = this.getCashSummary(row.id);
    return {
      ...row,
      shiftNumber: row.shift_number ?? row.shiftNumber,
      definitionId: row.definition_id ?? row.definitionId,
      definitionName: row.definitionName,
      department: row.department ?? null,
      location: row.location ?? null,
      branchId: row.branch_id ?? row.branchId,
      businessDate: row.business_date ?? row.businessDate,
      scheduledStart: row.scheduled_start ?? row.scheduledStart,
      scheduledEnd: row.scheduled_end ?? row.scheduledEnd,
      status: row.status,
      supervisorId: row.supervisor_id ?? row.supervisorId ?? null,
      supervisorName: row.supervisorName ?? null,
      openedBy: row.opened_by ?? row.openedBy ?? null,
      openedByName: row.openedByName ?? null,
      openedAt: row.opened_at ?? row.openedAt ?? null,
      closedAt: row.closed_at ?? row.closedAt ?? null,
      staffCount: Number(row.staffCount) || 0,
      presentCount: Number(row.presentCount) || 0,
      minimumStaffCount: Number(row.minimumStaffCount) || 0,
      shortageCount: Math.max(0,
        (Number(row.minimumStaffCount) || 0) - (Number(row.staffCount) || 0)),
      expectedCash: Number(row.handoverExpected ?? cash.expected) || 0,
      actualCash: Number(row.handoverActual ?? cash.actual) || 0,
      cashDifference: Number(row.handoverDifference ?? cash.difference) || 0,
      producedQty: Number(row.producedQty) || 0,
      scrapQty: Number(row.scrapQty) || 0,
      openIncidents: Number(row.openIncidents) || 0,
      handoverStatus: row.handoverStatus ?? null,
      createdAt: row.createdAt || row.created_at,
      updatedAt: row.updatedAt || row.updated_at,
    };
  }

  public getOpenShiftForBranch(branchId?: string): OperationShiftInstance | null {
    const actor = this.requireView();
    const target = branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(target, actor);
    const row = this.db.query<any>(
      `SELECT os.*, d.name AS definitionName, d.department, d.location,
              d.minimum_staff_count AS minimumStaffCount,
              sup.name AS supervisorName, opener.full_name AS openedByName,
              h.status AS handoverStatus, h.expected_cash AS handoverExpected,
              h.actual_cash AS handoverActual, h.cash_difference AS handoverDifference,
              (SELECT COUNT(*) FROM operation_shift_staff st
               WHERE st.operation_shift_id = os.id AND st.status NOT IN ('ABSENT', 'LEAVE')) AS staffCount,
              (SELECT COUNT(*) FROM operation_shift_staff st
               WHERE st.operation_shift_id = os.id AND st.check_in_at IS NOT NULL) AS presentCount,
              (SELECT COALESCE(SUM(p.produced_qty), 0) FROM operation_shift_production p
               WHERE p.operation_shift_id = os.id) AS producedQty,
              (SELECT COALESCE(SUM(p.scrap_qty), 0) FROM operation_shift_production p
               WHERE p.operation_shift_id = os.id) AS scrapQty,
              (SELECT COUNT(*) FROM operation_shift_incidents i
               WHERE i.operation_shift_id = os.id AND i.resolved_at IS NULL) AS openIncidents
       FROM operation_shifts os
       JOIN attendance_shifts d ON d.id = os.definition_id
       LEFT JOIN employees sup ON sup.id = os.supervisor_id
       LEFT JOIN users opener ON opener.id = os.opened_by
       LEFT JOIN operation_shift_handovers h ON h.operation_shift_id = os.id
       WHERE os.branch_id = ? AND os.status IN ('OPEN', 'HANDOVER_PENDING')
       ORDER BY os.opened_at DESC LIMIT 1`,
      [target]
    )[0];
    return row ? this.mapInstance(row) : null;
  }

  private getInstance(id: string): OperationShiftInstance {
    const actor = this.requireView();
    const row = this.db.query<any>(
      `SELECT os.*, d.name AS definitionName, d.department, d.location,
              d.minimum_staff_count AS minimumStaffCount,
              sup.name AS supervisorName, opener.full_name AS openedByName,
              h.status AS handoverStatus, h.expected_cash AS handoverExpected,
              h.actual_cash AS handoverActual, h.cash_difference AS handoverDifference,
              (SELECT COUNT(*) FROM operation_shift_staff st
               WHERE st.operation_shift_id = os.id AND st.status NOT IN ('ABSENT', 'LEAVE')) AS staffCount,
              (SELECT COUNT(*) FROM operation_shift_staff st
               WHERE st.operation_shift_id = os.id AND st.check_in_at IS NOT NULL) AS presentCount,
              (SELECT COALESCE(SUM(p.produced_qty), 0) FROM operation_shift_production p
               WHERE p.operation_shift_id = os.id) AS producedQty,
              (SELECT COALESCE(SUM(p.scrap_qty), 0) FROM operation_shift_production p
               WHERE p.operation_shift_id = os.id) AS scrapQty,
              (SELECT COUNT(*) FROM operation_shift_incidents i
               WHERE i.operation_shift_id = os.id AND i.resolved_at IS NULL) AS openIncidents
       FROM operation_shifts os
       JOIN attendance_shifts d ON d.id = os.definition_id
       LEFT JOIN employees sup ON sup.id = os.supervisor_id
       LEFT JOIN users opener ON opener.id = os.opened_by
       LEFT JOIN operation_shift_handovers h ON h.operation_shift_id = os.id
       WHERE os.id = ?`,
      [id]
    )[0];
    if (!row) throw new Error('وردية التشغيل غير موجودة.');
    this.branchAccess.requireBranchAccess(row.branchId, actor);
    return this.mapInstance(row);
  }

  public getCashSummary(operationShiftId: string): OperationCashSummary {
    const rows = this.db.query<any>(
      `SELECT status, expected_ending_cash AS expectedEndingCash, actual_ending_cash AS actualEndingCash,
              cash_difference AS cashDifference, opening_balance AS openingBalance,
              total_sales_cash AS totalSalesCash, total_customer_payments AS totalCustomerPayments,
              total_supplier_payments AS totalSupplierPayments, total_expenses AS totalExpenses,
              total_refunds AS totalRefunds, total_partner_inflows AS totalPartnerInflows,
              total_partner_outflows AS totalPartnerOutflows
       FROM cash_shifts WHERE operation_shift_id = ?`,
      [operationShiftId]
    );
    let expected = 0;
    let actual = 0;
    let difference = 0;
    let openShifts = 0;
    let closedShifts = 0;
    for (const row of rows) {
      if (row.status === 'CLOSED') {
        expected += Number(row.expectedEndingCash) || 0;
        actual += Number(row.actualEndingCash) || 0;
        difference += Number(row.cashDifference) || 0;
        closedShifts += 1;
      } else {
        expected += Number(row.openingBalance || 0) + Number(row.totalSalesCash || 0)
          + Number(row.totalCustomerPayments || 0) - Number(row.totalSupplierPayments || 0)
          - Number(row.totalExpenses || 0) - Number(row.totalRefunds || 0)
          + Number(row.totalPartnerInflows || 0) - Number(row.totalPartnerOutflows || 0);
        openShifts += 1;
      }
    }
    const delivered = Number(this.db.query<{ value: number }>(
      `SELECT COALESCE(SUM(cash_delivered), 0) AS value FROM operation_shift_handovers
       WHERE operation_shift_id = ? AND status IN ('PENDING', 'RECEIVED')`,
      [operationShiftId]
    )[0]?.value || 0);
    const round = (value: number) => Number(value.toFixed(2));
    return {
      expected: round(expected), actual: round(actual), difference: round(difference),
      delivered: round(delivered), openShifts, closedShifts,
    };
  }

  public getShiftDetail(id: string): OperationShiftDetail {
    const shift = this.getInstance(id);
    const staff = this.db.query<OperationShiftStaff>(
      `SELECT st.id, st.operation_shift_id AS operationShiftId, st.employee_id AS employeeId,
              e.name AS employeeName, e.code AS employeeCode, st.role, st.status,
              st.check_in_at AS checkInAt, st.check_out_at AS checkOutAt,
              st.late_minutes AS lateMinutes, st.overtime_minutes AS overtimeMinutes, st.notes
       FROM operation_shift_staff st JOIN employees e ON e.id = st.employee_id
       WHERE st.operation_shift_id = ? ORDER BY st.role DESC, e.name`,
      [id]
    );
    const handoverRow = this.db.query<any>(
      `SELECT h.*, u.full_name AS submittedByName, r.full_name AS receivedByName
       FROM operation_shift_handovers h
       LEFT JOIN users u ON u.id = h.submitted_by
       LEFT JOIN users r ON r.id = h.received_by
       WHERE h.operation_shift_id = ?`,
      [id]
    )[0];
    const incidents = this.db.query<OperationShiftIncident>(
      `SELECT i.id, i.operation_shift_id AS operationShiftId, i.type, i.severity, i.title,
              i.description, i.started_at AS startedAt, i.resolved_at AS resolvedAt,
              i.resolution_notes AS resolutionNotes, i.reported_by AS reportedBy,
              u.full_name AS reportedByName
       FROM operation_shift_incidents i
       LEFT JOIN users u ON u.id = i.reported_by
       WHERE i.operation_shift_id = ? ORDER BY i.created_at DESC`,
      [id]
    );
    const production = this.getProduction(id);
    const cashShifts = this.db.query<any>(
      `SELECT cs.id, cs.shift_number AS shiftNumber, cs.user_id AS userId,
              u.full_name AS userName, cr.name AS registerName, cs.status,
              cs.opened_at AS openedAt, cs.closed_at AS closedAt,
              cs.opening_balance AS openingBalance, cs.expected_ending_cash AS expectedEndingCash,
              cs.actual_ending_cash AS actualEndingCash, cs.cash_difference AS cashDifference
       FROM cash_shifts cs
       JOIN users u ON u.id = cs.user_id
       JOIN cash_registers cr ON cr.id = cs.register_id
       WHERE cs.operation_shift_id = ? ORDER BY cs.opened_at`,
      [id]
    );
    const attendancePeriods = this.getPeriods({ operationShiftId: id });
    const openProductionOrders = this.db.query<any>(
      `SELECT po.id, po.order_number AS orderNumber, p.name AS productName, po.quantity,
              po.status, po.due_date AS dueDate
       FROM production_orders po JOIN products p ON p.id = po.product_id
       WHERE po.branch_id = ? AND po.status IN ('RELEASED', 'IN_PROGRESS')
       ORDER BY po.due_date, po.created_at LIMIT 25`,
      [shift.branchId]
    );
    return {
      shift, staff, handover: handoverRow ? this.mapHandover(handoverRow) : null,
      incidents, production, cashShifts, cashSummary: this.getCashSummary(id),
      attendancePeriods, openProductionOrders,
    };
  }

  private mapHandover(row: any): OperationShiftHandover {
    return {
      ...row,
      expectedCash: Number(row.expectedCash) || 0,
      actualCash: Number(row.actualCash) || 0,
      cashDifference: Number(row.cashDifference) || 0,
      cashDelivered: Number(row.cashDelivered) || 0,
      pendingOrders: this.parseArray(row.pendingOrdersJson),
      nextStaffIds: this.parseArray(row.nextStaffJson),
      inventoryStatus: row.inventoryStatus || '',
      equipmentStatus: row.equipmentStatus || '',
      notes: row.notes || '',
      receivedNotes: row.receivedNotes || null,
    };
  }

  private parseArray(value: unknown): string[] {
    try {
      const parsed = JSON.parse(String(value || '[]'));
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private assertEmployeeInBranch(employeeId: string, branchId: string): OperationEmployee {
    const employee = this.db.query<OperationEmployee>(
      `SELECT id, branch_id AS branchId, code, name, role, status FROM employees
       WHERE id = ? AND status != 'SUSPENDED'`,
      [employeeId]
    )[0];
    if (!employee) throw new Error('الموظف غير موجود أو موقوف.');
    if (employee.branchId !== branchId) throw new Error('الموظف لا يتبع فرع وردية التشغيل.');
    return employee;
  }

  private currentAssignments(definitionId: string, businessDate: string): Array<{ employeeId: string; role: OperationStaffRole }> {
    return this.db.query<{ employeeId: string; role: OperationStaffRole }>(
      `SELECT employee_id AS employeeId, role
       FROM operation_shift_assignments
       WHERE definition_id = ? AND effective_from <= ?
         AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY role DESC, employee_id`,
      [definitionId, businessDate, businessDate]
    );
  }

  private insertPeriod(
    employeeId: string,
    operationShiftId: string,
    businessDate: string,
    checkInAt: string,
    recordedBy: string,
    source = 'OPERATIONS_SHIFT'
  ): string {
    const id = `attperiod_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    this.db.run(
      `INSERT INTO employee_attendance_periods
         (id, employee_id, operation_shift_id, attendance_date, check_in_at, status, source, recorded_by)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
      [id, employeeId, operationShiftId, businessDate, checkInAt, source, recordedBy]
    );
    return id;
  }

  public openShift(id: string, input: {
    supervisorId?: string | null;
    employeeIds?: string[];
    notes?: string;
  } = {}): OperationShiftDetail {
    const actor = this.requireManage();
    const shift = this.getInstance(id);
    if (shift.status !== 'PLANNED' && shift.status !== 'MISSED') {
      throw new Error('لا يمكن فتح وردية إلا إذا كانت مخططة أو فائتة.');
    }
    const alreadyOpen = this.db.query<{ id: string }>(
      `SELECT id FROM operation_shifts
       WHERE definition_id = ? AND status IN ('OPEN', 'HANDOVER_PENDING') LIMIT 1`,
      [shift.definitionId]
    )[0];
    if (alreadyOpen) throw new Error('توجد وردية مفتوحة بالفعل لنفس التعريف. أغلقها أو سلّمها أولاً.');
    const supervisorId = input.supervisorId || shift.supervisorId || null;
    if (supervisorId) this.assertEmployeeInBranch(supervisorId, shift.branchId);

    const now = localNow();
    const definition = this.db.query<any>(
      `SELECT start_time AS startTime, grace_minutes AS graceMinutes
       FROM attendance_shifts WHERE id = ?`,
      [shift.definitionId]
    )[0];
    const lateMinutes = Math.max(0, timeMinutes(now.slice(11, 16))
      - timeMinutes(definition.startTime) - Number(definition.graceMinutes || 0));

    const chosen = new Map<string, OperationStaffRole>();
    for (const staff of this.db.query<{ employeeId: string; role: OperationStaffRole }>(
      `SELECT employee_id AS employeeId, role FROM operation_shift_staff
       WHERE operation_shift_id = ? AND status NOT IN ('ABSENT', 'LEAVE')`,
      [id]
    )) chosen.set(staff.employeeId, staff.role);
    for (const assignment of this.currentAssignments(shift.definitionId, shift.businessDate)) {
      if (!chosen.has(assignment.employeeId)) chosen.set(assignment.employeeId, assignment.role);
    }
    for (const employeeId of input.employeeIds || []) chosen.set(employeeId, chosen.get(employeeId) || 'STAFF');
    if (supervisorId) chosen.set(supervisorId, 'SUPERVISOR');
    for (const employeeId of [...chosen.keys()]) {
      this.assertEmployeeInBranch(employeeId, shift.branchId);
      const rosterRow = this.db.query<{ status: OperationStaffStatus; checkInAt: string | null }>(
        `SELECT status, check_in_at AS checkInAt FROM operation_shift_staff
         WHERE operation_shift_id = ? AND employee_id = ?`,
        [id, employeeId]
      )[0];
      if (rosterRow && ['ABSENT', 'LEAVE'].includes(rosterRow.status)) {
        chosen.delete(employeeId);
        continue;
      }
      this.assertEmployeeAvailable(employeeId, shift);
    }

    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE operation_shifts SET status = 'OPEN', supervisor_id = ?, opened_by = ?,
           opened_at = ?, opening_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [supervisorId, actor.id, now, input.notes?.trim() || null, id]
      );
      for (const [employeeId, role] of chosen) {
        const existing = db.query<{ id: string; checkInAt: string | null }>(
          `SELECT id, check_in_at AS checkInAt FROM operation_shift_staff
           WHERE operation_shift_id = ? AND employee_id = ?`,
          [id, employeeId]
        )[0];
        if (!existing) {
          db.run(
            `INSERT INTO operation_shift_staff
               (id, operation_shift_id, employee_id, role, status, check_in_at, late_minutes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [`opstaff_${uuidv4().replace(/-/g, '').slice(0, 14)}`, id, employeeId, role,
              lateMinutes > 0 ? 'LATE' : 'PRESENT', now, lateMinutes]
          );
        } else if (!existing.checkInAt) {
          db.run(
            `UPDATE operation_shift_staff SET role = ?, status = ?, check_in_at = ?,
               late_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [role, lateMinutes > 0 ? 'LATE' : 'PRESENT', now, lateMinutes, existing.id]
          );
        }
        if (!existing || !existing.checkInAt) {
          const openPeriod = db.query<{ id: string }>(
            'SELECT id FROM employee_attendance_periods WHERE employee_id = ? AND check_out_at IS NULL',
            [employeeId]
          )[0];
          if (openPeriod) throw new Error('يوجد سجل حضور مفتوح لهذا الموظف؛ سجّل الانصراف أولاً.');
          this.insertPeriod(employeeId, id, shift.businessDate, now, actor.id);
        }
      }
    });
    for (const employeeId of chosen.keys()) {
      AttendanceTimeService.syncDailySummary(employeeId, shift.businessDate, actor.id);
    }
    this.audit('فتح وردية تشغيل', id, { supervisorId, staff: chosen.size, notes: input.notes || null });
    return this.getShiftDetail(id);
  }

  public addStaff(operationShiftId: string, employeeId: string, role: OperationStaffRole = 'STAFF'): void {
    const _actor = this.requireManage();
    const shift = this.getInstance(operationShiftId);
    if (!['OPEN', 'HANDOVER_PENDING'].includes(shift.status)) {
      throw new Error('لا يمكن إضافة موظفين إلا لوردية مفتوحة.');
    }
    this.assertEmployeeInBranch(employeeId, shift.branchId);
    if (this.db.query(
      'SELECT id FROM operation_shift_staff WHERE operation_shift_id = ? AND employee_id = ?',
      [operationShiftId, employeeId]
    ).length) throw new Error('الموظف مسجل بالفعل في هذه الوردية.');
    this.db.run(
      `INSERT INTO operation_shift_staff
         (id, operation_shift_id, employee_id, role, status)
       VALUES (?, ?, ?, ?, 'PRESENT')`,
      [`opstaff_${uuidv4().replace(/-/g, '').slice(0, 14)}`, operationShiftId, employeeId, role]
    );
    this.audit('إضافة موظف إلى وردية تشغيل', operationShiftId, { employeeId, role });
  }

  public replaceAbsentStaff(
    operationShiftId: string,
    absentEmployeeId: string,
    replacementEmployeeId: string,
    notes = ''
  ): void {
    const actor = this.requireManage();
    const shift = this.getInstance(operationShiftId);
    if (!['PLANNED', 'MISSED'].includes(shift.status)) {
      throw new Error('يمكن تعيين البديل قبل فتح الوردية فقط.');
    }
    if (absentEmployeeId === replacementEmployeeId) throw new Error('اختر موظفاً بديلاً مختلفاً.');
    const absent = this.db.query<{ id: string; checkInAt: string | null }>(
      `SELECT id, check_in_at AS checkInAt FROM operation_shift_staff
       WHERE operation_shift_id = ? AND employee_id = ?`,
      [operationShiftId, absentEmployeeId]
    )[0];
    if (!absent) throw new Error('الموظف الغائب غير مجدول في هذه الوردية.');
    if (absent.checkInAt) throw new Error('لا يمكن استبدال موظف بدأ العمل بالفعل.');
    this.assertEmployeeInBranch(replacementEmployeeId, shift.branchId);
    if (this.db.query(
      'SELECT id FROM operation_shift_staff WHERE operation_shift_id = ? AND employee_id = ?',
      [operationShiftId, replacementEmployeeId]
    ).length) throw new Error('الموظف البديل مسجل بالفعل في الوردية.');
    this.assertEmployeeAvailable(replacementEmployeeId, shift);
    const attendance = this.db.query<{ id: string; status: string; checkInAt: string | null }>(
      `SELECT id, status, check_in_at AS checkInAt FROM attendance
       WHERE employee_id = ? AND date = ?`,
      [absentEmployeeId, shift.businessDate]
    )[0];
    if (attendance?.checkInAt || ['PRESENT', 'LATE'].includes(attendance?.status || '')) {
      throw new Error('يوجد حضور فعلي لهذا اليوم؛ لا يمكن تسجيل الموظف غائباً.');
    }
    if (attendance?.status === 'LEAVE') throw new Error('الموظف مسجل بإجازة في هذا اليوم.');
    const payroll = this.db.query<{ status: string }>(
      'SELECT status FROM payroll_runs WHERE branch_id = ? AND period = ?',
      [shift.branchId, shift.businessDate.slice(0, 7)]
    )[0];
    if (payroll && payroll.status !== 'DRAFT') {
      throw new Error('الفترة مرتبطة بدورة رواتب معتمدة؛ لا يمكن تسجيل الغياب.');
    }
    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE operation_shift_staff SET status = 'ABSENT', notes = ?,
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [notes.trim() || 'غياب - تم تعيين بديل', absent.id]
      );
      if (attendance) {
        db.run(
          `UPDATE attendance SET status = 'ABSENT', notes = ?, source = 'OPERATIONS_SHIFT',
             recorded_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [notes.trim() || 'غياب - تم تعيين بديل', actor.id, attendance.id]
        );
      } else {
        db.run(
          `INSERT INTO attendance (id, employee_id, date, status, notes, source, recorded_by)
           VALUES (?, ?, ?, 'ABSENT', ?, 'OPERATIONS_SHIFT', ?)`,
          [`att_${uuidv4().replace(/-/g, '').slice(0, 16)}`, absentEmployeeId,
            shift.businessDate, notes.trim() || 'غياب - تم تعيين بديل', actor.id]
        );
      }
      db.run(
        `INSERT INTO operation_shift_staff (id, operation_shift_id, employee_id, role, status, notes)
         VALUES (?, ?, ?, 'STAFF', 'PRESENT', ?)`,
        [`opstaff_${uuidv4().replace(/-/g, '').slice(0, 14)}`, operationShiftId,
          replacementEmployeeId, notes.trim() || 'بديل عن موظف غائب']
      );
    });
    this.audit('تعيين بديل لموظف غائب', operationShiftId, {
      absentEmployeeId, replacementEmployeeId, notes,
    });
  }

  public approveShiftOvertime(attendancePeriodId: string): void {
    const actor = this.requireManage();
    const row = this.db.query<any>(
      `SELECT p.id, p.employee_id AS employeeId, p.attendance_date AS attendanceDate,
              p.check_out_at AS checkOutAt, p.overtime_minutes AS overtimeMinutes,
              p.overtime_approved AS overtimeApproved, e.branch_id AS branchId
       FROM employee_attendance_periods p JOIN employees e ON e.id = p.employee_id
       WHERE p.id = ?`,
      [attendancePeriodId]
    )[0];
    if (!row) throw new Error('سجل فترة الحضور غير موجود.');
    this.branchAccess.requireBranchAccess(row.branchId, actor);
    if (!row.checkOutAt || Number(row.overtimeMinutes) <= 0) {
      throw new Error('لا توجد ساعات إضافية مكتملة لاعتمادها.');
    }
    if (Number(row.overtimeApproved)) throw new Error('تم اعتماد الإضافي لهذه الفترة بالفعل.');
    const payroll = this.db.query<{ status: string }>(
      'SELECT status FROM payroll_runs WHERE branch_id = ? AND period = ?',
      [row.branchId, String(row.attendanceDate).slice(0, 7)]
    )[0];
    if (payroll && payroll.status !== 'DRAFT') {
      throw new Error('الفترة مرتبطة بدورة رواتب معتمدة؛ لا يمكن تعديل الإضافي.');
    }
    this.db.run(
      `UPDATE employee_attendance_periods SET overtime_approved = 1,
         overtime_approved_by = ?, overtime_approved_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND overtime_approved = 0`,
      [actor.id, attendancePeriodId]
    );
    AttendanceTimeService.syncDailySummary(row.employeeId, row.attendanceDate, actor.id);
    this.audit('اعتماد إضافي فترة حضور وردية', attendancePeriodId, {
      employeeId: row.employeeId, overtimeMinutes: row.overtimeMinutes,
    });
  }

  public recordStaffPresence(operationShiftId: string, employeeId: string, direction: 'IN' | 'OUT'): OperationShiftStaff {
    const actor = this.requireManage();
    const shift = this.getInstance(operationShiftId);
    if (shift.status !== 'OPEN') throw new Error('تسجيل الحضور متاح فقط للوردية المفتوحة.');
    const staff = this.db.query<any>(
      `SELECT st.*, d.start_time AS startTime, d.end_time AS endTime,
              d.grace_minutes AS graceMinutes, d.overtime_after_minutes AS overtimeAfterMinutes
       FROM operation_shift_staff st
       JOIN operation_shifts os ON os.id = st.operation_shift_id
       JOIN attendance_shifts d ON d.id = os.definition_id
       WHERE st.operation_shift_id = ? AND st.employee_id = ?`,
      [operationShiftId, employeeId]
    )[0];
    if (!staff) throw new Error('الموظف غير مسجل في وردية التشغيل.');
    const now = localNow();
    if (direction === 'IN') {
      if (staff.checkInAt) throw new Error('تم تسجيل دخول هذا الموظف بالفعل.');
      const lateMinutes = Math.max(0, timeMinutes(now.slice(11, 16))
        - timeMinutes(staff.startTime) - Number(staff.graceMinutes || 0));
      this.db.executeTransaction((db) => {
        db.run(
          `UPDATE operation_shift_staff SET check_in_at = ?, late_minutes = ?,
             status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [now, lateMinutes, lateMinutes > 0 ? 'LATE' : 'PRESENT', staff.id]
        );
        const openPeriod = db.query<{ id: string }>(
          'SELECT id FROM employee_attendance_periods WHERE employee_id = ? AND check_out_at IS NULL',
          [employeeId]
        )[0];
        if (openPeriod) throw new Error('يوجد سجل حضور مفتوح لهذا الموظف؛ سجّل الانصراف أولاً.');
        this.insertPeriod(employeeId, operationShiftId, shift.businessDate, now, actor.id);
      });
    } else {
      if (!staff.checkInAt) throw new Error('يجب تسجيل الدخول قبل الانصراف.');
      if (staff.checkOutAt) throw new Error('تم تسجيل انصراف هذا الموظف بالفعل.');
      const period = this.db.query<any>(
        `SELECT * FROM employee_attendance_periods
         WHERE employee_id = ? AND operation_shift_id = ? AND check_out_at IS NULL
         ORDER BY check_in_at DESC LIMIT 1`,
        [employeeId, operationShiftId]
      )[0];
      const worked = durationMinutes(period?.checkInAt || staff.checkInAt, now);
      const overtime = Math.max(0, timeMinutes(now.slice(11, 16))
        - timeMinutes(staff.endTime) - Number(staff.overtimeAfterMinutes || 0));
      this.db.executeTransaction((db) => {
        db.run(
          `UPDATE operation_shift_staff SET check_out_at = ?, overtime_minutes = ?,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [now, overtime, staff.id]
        );
        if (period) {
          db.run(
            `UPDATE employee_attendance_periods SET check_out_at = ?, worked_minutes = ?,
               overtime_minutes = ?, status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [now, worked, overtime, period.id]
          );
        }
      });
    }
    AttendanceTimeService.syncDailySummary(employeeId, shift.businessDate, actor.id);
    this.audit(direction === 'IN' ? 'تسجيل حضور في وردية تشغيل' : 'تسجيل انصراف من وردية تشغيل',
      operationShiftId, { employeeId });
    return this.getShiftDetail(operationShiftId).staff
      .find((row) => row.employeeId === employeeId)!;
  }

  public submitHandover(operationShiftId: string, input: {
    expectedCash?: number;
    actualCash: number;
    cashDelivered?: number;
    pendingOrders?: string[];
    inventoryStatus?: string;
    equipmentStatus?: string;
    notes?: string;
    nextStaffIds?: string[];
  }): OperationShiftHandover {
    const actor = this.requireManage();
    const shift = this.getInstance(operationShiftId);
    if (!['OPEN', 'HANDOVER_PENDING'].includes(shift.status)) {
      throw new Error('لا يمكن تسليم وردية غير مفتوحة.');
    }
    const cash = this.getCashSummary(operationShiftId);
    if (cash.openShifts > 0) {
      throw new Error('توجد ورديات كاشير مفتوحة مرتبطة بالوردية. أغلقها قبل تسليم التشغيل.');
    }
    if (!Number.isFinite(input.actualCash) || input.actualCash < 0) {
      throw new Error('الرصيد النقدي الفعلي يجب أن يكون رقماً غير سالب.');
    }
    const expected = Number.isFinite(input.expectedCash) ? Number(input.expectedCash) : cash.expected;
    const delivered = Number.isFinite(input.cashDelivered) ? Number(input.cashDelivered) : 0;
    if (delivered < 0) throw new Error('المبلغ المسلّم للخزينة يجب أن يكون رقماً غير سالب.');
    const difference = Number((Number(input.actualCash) - expected).toFixed(2));
    const handoverId = `opshand_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    const nextStaff = [...new Set(input.nextStaffIds || [])];
    for (const employeeId of nextStaff) this.assertEmployeeInBranch(employeeId, shift.branchId);

    this.db.executeTransaction((db) => {
      db.run('DELETE FROM operation_shift_handovers WHERE operation_shift_id = ?', [operationShiftId]);
      db.run(
        `INSERT INTO operation_shift_handovers
           (id, operation_shift_id, expected_cash, actual_cash, cash_difference, cash_delivered,
            pending_orders_json, inventory_status, equipment_status, notes, next_staff_json,
            status, submitted_by, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
        [handoverId, operationShiftId, expected, input.actualCash, difference, delivered,
          JSON.stringify(input.pendingOrders || []), input.inventoryStatus?.trim() || null,
          input.equipmentStatus?.trim() || null, input.notes?.trim() || null,
          JSON.stringify(nextStaff), actor.id, localNow()]
      );
      db.run(
        `UPDATE operation_shifts SET status = 'HANDOVER_PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [operationShiftId]
      );
    });
    this.audit('تسليم وردية تشغيل', operationShiftId, {
      expected, actual: input.actualCash, difference, delivered, nextStaff,
    });
    return this.getShiftDetail(operationShiftId).handover!;
  }

  public confirmHandover(operationShiftId: string, notes = ''): OperationShiftDetail {
    const actor = this.requireManage();
    const shift = this.getInstance(operationShiftId);
    const handover = this.getShiftDetail(operationShiftId).handover;
    if (!handover) throw new Error('لا يوجد تسليم وردية لاستلامه.');
    if (handover.status === 'RECEIVED') throw new Error('تم استلام الوردية بالفعل.');
    if (!['HANDOVER_PENDING', 'OPEN'].includes(shift.status)) {
      throw new Error('الوردية ليست في حالة تسمح بالاستلام.');
    }
    const now = localNow();
    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE operation_shift_handovers SET status = 'RECEIVED', received_by = ?,
           received_at = ?, received_notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE operation_shift_id = ?`,
        [actor.id, now, notes.trim() || null, operationShiftId]
      );
      db.run(
        `UPDATE operation_shift_staff SET check_out_at = COALESCE(check_out_at, ?),
           updated_at = CURRENT_TIMESTAMP WHERE operation_shift_id = ?`,
        [now, operationShiftId]
      );
      db.run(
        `UPDATE employee_attendance_periods SET check_out_at = COALESCE(check_out_at, ?),
           worked_minutes = CASE WHEN check_out_at IS NULL THEN ? ELSE worked_minutes END,
           status = 'CLOSED', updated_at = CURRENT_TIMESTAMP
         WHERE operation_shift_id = ? AND check_out_at IS NULL`,
        [now, Math.max(0, durationMinutes(shift.openedAt || shift.scheduledStart, now)), operationShiftId]
      );
      db.run(
        `UPDATE operation_shifts SET status = 'CLOSED', closed_by = ?, closed_at = ?,
           closing_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [actor.id, now, notes.trim() || handover.notes || null, operationShiftId]
      );
      this.assignNextShiftStaff(db, shift, handover.nextStaffIds, now);
    });
    for (const staff of this.getShiftDetail(operationShiftId).staff) {
      AttendanceTimeService.syncDailySummary(staff.employeeId, shift.businessDate, actor.id);
    }
    this.audit('استلام وردية تشغيل', operationShiftId, { receivedBy: actor.id });
    return this.getShiftDetail(operationShiftId);
  }

  private assignNextShiftStaff(db: DatabaseManager, shift: OperationShiftInstance, employeeIds: string[], now: string): void {
    if (!employeeIds.length) return;
    const next = db.query<{ id: string }>(
      `SELECT id FROM operation_shifts
       WHERE branch_id = ? AND definition_id = ? AND scheduled_start > ?
         AND status IN ('PLANNED', 'MISSED')
       ORDER BY scheduled_start LIMIT 1`,
      [shift.branchId, shift.definitionId, shift.scheduledStart]
    )[0];
    if (!next) return;
    for (const employeeId of employeeIds) {
      if (db.query(
        'SELECT id FROM operation_shift_staff WHERE operation_shift_id = ? AND employee_id = ?',
        [next.id, employeeId]
      ).length) continue;
      db.run(
        `INSERT INTO operation_shift_staff (id, operation_shift_id, employee_id, role, status)
         VALUES (?, ?, ?, 'STAFF', 'PRESENT')`,
        [`opstaff_${uuidv4().replace(/-/g, '').slice(0, 14)}`, next.id, employeeId]
      );
    }
    db.run('UPDATE operation_shifts SET updated_at = ? WHERE id = ?', [now, next.id]);
  }

  public closeShift(operationShiftId: string, notes = ''): OperationShiftDetail {
    const actor = this.requireManage();
    const shift = this.getInstance(operationShiftId);
    if (shift.status === 'CLOSED') throw new Error('الوردية مغلقة بالفعل.');
    const cash = this.getCashSummary(operationShiftId);
    if (cash.openShifts > 0) throw new Error('أغلق ورديات الكاشير المرتبطة قبل إغلاق وردية التشغيل.');
    const handover = this.getShiftDetail(operationShiftId).handover;
    if (handover && handover.status !== 'RECEIVED') {
      throw new Error('يجب استلام التسليم الإلكتروني قبل إغلاق الوردية.');
    }
    const now = localNow();
    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE operation_shifts SET status = 'CLOSED', closed_by = ?, closed_at = ?,
           closing_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [actor.id, now, notes.trim() || null, operationShiftId]
      );
      db.run(
        `UPDATE operation_shift_staff SET check_out_at = COALESCE(check_out_at, ?),
           updated_at = CURRENT_TIMESTAMP WHERE operation_shift_id = ?`,
        [now, operationShiftId]
      );
      db.run(
        `UPDATE employee_attendance_periods SET check_out_at = COALESCE(check_out_at, ?),
           worked_minutes = CASE WHEN check_out_at IS NULL THEN ? ELSE worked_minutes END,
           status = 'CLOSED', updated_at = CURRENT_TIMESTAMP
         WHERE operation_shift_id = ? AND check_out_at IS NULL`,
        [now, Math.max(0, durationMinutes(shift.openedAt || shift.scheduledStart, now)), operationShiftId]
      );
    });
    for (const staff of this.getShiftDetail(operationShiftId).staff) {
      AttendanceTimeService.syncDailySummary(staff.employeeId, shift.businessDate, actor.id);
    }
    this.audit('إغلاق وردية تشغيل', operationShiftId, { notes });
    return this.getShiftDetail(operationShiftId);
  }

  public addIncident(operationShiftId: string, input: {
    type?: OperationShiftIncident['type'];
    severity?: OperationShiftIncident['severity'];
    title: string;
    description?: string;
  }): OperationShiftIncident {
    const actor = this.requireManage();
    const _shift = this.getInstance(operationShiftId);
    if (!input.title?.trim()) throw new Error('عنوان العطل أو الملاحظة مطلوب.');
    const type = input.type || 'NOTE';
    const severity = input.severity || 'MEDIUM';
    if (!['BREAKDOWN', 'NOTE', 'SAFETY', 'QUALITY', 'OTHER'].includes(type)) {
      throw new Error('نوع الملاحظة غير صالح.');
    }
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) {
      throw new Error('درجة الخطورة غير صالحة.');
    }
    const id = `opsinc_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    this.db.run(
      `INSERT INTO operation_shift_incidents
         (id, operation_shift_id, type, severity, title, description, started_at, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, operationShiftId, type, severity, input.title.trim(),
        input.description?.trim() || null, localNow(), actor.id]
    );
    this.audit('تسجيل عطل أو ملاحظة تشغيل', id, { operationShiftId, type, severity, title: input.title });
    return this.getShiftDetail(operationShiftId).incidents.find((row) => row.id === id)!;
  }

  public resolveIncident(incidentId: string, notes = ''): OperationShiftIncident {
    const actor = this.requireManage();
    const incident = this.db.query<{ operationShiftId: string; branchId: string }>(
      `SELECT i.operation_shift_id AS operationShiftId, os.branch_id AS branchId
       FROM operation_shift_incidents i
       JOIN operation_shifts os ON os.id = i.operation_shift_id
       WHERE i.id = ?`,
      [incidentId]
    )[0];
    if (!incident) throw new Error('العطل أو الملاحظة غير موجودة.');
    this.branchAccess.requireBranchAccess(incident.branchId, actor);
    this.db.run(
      `UPDATE operation_shift_incidents SET resolved_at = ?, resolved_by = ?,
         resolution_notes = ? WHERE id = ?`,
      [localNow(), actor.id, notes.trim() || null, incidentId]
    );
    this.audit('معالجة عطل أو ملاحظة تشغيل', incidentId, { notes });
    return this.getShiftDetail(incident.operationShiftId).incidents.find((row) => row.id === incidentId)!;
  }

  public recordProduction(operationShiftId: string, input: {
    productionOrderId?: string | null;
    productId?: string | null;
    workCenterId?: string | null;
    targetQty?: number;
    producedQty?: number;
    goodQty?: number;
    scrapQty?: number;
    downtimeMinutes?: number;
    downtimeReason?: string | null;
    notes?: string | null;
  }): OperationShiftProductionRow {
    const actor = this.requireManage();
    const shift = this.getInstance(operationShiftId);
    if (!['OPEN', 'HANDOVER_PENDING', 'CLOSED'].includes(shift.status)) {
      throw new Error('لا يمكن تسجيل إنتاج على وردية ملغاة.');
    }
    const numeric: Array<[string, number | undefined]> = [
      ['الكمية المستهدفة', input.targetQty],
      ['الكمية المنتجة', input.producedQty],
      ['الكمية السليمة', input.goodQty],
      ['الهالك', input.scrapQty],
      ['دقائق التوقف', input.downtimeMinutes],
    ];
    for (const [label, value] of numeric) {
      if (value != null && (!Number.isFinite(value) || value < 0)) {
        throw new Error(`${label} يجب أن تكون رقماً غير سالب.`);
      }
    }
    let productId = input.productId || null;
    const workCenterId = input.workCenterId || null;
    if (input.productionOrderId) {
      const order = this.db.query<{
        productId: string; branchId: string; status: string;
      }>(
        `SELECT product_id AS productId, branch_id AS branchId, status
         FROM production_orders WHERE id = ?`,
        [input.productionOrderId]
      )[0];
      if (!order) throw new Error('أمر الإنتاج غير موجود.');
      if (order.branchId !== shift.branchId) throw new Error('أمر الإنتاج لا يتبع فرع وردية التشغيل.');
      productId = productId || order.productId;
    }
    if (productId && !this.db.query('SELECT id FROM products WHERE id = ?', [productId]).length) {
      throw new Error('المنتج غير موجود.');
    }
    if (workCenterId && !this.db.query('SELECT id FROM work_centers WHERE id = ?', [workCenterId]).length) {
      throw new Error('مركز العمل غير موجود.');
    }
    const id = `opsprod_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    this.db.run(
      `INSERT INTO operation_shift_production
         (id, operation_shift_id, production_order_id, product_id, work_center_id,
          target_qty, produced_qty, good_qty, scrap_qty, downtime_minutes, downtime_reason,
          notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, operationShiftId, input.productionOrderId || null, productId, workCenterId,
        input.targetQty ?? 0, input.producedQty ?? 0, input.goodQty ?? 0, input.scrapQty ?? 0,
        input.downtimeMinutes ?? 0, input.downtimeReason?.trim() || null,
        input.notes?.trim() || null, actor.id]
    );
    if (input.productionOrderId) {
      this.db.run(
        'UPDATE production_orders SET operation_shift_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [operationShiftId, input.productionOrderId]
      );
    }
    this.audit('تسجيل إنتاج وردية تشغيل', id, {
      operationShiftId, productionOrderId: input.productionOrderId || null,
      producedQty: input.producedQty || 0, scrapQty: input.scrapQty || 0,
    });
    return this.getProduction(operationShiftId).find((row) => row.id === id)!;
  }

  public getProduction(operationShiftId: string): OperationShiftProductionRow[] {
    return this.db.query<OperationShiftProductionRow>(
      `SELECT p.id, p.operation_shift_id AS operationShiftId,
              p.production_order_id AS productionOrderId, po.order_number AS orderNumber,
              p.product_id AS productId, pr.name AS productName,
              p.work_center_id AS workCenterId, wc.name AS workCenterName,
              p.target_qty AS targetQty, p.produced_qty AS producedQty,
              p.good_qty AS goodQty, p.scrap_qty AS scrapQty,
              p.downtime_minutes AS downtimeMinutes, p.downtime_reason AS downtimeReason,
              p.notes, p.created_at AS createdAt
       FROM operation_shift_production p
       LEFT JOIN production_orders po ON po.id = p.production_order_id
       LEFT JOIN products pr ON pr.id = p.product_id
       LEFT JOIN work_centers wc ON wc.id = p.work_center_id
       WHERE p.operation_shift_id = ?
       ORDER BY p.created_at DESC`,
      [operationShiftId]
    ).map((row) => ({
      ...row,
      targetQty: Number(row.targetQty) || 0,
      producedQty: Number(row.producedQty) || 0,
      goodQty: Number(row.goodQty) || 0,
      scrapQty: Number(row.scrapQty) || 0,
      downtimeMinutes: Number(row.downtimeMinutes) || 0,
    }));
  }

  public getPeriods(filters: {
    employeeId?: string;
    date?: string;
    from?: string;
    to?: string;
    operationShiftId?: string;
  } = {}): EmployeeAttendancePeriod[] {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: string[] = [...scope.params];
    if (filters.employeeId) {
      conditions.push('p.employee_id = ?');
      params.push(filters.employeeId);
    }
    if (filters.date) {
      conditions.push('p.attendance_date = ?');
      params.push(filters.date);
    }
    if (filters.from) {
      conditions.push('p.attendance_date >= ?');
      params.push(filters.from);
    }
    if (filters.to) {
      conditions.push('p.attendance_date <= ?');
      params.push(filters.to);
    }
    if (filters.operationShiftId) {
      conditions.push('p.operation_shift_id = ?');
      params.push(filters.operationShiftId);
    }
    return this.db.query<EmployeeAttendancePeriod>(
      `SELECT p.id, p.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode,
              p.operation_shift_id AS operationShiftId, os.shift_number AS shiftNumber,
              p.attendance_date AS attendanceDate, p.check_in_at AS checkInAt,
              p.check_out_at AS checkOutAt, p.worked_minutes AS workedMinutes,
              p.late_minutes AS lateMinutes, p.overtime_minutes AS overtimeMinutes,
              p.overtime_approved AS overtimeApproved,
              p.overtime_approved_by AS overtimeApprovedBy,
              p.overtime_approved_at AS overtimeApprovedAt,
              p.status, p.source, p.notes
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
      overtimeApproved: bool(row.overtimeApproved),
    }));
  }

  public getShiftReport(from: string, to: string, branchId?: string): OperationShiftReportRow[] {
    const actor = this.requireView();
    if (!isValidDate(from) || !isValidDate(to) || to < from) {
      throw new Error('فترة تقرير الورديات غير صالحة.');
    }
    const target = branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(target, actor);
    this.ensureShiftInstances(from, to, target);
    const rows = this.db.query<any>(
      `SELECT os.id AS shiftId, os.shift_number AS shiftNumber, d.name AS definitionName,
              d.department, os.business_date AS businessDate, os.scheduled_start AS scheduledStart,
              os.scheduled_end AS scheduledEnd, os.status, sup.name AS supervisorName,
              (SELECT COUNT(*) FROM operation_shift_staff st WHERE st.operation_shift_id = os.id) AS staffCount,
              (SELECT COALESCE(SUM(p.worked_minutes), 0) FROM employee_attendance_periods p
               WHERE p.operation_shift_id = os.id) AS workedMinutes,
              (SELECT COALESCE(SUM(CASE WHEN p.overtime_approved = 1 THEN p.overtime_minutes ELSE 0 END), 0)
               FROM employee_attendance_periods p WHERE p.operation_shift_id = os.id) AS approvedOvertimeMinutes,
              (SELECT COALESCE(SUM(
                 (e.base_salary / CASE WHEN e.salary_type = 'DAILY' THEN 8.0
                   ELSE COALESCE(c.working_days_per_month, 26) * 8.0 END) * p.worked_minutes / 60.0
                 + CASE WHEN p.overtime_approved = 1 THEN
                   (e.base_salary / CASE WHEN e.salary_type = 'DAILY' THEN 8.0
                     ELSE COALESCE(c.working_days_per_month, 26) * 8.0 END)
                     * p.overtime_minutes / 60.0 * (COALESCE(c.overtime_multiplier, 1.5) - 1)
                   ELSE 0 END
               ), 0)
               FROM employee_attendance_periods p
               JOIN employees e ON e.id = p.employee_id
               LEFT JOIN branches b ON b.id = e.branch_id
               LEFT JOIN companies c ON c.id = b.company_id
               WHERE p.operation_shift_id = os.id) AS laborCost,
              (SELECT COALESCE(SUM(p.produced_qty), 0) FROM operation_shift_production p
               WHERE p.operation_shift_id = os.id) AS producedQty,
              (SELECT COALESCE(SUM(p.good_qty), 0) FROM operation_shift_production p
               WHERE p.operation_shift_id = os.id) AS goodQty,
              (SELECT COALESCE(SUM(p.scrap_qty), 0) FROM operation_shift_production p
               WHERE p.operation_shift_id = os.id) AS scrapQty,
              (SELECT COALESCE(SUM(p.downtime_minutes), 0) FROM operation_shift_production p
               WHERE p.operation_shift_id = os.id) AS downtimeMinutes,
              (SELECT COUNT(*) FROM operation_shift_incidents i
               WHERE i.operation_shift_id = os.id) AS incidents,
              h.expected_cash AS handoverExpected, h.actual_cash AS handoverActual,
              h.cash_difference AS handoverDifference, h.cash_delivered AS handoverDelivered
       FROM operation_shifts os
       JOIN attendance_shifts d ON d.id = os.definition_id
       LEFT JOIN employees sup ON sup.id = os.supervisor_id
       LEFT JOIN operation_shift_handovers h ON h.operation_shift_id = os.id
       WHERE os.branch_id = ? AND os.business_date BETWEEN ? AND ?
       ORDER BY os.scheduled_start`,
      [target, from, to]
    );
    return rows.map((row) => {
      const cash = this.getCashSummary(row.shiftId);
      return {
        ...row,
        staffCount: Number(row.staffCount) || 0,
        expectedCash: Number(row.handoverExpected ?? cash.expected) || 0,
        actualCash: Number(row.handoverActual ?? cash.actual) || 0,
        cashDifference: Number(row.handoverDifference ?? cash.difference) || 0,
        cashDelivered: Number(row.handoverDelivered ?? cash.delivered) || 0,
        producedQty: Number(row.producedQty) || 0,
        goodQty: Number(row.goodQty) || 0,
        scrapQty: Number(row.scrapQty) || 0,
        downtimeMinutes: Number(row.downtimeMinutes) || 0,
        incidents: Number(row.incidents) || 0,
        workedMinutes: Number(row.workedMinutes) || 0,
        approvedOvertimeMinutes: Number(row.approvedOvertimeMinutes) || 0,
        laborCost: Number(row.laborCost) || 0,
        productivityPerLaborHour: Number(row.workedMinutes) > 0
          ? Number(row.goodQty || 0) / (Number(row.workedMinutes) / 60)
          : 0,
        costPerGoodUnit: Number(row.goodQty) > 0
          ? Number(row.laborCost || 0) / Number(row.goodQty)
          : 0,
      } as OperationShiftReportRow;
    });
  }

  /** Cashier page helper: link a cash drawer shift to the branch's current operations shift. */
  public getLinkableOpenShift(branchId: string): OperationShiftInstance | null {
    return this.getOpenShiftForBranch(branchId);
  }

  /* ========== ربط الورديات بالحضور والرواتب (Payroll Integration) ========== */

  public getShiftAttendanceForPayroll(options: {
    from: string; to: string; branchId?: string;
  }): ShiftPayrollRow[] {
    const actor = this.requireView();
    const targetBranch = options.branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(targetBranch, actor);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(options.from) || !/^\d{4}-\d{2}-\d{2}$/.test(options.to)) {
      throw new Error('نطاق التواريخ غير صالح.');
    }
    if (options.to < options.from) {
      throw new Error('تاريخ النهاية يجب أن يكون بعد تاريخ البداية.');
    }

    const rows = this.db.query<any>(`
      SELECT st.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode,
             e.branch_id AS branchId, os.business_date AS date, os.id AS shiftId,
             os.shift_number AS shiftNumber, d.name AS shiftName,
             os.scheduled_start AS scheduledStart, os.scheduled_end AS scheduledEnd,
             st.check_in_at AS checkInAt, st.check_out_at AS checkOutAt,
             st.status, st.late_minutes AS lateMinutes, st.overtime_minutes AS overtimeMinutes,
             COALESCE(st.worked_minutes, 0) AS workedMinutes,
             COALESCE(st.overtime_approved, 0) AS isApprovedOvertime
      FROM operation_shift_staff st
      JOIN operation_shifts os ON os.id = st.operation_shift_id
      JOIN employees e ON e.id = st.employee_id
      JOIN attendance_shifts d ON d.id = os.definition_id
      WHERE os.branch_id = ? AND os.business_date BETWEEN ? AND ?
      ORDER BY e.name, os.business_date, os.scheduled_start
    `, [targetBranch, options.from, options.to]);

    return rows.map((row) => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      employeeCode: row.employeeCode,
      branchId: row.branchId,
      date: row.date,
      shiftId: row.shiftId,
      shiftNumber: row.shiftNumber,
      shiftName: row.shiftName,
      scheduledStart: row.scheduledStart,
      scheduledEnd: row.scheduledEnd,
      checkInAt: row.checkInAt,
      checkOutAt: row.checkOutAt,
      status: row.status,
      lateMinutes: Number(row.lateMinutes) || 0,
      overtimeMinutes: Number(row.overtimeMinutes) || 0,
      workedMinutes: Number(row.workedMinutes) || 0,
      isApprovedOvertime: Boolean(row.isApprovedOvertime),
    }));
  }

  public getEmployeeShiftSummary(employeeId: string, options: {
    from: string; to: string; branchId?: string;
  }): {
    employeeId: string; employeeName: string; branchId: string;
    totalShifts: number; presentShifts: number; lateShifts: number; absentShifts: number;
    totalWorkedMinutes: number; totalLateMinutes: number; totalOvertimeMinutes: number;
    approvedOvertimeMinutes: number;
  } {
    const actor = this.requireView();
    const targetBranch = options.branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(targetBranch, actor);

    const employee = this.db.query<{ id: string; name: string; branch_id: string }>(
      'SELECT id, name, branch_id AS branchId FROM employees WHERE id = ? AND status != ?',
      [employeeId, 'SUSPENDED']
    )[0];
    if (!employee) throw new Error('الموظف غير موجود.');
    if (employee.branch_id !== targetBranch) throw new Error('الموظف لا يتبع الفرع المحدد.');

    const rows = this.db.query<any>(`
      SELECT st.status, COALESCE(st.worked_minutes, 0) AS workedMinutes,
             COALESCE(st.late_minutes, 0) AS lateMinutes,
             COALESCE(st.overtime_minutes, 0) AS overtimeMinutes,
             COALESCE(st.overtime_approved, 0) AS approvedOvertime
      FROM operation_shift_staff st
      JOIN operation_shifts os ON os.id = st.operation_shift_id
      WHERE st.employee_id = ? AND os.branch_id = ?
        AND os.business_date BETWEEN ? AND ?
    `, [employeeId, targetBranch, options.from, options.to]);

    let totalShifts = 0;
    let presentShifts = 0;
    let lateShifts = 0;
    let absentShifts = 0;
    let totalWorkedMinutes = 0;
    let totalLateMinutes = 0;
    let totalOvertimeMinutes = 0;
    let approvedOvertimeMinutes = 0;

    for (const row of rows) {
      totalShifts += 1;
      switch (row.status) {
        case 'PRESENT': presentShifts += 1; break;
        case 'LATE': lateShifts += 1; break;
        case 'ABSENT': absentShifts += 1; break;
        case 'LEAVE': absentShifts += 1; break;
      }
      totalWorkedMinutes += Number(row.workedMinutes) || 0;
      totalLateMinutes += Number(row.lateMinutes) || 0;
      totalOvertimeMinutes += Number(row.overtimeMinutes) || 0;
      approvedOvertimeMinutes += Number(row.approvedOvertime) || 0;
    }

    return {
      employeeId, employeeName: employee.name, branchId: employee.branch_id,
      totalShifts, presentShifts, lateShifts, absentShifts,
      totalWorkedMinutes, totalLateMinutes, totalOvertimeMinutes, approvedOvertimeMinutes,
    };
  }
}
