import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { ProductService } from '../src/services/domains/products/ProductService.ts';
import { ManufacturingService } from '../src/services/domains/manufacturing/ManufacturingService.ts';
import { ModuleRegistryService } from '../src/services/domains/config/ModuleRegistryService.ts';
import type { User } from '../src/types/auth/identity.ts';

const admin: User = {
  id: 'usr_mfg_cost_admin',
  username: 'mfg-cost-admin',
  fullName: 'Manufacturing Cost Admin',
  role: 'ADMIN',
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
     VALUES ('usr_mfg_cost_admin', 'mfg-cost-admin', 'test', 'Manufacturing Cost Admin', 'ADMIN', 1)`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  if (!ModuleRegistryService.isModuleEnabled('manufacturing')) {
    ModuleRegistryService.activate('manufacturing', admin);
    AuthService.setCurrentUser(admin);
    PermissionService.invalidate(admin);
  }
  return db;
}

let productSequence = 0;

function createProduct(name: string): string {
  const sequence = ++productSequence;
  return new ProductService().createProduct({
    sku: `MFGC-SKU-${sequence}`,
    barcode: `MFGC-BAR-${sequence}`,
    name,
    categoryId: 'cat_floor',
    brandId: 'br_cleo',
  } as any).id;
}

function setCostPrice(productId: string, price: number): void {
  DatabaseManager.getInstance().run(
    `UPDATE products SET cost_price = ? WHERE id = ?`,
    [Math.round(price * 100), productId]
  );
}

test('production cost report values consumed materials and actual labor', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();

  const product = createProduct('Costed finished good');
  const component = createProduct('Costed component');
  setCostPrice(component, 10); // 10.00 per unit
  setCostPrice(product, 25);

  const bom = service.createBom({
    productId: product,
    name: 'Costed BOM',
    items: [{ componentProductId: component, quantity: 2 }],
  });
  service.activateBom(bom.id);

  const workCenter = service.createWorkCenter({ code: 'WC-COST', name: 'Cost line', costPerHour: 120, capacityPerDay: 8 });
  const order = service.createProductionOrder({
    productId: product,
    bomId: bom.id,
    quantity: 3,
    operations: [{ workCenterId: workCenter.id, plannedMinutes: 60 }],
  });

  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_mfgc_component', 'wh_main', ?, 10)`,
    [component]
  );

  service.releaseOrder(order.id);
  service.startOrder(order.id);
  service.completeOperation(order.operations[0].id, 30);
  service.completeOrder(order.id);

  const cost = service.getProductionOrderCost(order.id);
  // 6 units consumed × 10.00 = 60.00 material cost.
  assert.equal(cost.materialCost, 60);
  // 30 actual minutes × 120.00/hour = 60.00 labor cost.
  assert.equal(cost.laborCost, 60);
  assert.equal(cost.totalCost, 120);
  assert.equal(cost.costPerUnit, 40);

  const report = service.getProductionCostReport();
  const row = report.orders.find((entry) => entry.orderId === order.id);
  assert.ok(row);
  assert.equal(row.totalCost, 120);
  assert.ok(report.totalCost >= 120);
});

