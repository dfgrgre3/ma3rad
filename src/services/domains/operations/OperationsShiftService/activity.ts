import { v4 as uuidv4 } from 'uuid';
import type { ShiftServiceContext } from './context';
import { isValidDate, localNow } from './helpers';
import type {
  OperationShiftIncident,
  OperationShiftProductionRow,
  OperationShiftReportRow,
  ShiftPayrollRow,
} from './types';

export function addIncident(ctx: ShiftServiceContext, operationShiftId: string, input: {
  type?: OperationShiftIncident['type'];
  severity?: OperationShiftIncident['severity'];
  title: string;
  description?: string;
}): OperationShiftIncident {
  const actor = ctx.requireManage();
  const _shift = ctx.getInstance(operationShiftId);
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
  ctx.db.run(
    `INSERT INTO operation_shift_incidents
       (id, operation_shift_id, type, severity, title, description, started_at, reported_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, operationShiftId, type, severity, input.title.trim(),
      input.description?.trim() || null, localNow(), actor.id]
  );
  ctx.audit('تسجيل عطل أو ملاحظة تشغيل', id, { operationShiftId, type, severity, title: input.title });
  return ctx.getShiftDetail(operationShiftId).incidents.find((row) => row.id === id)!;
}

export function resolveIncident(ctx: ShiftServiceContext, incidentId: string, notes = ''): OperationShiftIncident {
  const actor = ctx.requireManage();
  const incident = ctx.db.query<{ operationShiftId: string; branchId: string }>(
    `SELECT i.operation_shift_id AS operationShiftId, os.branch_id AS branchId
     FROM operation_shift_incidents i
     JOIN operation_shifts os ON os.id = i.operation_shift_id
     WHERE i.id = ?`,
    [incidentId]
  )[0];
  if (!incident) throw new Error('العطل أو الملاحظة غير موجودة.');
  ctx.branchAccess.requireBranchAccess(incident.branchId, actor);
  ctx.db.run(
    `UPDATE operation_shift_incidents SET resolved_at = ?, resolved_by = ?,
       resolution_notes = ? WHERE id = ?`,
    [localNow(), actor.id, notes.trim() || null, incidentId]
  );
  ctx.audit('معالجة عطل أو ملاحظة تشغيل', incidentId, { notes });
  return ctx.getShiftDetail(incident.operationShiftId).incidents.find((row) => row.id === incidentId)!;
}

export function recordProduction(ctx: ShiftServiceContext, operationShiftId: string, input: {
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
  const actor = ctx.requireManage();
  const shift = ctx.getInstance(operationShiftId);
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
    const order = ctx.db.query<{
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
  if (productId && !ctx.db.query('SELECT id FROM products WHERE id = ?', [productId]).length) {
    throw new Error('المنتج غير موجود.');
  }
  if (workCenterId && !ctx.db.query('SELECT id FROM work_centers WHERE id = ?', [workCenterId]).length) {
    throw new Error('مركز العمل غير موجود.');
  }
  const id = `opsprod_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
  ctx.db.run(
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
    ctx.db.run(
      'UPDATE production_orders SET operation_shift_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [operationShiftId, input.productionOrderId]
    );
  }
  ctx.audit('تسجيل إنتاج وردية تشغيل', id, {
    operationShiftId, productionOrderId: input.productionOrderId || null,
    producedQty: input.producedQty || 0, scrapQty: input.scrapQty || 0,
  });
  return getProduction(ctx, operationShiftId).find((row) => row.id === id)!;
}

export function getProduction(ctx: ShiftServiceContext, operationShiftId: string): OperationShiftProductionRow[] {
  return ctx.db.query<OperationShiftProductionRow>(
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

export function getShiftReport(ctx: ShiftServiceContext, from: string, to: string, branchId?: string): OperationShiftReportRow[] {
  const actor = ctx.requireView();
  if (!isValidDate(from) || !isValidDate(to) || to < from) {
    throw new Error('فترة تقرير الورديات غير صالحة.');
  }
  const target = branchId || ctx.branchAccess.getCurrentBranchId(actor);
  ctx.branchAccess.requireBranchAccess(target, actor);
  ctx.ensureShiftInstances(from, to, target);
  const rows = ctx.db.query<any>(
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
             ), 0) / 100.0
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
            h.expected_cash / 100.0 AS handoverExpected, h.actual_cash / 100.0 AS handoverActual,
            h.cash_difference / 100.0 AS handoverDifference, h.cash_delivered / 100.0 AS handoverDelivered
     FROM operation_shifts os
     JOIN attendance_shifts d ON d.id = os.definition_id
     LEFT JOIN employees sup ON sup.id = os.supervisor_id
     LEFT JOIN operation_shift_handovers h ON h.operation_shift_id = os.id
     WHERE os.branch_id = ? AND os.business_date BETWEEN ? AND ?
     ORDER BY os.scheduled_start`,
    [target, from, to]
  );
  return rows.map((row) => {
    const cash = ctx.getCashSummary(row.shiftId);
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

/* ========== ربط الورديات بالحضور والرواتب (Payroll Integration) ========== */

export function getShiftAttendanceForPayroll(ctx: ShiftServiceContext, options: {
  from: string; to: string; branchId?: string;
}): ShiftPayrollRow[] {
  const actor = ctx.requireView();
  const targetBranch = options.branchId || ctx.branchAccess.getCurrentBranchId(actor);
  ctx.branchAccess.requireBranchAccess(targetBranch, actor);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.from) || !/^\d{4}-\d{2}-\d{2}$/.test(options.to)) {
    throw new Error('نطاق التواريخ غير صالح.');
  }
  if (options.to < options.from) {
    throw new Error('تاريخ النهاية يجب أن يكون بعد تاريخ البداية.');
  }

  const rows = ctx.db.query<any>(`
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

export function getEmployeeShiftSummary(ctx: ShiftServiceContext, employeeId: string, options: {
  from: string; to: string; branchId?: string;
}): {
  employeeId: string; employeeName: string; branchId: string;
  totalShifts: number; presentShifts: number; lateShifts: number; absentShifts: number;
  totalWorkedMinutes: number; totalLateMinutes: number; totalOvertimeMinutes: number;
  approvedOvertimeMinutes: number;
} {
  const actor = ctx.requireView();
  const targetBranch = options.branchId || ctx.branchAccess.getCurrentBranchId(actor);
  ctx.branchAccess.requireBranchAccess(targetBranch, actor);

  const employee = ctx.db.query<{ id: string; name: string; branch_id: string }>(
    'SELECT id, name, branch_id AS branchId FROM employees WHERE id = ? AND status != ?',
    [employeeId, 'SUSPENDED']
  )[0];
  if (!employee) throw new Error('الموظف غير موجود.');
  if (employee.branch_id !== targetBranch) throw new Error('الموظف لا يتبع الفرع المحدد.');

  const rows = ctx.db.query<any>(`
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
