import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { BranchService } from '../src/services/BranchService.ts';
import { EmployeeService } from '../src/services/EmployeeService.ts';
import { ContractService } from '../src/services/ContractService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_contracts_admin',
  username: 'contracts-admin',
  fullName: 'Contracts Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const manager: User = {
  id: 'usr_contracts_manager',
  username: 'contracts-manager',
  fullName: 'Contracts Manager',
  role: 'MANAGER',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const sales: User = {
  id: 'usr_contracts_sales',
  username: 'contracts-sales',
  fullName: 'Contracts Sales',
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
     VALUES ('usr_contracts_admin', 'contracts-admin', 'test', 'Contracts Admin', 'ADMIN', 1)`
  );
  for (const [id, username, fullName, role] of [
    ['usr_contracts_manager', 'contracts-manager', 'Contracts Manager', 'MANAGER'],
    ['usr_contracts_sales', 'contracts-sales', 'Contracts Sales', 'SALES'],
  ]) {
    db.run(
      `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
       VALUES (?, ?, 'test', ?, ?, 1, 'ASSIGNED')`,
      [id, username, fullName, role]
    );
    db.run(`INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES (?, 'br_main')`, [id]);
    db.run(`DELETE FROM user_permissions WHERE user_id = ?`, [id]);
  }
  asAdmin();
  PermissionService.invalidate(manager);
  PermissionService.invalidate(sales);
  if (!ModuleRegistryService.isModuleEnabled('hr')) {
    ModuleRegistryService.activate('hr', admin);
    asAdmin();
  }
  return db;
}

function asAdmin(): void {
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
}

function asManager(): void {
  AuthService.setCurrentUser(manager);
  PermissionService.invalidate(manager);
}

function asSales(): void {
  AuthService.setCurrentUser(sales);
  PermissionService.invalidate(sales);
}

let employeeSequence = 0;

function createEmployee(branchId?: string): string {
  const sequence = ++employeeSequence;
  return EmployeeService.create({
    name: `Contract Employee ${sequence}`,
    phone: `0130000${sequence}`,
    location: 'Main',
    role: 'Sales',
    email: '',
    baseSalary: 6000,
    salaryType: 'MONTHLY',
    status: 'ACTIVE',
    joinedDate: '2025-01-01',
    branchId,
  }).id;
}

function isoOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function draft(service: ContractService, employeeId: string, startDate = '2026-01-01', endDate: string | null = null) {
  return service.createContract({
    employeeId,
    contractType: 'FIXED_TERM',
    startDate,
    endDate,
    jobTitle: 'Showroom Sales',
    salary: 7000,
    renewalNoticeDays: 30,
  });
}

test('contract lifecycle is draft, active, renewed and terminated without hard delete', async () => {
  await boot();
  const service = new ContractService();
  const employeeId = createEmployee();

  const contract = draft(service, employeeId);
  assert.equal(contract.status, 'DRAFT');
  assert.match(contract.contractNumber, /^CON-\d{4}-\d{6}$/);
  assert.equal(contract.effectiveStatus, 'DRAFT');

  const updated = service.updateContract(contract.id, { salary: 7500, endDate: '2026-12-31' });
  assert.equal(updated.salary, 7500);

  service.deleteContract(contract.id);
  assert.throws(() => service.getContract(contract.id), /غير موجود/);
});

test('contract lifecycle transitions and guards', async () => {
  await boot();
  const service = new ContractService();
  const employeeId = createEmployee();
  const contract = draft(service, employeeId, '2026-01-01', '2026-06-30');

  const active = service.activateContract(contract.id, '2026-01-02');
  assert.equal(active.status, 'ACTIVE');
  assert.equal(active.signedDate, '2026-01-02');
  assert.throws(() => service.activateContract(contract.id), /ليس مسودة/);
  assert.throws(() => service.updateContract(contract.id, { salary: 9000 }), /بعد تفعيله/);
  assert.throws(() => service.deleteContract(contract.id), /بعد تفعيله/);

  assert.throws(() => service.renewContract(contract.id, { endDate: '2026-05-01' }), /بعد نهاية العقد/);
  const renewed = service.renewContract(contract.id, { endDate: '2026-12-31', salary: 8000 });
  assert.equal(renewed.endDate, '2026-12-31');
  assert.equal(renewed.salary, 8000);

  assert.throws(() => service.terminateContract(contract.id, '   '), /سبب/);
  const terminated = service.terminateContract(contract.id, 'Resigned');
  assert.equal(terminated.status, 'TERMINATED');
  assert.equal(terminated.terminationReason, 'Resigned');
  assert.throws(() => service.renewContract(contract.id, { endDate: '2027-06-30' }), /النشط فقط/);
  assert.throws(() => service.terminateContract(contract.id, 'Again'), /النشط فقط/);
});

test('active contracts for the same employee cannot overlap', async () => {
  await boot();
  const service = new ContractService();
  const employeeId = createEmployee();

  const first = draft(service, employeeId, '2026-01-01', '2026-12-31');
  service.activateContract(first.id);

  const overlapping = draft(service, employeeId, '2026-06-01', '2027-06-01');
  assert.throws(() => service.activateContract(overlapping.id), /يتداخل/);

  const future = draft(service, employeeId, '2027-01-01', '2027-12-31');
  assert.equal(service.activateContract(future.id).status, 'ACTIVE');

  // Renewing must still respect the non-overlap rule for the same employee.
  const third = draft(service, employeeId, '2026-03-01', null);
  assert.throws(() => service.activateContract(third.id), /يتداخل/);
});

test('contract permissions separate viewing from managing and terminating', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ContractService();
  const employeeId = createEmployee();
  const contract = draft(service, employeeId);

  asSales();
  assert.throws(() => service.getContracts(), /صلاحية/);
  asAdmin();

  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_contracts_sales', 'hr.contracts.view', 'GRANT')`
  );
  PermissionService.invalidate(sales);
  asSales();
  assert.ok(service.getContracts().some((row) => row.id === contract.id));
  assert.throws(() => service.createContract({
    employeeId,
    startDate: '2026-01-01',
    jobTitle: 'Blocked',
  }), /صلاحية/);

  // Manage grants creation/activation but not termination; that stays separate.
  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_contracts_sales', 'hr.contracts.manage', 'GRANT')`
  );
  PermissionService.invalidate(sales);
  asSales();
  const created = service.createContract({
    employeeId,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    jobTitle: 'Sales Rep',
  });
  service.activateContract(created.id);
  assert.throws(() => service.terminateContract(created.id, 'No'), /صلاحية/);
  asAdmin();

  asManager();
  assert.ok(service.getContracts().some((row) => row.id === created.id));
  assert.equal(service.terminateContract(created.id, 'Manager decision').status, 'TERMINATED');
});

