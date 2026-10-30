import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { AppConfigService } from '../src/services/AppConfigService.ts';
import { ActionRegistryService } from '../src/services/ActionRegistryService.ts';
import { FeatureService } from '../src/services/FeatureService.ts';

test('scoped configuration resolves by scope precedence and tracks origin', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  AppConfigService.reset(admin);
  AppConfigService.setActiveContext(null);

  AppConfigService.saveScopeEntry('branch', 'br_main', {
    domain: 'page',
    key: '/dashboard',
    enabled: false,
    label: 'لوحة الفرع',
    value: '',
    props: {},
  } as any, 'تجاوز فرع', admin);

  AppConfigService.setActiveContext({ branchId: 'br_main', userId: admin.id });
  assert.equal(AppConfigService.isPageEnabled('/dashboard'), false);
  assert.equal(AppConfigService.getPageLabel('/dashboard', 'fallback'), 'لوحة الفرع');
  assert.equal(AppConfigService.getOrigin('page', '/dashboard')?.type, 'branch');

  AppConfigService.setActiveContext({ branchId: 'br_other', userId: admin.id });
  assert.equal(AppConfigService.isPageEnabled('/dashboard'), true);

  AppConfigService.setActiveContext(null);
});

test('scoped configuration rejects platform and security overrides at lower scopes', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');

  assert.throws(
    () => AppConfigService.saveScopeEntry('platform', 'platform', {
      domain: 'page', key: '/dashboard', enabled: false, label: '', value: '', props: {},
    } as any, 'منصة', admin),
    /تُوزَّع مركزيًا/,
  );

  assert.throws(
    () => AppConfigService.saveScopeEntry('branch', 'br_main', {
      domain: 'policy', key: 'security.sessionTimeoutMinutes', enabled: true, label: '', value: '1', props: {},
    } as any, 'أمان', admin),
    /أمني/,
  );
});

test('dynamic actions enforce permission even when visible', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  const resolved = ActionRegistryService.resolve('products.delete', admin);
  assert.equal(typeof resolved.visible, 'boolean');

  // Hiding a button does not grant permission; direct execution still requires the perm.
  AppConfigService.upsertEntry({
    domain: 'action',
    key: 'products.delete',
    enabled: true,
    label: 'حذف',
    value: '',
    props: {},
  } as any, 'إظهار', admin);

  // Admin has permission, so allowed.
  assert.doesNotThrow(() => ActionRegistryService.assertAllowed('products.delete', admin));
});

test('feature entitlements separate availability, entitlement and permission', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');

  const before = FeatureService.resolve('feature.pos.offline', admin);
  assert.equal(before.available, true);

  FeatureService.setEntitled('feature.pos.offline', false, admin);
  const after = FeatureService.resolve('feature.pos.offline', admin);
  assert.equal(after.entitled, false);
  assert.equal(after.allowed, false);
  assert.match(after.reason, /اشتراك/);

  // Restore entitlement.
  FeatureService.setEntitled('feature.pos.offline', true, admin);
});
