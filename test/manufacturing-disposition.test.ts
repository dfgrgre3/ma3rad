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

const admin: User = { id: 'usr_qd_admin', username: 'qd-admin', fullName: 'Qd Admin', role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '' };

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(`INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active) VALUES ('usr_qd_admin', 'qd-admin', 'test', 'Qd Admin', 'ADMIN', 1)`);
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
  const seq = ++productSequence;
  return new ProductService().createProduct({ sku: `QD-${name}-${seq}`, barcode: `QDB-${name}-${seq}`, name: `${name} ${seq}`, categoryId: 'cat_floor', brandId: 'br_cleo', costPrice: 10 } as any).id;
}

function createOrderWithStock(service: ManufacturingService): { orderId: string; productId: string } {
  const product = createProduct('Finished');
  const component = createProduct('Component');
  const bom = service.createBom({ productId: product, name: 'QD BOM', items: [{ componentProductId: component, quantity: 2 }] });
  service.activateBom(bom.id);
  const order = service.createProductionOrder({ productId: product, bomId: bom.id, quantity: 2, branchId: 'br_main', warehouseId: 'wh_main' });
  service.releaseOrder(order.id);
  service.startOrder(order.id);
  // seed stock for finished product
  DatabaseManager.getInstance().run(`INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2) VALUES ('ws_qd', 'wh_main', ?, 5)`, [product]);
  return { orderId: order.id, productId: product };
}

test('quality disposition records scrap and reduces stock', async () => {
  await boot();
  const service = new ManufacturingService();
  const { orderId, productId } = createOrderWithStock(service);
  const check = service.createQualityCheck({ productionOrderId: orderId, result: 'FAIL', quantityRejected: 2 });
  const updated = service.recordQualityDisposition(check.id, 'SCRAP', 2);
  assert.equal(updated.disposition, 'SCRAP');
  assert.equal(updated.dispositionQty, 2);
  const stock = DatabaseManager.getInstance().query<{ q: number }>(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE warehouse_id='wh_main' AND product_id=?`, [productId])[0];
  assert.equal(stock.q, 3);
});

test('quality disposition rejects invalid disposition', async () => {
  await boot();
  const service = new ManufacturingService();
  const { orderId } = createOrderWithStock(service);
  const check = service.createQualityCheck({ productionOrderId: orderId, result: 'FAIL', quantityRejected: 1 });
  assert.throws(() => service.recordQualityDisposition(check.id, 'NOPE' as any, 1), /قرار المعالجة غير صالح/);
});
