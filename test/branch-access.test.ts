import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { BranchAccessService } from '../src/services/BranchAccessService.ts';
import { BranchService } from '../src/services/BranchService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { ApprovalService } from '../src/services/ApprovalService.ts';
import { PurchaseRequestService } from '../src/services/PurchaseRequestService.ts';
import { CashierService } from '../src/services/CashierService.ts';
import { DailyOperationsService } from '../src/services/DailyOperationsService.ts';
import type { User } from '../src/types/identity.ts';

test('branch access enforces assigned and explicit central scopes in service queries', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();

  db.run(
    `INSERT INTO branches (id, code, name, is_main, is_active)
     VALUES ('br_scope_a', 'SCOPE-A', 'Scope A', 0, 1),
            ('br_scope_b', 'SCOPE-B', 'Scope B', 0, 1)`
  );
  db.run(
    `INSERT INTO warehouses (id, name, code, branch_id, is_active)
     VALUES ('wh_scope_a', 'Scope Warehouse A', 'SCOPE-WA', 'br_scope_a', 1),
            ('wh_scope_b', 'Scope Warehouse B', 'SCOPE-WB', 'br_scope_b', 1)`
  );
  db.run(
    `INSERT INTO cash_registers (id, name, current_balance, is_default, is_active, branch_id)
     VALUES ('cr_scope_a', 'Scope Register A', 0, 1, 1, 'br_scope_a'),
            ('cr_scope_b', 'Scope Register B', 0, 1, 1, 'br_scope_b')`
  );
  db.run(
    `INSERT INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_scope', 'scope-user', 'test', 'Scope User', 'SALES', 1, 'ASSIGNED')`
  );
  db.run(
    `INSERT INTO users_branches (user_id, branch_id) VALUES ('usr_scope', 'br_scope_a')`
  );

  const user: User = {
    id: 'usr_scope',
    username: 'scope-user',
    fullName: 'Scope User',
    role: 'SALES',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  const access = new BranchAccessService();
  AuthService.setCurrentUser(user);
  db.run(
    `INSERT INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_scope', 'branches.view', 'GRANT'),
            ('usr_scope', 'branches.manage_users', 'GRANT'),
            ('usr_scope', 'approvals.view', 'GRANT'),
            ('usr_scope', 'approvals.create', 'GRANT'),
            ('usr_scope', 'approvals.approve', 'GRANT'),
            ('usr_scope', 'purchases.view', 'GRANT'),
            ('usr_scope', 'purchases.approve', 'GRANT'),
            ('usr_scope', 'cashier.view', 'GRANT'),
            ('usr_scope', 'cashier.expense', 'GRANT')`
  );
  PermissionService.invalidate(user);
  assert.deepEqual(access.getAccessibleBranchIds(), ['br_scope_a']);
  access.requireBranchAccess('br_scope_a');
  assert.throws(() => access.requireBranchAccess('br_scope_b'), /ليس لديك صلاحية الوصول/);
  assert.equal(access.requireWarehouseAccess('wh_scope_a'), 'br_scope_a');
  assert.throws(() => access.requireWarehouseAccess('wh_scope_b'), /ليس لديك صلاحية الوصول/);
  assert.equal(access.requireRegisterAccess('cr_scope_a'), 'br_scope_a');
  assert.throws(() => access.requireRegisterAccess('cr_scope_b'), /ليس لديك صلاحية الوصول/);
  assert.throws(() => access.requireRegisterAccess('cr_scope_a', user, 'br_scope_b'), /خزينة تابعة لفرع المعاملة/);
  assert.deepEqual(new CashierService().getAllRegisters().map(register => register.id), ['cr_scope_a']);
  db.run(
    `INSERT INTO expenses (id, category, amount, register_id, branch_id, payment_type, date, description, performed_by)
     VALUES ('exp_scope_a', 'Test', 10, 'cr_scope_a', 'br_scope_a', 'CASH', '2026-01-01', 'A expense', 'usr_scope'),
            ('exp_scope_b', 'Test', 20, 'cr_scope_b', 'br_scope_b', 'CASH', '2026-01-01', 'B expense', 'usr_scope')`
  );
  assert.deepEqual(new CashierService().getAllExpenses().map(expense => expense.id), ['exp_scope_a']);
  assert.deepEqual(new DailyOperationsService().getExpenses('2026-01-01').rows.map(expense => expense.id), ['exp_scope_a']);
  const createdExpense = new CashierService().addExpense('Test', 5, 'Scoped expense', 'cr_scope_a');
  assert.equal(createdExpense.branchId, 'br_scope_a');
  assert.throws(
    () => new CashierService().addExpense('Test', 5, 'Out-of-scope expense', 'cr_scope_b'),
    /ليس لديك صلاحية الوصول/
  );

  assert.deepEqual(new BranchService().getAllBranches().map(branch => branch.id), ['br_scope_a']);
  assert.throws(
    () => new BranchService().updateUserBranchAccess('usr_scope', 'ASSIGNED', ['br_scope_b']),
    /خارج نطاق وصولك/
  );
  db.run(
    `INSERT INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_scope_target', 'scope-target', 'test', 'Scope Target', 'SALES', 1, 'ASSIGNED')`
  );
  db.run(
    `INSERT INTO users_branches (user_id, branch_id)
     VALUES ('usr_scope_target', 'br_scope_a'), ('usr_scope_target', 'br_scope_b')`
  );
  assert.throws(
    () => new BranchService().updateUserBranchAccess('usr_scope_target', 'ASSIGNED', ['br_scope_a']),
    /مراجعة جميع الفروع/
  );

  const approvals = new ApprovalService();
  const request = approvals.createRequest({ requestType: 'OTHER', title: 'Scoped approval' });
  assert.equal(
    db.query<{ branchId: string }>('SELECT branch_id AS branchId FROM approval_requests WHERE id = ?', [request.id])[0]?.branchId,
    'br_scope_a'
  );
  db.run(
    `INSERT INTO approval_requests (id, request_number, request_type, branch_id, title, requested_by)
     VALUES ('apr_scope_b', 'APR-SCOPE-B', 'OTHER', 'br_scope_b', 'Other branch request', 'usr_scope')`
  );
  assert.deepEqual(approvals.getRequests().map(row => row.id), [request.id]);
  assert.throws(() => approvals.decide('apr_scope_b', true), /غير موجود/);
  assert.throws(() => approvals.decide(request.id, false), /غير مصرح/);
  approvals.decide(request.id, true);

  db.run(
    `INSERT INTO purchase_requests (id, request_number, date, branch_id, requested_by)
     VALUES ('pr_scope_a', 'PR-SCOPE-A', '2026-01-01', 'br_scope_a', 'usr_scope'),
            ('pr_scope_b', 'PR-SCOPE-B', '2026-01-01', 'br_scope_b', 'usr_scope')`
  );
  const purchaseRequests = new PurchaseRequestService();
  assert.deepEqual(purchaseRequests.getRequests().map(row => row.id), ['pr_scope_a']);
  assert.throws(() => purchaseRequests.getItems('pr_scope_b'), /خارج نطاق الفروع/);
  assert.throws(() => purchaseRequests.decide('pr_scope_a', 'REJECTED'), /غير مصرح/);
  purchaseRequests.decide('pr_scope_a', 'APPROVED');

  db.run("UPDATE users SET branch_scope = 'ALL' WHERE id = 'usr_scope'");
  db.run(
    `INSERT INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_scope', 'branches.access_all', 'GRANT')`
  );
  PermissionService.invalidate(user);
  assert.equal(access.getAccessibleBranchIds(), null);
  access.requireBranchAccess('br_scope_b');
  assert.equal(access.requireWarehouseAccess('wh_scope_b'), 'br_scope_b');

  db.run(
    `UPDATE user_permissions SET effect = 'DENY'
     WHERE user_id = 'usr_scope' AND permission_code = 'branches.access_all'`
  );
  PermissionService.invalidate(user);
  assert.throws(() => access.getAccessibleBranchIds(), /غير مصرح/);
  AuthService.logout();
});

