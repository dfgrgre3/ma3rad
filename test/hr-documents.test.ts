import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { BranchService } from '../src/services/BranchService.ts';
import { EmployeeService } from '../src/services/EmployeeService.ts';
import { EmployeeDocumentService } from '../src/services/EmployeeDocumentService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_hrdocs_admin',
  username: 'hrdocs-admin',
  fullName: 'HR Docs Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const manager: User = {
  id: 'usr_hrdocs_manager',
  username: 'hrdocs-manager',
  fullName: 'HR Docs Manager',
  role: 'MANAGER',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const sales: User = {
  id: 'usr_hrdocs_sales',
  username: 'hrdocs-sales',
  fullName: 'HR Docs Sales',
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
     VALUES ('usr_hrdocs_admin', 'hrdocs-admin', 'test', 'HR Docs Admin', 'ADMIN', 1)`
  );
  for (const [id, username, fullName, role] of [
    ['usr_hrdocs_manager', 'hrdocs-manager', 'HR Docs Manager', 'MANAGER'],
    ['usr_hrdocs_sales', 'hrdocs-sales', 'HR Docs Sales', 'SALES'],
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
    name: `Doc Employee ${sequence}`,
    phone: `0140000${sequence}`,
    location: 'Main',
    role: 'Sales',
    email: '',
    baseSalary: 5000,
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

test('employee documents track expiry and archive without hard delete', async () => {
  await boot();
  const service = new EmployeeDocumentService();
  const employeeId = createEmployee();

  const document = service.createDocument({
    employeeId,
    documentType: 'CERTIFICATE',
    title: 'Safety certificate',
    expiresAt: isoOffset(10),
  });
  assert.equal(document.status, 'ACTIVE');
  assert.equal(document.effectiveStatus, 'EXPIRING');
  assert.equal(service.getDocuments({ expiringWithinDays: 30 }).some((row) => row.id === document.id), true);

  const expired = service.createDocument({
    employeeId,
    documentType: 'IDENTITY',
    title: 'Expired ID',
    expiresAt: isoOffset(-5),
  });
  assert.equal(service.getDocument(expired.id).effectiveStatus, 'EXPIRED');

  const archived = service.archiveDocument(document.id, 'Replaced');
  assert.equal(archived.status, 'ARCHIVED');
  assert.throws(() => service.updateDocument(document.id, { title: 'Changed' }), /مؤرشف/);

  const summary = service.getSummary(employeeId);
  assert.equal(summary.expired, 1);
  assert.equal(summary.archived, 1);
});

test('document permissions separate viewing from managing', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new EmployeeDocumentService();
  const employeeId = createEmployee();
  const document = service.createDocument({ employeeId, title: 'Viewable document' });

  asSales();
  assert.throws(() => service.getDocuments(), /صلاحية/);
  asAdmin();

  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_hrdocs_sales', 'hr.documents.view', 'GRANT')`
  );
  PermissionService.invalidate(sales);
  asSales();
  assert.ok(service.getDocuments().some((row) => row.id === document.id));
  assert.throws(() => service.createDocument({ employeeId, title: 'Blocked' }), /صلاحية/);
  assert.throws(() => service.archiveDocument(document.id), /صلاحية/);
  asAdmin();

  asManager();
  assert.ok(service.getDocuments().some((row) => row.id === document.id));
  assert.equal(service.archiveDocument(document.id).status, 'ARCHIVED');
});

test('employee documents are branch scoped', async () => {
  await boot();
  const service = new EmployeeDocumentService();
  const betaBranch = new BranchService().createBranch({
    name: 'Docs Beta Branch',
    code: 'DOC-BETA-1',
    companyId: 'cmp_main',
  });
  const mainEmployee = createEmployee();
  const betaEmployee = createEmployee(betaBranch.id);

  const mainDocument = service.createDocument({ employeeId: mainEmployee, title: 'Main document' });
  const betaDocument = service.createDocument({ employeeId: betaEmployee, title: 'Beta document' });

  asManager();
  const visible = service.getDocuments();
  assert.ok(visible.some((row) => row.id === mainDocument.id));
  assert.ok(!visible.some((row) => row.id === betaDocument.id));
  assert.throws(() => service.getDocument(betaDocument.id), /غير موجود/);
  assert.throws(() => service.createDocument({ employeeId: betaEmployee, title: 'Cross branch' }), /صلاحية/);
  asAdmin();
});

test('employee document writes are blocked when hr is disabled', async () => {
  await boot();
  const service = new EmployeeDocumentService();
  const employeeId = createEmployee();
  const document = service.createDocument({ employeeId, title: 'Historic document' });

  ModuleRegistryService.deactivate('hr', admin);
  assert.equal(ModuleRegistryService.isModuleEnabled('hr'), false);
  assert.ok(service.getDocuments().some((row) => row.id === document.id), 'reads stay available');
  assert.throws(() => service.createDocument({ employeeId, title: 'Blocked' }), /غير مفعّلة/);
  assert.throws(() => service.archiveDocument(document.id), /غير مفعّلة/);

  ModuleRegistryService.activate('hr', admin);
  asAdmin();
  assert.equal(ModuleRegistryService.isModuleEnabled('hr'), true);
});
