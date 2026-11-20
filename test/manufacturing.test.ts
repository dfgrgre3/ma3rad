import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { BranchService } from '../src/services/domains/organization/BranchService.ts';
import { BranchAccessService } from '../src/services/domains/auth/BranchAccessService.ts';
import { ProductService } from '../src/services/domains/products/ProductService.ts';
import { ManufacturingService } from '../src/services/domains/manufacturing/ManufacturingService.ts';
import { ModuleRegistryService } from '../src/services/domains/config/ModuleRegistryService.ts';
import type { User } from '../src/types/auth/identity.ts';

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
  const access = new BranchAccessService();
  access.setCurrentBranchId(betaBranch.id, admin);
  const betaCenter = service.createWorkCenter({ code: 'WC-BETA', name: 'Beta line', branchId: betaBranch.id });
  access.setCurrentBranchId('br_main', admin);

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

test('partial production receipts keep the order open until fully produced', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const product = createProduct('Partial good');
  const component = createProduct('Partial component');
  const bom = service.createBom({
    productId: product,
    name: 'Partial BOM',
    items: [{ componentProductId: component, quantity: 2 }],
  });
  service.activateBom(bom.id);
  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 4 });
  assert.equal(order.materials[0].plannedQty, 8);

  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_mfgp_component', 'wh_main', ?, 20)`,
    [component]
  );
  service.releaseOrder(order.id);
  service.startOrder(order.id);

  // Receive 1 of 4 units: proportional material issue (8 × 1/4 = 2), order stays open.
  const partial = service.completeOrder(order.id, 1);
  assert.equal(partial.status, 'IN_PROGRESS');
  assert.equal(Number(partial.producedQty), 1);
  assert.equal(Number(partial.materials[0].consumedQty), 2);
  const componentStock = db.query<{ quantityM2: number }>(
    `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
    [component]
  )[0];
  assert.equal(Number(componentStock.quantityM2), 18);
  const producedStock = db.query<{ quantityM2: number }>(
    `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
    [product]
  )[0];
  assert.equal(Number(producedStock.quantityM2), 1);

  // Over-production is rejected; receiving the rest completes the order.
  assert.throws(() => service.completeOrder(order.id, 10), /تتجاوز/);
  const done = service.completeOrder(order.id);
  assert.equal(done.status, 'COMPLETED');
  assert.equal(Number(done.producedQty), 4);
  assert.equal(Number(done.materials[0].consumedQty), 8);
});

test('multi-level BOMs explode into leaf material requirements', async () => {
  await boot();
  const service = new ManufacturingService();
  const raw = createProduct('Raw leaf');
  const subAssembly = createProduct('Sub assembly');
  const finished = createProduct('Multi-level finished');

  const subBom = service.createBom({
    productId: subAssembly,
    name: 'Sub BOM',
    items: [{ componentProductId: raw, quantity: 2 }],
  });
  service.activateBom(subBom.id);
  const bom = service.createBom({
    productId: finished,
    name: 'Parent BOM',
    items: [{ componentProductId: subAssembly, quantity: 3 }],
  });
  service.activateBom(bom.id);

  const order = service.createProductionOrder({ productId: finished, bomId: bom.id, quantity: 2 });
  // 3 sub-assemblies × 2 finished units × 2 raw per sub = 12 raw units.
  assert.equal(order.materials.length, 1);
  assert.equal(order.materials[0].productId, raw);
  assert.equal(order.materials[0].plannedQty, 12);

  // Cost estimate keeps direct BOM lines but rolls up sub-assembly cost:
  // raw @5.00 → sub-assembly unit cost 2×5=10 → parent line 3×10=30.
  DatabaseManager.getInstance().run(`UPDATE products SET cost_price = 500 WHERE id = ?`, [raw]);
  const estimate = service.getBomCostEstimate(bom.id);
  assert.equal(estimate.items.length, 1);
  assert.equal(estimate.items[0].componentProductId, subAssembly);
  assert.equal(estimate.items[0].unitCost, 10);
  assert.equal(estimate.totalCost, 30);
});

