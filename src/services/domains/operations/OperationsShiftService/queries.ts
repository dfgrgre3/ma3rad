import { unscaleMoneyRow } from '../../../../utils/money';
import { localDateString } from '../../../../utils/shared/date';
import type { ShiftServiceContext } from './context';
import { bool, dateOffset } from './helpers';
import type {
  EmployeeAttendancePeriod,
  OperationCashSummary,
  OperationShiftDetail,
  OperationShiftHandover,
  OperationShiftInstance,
  OperationShiftStaff,
} from './types';

const INSTANCE_SELECT = `
      SELECT os.*, d.name AS definitionName, d.department, d.location,
             d.minimum_staff_count AS minimumStaffCount,
             sup.name AS supervisorName, opener.full_name AS openedByName,
             h.status AS handoverStatus, h.expected_cash / 100.0 AS handoverExpected,
             h.actual_cash / 100.0 AS handoverActual, h.cash_difference / 100.0 AS handoverDifference,
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
       LEFT JOIN operation_shift_handovers h ON h.operation_shift_id = os.id`;

export function getShiftBoard(ctx: ShiftServiceContext, options: { from?: string; to?: string; branchId?: string } = {}): OperationShiftInstance[] {
  const actor = ctx.requireView();
  const branchId = options.branchId || ctx.branchAccess.getCurrentBranchId(actor);
  ctx.branchAccess.requireBranchAccess(branchId, actor);
  const today = localDateString();
  const from = options.from || dateOffset(today, -7);
  const to = options.to || dateOffset(today, 7);
  ctx.ensureShiftInstances(from, to, branchId);
  const rows = ctx.db.query<any>(
    `${INSTANCE_SELECT}
     WHERE os.branch_id = ? AND os.business_date BETWEEN ? AND ?
     ORDER BY os.scheduled_start DESC`,
    [branchId, from, to]
  );
  return rows.map((row) => mapInstance(ctx, row));
}

