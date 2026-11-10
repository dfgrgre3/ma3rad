import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { BranchAccessService } from '../src/services/domains/auth/BranchAccessService.ts';
import { BranchService } from '../src/services/domains/organization/BranchService.ts';
import { ContractService } from '../src/services/domains/hr/ContractService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';
import { ModuleRegistryService } from '../src/services/domains/config/ModuleRegistryService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { RecruitmentService } from '../src/services/domains/hr/RecruitmentService.ts';
import type { User } from '../src/types/auth/identity.ts';

const admin: User = {
  id: 'usr_recruitment_admin',
  username: 'recruitment-admin',
  fullName: 'Recruitment Admin',
  role: 'ADMIN',
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
     VALUES ('usr_recruitment_admin', 'recruitment-admin', 'test', 'Recruitment Admin', 'ADMIN', 1)`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  return db;
}

test('recruitment jobs and candidates follow validation and hiring stages', async () => {
  const db = await boot();
  const service = new RecruitmentService();
  const job = service.createJob({
    title: 'محاسب فرع',
    department: 'المالية',
    employmentType: 'FULL_TIME',
    openings: 1,
  });
  assert.equal(job.status, 'OPEN');
  assert.equal(job.openings, 1);

  assert.throws(
    () => service.createCandidate({ jobId: job.id, fullName: 'مرشح بدون تواصل' }),
    /رقم هاتف المرشح أو بريده/
  );
  assert.throws(
    () => service.createCandidate({ jobId: job.id, fullName: 'مرشح', email: 'invalid' }),
    /البريد الإلكتروني غير صالح/
  );

  const candidate = service.createCandidate({
    jobId: job.id,
    fullName: 'أحمد علي',
    email: 'ahmed@example.com',
    source: 'إحالة',
  });
  assert.equal(candidate.status, 'NEW');
  assert.equal(candidate.jobTitle, job.title);
  assert.throws(
    () => service.createCandidate({ jobId: job.id, fullName: 'مكرر', email: 'AHMED@example.com' }),
    /مسجل بالفعل/
  );

  assert.equal(service.setCandidateStatus(candidate.id, 'SCREENING').status, 'SCREENING');
  assert.equal(service.setCandidateStatus(candidate.id, 'INTERVIEW').status, 'INTERVIEW');
  assert.equal(service.setCandidateStatus(candidate.id, 'OFFER').status, 'OFFER');
  assert.throws(() => service.setCandidateStatus(candidate.id, 'HIRED'), /إجراء التعيين/);
  const hired = service.hireCandidate(candidate.id, {
    phone: '01011112222',
    location: 'فرع بنها',
    joinedDate: '2026-11-04',
    baseSalary: 9000,
    salaryType: 'MONTHLY',
    createDraftContract: true,
  });
  assert.equal(hired.status, 'HIRED');
  assert.ok(hired.employeeId);
  assert.ok(hired.hiredAt);
  const employee = EmployeeService.getById(hired.employeeId!);
  assert.ok(employee);
  assert.equal(employee.name, candidate.fullName);
  assert.equal(employee.role, job.title);
  assert.equal(employee.baseSalary, 9000);
  assert.equal(employee.branchId, job.branchId);
  assert.equal(EmployeeService.getAll().some((row) => row.id === employee.id), true);
  const contracts = new ContractService().getContracts({ employeeId: employee.id });
  assert.equal(contracts.length, 1);
  assert.equal(contracts[0].status, 'DRAFT');
  assert.equal(service.getCandidates({ jobId: job.id })[0].employeeContractId, contracts[0].id);
  assert.equal(
    db.query<{ companyId: string }>('SELECT company_id AS companyId FROM employees WHERE id = ?', [employee.id])[0].companyId,
    db.query<{ companyId: string }>('SELECT company_id AS companyId FROM branches WHERE id = ?', [job.branchId])[0].companyId
  );
  assert.equal(service.getJobs()[0].status, 'CLOSED');
  assert.deepEqual(service.getSummary(), {
    openJobs: 0,
    candidates: 1,
    interviews: 0,
    offers: 0,
    hires: 1,
  });
  assert.throws(
    () => service.createCandidate({ jobId: job.id, fullName: 'مرشح جديد', phone: '01000000000' }),
    /وظيفة غير مفتوحة/
  );
  assert.throws(() => service.setJobStatus(job.id, 'OPEN'), /اكتمال عدد التعيينات/);
});

test('employee creation validates contact and payroll data and stores the active branch', async () => {
  const db = await boot();
  const branchId = new BranchAccessService().getCurrentBranchId();
  const branch = db.query<{ name: string; companyId: string }>(
    'SELECT name, company_id AS companyId FROM branches WHERE id = ?',
    [branchId]
  )[0];
  const employeeInput = {
    branchId,
    employmentType: 'PART_TIME' as const,
    name: '  موظف تجريبي  ',
    location: branch.name,
    role: '  محاسب  ',
    phone: '٠١٠٢٢٢٢٣٣٣٣',
    email: 'employee@example.com',
    baseSalary: 3500,
    salaryType: 'MONTHLY' as const,
    status: 'ACTIVE' as const,
    joinedDate: '2026-11-04',
    notes: '  ملاحظة اختبار  ',
  };

  assert.throws(() => EmployeeService.create({ ...employeeInput, phone: 'invalid' }), /رقم الهاتف غير صالح/);
  assert.throws(() => EmployeeService.create({ ...employeeInput, email: 'invalid' }), /البريد الإلكتروني غير صالح/);
  assert.throws(() => EmployeeService.create({ ...employeeInput, baseSalary: -1 }), /الراتب الأساسي/);
  assert.throws(() => EmployeeService.create({ ...employeeInput, joinedDate: '2026-02-30' }), /تاريخ الالتحاق/);

  const employee = EmployeeService.create(employeeInput);
  assert.equal(employee.name, 'موظف تجريبي');
  assert.equal(employee.role, 'محاسب');
  assert.equal(employee.phone, '01022223333');
  assert.equal(employee.branchId, branchId);
  assert.equal(employee.employmentType, 'PART_TIME');
  assert.equal(employee.notes, 'ملاحظة اختبار');
  assert.equal(
    db.query<{ companyId: string }>('SELECT company_id AS companyId FROM employees WHERE id = ?', [employee.id])[0].companyId,
    branch.companyId
  );
});

test('recruitment data is restricted to the active branch and module permission', async () => {
  const db = await boot();
  const service = new RecruitmentService();
  const mainJob = service.createJob({
    title: 'موظف مبيعات',
    department: 'المبيعات',
    employmentType: 'FULL_TIME',
    openings: 1,
  });
  assert.equal(mainJob.branchId, 'br_main');
  const secondBranch = new BranchService().createBranch({
    name: 'Recruitment Second Branch',
    code: 'REC-BR-1',
    companyId: 'cmp_main',
  });
  const access = new BranchAccessService();
  access.setCurrentBranchId(secondBranch.id, admin);
  const otherJob = service.createJob({
    title: 'مسؤول مخزن',
    department: 'المخازن',
    employmentType: 'CONTRACT',
    openings: 1,
  });
  const otherCandidate = service.createCandidate({
    jobId: otherJob.id,
    fullName: 'سارة حسن',
    phone: '01000000001',
  });
  access.setCurrentBranchId('br_main', admin);
  const pendingHire = service.createCandidate({
    jobId: mainJob.id,
    fullName: 'مرشح قابل للتعيين',
    phone: '01000000002',
  });
  service.setCandidateStatus(pendingHire.id, 'SCREENING');
  service.setCandidateStatus(pendingHire.id, 'INTERVIEW');
  service.setCandidateStatus(pendingHire.id, 'OFFER');

  access.setCurrentBranchId('br_main', admin);
  assert.equal(access.getCurrentBranchId(admin), 'br_main');
  assert.equal(otherJob.branchId, secondBranch.id);
  assert.notEqual(secondBranch.id, 'br_main');
  const visibleJobs = service.getJobs();
  assert.ok(visibleJobs.some((job) => job.id === mainJob.id));
  assert.ok(!visibleJobs.some((job) => job.id === otherJob.id));
  assert.ok(visibleJobs.every((job) => job.branchId === 'br_main'));
  assert.throws(() => service.setCandidateStatus(otherCandidate.id, 'INTERVIEW'), /نطاق صلاحيتك/);

  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_recruitment_limited', 'recruitment-limited', 'test', 'Limited', 'CASHIER', 1, 'ASSIGNED')`
  );
  db.run(`INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES ('usr_recruitment_limited', 'br_main')`);
  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES
     ('usr_recruitment_limited', 'hr.recruitment.view', 'GRANT'),
     ('usr_recruitment_limited', 'hr.recruitment.manage', 'GRANT'),
     ('usr_recruitment_limited', 'employees.manage', 'GRANT'),
     ('usr_recruitment_limited', 'hr.contracts.manage', 'DENY')`
  );
  const limited: User = {
    id: 'usr_recruitment_limited',
    username: 'recruitment-limited',
    fullName: 'Limited',
    role: 'CASHIER',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  AuthService.setCurrentUser(limited);
  PermissionService.invalidate(limited);
  assert.ok(service.getJobs().some((job) => job.id === mainJob.id));
  assert.throws(() => service.hireCandidate(pendingHire.id, {
    phone: '01000000002',
    location: '',
    joinedDate: '2026-11-04',
    baseSalary: 7000,
    salaryType: 'MONTHLY',
    createDraftContract: true,
  }), /صلاحية/);
  assert.equal(db.query('SELECT id FROM employees WHERE phone = ?', ['01000000002']).length, 0);
  assert.equal(service.getCandidates({ jobId: mainJob.id })[0].status, 'OFFER');

  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  ModuleRegistryService.deactivate('hr', admin);
  assert.throws(() => service.createJob({
    title: 'وظيفة بعد الإيقاف',
    department: 'المبيعات',
    employmentType: 'FULL_TIME',
    openings: 1,
  }), /غير مفعّلة/);
  ModuleRegistryService.activate('hr', admin);
});