test('only one ACTIVE BOM is allowed per product', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct('Single-active product');
  const component = createProduct('Single-active component');

  const first = service.createBom({ productId: product, name: 'BOM v1', items: [{ componentProductId: component, quantity: 1 }] });
  service.activateBom(first.id);
  const second = service.createBom({ productId: product, name: 'BOM v2', items: [{ componentProductId: component, quantity: 2 }] });
  assert.throws(() => service.activateBom(second.id), /BOM نشط آخر/);
  service.archiveBom(first.id);
  const activated = service.activateBom(second.id);
  assert.equal(activated.status, 'ACTIVE');
});

test('material issuance fails when stock is insufficient', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const product = createProduct('Guarded good');
  const component = createProduct('Guarded component');
  const bom = service.createBom({ productId: product, name: 'Guarded BOM', items: [{ componentProductId: component, quantity: 5 }] });
  service.activateBom(bom.id);
  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 1 });

  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_mfgg_component', 'wh_main', ?, 3)`,
    [component]
  );
  service.releaseOrder(order.id);
  service.startOrder(order.id);
  assert.throws(() => service.consumeMaterial(order.materials[0].id, 4), /غير كافٍ/);
  const ok = service.consumeMaterial(order.materials[0].id, 3);
  assert.equal(Number(ok.consumedQty), 3);
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

test('BOM routing auto-generates production order operations', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct('Routed good');
  const component = createProduct('Routed component');
  const wcA = service.createWorkCenter({ code: 'WC-RA', name: 'Routing A' });
  const wcB = service.createWorkCenter({ code: 'WC-RB', name: 'Routing B' });
  const bom = service.createBom({
    productId: product,
    name: 'Routed BOM',
    items: [{ componentProductId: component, quantity: 1 }],
    operations: [
      { workCenterId: wcA.id, minutesPerUnit: 10 },
      { workCenterId: wcB.id, minutesPerUnit: 5 },
    ],
  });
  service.activateBom(bom.id);

  // No explicit operations → routing template is copied (minutes × quantity).
  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 4 });
  assert.equal(order.operations.length, 2);
  assert.equal(order.operations[0].workCenterId, wcA.id);
  assert.equal(order.operations[0].plannedMinutes, 40);
  assert.equal(order.operations[1].plannedMinutes, 20);

  // Explicit operations still win over the routing.
  const manual = service.createProductionOrder({
    productId: product, bomId: bom.id, quantity: 1,
    operations: [{ workCenterId: wcA.id, plannedMinutes: 99 }],
  });
  assert.equal(manual.operations.length, 1);
  assert.equal(manual.operations[0].plannedMinutes, 99);
});

test('operations run in sequence and auto-advance', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct('Sequential good');
  const component = createProduct('Sequential component');
  const wcA = service.createWorkCenter({ code: 'WC-SA', name: 'Seq A' });
  const wcB = service.createWorkCenter({ code: 'WC-SB', name: 'Seq B' });
  const bom = service.createBom({
    productId: product,
    name: 'Seq BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);
  const order = service.createProductionOrder({
    productId: product, bomId: bom.id, quantity: 1,
    operations: [
      { workCenterId: wcA.id, plannedMinutes: 30 },
      { workCenterId: wcB.id, plannedMinutes: 30 },
    ],
  });
  service.releaseOrder(order.id);
  const started = service.startOrder(order.id);

  // Only the first operation starts; the second stays pending.
  const [opA, opB] = started.operations;
  assert.equal(opA.status, 'IN_PROGRESS');
  assert.equal(opB.status, 'PENDING');

  // Sequence is enforced: op B cannot start before op A completes.
  assert.throws(() => service.startOperation(opB.id), /السابقة/);

  service.completeOperation(opA.id, 25);
  // Completing A auto-starts B.
  const after = service.getProductionOrder(order.id);
  const statuses = after.operations.map((op) => op.status);
  assert.deepEqual(statuses, ['COMPLETED', 'IN_PROGRESS']);

  service.completeOperation(opB.id, 20);
  const done = service.getProductionOrder(order.id);
  assert.deepEqual(done.operations.map((op) => op.status), ['COMPLETED', 'COMPLETED']);
});

test('release reserves stock and cancel releases reservations', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const product = createProduct('Reserved good');
  const component = createProduct('Reserved component');
  const bom = service.createBom({
    productId: product,
    name: 'Reserved BOM',
    items: [{ componentProductId: component, quantity: 5 }],
  });
  service.activateBom(bom.id);

  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_mfgr_component', 'wh_main', ?, 8)`,
    [component]
  );
  const orderA = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 1 }); // needs 5
  const orderB = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 1 }); // needs 5

  service.releaseOrder(orderA.id);
  const reserved = db.query<{ reservedM2: number }>(
    `SELECT reserved_m2 AS reservedM2 FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
    [component]
  )[0];
  assert.equal(Number(reserved.reservedM2), 5);
  assert.equal(Number(service.getProductionOrder(orderA.id).materials[0].reservedQty), 5);

  // Only 3 units of ATP remain for order B.
  service.releaseOrder(orderB.id);
  const materialB = service.getProductionOrder(orderB.id).materials[0];
  assert.equal(Number(materialB.reservedQty), 3);

  // Cancelling A returns its reservation to the pool.
  service.cancelOrder(orderA.id);
  const afterCancel = db.query<{ reservedM2: number }>(
    `SELECT reserved_m2 AS reservedM2 FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
    [component]
  )[0];
  assert.equal(Number(afterCancel.reservedM2), 3);
});

