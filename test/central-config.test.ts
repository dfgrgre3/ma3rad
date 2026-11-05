import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { SettingsService } from '../src/services/SettingsService.ts';
import { CentralLicenseService } from '../src/services/CentralLicenseService.ts';
import { CentralFeaturePermissionService } from '../src/services/CentralFeaturePermissionService.ts';
import { CentralUsageLimitService } from '../src/services/CentralUsageLimitService.ts';
import { CentralConfigApplier } from '../src/services/CentralConfigApplier.ts';
import { CentralEstablishmentService } from '../src/services/CentralEstablishmentService.ts';

const CONFIG_KEY = 'central_cached_config';

function setCentralConfig(config: Record<string, unknown>, extra: Record<string, unknown> = {}): void {
  globalThis.localStorage.setItem(CONFIG_KEY, JSON.stringify({
    schemaVersion: 1,
    configurationVersion: 1,
    config,
    ...extra,
  }));
}

function clearCentralConfig(): void {
  globalThis.localStorage.removeItem(CONFIG_KEY);
}

test('central server URL must be HTTPS unless it is localhost', () => {
  CentralLicenseService.setServerUrl('https://central.example.com/');
  assert.equal(CentralLicenseService.getServerUrl(), 'https://central.example.com');
  assert.equal(CentralLicenseService.getSecureServerUrl(), 'https://central.example.com');

  // Plain HTTP to a remote host would leak the device credential.
  assert.throws(() => CentralLicenseService.setServerUrl('http://central.example.com'), /https/i);
  assert.equal(CentralLicenseService.getServerUrl(), 'https://central.example.com', 'rejected URL is not stored');

  assert.throws(() => CentralLicenseService.setServerUrl('central.example.com'), /https/i);
  assert.equal(CentralLicenseService.getServerUrl(), 'https://central.example.com');

  // Local development over HTTP stays allowed.
  CentralLicenseService.setServerUrl('http://localhost:4000');
  assert.equal(CentralLicenseService.getSecureServerUrl(), 'http://localhost:4000');

  CentralLicenseService.setServerUrl('http://127.0.0.1:4000');
  assert.equal(CentralLicenseService.getSecureServerUrl(), 'http://127.0.0.1:4000');

  CentralLicenseService.setServerUrl('https://central.example.com');
});

test('central page visibility merges hidden menus and per-feature permissions', () => {
  clearCentralConfig();
  assert.equal(CentralFeaturePermissionService.isPageVisible('/sales'), true, 'no central config => visible');

  setCentralConfig({
    hiddenMenus: ['/reports'],
    featurePermissions: [
      { pageUrl: '/sales', pageVisible: true, allowViewOnly: true },
      { pageUrl: '/purchases', pageVisible: false },
      { pageUrl: '/products', pageVisible: true, canDelete: false, canExportPrint: false },
    ],
  });

  // Hidden menus hide the page and everything below it.
  assert.equal(CentralFeaturePermissionService.isPageVisible('/reports'), false);
  assert.equal(CentralFeaturePermissionService.isPageVisible('/reports/daily'), false);
  assert.equal(CentralFeaturePermissionService.isPageVisible('/reportsx'), true, 'prefix match must respect path segments');

  assert.equal(CentralFeaturePermissionService.isPageVisible('/purchases'), false);
  assert.equal(CentralFeaturePermissionService.canEdit('/purchases'), false);
  assert.equal(CentralFeaturePermissionService.canView('/purchases'), false);

  assert.equal(CentralFeaturePermissionService.canView('/sales'), true);
  assert.equal(CentralFeaturePermissionService.canEdit('/sales'), false, 'view-only pages block edits');
  assert.equal(CentralFeaturePermissionService.canDelete('/sales'), false);

  assert.equal(CentralFeaturePermissionService.canEdit('/products'), true);
  assert.equal(CentralFeaturePermissionService.canDelete('/products'), false);
  assert.equal(CentralFeaturePermissionService.canExportPrint('/products'), false);

  assert.equal(CentralFeaturePermissionService.isPageVisible('/dashboard'), true, 'unlisted pages stay visible');

  clearCentralConfig();
});

test('central usage limits parse tolerant values and enforce at the service layer', async () => {
  await DatabaseManager.getInstance().initialize();
  clearCentralConfig();

  // No central config => unlimited.
  assert.equal(CentralUsageLimitService.getState('maxUsers').limited, false);
  assert.doesNotThrow(() => CentralUsageLimitService.assertWithin('maxUsers'));

  setCentralConfig({
    usageLimits: {
      maxUsers: '5',
      maxBranches: 'unlimited',
      maxWarehouses: 0,
      maxEmployees: '3 مستخدمين',
      maxInvoices: 'plan',
    },
  });

  assert.equal(CentralUsageLimitService.getState('maxUsers').allowed, 5);
  assert.equal(CentralUsageLimitService.getState('maxBranches').limited, false);
  assert.equal(CentralUsageLimitService.getState('maxWarehouses').limited, false, 'zero means unlimited');
  assert.equal(CentralUsageLimitService.getState('maxEmployees').allowed, 3);
  assert.equal(CentralUsageLimitService.getState('maxInvoices').limited, false);

  // The seeded database has exactly one active user/branch.
  setCentralConfig({ usageLimits: { maxUsers: 1, maxBranches: 1 } });
  assert.equal(CentralUsageLimitService.isReached('maxUsers'), true);
  assert.throws(() => CentralUsageLimitService.assertWithin('maxUsers'), /الحد الأقصى للمستخدمين/);
  assert.throws(() => CentralUsageLimitService.assertWithin('maxBranches'), /الحد الأقصى للفروع/);

  setCentralConfig({ usageLimits: { maxUsers: 2 } });
  assert.equal(CentralUsageLimitService.isReached('maxUsers'), false);
  assert.doesNotThrow(() => CentralUsageLimitService.assertWithin('maxUsers'));

  clearCentralConfig();
});

