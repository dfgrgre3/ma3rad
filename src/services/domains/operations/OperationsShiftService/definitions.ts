import { v4 as uuidv4 } from 'uuid';
import type { ShiftServiceContext } from './context';
import {
  bool,
  dateOffset,
  isValidDate,
  isValidTime,
  scheduledWindow,
  timeMinutes,
  WORK_MODE_KEY,
  WORK_MODES,
} from './helpers';
import type {
  OperationEmployee,
  OperationShiftAssignmentRow,
  OperationShiftDefinition,
  OperationsWorkMode,
  OperationStaffRole,
} from './types';

export function definitionRows(ctx: ShiftServiceContext, branchId?: string): any[] {
  const actor = ctx.requireView();
  const scope = ctx.branchAccess.sqlScope('s.branch_id', undefined, actor);
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
    ctx.branchAccess.requireBranchAccess(branchId, actor);
    sql += ' AND s.branch_id = ?';
    params.push(branchId);
  }
  sql += ' ORDER BY s.shift_order, s.start_time, s.name';
  return ctx.db.query<any>(sql, params);
}

export function getShiftDefinitions(ctx: ShiftServiceContext, branchId?: string): OperationShiftDefinition[] {
  return definitionRows(ctx, branchId).map((row) => ({
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

export function getWorkMode(ctx: ShiftServiceContext): OperationsWorkMode {
  ctx.requireView();
  const row = ctx.db.query<{ value: string }>(
    'SELECT value FROM system_settings WHERE key = ?',
    [WORK_MODE_KEY]
  )[0];
  return WORK_MODES.includes(row?.value as OperationsWorkMode)
    ? row!.value as OperationsWorkMode
    : 'CONTINUOUS';
}

export function saveWorkMode(ctx: ShiftServiceContext, mode: OperationsWorkMode): void {
  ctx.requireManage();
  if (!WORK_MODES.includes(mode)) throw new Error('نظام العمل المحدد غير صالح.');
  ctx.db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [WORK_MODE_KEY, mode]);
  ctx.audit('تعديل نظام تشغيل الورديات', WORK_MODE_KEY, { mode });
}

export function saveShiftDefinition(ctx: ShiftServiceContext, input: {
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
  const actor = ctx.requireManage();
  const branchId = input.branchId || ctx.branchAccess.getCurrentBranchId(actor);
  ctx.branchAccess.requireBranchAccess(branchId, actor);
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
  if (input.id && ctx.db.query(
    'SELECT id FROM operation_shifts WHERE definition_id = ? LIMIT 1',
    [input.id]
  ).length) {
    throw new Error('الوردية مستخدمة في ورديات تشغيل سابقة؛ أنشئ وردية جديدة للحفاظ على السجل.');
  }
  const id = input.id || `opsdef_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
  ctx.db.run(
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
  const saved = getShiftDefinitions(ctx, branchId).find((row) => row.id === id);
  if (!saved) throw new Error('تعذر حفظ وردية التشغيل.');
  ctx.audit(input.id ? 'تعديل وردية تشغيل' : 'إنشاء وردية تشغيل', id, {
    name: saved.name, startTime: saved.startTime, endTime: saved.endTime,
  });
  return saved;
}

export function deactivateShiftDefinition(ctx: ShiftServiceContext, id: string): void {
  const actor = ctx.requireManage();
  const definition = ctx.db.query<{ branchId: string }>(
    'SELECT branch_id AS branchId FROM attendance_shifts WHERE id = ?',
    [id]
  )[0];
  if (!definition) throw new Error('وردية التشغيل غير موجودة.');
  ctx.branchAccess.requireBranchAccess(definition.branchId, actor);
  ctx.db.run('UPDATE attendance_shifts SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  ctx.audit('إيقاف وردية تشغيل', id);
}

export function getEmployees(ctx: ShiftServiceContext, branchId?: string): OperationEmployee[] {
  const actor = ctx.requireView();
  const scope = ctx.branchAccess.sqlScope('e.branch_id', undefined, actor);
  const params: string[] = [...scope.params];
  let sql = `
      SELECT e.id, e.branch_id AS branchId, e.code, e.name, e.role, e.status
      FROM employees e
      WHERE e.status != 'SUSPENDED' AND ${scope.clause}`;
  if (branchId) {
    ctx.branchAccess.requireBranchAccess(branchId, actor);
    sql += ' AND e.branch_id = ?';
    params.push(branchId);
  }
  sql += ' ORDER BY e.name';
  return ctx.db.query<OperationEmployee>(sql, params);
}

export function getAssignments(ctx: ShiftServiceContext, definitionId?: string): OperationShiftAssignmentRow[] {
  const actor = ctx.requireView();
  const scope = ctx.branchAccess.sqlScope('s.branch_id', undefined, actor);
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
  return ctx.db.query<OperationShiftAssignmentRow>(sql, params);
}

function assertRecurringAssignmentCompatible(
  ctx: ShiftServiceContext,
  employeeId: string,
  definitionId: string,
  effectiveFrom: string,
  effectiveTo: string | null
): void {
  const candidate = ctx.db.query<any>(
    `SELECT name, start_time AS startTime, end_time AS endTime,
            workdays_json AS workdaysJson, required_rest_minutes AS requiredRestMinutes
     FROM attendance_shifts WHERE id = ?`,
    [definitionId]
  )[0];
  const existing = ctx.db.query<any>(
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

export function assignEmployee(ctx: ShiftServiceContext, input: {
  definitionId: string;
  employeeId: string;
  role?: OperationStaffRole;
  effectiveFrom: string;
  effectiveTo?: string | null;
}): OperationShiftAssignmentRow {
  const actor = ctx.requireManage();
  if (!isValidDate(input.effectiveFrom)) throw new Error('تاريخ بدء التعيين غير صالح.');
  if (input.effectiveTo && (!isValidDate(input.effectiveTo) || input.effectiveTo < input.effectiveFrom)) {
    throw new Error('تاريخ انتهاء التعيين غير صالح.');
  }
  const definition = ctx.db.query<{ branchId: string }>(
    'SELECT branch_id AS branchId FROM attendance_shifts WHERE id = ? AND is_active = 1',
    [input.definitionId]
  )[0];
  if (!definition) throw new Error('وردية التشغيل غير موجودة أو غير نشطة.');
  ctx.branchAccess.requireBranchAccess(definition.branchId, actor);
  const employee = ctx.db.query<{ branchId: string }>(
    'SELECT branch_id AS branchId FROM employees WHERE id = ? AND status != ?',
    [input.employeeId, 'SUSPENDED']
  )[0];
  if (!employee) throw new Error('الموظف غير موجود.');
  if (employee.branchId !== definition.branchId) throw new Error('الموظف لا يتبع فرع وردية التشغيل.');
  assertRecurringAssignmentCompatible(
    ctx, input.employeeId, input.definitionId, input.effectiveFrom, input.effectiveTo || null
  );
  const id = `opsassign_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
  ctx.db.run(
    `INSERT INTO operation_shift_assignments
       (id, definition_id, employee_id, role, effective_from, effective_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(definition_id, employee_id, effective_from) DO UPDATE SET
       role = excluded.role, effective_to = excluded.effective_to`,
    [id, input.definitionId, input.employeeId, input.role === 'SUPERVISOR' ? 'SUPERVISOR' : 'STAFF',
      input.effectiveFrom, input.effectiveTo || null, actor.id]
  );
  ctx.audit('تعيين موظف على وردية تشغيل', input.definitionId, {
    employeeId: input.employeeId, role: input.role || 'STAFF', from: input.effectiveFrom,
  });
  return getAssignments(ctx, input.definitionId)
    .find((row) => row.employeeId === input.employeeId && row.effectiveFrom === input.effectiveFrom)!;
}

export function removeAssignment(ctx: ShiftServiceContext, id: string): void {
  const actor = ctx.requireManage();
  const row = ctx.db.query<{ branchId: string }>(
    `SELECT s.branch_id AS branchId
     FROM operation_shift_assignments a
     JOIN attendance_shifts s ON s.id = a.definition_id
     WHERE a.id = ?`,
    [id]
  )[0];
  if (!row) throw new Error('تعيين الوردية غير موجود.');
  ctx.branchAccess.requireBranchAccess(row.branchId, actor);
  ctx.db.run('DELETE FROM operation_shift_assignments WHERE id = ?', [id]);
  ctx.audit('إلغاء تعيين موظف على وردية تشغيل', id);
}

export function currentAssignments(
  ctx: ShiftServiceContext,
  definitionId: string,
  businessDate: string
): Array<{ employeeId: string; role: OperationStaffRole }> {
  return ctx.db.query<{ employeeId: string; role: OperationStaffRole }>(
    `SELECT employee_id AS employeeId, role
     FROM operation_shift_assignments
     WHERE definition_id = ? AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY role DESC, employee_id`,
    [definitionId, businessDate, businessDate]
  );
}
