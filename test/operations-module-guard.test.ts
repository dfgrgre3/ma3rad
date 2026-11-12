import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { ModuleRegistryService } from '../src/services/domains/config/ModuleRegistryService.ts';
import { OperationsService } from '../src/services/domains/operations/OperationsService.ts';
import { InventoryService } from '../src/services/domains/inventory/InventoryService.ts';
import type { User } from '../src/types/auth/identity.ts';

const admin: User = {
  id: 'usr_operations_module_admin',
  username: 'operations-module-admin',
  fullName: 'Operations Module Admin',
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
     VALUES ('usr_operations_module_admin', 'operations-module-admin', 'test', 'Operations Module Admin', 'ADMIN', 1)`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  return db;
}

test('deactivating the operations module blocks new operational records without deleting history', async () => {
  const db = await boot();
  const operations = new OperationsService();

  const driver = operations.createDriver({ fullName: 'Existing Driver', phone: '01000000000' });
  const branch = operations.createBranch({ name: 'Existing Branch' });
  assert.ok(driver.id);
  assert.ok(branch.id);

  const remaining = ModuleRegistryService.getEnabledModuleIds().filter((id) => id !== 'operations');
  const result = ModuleRegistryService.setEnabledModules(remaining, admin, 'operations not used');
  assert.equal(result.deactivated.includes('operations'), true);
  assert.equal(ModuleRegistryService.isModuleEnabled('operations'), false);

  assert.throws(() => operations.createBranch({ name: 'Blocked Branch' }), /غير مفعّلة/);
  assert.throws(() => operations.toggleBranch(branch.id, false), /غير مفعّلة/);
  assert.throws(() => operations.createWarehouse({ name: 'Blocked Warehouse' }), /غير مفعّلة/);
  assert.throws(
    () => operations.createDriver({ fullName: 'Blocked Driver', phone: '01111111111' }),
    /غير مفعّلة/
  );
  assert.throws(() => operations.toggleDriver(driver.id, false), /غير مفعّلة/);
  assert.throws(() => operations.createVehicle({ plateNumber: 'BLOCKED-1' }), /غير مفعّلة/);
  assert.throws(() => operations.updateVehicleStatus('veh_missing', 'MAINTENANCE'), /غير مفعّلة/);
  assert.throws(
    () => operations.createDelivery({ customerId: 'c', address: 'Blocked address' }),
    /غير مفعّلة/
  );
  assert.throws(() => operations.updateDeliveryStatus('dlv_missing', 'CANCELLED'), /غير مفعّلة/);

  // History stays readable after deactivation.
  assert.equal(operations.getDrivers().some((row) => row.id === driver.id), true);
  assert.equal(operations.getBranches('', true).some((row) => row.id === branch.id), true);
  assert.equal(
    Number(db.query<{ count: number }>('SELECT COUNT(*) AS count FROM drivers')[0].count),
    1
  );

  ModuleRegistryService.activate('operations', admin, 'operations needed again');
  assert.equal(ModuleRegistryService.isModuleEnabled('operations'), true);
  const reactivated = operations.createDriver({ fullName: 'Reactivated Driver', phone: '01222222222' });
  assert.ok(reactivated.id);
});

test('delivery customer selector reads customers without an unsupported active column', async () => {
  const db = await boot();
  const companyId = db.query<{ companyId: string }>(
    'SELECT company_id AS companyId FROM branches WHERE is_main = 1 LIMIT 1'
  )[0]?.companyId;
  assert.ok(companyId);
  db.run(
    `INSERT OR REPLACE INTO customers (id, code, name, phone, company_id)
     VALUES ('cust_delivery_active_column_regression', 'DELIVERY-TEST', 'Delivery Test Customer', '', ?)`,
    [companyId]
  );

  const customers = new OperationsService().getCustomersForSelect();
  assert.ok(customers.some((customer) => customer.id === 'cust_delivery_active_column_regression'));
});

test('warehouse types are saved independently of warehouse names', async () => {
  await boot();
  const operations = new OperationsService();
  assert.equal(operations.getWarehouses().find((item) => item.id === 'wh_main')?.warehouseType, 'SHOWROOM');
  const warehouse = operations.createWarehouse({
    name: 'فرع شبين الرئيسي',
    warehouseType: 'SHOWROOM',
  });

  assert.equal(warehouse.warehouseType, 'SHOWROOM');
  operations.updateWarehouseType(warehouse.id, 'RETURNS_WAREHOUSE');
  assert.equal(
    new OperationsService().getWarehouses().find((item) => item.id === warehouse.id)?.warehouseType,
    'RETURNS_WAREHOUSE'
  );
  assert.throws(
    () => operations.updateWarehouseType(warehouse.id, 'INVALID' as never),
    /نوع المخزن غير صالح/
  );
});

test('warehouse administration requires an approved stock transfer before deactivation', async () => {
  const db = await boot();
  const operations = new OperationsService();
  const source = operations.createWarehouse({ name: 'Warehouse lifecycle source' });
  const destination = operations.createWarehouse({ name: 'Warehouse lifecycle destination' });
  const categoryId = db.query<{ id: string }>('SELECT id FROM categories LIMIT 1')[0]?.id;
  const brandId = db.query<{ id: string }>('SELECT id FROM brands LIMIT 1')[0]?.id;
  assert.ok(categoryId);
  assert.ok(brandId);

  db.run(
    `INSERT INTO products (id, sku, barcode, name, category_id, brand_id, size, base_unit, cost_price)
     VALUES ('prod_wh_lifecycle', 'WH-LIFECYCLE', 'WH-LIFECYCLE', 'Warehouse lifecycle product', ?, ?, '60x60', 'M2', 12)`,
    [categoryId, brandId]
  );
  db.run(
    `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES ('stk_wh_lifecycle', ?, 'prod_wh_lifecycle', 10, 0)`,
    [source.id]
  );

  const updated = operations.updateWarehouse(source.id, {
    name: 'Warehouse lifecycle edited',
    location: 'North building',
    warehouseType: 'RETURNS_WAREHOUSE',
  });
  assert.equal(updated.name, 'Warehouse lifecycle edited');
  assert.equal(updated.location, 'North building');
  assert.equal(updated.warehouseType, 'RETURNS_WAREHOUSE');

  operations.setDefaultWarehouse(source.id);
  assert.throws(() => operations.setWarehouseActive(source.id, false), /نقل جميع الأرصدة/);

  const transferId = new InventoryService().requestWarehouseStockTransfer(
    source.id,
    destination.id,
    'Warehouse lifecycle transfer'
  );
  assert.equal(
    db.query<{ status: string }>('SELECT status FROM stock_transfers WHERE id = ?', [transferId])[0].status,
    'REQUESTED'
  );
  assert.equal(
    Number(db.query<{ quantity: number }>(
      'SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
      [source.id, 'prod_wh_lifecycle']
    )[0].quantity),
    10
  );
  assert.equal(
    Number(db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM stock_transfer_items WHERE transfer_id = ?',
      [transferId]
    )[0].count),
    1
  );
  assert.throws(() => operations.setWarehouseActive(source.id, false), /نقل جميع الأرصدة/);

  const emptyWarehouse = operations.createWarehouse({ name: 'Warehouse lifecycle empty' });
  operations.setDefaultWarehouse(emptyWarehouse.id);
  operations.setWarehouseActive(emptyWarehouse.id, false);
  const disabledWarehouse = operations.getWarehouses().find((warehouse) => warehouse.id === emptyWarehouse.id);
  assert.equal(disabledWarehouse?.isActive, false);
  assert.equal(disabledWarehouse?.isDefault, false);
  assert.equal(
    Number(db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM warehouses WHERE branch_id = ? AND is_active = 1 AND is_default = 1',
      [source.branchId]
    )[0].count),
    1
  );
  operations.setWarehouseActive(emptyWarehouse.id, true);
  assert.equal(operations.getWarehouses().find((warehouse) => warehouse.id === emptyWarehouse.id)?.isActive, true);
});
