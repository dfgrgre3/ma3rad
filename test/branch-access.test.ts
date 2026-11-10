import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { BranchAccessService } from '../src/services/domains/auth/BranchAccessService.ts';
import { BranchService } from '../src/services/domains/organization/BranchService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { ApprovalService } from '../src/services/domains/approvals/ApprovalService.ts';
import { PurchaseRequestService } from '../src/services/domains/purchases/PurchaseRequestService.ts';
import { PurchaseReturnService } from '../src/services/domains/purchases/PurchaseReturnService.ts';
import { ProcurementService } from '../src/services/domains/procurement/ProcurementService.ts';
import { CashierService } from '../src/services/domains/finance/CashierService.ts';
import { DailyOperationsService } from '../src/services/domains/operations/DailyOperationsService.ts';
import { OperationsService } from '../src/services/domains/operations/OperationsService.ts';
import { InventoryService } from '../src/services/domains/inventory/InventoryService.ts';
import { InventoryCostingService } from '../src/services/domains/inventory/InventoryCostingService.ts';
import type { User } from '../src/types/auth/identity.ts';

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
    `UPDATE branches SET company_id = 'cmp_main' WHERE id IN ('br_scope_a', 'br_scope_b')`
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
            ('usr_scope', 'purchases.create', 'GRANT'),
            ('usr_scope', 'purchases.return', 'GRANT'),
            ('usr_scope', 'purchases.view', 'GRANT'),
            ('usr_scope', 'purchases.approve', 'GRANT'),
            ('usr_scope', 'cashier.view', 'GRANT'),
            ('usr_scope', 'cashier.expense', 'GRANT'),
            ('usr_scope', 'inventory.transfer', 'GRANT')`
  );
  PermissionService.invalidate(user);
  assert.deepEqual(access.getAccessibleBranchIds(), ['br_scope_a']);
  access.requireBranchAccess('br_scope_a');
  assert.throws(() => access.requireBranchAccess('br_scope_b'), /ليس لديك صلاحية الوصول/);
  assert.equal(access.requireWarehouseAccess('wh_scope_a'), 'br_scope_a');
  assert.throws(() => access.requireWarehouseAccess('wh_scope_b'), /ليس لديك صلاحية الوصول|الفرع النشط/);
  access.requireWarehouseAuthorization('wh_scope_a');
  assert.throws(() => access.requireWarehouseAuthorization('wh_scope_b'), /ليس لديك صلاحية الوصول/);
  db.run(
    `INSERT INTO stock_transfers
      (id, transfer_number, date, from_warehouse_id, to_warehouse_id, status, total_quantity_m2, created_by)
     VALUES ('trf_scope_a_to_b', 'TRF-SCOPE-A-B', '2026-01-01', 'wh_scope_a', 'wh_scope_b', 'REQUESTED', 0, 'usr_scope')`
  );
  const inventory = new InventoryService();
  assert.throws(() => inventory.getTransferItems('trf_scope_a_to_b'), /ليس لديك صلاحية الوصول/);
  assert.equal(inventory.getTransfersList().length, 0);
  assert.ok(inventory.getTransferSummaryByWarehouse().every((row) => row.warehouseId !== 'wh_scope_b'));
  assert.equal(access.requireRegisterAccess('cr_scope_a'), 'br_scope_a');
  assert.throws(() => access.requireRegisterAccess('cr_scope_b'), /ليس لديك صلاحية الوصول/);
  assert.throws(() => access.requireRegisterAccess('cr_scope_a', user, 'br_scope_b'), /خزينة تابعة لفرع المعاملة/);
  assert.deepEqual(new CashierService().getAllRegisters().map(register => register.id), ['cr_scope_a']);
  assert.deepEqual(new OperationsService().getBranches('', true).map(branch => branch.id), ['br_scope_a']);
  db.run(
    `INSERT INTO suppliers (id, code, name, phone) VALUES ('sup_scope', 'SUP-SCOPE', 'Scoped supplier', '01000000000')`
  );
  db.run(`
    INSERT INTO purchase_invoices (
      id, invoice_number, date, supplier_id, warehouse_id, branch_id, company_id,
      subtotal, total_amount, paid_amount, remaining_amount, payment_type, payment_status, created_by
    ) VALUES
      ('pi_scope_a', 'PI-SCOPE-A', '2026-01-01', 'sup_scope', 'wh_scope_a', 'br_scope_a', 'cmp_main', 10, 10, 0, 10, 'CREDIT', 'UNPAID', 'usr_scope'),
      ('pi_scope_b', 'PI-SCOPE-B', '2026-01-01', 'sup_scope', 'wh_scope_b', 'br_scope_b', 'cmp_main', 10, 10, 0, 10, 'CREDIT', 'UNPAID', 'usr_scope')
  `);
  db.run(`
    INSERT INTO purchase_returns (
      id, return_number, original_purchase_id, original_invoice_number, supplier_id, warehouse_id,
      date, total_amount, reason, created_by
    ) VALUES
      ('pret_scope_a', 'PRET-SCOPE-A', 'pi_scope_a', 'PI-SCOPE-A', 'sup_scope', 'wh_scope_a', '2026-01-02', 1, 'A', 'usr_scope'),
      ('pret_scope_b', 'PRET-SCOPE-B', 'pi_scope_b', 'PI-SCOPE-B', 'sup_scope', 'wh_scope_b', '2026-01-02', 1, 'B', 'usr_scope')
  `);
  db.run(`INSERT INTO products (
    id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit,
    pieces_per_box, meters_per_box, cost_price, selling_price_m2, wholesale_price_m2,
    min_selling_price_m2, min_stock_level, is_active
  ) VALUES (
    'prod_scope_return', 'SKU-SCOPE-RETURN', 'BAR-SCOPE-RETURN', 'Scoped return product',
    'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 10, 20, 15, 10, 1, 1
  )`);
  db.run(`
    INSERT INTO purchase_invoice_items (
      id, purchase_id, product_id, product_name, grade, quantity_m2, boxes_count,
      unit_cost, total_cost, meters_per_box, pieces_per_box
    ) VALUES ('piitem_scope_a', 'pi_scope_a', 'prod_scope_return', 'Scoped return product',
      'GRADE_1', 1, 1, 10, 10, 1.44, 4)
  `);
  db.run(`
    INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
    VALUES ('stk_scope_return', 'wh_scope_a', 'prod_scope_return', 1, 0)
  `);
  const purchaseReturns = new PurchaseReturnService();
  assert.deepEqual(purchaseReturns.getAllReturns().map(row => row.id), ['pret_scope_a']);
  assert.equal(purchaseReturns.getReturnById('pret_scope_b'), null);
  const cashBeforeReturn = db.query<{ balance: number }>(
    'SELECT current_balance AS balance FROM cash_registers WHERE id = ?',
    ['cr_scope_a']
  )[0].balance;
  const priorCostingMethod = db.query<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'costingMethod'`
  )[0]?.value;
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', 'AVERAGE_COST')`);
  try {
    purchaseReturns.createReturn({
      purchaseId: 'pi_scope_a',
      reason: 'Branch-scoped cash refund',
      refundMethod: 'CASH',
      items: [{ productId: 'prod_scope_return', quantityM2: 1 }],
    });
  } finally {
    if (priorCostingMethod === undefined) {
      db.run(`DELETE FROM system_settings WHERE key = 'costingMethod'`);
    } else {
      db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', ?)`, [priorCostingMethod]);
    }
  }
  assert.equal(
    db.query<{ balance: number }>('SELECT current_balance AS balance FROM cash_registers WHERE id = ?', ['cr_scope_a'])[0].balance,
    cashBeforeReturn + 10
  );
  assert.equal(
    db.query<{ balance: number }>('SELECT current_balance AS balance FROM cash_registers WHERE id = ?', ['cr_scope_b'])[0].balance,
    0
  );
  const procurement = new ProcurementService();
  const manualClaim = procurement.createClaim({
    supplierId: 'sup_scope',
    claimType: 'OTHER',
    claimedAmount: 10,
  });
  const cashBeforeClaimRefund = db.query<{ balance: number }>(
    'SELECT current_balance AS balance FROM cash_registers WHERE id = ?',
    ['cr_scope_a']
  )[0].balance;
  procurement.settleClaim(manualClaim.id, 'REFUND', 5);
  assert.equal(
    db.query<{ balance: number }>('SELECT current_balance AS balance FROM cash_registers WHERE id = ?', ['cr_scope_a'])[0].balance,
    cashBeforeClaimRefund + 5
  );
  assert.equal(
    db.query<{ branchId: string }>('SELECT branch_id AS branchId FROM supplier_claims WHERE id = ?', [manualClaim.id])[0]?.branchId,
    'br_scope_a'
  );
  db.run(`
    INSERT INTO supplier_claims (
      id, claim_number, date, supplier_id, branch_id, purchase_invoice_id, claim_type,
      claimed_amount, created_by
    ) VALUES ('claim_scope_b', 'CLM-SCOPE-B', '2026-01-02', 'sup_scope', 'br_scope_b', 'pi_scope_b',
      'OTHER', 10, 'usr_scope')
  `);
  assert.deepEqual(procurement.getAllClaims().map(row => row.id), [manualClaim.id]);
  assert.equal(procurement.getClaimById('claim_scope_b'), null);
  assert.throws(() => procurement.settleClaim('claim_scope_b', 'DEBIT_NOTE', 10), /غير موجودة/);
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
  assert.throws(() => access.requireBranchAccess('br_scope_b'), /الفرع النشط الحالي/);
  assert.throws(() => access.requireWarehouseAccess('wh_scope_b'), /الفرع النشط الحالي/);
  access.setCurrentBranchId('br_scope_b');
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
    password: 'TestPass123!',
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