test('downtime records are stored and counted in capacity', async () => {
  await boot();
  const service = new ManufacturingService();
  const wc = service.createWorkCenter({ code: 'WC-DT', name: 'Downtime line', capacityPerDay: 8 });

  const record = service.recordDowntime({ workCenterId: wc.id, minutes: 45, reason: 'عطل موتور' });
  assert.equal(record.minutes, 45);
  assert.equal(record.workCenterId, wc.id);

  const list = service.getDowntimeRecords({ workCenterId: wc.id });
  assert.equal(list.length, 1);

  const plan = service.getCapacityPlan().find((row) => row.workCenterId === wc.id);
  assert.ok(plan);
  assert.equal(plan.downtimeMinutes, 45);
});

test('MRP plan nets uncovered sales demand against available stock', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const product = createProduct('MRP good');
  const component = createProduct('MRP component');
  const bom = service.createBom({
    productId: product,
    name: 'MRP BOM',
    items: [{ componentProductId: component, quantity: 2 }],
  });
  service.activateBom(bom.id);

  db.run(
    `INSERT OR REPLACE INTO customers (id, code, name, phone) VALUES ('cus_mrp', 'CUS-MRP', 'MRP Customer', '0500000001')`
  );
  db.run(
    `INSERT OR REPLACE INTO orders (id, order_number, date, customer_id, branch_id, warehouse_id, status, created_by)
     VALUES ('ord_mrp', 'SO-MRP-1', '2026-02-01', 'cus_mrp', 'br_main', 'wh_main', 'CONFIRMED', 'usr_mfg_admin')`
  );
  db.run(
    `INSERT OR REPLACE INTO order_items (id, order_id, product_id, product_name, grade, quantity_m2, unit_price, total_price)
     VALUES ('oi_mrp', 'ord_mrp', ?, 'MRP good', 'A', 5, 0, 0)`,
    [product]
  );
  // 4 units on hand; demand needs 10 → net purchase suggestion of 6.
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_mrpm_component', 'wh_main', ?, 4)`,
    [component]
  );

  const plan = service.getMrpPlan();
  assert.equal(plan.plannedProduction.length, 1);
  assert.equal(plan.plannedProduction[0].orderItemId, 'oi_mrp');
  assert.equal(plan.plannedProduction[0].neededBy, '2026-02-01');
  assert.equal(plan.materialNeeds.length, 1);
  assert.equal(plan.materialNeeds[0].componentProductId, component);
  assert.equal(plan.materialNeeds[0].suggestedQty, 6);

  // Converting the plan creates the production order and empties the candidate.
  const created = service.createProductionOrdersFromMrp({ priority: 'HIGH' });
  assert.equal(created.length, 1);
  assert.equal(service.getMrpPlan().plannedProduction.length, 0);
});

