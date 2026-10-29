import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import { OperationsService } from '../src/services/OperationsService.ts';
import type { User } from '../src/types/identity.ts';

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
  assert.equal(operations.getBranches().some((row) => row.id === branch.id), true);
  assert.equal(
    Number(db.query<{ count: number }>('SELECT COUNT(*) AS count FROM drivers')[0].count),
    1
  );

  ModuleRegistryService.activate('operations', admin, 'operations needed again');
  assert.equal(ModuleRegistryService.isModuleEnabled('operations'), true);
  const reactivated = operations.createDriver({ fullName: 'Reactivated Driver', phone: '01222222222' });
  assert.ok(reactivated.id);
});
