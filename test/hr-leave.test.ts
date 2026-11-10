import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { BranchService } from '../src/services/domains/organization/BranchService.ts';
import { BranchAccessService } from '../src/services/domains/auth/BranchAccessService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';
import { LeaveService } from '../src/services/domains/hr/LeaveService.ts';
import { AttendanceService } from '../src/services/domains/hr/AttendanceService.ts';
import { ModuleRegistryService } from '../src/services/domains/config/ModuleRegistryService.ts';
import type { User } from '../src/types/auth/identity.ts';

const admin: User = {
  id: 'usr_leave_admin',
  username: 'leave-admin',
  fullName: 'Leave Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const limited: User = {
  id: 'usr_leave_limited',
  username: 'leave-limited',
  fullName: 'Leave Limited',
  role: 'SALES',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES ('usr_leave_admin', 'leave-admin', 'test', 'Leave Admin', 'ADMIN', 1),
            ('usr_leave_limited', 'leave-limited', 'test', 'Leave Limited', 'SALES', 1)`
  );
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_leave_limited', 'leave-limited', 'test', 'Leave Limited', 'SALES', 1, 'ASSIGNED')`
  );
  db.run(`INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES ('usr_leave_limited', 'br_main')`);
  db.run("DELETE FROM user_permissions WHERE user_id = 'usr_leave_limited'");
  asAdmin();
  PermissionService.invalidate(limited);
  return db;
}

function asAdmin(): void {
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
}

function asLimited(): void {
  AuthService.setCurrentUser(limited);
  PermissionService.invalidate(limited);
}

let employeeSequence = 0;

function createEmployee(branchId?: string): string {
  const sequence = ++employeeSequence;
  const access = new BranchAccessService();
  const previousBranch = access.getCurrentBranchId(admin);
  if (branchId) access.setCurrentBranchId(branchId, admin);
  try {
    return EmployeeService.create({
      name: `Leave Employee ${sequence}`,
      phone: `0110000${sequence}`,
      location: 'Main',
      role: 'Sales',
      email: '',
      baseSalary: 5000,
      salaryType: 'MONTHLY',
      status: 'ACTIVE',
      joinedDate: '2026-01-01',
      branchId,
    }).id;
  } finally {
    if (branchId) access.setCurrentBranchId(previousBranch, admin);
  }
}

test('leave requests follow pending, approved and overlap rules', async () => {
  await boot();
  const service = new LeaveService();
  const employeeId = createEmployee();
  service.adjustAnnualBalance({
    employeeId,
    year: 2026,
    daysDelta: 5,
    transactionType: 'ALLOCATION',
    effectiveDate: '2026-01-01',
    reason: 'Annual allowance',
  });

  const request = service.requestLeave({
    employeeId,
    leaveType: 'ANNUAL',
    startDate: '2026-03-01',
    endDate: '2026-03-03',
    reason: 'Family trip',
  });
  assert.equal(request.status, 'PENDING');
  assert.equal(request.days, 3);
  assert.equal(request.employeeName, 'Leave Employee 1');

  assert.throws(
    () => service.requestLeave({ employeeId, startDate: '2026-03-03', endDate: '2026-03-05' }),
    /متداخل/
  );
  assert.throws(
    () => service.requestLeave({ employeeId, startDate: '2026-03-10', endDate: '2026-03-01' }),
    /بعد تاريخ البداية/
  );

  const approved = service.decide(request.id, 'APPROVED', 'Approved by admin');
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.decisionNote, 'Approved by admin');
  assert.throws(() => service.decide(request.id, 'REJECTED'), /قيد الانتظار/);

  const summary = service.getSummary(2026);
  assert.equal(summary.approved, 1);
  assert.equal(summary.approvedDays, 3);
  assert.equal(summary.daysByType.ANNUAL, 3);
});