test('production order approval workflow gates release', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct('Approval good');
  const component = createProduct('Approval component');
  const bom = service.createBom({
    productId: product,
    name: 'Approval BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);

  // requiresApproval → order starts as PENDING approval and cannot release.
  const order = service.createProductionOrder({
    productId: product, bomId: bom.id, quantity: 2, requiresApproval: true,
  });
  assert.equal(order.approvalStatus, 'PENDING');
  assert.throws(() => service.releaseOrder(order.id), /بانتظار الاعتماد/);

  // Manager (different from creator admin) approves the pending request.
  asManager();
  const approved = service.approveProductionOrder(order.id);
  assert.equal(approved.approvalStatus, 'APPROVED');
  assert.ok(approved.approvedBy);
  asAdmin();

  const released = service.releaseOrder(order.id);
  assert.equal(released.status, 'RELEASED');
});

test('rejected orders must be re-approved before release', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct('Reject good');
  const component = createProduct('Reject component');
  const bom = service.createBom({
    productId: product,
    name: 'Reject BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);

  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 1 });
  assert.equal(order.approvalStatus, 'NONE');
  service.requestOrderApproval(order.id);

  asManager();
  const rejected = service.rejectProductionOrder(order.id, 'كمية غير منطقية');
  assert.equal(rejected.approvalStatus, 'REJECTED');
  assert.equal(rejected.rejectionReason, 'كمية غير منطقية');
  assert.throws(() => service.releaseOrder(order.id), /مرفوض/);

  // Re-request then approve by manager, then release as admin.
  service.requestOrderApproval(order.id);
  service.approveProductionOrder(order.id);
  asAdmin();
  assert.equal(service.releaseOrder(order.id).status, 'RELEASED');
});

test('operation operator assignment and production batch traceability', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const product = createProduct('Traceable good');
  const component = createProduct('Traceable component');
  const wc = service.createWorkCenter({ code: 'WC-TR', name: 'Trace line' });
  const bom = service.createBom({
    productId: product,
    name: 'Trace BOM',
    items: [{ componentProductId: component, quantity: 1 }],
    operations: [{ workCenterId: wc.id, minutesPerUnit: 10 }],
  });
  service.activateBom(bom.id);

  db.run(`INSERT OR REPLACE INTO employees (id, code, full_name, phone, job_title, hired_at, status) VALUES ('emp_op1', 'EMP-OP1', 'Operator One', '0500000002', 'Operator', '2026-01-01', 'ACTIVE')`);
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_mfgt_component', 'wh_main', ?, 10)`,
    [component]
  );
  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 2 });
  service.releaseOrder(order.id);
  service.startOrder(order.id);

  const op = service.getProductionOrder(order.id).operations[0];
  const assigned = service.setOperationOperator(op.id, 'emp_op1');
  assert.equal(assigned.operatorId, 'emp_op1');
  assert.equal(assigned.operatorName, 'Operator One');
  assert.throws(() => service.setOperationOperator(op.id, 'emp_missing'), /غير موجود/);

  service.completeOperation(op.id, 15);
  service.completeOrder(order.id);

  const batch = db.query<{ batchNumber: string; productionOrderId: string; quantityRemainingM2: number }>(
    `SELECT batch_number AS batchNumber, production_order_id AS productionOrderId, quantity_remaining_m2 AS quantityRemainingM2
     FROM product_batches WHERE production_order_id = ?`,
    [order.id]
  )[0];
  assert.ok(batch, 'production receipt should create a batch');
  assert.equal(batch.productionOrderId, order.id);
  assert.equal(Number(batch.quantityRemainingM2), 2);
  assert.ok(batch.batchNumber.includes(order.orderNumber));
});

