import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { ProductService } from '../src/services/ProductService.ts';
import { ManufacturingService } from '../src/services/ManufacturingService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_qc_admin',
  username: 'qc-admin',
  fullName: 'QC Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const manager: User = {
  id: 'usr_qc_manager',
  username: 'qc-manager',
  fullName: 'QC Manager',
  role: 'MANAGER',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const sales: User = {
  id: 'usr_qc_sales',
  username: 'qc-sales',
  fullName: 'QC Sales',
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
     VALUES ('usr_qc_admin', 'qc-admin', 'test', 'QC Admin', 'ADMIN', 1)`
  );
  for (const [id, username, fullName, role] of [
    ['usr_qc_manager', 'qc-manager', 'QC Manager', 'MANAGER'],
    ['usr_qc_sales', 'qc-sales', 'QC Sales', 'SALES'],
  ]) {
    db.run(
      `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
       VALUES (?, ?, 'test', ?, ?, 1, 'ASSIGNED')`,
      [id, username, fullName, role]
    );
    db.run(`INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES (?, 'br_main')`, [id]);
    db.run(`DELETE FROM user_permissions WHERE user_id = ?`, [id]);
  }
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  PermissionService.invalidate(manager);
  PermissionService.invalidate(sales);
  if (!ModuleRegistryService.isModuleEnabled('manufacturing')) {
    ModuleRegistryService.activate('manufacturing', admin);
    AuthService.setCurrentUser(admin);
    PermissionService.invalidate(admin);
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

let productSequence = 0;

function createProduct(): string {
  const sequence = ++productSequence;
  return new ProductService().createProduct({
    sku: `QC-SKU-${sequence}`,
    barcode: `QC-BAR-${sequence}`,
    name: `QC Product ${sequence}`,
    categoryId: 'cat_floor',
    brandId: 'br_cleo',
  } as any).id;
}

function createOrder(service: ManufacturingService): string {
  const product = createProduct();
  const component = createProduct();
  const bom = service.createBom({
    productId: product,
    name: `QC BOM`,
    items: [{ componentProductId: component, quantity: 2 }],
  });
  service.activateBom(bom.id);
  const order = service.createProductionOrder({
    productId: product,
    bomId: bom.id,
    quantity: 5,
    branchId: 'br_main',
  });
  service.releaseOrder(order.id);
  service.startOrder(order.id);
  return order.id;
}

test('quality checks are created, read and updated with permission and branch scope', async () => {
  await boot();
  asAdmin();
  const service = new ManufacturingService();
  const orderId = createOrder(service);

  const created = service.createQualityCheck({
    productionOrderId: orderId,
    inspectionType: 'FINAL',
    result: 'PASS',
    quantityInspected: 5,
    quantityAccepted: 5,
    quantityRejected: 0,
    notes: 'all good',
  });
  assert.equal(created.result, 'PASS');
  assert.equal(created.quantityAccepted, 5);
  assert.equal(created.inspectionType, 'FINAL');

  const list = service.getQualityChecks(orderId);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, created.id);

  const updated = service.updateQualityCheck(created.id, { result: 'CONDITIONAL', quantityRejected: 1 });
  assert.equal(updated.result, 'CONDITIONAL');
  assert.equal(updated.quantityRejected, 1);

  asSales();
  assert.throws(() => service.createQualityCheck({ productionOrderId: orderId, result: 'FAIL' }), /صلاحية|permission/i);
  asAdmin();
});

test('quality checks are branch scoped', async () => {
  await boot();
  asAdmin();
  const service = new ManufacturingService();
  const orderId = createOrder(service);
  const check = service.createQualityCheck({ productionOrderId: orderId, result: 'PASS' });

  asManager();
  const visible = service.getQualityChecks(orderId);
  assert.ok(visible.some((row) => row.id === check.id));
  asAdmin();
});

test('deactivating manufacturing blocks quality check writes but keeps reads', async () => {
  await boot();
  asAdmin();
  const service = new ManufacturingService();
  const orderId = createOrder(service);
  const check = service.createQualityCheck({ productionOrderId: orderId, result: 'PASS' });

  ModuleRegistryService.deactivate('manufacturing', admin, 'not used');
  assert.throws(
    () => service.createQualityCheck({ productionOrderId: orderId, result: 'FAIL' }),
    /غير مفعّلة/
  );
  // reads still work
  const rows = service.getQualityChecks(orderId);
  assert.ok(rows.some((row) => row.id === check.id));
  ModuleRegistryService.activate('manufacturing', admin, 're-enabled');
  asAdmin();
});
