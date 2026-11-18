import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { ApprovalService } from '../src/services/domains/approvals/ApprovalService.ts';
import { ModuleRegistryService } from '../src/services/domains/config/ModuleRegistryService.ts';
import { InventoryService } from '../src/services/domains/inventory/InventoryService.ts';
import { ApprovalPolicyService } from '../src/services/domains/approvals/ApprovalPolicyService.ts';
import type { User } from '../src/types/auth/identity.ts';

const admin: User = {
  id: 'usr_approval_admin',
  username: 'approval-admin',
  fullName: 'Approval Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const manager: User = {
  id: 'usr_approval_manager',
  username: 'approval-manager',
  fullName: 'Approval Manager',
  role: 'MANAGER',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const secondManager: User = {
  id: 'usr_approval_manager2',
  username: 'approval-manager2',
  fullName: 'Second Manager',
  role: 'MANAGER',
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
     VALUES ('usr_approval_admin', 'approval-admin', 'test', 'Approval Admin', 'ADMIN', 1),
            ('usr_approval_manager', 'approval-manager', 'test', 'Approval Manager', 'MANAGER', 1),
            ('usr_approval_manager2', 'approval-manager2', 'test', 'Second Manager', 'MANAGER', 1)`
  );
  db.run(
    `INSERT OR REPLACE INTO users_branches (user_id, branch_id)
     SELECT 'usr_approval_manager', id FROM branches WHERE is_main = 1`
  );
  db.run(
    `INSERT OR REPLACE INTO users_branches (user_id, branch_id)
     SELECT 'usr_approval_manager2', id FROM branches WHERE is_main = 1`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  return db;
}

test('segregation of duties blocks self-approval only when the policy is enabled', async () => {
  await boot();
  const approvals = new ApprovalService();
  ModuleRegistryService.setModuleSetting('approvals', 'requireSegregationOfDuties', false, admin);

  AuthService.setCurrentUser(manager);
  PermissionService.invalidate(manager);
  const request = approvals.createRequest({ requestType: 'EXPENSE', title: 'Self approval allowed' });
  approvals.decide(request.id, true);

  ModuleRegistryService.setModuleSetting('approvals', 'requireSegregationOfDuties', true, admin);
  const guarded = approvals.createRequest({ requestType: 'EXPENSE', title: 'Self approval blocked' });
  assert.throws(() => approvals.decide(guarded.id, true), /فصل المهام/);

  AuthService.setCurrentUser(secondManager);
  PermissionService.invalidate(secondManager);
  approvals.decide(guarded.id, true);
  const row = DatabaseManager.getInstance().query<{ status: string; decidedBy: string }>(
    'SELECT status, decided_by AS decidedBy FROM approval_requests WHERE id = ?',
    [guarded.id]
  )[0];
  assert.equal(row.status, 'APPROVED');
  assert.equal(row.decidedBy, secondManager.id);
});

test('inventory approval posts stock and its movement atomically through the approval inbox', async () => {
  const db = await boot();
  const suffix = Date.now().toString();
  const warehouseId = `wh_approval_${suffix}`;
  const productId = `prod_approval_${suffix}`;
  db.run(`INSERT INTO warehouses (id, code, name, branch_id, is_active) VALUES (?, ?, ?, 'br_main', 1)`,
    [warehouseId, `WH-AP-${suffix}`, 'Approval workflow warehouse']);
  db.run('INSERT INTO categories (id, name) VALUES (?, ?)', [`cat_ap_${suffix}`, 'Approval test category']);
  db.run('INSERT INTO brands (id, name) VALUES (?, ?)', [`brand_ap_${suffix}`, 'Approval test brand']);
  db.run(`INSERT INTO products (
    id, sku, barcode, name, category_id, brand_id, product_type, base_unit, custom_unit,
    grade, size, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
    wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active
  ) VALUES (?, ?, ?, ?, ?, ?, 'GENERAL', 'BOX', '', 'GENERAL', '', 'BOX', 1, 1, 5, 10, 8, 7, 0, 1)`, [
    productId, `SKU-AP-${suffix}`, `BAR-AP-${suffix}`, 'Approval inventory product', `cat_ap_${suffix}`, `brand_ap_${suffix}`,
  ]);
  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES (?, ?, ?, 4, 0)`,
    [`stk_ap_${suffix}`, warehouseId, productId]);

  const employee: User = {
    id: `usr_ap_employee_${suffix}`, username: `ap-employee-${suffix}`, fullName: 'Approval Employee',
    role: 'MANAGER', isActive: true, createdAt: '', updatedAt: '',
  };
  const approver: User = {
    id: `usr_ap_approver_${suffix}`, username: `ap-approver-${suffix}`, fullName: 'Approval Manager',
    role: 'MANAGER', isActive: true, createdAt: '', updatedAt: '',
  };
  for (const user of [employee, approver]) {
    db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active) VALUES (?, ?, 'test', ?, ?, 1)`,
      [user.id, user.username, user.fullName, user.role]);
    db.run(`INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES (?, 'br_main')`, [user.id]);
    PermissionService.invalidate(user);
  }
  db.run(`INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES (?, 'inventory.adjust', 'GRANT')`, [employee.id]);
  db.run(`INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES (?, 'inventory.adjustment.approve', 'GRANT')`, [approver.id]);
  db.run(`INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES (?, 'inventory.adjustment.approve', 'GRANT')`, [secondManager.id]);
  PermissionService.invalidate(employee);
  PermissionService.invalidate(approver);

  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  new ApprovalPolicyService().setPolicy({
    operationCode: 'inventory.adjustment.create', mode: 'APPROVAL', executorRoles: [], approverRoles: [],
    minApprovals: 2, approvalMode: 'MULTI', scopeType: 'BRANCH', allowSelfApproval: false, maxValue: null, expiresAfterHours: null,
  });

  AuthService.setCurrentUser(employee);
  PermissionService.invalidate(employee);
  const inventory = new InventoryService();
  const adjustmentId = inventory.createAdjustment({
    warehouseId, productId, type: 'ADD', quantity: 3, reason: 'Approval workflow test',
  });
  const request = db.query<{ id: string; status: string; payload: string }>(
    `SELECT id, status, payload FROM approval_requests WHERE reference_type = 'STOCK_ADJUSTMENT' AND reference_id = ?`,
    [adjustmentId]
  )[0];
  assert.ok(request);
  assert.equal(request.status, 'PENDING');
  assert.equal(JSON.parse(request.payload).quantity, 3);
  assert.equal(db.query<{ quantity: number }>(
    'SELECT COALESCE((SELECT quantity_m2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?), 0) AS quantity', [warehouseId, productId]
  )[0].quantity, 4);

  AuthService.setCurrentUser(approver);
  PermissionService.invalidate(approver);
  const approvals = new ApprovalService();
  approvals.decide(request.id, true);
  assert.equal(db.query<{ status: string }>('SELECT status FROM approval_requests WHERE id = ?', [request.id])[0].status, 'PENDING');
  assert.equal(db.query<{ quantity: number }>(
    'SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?', [warehouseId, productId]
  )[0].quantity, 4);

  AuthService.setCurrentUser(secondManager);
  PermissionService.invalidate(secondManager);
  approvals.decide(request.id, true);
  assert.equal(db.query<{ quantity: number }>(
    'SELECT COALESCE((SELECT quantity_m2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?), 0) AS quantity', [warehouseId, productId]
  )[0].quantity, 7);
  assert.equal(db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM inventory_transactions WHERE reference_id = ? AND reference_type = 'ADJUSTMENT'`, [adjustmentId]
  )[0].count, 1);
  assert.equal(db.query<{ status: string }>('SELECT status FROM stock_adjustments WHERE id = ?', [adjustmentId])[0].status, 'POSTED');
  assert.throws(() => approvals.decide(request.id, true), /already|already|تم اتخاذ قرار/i);
  assert.equal(db.query<{ quantity: number }>(
    'SELECT COALESCE((SELECT quantity_m2 FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?), 0) AS quantity', [warehouseId, productId]
  )[0].quantity, 7);

  AuthService.setCurrentUser(employee);
  PermissionService.invalidate(employee);
  const expiringAdjustment = inventory.createAdjustment({ warehouseId, productId, type: 'ADD', quantity: 5, reason: 'Expiry workflow test' });
  const expiringRequest = db.query<{ id: string }>(`SELECT id FROM approval_requests WHERE reference_id = ?`, [expiringAdjustment])[0];
  db.run(`UPDATE approval_requests SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`, [expiringRequest.id]);
  approvals.getRequests('ALL');
  assert.equal(db.query<{ status: string }>('SELECT status FROM approval_requests WHERE id = ?', [expiringRequest.id])[0].status, 'EXPIRED');
  assert.equal(db.query<{ status: string }>('SELECT status FROM stock_adjustments WHERE id = ?', [expiringAdjustment])[0].status, 'REJECTED');
  assert.equal(db.query<{ quantity: number }>(
    'SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?', [warehouseId, productId]
  )[0].quantity, 7);
});

