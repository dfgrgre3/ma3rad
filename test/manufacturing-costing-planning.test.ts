import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { ProductService } from '../src/services/domains/products/ProductService.ts';
import { ManufacturingService } from '../src/services/domains/manufacturing/ManufacturingService.ts';
import { ModuleRegistryService } from '../src/services/domains/config/ModuleRegistryService.ts';
import { localDateString } from '../src/utils/shared/date.ts';
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

test('maintenance alerts separate overdue from upcoming preventive schedules', async () => {
  await boot();
  const service = new ManufacturingService();

  const today = localDateString();
  const iso = (offsetDays: number) => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  service.createMaintenance({ equipmentName: 'Overdue press', maintenanceType: 'PREVENTIVE', scheduledDate: iso(-2) });
  service.createMaintenance({ equipmentName: 'Upcoming kiln', maintenanceType: 'PREVENTIVE', scheduledDate: iso(3) });
  service.createMaintenance({ equipmentName: 'Far future mixer', maintenanceType: 'PREVENTIVE', scheduledDate: iso(30) });
  service.createMaintenance({ equipmentName: 'Corrective job', maintenanceType: 'CORRECTIVE', scheduledDate: iso(-5) });

  const alerts = service.getMaintenanceAlerts(7);
  assert.ok(alerts.overdue.some((row) => row.equipmentName === 'Overdue press'));
  assert.ok(!alerts.overdue.some((row) => row.equipmentName === 'Corrective job'), 'corrective jobs are not preventive alerts');
  assert.ok(alerts.dueSoon.some((row) => row.equipmentName === 'Upcoming kiln'));
  assert.ok(!alerts.dueSoon.some((row) => row.equipmentName === 'Far future mixer'));
  assert.ok(!alerts.dueSoon.some((row) => row.equipmentName === 'Overdue press'));
});

test('BOM estimated cost rolls up component prices', async () => {
  await boot();
  const service = new ManufacturingService();

  const product = createProduct('Estimated good');
  const componentA = createProduct('Estimate component A');
  const componentB = createProduct('Estimate component B');
  setCostPrice(componentA, 10);
  setCostPrice(componentB, 5);

  const bom = service.createBom({
    productId: product,
    name: 'Estimated BOM',
    items: [
      { componentProductId: componentA, quantity: 2 },
      { componentProductId: componentB, quantity: 4 },
    ],
  });

  const listed = service.getBoms().find((row) => row.id === bom.id);
  assert.ok(listed);
  assert.equal(listed.estimatedCost, 40); // 2×10 + 4×5

  const detail = service.getBomCostEstimate(bom.id);
  assert.equal(detail.totalCost, 40);
  assert.equal(detail.items.length, 2);
  assert.equal(detail.items.find((item) => item.componentProductId === componentA)?.lineCost, 20);
});

test('material shortages report remaining need vs available stock', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();

  const product = createProduct('Shortage good');
  const component = createProduct('Shortage component');
  const bom = service.createBom({
    productId: product,
    name: 'Shortage BOM',
    items: [{ componentProductId: component, quantity: 3 }],
  });
  service.activateBom(bom.id);

  // Order for 4 units → needs 12 components; no stock yet.
  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 4 });
  let shortages = service.getMaterialShortages();
  let row = shortages.find((entry) => entry.orderId === order.id);
  assert.ok(row, 'uncovered material need should appear as shortage');
  assert.equal(row.requiredQty, 12);
  assert.equal(row.availableQty, 0);
  assert.equal(row.deficitQty, 12);

  // Partial stock reduces but does not clear the deficit.
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_mfgshort_component', 'wh_main', ?, 5)`,
    [component]
  );
  shortages = service.getMaterialShortages();
  row = shortages.find((entry) => entry.orderId === order.id);
  assert.equal(row?.availableQty, 5);
  assert.equal(row?.deficitQty, 7);

  // Consuming materials shrinks the remaining requirement.
  service.releaseOrder(order.id);
  service.startOrder(order.id);
  service.consumeMaterial(order.materials[0].id, 4);
  shortages = service.getMaterialShortages();
  row = shortages.find((entry) => entry.orderId === order.id);
  assert.equal(row?.requiredQty, 8);
  assert.equal(row?.deficitQty, 3);

  // Completing the order removes it from the shortage list entirely.
  db.run(
    `UPDATE warehouse_stock SET quantity_m2 = 20 WHERE warehouse_id = 'wh_main' AND product_id = ?`,
    [component]
  );
  service.completeOrder(order.id);
  assert.ok(!service.getMaterialShortages().some((entry) => entry.orderId === order.id));
});

