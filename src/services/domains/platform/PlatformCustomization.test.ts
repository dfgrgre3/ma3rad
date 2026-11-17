import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  PlatformUiProfile,
  PlatformTenantUiCustomization,
  PlatformTenantUiVersion,
} from './platformTypes';

test('should model activity-based UI profile correctly', () => {
  const profile: PlatformUiProfile = {
    id: 'uip_ceramics',
    code: 'CERAMICS',
    name: 'معارض السيراميك والبورسلين',
    hiddenPages: ['/manufacturing', '/restaurant-tables'],
    hiddenActions: ['wholesale_bulk_pricing'],
    customLabels: { '/sales': 'فواتير المعرض والمبيعات' },
    navOrder: ['/sales', '/inventory', '/customers'],
    formFieldRules: {
      colorTone: { visible: true, required: true },
      caliberSize: { visible: true },
      expiryDate: { visible: false },
    },
    isDefault: false,
    createdAt: '2026-11-14T20:00:00Z',
  };

  assert.strictEqual(profile.code, 'CERAMICS');
  assert.ok(profile.hiddenPages?.includes('/restaurant-tables'));
  assert.strictEqual((profile.formFieldRules as any).colorTone.visible, true);
  assert.strictEqual((profile.formFieldRules as any).expiryDate.visible, false);
});

test('should model per-tenant UI customizations independently', () => {
  const custom: PlatformTenantUiCustomization = {
    id: 'tui_tenant_1',
    tenantId: 'tenant_1',
    profileId: 'uip_ceramics',
    hiddenPages: ['/manufacturing', '/restaurant-tables', '/installments'],
    hiddenActions: ['export_excel'],
    customLabels: { '/customers': 'قائمة المهندسين والعملاء' },
    navOrder: [],
    formFieldRules: {
      nationalId: { visible: true, required: false },
    },
    version: 3,
    createdAt: '2026-11-14T10:00:00Z',
    updatedAt: '2026-11-14T14:00:00Z',
  };

  assert.strictEqual(custom.tenantId, 'tenant_1');
  assert.strictEqual(custom.hiddenPages?.length, 3);
  assert.ok(custom.hiddenActions?.includes('export_excel'));
  assert.strictEqual(custom.version, 3);
});

test('should support snapshot history and rollback records', () => {
  const snapshot: PlatformTenantUiCustomization = {
    id: 'tui_tenant_1',
    tenantId: 'tenant_1',
    hiddenPages: ['/manufacturing'],
    hiddenActions: [],
    customLabels: {},
    navOrder: [],
    formFieldRules: {},
    version: 1,
    createdAt: '2026-11-14T08:00:00Z',
    updatedAt: '2026-11-14T08:00:00Z',
  };

  const verRecord: PlatformTenantUiVersion = {
    id: 'snap-ui-001',
    tenantId: 'tenant_1',
    version: 1,
    configSnapshot: snapshot,
    changeSummary: 'الإصدار الأولي للواجهة',
    createdBy: 'super-admin',
    createdAt: '2026-11-14T08:00:00Z',
  };

  assert.strictEqual(verRecord.version, 1);
  assert.strictEqual(verRecord.configSnapshot.hiddenPages?.length, 1);
});
