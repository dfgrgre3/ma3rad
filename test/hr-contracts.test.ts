import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { BranchService } from '../src/services/domains/organization/BranchService.ts';
import { BranchAccessService } from '../src/services/domains/auth/BranchAccessService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';
import { ContractService } from '../src/services/domains/hr/ContractService.ts';
import { EmployeeOrganizationService } from '../src/services/domains/hr/EmployeeOrganizationService.ts';
import { ModuleRegistryService } from '../src/services/domains/config/ModuleRegistryService.ts';
import type { User } from '../src/types/auth/identity.ts';

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
  const access = new BranchAccessService();
  const previousBranch = access.getCurrentBranchId(admin);
  if (branchId) access.setCurrentBranchId(branchId, admin);
  try {
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
  } finally {
    if (branchId) access.setCurrentBranchId(previousBranch, admin);
  }
}

function isoOffset(days: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

function activate(service: ContractService, contractId: string, signedDate?: string) {
  service.approveContract(contractId);
  return service.activateContract(contractId, signedDate);
}

test('contract lifecycle is draft, active, renewed and terminated without hard delete', async () => {
  await boot();
  const service = new ContractService();
  const employeeId = createEmployee();

  const contract = draft(service, employeeId);
  assert.equal(contract.status, 'DRAFT');
  assert.match(contract.contractNumber, /^CON-\d{4}-\d{6}$/);
  assert.equal(contract.effectiveStatus, 'DRAFT');

  const updated = service.updateContract(contract.id, { salary: 7500, endDate: isoOffset(-10) });
  assert.equal(updated.salary, 7500);

  service.deleteContract(contract.id);
  assert.throws(() => service.getContract(contract.id), /غير موجود/);
});

test('employee profiles persist personal and organization fields with same-branch manager validation', async () => {
  const db = await boot();
  const organization = new EmployeeOrganizationService();
  const suffix = Date.now().toString();
  const department = organization.createDepartment({ name: `Operations ${suffix}`, branchId: 'br_main' });
  const jobTitle = organization.createJobTitle({ title: `Supervisor ${suffix}`, departmentId: department.id });
  const managerId = createEmployee();
  const employee = EmployeeService.create({
    name: `Profile Employee ${suffix}`,
    phone: `0140000${suffix.slice(-4)}`,
    phone2: '01512345678',
    nationalId: `ID-${suffix}`,
    birthDate: '1990-04-12',
    gender: 'FEMALE',
    location: 'Main',
    role: jobTitle.title,
    email: '',
    address: 'Main Street',
    emergencyContactName: 'Emergency Contact',
    emergencyContactPhone: '01612345678',
    departmentId: department.id,
    managerEmployeeId: managerId,
    baseSalary: 6000,
    salaryType: 'MONTHLY',
    salaryPaymentMethod: 'BANK_TRANSFER',
    bankName: 'Test Bank',
    bankAccountNumber: '001234567890',
    socialInsuranceNumber: 'INS-123',
    taxFileNumber: 'TAX-123',
    education: 'Bachelor degree',
    previousExperience: 'Five years',
    status: 'ACTIVE',
    joinedDate: '2025-01-01',
  });

  const loaded = EmployeeService.getById(employee.id);
  assert.equal(loaded?.nationalId, `ID-${suffix}`);
  assert.equal(loaded?.phone2, '01512345678');
  assert.equal(loaded?.departmentName, department.name);
  assert.equal(loaded?.managerEmployeeId, managerId);
  assert.ok(loaded?.managerName);
  assert.equal(loaded?.salaryPaymentMethod, 'BANK_TRANSFER');
  assert.equal(loaded?.bankAccountNumber, '001234567890');
  assert.equal(loaded?.previousExperience, 'Five years');
  assert.ok(organization.getDepartments('br_main').some((item) => item.id === department.id));
  assert.ok(organization.getJobTitles(department.id).some((item) => item.id === jobTitle.id));
  const updatedJobTitle = organization.updateJobTitle(jobTitle.id, `Senior Supervisor ${suffix}`);
  assert.equal(updatedJobTitle.title, `Senior Supervisor ${suffix}`);
  organization.deactivateJobTitle(jobTitle.id);
  assert.ok(!organization.getJobTitles(department.id).some((item) => item.id === jobTitle.id));

  EmployeeService.update(employee.id, { education: 'Updated degree', phone2: '' });
  assert.equal(EmployeeService.getById(employee.id)?.education, 'Updated degree');
  assert.equal(EmployeeService.getById(employee.id)?.phone2, null);
  organization.deactivateDepartment(department.id);
  EmployeeService.update(employee.id, { education: 'After department deactivation' });
  assert.equal(EmployeeService.getById(employee.id)?.education, 'After department deactivation');
  assert.throws(
    () => EmployeeService.update(managerId, { managerEmployeeId: employee.id }),
    /تسلسلاً إدارياً دائرياً/
  );
  assert.throws(
    () => EmployeeService.create({
      name: `Duplicate Profile ${suffix}`,
      phone: `0170000${suffix.slice(-4)}`,
      nationalId: `ID-${suffix}`,
      location: 'Main',
      role: 'Assistant',
      email: '',
      baseSalary: 1000,
      salaryType: 'MONTHLY',
      status: 'ACTIVE',
      joinedDate: '2025-01-01',
    }),
    /رقم الهوية مسجل/
  );
  assert.equal(db.query<{ managerEmployeeId: string }>(
    'SELECT manager_employee_id AS managerEmployeeId FROM employees WHERE id = ?', [employee.id]
  )[0]?.managerEmployeeId, managerId);

  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_contracts_sales', 'ui.employees.employees.view', 'GRANT')`
  );
  asSales();
  const restrictedProfile = EmployeeService.getById(employee.id);
  assert.equal(restrictedProfile?.nationalId, null);
  assert.equal(restrictedProfile?.address, null);
  assert.equal(restrictedProfile?.baseSalary, 0);
  assert.equal(restrictedProfile?.bankAccountNumber, null);
});

