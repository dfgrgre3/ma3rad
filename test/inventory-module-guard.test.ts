import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import { InventoryService } from '../src/services/InventoryService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_inventory_module_admin',
  username: 'inventory-module-admin',
  fullName: 'Inventory Module Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

test('deactivating the inventory module blocks new stock movements at the service layer', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES ('usr_inventory_module_admin', 'inventory-module-admin', 'test', 'Inventory Module Admin', 'ADMIN', 1)`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);

  const inventory = new InventoryService();
  const remaining = ModuleRegistryService.getEnabledModuleIds().filter((id) => id !== 'inventory' && id !== 'manufacturing');
  const result = ModuleRegistryService.setEnabledModules(remaining, admin, 'no stock tracking');
  assert.equal(result.deactivated.includes('inventory'), true);
  assert.equal(ModuleRegistryService.isModuleEnabled('inventory'), false);

  assert.throws(
    () => inventory.adjustStock({
      productId: 'p',
      warehouseId: 'w',
      quantityM2: 1,
      reason: 'guard',
      type: 'ADJUSTMENT_IN',
    } as any),
    /غير مفعّلة/
  );
  assert.throws(
    () => inventory.transferStock({ productId: 'p', fromWarehouseId: 'a', toWarehouseId: 'b', quantityM2: 1 } as any),
    /غير مفعّلة/
  );
  assert.throws(
    () => inventory.createTransferRequest({ fromWarehouseId: 'a', toWarehouseId: 'b', items: [] }),
    /غير مفعّلة/
  );
  assert.throws(() => inventory.approveTransfer('trf_missing'), /غير مفعّلة/);
  assert.throws(() => inventory.prepareTransfer('trf_missing'), /غير مفعّلة/);
  assert.throws(() => inventory.dispatchTransfer('trf_missing'), /غير مفعّلة/);
  assert.throws(() => inventory.rejectTransfer('trf_missing', 'guard'), /غير مفعّلة/);
  assert.throws(() => inventory.inspectSpecialStock('spc_missing', 'guard'), /غير مفعّلة/);
  assert.throws(() => inventory.deleteWarehouseLocation('loc_missing'), /غير مفعّلة/);
  assert.throws(() => inventory.assignProductLocation('loc', 'p', 1), /غير مفعّلة/);
  assert.throws(
    () => inventory.updateProductPlanningParameters('p', { reorderPoint: 1 }),
    /غير مفعّلة/
  );
  assert.throws(
    () => inventory.saveReconciliationLog({ warehouseId: 'w', notes: 'guard' } as any),
    /غير مفعّلة/
  );

  // Read paths keep working for history and audits.
  assert.ok(Array.isArray(inventory.getTransactions(5)));

  ModuleRegistryService.activate('inventory', admin, 'stock tracking restored');
  assert.equal(ModuleRegistryService.isModuleEnabled('inventory'), true);
});
