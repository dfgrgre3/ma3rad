import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { ModuleRegistryService } from '../src/services/domains/config/ModuleRegistryService.ts';
import { OperationsShiftService } from '../src/services/domains/operations/OperationsShiftService.ts';
import { CashierService } from '../src/services/domains/finance/CashierService.ts';
import { AttendanceService } from '../src/services/domains/hr/AttendanceService.ts';
import { AttendanceTimeService } from '../src/services/domains/hr/AttendanceTimeService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';
import type { User } from '../src/types/auth/identity.ts';

const admin: User = {
  id: 'usr_ops_admin',
  username: 'ops-admin',
  fullName: 'Operations Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const cashierTwo: User = {
  id: 'usr_ops_cashier2',
  username: 'ops-cashier2',
  fullName: 'Second Cashier',
  role: 'CASHIER',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const registerId = 'cr_ops_test';
const employeeOne = 'emp_ops_one';
const employeeTwo = 'emp_ops_two';
const employeeThree = 'emp_ops_three';
const businessDate = '2031-03-10';

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_ops_admin', 'ops-admin', 'test', 'Operations Admin', 'ADMIN', 1, 'ALL')`
  );
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_ops_cashier2', 'ops-cashier2', 'test', 'Second Cashier', 'CASHIER', 1, 'ASSIGNED')`
  );
  db.run(`INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES ('usr_ops_cashier2', 'br_main')`);
  for (const [id, code, name] of [
    [employeeOne, 'OPS-EMP-1', 'Operations Employee One'],
    [employeeTwo, 'OPS-EMP-2', 'Operations Employee Two'],
    [employeeThree, 'OPS-EMP-3', 'Operations Employee Three'],
  ]) {
    db.run(
      `INSERT OR REPLACE INTO employees
         (id, code, name, full_name, phone, job_title, hired_at, branch_id, is_active, status)
       VALUES (?, ?, ?, ?, '0000000000', 'Operator', '2030-01-01', 'br_main', 1, 'ACTIVE')`,
      [id, code, name, name]
    );
  }
  db.run(
    `INSERT OR REPLACE INTO cash_registers (id, name, branch_id, current_balance, is_default, is_active)
     VALUES (?, 'Operations Test Register', 'br_main', 0, 0, 1)`,
    [registerId]
  );
  db.run('DELETE FROM operation_shift_production');
  db.run('DELETE FROM operation_shift_handovers');
  db.run('DELETE FROM operation_shift_incidents');
  db.run('DELETE FROM operation_shift_swap_requests');
  db.run('DELETE FROM employee_attendance_periods');
  db.run('DELETE FROM operation_shift_staff');
  db.run('DELETE FROM operation_shift_assignments');
  db.run('DELETE FROM operation_shifts');
  db.run(`DELETE FROM attendance_shifts WHERE name = 'Night Ops Test'`);
  db.run('DELETE FROM cash_shifts WHERE register_id = ?', [registerId]);
  asAdmin();
  PermissionService.invalidate(admin);
  PermissionService.invalidate(cashierTwo);
  if (!ModuleRegistryService.isModuleEnabled('hr')) {
    ModuleRegistryService.activate('hr', admin);
    asAdmin();
  }
  return db;
}

function asAdmin(): void {
  AuthService.setCurrentUser(admin);
}