test('central feature permissions are enforced by both UI and service-layer checks', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');

  CentralFeaturePermissionService.setCurrentPath('/sales');
  setCentralConfig({
    featurePermissions: [{ pageUrl: '/sales', pageVisible: true, allowViewOnly: true }],
  });

  // UI-level check honors the central restriction…
  assert.equal(PermissionService.can(admin, 'sales.create'), false);
  // Service checks are independent of the current UI page unless scoped explicitly.
  assert.doesNotThrow(() => PermissionService.require(admin, 'sales.create'));
  assert.throws(() => PermissionService.require(admin, 'sales.create', '/sales'));

  setCentralConfig({
    disabledPermissions: ['sales.create'],
    featurePermissions: [{ pageUrl: '/sales', pageVisible: true, allowViewOnly: true }],
  });
  assert.throws(() => PermissionService.require(admin, 'sales.create'));

  clearCentralConfig();
  CentralFeaturePermissionService.setCurrentPath('');
  assert.equal(PermissionService.can(admin, 'sales.create'), true);
});

test('central config applier maps activity type and allowed modules into settings', async () => {
  await DatabaseManager.getInstance().initialize();
  clearCentralConfig();

  setCentralConfig({ activityType: 'electronics', allowedModules: ['sales'] });
  CentralConfigApplier.apply();

  assert.equal(SettingsService.getValue('businessType'), 'electronics');
  const enabled = JSON.parse(String(SettingsService.getValue('enabledModules') || '[]'));
  assert.ok(enabled.includes('sales'), 'allowed modules are enabled');

  // Unknown activity types never overwrite the local business profile.
  SettingsService.applyCentral({ businessType: 'ceramics' });
  setCentralConfig({ activityType: 'unknown_activity' });
  CentralConfigApplier.apply();
  assert.equal(SettingsService.getValue('businessType'), 'ceramics');

  clearCentralConfig();
});

test('central establishment sync respects module limits and preserves legal name', async () => {
  await DatabaseManager.getInstance().initialize();
  const db = DatabaseManager.getInstance();
  clearCentralConfig();

  const branchCount = Number(db.query<{ c: number }>('SELECT COUNT(*) AS c FROM branches WHERE is_active = 1')[0].c);
  setCentralConfig({ usageLimits: { maxBranches: branchCount } });

  const payload = {
    establishment: { name: 'منشأة مركزية', legal_name: 'الشركة القانونية المركزية', tax_number: '123-456' },
    branches: [{ id: 'b1', name: 'فرع المنصة المركزية', phone: '01000000000' }],
  };

  const limited = CentralEstablishmentService.apply(payload);
  assert.equal(limited.ok, true);
  assert.equal(limited.inserted, 0);
  assert.equal(limited.skipped, 1, 'branch creation is skipped once maxBranches is reached');
  assert.equal(db.query("SELECT id FROM branches WHERE code = 'CTR-b1'").length, 0);

  clearCentralConfig();
  const applied = CentralEstablishmentService.apply(payload);
  assert.equal(applied.inserted, 1);
  assert.equal(applied.skipped, 0);

  const branch = db.query<{ id: string; name: string; companyId: string }>(
    "SELECT id, name, company_id FROM branches WHERE code = 'CTR-b1'"
  )[0];
  assert.ok(branch, 'central branch is created');
  assert.equal(branch.companyId, 'cmp_main');

  const register = db.query<{ c: number }>(
    'SELECT COUNT(*) AS c FROM cash_registers WHERE branch_id = ?',
    [branch.id]
  )[0];
  assert.equal(Number(register.c), 1, 'a cash register is provisioned for the new branch');

  const company = db.query<{ name: string; legalName: string; taxNumber: string }>(
    "SELECT name, legal_name, tax_number FROM companies WHERE id = 'cmp_main'"
  )[0];
  assert.equal(company.name, 'منشأة مركزية');
  assert.equal(company.legalName, 'الشركة القانونية المركزية');
  assert.equal(company.taxNumber, '123-456');

  // A second sync updates the existing branch instead of duplicating it.
  const again = CentralEstablishmentService.apply(payload);
  assert.equal(again.inserted, 0);
  assert.equal(again.updated, 1);
  assert.equal(db.query("SELECT id FROM branches WHERE code = 'CTR-b1'").length, 1);
});
