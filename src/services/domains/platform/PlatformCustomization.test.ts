import { describe, it, expect } from 'vitest';
import type {
  PlatformUiProfile,
  PlatformTenantUiCustomization,
  PlatformTenantUiVersion,
} from './platformTypes';

describe('UI Customization & Layout Control Types', () => {
  it('should model activity-based UI profile correctly', () => {
    const profile: PlatformUiProfile = {
      id: 'uip_ceramics',
      code: 'CERAMICS',
      name: 'معارض السيراميك والبورسلين',
      businessType: 'ceramics',
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

    expect(profile.code).toBe('CERAMICS');
    expect(profile.hiddenPages).toContain('/restaurant-tables');
    expect(profile.formFieldRules.colorTone.visible).toBe(true);
    expect(profile.formFieldRules.expiryDate.visible).toBe(false);
  });

  it('should model per-tenant UI customizations independently', () => {
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

    expect(custom.tenantId).toBe('tenant_1');
    expect(custom.hiddenPages).toHaveLength(3);
    expect(custom.hiddenActions).toContain('export_excel');
    expect(custom.version).toBe(3);
  });

  it('should support snapshot history and rollback records', () => {
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

    expect(verRecord.version).toBe(1);
    expect(verRecord.configSnapshot.hiddenPages).toHaveLength(1);
  });
});