test('MRP material needs carry lead-time-aware order-by dates and create purchase requests', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const product = createProduct('MRP lead good');
  const component = createProduct('MRP lead component');
  db.run(`UPDATE products SET lead_time_days = 10 WHERE id = ?`, [component]);
  const bom = service.createBom({
    productId: product,
    name: 'MRP lead BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);

  db.run(`INSERT OR REPLACE INTO customers (id, code, name, phone) VALUES ('cus_mrpled', 'CUS-MRPLEAD', 'Lead Customer', '0500000003')`);
  db.run(
    `INSERT OR REPLACE INTO orders (id, order_number, date, customer_id, branch_id, warehouse_id, status, created_by)
     VALUES ('ord_mrpled', 'SO-MRPLEAD-1', '2026-03-10', 'cus_mrpled', 'br_main', 'wh_main', 'CONFIRMED', 'usr_mfg_admin')`
  );
  db.run(
    `INSERT OR REPLACE INTO order_items (id, order_id, product_id, product_name, grade, quantity_m2, unit_price, total_price)
     VALUES ('oi_mrpled', 'ord_mrpled', ?, 'MRP lead good', 'A', 3, 0, 0)`,
    [product]
  );

  const plan = service.getMrpPlan();
  const need = plan.materialNeeds.find((row) => row.componentProductId === component);
  assert.ok(need, 'expected a material need for the component');
  assert.equal(need.leadTimeDays, 10);
  assert.equal(need.neededBy, '2026-03-10');
  assert.equal(need.orderByDate, '2026-02-28');

  const created = service.createPurchaseRequestsFromMrp({ priority: 'HIGH' });
  assert.equal(created.length, 1);
  assert.ok(created[0].requestNumber);
  const pr = db.query<{ neededBy: string | null }>(
    `SELECT needed_by AS neededBy FROM purchase_requests WHERE id = ?`,
    [created[0].requestId]
  )[0];
  assert.equal(pr?.neededBy, '2026-02-28');
});

test('REWORK disposition pulls stock back and spawns a linked rework order', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const product = createProduct('Rework good');
  const component = createProduct('Rework component');
  const bom = service.createBom({
    productId: product,
    name: 'Rework BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_rework_component', 'wh_main', ?, 20)`,
    [component]
  );

  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 2 });
  service.releaseOrder(order.id);
  service.startOrder(order.id);
  service.completeOrder(order.id);
  assert.equal(service.getProductionOrder(order.id).status, 'COMPLETED');
  const stockOf = () => Number(db.query<{ qty: number }>(
    `SELECT quantity_m2 AS qty FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
    [product]
  )[0]?.qty || 0);
  assert.equal(stockOf(), 2);

  const check = service.createQualityCheck({
    productionOrderId: order.id,
    inspectionType: 'FINAL',
    result: 'FAIL',
    quantityInspected: 2,
    quantityAccepted: 1,
    quantityRejected: 1,
  });
  service.recordQualityDisposition(check.id, 'REWORK', 1);

  // Source order keeps its produced quantity and stays COMPLETED.
  const source = service.getProductionOrder(order.id);
  assert.equal(source.status, 'COMPLETED');
  assert.equal(Number((source as any).producedQty), 2);
  assert.equal(stockOf(), 1, 'reworked unit should leave finished-goods stock');

  // A linked rework order carries the rejected quantity.
  const reworks = service.getReworkOrders(order.id);
  assert.equal(reworks.length, 1);
  assert.equal(reworks[0].quantity, 1);
  assert.equal(reworks[0].status, 'PLANNED');
  assert.equal(reworks[0].reworkOfOrderId, order.id);
  assert.equal(reworks[0].sourceQualityCheckId, check.id);

  service.releaseOrder(reworks[0].id);
  service.startOrder(reworks[0].id);
  service.completeOrder(reworks[0].id);
  assert.equal(stockOf(), 2);
});

test('quality AQL fields and defect codes are stored on checks', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct('AQL good');
  const component = createProduct('AQL component');
  const bom = service.createBom({
    productId: product,
    name: 'AQL BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);

  const defect = service.createDefectCode({ code: 'DS-CRK', name: 'تشقق السطح' });
  assert.ok(service.getDefectCodes().some((row) => row.id === defect.id));

  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 1 });
  const check = service.createQualityCheck({
    productionOrderId: order.id,
    inspectionType: 'FINAL',
    result: 'CONDITIONAL',
    quantityInspected: 32,
    quantityAccepted: 31,
    quantityRejected: 1,
    sampleSize: 32,
    acceptNumber: 1,
    rejectNumber: 2,
    defects: [{ defectCodeId: defect.id, quantity: 1 }],
  });
  const loaded = service.getQualityCheck(check.id);
  assert.equal(loaded.sampleSize, 32);
  assert.equal(loaded.acceptNumber, 1);
  assert.equal(loaded.rejectNumber, 2);
  assert.equal(loaded.defects.length, 1);
  assert.equal(loaded.defects[0].defectCode, 'DS-CRK');
  assert.equal(loaded.defects[0].quantity, 1);
});

