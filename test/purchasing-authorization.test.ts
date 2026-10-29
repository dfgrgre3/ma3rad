import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { PurchaseService } from '../src/services/PurchaseService.ts';
import { SupplierService } from '../src/services/SupplierService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_purchasing_auth_admin',
  username: 'purchasing-auth-admin',
  fullName: 'Purchasing Auth Admin',
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
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES ('usr_purchasing_auth_admin', 'purchasing-auth-admin', 'test', 'Purchasing Auth Admin', 'ADMIN', 1, 'ALL'),
            ('usr_purchasing_no_view', 'purchasing-no-view', 'test', 'Purchasing No View', 'SALES', 1, 'ASSIGNED'),
            ('usr_warehouse_directory', 'warehouse-directory', 'test', 'Warehouse Directory', 'WAREHOUSE', 1, 'ASSIGNED')`
  );
  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES ('usr_purchasing_no_view', 'purchases.view', 'DENY'),
            ('usr_purchasing_no_view', 'suppliers.view', 'DENY'),
            ('usr_warehouse_directory', 'suppliers.view', 'DENY')`
  );
  db.run(`INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES ('usr_purchasing_no_view', 'br_main')`);
  db.run(`INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES ('usr_warehouse_directory', 'br_main')`);
  db.run(
    `INSERT INTO suppliers (id, code, name, phone, is_active, company_id)
     VALUES ('sup_auth_1', 'SUP-AUTH-1', 'Auth Supplier', '01000000001', 1, 'cmp_main')
     ON CONFLICT(id) DO NOTHING`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  return db;
}

function asUser(user: User): void {
  AuthService.setCurrentUser(user);
  PermissionService.invalidate(user);
}

test('purchasing reads require purchases.view at the service layer', async () => {
  await boot();
  const limited: User = {
    id: 'usr_purchasing_no_view',
    username: 'purchasing-no-view',
    fullName: 'Purchasing No View',
    role: 'SALES',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  asUser(limited);

  const purchases = new PurchaseService();
  assert.equal(PermissionService.can(limited, 'purchases.view'), false);
  assert.throws(() => purchases.getAllPurchases(), /صلاحية/);
  assert.throws(() => purchases.getPurchaseById('pi_missing'), /صلاحية/);

  const suppliers = new SupplierService();
  assert.throws(() => suppliers.getAllSuppliers(), /صلاحية/);
  assert.throws(() => suppliers.getSupplierById('sup_auth_1'), /صلاحية/);
  assert.throws(() => suppliers.getSupplierStatement('sup_auth_1'), /صلاحية/);
  assert.throws(() => suppliers.getInvoicesWithAllocations('sup_auth_1'), /صلاحية/);
  assert.throws(() => suppliers.getPaymentsWithAllocations('sup_auth_1'), /صلاحية/);

  asUser(admin);
});

test('the supplier directory stays available to users who can record purchases', async () => {
  await boot();
  const warehouse: User = {
    id: 'usr_warehouse_directory',
    username: 'warehouse-directory',
    fullName: 'Warehouse Directory',
    role: 'WAREHOUSE',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  asUser(warehouse);

  assert.equal(PermissionService.can(warehouse, 'suppliers.view'), false);
  assert.equal(PermissionService.can(warehouse, 'purchases.create'), true);

  const suppliers = new SupplierService();
  assert.equal(suppliers.getAllSuppliers().some((row) => row.id === 'sup_auth_1'), true);
  // Full supplier details and statements still need suppliers.view.
  assert.throws(() => suppliers.getSupplierById('sup_auth_1'), /صلاحية/);
  assert.throws(() => suppliers.getSupplierStatement('sup_auth_1'), /صلاحية/);

  asUser(admin);
});