test('leave permissions separate viewing, requesting and approval', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new LeaveService();
  const employeeId = createEmployee();
  const request = service.requestLeave({ employeeId, leaveType: 'SICK', startDate: '2026-04-01', endDate: '2026-04-02' });

  asLimited();
  assert.ok(service.getRequests().some((row) => row.id === request.id));
  assert.throws(() => service.decide(request.id, 'APPROVED'), /صلاحية/);

  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_leave_limited', 'hr.leave.view', 'DENY')`
  );
  PermissionService.invalidate(limited);
  assert.throws(() => service.getRequests(), /صلاحية/);
  asAdmin();
});

test('leave requests are isolated by branch', async () => {
  await boot();
  const service = new LeaveService();
  const betaBranch = new BranchService().createBranch({
    name: 'Leave Beta Branch',
    code: 'LEAVE-BETA-1',
    companyId: 'cmp_main',
  });
  const mainEmployee = createEmployee();
  const betaEmployee = createEmployee(betaBranch.id);

  const mainRequest = service.requestLeave({ employeeId: mainEmployee, leaveType: 'SICK', startDate: '2026-05-01', endDate: '2026-05-02' });
  const access = new BranchAccessService();
  access.setCurrentBranchId(betaBranch.id, admin);
  const betaRequest = service.requestLeave({ employeeId: betaEmployee, leaveType: 'SICK', startDate: '2026-05-01', endDate: '2026-05-02' });
  access.setCurrentBranchId('br_main', admin);

  asLimited();
  const visible = service.getRequests();
  assert.ok(visible.some((row) => row.id === mainRequest.id));
  assert.ok(!visible.some((row) => row.id === betaRequest.id));
  assert.throws(() => service.getRequest(betaRequest.id), /غير موجود/);
  assert.throws(
    () => service.requestLeave({ employeeId: betaEmployee, startDate: '2026-06-01', endDate: '2026-06-02' }),
    /صلاحية/
  );
});

test('deactivating hr blocks new leave writes but preserves history', async () => {
  await boot();
  const service = new LeaveService();
  const employeeId = createEmployee();
  const request = service.requestLeave({ employeeId, leaveType: 'SICK', startDate: '2026-07-01', endDate: '2026-07-02' });

  ModuleRegistryService.deactivate('hr', admin);
  assert.ok(service.getRequests().some((row) => row.id === request.id));
  assert.throws(
    () => service.requestLeave({ employeeId, startDate: '2026-08-01', endDate: '2026-08-02' }),
    /غير مفعّلة/
  );
  assert.throws(() => service.decide(request.id, 'APPROVED'), /غير مفعّلة/);

  ModuleRegistryService.activate('hr', admin);
  asAdmin();
  assert.equal(ModuleRegistryService.isModuleEnabled('hr'), true);
});