test('contracts are branch scoped for reads and lifecycle actions', async () => {
  await boot();
  const service = new ContractService();
  const betaBranch = new BranchService().createBranch({
    name: 'Contracts Beta Branch',
    code: 'CON-BETA-1',
    companyId: 'cmp_main',
  });
  const mainEmployee = createEmployee();
  const betaEmployee = createEmployee(betaBranch.id);

  const mainContract = draft(service, mainEmployee);
  const betaContract = draft(service, betaEmployee);

  asManager();
  const visible = service.getContracts();
  assert.ok(visible.some((row) => row.id === mainContract.id));
  assert.ok(!visible.some((row) => row.id === betaContract.id));
  assert.throws(() => service.getContract(betaContract.id), /غير موجود/);
  assert.throws(() => service.activateContract(betaContract.id), /غير موجود/);
  assert.throws(() => service.createContract({
    employeeId: betaEmployee,
    startDate: '2026-01-01',
    jobTitle: 'Cross branch',
  }), /صلاحية/);
  asAdmin();
});

test('contract summary reports expiring and expired terms and hr deactivation blocks writes', async () => {
  await boot();
  const service = new ContractService();
  const employeeId = createEmployee();
  const spareEmployeeId = createEmployee();

  const expiring = draft(service, employeeId, isoOffset(-30), isoOffset(10));
  service.activateContract(expiring.id);
  assert.equal(service.getContract(expiring.id).effectiveStatus, 'EXPIRING');

  const expired = draft(service, employeeId, isoOffset(-400), isoOffset(-40));
  service.activateContract(expired.id);
  assert.equal(service.getContract(expired.id).effectiveStatus, 'EXPIRED');

  const summary = service.getSummary();
  assert.equal(summary.expired, 1);
  assert.equal(summary.expiring, 1);

  ModuleRegistryService.deactivate('hr', admin);
  assert.equal(ModuleRegistryService.isModuleEnabled('hr'), false);
  assert.ok(service.getContracts().some((row) => row.id === expiring.id), 'reads stay available');
  assert.throws(() => draft(service, spareEmployeeId), /غير مفعّلة/);
  assert.throws(() => service.terminateContract(expiring.id, 'Blocked'), /غير مفعّلة/);

  ModuleRegistryService.activate('hr', admin);
  asAdmin();
  assert.equal(ModuleRegistryService.isModuleEnabled('hr'), true);
});