test('contract lifecycle transitions and guards', async () => {
  await boot();
  const service = new ContractService();
  const employeeId = createEmployee();
  const contract = draft(service, employeeId, isoOffset(-100), isoOffset(-10));

  assert.throws(() => service.activateContract(contract.id), /اعتماد العقد/);
  service.approveContract(contract.id);
  const active = service.activateContract(contract.id, '2026-01-02');
  assert.equal(active.status, 'ACTIVE');
  assert.equal(active.signedDate, '2026-01-02');
  assert.throws(() => service.activateContract(contract.id), /ليس مسودة/);
  assert.throws(() => service.updateContract(contract.id, { salary: 9000 }), /بعد تفعيله/);
  assert.throws(() => service.deleteContract(contract.id), /بعد تفعيله/);

  assert.throws(() => service.renewContract(contract.id, { endDate: isoOffset(-1) }), /فترة التجديد/);
  const renewed = service.renewContract(contract.id, { endDate: isoOffset(30), salary: 8000 });
  assert.equal(renewed.status, 'DRAFT');
  assert.equal(renewed.endDate, isoOffset(30));
  assert.equal(renewed.salary, 8000);
  assert.equal(renewed.renewedFromId, contract.id);
  assert.equal(service.getContract(contract.id).endDate, isoOffset(-10), 'renewal keeps the original contract term intact');
  service.approveContract(renewed.id);
  service.activateContract(renewed.id);
  assert.equal(service.getContract(contract.id).endDate, isoOffset(-10));
  EmployeeService.addTransaction({
    employeeId, type: 'SALARY_PAYOUT', amount: 100, date: isoOffset(0), notes: 'Partial salary payment',
  });

  assert.throws(() => service.terminateContract(renewed.id, {
    terminationDate: isoOffset(0), reason: '   ', employeeStatus: 'RESIGNED',
  }), /سبب/);
  const terminated = service.terminateContract(renewed.id, {
    terminationDate: isoOffset(0), reason: 'Resigned', employeeStatus: 'RESIGNED',
  });
  assert.equal(terminated.status, 'TERMINATED');
  assert.equal(terminated.terminationReason, 'Resigned');
  assert.equal(EmployeeService.getById(employeeId)?.status, 'RESIGNED');
  assert.equal(DatabaseManager.getInstance().query<{ isActive: number }>(
    'SELECT is_active AS isActive FROM employees WHERE id = ?', [employeeId]
  )[0]?.isActive, 0);
  assert.equal(service.getFinalSettlements(employeeId).length, 1);
  assert.equal(service.getFinalSettlements(employeeId)[0].terminationDate, isoOffset(0));
  const terminationDate = isoOffset(0);
  const terminationMonthDays = new Date(Date.UTC(
    Number(terminationDate.slice(0, 4)), Number(terminationDate.slice(5, 7)), 0
  )).getUTCDate();
  assert.equal(
    service.getFinalSettlements(employeeId)[0].earnedWages,
    Math.round((8000 / terminationMonthDays - 100 + Number.EPSILON) * 100) / 100,
    'already paid salary is deducted from the final settlement'
  );
  assert.throws(() => service.renewContract(contract.id, { endDate: '2027-06-30' }), /تجديد مفتوح/);
  assert.throws(() => service.terminateContract(contract.id, {
    terminationDate: isoOffset(0), reason: 'Again', employeeStatus: 'TERMINATED',
  }), /بعد انتهاء العقد/);
});