test('leave dates are strict and annual balances reserve, approve and restore attendance', async () => {
  const db = await boot();
  const service = new LeaveService();
  const employeeId = createEmployee();
  assert.throws(
    () => service.requestLeave({ employeeId, leaveType: 'SICK', startDate: '2026-02-30', endDate: '2026-03-01' }),
    /تاريخ البداية غير صالح/
  );

  const shift = AttendanceService.saveShift({
    name: 'Leave test weekday shift',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 0,
    graceMinutes: 0,
    overtimeAfterMinutes: 0,
    workdays: [1, 2, 3, 4, 5],
  });
  AttendanceService.assignShift(employeeId, shift.id, '2026-01-01');
  AttendanceService.addHoliday('2026-03-02', 'Leave test holiday');
  service.adjustAnnualBalance({
    employeeId,
    year: 2026,
    daysDelta: 1,
    transactionType: 'ALLOCATION',
    effectiveDate: '2026-01-01',
    reason: 'Manual annual balance',
  });
  db.run(
    `INSERT INTO attendance (id, employee_id, date, status, source, recorded_by)
     VALUES ('leave_previous_absence', ?, '2026-03-03', 'ABSENT', 'MANUAL', 'usr_leave_admin')`,
    [employeeId]
  );

  const request = service.requestLeave({
    employeeId,
    leaveType: 'ANNUAL',
    startDate: '2026-03-01',
    endDate: '2026-03-03',
  });
  assert.equal(request.days, 1, 'weekend and registered holiday are not charged');
  assert.equal(service.getBalanceSummary(employeeId, 2026).pendingDays, 1);
  assert.throws(
    () => service.requestLeave({
      employeeId, leaveType: 'ANNUAL', startDate: '2026-03-04', endDate: '2026-03-04',
    }),
    /رصيد الإجازة السنوية غير كافٍ/
  );

  service.decide(request.id, 'APPROVED');
  assert.equal(
    db.query<{ status: string }>("SELECT status FROM attendance WHERE employee_id = ? AND date = '2026-03-03'", [employeeId])[0]?.status,
    'LEAVE'
  );
  assert.equal(
    db.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM attendance WHERE employee_id = ? AND date IN ('2026-03-01', '2026-03-02')",
      [employeeId]
    )[0].count,
    0
  );
  assert.equal(service.getBalanceSummary(employeeId, 2026).availableDays, 0);

  service.cancel(request.id);
  assert.equal(
    db.query<{ status: string }>("SELECT status FROM attendance WHERE employee_id = ? AND date = '2026-03-03'", [employeeId])[0]?.status,
    'ABSENT'
  );
  assert.equal(service.getBalanceSummary(employeeId, 2026).availableDays, 1);

  const unscheduledEmployeeId = createEmployee();
  service.saveTypePolicy('SICK', 1);
  assert.throws(
    () => service.requestLeave({
      employeeId: unscheduledEmployeeId, leaveType: 'SICK', startDate: '2026-03-01', endDate: '2026-03-03',
    }),
    /يتجاوز الطلب الحد السنوي/
  );
  service.saveTypePolicy('SICK', 2);
  assert.equal(
    service.requestLeave({
      employeeId: unscheduledEmployeeId, leaveType: 'SICK', startDate: '2026-03-01', endDate: '2026-03-03',
    }).days,
    2,
    'without a shift use calendar dates but still exclude the company holiday'
  );
  db.run(
    `INSERT INTO attendance (id, employee_id, date, status, source, recorded_by)
     VALUES ('leave_calendar_absence', ?, '2026-03-04', 'ABSENT', 'MANUAL', 'usr_leave_admin')`,
    [unscheduledEmployeeId]
  );
  assert.ok(service.getCalendar('2026-03').some((entry) =>
    entry.employeeId === unscheduledEmployeeId && entry.status === 'ABSENT'
  ));
});

test('approved unpaid leave updates attendance and is deducted from the period payroll', async () => {
  const db = await boot();
  const service = new LeaveService();
  const employeeId = createEmployee();
  const shift = AttendanceService.saveShift({
    name: 'Unpaid leave test shift',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 0,
    graceMinutes: 0,
    overtimeAfterMinutes: 0,
    workdays: [1, 2, 3, 4, 5, 6, 0],
  });
  AttendanceService.assignShift(employeeId, shift.id, '2026-01-01');
  const request = service.requestLeave({
    employeeId,
    leaveType: 'UNPAID',
    startDate: '2026-03-10',
    endDate: '2026-03-11',
  });
  service.decide(request.id, 'APPROVED');
  const run = EmployeeService.calculatePayrollRun('2026-03');
  const item = run.items.find((row) => row.employeeId === employeeId);
  assert.equal(item?.unpaidLeaveDays, 2);
  assert.ok(Number(item?.attendanceDeductionAmount) > 0);
  assert.equal(
    db.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM attendance WHERE employee_id = ? AND date BETWEEN '2026-03-10' AND '2026-03-11' AND status = 'LEAVE'",
      [employeeId]
    )[0].count,
    2
  );
});