test('expense approval gate blocks, approves and consumes exactly once', async () => {
  const db = await boot();
  const suffix = `${Date.now()}e`;
  const cashier: User = {
    id: `usr_gate_cashier_${suffix}`, username: `gate-cashier-${suffix}`, fullName: 'Gate Cashier',
    role: 'MANAGER', isActive: true, createdAt: '', updatedAt: '',
  };
  const approver: User = {
    id: `usr_gate_approver_${suffix}`, username: `gate-approver-${suffix}`, fullName: 'Gate Approver',
    role: 'MANAGER', isActive: true, createdAt: '', updatedAt: '',
  };
  for (const user of [cashier, approver]) {
    db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active) VALUES (?, ?, 'test', ?, ?, 1)`,
      [user.id, user.username, user.fullName, user.role]);
    db.run(`INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES (?, 'br_main')`, [user.id]);
    PermissionService.invalidate(user);
  }
  db.run(`INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES (?, 'ui.cashier.expenses.expense', 'GRANT')`, [cashier.id]);
  db.run(`INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES (?, 'approvals.create', 'GRANT')`, [cashier.id]);
  db.run(`INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES (?, 'ui.approvals.inbox.approve', 'GRANT')`, [approver.id]);
  db.run(`INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES (?, 'ui.approvals.inbox.reject', 'GRANT')`, [approver.id]);
  PermissionService.invalidate(cashier);
  PermissionService.invalidate(approver);

  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  ModuleRegistryService.setModuleSetting('approvals', 'requireSegregationOfDuties', true, admin);
  new ApprovalPolicyService().setPolicy({
    operationCode: 'finance.expense.create', mode: 'APPROVAL', executorRoles: [], approverRoles: [],
    minApprovals: 1, allowSelfApproval: false, maxValue: null, expiresAfterHours: null,
  });

  const { CashierService } = await import('../src/services/domains/finance/CashierService.ts');
  AuthService.setCurrentUser(cashier);
  PermissionService.invalidate(cashier);
  const cashierService = new CashierService();
  assert.throws(
    () => cashierService.addExpense('إيجار', 500, 'إيجار فرع', 'cr_main'),
    /تتطلب موافقة/
  );
  const pending = db.query<{ id: string; payload: string }>(
    `SELECT id, payload FROM approval_requests WHERE request_type = 'EXPENSE' AND status = 'PENDING' AND requested_by = ?`,
    [cashier.id]
  )[0];
  assert.ok(pending);
  assert.equal(JSON.parse(pending.payload).operationCode, 'finance.expense.create');
  assert.equal(db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM expenses WHERE description = 'إيجار فرع'`)[0].count, 0);

  // Self-approval is blocked while segregation of duties is enabled.
  const approvals = new ApprovalService();
  assert.throws(() => approvals.decide(pending.id, true), /فصل المهام/);

  AuthService.setCurrentUser(approver);
  PermissionService.invalidate(approver);
  approvals.decide(pending.id, true);

  AuthService.setCurrentUser(cashier);
  PermissionService.invalidate(cashier);
  // Retrying the identical operation auto-resolves the approved request —
  // no approvalId needs to be threaded through the UI.
  const expense = cashierService.addExpense('إيجار', 500, 'إيجار فرع', 'cr_main');
  assert.ok(expense.id);
  assert.equal(db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM expenses WHERE id = ?`, [expense.id])[0].count, 1);
  const consumed = db.query<{ referenceType: string; referenceId: string }>(
    `SELECT reference_type AS referenceType, reference_id AS referenceId FROM approval_requests WHERE id = ?`, [pending.id]
  )[0];
  assert.equal(consumed.referenceType, 'EXPENSE');
  assert.equal(consumed.referenceId, expense.id);
  // The approval is single-use.
  assert.throws(
    () => cashierService.addExpense('إيجار', 500, 'إيجار فرع ثانٍ', 'cr_main', undefined, 'CASH', '', 'usr_x', { approvalId: pending.id }),
    /استهلاك|استُهلك|لا يخص|غير معتمد|تفاصيل/
  );
});

test('product price change and delete go through the approval gate', async () => {
  const db = await boot();
  const suffix = `${Date.now()}p`;
  const editor: User = {
    id: `usr_gate_editor_${suffix}`, username: `gate-editor-${suffix}`, fullName: 'Gate Editor',
    role: 'MANAGER', isActive: true, createdAt: '', updatedAt: '',
  };
  const approver: User = {
    id: `usr_gate_papprover_${suffix}`, username: `gate-papprover-${suffix}`, fullName: 'Gate Product Approver',
    role: 'MANAGER', isActive: true, createdAt: '', updatedAt: '',
  };
  for (const user of [editor, approver]) {
    db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active) VALUES (?, ?, 'test', ?, ?, 1)`,
      [user.id, user.username, user.fullName, user.role]);
    db.run(`INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES (?, 'br_main')`, [user.id]);
    PermissionService.invalidate(user);
  }
  for (const perm of ['ui.products.catalog.update', 'ui.products.catalog.delete', 'approvals.create']) {
    db.run(`INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES (?, ?, 'GRANT')`, [editor.id, perm]);
  }
  db.run(`INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES (?, 'ui.approvals.inbox.approve', 'GRANT')`, [approver.id]);
  PermissionService.invalidate(editor);
  PermissionService.invalidate(approver);

  const productId = `prod_gate_${suffix}`;
  db.run('INSERT INTO categories (id, name) VALUES (?, ?)', [`cat_g_${suffix}`, 'Gate category']);
  db.run('INSERT INTO brands (id, name) VALUES (?, ?)', [`brand_g_${suffix}`, 'Gate brand']);
  db.run(`INSERT INTO products (
    id, sku, barcode, name, category_id, brand_id, product_type, base_unit, custom_unit,
    grade, size, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
    wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active
  ) VALUES (?, ?, ?, ?, ?, ?, 'GENERAL', 'BOX', '', 'GENERAL', '', 'BOX', 1, 1, 5, 10, 8, 7, 0, 1)`, [
    productId, `SKU-G-${suffix}`, `BAR-G-${suffix}`, 'Gate product', `cat_g_${suffix}`, `brand_g_${suffix}`,
  ]);

  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  new ApprovalPolicyService().setPolicy({
    operationCode: 'products.price.update', mode: 'DIRECT', executorRoles: [], approverRoles: [],
    minApprovals: 1, allowSelfApproval: false, maxValue: 5, expiresAfterHours: null,
  });

  const { ProductService } = await import('../src/services/domains/products/ProductService.ts');
  const products = new ProductService();
  AuthService.setCurrentUser(editor);
  PermissionService.invalidate(editor);

  // Delta 10 > maxValue 5 → approval required.
  assert.throws(() => products.updateProduct(productId, { sellingPriceM2: 20 }), /تتطلب موافقة/);
  const priceRequest = db.query<{ id: string; payload: string }>(
    `SELECT id, payload FROM approval_requests WHERE request_type = 'PRICE_CHANGE' AND status = 'PENDING' AND requested_by = ?`,
    [editor.id]
  )[0];
  assert.ok(priceRequest);
  assert.equal(JSON.parse(priceRequest.payload).operationCode, 'products.price.update');

  // Small delta within threshold → direct.
  products.updateProduct(productId, { minStockLevel: 3 });
  assert.equal(Number(db.query<{ p: number }>('SELECT selling_price_m2 AS p FROM products WHERE id = ?', [productId])[0].p), 10);

  AuthService.setCurrentUser(approver);
  PermissionService.invalidate(approver);
  new ApprovalService().decide(priceRequest.id, true);

  AuthService.setCurrentUser(editor);
  PermissionService.invalidate(editor);
  products.updateProduct(productId, { sellingPriceM2: 20 }, 'usr_x', { approvalId: priceRequest.id });
  // Money columns are stored in minor units (x100); reads unscale them.
  assert.equal(Number(db.query<{ p: number }>('SELECT selling_price_m2 AS p FROM products WHERE id = ?', [productId])[0].p), 2000);
  assert.equal(db.query<{ t: string | null }>('SELECT reference_type AS t FROM approval_requests WHERE id = ?', [priceRequest.id])[0].t, 'PRICE_CHANGE');

  // Delete always requires approval for non-admin + reason.
  assert.throws(() => products.deleteProduct(productId), /سبب/);
  const deleteRequest = (() => {
    try {
      products.deleteProduct(productId, 'usr_x', { reason: 'تنظيف كتالوج' });
      return null;
    } catch (error) {
      assert.match(String(error), /موافقة/);
      return db.query<{ id: string }>(
        `SELECT id FROM approval_requests WHERE request_type = 'DATA_DELETE' AND status = 'PENDING' AND requested_by = ?`,
        [editor.id]
      )[0];
    }
  })();
  assert.ok(deleteRequest);
  AuthService.setCurrentUser(approver);
  PermissionService.invalidate(approver);
  new ApprovalService().decide(deleteRequest.id, true);
  AuthService.setCurrentUser(editor);
  PermissionService.invalidate(editor);
  products.deleteProduct(productId, 'usr_x', { reason: 'تنظيف كتالوج', approvalId: deleteRequest.id });
  assert.equal(db.query<{ c: number }>('SELECT COUNT(*) AS c FROM products WHERE id = ?', [productId])[0].c, 0);
});