test('completing maintenance with a cost posts a ledger entry', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const record = service.createMaintenance({
    equipmentName: 'Press line 1',
    maintenanceType: 'CORRECTIVE',
    scheduledDate: '2026-02-01',
  });
  service.updateMaintenance(record.id, { status: 'COMPLETED', cost: 750 });

  const entry = db.query<{ id: string }>(
    `SELECT id FROM journal_entries WHERE reference_type = 'MAINTENANCE' AND reference_id = ?`,
    [record.id]
  )[0];
  assert.ok(entry, 'maintenance completion should post a ledger entry');
  const lines = db.query<{ accountCode: string; debit: number; credit: number }>(
    `SELECT a.code AS accountCode, jl.debit, jl.credit
     FROM journal_entry_lines jl JOIN chart_of_accounts a ON a.id = jl.account_id
     WHERE jl.entry_id = ?`,
    [entry.id]
  );
  // Ledger money columns are stored as INTEGER piastres (×100).
  assert.ok(lines.some((line) => line.accountCode === '5204' && Number(line.debit) === 75000));
  assert.ok(lines.some((line) => line.accountCode === '2104' && Number(line.credit) === 75000));
});

test('OEE analytics and operator labor summary reflect recorded production', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const product = createProduct('OEE good');
  const component = createProduct('OEE component');
  const wc = service.createWorkCenter({ code: 'WC-OEE', name: 'OEE line' });
  const bom = service.createBom({
    productId: product,
    name: 'OEE BOM',
    items: [{ componentProductId: component, quantity: 1 }],
    operations: [{ workCenterId: wc.id, minutesPerUnit: 10 }],
  });
  service.activateBom(bom.id);
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_oee_component', 'wh_main', ?, 10)`,
    [component]
  );
  db.run(`INSERT OR REPLACE INTO employees (id, code, full_name, phone, job_title, hired_at, status) VALUES ('emp_oee', 'EMP-OEE', 'OEE Operator', '0500000004', 'Operator', '2026-01-01', 'ACTIVE')`);

  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 1 });
  service.releaseOrder(order.id);
  service.startOrder(order.id);
  const op = service.getProductionOrder(order.id).operations[0];
  service.setOperationOperator(op.id, 'emp_oee');
  service.completeOperation(op.id, 12);
  service.completeOrder(order.id);
  service.createQualityCheck({
    productionOrderId: order.id, inspectionType: 'FINAL', result: 'PASS',
    quantityInspected: 1, quantityAccepted: 1, quantityRejected: 0,
  });

  const oee = service.getOeeAnalytics();
  const row = oee.centers.find((center) => center.workCenterId === wc.id);
  assert.ok(row, 'expected an OEE row for the work center');
  assert.ok(row.plannedMinutes > 0);
  assert.ok(row.actualMinutes > 0);
  assert.ok(row.availabilityPercent !== null);
  assert.ok(row.performancePercent !== null);
  assert.ok(row.qualityPercent === 100);
  assert.ok(row.oeePercent !== null && row.oeePercent > 0);

  const labor = service.getOperatorLaborSummary();
  const operator = labor.find((entry) => entry.operatorId === 'emp_oee');
  assert.ok(operator, 'expected operator labor row');
  assert.equal(operator.actualMinutes, 12);
  assert.equal(operator.varianceMinutes, 12 - operator.attendanceMinutes);
});

test('production schedule respects operations shift calendar', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const product = createProduct('Shift good');
  const component = createProduct('Shift component');
  const wc = service.createWorkCenter({ code: 'WC-SHIFT', name: 'Shift line', capacityPerDay: 8 });
  const bom = service.createBom({
    productId: product,
    name: 'Shift BOM',
    items: [{ componentProductId: component, quantity: 1 }],
    operations: [{ workCenterId: wc.id, minutesPerUnit: 10 }],
  });
  service.activateBom(bom.id);
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_shift_component', 'wh_main', ?, 100)`,
    [component]
  );
  // One-hour daily shift, every weekday → 60 effective minutes/day.
  db.run(
    `INSERT OR REPLACE INTO attendance_shifts
       (id, branch_id, name, start_time, end_time, break_minutes, workdays_json, is_active, is_operations, created_by)
     VALUES ('shift_mfg_test', 'br_main', 'OneHour', '08:00', '09:00', 0, '[0,1,2,3,4,5,6]', 1, 1, 'usr_mfg_admin')`
  );

  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 20 });
  service.releaseOrder(order.id);

  const row = service.getProductionSchedule().find((r) => r.orderId === order.id);
  assert.ok(row, 'expected a scheduled operation row');
  // 200 planned minutes at 60 min/day must span multiple days.
  assert.ok(row.estimatedFinishDate > row.estimatedStartDate,
    `expected multi-day schedule with 60min/day shift, got ${row.estimatedStartDate} → ${row.estimatedFinishDate}`);
});