test('annual leave accrues monthly, prorates on service, and caps year-end carryover', async () => {
  const db = await boot();
  const service = new LeaveService();
  const employeeId = createEmployee();
  service.saveAnnualAccrualPolicy({
    effectiveFrom: '2026-01-01',
    annualEntitlementDays: 24,
    carryoverLimitDays: 5,
    prorateOnService: true,
  });
  const carryoverEmployeeId = createEmployee();

  assert.equal(service.getBalanceSummary(employeeId, 2026, '2026-03-31').grantedDays, 6);
  assert.equal(service.getBalanceSummary(employeeId, 2026, '2026-03-31').grantedDays, 6);
  const request = service.requestLeave({
    employeeId,
    leaveType: 'ANNUAL',
    startDate: '2026-04-15',
    endDate: '2026-04-16',
  });
  service.decide(request.id, 'APPROVED');

  assert.equal(service.getBalanceSummary(employeeId, 2026, '2026-12-31').grantedDays, 24);
  assert.equal(
    db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM employee_leave_balance_transactions
       WHERE employee_id = ? AND source_key LIKE 'ACCRUAL:2026-%'`,
      [employeeId]
    )[0].count,
    12
  );
  assert.throws(
    () => service.saveAnnualAccrualPolicy({
      effectiveFrom: '2026-01-01',
      annualEntitlementDays: 30,
      carryoverLimitDays: 5,
      prorateOnService: true,
    }),
    /بأثر رجعي/
  );
  assert.equal(service.getBalanceSummary(carryoverEmployeeId, 2026, '2026-12-31').grantedDays, 24);
  assert.equal(service.getBalanceSummary(carryoverEmployeeId, 2027, '2027-01-31').grantedDays, 7);
  assert.equal(
    db.query<{ days: number }>(
      `SELECT days_delta AS days FROM employee_leave_balance_transactions
       WHERE employee_id = ? AND source_key = 'CARRYOVER:2027'`,
      [carryoverEmployeeId]
    )[0].days,
    5
  );
  service.saveAnnualAccrualPolicy({
    employeeId,
    effectiveFrom: '2027-01-01',
    annualEntitlementDays: 36,
    carryoverLimitDays: 0,
    prorateOnService: false,
  });
  const nextYearBalance = service.getBalanceSummary(employeeId, 2027, '2027-01-31');
  assert.equal(nextYearBalance.grantedDays, 3);
  assert.equal(
    service.getAnnualAccrualPolicyState(employeeId, '2027-01-01').effectivePolicy?.annualEntitlementDays,
    36
  );

  const employeeProrateId = createEmployee();
  db.run("UPDATE employees SET joined_date = '2026-01-16' WHERE id = ?", [employeeProrateId]);
  service.saveAnnualAccrualPolicy({
    employeeId: employeeProrateId,
    effectiveFrom: '2026-01-01',
    annualEntitlementDays: 31,
    carryoverLimitDays: 0,
    prorateOnService: true,
  });
  assert.equal(
    service.getBalanceSummary(employeeProrateId, 2026, '2026-01-31').grantedDays,
    1.3333
  );
  assert.equal(
    db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM employee_leave_balance_transactions
       WHERE employee_id = ? AND source_key = 'ACCRUAL:2026-01'`,
      [employeeProrateId]
    )[0].count,
    1
  );

  const terminatedEmployeeId = createEmployee();
  db.run(
    "UPDATE employees SET joined_date = '2026-01-01', terminated_at = '2026-01-16' WHERE id = ?",
    [terminatedEmployeeId]
  );
  service.saveAnnualAccrualPolicy({
    employeeId: terminatedEmployeeId,
    effectiveFrom: '2026-01-01',
    annualEntitlementDays: 31,
    carryoverLimitDays: 0,
    prorateOnService: true,
  });
  assert.equal(service.getAnnualBalanceAsOf(terminatedEmployeeId, '2026-01-16'), 1.3333);
});