function mapInstance(ctx: ShiftServiceContext, row: any): OperationShiftInstance {
  const cash = ctx.getCashSummary(row.id);
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

export function getOpenShiftForBranch(ctx: ShiftServiceContext, branchId?: string): OperationShiftInstance | null {
  const actor = ctx.requireView();
  const target = branchId || ctx.branchAccess.getCurrentBranchId(actor);
  ctx.branchAccess.requireBranchAccess(target, actor);
  const row = ctx.db.query<any>(
    `${INSTANCE_SELECT}
     WHERE os.branch_id = ? AND os.status IN ('OPEN', 'HANDOVER_PENDING')
     ORDER BY os.opened_at DESC LIMIT 1`,
    [target]
  )[0];
  return row ? mapInstance(ctx, row) : null;
}

export function getInstance(ctx: ShiftServiceContext, id: string): OperationShiftInstance {
  const actor = ctx.requireView();
  const row = ctx.db.query<any>(
    `${INSTANCE_SELECT}
     WHERE os.id = ?`,
    [id]
  )[0];
  if (!row) throw new Error('وردية التشغيل غير موجودة.');
  ctx.branchAccess.requireBranchAccess(row.branchId, actor);
  return mapInstance(ctx, row);
}

export function getCashSummary(ctx: ShiftServiceContext, operationShiftId: string): OperationCashSummary {
  const rows = ctx.db.query<any>(
    `SELECT status, expected_ending_cash / 100.0 AS expectedEndingCash, actual_ending_cash / 100.0 AS actualEndingCash,
            cash_difference / 100.0 AS cashDifference, opening_balance / 100.0 AS openingBalance,
            total_sales_cash / 100.0 AS totalSalesCash, total_customer_payments / 100.0 AS totalCustomerPayments,
            total_supplier_payments / 100.0 AS totalSupplierPayments, total_expenses / 100.0 AS totalExpenses,
            total_refunds / 100.0 AS totalRefunds, total_partner_inflows / 100.0 AS totalPartnerInflows,
            total_partner_outflows / 100.0 AS totalPartnerOutflows
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
  const delivered = Number(ctx.db.query<{ value: number }>(
    `SELECT COALESCE(SUM(cash_delivered), 0) / 100.0 AS value FROM operation_shift_handovers
     WHERE operation_shift_id = ? AND status IN ('PENDING', 'RECEIVED')`,
    [operationShiftId]
  )[0]?.value || 0);
  const round = (value: number) => Number(value.toFixed(2));
  return {
    expected: round(expected), actual: round(actual), difference: round(difference),
    delivered: round(delivered), openShifts, closedShifts,
  };
}

export function getShiftDetail(ctx: ShiftServiceContext, id: string): OperationShiftDetail {
  const shift = getInstance(ctx, id);
  const staff = ctx.db.query<OperationShiftStaff>(
    `SELECT st.id, st.operation_shift_id AS operationShiftId, st.employee_id AS employeeId,
            e.name AS employeeName, e.code AS employeeCode, st.role, st.status,
            st.check_in_at AS checkInAt, st.check_out_at AS checkOutAt,
            st.late_minutes AS lateMinutes, st.overtime_minutes AS overtimeMinutes, st.notes
     FROM operation_shift_staff st JOIN employees e ON e.id = st.employee_id
     WHERE st.operation_shift_id = ? ORDER BY st.role DESC, e.name`,
    [id]
  );
  const handoverRow = unscaleMoneyRow(ctx.db.query<any>(
    `SELECT h.*, u.full_name AS submittedByName, r.full_name AS receivedByName
     FROM operation_shift_handovers h
     LEFT JOIN users u ON u.id = h.submitted_by
     LEFT JOIN users r ON r.id = h.received_by
     WHERE h.operation_shift_id = ?`,
    [id]
  )[0], ['expected_cash', 'actual_cash', 'cash_difference', 'cash_delivered']);
  const incidents = ctx.db.query<import('./types').OperationShiftIncident>(
    `SELECT i.id, i.operation_shift_id AS operationShiftId, i.type, i.severity, i.title,
            i.description, i.started_at AS startedAt, i.resolved_at AS resolvedAt,
            i.resolution_notes AS resolutionNotes, i.reported_by AS reportedBy,
            u.full_name AS reportedByName
     FROM operation_shift_incidents i
     LEFT JOIN users u ON u.id = i.reported_by
     WHERE i.operation_shift_id = ? ORDER BY i.created_at DESC`,
    [id]
  );
  const production = ctx.getProduction(id);
  const cashShifts = ctx.db.query<any>(
    `SELECT cs.id, cs.shift_number AS shiftNumber, cs.user_id AS userId,
            u.full_name AS userName, cr.name AS registerName, cs.status,
            cs.opened_at AS openedAt, cs.closed_at AS closedAt,
            cs.opening_balance / 100.0 AS openingBalance, cs.expected_ending_cash / 100.0 AS expectedEndingCash,
            cs.actual_ending_cash / 100.0 AS actualEndingCash, cs.cash_difference / 100.0 AS cashDifference
     FROM cash_shifts cs
     JOIN users u ON u.id = cs.user_id
     JOIN cash_registers cr ON cr.id = cs.register_id
     WHERE cs.operation_shift_id = ? ORDER BY cs.opened_at`,
    [id]
  );
  const attendancePeriods = getPeriods(ctx, { operationShiftId: id });
  const openProductionOrders = ctx.db.query<any>(
    `SELECT po.id, po.order_number AS orderNumber, p.name AS productName, po.quantity,
            po.status, po.due_date AS dueDate
     FROM production_orders po JOIN products p ON p.id = po.product_id
     WHERE po.branch_id = ? AND po.status IN ('RELEASED', 'IN_PROGRESS')
     ORDER BY po.due_date, po.created_at LIMIT 25`,
    [shift.branchId]
  );
  return {
    shift, staff, handover: handoverRow ? mapHandover(handoverRow) : null,
    incidents, production, cashShifts, cashSummary: getCashSummary(ctx, id),
    attendancePeriods, openProductionOrders,
  };
}

function mapHandover(row: any): OperationShiftHandover {
  return {
    ...row,
    expectedCash: Number(row.expectedCash) || 0,
    actualCash: Number(row.actualCash) || 0,
    cashDifference: Number(row.cashDifference) || 0,
    cashDelivered: Number(row.cashDelivered) || 0,
    pendingOrders: parseArray(row.pendingOrdersJson),
    nextStaffIds: parseArray(row.nextStaffJson),
    inventoryStatus: row.inventoryStatus || '',
    equipmentStatus: row.equipmentStatus || '',
    notes: row.notes || '',
    receivedNotes: row.receivedNotes || null,
  };
}

function parseArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function getPeriods(ctx: ShiftServiceContext, filters: {
  employeeId?: string;
  date?: string;
  from?: string;
  to?: string;
  operationShiftId?: string;
} = {}): EmployeeAttendancePeriod[] {
  const actor = ctx.requireView();
  const scope = ctx.branchAccess.sqlScope('e.branch_id', undefined, actor);
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
  return ctx.db.query<EmployeeAttendancePeriod>(
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
