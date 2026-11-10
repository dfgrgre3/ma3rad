import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { BranchService } from '../src/services/domains/organization/BranchService.ts';
import { BranchAccessService } from '../src/services/domains/auth/BranchAccessService.ts';
import { ProjectService } from '../src/services/domains/projects/ProjectService.ts';
import { ApartmentEstimateService } from '../src/services/domains/projects/ApartmentEstimateService.ts';
import { QuotationService } from '../src/services/domains/sales/QuotationService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';
import { ModuleRegistryService } from '../src/services/domains/config/ModuleRegistryService.ts';
import type { User } from '../src/types/auth/identity.ts';

const admin: User = {
  id: 'usr_projects_admin',
  username: 'projects-admin',
  fullName: 'Projects Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const limited: User = {
  id: 'usr_projects_limited',
  username: 'projects-limited',
  fullName: 'Projects Limited',
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
     VALUES ('usr_projects_admin', 'projects-admin', 'test', 'Projects Admin', 'ADMIN', 1),
            ('usr_projects_limited', 'projects-limited', 'test', 'Projects Limited', 'SALES', 1)`
  );
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_projects_limited', 'projects-limited', 'test', 'Projects Limited', 'SALES', 1, 'ASSIGNED')`
  );
  db.run(`INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES ('usr_projects_limited', 'br_main')`);
  db.run("DELETE FROM user_permissions WHERE user_id = 'usr_projects_limited'");
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

let customerSequence = 0;

function createCustomer(name: string): string {
  const id = `cus_prj_${++customerSequence}`;
  DatabaseManager.getInstance().run(
    `INSERT INTO customers (id, code, name, phone) VALUES (?, ?, ?, ?)`,
    [id, `PRJ-CUS-${customerSequence}`, name, `0100000${customerSequence}`]
  );
  return id;
}

test('projects are created in the actor branch with an audited code', async () => {
  await boot();
  const service = new ProjectService();
  const customerId = createCustomer('Project Customer');

  const project = service.createProject({
    name: 'Main tower',
    customerId,
    contractValue: 250000,
    status: 'PLANNED',
  });

  assert.match(project.code, /^PRJ-/);
  assert.equal(project.branchId, 'br_main');
  assert.equal(project.name, 'Main tower');
  assert.equal(Number(project.contractValue), 250000);
  assert.equal(service.getProjects().length, 1);
  assert.equal(service.getProjects('tower')[0].id, project.id);

  const updated = service.updateProject(project.id, { status: 'ACTIVE', notes: 'started' });
  assert.equal(updated.status, 'ACTIVE');
  assert.equal(updated.notes, 'started');
});

test('project reads and writes require explicit projects permissions', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ProjectService();
  const customerId = createCustomer('Permission Customer');
  const project = service.createProject({ name: 'Secure project', customerId });

  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_projects_limited', 'projects.view', 'DENY')`
  );
  asLimited();
  assert.throws(() => service.getProjects(), /صلاحية/);
  assert.throws(() => service.getProjectById(project.id), /صلاحية/);
  assert.throws(() => service.getUnits(project.id), /صلاحية/);
  asAdmin();

  // Without projects.create or projects.update the same actor cannot mutate.
  db.run("DELETE FROM user_permissions WHERE user_id = 'usr_projects_limited'");
  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_projects_limited', 'projects.view', 'GRANT')`
  );
  db.run("UPDATE users SET role = 'CASHIER' WHERE id = 'usr_projects_limited'");
  const cashier = { ...limited, role: 'CASHIER' };
  AuthService.setCurrentUser(cashier);
  PermissionService.invalidate(cashier);
  assert.throws(() => service.createProject({ name: 'Nope', customerId }), /صلاحية/);
  assert.throws(() => service.updateProject(project.id, { name: 'Nope' }), /صلاحية/);
});

test('apartment designs persist under a project and link to project quotations', async () => {
  await boot();
  const projectService = new ProjectService();
  const customerId = createCustomer('Apartment Design Customer');
  const project = projectService.createProject({ name: 'Apartment building', customerId });
  const estimates = new ApartmentEstimateService();
  const rooms = [{
    id: 'room-living', name: 'الريسبشن', length: 5, width: 4, height: 3,
    doorCount: 1, doorWidth: 0.9, doorHeight: 2.1,
    windowCount: 2, windowWidth: 1.2, windowHeight: 1.2,
  }];
  const costLines = [{
    id: 'line-floor', category: 'الأرضيات', name: 'تركيب أرضيات', measure: 'floor' as const,
    unit: 'م²', manualQuantity: 1, materialProductId: '', materialRate: 250, laborRate: 50,
    wastePercent: 5, discountPercent: 0, profitPercent: 10,
  }];
  const saved = estimates.save({
    projectId: project.id, name: 'الشقة ١', areaM2: 20, totalAmount: 5800, rooms, costLines,
  });
  assert.equal(estimates.getByProject(project.id)[0].id, saved.id);
  assert.deepEqual(estimates.getByProject(project.id)[0].rooms, rooms);

  const updated = estimates.save({
    id: saved.id, projectId: project.id, name: 'الشقة ١ - محدثة',
    areaM2: 22, totalAmount: 6000, rooms, costLines,
  });
  assert.equal(updated.name, 'الشقة ١ - محدثة');
  assert.equal(updated.areaM2, 22);

  const quotation = new QuotationService().createQuotation({
    customerId,
    projectId: project.id,
    serviceItems: [{ description: 'مقايسة تشطيب الشقة', quantity: 1, unitPrice: 6000 }],
  });
  estimates.linkQuotation(saved.id, project.id, quotation.id);
  assert.equal(estimates.getByProject(project.id)[0].quotationId, quotation.id);
  estimates.save({
    id: saved.id, projectId: project.id, name: 'الشقة ١ - تعديل جديد',
    areaM2: 22, totalAmount: 6100, rooms, costLines,
  });
  assert.equal(estimates.getByProject(project.id)[0].quotationId, null);
});