test('24/7 operations shift lifecycle, multi-drawer cash, handover, attendance and production', async () => {
  const db = await boot();
  const service = new OperationsShiftService();
  const cashier = new CashierService();

  const definition = service.saveShiftDefinition({
    name: 'Night Ops Test',
    department: 'Production',
    location: 'Line A',
    startTime: '22:00',
    endTime: '06:00',
    graceMinutes: 10,
    overtimeAfterMinutes: 30,
    workdays: [0, 1, 2, 3, 4, 5, 6],
    shiftOrder: 3,
  });
  assert.equal(definition.crossesMidnight, true);

  service.ensureShiftInstances(businessDate, businessDate);
  const instance = service.getShiftBoard({ from: businessDate, to: businessDate })
    .find((row) => row.definitionId === definition.id);
  assert.ok(instance, 'shift instance should be generated');
  assert.equal(instance!.businessDate, businessDate);
  assert.equal(instance!.scheduledStart, `${businessDate}T22:00:00`);
  assert.equal(instance!.scheduledEnd, '2031-03-11T06:00:00');

  const opened = service.openShift(instance!.id, {
    supervisorId: employeeOne,
    employeeIds: [employeeTwo],
    notes: 'Start of night shift',
  });
  assert.equal(opened.shift.status, 'OPEN');
  assert.equal(opened.staff.length, 2);
  assert.ok(opened.staff.every((row) => row.checkInAt));
  assert.equal(opened.attendancePeriods.length, 2);

  // Two independent cashier drawers can live inside one operations shift.
  const drawerOne = cashier.openShift(registerId, admin.id, 100, instance!.id);
  const drawerTwo = cashier.openShift(registerId, cashierTwo.id, 250, instance!.id);
  assert.equal(drawerOne.operationShiftId, instance!.id);
  assert.equal(drawerTwo.operationShiftId, instance!.id);
  const linked = cashier.getCashShiftsForOperationShift(instance!.id);
  assert.equal(linked.length, 2);
  assert.equal(
    cashier.getCashShiftSummaryForOperationShift(instance!.id).openShifts,
    2
  );

  assert.throws(
    () => service.submitHandover(instance!.id, { actualCash: 350 }),
    /كاشير/
  );

  cashier.closeShift(drawerOne.id, 100);
  cashier.closeShift(drawerTwo.id, 250);
  assert.equal(
    cashier.getCashShiftSummaryForOperationShift(instance!.id).openShifts,
    0
  );

  const handover = service.submitHandover(instance!.id, {
    expectedCash: 350,
    actualCash: 350,
    cashDelivered: 350,
    inventoryStatus: 'مطابق',
    equipmentStatus: 'سليم',
    pendingOrders: ['PO-1'],
    notes: 'تسليم ليلي',
    nextStaffIds: [employeeThree],
  });
  assert.equal(handover.status, 'PENDING');
  assert.equal(handover.cashDifference, 0);

  const closed = service.confirmHandover(instance!.id, 'تم الاستلام');
  assert.equal(closed.shift.status, 'CLOSED');
  assert.equal(closed.handover?.status, 'RECEIVED');

  const production = service.recordProduction(instance!.id, {
    targetQty: 500,
    producedQty: 480,
    goodQty: 470,
    scrapQty: 10,
    downtimeMinutes: 25,
    downtimeReason: 'تغيير قالب',
  });
  assert.equal(production.producedQty, 480);

  const reportRows = service.getShiftReport(businessDate, businessDate);
  const report = reportRows.find((row) => row.shiftId === instance!.id)!;
  assert.equal(report.producedQty, 480);
  assert.equal(report.scrapQty, 10);
  assert.equal(report.downtimeMinutes, 25);
  assert.equal(report.cashDelivered, 350);

  // Many attendance periods on the same day are allowed and remain separate.
  AttendanceService.clockAttendancePeriod(employeeTwo, 'IN', { at: `${businessDate}T23:00:00` });
  AttendanceService.clockAttendancePeriod(employeeTwo, 'OUT', { at: `${businessDate}T23:30:00` });
  AttendanceService.clockAttendancePeriod(employeeTwo, 'IN', { at: `${businessDate}T23:45:00` });
  AttendanceService.clockAttendancePeriod(employeeTwo, 'OUT', { at: '2031-03-11T00:30:00' });
  const periods = AttendanceService.getAttendancePeriods({
    employeeId: employeeTwo,
    from: businessDate,
    to: '2031-03-11',
  }).filter((row) => row.source === 'MANUAL');
  assert.equal(periods.length, 2);
  assert.ok(periods.every((row) => row.status === 'CLOSED'));
  assert.equal(
    periods.reduce((total, row) => total + row.workedMinutes, 0),
    75
  );

  // Replacement cashier flow keeps the drawer and the operations link.
  service.ensureShiftInstances('2031-03-12', '2031-03-12');
  const generated = db.query<{ id: string }>(
    `SELECT id FROM operation_shifts WHERE definition_id = ? AND business_date = ?`,
    [definition.id, '2031-03-12']
  )[0];
  assert.ok(generated);
  service.openShift(generated!.id, { employeeIds: [employeeTwo] });
  const firstDrawer = cashier.openShift(registerId, admin.id, 50, generated!.id);
  const replacement = cashier.openReplacementShift(firstDrawer.id, cashierTwo.id, 50);
  assert.equal(replacement.operationShiftId, generated!.id);
  assert.equal(replacement.userId, cashierTwo.id);
  assert.equal(cashier.getCashShiftsForOperationShift(generated!.id).length, 2);
});

