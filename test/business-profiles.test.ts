import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BUSINESS_MODULES, getManagedBusinessPaths, getProfileModuleIds, parseEnabledModules } from '../src/config/businessProfiles.ts';
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
