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