test('production floor reports live order progress', async () => {
  await boot();
  const service = new ManufacturingService();

  const product = createProduct('Floor good');
  const component = createProduct('Floor component');
  const wc = service.createWorkCenter({ code: 'WC-FLOOR', name: 'Floor WC', capacityPerDay: 8 });
  const bom = service.createBom({
    productId: product,
    name: 'Floor BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);

  const order = service.createProductionOrder({
    productId: product,
    bomId: bom.id,
    quantity: 5,
    operations: [{ workCenterId: wc.id, plannedMinutes: 60 }],
  });
  assert.equal(service.getProductionFloor().some((row) => row.orderId === order.id), false);

  service.releaseOrder(order.id);
  let floor = service.getProductionFloor().find((row) => row.orderId === order.id);
  assert.ok(floor);
  assert.equal(floor.status, 'RELEASED');
  assert.equal(floor.opsTotal, 1);
  assert.equal(floor.opsCompleted, 0);

  service.startOrder(order.id);
  floor = service.getProductionFloor().find((row) => row.orderId === order.id);
  assert.ok(floor);
  assert.equal(floor.status, 'IN_PROGRESS');
  assert.equal(floor.currentOperation?.workCenterName, 'Floor WC');
  assert.equal(floor.opsInProgress, 1);
});

test('BOM stock alerts flag critical components of active BOMs', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();

  const product = createProduct('Alert good');
  const critical = createProduct('Alert critical');
  const healthy = createProduct('Alert healthy');
  db.run(`UPDATE products SET reorder_point = 10 WHERE id = ?`, [critical]);

  const bom = service.createBom({
    productId: product,
    name: 'Alert BOM',
    items: [
      { componentProductId: critical, quantity: 1 },
      { componentProductId: healthy, quantity: 1 },
    ],
  });
  service.activateBom(bom.id);

  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_alert_critical', 'wh_main', ?, 3),
            ('ws_alert_healthy', 'wh_main', ?, 50)`,
    [critical, healthy]
  );

  let alerts = service.getBomStockAlerts();
  let alert = alerts.find((row) => row.componentProductId === critical);
  assert.ok(alert, 'component below reorder point should alert');
  assert.equal(alert.severity, 'LOW');
  assert.equal(alert.availableQty, 3);
  assert.equal(alert.reorderPoint, 10);
  assert.equal(alert.usedBy[0].bomId, bom.id);
  assert.ok(!alerts.some((row) => row.componentProductId === healthy), 'healthy stock should not alert');

  // Depleting stock escalates to OUT.
  db.run(`UPDATE warehouse_stock SET quantity_m2 = 0 WHERE product_id = ?`, [critical]);
  alerts = service.getBomStockAlerts();
  alert = alerts.find((row) => row.componentProductId === critical);
  assert.equal(alert?.severity, 'OUT');
});

test('purchase suggestions aggregate shortages and create purchase requests', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  const service = new ManufacturingService();

  const product = createProduct('PR good');
  const component = createProduct('PR component');
  setCostPrice(component, 7);
  const bom = service.createBom({
    productId: product,
    name: 'PR BOM',
    items: [{ componentProductId: component, quantity: 2 }],
  });
  service.activateBom(bom.id);

  // Two orders → total need 2×(3+3)=12, stock 4 → deficit 8.
  service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 3 });
  service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 3 });
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_mfgpr_component', 'wh_main', ?, 4)`,
    [component]
  );

  const suggestions = service.getPurchaseSuggestions();
  const suggestion = suggestions.find((row) => row.componentProductId === component && row.warehouseId === 'wh_main');
  assert.ok(suggestion, 'aggregated shortage should produce a purchase suggestion');
  assert.equal(suggestion.totalRequiredQty, 12);
  assert.equal(suggestion.availableQty, 4);
  assert.equal(suggestion.suggestedQty, 8);
  assert.equal(suggestion.unitCost, 7);
  assert.equal(suggestion.estimatedValue, 56);
  assert.equal(suggestion.affectedOrders, 2);

  const created = service.createPurchaseRequestsFromShortages();
  assert.ok(created.length >= 1);

  // The request for our component exists with the aggregated deficit quantity.
  const item = db.query<{ requestId: string; quantityM2: number; productId: string }>(
    `SELECT pri.request_id AS requestId, pri.quantity_m2 AS quantityM2, pri.product_id AS productId
     FROM purchase_request_items pri
     JOIN purchase_requests pr ON pr.id = pri.request_id
     WHERE pri.product_id = ?`,
    [component]
  )[0];
  assert.ok(item, 'purchase request item should exist for the shortage component');
  assert.equal(Number(item.quantityM2), 8);
  const request = db.query<{ id: string; status: string; warehouseId: string }>(
    `SELECT id, status, warehouse_id AS warehouseId FROM purchase_requests WHERE id = ?`,
    [item.requestId]
  )[0];
  assert.ok(request);
  assert.equal(request.status, 'PENDING');
  assert.equal(request.warehouseId, 'wh_main');
});

test('executive command centre exposes manufacturing KPIs and drilldown', async () => {
  await boot();
  const service = new ManufacturingService();
  const { executiveCommandService } = await import('../src/services/domains/dashboard/ExecutiveCommandService.ts');

  const product = createProduct('Exec good');
  const bom = service.createBom({
    productId: product,
    name: 'Exec BOM',
    items: [{ componentProductId: createProduct('Exec component'), quantity: 1 }],
  });
  service.activateBom(bom.id);
  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 2 });
  service.releaseOrder(order.id);
  service.startOrder(order.id);

  const overview = executiveCommandService.getOverview('month');
  assert.ok(overview.manufacturing, 'manufacturing summary should be present for authorized users');
  assert.ok(overview.manufacturing!.activeOrders >= 1);
  assert.ok(overview.manufacturing!.inProgressOrders >= 1);

  const drilldown = executiveCommandService.getDrilldown('manufacturing', 'month');
  assert.equal(drilldown.key, 'manufacturing');
  assert.ok(drilldown.rows.some((row) => row.orderNumber === order.orderNumber));
});