test('admin posts inventory directly without creating an unnecessary approval request', async () => {
  const db = await boot();
  const suffix = `${Date.now()}x`;
  const warehouseId = `wh_owner_${suffix}`;
  const productId = `prod_owner_${suffix}`;
  db.run(`INSERT INTO warehouses (id, code, name, branch_id, is_active) VALUES (?, ?, ?, 'br_main', 1)`, [warehouseId, `WH-OW-${suffix}`, 'Admin direct warehouse']);
  db.run('INSERT INTO categories (id, name) VALUES (?, ?)', [`cat_ow_${suffix}`, 'Admin direct category']);
  db.run('INSERT INTO brands (id, name) VALUES (?, ?)', [`brand_ow_${suffix}`, 'Admin direct brand']);
  db.run(`INSERT INTO products (
    id, sku, barcode, name, category_id, brand_id, product_type, base_unit, custom_unit,
    grade, size, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
    wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active
  ) VALUES (?, ?, ?, ?, ?, ?, 'GENERAL', 'BOX', '', 'GENERAL', '', 'BOX', 1, 1, 5, 10, 8, 7, 0, 1)`, [
    productId, `SKU-OW-${suffix}`, `BAR-OW-${suffix}`, 'Admin direct inventory product', `cat_ow_${suffix}`, `brand_ow_${suffix}`,
  ]);
  new ApprovalPolicyService().setPolicy({
    operationCode: 'inventory.adjustment.create', mode: 'APPROVAL', executorRoles: [], approverRoles: [],
    minApprovals: 1, allowSelfApproval: false, maxValue: null, expiresAfterHours: null,
  });
  const adjustmentId = new InventoryService().createAdjustment({ warehouseId, productId, type: 'ADD', quantity: 2, reason: 'Admin direct test' });
  assert.equal(db.query<{ status: string }>('SELECT status FROM stock_adjustments WHERE id = ?', [adjustmentId])[0].status, 'POSTED');
  assert.equal(db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM approval_requests WHERE reference_id = ?`, [adjustmentId])[0].count, 0);
  assert.equal(db.query<{ quantity: number }>(
    `SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`, [warehouseId, productId]
  )[0].quantity, 2);
});