test('preventive maintenance completion auto-schedules the next occurrence', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const record = service.createMaintenance({
    equipmentName: 'Kiln 2',
    maintenanceType: 'PREVENTIVE',
    scheduledDate: '2026-03-01',
    recurrenceIntervalDays: 30,
  });
  service.updateMaintenance(record.id, { status: 'COMPLETED', cost: 100 });

  const next = db.query<{ scheduledDate: string; status: string; recurrenceIntervalDays: number }>(
    `SELECT scheduled_date AS scheduledDate, status, recurrence_interval_days AS recurrenceIntervalDays
     FROM manufacturing_maintenance
     WHERE equipment_name = 'Kiln 2' AND status = 'SCHEDULED' AND id != ?`,
    [record.id]
  )[0];
  assert.ok(next, 'expected an auto-generated next preventive record');
  assert.equal(next.status, 'SCHEDULED');
  assert.equal(next.recurrenceIntervalDays, 30);
  const expected = new Date();
  expected.setUTCDate(expected.getUTCDate() + 30);
  assert.equal(next.scheduledDate, expected.toISOString().slice(0, 10));
});

test('operation completion logs per-operator labor minutes by work date', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();
  const product = createProduct('Labor good');
  const component = createProduct('Labor component');
  const wc = service.createWorkCenter({ code: 'WC-LAB', name: 'Labor line' });
  const bom = service.createBom({
    productId: product,
    name: 'Labor BOM',
    items: [{ componentProductId: component, quantity: 1 }],
    operations: [{ workCenterId: wc.id, minutesPerUnit: 10 }],
  });
  service.activateBom(bom.id);
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_labor_component', 'wh_main', ?, 10)`,
    [component]
  );
  db.run(`INSERT OR REPLACE INTO employees (id, code, full_name, phone, job_title, hired_at, status) VALUES ('emp_lab', 'EMP-LAB', 'Labor Operator', '0500000005', 'Operator', '2026-01-01', 'ACTIVE')`);

  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 1 });
  service.releaseOrder(order.id);
  service.startOrder(order.id);
  const op = service.getProductionOrder(order.id).operations[0];
  service.setOperationOperator(op.id, 'emp_lab');
  service.completeOperation(op.id, 45);

  const labor = db.query<{ minutes: number; workDate: string }>(
    `SELECT minutes, work_date AS workDate FROM production_operation_labor WHERE operation_id = ?`,
    [op.id]
  )[0];
  assert.ok(labor, 'expected a labor log row');
  assert.equal(labor.minutes, 45);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(labor.workDate));

  const summary = service.getOperatorLaborSummary().find((row) => row.operatorId === 'emp_lab');
  assert.equal(summary?.loggedMinutes, 45);

  // Daily reconciliation joins the labor log to the HR attendance punch.
  const today = new Date().toISOString().slice(0, 10);
  db.run(
    `INSERT OR REPLACE INTO attendance (id, employee_id, date, status, worked_minutes, check_in_at, check_out_at)
     VALUES ('att_lab_1', 'emp_lab', ?, 'PRESENT', 480, ?, ?)`,
    [today, `${today}T08:00:00`, `${today}T16:00:00`]
  );
  const daily = service.getOperatorLaborDaily().find((row) => row.operatorId === 'emp_lab');
  assert.ok(daily, 'expected a daily labor row');
  assert.equal(daily.workDate, today);
  assert.equal(daily.operationMinutes, 45);
  assert.equal(daily.attendanceMinutes, 480);
  assert.ok(daily.checkInAt);
});

