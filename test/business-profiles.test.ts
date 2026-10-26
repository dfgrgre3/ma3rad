import './integration.setup.ts';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatabaseManager } from '../src/database/db.ts';
import { SettingsService } from '../src/services/SettingsService.ts';
import {
  BUSINESS_MODULES,
  getBusinessModuleForPath,
  getDefaultBusinessConfiguration,
  getManagedBusinessPaths,
  getProfileModuleIds,
  parseBusinessConfiguration,
  parseEnabledModules,
} from '../src/config/businessProfiles.ts';
import { NAV_GROUPS } from '../src/config/navigation.tsx';

test('custom business profiles start with every ERP module enabled', () => {
  assert.deepEqual(getProfileModuleIds('custom'), BUSINESS_MODULES.map((module) => module.id));
});

test('enabled module settings preserve an intentionally empty selection', () => {
  assert.deepEqual(parseEnabledModules('[]', 'custom'), []);
  assert.deepEqual(parseEnabledModules('["sales","not-a-module"]', 'custom'), ['sales']);
});

test('all business navigation entries are controlled by a configurable module', () => {
  const managedPaths = getManagedBusinessPaths();
  const unassignedPaths = NAV_GROUPS
    .filter((group) => group.id !== 'dashboard' && group.id !== 'system')
    .flatMap((group) => group.items)
    .map((item) => item.to)
    .filter((path) => !managedPaths.has(path));

  assert.deepEqual(unassignedPaths, []);
});

test('business templates retain ceramic defaults and provide retail and service capabilities', () => {
  assert.deepEqual(getDefaultBusinessConfiguration('ceramics').units, ['M2', 'BOX', 'PIECE']);
  assert.equal(getDefaultBusinessConfiguration('clothing').variantsEnabled, true);
  assert.equal(getDefaultBusinessConfiguration('services').trackInventory, false);
  assert.equal(getDefaultBusinessConfiguration('services').businessModel, 'services');
  assert.equal(getDefaultBusinessConfiguration('services').appointmentsEnabled, true);
});

test('business customizations restore from saved settings and ignore malformed values', () => {
  const restored = parseBusinessConfiguration(JSON.stringify({
    businessModel: 'mixed',
    trackInventory: false,
    units: ['KG', 'NOT_A_UNIT', 'KG'],
    customUnits: ['صندوق'],
    productAttributes: ['اللون'],
    variantsEnabled: true,
  }), 'custom');
  assert.equal(restored.trackInventory, false);
  assert.equal(restored.businessModel, 'mixed');
  assert.deepEqual(restored.units, ['KG']);
  assert.deepEqual(restored.customUnits, ['صندوق']);
  assert.equal(parseBusinessConfiguration('{', 'ceramics').trackInventory, true);
});

test('nested paths resolve to their configured module for direct-route gating', () => {
  assert.equal(getBusinessModuleForPath('/products/123'), 'inventory');
  assert.equal(getBusinessModuleForPath('/sales/analytics'), 'sales');
  assert.equal(getBusinessModuleForPath('/admin'), undefined);
});

test('business configuration is restored from SQLite settings', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  const config = getDefaultBusinessConfiguration('services');
  manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'businessProfileConfig',
    JSON.stringify(config),
  ]);
  const restored = parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), 'services');
  assert.equal(restored.businessType, 'services');
  assert.equal(restored.trackInventory, false);
  assert.deepEqual(restored.units, ['SERVICE']);
});