test('migration assigns existing local users a safe branch and keeps admins central', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  assert.ok(db.query<{ id: string }>(
    "SELECT id FROM schema_migrations WHERE id = '060_branch_scoped_cash_transactions'"
  ).length);
  for (const [table, column] of [
    ['cash_shifts', 'branch_id'],
    ['expenses', 'branch_id'],
    ['customer_payments', 'branch_id'],
    ['supplier_payments', 'branch_id'],
    ['installment_plans', 'branch_id'],
  ]) {
    assert.ok(db.query<{ name: string }>(`PRAGMA table_info(${table})`).some(row => row.name === column));
  }
  const adminScope = db.query<{ branchScope: string }>(
    "SELECT branch_scope AS branchScope FROM users WHERE role = 'ADMIN' LIMIT 1"
  )[0]?.branchScope;
  assert.equal(adminScope, 'ALL');

  const unassigned = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM users u
     WHERE u.role <> 'ADMIN'
       AND NOT EXISTS (SELECT 1 FROM users_branches ub WHERE ub.user_id = u.id)`
  )[0]?.count || 0;
  assert.equal(unassigned, 0);

  AuthService.setCurrentUser({
    id: 'usr_admin',
    username: 'admin',
    fullName: 'Administrator',
    role: 'ADMIN',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  });
  const branch = new BranchService().createBranch({
    name: 'Branch With Cash Register',
    code: 'BR-CASH-TEST',
    isDefault: false,
  });
  const branchRegister = db.query<{ branchId: string }>(
    'SELECT branch_id AS branchId FROM cash_registers WHERE branch_id = ?',
    [branch.id]
  )[0];
  assert.equal(branchRegister.branchId, branch.id);
  const created = new AuthService().createUser({
    username: 'branch-scope-new-user',
    password: 'TestPass123',
    fullName: 'Branch Scope User',
    role: 'CASHIER',
  });
  const createdScope = db.query<{ branchScope: string; branchId: string }>(
    `SELECT u.branch_scope AS branchScope, ub.branch_id AS branchId
     FROM users u JOIN users_branches ub ON ub.user_id = u.id WHERE u.id = ?`,
    [created.id]
  )[0];
  assert.equal(createdScope.branchScope, 'ASSIGNED');
  assert.ok(createdScope.branchId);
  AuthService.logout();
});