test('capacity plan reports planned load per work center', async () => {
  await boot();
  const service = new ManufacturingService();

  const product = createProduct('Capacity product');
  const component = createProduct('Capacity component');
  const bom = service.createBom({
    productId: product,
    name: 'Capacity BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);

  const workCenter = service.createWorkCenter({ code: 'WC-CAP', name: 'Capacity line', capacityPerDay: 8 });
  const otherCenter = service.createWorkCenter({ code: 'WC-CAP2', name: 'Idle line', capacityPerDay: 8 });

  service.createProductionOrder({
    productId: product,
    bomId: bom.id,
    quantity: 1,
    operations: [{ workCenterId: workCenter.id, plannedMinutes: 240 }],
  });
  service.createProductionOrder({
    productId: product,
    bomId: bom.id,
    quantity: 1,
    operations: [{ workCenterId: workCenter.id, plannedMinutes: 120 }],
  });

  const plan = service.getCapacityPlan();
  const loaded = plan.find((row) => row.workCenterId === workCenter.id);
  const idle = plan.find((row) => row.workCenterId === otherCenter.id);
  assert.ok(loaded);
  assert.equal(loaded.activeOrders, 2);
  assert.equal(loaded.plannedMinutes, 360);
  // 360 planned minutes vs 8h/day capacity → 75%.
  assert.equal(loaded.loadPercent, 75);
  assert.ok(idle);
  assert.equal(idle.activeOrders, 0);
  assert.equal(idle.plannedMinutes, 0);
});

test('sales order items become linked production orders once', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();

  const product = createProduct('Made-to-order good');
  const component = createProduct('MTO component');
  const bom = service.createBom({
    productId: product,
    name: 'MTO BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);

  db.run(
    `INSERT OR REPLACE INTO customers (id, code, name, phone) VALUES ('cus_mfgc', 'CUS-MFGC', 'MFG Customer', '0500000000')`
  );
  db.run(
    `INSERT OR REPLACE INTO orders (id, order_number, date, customer_id, branch_id, warehouse_id, status, created_by)
     VALUES ('ord_mfgc', 'SO-MFGC-1', '2026-01-01', 'cus_mfgc', 'br_main', 'wh_main', 'CONFIRMED', 'usr_mfg_cost_admin')`
  );
  db.run(
    `INSERT OR REPLACE INTO order_items (id, order_id, product_id, product_name, grade, quantity_m2, unit_price, total_price)
     VALUES ('oi_mfgc', 'ord_mfgc', ?, 'Made-to-order good', 'A', 5, 0, 0)`,
    [product]
  );

  const candidates = service.getSalesOrderProductionCandidates();
  const candidate = candidates.find((row) => row.orderItemId === 'oi_mfgc');
  assert.ok(candidate, 'sales item should appear as a production candidate');
  assert.equal(candidate.salesOrderNumber, 'SO-MFGC-1');
  assert.equal(candidate.customerName, 'MFG Customer');
  assert.equal(candidate.bomId, bom.id);

  const order = service.createProductionOrderFromSalesItem('oi_mfgc', { priority: 'HIGH' });
  assert.equal(order.status, 'PLANNED');
  assert.equal(order.salesOrderId, 'ord_mfgc');
  assert.equal(order.orderItemId, 'oi_mfgc');
  assert.equal(order.customerId, 'cus_mfgc');
  assert.equal(order.customerName, 'MFG Customer');
  assert.equal(order.salesOrderNumber, 'SO-MFGC-1');
  assert.equal(order.quantity, 5);

  // The item is now covered — it must leave the candidate list.
  const after = service.getSalesOrderProductionCandidates();
  assert.ok(!after.some((row) => row.orderItemId === 'oi_mfgc'));

  // A second production order for the same item is rejected.
  assert.throws(() => service.createProductionOrderFromSalesItem('oi_mfgc'), /مرتبط/);

  // Cancelling the linked order frees the item for a new production order.
  service.cancelOrder(order.id);
  const replacement = service.createProductionOrderFromSalesItem('oi_mfgc');
  assert.equal(replacement.status, 'PLANNED');
  assert.notEqual(replacement.id, order.id);
});

test('sales order status follows production progress', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();

  const product = createProduct('Synced good');
  const component = createProduct('Synced component');
  const bom = service.createBom({
    productId: product,
    name: 'Sync BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);

  db.run(
    `INSERT OR REPLACE INTO customers (id, code, name, phone) VALUES ('cus_mfgs', 'CUS-MFGS', 'Sync Customer', '0500000001')`
  );
  db.run(
    `INSERT OR REPLACE INTO orders (id, order_number, date, customer_id, branch_id, warehouse_id, status, created_by)
     VALUES ('ord_mfgs', 'SO-MFGS-1', '2026-01-01', 'cus_mfgs', 'br_main', 'wh_main', 'CONFIRMED', 'usr_mfg_cost_admin')`
  );
  db.run(
    `INSERT OR REPLACE INTO order_items (id, order_id, product_id, product_name, grade, quantity_m2, unit_price, total_price)
     VALUES ('oi_mfgs', 'ord_mfgs', ?, 'Synced good', 'A', 2, 0, 0)`,
    [product]
  );

  const readStatus = () => db.query<{ status: string }>(`SELECT status FROM orders WHERE id = 'ord_mfgs'`)[0].status;

  // Planning production moves the sales order to PROCESSING.
  const order = service.createProductionOrderFromSalesItem('oi_mfgs');
  assert.equal(readStatus(), 'PROCESSING');

  let progress = service.getSalesOrderProductionProgress('ord_mfgs');
  assert.equal(progress.totalItems, 1);
  assert.equal(progress.inProductionItems, 1);
  assert.equal(progress.allCompleted, false);

  // Complete production → sales order becomes READY.
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_mfgs_component', 'wh_main', ?, 10)`,
    [component]
  );
  service.releaseOrder(order.id);
  service.startOrder(order.id);
  service.completeOrder(order.id);

  assert.equal(readStatus(), 'READY');
  progress = service.getSalesOrderProductionProgress('ord_mfgs');
  assert.equal(progress.producedItems, 1);
  assert.equal(progress.allCompleted, true);
  assert.equal(progress.coveragePercent, 100);
});

test('quality scrap posts a write-off ledger entry and reduces stock', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();

  const product = createProduct('Scrap good');
  const component = createProduct('Scrap component');
  setCostPrice(product, 40);
  const bom = service.createBom({
    productId: product,
    name: 'Scrap BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);

  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 4 });
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_mfgscrap_component', 'wh_main', ?, 10)`,
    [component]
  );
  service.releaseOrder(order.id);
  service.startOrder(order.id);
  service.completeOrder(order.id);

  const stockBefore = db.query<{ quantityM2: number }>(
    `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
    [product]
  )[0];
  assert.equal(Number(stockBefore.quantityM2), 4);

  const check = service.createQualityCheck({
    productionOrderId: order.id,
    inspectionType: 'FINAL',
    result: 'FAIL',
    quantityInspected: 4,
    quantityRejected: 1,
  });
  service.recordQualityDisposition(check.id, 'SCRAP', 1);

  const stockAfter = db.query<{ quantityM2: number }>(
    `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
    [product]
  )[0];
  assert.equal(Number(stockAfter.quantityM2), 3);

  const entries = db.query<{ id: string }>(
    `SELECT id FROM journal_entries WHERE reference_type = 'QUALITY_SCRAP' AND reference_id = ?`,
    [check.id]
  );
  assert.equal(entries.length, 1, 'scrap value must post a journal entry');
  const lines = db.query<{ accountCode: string; debit: number; credit: number }>(
    `SELECT coa.code AS accountCode, jel.debit, jel.credit
     FROM journal_entry_lines jel
     JOIN chart_of_accounts coa ON coa.id = jel.account_id
     WHERE jel.entry_id = ?`,
    [entries[0].id]
  );
  const damage = lines.find((line) => line.accountCode === '5201');
  const inventory = lines.find((line) => line.accountCode === '1104');
  assert.ok(damage && Number(damage.debit) === 4000, 'Dr 5201 damage loss = qty × cost (piastres)');
  assert.ok(inventory && Number(inventory.credit) === 4000, 'Cr 1104 inventory = qty × cost (piastres)');
});

test('manufacturing analytics report efficiency, variance and monthly output', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();

  const product = createProduct('Analytics good');
  const component = createProduct('Analytics component');
  const bom = service.createBom({
    productId: product,
    name: 'Analytics BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);

  const workCenter = service.createWorkCenter({ code: 'WC-AN', name: 'Analytics line' });
  const order = service.createProductionOrder({
    productId: product,
    bomId: bom.id,
    quantity: 2,
    operations: [{ workCenterId: workCenter.id, plannedMinutes: 100 }],
  });
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_mfgan_component', 'wh_main', ?, 10)`,
    [component]
  );
  service.releaseOrder(order.id);
  service.startOrder(order.id);
  service.completeOperation(order.operations[0].id, 50);
  service.completeOrder(order.id);

  const analytics = service.getManufacturingAnalytics();
  const wc = analytics.workCenterEfficiency.find((row) => row.workCenterId === workCenter.id);
  assert.ok(wc);
  assert.equal(wc.plannedMinutes, 100);
  assert.equal(wc.actualMinutes, 50);
  assert.equal(wc.efficiencyPercent, 200);

  const variance = analytics.orderVariance.find((row) => row.orderId === order.id);
  assert.ok(variance);
  assert.equal(variance.plannedMinutes, 100);
  assert.equal(variance.actualMinutes, 50);
  assert.equal(variance.variancePercent, 100);

  const month = new Date().toISOString().slice(0, 7);
  const monthly = analytics.monthlyOutput.find((row) => row.month === month);
  assert.ok(monthly, 'completed order should appear in monthly output');
  assert.ok(monthly.orders >= 1);
  assert.ok(monthly.quantity >= 2);
});
