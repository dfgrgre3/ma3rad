import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { BranchService } from '../src/services/BranchService.ts';
import { ProjectService } from '../src/services/ProjectService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_controls_admin',
  username: 'controls-admin',
  fullName: 'Controls Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const limited: User = {
  id: 'usr_controls_limited',
  username: 'controls-limited',
  fullName: 'Controls Limited',
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
     VALUES ('usr_controls_admin', 'controls-admin', 'test', 'Controls Admin', 'ADMIN', 1)`
  );
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_controls_limited', 'controls-limited', 'test', 'Controls Limited', 'SALES', 1, 'ASSIGNED')`
  );
  db.run(`INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES ('usr_controls_limited', 'br_main')`);
  db.run("DELETE FROM user_permissions WHERE user_id = 'usr_controls_limited'");
  asAdmin();
  PermissionService.invalidate(limited);
  if (!ModuleRegistryService.isModuleEnabled('projects')) {
    ModuleRegistryService.activate('projects', admin);
    asAdmin();
  }
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

let sequence = 0;

function createCustomer(): string {
  const id = `cus_ctrl_${++sequence}`;
  DatabaseManager.getInstance().run(
    `INSERT INTO customers (id, code, name, phone) VALUES (?, ?, ?, ?)`,
    [id, `CTRL-CUS-${sequence}`, `Controls Customer ${sequence}`, `0120000${sequence}`]
  );
  return id;
}

function createProject(service: ProjectService, name: string, branchId?: string): string {
  return service.createProject({ name, customerId: createCustomer(), branchId }).id;
}

test('project tasks support dependencies and reject duplicates, self links and cycles', async () => {
  await boot();
  const service = new ProjectService();
  const projectId = createProject(service, 'Task project');

  const first = service.createTask({ projectId, title: 'Design', priority: 'HIGH' });
  const second = service.createTask({ projectId, title: 'Build', startDate: '2026-02-01', dueDate: '2026-03-01' });
  assert.equal(first.status, 'TODO');
  assert.equal(first.progress, 0);

  const dependency = service.addTaskDependency({ projectId, taskId: second.id, dependsOnTaskId: first.id });
  assert.equal(dependency.taskId, second.id);
  assert.deepEqual(service.getTasks(projectId).find((task) => task.id === second.id)?.dependencyIds, [first.id]);

  assert.throws(
    () => service.addTaskDependency({ projectId, taskId: second.id, dependsOnTaskId: first.id }),
    /مسجلة بالفعل/
  );
  assert.throws(
    () => service.addTaskDependency({ projectId, taskId: first.id, dependsOnTaskId: first.id }),
    /نفسها/
  );
  assert.throws(
    () => service.addTaskDependency({ projectId, taskId: first.id, dependsOnTaskId: second.id }),
    /حلقة دائرية/
  );
  assert.throws(
    () => service.addTaskDependency({ projectId, taskId: second.id, dependsOnTaskId: 'task_missing' }),
    /غير موجودة/
  );

  const done = service.updateTask(first.id, { status: 'DONE' });
  assert.equal(done.progress, 100);
  assert.ok(done.completedAt);
  assert.equal(service.updateTask(first.id, { status: 'IN_PROGRESS' }).completedAt, null);

  service.removeTaskDependencyByPair(projectId, second.id, first.id);
  assert.deepEqual(service.getTasks(projectId).find((task) => task.id === second.id)?.dependencyIds, []);

  service.addTaskDependency({ projectId, taskId: second.id, dependsOnTaskId: first.id });
  service.deleteTask(first.id);
  const remaining = service.getTasks(projectId);
  assert.equal(remaining.length, 1);
  assert.deepEqual(remaining[0].dependencyIds, []);
});

test('budget lines aggregate planned and actual totals with variance', async () => {
  await boot();
  const service = new ProjectService();
  const projectId = createProject(service, 'Budget project');

  service.addBudgetLine({ projectId, category: 'Materials', plannedAmount: 1000, actualAmount: 400 });
  const labor = service.addBudgetLine({ projectId, category: 'Labor', plannedAmount: 600 });
  service.addBudgetLine({ projectId, category: 'Materials', plannedAmount: 500, actualAmount: 50 });

  const summary = service.getBudgetSummary(projectId);
  assert.equal(summary.plannedTotal, 2100);
  assert.equal(summary.actualTotal, 450);
  assert.equal(summary.variance, 1650);
  const materials = summary.byCategory.find((row) => row.category === 'Materials');
  assert.equal(materials?.plannedAmount, 1500);
  assert.equal(materials?.actualAmount, 450);

  service.updateBudgetLine(labor.id, { actualAmount: 250 });
  assert.equal(service.getBudgetSummary(projectId).actualTotal, 700);

  assert.throws(
    () => service.addBudgetLine({ projectId, category: 'Negative', plannedAmount: -5 }),
    /غير سالب/
  );

  service.deleteBudgetLine(labor.id);
  assert.equal(service.getBudgetLines(projectId).length, 2);
});

