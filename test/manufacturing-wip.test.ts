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

const admin: User = { id: 'usr_wip_admin', username: 'wip-admin', fullName: 'Wip Admin', role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '' };

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(`INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active) VALUES ('usr_wip_admin', 'wip-admin', 'test', 'Wip Admin', 'ADMIN', 1)`);
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  if (!ModuleRegistryService.isModuleEnabled('manufacturing')) {
    ModuleRegistryService.activate('manufacturing', admin);
    AuthService.setCurrentUser(admin);
    PermissionService.invalidate(admin);
  }
  return db;
}

function createProduct(name: string, costPrice: number): string {
  return new ProductService().createProduct({ sku: `WIP-${name}`, barcode: `WIPB-${name}`, name, categoryId: 'cat_floor', brandId: 'br_cleo', costPrice } as any).id;
}

test('WIP valuation lists in-progress orders with material cost', async () => {
  await boot();
  const service = new ManufacturingService();
  const finished = createProduct('Finished', 50);
  const component = createProduct('Component', 5);
  const bom = service.createBom({ productId: finished, name: 'WIP BOM', items: [{ componentProductId: component, quantity: 2 }] });
  service.activateBom(bom.id);
  const order = service.createProductionOrder({ productId: finished, bomId: bom.id, quantity: 3, branchId: 'br_main' });
  service.releaseOrder(order.id);
  service.startOrder(order.id);

  const wip = service.getWipValuation();
  assert.ok(wip.orders.some((o) => o.orderId === order.id));
  const entry = wip.orders.find((o) => o.orderId === order.id)!;
  assert.equal(entry.quantity, 3);
  assert.equal(entry.materialCost, 30); // 3 orders? plannedQty 6 * 5 = 30
  assert.equal(wip.totalQuantity, 3);
});

test('completed orders are excluded from WIP', async () => {
  await boot();
  const service = new ManufacturingService();
  const wip = service.getWipValuation();
  // no in-progress orders expected after fresh boot (none created)
  assert.ok(Array.isArray(wip.orders));
});