test('branch onboarding, assignment, editing, and lifecycle stay integrated', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_branch_management_admin', 'branch-management-admin', 'test', 'Branch Management Admin', 'ADMIN', 1, 'ALL'),
            ('usr_branch_manager', 'branch-manager', 'test', 'Branch Manager', 'MANAGER', 1, 'ASSIGNED')`
  );
  const admin: User = {
    id: 'usr_branch_management_admin',
    username: 'branch-management-admin',
    fullName: 'Branch Management Admin',
    role: 'ADMIN',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);

  const operations = new OperationsService();
  const branch = operations.createBranch({
    name: 'Branch Lifecycle Test',
    phone: '01000000000',
    address: 'Main Road',
    city: 'Cairo',
    companyId: 'cmp_main',
    managerId: 'usr_branch_manager',
    deviceType: 'WINDOWS',
  });
  assert.match(branch.code, /^BR-/);
  assert.equal(branch.companyId, 'cmp_main');
  assert.equal(branch.managerId, 'usr_branch_manager');
  assert.ok(branch.activationCode);
  assert.equal(
    db.query<{ branchId: string }>(
      'SELECT branch_id AS branchId FROM users_branches WHERE user_id = ? AND branch_id = ?',
      ['usr_branch_manager', branch.id]
    ).length,
    1
  );
  assert.equal(
    Number(db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM cash_registers WHERE branch_id = ? AND is_active = 1',
      [branch.id]
    )[0].count),
    1
  );

  const access = new BranchAccessService();
  access.setCurrentBranchId(branch.id, admin);
  assert.deepEqual(operations.getBranches().map((row) => row.id), [branch.id]);
  assert.ok(access.getSelectableBranches(admin).some((row) => row.id === 'br_main'));

  const branchService = new BranchService();
  branchService.updateBranch(branch.id, {
    name: 'Branch Lifecycle Updated',
    code: `${branch.code}-EDIT`,
    city: 'Giza',
  });
  assert.equal(branchService.getBranchById(branch.id)?.name, 'Branch Lifecycle Updated');
  assert.equal(
    db.query<{ name: string }>('SELECT name FROM sync_branches WHERE branch_id = ?', [branch.id])[0].name,
    'Branch Lifecycle Updated'
  );

  branchService.updateBranch(branch.id, { isDefault: true });
  assert.throws(() => branchService.updateBranch(branch.id, { isDefault: false }), /فرعًا افتراضيًا آخر/);
  assert.throws(() => operations.toggleBranch(branch.id, false), /لا يمكن تعطيل الفرع الافتراضي/);
  access.setCurrentBranchId('br_main', admin);
  branchService.updateBranch('br_main', { isDefault: true });
  access.setCurrentBranchId(branch.id, admin);
  assert.equal(branchService.getBranchById(branch.id)?.isDefault, false);

  branchService.updateBranchUserAssignments(branch.id, ['usr_branch_manager']);
  assert.equal(
    branchService.getBranchUserAssignments(branch.id).find((user) => user.id === 'usr_branch_manager')?.isAssigned,
    true
  );
  assert.throws(
    () => branchService.updateBranchUserAssignments(branch.id, []),
    /آخر فرع مسند/
  );

  operations.toggleBranch(branch.id, false);
  assert.equal(
    Number(db.query<{ isActive: number }>(
      'SELECT is_active AS isActive FROM branches WHERE id = ?',
      [branch.id]
    )[0].isActive),
    0
  );
  assert.ok(operations.getBranches('', true).some((row) => row.id === branch.id && !row.isActive));
  assert.equal(db.query<{ status: string }>(
    'SELECT status FROM sync_branches WHERE branch_id = ?',
    [branch.id]
  )[0].status, 'DISABLED');
  operations.toggleBranch(branch.id, true);
  assert.equal(branchService.getBranchById(branch.id)?.isActive, true);
});

test('inventory reconciliation and audit logs are limited to the active branch and server-calculated', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(`
    INSERT INTO branches (id, code, name, is_main, is_active, company_id)
    VALUES ('br_recon_scope_a', 'RECON-A', 'Reconciliation A', 0, 1, 'cmp_main'),
           ('br_recon_scope_b', 'RECON-B', 'Reconciliation B', 0, 1, 'cmp_main')
  `);
  db.run(`
    INSERT INTO warehouses (id, name, code, branch_id, is_active)
    VALUES ('wh_recon_scope_a', 'Reconciliation Warehouse A', 'RECON-WA', 'br_recon_scope_a', 1),
           ('wh_recon_scope_b', 'Reconciliation Warehouse B', 'RECON-WB', 'br_recon_scope_b', 1)
  `);
  db.run(`
    INSERT INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
    VALUES ('usr_recon_scope', 'recon-scope-user', 'test', 'Reconciliation User', 'SALES', 1, 'ASSIGNED')
  `);
  db.run(`INSERT INTO users_branches (user_id, branch_id) VALUES ('usr_recon_scope', 'br_recon_scope_a')`);
  db.run(`
    INSERT INTO user_permissions (user_id, permission_code, effect)
    VALUES ('usr_recon_scope', 'inventory.view', 'GRANT'),
           ('usr_recon_scope', 'inventory.adjust', 'GRANT')
  `);
  const user: User = {
    id: 'usr_recon_scope',
    username: 'recon-scope-user',
    fullName: 'Reconciliation User',
    role: 'SALES',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  AuthService.setCurrentUser(user);

  db.run(`
    INSERT INTO products
      (id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit,
       pieces_per_box, meters_per_box, cost_price, selling_price_m2, wholesale_price_m2,
       min_selling_price_m2, min_stock_level, is_active)
    VALUES ('prod_recon_scope', 'RECON-SKU', 'RECON-BAR', 'Reconciliation Scope Product',
       'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 10, 20, 15, 10, 1, 1)
  `);
  db.run(`
    INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
    VALUES ('stk_recon_scope_a', 'wh_recon_scope_a', 'prod_recon_scope', 3, 0),
           ('stk_recon_scope_b', 'wh_recon_scope_b', 'prod_recon_scope', 500, 0)
  `);
  InventoryCostingService.addLayer(db, {
    productId: 'prod_recon_scope', warehouseId: 'wh_recon_scope_a', sourceType: 'TEST',
    sourceId: 'recon_scope_a', date: '2026-01-01', quantity: 3, unitCost: 8,
  });
  InventoryCostingService.addLayer(db, {
    productId: 'prod_recon_scope', warehouseId: 'wh_recon_scope_b', sourceType: 'TEST',
    sourceId: 'recon_scope_b', date: '2026-01-01', quantity: 500, unitCost: 1000,
  });

  const accountId = db.query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE code = '1104'`
  )[0]?.id;
  assert.ok(accountId, 'inventory GL account is seeded');
  db.run(`
    INSERT INTO journal_entries
      (id, entry_number, date, description, reference_type, reference_id,
       total_debit, total_credit, is_posted, created_by, branch_id, company_id)
    VALUES ('je_recon_scope_a', 'JE-RECON-SCOPE-A', '2026-01-01', 'Branch A inventory',
       'TEST', 'recon_scope_a', 80, 80, 1, 'usr_recon_scope', 'br_recon_scope_a', 'cmp_main'),
           ('je_recon_scope_b', 'JE-RECON-SCOPE-B', '2026-01-01', 'Branch B inventory',
       'TEST', 'recon_scope_b', 500000, 500000, 1, 'usr_recon_scope', 'br_recon_scope_b', 'cmp_main')
  `);
  db.run(`
    INSERT INTO journal_entry_lines (id, entry_id, account_id, debit, credit)
    VALUES ('jel_recon_scope_a', 'je_recon_scope_a', ?, 80, 0),
           ('jel_recon_scope_b', 'je_recon_scope_b', ?, 500000, 0)
  `, [accountId, accountId]);

  const inventory = new InventoryService();
  assert.deepEqual(inventory.getAllWarehouses().map((warehouse) => warehouse.id), ['wh_recon_scope_a']);
  assert.throws(() => inventory.reconcileInventoryWithGL('wh_recon_scope_b'), /ليس لديك صلاحية الوصول|الفرع النشط/);
  const result = inventory.reconcileInventoryWithGL();
  const expectedPhysical = db.query<{ total: number }>(`
    SELECT COALESCE(SUM(ws.quantity_m2 * p.cost_price), 0) AS total
    FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id
    WHERE ws.warehouse_id = 'wh_recon_scope_a' AND p.is_active = 1
  `)[0].total;
  const expectedFifo = db.query<{ total: number }>(`
    SELECT COALESCE(SUM(quantity_remaining * unit_cost), 0) AS total
    FROM inventory_cost_layers WHERE warehouse_id = 'wh_recon_scope_a' AND quantity_remaining > 0
  `)[0].total;
  const expectedLedger = db.query<{ total: number }>(`
    SELECT COALESCE(SUM(jel.debit - jel.credit), 0) AS total
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.entry_id
    WHERE je.is_posted = 1 AND je.branch_id = 'br_recon_scope_a' AND jel.account_id = ?
  `, [accountId])[0].total;
  assert.equal(result.totalPhysicalCost, Number(expectedPhysical.toFixed(2)));
  assert.equal(result.totalFifoLayerCost, Number(expectedFifo.toFixed(2)));
  assert.equal(result.totalGlInventoryCost, Number(expectedLedger.toFixed(2)));

  db.run(`
    INSERT INTO inventory_reconciliation_logs (
      id, reconciliation_date, branch_id, warehouse_id, total_physical_cost,
      total_fifo_layer_cost, total_gl_inventory_cost, variance_physical_vs_fifo,
      variance_fifo_vs_gl, status, performed_by
    ) VALUES ('recon_scope_foreign_log', '2026-01-01', 'br_recon_scope_b', 'wh_recon_scope_b',
      900000, 900000, 900000, 0, 0, 'BALANCED', 'usr_recon_scope')
  `);
  const untrustedSnapshot = {
    warehouseId: 'wh_recon_scope_a',
    totalPhysicalCost: 999999,
    totalFifoLayerCost: 999999,
    totalGlInventoryCost: 999999,
    variancePhysicalVsFifo: 0,
    varianceFifoVsGl: 0,
    status: 'BALANCED',
  };
  inventory.saveReconciliationLog(untrustedSnapshot);
  const logs = inventory.getReconciliationLogs();
  assert.ok(logs.every((log) => log.branchId === 'br_recon_scope_a'));
  const savedLog = logs.find((log) => log.warehouseId === 'wh_recon_scope_a');
  assert.ok(savedLog);
  const recalculated = inventory.reconcileInventoryWithGL('wh_recon_scope_a');
  assert.equal(savedLog.totalPhysicalCost, recalculated.totalPhysicalCost);
  assert.notEqual(savedLog.totalPhysicalCost, untrustedSnapshot.totalPhysicalCost);

  db.run(`
    INSERT INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
    VALUES ('usr_recon_no_view', 'recon-no-view', 'test', 'No View User', 'SALES', 1, 'ASSIGNED')
  `);
  db.run(`
    INSERT INTO user_permissions (user_id, permission_code, effect)
    VALUES ('usr_recon_no_view', 'inventory.view', 'DENY')
  `);
  AuthService.setCurrentUser({
    id: 'usr_recon_no_view',
    username: 'recon-no-view',
    fullName: 'No View User',
    role: 'SALES',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  });
  assert.throws(() => inventory.getReconciliationLogs(), /غير مصرح/);
  AuthService.logout();
});