test('time entries validate hours and summarize billable work by task', async () => {
  await boot();
  const service = new ProjectService();
  const projectId = createProject(service, 'Time project');
  const task = service.createTask({ projectId, title: 'Installation' });

  service.addTimeEntry({ projectId, taskId: task.id, entryDate: '2026-02-10', hours: 6, billable: true });
  service.addTimeEntry({ projectId, taskId: task.id, entryDate: '2026-02-11', hours: 2, billable: false });
  service.addTimeEntry({ projectId, entryDate: '2026-02-12', hours: 1.5 });

  const summary = service.getTimeSummary(projectId);
  assert.equal(summary.totalHours, 9.5);
  assert.equal(summary.billableHours, 7.5);
  assert.equal(summary.nonBillableHours, 2);
  assert.equal(summary.byTask.find((row) => row.taskId === task.id)?.hours, 8);

  assert.throws(
    () => service.addTimeEntry({ projectId, entryDate: '2026-02-10', hours: 0 }),
    /أكبر من صفر/
  );
  assert.throws(
    () => service.addTimeEntry({ projectId, entryDate: '10-02-2026', hours: 2 }),
    /غير صالح/
  );

  service.deleteTimeEntry(service.getTimeEntries(projectId)[0].id);
  assert.equal(service.getTimeEntries(projectId).length, 2);
});

test('change requests require approval permission and follow a decided lifecycle', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ProjectService();
  const projectId = createProject(service, 'Change project');

  const request = service.createChangeRequest({
    projectId,
    title: 'Extra floor',
    costImpact: 25000,
    timeImpactDays: 14,
  });
  assert.equal(request.status, 'PENDING');

  asLimited();
  const visible = service.getChangeRequests(projectId);
  assert.ok(visible.some((row) => row.id === request.id));
  assert.throws(() => service.decideChangeRequest(request.id, 'APPROVED'), /صلاحية/);
  assert.throws(
    () => service.createChangeRequest({ projectId, title: 'No write permission' }),
    /صلاحية/
  );
  asAdmin();

  const approved = service.decideChangeRequest(request.id, 'APPROVED', 'Approved by owner');
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.decisionNote, 'Approved by owner');
  assert.throws(() => service.decideChangeRequest(request.id, 'REJECTED'), /قيد الانتظار/);
  assert.throws(() => service.cancelChangeRequest(request.id), /تم البت/);

  const pending = service.createChangeRequest({ projectId, title: 'Cancelled request' });
  const cancelled = service.cancelChangeRequest(pending.id, 'No longer needed');
  assert.equal(cancelled.status, 'CANCELLED');

  // Configurable grants are honoured: granting projects.approve to the limited role is enough.
  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_controls_limited', 'projects.approve', 'GRANT'),
            ('usr_controls_limited', 'projects.update', 'GRANT')`
  );
  PermissionService.invalidate(limited);
  asLimited();
  const second = service.createChangeRequest({ projectId, title: 'Second request' });
  assert.equal(service.decideChangeRequest(second.id, 'REJECTED').status, 'REJECTED');
  asAdmin();
});

test('risks and deliverables track severity and delivery dates', async () => {
  await boot();
  const service = new ProjectService();
  const projectId = createProject(service, 'Risk project');

  const risk = service.createRisk({
    projectId,
    title: 'Material delay',
    severity: 'HIGH',
    probability: 'HIGH',
    mitigation: 'Order early',
  });
  assert.equal(risk.status, 'OPEN');
  assert.equal(service.updateRisk(risk.id, { status: 'MITIGATED' }).status, 'MITIGATED');

  const deliverable = service.createDeliverable({
    projectId,
    title: 'Handover pack',
    dueDate: '2026-04-01',
  });
  assert.equal(deliverable.status, 'PENDING');
  const delivered = service.updateDeliverable(deliverable.id, { status: 'DELIVERED' });
  assert.ok(delivered.deliveredAt);
  assert.equal(delivered.acceptedAt, null);
  const accepted = service.updateDeliverable(deliverable.id, { status: 'ACCEPTED' });
  assert.ok(accepted.acceptedAt);
  assert.equal(service.updateDeliverable(deliverable.id, { status: 'IN_PROGRESS' }).deliveredAt, null);

  assert.throws(
    () => service.createDeliverable({ projectId, title: 'Bad date', dueDate: '2026-13-01' }),
    /غير صالح/
  );
});

test('project controls are isolated by branch and blocked when the module is disabled', async () => {
  await boot();
  const service = new ProjectService();
  const betaBranch = new BranchService().createBranch({
    name: 'Controls Beta Branch',
    code: 'CTRL-BETA-1',
    companyId: 'cmp_main',
  });
  const mainProject = createProject(service, 'Main controls project');
  const betaProject = createProject(service, 'Beta controls project', betaBranch.id);
  service.createTask({ projectId: mainProject, title: 'Main task' });
  service.createTask({ projectId: betaProject, title: 'Beta task' });
  service.addBudgetLine({ projectId: betaProject, category: 'Beta materials', plannedAmount: 100 });

  asLimited();
  assert.ok(service.getTasks(mainProject).every((task) => task.title === 'Main task'));
  assert.throws(() => service.getTasks(betaProject), /غير موجود|صلاحية/);
  assert.throws(() => service.getBudgetLines(betaProject), /غير موجود|صلاحية/);
  assert.throws(
    () => service.createTask({ projectId: betaProject, title: 'Cross branch' }),
    /غير موجود|صلاحية/
  );
  asAdmin();

  ModuleRegistryService.deactivate('projects', admin);
  assert.equal(ModuleRegistryService.isModuleEnabled('projects'), false);
  assert.ok(service.getTasks(mainProject).some((task) => task.title === 'Main task'), 'reads stay available');
  assert.throws(() => service.createTask({ projectId: mainProject, title: 'Blocked' }), /غير مفعّلة/);
  assert.throws(
    () => service.createChangeRequest({ projectId: mainProject, title: 'Blocked change' }),
    /غير مفعّلة/
  );

  ModuleRegistryService.activate('projects', admin);
  asAdmin();
  assert.equal(ModuleRegistryService.isModuleEnabled('projects'), true);
});
