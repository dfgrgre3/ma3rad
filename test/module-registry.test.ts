import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import {
  MODULE_REGISTRY,
  getModulePathOwner,
  validateModuleSelection,
  withModuleDependencies,
} from '../src/config/moduleRegistry.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_module_admin',
  username: 'module-admin',
  fullName: 'Module Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

test('module registry is internally consistent', () => {
  const ids = MODULE_REGISTRY.map((module) => module.id);
  assert.equal(new Set(ids).size, ids.length, 'module ids are unique');
  for (const module of MODULE_REGISTRY) {
    for (const dependency of module.dependencies) {
      assert.ok(ids.includes(dependency), `${module.id} depends on a known module`);
      assert.notEqual(dependency, module.id, `${module.id} cannot depend on itself`);
    }
    assert.ok(module.permissions.length > 0, `${module.id} declares required permissions`);
    assert.ok(module.paths.length > 0, `${module.id} owns at least one route`);
  }
});

test('selection validation includes dependencies and rejects invalid states', () => {
  const purchasingOnly = validateModuleSelection(['purchasing'], { trackInventory: true });
  assert.deepEqual(purchasingOnly.errors, []);
  assert.deepEqual(purchasingOnly.enabled.sort(), ['finance', 'purchasing']);

  const unknown = validateModuleSelection(['sales', 'does-not-exist'], { trackInventory: true });
  assert.equal(unknown.errors.some((error) => error.includes('does-not-exist')), true);
  assert.equal(unknown.enabled.includes('does-not-exist'), false);
  assert.equal(unknown.enabled.includes('customers'), true, 'sales dependency is auto-included');

  const servicesNoInventory = validateModuleSelection(['inventory'], { trackInventory: false });
  assert.equal(servicesNoInventory.errors.length, 1);
  assert.match(servicesNoInventory.errors[0], /تتبع المخزون/);

  const empty = validateModuleSelection([], { trackInventory: true });
  assert.deepEqual(empty.enabled, []);
  assert.equal(empty.warnings.length, 1);
});

test('transitive dependencies and longest-path routing resolve consistently', () => {
  assert.deepEqual(withModuleDependencies(['purchasing']).sort(), ['finance', 'purchasing']);
  assert.deepEqual(withModuleDependencies(['sales']).sort(), ['customers', 'sales']);
  assert.equal(getModulePathOwner('/products/123'), 'inventory');
  assert.equal(getModulePathOwner('/purchases/orders/PO-1'), 'purchasing');
  assert.equal(getModulePathOwner('/admin'), undefined);
});

test('module activation lifecycle is persisted, audited and dependency-guarded', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES ('usr_module_admin', 'module-admin', 'test', 'Module Admin', 'ADMIN', 1)`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);

  // Defaults come from the ceramics profile: every module is enabled.
  assert.deepEqual(
    [...ModuleRegistryService.getEnabledModuleIds()].sort(),
    MODULE_REGISTRY.map((module) => module.id).sort()
  );

  // A pending approval prevents deactivation of the approvals module.
  db.run(
    `INSERT INTO approval_requests (id, request_number, request_type, title, status, requested_by)
     VALUES ('apr_live', 'APR-LIVE', 'OTHER', 'Live request', 'PENDING', 'usr_module_admin')`
  );
  assert.throws(
    () => ModuleRegistryService.deactivate('approvals', admin),
    /عملية جارية|لا يمكن تعطيل/
  );

  db.run(`UPDATE approval_requests SET status = 'APPROVED' WHERE id = 'apr_live'`);
  const deactivated = ModuleRegistryService.deactivate('approvals', admin, 'not used by this company');
  assert.deepEqual(deactivated.deactivated, ['approvals']);
  assert.equal(ModuleRegistryService.isModuleEnabled('approvals'), false);
  assert.throws(() => ModuleRegistryService.assertModuleEnabled('approvals'), /غير مفعّلة/);

  const log = ModuleRegistryService.getActivationLog();
  assert.equal(log[0].moduleId, 'approvals');
  assert.equal(log[0].action, 'DEACTIVATED');
  assert.equal(log[0].reason, 'not used by this company');

  // Navigation visibility follows the module selection.
  const hidden = JSON.parse(require_settings(db, 'nav.hidden')) as string[];
  assert.equal(hidden.includes('/approvals'), true);

  // Dependencies block removal even when the dependent module is still enabled.
  assert.throws(
    () => ModuleRegistryService.deactivate('customers', admin),
    /تعتمد عليها/
  );

  // A valid reduced selection writes only the requested modules.
  const result = ModuleRegistryService.setEnabledModules(['sales', 'customers', 'finance', 'reports'], admin);
  assert.deepEqual([...result.enabled].sort(), ['customers', 'finance', 'reports', 'sales']);
  assert.deepEqual(
    [...ModuleRegistryService.getEnabledModuleIds()].sort(),
    ['customers', 'finance', 'reports', 'sales']
  );
  assert.equal(ModuleRegistryService.isModuleEnabled('inventory'), false);

  // History is not deleted by deactivation.
  assert.equal(
    Number(db.query<{ count: number }>('SELECT COUNT(*) AS count FROM module_activation_log')[0].count) >= 4,
    true
  );

  // Unknown modules and invalid selections are rejected before any write.
  assert.throws(() => ModuleRegistryService.activate('nope', admin), /وحدة غير معروفة/);
  db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'businessProfileConfig',
    JSON.stringify({ businessType: 'ceramics', trackInventory: false }),
  ]);
  assert.throws(
    () => ModuleRegistryService.setEnabledModules(['inventory'], admin),
    /تتبع المخزون/
  );

  const switchedToInventoryBusiness = ModuleRegistryService.setEnabledModules(
    ['sales', 'customers', 'inventory', 'finance', 'reports'],
    admin,
    'change business activity',
    { trackInventory: true }
  );
  assert.equal(switchedToInventoryBusiness.enabled.includes('inventory'), true);
  db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'businessProfileConfig',
    JSON.stringify({ businessType: 'ceramics', trackInventory: true }),
  ]);
  assert.equal(ModuleRegistryService.getEnabledModuleIds().includes('inventory'), true);
});

test('module settings use registry defaults, validation and permissions', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);

  const defaults = ModuleRegistryService.getModuleSettings('inventory');
  assert.equal(defaults.costingMethod, 'AVERAGE_COST');
  assert.equal(defaults.allowNegativeStock, false);

  ModuleRegistryService.setModuleSetting('inventory', 'costingMethod', 'FIFO', admin);
  assert.equal(ModuleRegistryService.getModuleSettings('inventory').costingMethod, 'FIFO');
  assert.throws(
    () => ModuleRegistryService.setModuleSetting('inventory', 'costingMethod', 'LIFO', admin),
    /غير صالح/
  );
  assert.throws(
    () => ModuleRegistryService.setModuleSetting('inventory', 'unknown-key', 'x', admin),
    /إعداد غير معروف/
  );

  const salesUser: User = { ...admin, id: 'usr_module_sales', username: 'module-sales', role: 'SALES' };
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES ('usr_module_sales', 'module-sales', 'test', 'Module Sales', 'SALES', 1)`
  );
  AuthService.setCurrentUser(salesUser);
  PermissionService.invalidate(salesUser);
  assert.throws(
    () => ModuleRegistryService.setModuleSetting('inventory', 'costingMethod', 'FIFO', salesUser),
    /صلاحية/
  );
});

function require_settings(db: DatabaseManager, key: string): string {
  const row = db.query<{ value: string }>('SELECT value FROM system_settings WHERE key = ?', [key])[0];
  return row?.value ?? '[]';
}
