import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { BranchService } from '../src/services/BranchService.ts';
import { ProductService } from '../src/services/ProductService.ts';
import { ManufacturingService } from '../src/services/ManufacturingService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_mfg_admin',
  username: 'mfg-admin',
  fullName: 'Manufacturing Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const manager: User = {
  id: 'usr_mfg_manager',
  username: 'mfg-manager',
  fullName: 'Manufacturing Manager',
  role: 'MANAGER',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const sales: User = {
  id: 'usr_mfg_sales',
  username: 'mfg-sales',
  fullName: 'Manufacturing Sales',
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
     VALUES ('usr_mfg_admin', 'mfg-admin', 'test', 'Manufacturing Admin', 'ADMIN', 1)`
  );
  for (const [id, username, fullName, role] of [
    ['usr_mfg_manager', 'mfg-manager', 'Manufacturing Manager', 'MANAGER'],
    ['usr_mfg_sales', 'mfg-sales', 'Manufacturing Sales', 'SALES'],
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
  if (!ModuleRegistryService.isModuleEnabled('manufacturing')) {
    ModuleRegistryService.activate('manufacturing', admin);
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

let productSequence = 0;

function createProduct(name: string): string {
  const sequence = ++productSequence;
  return new ProductService().createProduct({
    sku: `MFG-SKU-${sequence}`,
    barcode: `MFG-BAR-${sequence}`,
    name,
    categoryId: 'cat_floor',
    brandId: 'br_cleo',
  } as any).id;
}

test('work centers are branch scoped', async () => {
  await boot();
  const service = new ManufacturingService();
  const betaBranch = new BranchService().createBranch({
    name: 'Mfg Beta Branch',
    code: 'MFG-BETA-1',
    companyId: 'cmp_main',
  });

  const mainCenter = service.createWorkCenter({ code: 'WC-MAIN', name: 'Main line', branchId: 'br_main' });
  const betaCenter = service.createWorkCenter({ code: 'WC-BETA', name: 'Beta line', branchId: betaBranch.id });

  asManager();
  const visible = service.getWorkCenters();
  assert.ok(visible.some((row) => row.id === mainCenter.id));
  assert.ok(!visible.some((row) => row.id === betaCenter.id));
  assert.throws(() => service.createWorkCenter({ code: 'WC-CROSS', name: 'Cross', branchId: betaBranch.id }), /صلاحية/);
  asAdmin();
});

test('BOM lifecycle requires components and activation', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct('Finished chair');
  const component = createProduct('Wood panel');

  assert.throws(() => service.createBom({ productId: product, name: 'Chair BOM', items: [] }), /مكوّن/);
  const bom = service.createBom({
    productId: product,
    name: 'Chair BOM v1',
    items: [{ componentProductId: component, quantity: 4, unit: 'PIECE' }],
  });
  assert.equal(bom.status, 'DRAFT');
  assert.equal(bom.items.length, 1);

  // Activate should succeed for a draft with items.
  const active = service.activateBom(bom.id);
  assert.equal(active.status, 'ACTIVE');
  assert.throws(() => service.activateBom(bom.id), /مسودة/);

  const archived = service.archiveBom(bom.id);
  assert.equal(archived.status, 'ARCHIVED');
});

test('production orders follow release, execution, material consumption and completion', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct('Finished table');
  const component = createProduct('Table top');
  const bom = service.createBom({
    productId: product,
    name: 'Table BOM',
    items: [{ componentProductId: component, quantity: 2 }],
  });
  service.activateBom(bom.id);

  const workCenter = service.createWorkCenter({ code: 'WC-TABLE', name: 'Table line' });
  const order = service.createProductionOrder({
    productId: product,
    bomId: bom.id,
    quantity: 3,
    priority: 'HIGH',
    operations: [{ workCenterId: workCenter.id, plannedMinutes: 60 }],
  });
  assert.equal(order.status, 'PLANNED');
  assert.equal(order.materials[0].plannedQty, 6);
  assert.equal(order.operations.length, 1);

  assert.throws(() => service.startOrder(order.id), /بعد إصداره/);
  const released = service.releaseOrder(order.id);
  assert.equal(released.status, 'RELEASED');

  const started = service.startOrder(order.id);
  assert.equal(started.status, 'IN_PROGRESS');
  assert.equal(started.operations[0].status, 'IN_PROGRESS');

  DatabaseManager.getInstance().run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_mfg_component', 'wh_main', ?, 10)`,
    [component]
  );

  const material = started.materials[0];
  const consumed = service.consumeMaterial(material.id, 4);
  assert.equal(consumed.consumedQty, 4);
  assert.equal(consumed.status, 'ISSUED');

  const operation = started.operations[0];
  const completedOperation = service.completeOperation(operation.id, 55);
  assert.equal(completedOperation.status, 'COMPLETED');
  assert.equal(completedOperation.actualMinutes, 55);

  const completed = service.completeOrder(order.id);
  assert.equal(completed.status, 'COMPLETED');
  assert.ok(completed.completedAt);
  assert.equal(completed.materials[0].consumedQty, 6);
  assert.equal(completed.materials[0].status, 'CONSUMED');

  const finishedStock = DatabaseManager.getInstance().query<{ quantityM2: number }>(
    `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
    [product]
  )[0];
  assert.equal(Number(finishedStock.quantityM2), 3);
  const componentStock = DatabaseManager.getInstance().query<{ quantityM2: number }>(
    `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
    [component]
  )[0];
  assert.equal(Number(componentStock.quantityM2), 4);

  assert.throws(() => service.cancelOrder(order.id), /مكتمل/);
});

test('production order permissions and cancellation', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const product = createProduct('Permission product');
  const component = createProduct('Permission component');
  const bom = service.createBom({ productId: product, name: 'Permission BOM', items: [{ componentProductId: component, quantity: 1 }] });
  service.activateBom(bom.id);

  asSales();
  assert.throws(() => service.getProductionOrders(), /صلاحية/);
  asAdmin();

  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_mfg_sales', 'manufacturing.view', 'GRANT')`
  );
  PermissionService.invalidate(sales);
  asSales();
  assert.ok(Array.isArray(service.getProductionOrders()));
  assert.throws(() => service.createWorkCenter({ code: 'WC-X', name: 'Blocked' }), /صلاحية/);
  asAdmin();

  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 1 });
  service.releaseOrder(order.id);
  const cancelled = service.cancelOrder(order.id, 'No capacity');
  assert.equal(cancelled.status, 'CANCELLED');
});

test('manufacturing writes are blocked when the module is disabled', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct('Guard product');
  const component = createProduct('Guard component');
  const bom = service.createBom({ productId: product, name: 'Guard BOM', items: [{ componentProductId: component, quantity: 1 }] });
  service.activateBom(bom.id);
  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 1 });

  ModuleRegistryService.deactivate('manufacturing', admin);
  assert.equal(ModuleRegistryService.isModuleEnabled('manufacturing'), false);
  assert.ok(service.getProductionOrders().some((row) => row.id === order.id), 'reads stay available');
  assert.throws(() => service.createWorkCenter({ code: 'WC-BLOCKED', name: 'Blocked' }), /غير مفعّلة/);
  assert.throws(() => service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 1 }), /غير مفعّلة/);
  assert.throws(() => service.releaseOrder(order.id), /غير مفعّلة/);

  ModuleRegistryService.activate('manufacturing', admin);
  asAdmin();
  assert.equal(ModuleRegistryService.isModuleEnabled('manufacturing'), true);
});
