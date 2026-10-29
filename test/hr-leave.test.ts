import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { BranchService } from '../src/services/BranchService.ts';
import { EmployeeService } from '../src/services/EmployeeService.ts';
import { LeaveService } from '../src/services/LeaveService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import type { User } from '../src/types/identity.ts';

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
}

test('leave requests follow pending, approved and overlap rules', async () => {
  await boot();
  const service = new LeaveService();
  const employeeId = createEmployee();

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
  const request = service.requestLeave({ employeeId, startDate: '2026-04-01', endDate: '2026-04-02' });

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

  const mainRequest = service.requestLeave({ employeeId: mainEmployee, startDate: '2026-05-01', endDate: '2026-05-02' });
  const betaRequest = service.requestLeave({ employeeId: betaEmployee, startDate: '2026-05-01', endDate: '2026-05-02' });

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
  const request = service.requestLeave({ employeeId, startDate: '2026-07-01', endDate: '2026-07-02' });

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