test('what-if schedule simulation excludes orders and scales minutes without persisting', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct('WhatIf good');
  const component = createProduct('WhatIf component');
  const wc = service.createWorkCenter({ code: 'WC-WIF', name: 'WhatIf line', capacityPerDay: 8 });
  const bom = service.createBom({
    productId: product,
    name: 'WhatIf BOM',
    items: [{ componentProductId: component, quantity: 1 }],
    operations: [{ workCenterId: wc.id, minutesPerUnit: 60 }],
  });
  service.activateBom(bom.id);
  const db = DatabaseManager.getInstance();
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_wif_component', 'wh_main', ?, 10)`,
    [component]
  );

  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 1 });
  service.releaseOrder(order.id);

  const baseline = service.getProductionSchedule().find((row) => row.orderId === order.id);
  assert.ok(baseline);

  const excluded = service.getProductionSchedule({ excludeOrderIds: [order.id] });
  assert.ok(!excluded.some((row) => row.orderId === order.id), 'excluded order should not be scheduled');

  const scaled = service.getProductionSchedule({ minutesScale: 2 });
  const scaledRow = scaled.find((row) => row.orderId === order.id);
  assert.ok(scaledRow);
  assert.ok(
    scaledRow.finishOffsetMinutes > baseline.finishOffsetMinutes,
    'scaled minutes should push the finish offset out'
  );

  // Nothing persisted: the operation is still pending with its original plan.
  const op = service.getProductionOrder(order.id).operations[0];
  assert.equal(op.status, 'PENDING');
  assert.equal(op.plannedMinutes, 60);
});

test('updateProductionOrder edits scheduling fields on planned orders only', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct('Edit target');
  const component = createProduct('Edit component');
  const bom = service.createBom({ productId: product, name: 'Edit BOM', items: [{ componentProductId: component, quantity: 1 }] });
  service.activateBom(bom.id);
  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 2, priority: 'LOW' });

  const updated = service.updateProductionOrder(order.id, {
    priority: 'URGENT',
    startDate: '2026-01-10',
    dueDate: '2026-02-01',
    notes: 'أولوية للموسم',
  });
  assert.equal(updated.priority, 'URGENT');
  assert.equal(updated.startDate, '2026-01-10');
  assert.equal(updated.dueDate, '2026-02-01');
  assert.equal(updated.notes, 'أولوية للموسم');

  assert.throws(() => service.updateProductionOrder(order.id, { dueDate: '2026-01-01' }), /الاستحقاق/);
  service.releaseOrder(order.id);
  assert.throws(() => service.updateProductionOrder(order.id, { priority: 'HIGH' }), /مخطط/);
});

test('updateBom replaces draft components but protects active revisions', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct('Bom edit product');
  const compA = createProduct('Component A');
  const compB = createProduct('Component B');

  const bom = service.createBom({
    productId: product,
    name: 'Bom v1',
    items: [{ componentProductId: compA, quantity: 2 }],
  });
  const edited = service.updateBom(bom.id, {
    name: 'Bom v1.1',
    version: '1.1',
    items: [{ componentProductId: compB, quantity: 3, unit: 'PIECE' }],
  });
  assert.equal(edited.name, 'Bom v1.1');
  assert.equal(edited.items.length, 1);
  assert.equal(edited.items[0].componentProductId, compB);
  assert.equal(Number(edited.items[0].quantity), 3);

  assert.throws(() => service.updateBom(bom.id, { items: [] }), /مكوّن/);

  service.activateBom(bom.id);
  assert.throws(() => service.updateBom(bom.id, { name: 'hack' }), /مسودة/);
});

test('updateWorkCenter updates rates and deactivates safely', async () => {
  await boot();
  const service = new ManufacturingService();
  const wc = service.createWorkCenter({ code: 'WC-EDIT', name: 'Edit line', costPerHour: 50 });

  const updated = service.updateWorkCenter(wc.id, { name: 'Edited line', costPerHour: 75, overheadPerHour: 25 });
  assert.equal(updated.name, 'Edited line');
  assert.equal(updated.costPerHour, 75);
  assert.equal(updated.overheadPerHour, 25);

  const inactive = service.updateWorkCenter(wc.id, { isActive: false });
  assert.ok(!inactive.isActive);
  assert.ok(service.getWorkCenters().some((row) => row.id === wc.id && !row.isActive));
});
