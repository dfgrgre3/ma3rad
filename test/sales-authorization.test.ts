import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_sales_auth_admin',
  username: 'sales-auth-admin',
  fullName: 'Sales Auth Admin',
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
     VALUES ('usr_sales_auth_admin', 'sales-auth-admin', 'test', 'Sales Auth Admin', 'ADMIN', 1)`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  return db;
}

test('sales reads require sales.view at the service layer, not only in the UI', async () => {
  const db = await boot();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES ('usr_sales_no_view', 'sales-no-view', 'test', 'Sales No View', 'SALES', 1)`
  );
  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_sales_no_view', 'sales.view', 'DENY')`
  );
  const limited: User = {
    id: 'usr_sales_no_view',
    username: 'sales-no-view',
    fullName: 'Sales No View',
    role: 'SALES',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  AuthService.setCurrentUser(limited);
  PermissionService.invalidate(limited);

  const sales = new SalesService();
  assert.equal(PermissionService.can(limited, 'sales.create'), true);
  assert.equal(PermissionService.can(limited, 'sales.view'), false);
  assert.throws(() => sales.getAllInvoices(), /صلاحية/);
  assert.throws(() => sales.getInvoicesFiltered({}), /صلاحية/);
  assert.throws(() => sales.getStats(), /صلاحية/);
  assert.throws(() => sales.getInvoiceById('inv_missing'), /صلاحية/);
  assert.throws(() => sales.getReturns(), /صلاحية/);
  assert.throws(() => sales.getReturnsStats(), /صلاحية/);
  assert.throws(() => sales.getReturnableItems('inv_missing'), /صلاحية/);
  assert.throws(() => sales.getInvoicePayments('inv_missing'), /صلاحية/);

  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
});

test('sales mutations are blocked when the sales module is deactivated', async () => {
  await boot();
  const next = ModuleRegistryService.getEnabledModuleIds().filter((id) => id !== 'sales');
  const result = ModuleRegistryService.setEnabledModules(next, admin, 'test deactivation');
  assert.equal(result.deactivated.includes('sales'), true);
  assert.equal(ModuleRegistryService.isModuleEnabled('sales'), false);

  const sales = new SalesService();
  assert.throws(
    () => sales.createSale({
      customerId: 'c',
      warehouseId: 'w',
      items: [{ productId: 'p', quantityM2: 1, unitPrice: 1 } as any],
      paymentType: 'CASH',
    } as any),
    /غير مفعّلة/
  );
  assert.throws(
    () => sales.recordInvoicePayment('inv', 1),
    /غير مفعّلة/
  );
  assert.throws(
    () => sales.returnSale('inv', [], true, admin.id),
    /غير مفعّلة/
  );
});