test('active contracts for the same employee cannot overlap', async () => {
  await boot();
  const service = new ContractService();
  const employeeId = createEmployee();

  const first = draft(service, employeeId, '2026-01-01', '2026-12-31');
  activate(service, first.id);

  const overlapping = draft(service, employeeId, '2026-06-01', '2027-06-01');
  service.approveContract(overlapping.id);
  assert.throws(() => service.activateContract(overlapping.id), /يتداخل/);

  const future = draft(service, employeeId, '2027-01-01', '2027-12-31');
  assert.equal(activate(service, future.id).status, 'ACTIVE');

  // Renewing must still respect the non-overlap rule for the same employee.
  const third = draft(service, employeeId, '2026-03-01', null);
  service.approveContract(third.id);
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
  assert.throws(() => service.activateContract(created.id), /اعتماد العقد/);
  assert.throws(() => service.approveContract(created.id), /صلاحية/);
  asAdmin();
  service.approveContract(created.id);
  asSales();
  service.activateContract(created.id);
  assert.throws(() => service.terminateContract(created.id, {
    terminationDate: isoOffset(0), reason: 'No', employeeStatus: 'RESIGNED',
  }), /صلاحية/);
  asAdmin();

  asManager();
  assert.ok(service.getContracts().some((row) => row.id === created.id));
  assert.equal(service.terminateContract(created.id, {
    terminationDate: isoOffset(0), reason: 'Manager decision', employeeStatus: 'TERMINATED',
  }).status, 'TERMINATED');
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
  const access = new BranchAccessService();
  access.setCurrentBranchId(betaBranch.id, admin);
  const betaContract = draft(service, betaEmployee);
  access.setCurrentBranchId('br_main', admin);

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
  activate(service, expiring.id);
  assert.equal(service.getContract(expiring.id).effectiveStatus, 'EXPIRING');

  const expired = draft(service, employeeId, isoOffset(-400), isoOffset(-40));
  activate(service, expired.id);
  assert.equal(service.getContract(expired.id).effectiveStatus, 'EXPIRED');

  const summary = service.getSummary(employeeId);
  assert.equal(summary.expired, 1);
  assert.equal(summary.expiring, 1);

  ModuleRegistryService.deactivate('hr', admin);
  assert.equal(ModuleRegistryService.isModuleEnabled('hr'), false);
  assert.ok(service.getContracts().some((row) => row.id === expiring.id), 'reads stay available');
  assert.throws(() => draft(service, spareEmployeeId), /غير مفعّلة/);
  assert.throws(() => service.terminateContract(expiring.id, {
    terminationDate: isoOffset(0), reason: 'Blocked', employeeStatus: 'TERMINATED',
  }), /غير مفعّلة/);

  ModuleRegistryService.activate('hr', admin);
  asAdmin();
  assert.equal(ModuleRegistryService.isModuleEnabled('hr'), true);
});

test('effective contract salary and fixed components are used by payroll', async () => {
  await boot();
  const service = new ContractService();
  const employeeId = createEmployee();
  const today = isoOffset(0);
  const contract = service.createContract({
    employeeId,
    startDate: today,
    endDate: isoOffset(30),
    jobTitle: 'Payroll Employee',
    salary: 7000,
    salaryComponents: [{ name: 'Housing allowance', amount: 800 }, { name: 'Transport', amount: 200 }],
  });
  activate(service, contract.id);

  const employee = EmployeeService.getById(employeeId);
  assert.equal(employee?.baseSalary, 7000);
  assert.equal(DatabaseManager.getInstance().query(
    `SELECT id FROM employee_salary_history WHERE employee_id = ? AND source_id = ?`,
    [employeeId, contract.id]
  ).length, 1);

  const run = EmployeeService.calculatePayrollRun(today.slice(0, 7));
  const item = run.items.find((candidate) => candidate.employeeId === employeeId);
  assert.ok(item, 'the active contract employee is included in the payroll period');
  assert.equal(item.details.salaryComponentTotal, 1000);
  assert.deepEqual(item.details.salaryComponents, [
    { name: 'Housing allowance', amount: 800 },
    { name: 'Transport', amount: 200 },
  ]);
  assert.equal(item.baseSalary, 7000);
  assert.ok(item.baseAmount > 0);
});

test('payroll excludes employees whose recorded contracts ended before the period', async () => {
  await boot();
  const service = new ContractService();
  const employeeId = createEmployee();
  const contract = draft(service, employeeId, isoOffset(-90), isoOffset(-40));
  activate(service, contract.id);

  const run = EmployeeService.calculatePayrollRun(isoOffset(0).slice(0, 7));
  assert.ok(!run.items.some((item) => item.employeeId === employeeId));
});
