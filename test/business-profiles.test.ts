import './integration.setup.ts';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatabaseManager } from '../src/database/db.ts';
import { SettingsService } from '../src/services/SettingsService.ts';
import { BusinessProfileService } from '../src/services/BusinessProfileService.ts';
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
  assert.equal(getDefaultBusinessConfiguration('services').trackInventory, false);
  assert.equal(getDefaultBusinessConfiguration('services').businessModel, 'services');
  assert.equal('appointmentsEnabled' in getDefaultBusinessConfiguration('services'), false);
});

test('additional industry profiles configure suitable defaults using available modules', () => {
  assert.equal(getDefaultBusinessConfiguration('manufacturing').trackInventory, true);
  assert.equal(getProfileModuleIds('manufacturing').includes('inventory'), true);
  assert.equal(getDefaultBusinessConfiguration('construction').units.includes('SERVICE'), true);
  assert.equal(getProfileModuleIds('construction').includes('customers'), true);
  assert.equal(getDefaultBusinessConfiguration('professional_services').trackInventory, false);
  assert.equal(getDefaultBusinessConfiguration('healthcare_admin').businessModel, 'services');
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
  assert.equal('variantsEnabled' in restored, false);
  assert.equal(parseBusinessConfiguration('{', 'ceramics').trackInventory, true);
});

test('nested paths resolve to their configured module for direct-route gating', () => {
  assert.equal(getBusinessModuleForPath('/products/123'), 'inventory');
  assert.equal(getBusinessModuleForPath('/sales/analytics'), 'sales');
  assert.equal(getBusinessModuleForPath('/admin'), undefined);
});

test('profile attribute names become real attributes exactly once', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  const names = ['اختبار اللون ١', 'اختبار المقاس ١'];

  const first = BusinessProfileService.ensureProfileAttributes(names);
  assert.deepEqual(first.created, names);
  assert.deepEqual(first.existing, []);

  // Re-applying the same profile must not duplicate fields.
  const second = BusinessProfileService.ensureProfileAttributes(names);
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.existing, names);

  const rows = manager.query<{ id: string; code: string }>(
    `SELECT id, code FROM attributes WHERE name IN (?, ?)`,
    names
  );
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.code)).size, 2);
  // Names created by another profile (or by the user) are untouched.
  manager.run(
    `INSERT OR REPLACE INTO attributes (id, code, name, data_type, is_filterable, sort_order)
     VALUES ('attr_keep_manual', 'attr_keep_manual', 'خاصية يدوية', 'TEXT', 1, 99)`
  );
  BusinessProfileService.ensureProfileAttributes(names);
  assert.equal(manager.query(`SELECT id FROM attributes WHERE id = 'attr_keep_manual'`).length, 1);
});

test('saved business profile attributes are materialized on demand', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'businessType',
    'furniture',
  ]);
  manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'businessProfileConfig',
    JSON.stringify({
      ...getDefaultBusinessConfiguration('furniture'),
      productAttributes: ['اختبار الخامة ١', 'اختبار الموديل ١'],
    }),
  ]);

  const result = BusinessProfileService.applyFromSettings();
  assert.deepEqual(result.created, ['اختبار الخامة ١', 'اختبار الموديل ١']);
  const stored = manager.query<{ name: string }>(
    `SELECT name FROM attributes WHERE name IN ('اختبار الخامة ١', 'اختبار الموديل ١') ORDER BY name`
  );
  assert.equal(stored.length, 2);
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
