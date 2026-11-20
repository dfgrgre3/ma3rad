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
  id: 'usr_qcg_admin',
  username: 'qcg-admin',
  fullName: 'QC Gate Admin',
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
     VALUES ('usr_qcg_admin', 'qcg-admin', 'test', 'QC Gate Admin', 'ADMIN', 1)`
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

function asAdmin(): void {
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
}

let productSequence = 0;

function createProduct(): string {
  const sequence = ++productSequence;
  return new ProductService().createProduct({
    sku: `QCG-SKU-${sequence}`,
    barcode: `QCG-BAR-${sequence}`,
    name: `QCG Product ${sequence}`,
    categoryId: 'cat_floor',
    brandId: 'br_cleo',
  } as any).id;
}

function stockOf(productId: string): number {
  const row = DatabaseManager.getInstance().query<{ quantityM2: number }>(
    `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
    [productId]
  )[0];
  return Number(row?.quantityM2 || 0);
}

function seedStock(productId: string, qty: number): void {
  DatabaseManager.getInstance().run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2)
     VALUES ('ws_qcg_${productId.slice(-6)}', 'wh_main', ?, ?)`,
    [productId, qty]
  );
}

/** Builds an IN_PROGRESS order; `requiresQc` toggles the BOM QC gate. */
function createRunningOrder(service: ManufacturingService, requiresQc: boolean): { orderId: string; productId: string; componentId: string } {
  const product = createProduct();
  const component = createProduct();
  const bom = service.createBom({
    productId: product,
    name: `QCG BOM ${requiresQc ? 'QC' : 'plain'}`,
    requiresFinalQc: requiresQc,
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);
  const order = service.createProductionOrder({
    productId: product,
    bomId: bom.id,
    quantity: 4,
    branchId: 'br_main',
  });
  service.releaseOrder(order.id);
  service.startOrder(order.id);
  seedStock(component, 10);
  return { orderId: order.id, productId: product, componentId: component };
}

test('QC-gated BOM holds produced output out of sellable stock until FINAL accept', async () => {
  await boot();
  asAdmin();
  const service = new ManufacturingService();
  const { orderId, productId } = createRunningOrder(service, true);

  service.completeOrder(orderId);

  // Produced qty is recorded on the order but NOT in sellable stock.
  const order = service.getProductionOrder(orderId);
  assert.equal(order.status, 'COMPLETED');
  assert.equal(Number(order.producedQty), 4);
  assert.equal(stockOf(productId), 0);
  assert.equal(service.getQcHeldQuantity(orderId), 4);

  const holds = DatabaseManager.getInstance().query<any>(
    `SELECT * FROM production_qc_holds WHERE production_order_id = ?`, [orderId]
  );
  assert.equal(holds.length, 1);
  assert.equal(holds[0].status, 'HELD');
  assert.equal(Number(holds[0].quantityM2), 4);

  // FINAL inspection accepts the full held quantity → stock released.
  const check = service.createQualityCheck({
    productionOrderId: orderId,
    inspectionType: 'FINAL',
    result: 'PASS',
    quantityInspected: 4,
    quantityAccepted: 4,
    quantityRejected: 0,
  });
  service.recordQualityDisposition(check.id, 'ACCEPT', 4);

  assert.equal(stockOf(productId), 4);
  assert.equal(service.getQcHeldQuantity(orderId), 0);
  const resolved = DatabaseManager.getInstance().query<any>(
    `SELECT status FROM production_qc_holds WHERE id = ?`, [holds[0].id]
  )[0];
  assert.equal(resolved.status, 'ACCEPTED');
});

test('QC SCRAP consumes the hold without touching sellable stock', async () => {
  await boot();
  asAdmin();
  const service = new ManufacturingService();
  const { orderId, productId } = createRunningOrder(service, true);

  service.completeOrder(orderId, 4);
  assert.equal(stockOf(productId), 0);

  const check = service.createQualityCheck({
    productionOrderId: orderId,
    inspectionType: 'FINAL',
    result: 'FAIL',
    quantityInspected: 4,
    quantityAccepted: 0,
    quantityRejected: 4,
  });
  service.recordQualityDisposition(check.id, 'SCRAP', 4);

  assert.equal(stockOf(productId), 0);
  assert.equal(service.getQcHeldQuantity(orderId), 0);
  const resolved = DatabaseManager.getInstance().query<any>(
    `SELECT status FROM production_qc_holds WHERE production_order_id = ?`, [orderId]
  )[0];
  assert.equal(resolved.status, 'SCRAPPED');
});

test('non-QC BOM still receives output directly into stock', async () => {
  await boot();
  asAdmin();
  const service = new ManufacturingService();
  const { orderId, productId } = createRunningOrder(service, false);

  service.completeOrder(orderId);

  assert.equal(stockOf(productId), 4);
  assert.equal(service.getQcHeldQuantity(orderId), 0);
});

test('material issue freezes transaction cost and order cost ignores later price changes', async () => {
  await boot();
  const db = DatabaseManager.getInstance();
  asAdmin();
  const service = new ManufacturingService();
  const { orderId, componentId } = createRunningOrder(service, false);

  // Component cost price: 5.00 major (500 minor units).
  db.run(`UPDATE products SET cost_price = 500 WHERE id = ?`, [componentId]);
  service.completeOrder(orderId); // consumes 4 units of component

  const issueTx = db.query<{ totalCost: number; unitCost: number }>(
    `SELECT total_cost AS totalCost, unit_cost AS unitCost
     FROM inventory_transactions
     WHERE reference_type = 'PRODUCTION_ORDER' AND reference_id = ? AND type = 'ADJUSTMENT_SUB'`,
    [orderId]
  );
  assert.equal(issueTx.length, 1);
  // 4 units × 5.00 = 20.00 → stored as 2000 minor units.
  assert.equal(Number(issueTx[0].totalCost), 2000);

  const costBefore = service.getProductionOrderCost(orderId);
  assert.equal(costBefore.materialCost, 20);

  // A later price change must not rewrite the frozen issue cost.
  db.run(`UPDATE products SET cost_price = 99900 WHERE id = ?`, [componentId]);
  const costAfter = service.getProductionOrderCost(orderId);
  assert.equal(costAfter.materialCost, 20);
});

test('work center from another branch is rejected for a production order', async () => {
  await boot();
  const service = new ManufacturingService();
  const product = createProduct();
  const component = createProduct();
  const bom = service.createBom({
    productId: product,
    name: 'Branch BOM',
    items: [{ componentProductId: component, quantity: 1 }],
  });
  service.activateBom(bom.id);

  const foreign = DatabaseManager.getInstance().query<{ id: string }>(
    `SELECT id FROM branches WHERE id != 'br_main' LIMIT 1`
  )[0];
  let foreignBranchId = foreign?.id;
  if (!foreignBranchId) {
    const { BranchService } = await import('../src/services/domains/organization/BranchService.ts');
    foreignBranchId = new BranchService().createBranch({
      name: 'Foreign Branch',
      code: 'QCG-FGN',
      companyId: 'cmp_main',
    }).id;
  }
  const { BranchAccessService } = await import('../src/services/domains/auth/BranchAccessService.ts');
  const access = new BranchAccessService();
  access.setCurrentBranchId(foreignBranchId, admin);
  const foreignCenter = service.createWorkCenter({
    code: `WC-FGN-${Date.now()}`,
    name: 'Foreign line',
    branchId: foreignBranchId,
  });
  access.setCurrentBranchId('br_main', admin);

  assert.throws(
    () => service.createProductionOrder({
      productId: product,
      bomId: bom.id,
      quantity: 1,
      branchId: 'br_main',
      operations: [{ workCenterId: foreignCenter.id, plannedMinutes: 30 }],
    }),
    /فرع/
  );
});