test('project branch scope prevents cross-branch reads and writes', async () => {
  await boot();
  const service = new ProjectService();
  const customerId = createCustomer('Branch Customer');
  const betaBranch = new BranchService().createBranch({
    name: 'Projects Beta Branch',
    code: 'PRJ-BETA-1',
    companyId: 'cmp_main',
  });

  const mainProject = service.createProject({ name: 'Main project', customerId });
  const access = new BranchAccessService();
  access.setCurrentBranchId(betaBranch.id, admin);
  const betaProject = service.createProject({
    name: 'Beta project',
    customerId,
    branchId: betaBranch.id,
  });
  new ApartmentEstimateService().save({
    projectId: betaProject.id,
    name: 'Restricted apartment design',
    areaM2: 10,
    totalAmount: 1000,
    rooms: [],
    costLines: [],
  });
  access.setCurrentBranchId('br_main', admin);

  asLimited();
  const visible = service.getProjects();
  assert.ok(visible.some((project) => project.id === mainProject.id));
  assert.ok(!visible.some((project) => project.id === betaProject.id));
  assert.equal(service.getProjectById(betaProject.id), null);
  assert.throws(
    () => new ApartmentEstimateService().getByProject(betaProject.id),
    /غير موجود أو ليس لديك صلاحية/
  );
  assert.throws(
    () => service.createProject({ name: 'Cross branch', customerId, branchId: betaBranch.id }),
    /صلاحية/
  );
  assert.throws(() => service.updateProject(betaProject.id, { name: 'Leak' }), /غير موجود|صلاحية/);
});

test('deactivating the projects module blocks writes but preserves history', async () => {
  await boot();
  const service = new ProjectService();
  const customerId = createCustomer('Module Customer');
  const project = service.createProject({ name: 'Historic project', customerId });

  ModuleRegistryService.deactivate('projects', admin);
  assert.equal(ModuleRegistryService.isModuleEnabled('projects'), false);

  assert.ok(
    service.getProjects().some((row) => row.id === project.id),
    'history stays readable'
  );
  assert.throws(() => service.createProject({ name: 'Blocked', customerId }), /غير مفعّلة/);
  assert.throws(() => service.updateProject(project.id, { name: 'Blocked' }), /غير مفعّلة/);
  assert.throws(() => service.createUnit({ projectId: project.id, unitType: 'BUILDING', name: 'Blocked' }), /غير مفعّلة/);

  ModuleRegistryService.activate('projects', admin);
  asAdmin();
  assert.equal(ModuleRegistryService.isModuleEnabled('projects'), true);
  assert.equal(service.updateProject(project.id, { notes: 'restored' }).notes, 'restored');
});

test('deactivating the hr module blocks employee writes but preserves reads', async () => {
  await boot();
  ModuleRegistryService.deactivate('hr', admin);
  assert.equal(ModuleRegistryService.isModuleEnabled('hr'), false);

  assert.deepEqual(EmployeeService.getAll(), [], 'history remains readable');
  assert.throws(
    () => EmployeeService.create({
      name: 'Blocked Employee',
      phone: '01000000000',
      location: 'Main',
      role: 'Sales',
      email: '',
      baseSalary: 1000,
      salaryType: 'MONTHLY',
      status: 'ACTIVE',
      joinedDate: '2026-01-01',
    }),
    /غير مفعّلة/
  );

  ModuleRegistryService.activate('hr', admin);
  asAdmin();
  assert.equal(ModuleRegistryService.isModuleEnabled('hr'), true);
});

test('project deletion is refused when sales invoices reference it', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  if (!ModuleRegistryService.isModuleEnabled('projects')) {
    ModuleRegistryService.activate('projects', admin);
  }
  const service = new ProjectService();
  const customerId = createCustomer('Invoice Customer');
  const project = service.createProject({ name: 'Invoiced project', customerId });

  db.run(
    `INSERT INTO sales_invoices (id, invoice_number, date, customer_id, warehouse_id, branch_id, project_id,
       subtotal, total_amount, invoice_status, created_by)
     VALUES ('inv_prj_guard', 'INV-PRJ-1', '2026-01-01', ?, 'wh_main', 'br_main', ?, 100, 100, 'PAID', ?)`,
    [customerId, project.id, admin.id]
  );

  assert.throws(() => service.deleteProject(project.id), /فواتير بيع/);
  db.run("UPDATE sales_invoices SET invoice_status = 'VOID' WHERE id = 'inv_prj_guard'");
  service.deleteProject(project.id);
  assert.equal(service.getProjectById(project.id), null);
});