test('workforce schedule balances staffing, records absences, approves overtime and reports shift cost', async () => {
  const db = await boot();
  const service = new OperationsShiftService();
  const previousMonth = new Date();
  previousMonth.setDate(1);
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const date = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}-10`;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  db.run(
    `UPDATE employees SET base_salary = 2400, salary_type = 'MONTHLY' WHERE id IN (?, ?, ?)`,
    [employeeOne, employeeTwo, employeeThree]
  );
  const definition = service.saveShiftDefinition({
    name: 'Workforce Test',
    startTime: '08:00',
    endTime: '16:00',
    workdays: [weekday],
    minimumStaffCount: 2,
    requiredRestMinutes: 480,
  });
  service.assignEmployee({
    definitionId: definition.id,
    employeeId: employeeOne,
    effectiveFrom: date,
    effectiveTo: date,
  });
  const generated = service.generateWorkforceSchedule(date, date);
  assert.equal(generated.shortages.length, 0);
  assert.equal(generated.staffAssigned, 1);
  const shift = service.getShiftBoard({ from: date, to: date })
    .find((row) => row.definitionId === definition.id)!;
  assert.equal(shift.staffCount, 2);
  assert.equal(shift.minimumStaffCount, 2);

  const conflicting = service.saveShiftDefinition({
    name: 'Workforce Conflict',
    startTime: '12:00',
    endTime: '20:00',
    workdays: [weekday],
  });
  assert.throws(() => service.assignEmployee({
    definitionId: conflicting.id,
    employeeId: employeeOne,
    effectiveFrom: date,
    effectiveTo: date,
  }), /تعارض وردية/);

  const replacementEmployeeId = [employeeTwo, employeeThree]
    .find((employeeId) => !service.getShiftDetail(shift.id).staff.some((staff) => staff.employeeId === employeeId))!;
  service.replaceAbsentStaff(shift.id, employeeOne, replacementEmployeeId, 'غياب مجدول');
  const absent = db.query<{ status: string }>(
    'SELECT status FROM attendance WHERE employee_id = ? AND date = ?',
    [employeeOne, date]
  )[0];
  assert.equal(absent.status, 'ABSENT');
  const opened = service.openShift(shift.id);
  assert.equal(opened.staff.filter((staff) => staff.status !== 'ABSENT').length, 2);
  assert.equal(opened.attendancePeriods.length, 2);

  db.run(
    `UPDATE employee_attendance_periods SET check_out_at = ?, worked_minutes = 540,
       overtime_minutes = 60, status = 'CLOSED' WHERE id = ?`,
    [`${date}T17:00:00`, opened.attendancePeriods[0].id]
  );
  service.approveShiftOvertime(opened.attendancePeriods[0].id);
  const unified = AttendanceTimeService.getUnifiedRows('br_main', date, date)
    .find((row) => row.employeeId === opened.attendancePeriods[0].employeeId)!;
  assert.equal(unified.approvedOvertimeMinutes, 60);
  db.run(
    'UPDATE employees SET joined_date = ?, hired_at = ? WHERE id IN (?, ?, ?)',
    [`${date.slice(0, 7)}-01`, `${date.slice(0, 7)}-01`, employeeOne, employeeTwo, employeeThree]
  );
  const payroll = EmployeeService.calculatePayrollRun(date.slice(0, 7));
  assert.equal(payroll.items.find((item) => item.employeeId === unified.employeeId)?.overtimeMinutes, 60);

  service.recordProduction(shift.id, { targetQty: 100, producedQty: 100, goodQty: 95, scrapQty: 5 });
  const report = service.getShiftReport(date, date).find((row) => row.shiftId === shift.id)!;
  assert.ok(report.laborCost > 0);
  assert.equal(report.approvedOvertimeMinutes, 60);
  assert.ok(report.productivityPerLaborHour > 0);
});

test('shift swaps move both scheduled employees only after manager approval', async () => {
  const db = await boot();
  const service = new OperationsShiftService();
  const firstDate = '2031-03-11';
  const secondDate = '2031-03-13';
  const firstWeekday = new Date(`${firstDate}T00:00:00Z`).getUTCDay();
  const secondWeekday = new Date(`${secondDate}T00:00:00Z`).getUTCDay();
  const first = service.saveShiftDefinition({
    name: 'Swap First Test',
    startTime: '08:00',
    endTime: '16:00',
    workdays: [firstWeekday],
    minimumStaffCount: 1,
  });
  const second = service.saveShiftDefinition({
    name: 'Swap Second Test',
    startTime: '08:00',
    endTime: '16:00',
    workdays: [secondWeekday],
    minimumStaffCount: 1,
  });
  service.assignEmployee({
    definitionId: first.id,
    employeeId: employeeOne,
    effectiveFrom: firstDate,
    effectiveTo: firstDate,
  });
  service.assignEmployee({
    definitionId: second.id,
    employeeId: employeeTwo,
    effectiveFrom: secondDate,
    effectiveTo: secondDate,
  });
  service.generateWorkforceSchedule(firstDate, secondDate);
  const firstShift = db.query<{ id: string }>(
    'SELECT id FROM operation_shifts WHERE definition_id = ? AND business_date = ?',
    [first.id, firstDate]
  )[0];
  const secondShift = db.query<{ id: string }>(
    'SELECT id FROM operation_shifts WHERE definition_id = ? AND business_date = ?',
    [second.id, secondDate]
  )[0];
  assert.ok(firstShift);
  assert.ok(secondShift);
  const request = service.requestShiftSwap({
    requesterEmployeeId: employeeOne,
    targetEmployeeId: employeeTwo,
    requesterShiftId: firstShift.id,
    targetShiftId: secondShift.id,
  });
  assert.equal(request.status, 'PENDING');
  service.decideShiftSwap(request.id, true, 'معتمد');
  assert.equal(db.query<{ employeeId: string }>(
    'SELECT employee_id AS employeeId FROM operation_shift_staff WHERE operation_shift_id = ?',
    [firstShift.id]
  )[0].employeeId, employeeTwo);
  assert.equal(db.query<{ employeeId: string }>(
    'SELECT employee_id AS employeeId FROM operation_shift_staff WHERE operation_shift_id = ?',
    [secondShift.id]
  )[0].employeeId, employeeOne);
});
