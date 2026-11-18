import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { ApprovalService } from '../src/services/domains/approvals/ApprovalService.ts';
import { APPROVAL_OPERATIONS, ApprovalPolicyService } from '../src/services/domains/approvals/ApprovalPolicyService.ts';
import { ProductService } from '../src/services/domains/products/ProductService.ts';
import type { User } from '../src/types/auth/identity.ts';

const admin: User = {
  id: 'usr_gate_admin', username: 'gate-admin', fullName: 'Gate Admin', role: 'ADMIN',
  isActive: true, createdAt: '', updatedAt: '',
};
const maker: User = {
  id: 'usr_gate_maker', username: 'gate-maker', fullName: 'Gate Maker', role: 'MANAGER',
  isActive: true, createdAt: '', updatedAt: '',
};
const approver: User = {
  id: 'usr_gate_approver', username: 'gate-approver', fullName: 'Gate Approver', role: 'MANAGER',
  isActive: true, createdAt: '', updatedAt: '',
};

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('setup_completed', '1')`);
  PermissionService.seed();
  for (const user of [admin, maker, approver]) {
    db.run(`INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
      VALUES (?, ?, 'test', ?, ?, 1)`, [user.id, user.username, user.fullName, user.role]);
    db.run(`INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES (?, 'br_main')`, [user.id]);
  }
  for (const [user, permission] of [
    [maker, 'ui.products.catalog.create'], [maker, 'ui.products.catalog.update'],
    [maker, 'ui.users.users.create'], [maker, 'ui.users.users.update'], [maker, 'ui.users.users.delete'],
    [maker, 'approvals.create'], [approver, 'ui.approvals.inbox.approve'],
  ] as Array<[User, string]>) {
    db.run(`INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES (?, ?, 'GRANT')`,
      [user.id, permission]);
  }
  for (const user of [maker, approver]) PermissionService.invalidate(user);
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  return db;
}

function setApprovalPolicy(operationCode: string): void {
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  new ApprovalPolicyService().setPolicy({
    operationCode, mode: 'APPROVAL', executorRoles: [], approverRoles: [],
    minApprovals: 1, allowSelfApproval: false, maxValue: null, expiresAfterHours: null,
    approvalMode: 'SINGLE', scopeType: 'BRANCH',
  });
}

function findPending(operationCode: string): string {
  const rows = DatabaseManager.getInstance().query<{ id: string }>(
    `SELECT id FROM approval_requests WHERE status = 'PENDING' AND payload LIKE ? ORDER BY created_at DESC LIMIT 1`,
    [`%"operationCode":"${operationCode}"%`]
  );
  assert.ok(rows.length, `expected a pending approval for ${operationCode}`);
  return rows[0].id;
}

function approve(id: string): void {
  AuthService.setCurrentUser(approver);
  PermissionService.invalidate(approver);
  new ApprovalService().decide(id, true, 'test approval');
  AuthService.setCurrentUser(maker);
  PermissionService.invalidate(maker);
}

function asMaker(): ProductService {
  AuthService.setCurrentUser(maker);
  PermissionService.invalidate(maker);
  return new ProductService();
}

function asMakerAuth(): AuthService {
  AuthService.setCurrentUser(maker);
  PermissionService.invalidate(maker);
  return new AuthService();
}

test('product create and update pause behind approval gates and consume the request', async () => {
  const db = await boot();
  const suffix = Date.now().toString();

  setApprovalPolicy('products.create');
  const input = {
    name: 'Gate product', sku: `SKU-GATE-${suffix}`, barcode: `BAR-GATE-${suffix}`,
    categoryId: 'cat_floor', brandId: 'br_cleo',
    productType: 'GENERAL', baseUnit: 'PIECE', sellUnit: 'PIECE', costPrice: 5, sellingPriceM2: 10,
  } as any;

  assert.throws(() => asMaker().createProduct(input), /العملية تتطلب موافقة/);
  const createApproval = findPending('products.create');
  approve(createApproval);

  const created = asMaker().createProduct(input, undefined, 'usr_gate_maker', { approvalId: createApproval });
  assert.ok(created.id);
  assert.equal(db.query<{ reference_type: string }>(
    'SELECT reference_type FROM approval_requests WHERE id = ?', [createApproval]
  )[0].reference_type, 'PRODUCT');

  setApprovalPolicy('products.update');
  assert.throws(() => asMaker().updateProduct(created.id, { name: 'Gate product updated' }),
    /العملية تتطلب موافقة/);
  const updateApproval = findPending('products.update');
  approve(updateApproval);

  const updated = asMaker().updateProduct(created.id, { name: 'Gate product updated' }, 'usr_gate_maker', {
    approvalId: updateApproval,
  });
  assert.equal(updated.name, 'Gate product updated');
  assert.equal(db.query<{ reference_type: string }>(
    'SELECT reference_type FROM approval_requests WHERE id = ?', [updateApproval]
  )[0].reference_type, 'PRODUCT');
});

test('user create, update and delete pause behind approval gates', async () => {
  const db = await boot();
  const suffix = Date.now().toString();
  const input = {
    username: `gate_user_${suffix}`, password: 'Gate-pass-123!',
    fullName: 'Gate User', role: 'MANAGER' as const,
  };

  setApprovalPolicy('users.create');
  assert.throws(() => asMakerAuth().createUser(input), /العملية تتطلب موافقة/);
  const createApproval = findPending('users.create');
  approve(createApproval);
  // No approvalId is passed: the gate discovers the approved request from the
  // operation code and payload details, so the existing UI needs no changes.
  const created = asMakerAuth().createUser(input);
  assert.equal(created.username, input.username);
  assert.equal(db.query<{ reference_type: string }>(
    'SELECT reference_type FROM approval_requests WHERE id = ?', [createApproval]
  )[0].reference_type, 'USER');

  setApprovalPolicy('users.update');
  assert.throws(() => asMakerAuth().updateUser(created.id, { fullName: 'Updated Gate User' }),
    /العملية تتطلب موافقة/);
  const updateApproval = findPending('users.update');
  approve(updateApproval);
  const updated = asMakerAuth().updateUser(created.id, { fullName: 'Updated Gate User' });
  assert.equal(updated.fullName, 'Updated Gate User');

  setApprovalPolicy('users.delete');
  assert.throws(() => asMakerAuth().deleteUser(created.id), /العملية تتطلب موافقة/);
  const deleteApproval = findPending('users.delete');
  approve(deleteApproval);
  asMakerAuth().deleteUser(created.id);
  assert.equal(db.query<{ id: string }>('SELECT id FROM users WHERE id = ?', [created.id]).length, 0);
});

test('integrated approval operations expose their real integration flags', () => {
  const integrated = new Set(APPROVAL_OPERATIONS.filter((operation) => operation.integrated).map((operation) => operation.code));
  for (const code of [
    'inventory.adjustment.create', 'inventory.transfer.create', 'products.create',
    'products.update', 'products.price.update', 'products.delete', 'sales.price.override',
    'sales.invoice.void', 'sales.return.create', 'finance.expense.create', 'purchases.supplier.payment',
    'users.create', 'users.update', 'users.delete',
  ]) {
    assert.ok(integrated.has(code), `${code} must be marked integrated`);
  }
});

test('product paging filters by isFilterable dynamic attributes', async () => {
  const db = await boot();
  const suffix = Date.now().toString();
  const service = new ProductService();

  const attributes = [
    { id: `att_gate_a_${suffix}`, code: `GATEA-${suffix}`, value: 'MATCH' },
    { id: `att_gate_b_${suffix}`, code: `GATEB-${suffix}`, value: 'OTHER' },
  ];
  const productIds = [`prod_gate_a_${suffix}`, `prod_gate_b_${suffix}`];
  const companyId = db.query<{ company_id: string }>(
    `SELECT company_id FROM branches WHERE id = 'br_main' LIMIT 1`
  )[0].company_id;
  for (const attribute of attributes) {
    db.run(`INSERT INTO attributes (id, code, name, data_type, is_required, is_filterable, sort_order)
      VALUES (?, ?, ?, 'SELECT', 0, 1, 0)`, [attribute.id, attribute.code, attribute.code]);
  }
  productIds.forEach((productId, index) => {
    db.run(`INSERT INTO products (
      id, sku, barcode, name, category_id, brand_id, size, product_type, base_unit, sell_unit,
      cost_price, selling_price_m2, is_active, company_id
    ) VALUES (?, ?, ?, ?, 'cat_floor', 'br_cleo', '', 'GENERAL', 'PIECE', 'PIECE', 5, 10, 1, ?)`,
    [productId, `SKU-F-${suffix}-${index}`, `BAR-F-${suffix}-${index}`, `Filter product ${index}`, companyId]);
    db.run('INSERT INTO product_attribute_values (id, product_id, attribute_id, value) VALUES (?, ?, ?, ?)',
      [`pav_${suffix}_${index}`, productId, attributes[index].id, attributes[index].value]);
  });

  const page = service.getProductsPage('', undefined, undefined, 1, 25, {
    attributeFilters: { [attributes[0].id]: 'MATCH' },
  });
  assert.deepEqual(page.items.map((item) => item.id), [productIds[0]]);

  const noMatch = service.getProductsPage('', undefined, undefined, 1, 25, {
    attributeFilters: { [attributes[1].id]: 'MATCH' },
  });
  assert.equal(noMatch.items.length, 0);
});
