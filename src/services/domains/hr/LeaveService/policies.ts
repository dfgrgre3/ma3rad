import { v4 as uuidv4 } from 'uuid';
import type { User } from '../../../../types/auth/identity';
import type { LeaveType } from '../../../../types/hr/leave';
import type {
  AnnualLeaveAccrualPolicy,
  AnnualLeaveAccrualPolicyState,
  AnnualLeavePolicyRow,
  LeaveServiceDeps,
  LeaveTypePolicy,
} from './types';
import { assertDate, LEAVE_TYPES, monthStart } from './utils';
import { assertPayrollPeriodsEditable } from './requestQueries';
import { queryAnnualLeavePolicy } from './accrual';

type Db = LeaveServiceDeps['db'];

function toAccrualPolicy(row: AnnualLeavePolicyRow | null): AnnualLeaveAccrualPolicy | null {
  return row ? ({
    id: row.id,
    branchId: row.branchId,
    employeeId: row.employeeId,
    effectiveFrom: row.effectiveFrom,
    annualEntitlementDays: row.annualEntitlementDays,
    carryoverLimitDays: row.carryoverLimitDays,
    prorateOnService: row.prorateOnService == null ? null : Boolean(row.prorateOnService),
  }) : null;
}

export function getAnnualAccrualPolicyState(
  deps: LeaveServiceDeps,
  actor: User,
  employeeId?: string,
  asOfDate = new Date().toISOString().slice(0, 10)
): AnnualLeaveAccrualPolicyState {
  const { db, branchAccess, departmentAccess } = deps;
  assertDate(asOfDate, 'تاريخ السياسة');
  const branchId = branchAccess.getCurrentBranchId(actor);
  const effectiveDate = monthStart(asOfDate);
  const branchRow = queryAnnualLeavePolicy(db, branchId, null, effectiveDate);
  let employeeRow: AnnualLeavePolicyRow | null = null;
  if (employeeId) {
    const employee = db.query<{ branchId: string | null }>(
      'SELECT branch_id AS branchId FROM employees WHERE id = ?',
      [employeeId]
    )[0];
    if (!employee?.branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
    branchAccess.requireBranchAccess(employee.branchId, actor);
    departmentAccess.requireEmployeeAccess(employeeId, actor);
    if (employee.branchId !== branchId) throw new Error('اختر موظفًا من الفرع الحالي.');
    employeeRow = queryAnnualLeavePolicy(db, branchId, employeeId, effectiveDate);
  }

  const branchPolicy = toAccrualPolicy(branchRow);
  const employeePolicy = toAccrualPolicy(employeeRow);
  return {
    branchPolicy,
    employeePolicy: employeePolicy?.annualEntitlementDays == null ? null : employeePolicy,
    effectivePolicy: employeePolicy?.annualEntitlementDays != null ? employeePolicy : branchPolicy,
  };
}

export function saveAnnualAccrualPolicy(
  deps: LeaveServiceDeps,
  actor: User,
  input: {
    employeeId?: string;
    effectiveFrom: string;
    annualEntitlementDays?: number;
    carryoverLimitDays?: number;
    prorateOnService?: boolean;
    inheritBranchPolicy?: boolean;
  }
): void {
  const { db, branchAccess, departmentAccess } = deps;
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
    const employee = db.query<{ branchId: string | null }>(
      'SELECT branch_id AS branchId FROM employees WHERE id = ?',
      [input.employeeId]
    )[0];
    if (!employee?.branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
    branchAccess.requireBranchAccess(employee.branchId, actor);
    departmentAccess.requireEmployeeAccess(input.employeeId, actor);
    branchId = employee.branchId;
  } else {
    branchId = branchAccess.getCurrentBranchId(actor);
  }

  const scopeKey = input.employeeId ?? 'BRANCH';
  const generated = db.query<{ id: string }>(
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
  assertPayrollPeriodsEditable(db, {
    branchId,
    startDate: input.effectiveFrom,
    endDate: input.effectiveFrom,
  });

  const previous = queryAnnualLeavePolicy(db, branchId, input.employeeId ?? null, input.effectiveFrom);
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

  db.executeFinancialTransaction(() => {
    db.run(
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
    db.run(
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

export function getTypePolicies(db: Db, branchId: string): LeaveTypePolicy[] {
  return LEAVE_TYPES.map((leaveType) => ({
    leaveType,
    maxDaysPerYear: db.query<{ maxDaysPerYear: number | null }>(
      `SELECT max_days_per_year AS maxDaysPerYear
       FROM employee_leave_type_policies WHERE branch_id = ? AND leave_type = ?`,
      [branchId, leaveType]
    )[0]?.maxDaysPerYear ?? null,
  }));
}

export function saveTypePolicy(
  deps: LeaveServiceDeps,
  actor: User,
  leaveType: LeaveType,
  maxDaysPerYear: number | null
): void {
  const { db, branchAccess } = deps;
  if (!LEAVE_TYPES.includes(leaveType)) throw new Error('نوع الإجازة غير صالح.');
  if (maxDaysPerYear !== null && (!Number.isFinite(maxDaysPerYear) || maxDaysPerYear < 0)) {
    throw new Error('الحد السنوي يجب أن يكون رقمًا موجبًا أو غير محدود.');
  }
  const branchId = branchAccess.getCurrentBranchId(actor);
  const previous = db.query<{ maxDaysPerYear: number | null }>(
    `SELECT max_days_per_year AS maxDaysPerYear
     FROM employee_leave_type_policies WHERE branch_id = ? AND leave_type = ?`,
    [branchId, leaveType]
  )[0]?.maxDaysPerYear ?? null;
  db.executeFinancialTransaction(() => {
    db.run(
      `INSERT INTO employee_leave_type_policies (branch_id, leave_type, max_days_per_year, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(branch_id, leave_type) DO UPDATE SET
         max_days_per_year = excluded.max_days_per_year,
         updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`,
      [branchId, leaveType, maxDaysPerYear, actor.id]
    );
    db.run(
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

export async function getTypePoliciesAsync(db: Db, branchId: string): Promise<LeaveTypePolicy[]> {
  const rows = await db.queryAsync<{ leaveType: LeaveType; maxDaysPerYear: number | null }>(
    `SELECT leave_type AS leaveType, max_days_per_year AS maxDaysPerYear
     FROM employee_leave_type_policies WHERE branch_id = ?`,
    [branchId]
  );
  const byType = new Map(rows.map((row) => [row.leaveType, row.maxDaysPerYear]));
  return LEAVE_TYPES.map((leaveType) => ({
    leaveType,
    maxDaysPerYear: byType.get(leaveType) ?? null,
  }));
}
