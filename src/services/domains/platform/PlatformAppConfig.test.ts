import { describe, it, expect } from 'vitest';
import type {
  PlatformConfigTemplate,
  PlatformTenantConfig,
  PlatformConfigRollout,
  PlatformConfigAck,
} from './platformTypes';

describe('Central App Configuration & Phased Rollout Types', () => {
  it('should model central configuration templates correctly', () => {
    const template: PlatformConfigTemplate = {
      id: 'pct_ceramics',
      code: 'CERAMICS_DEFAULT',
      name: 'معارض ومستودعات السيراميك',
      businessType: 'ceramics',
      configPayload: {
        taxRate: 14,
        currency: 'EGP',
        syncIntervalSec: 15,
        enableToneManagement: true,
        enableCaliberSize: true,
      },
      version: 1,
      isDefault: false,
      createdAt: '2026-11-14T20:00:00Z',
      updatedAt: '2026-11-14T20:00:00Z',
    };

    expect(template.code).toBe('CERAMICS_DEFAULT');
    expect(template.configPayload.enableToneManagement).toBe(true);
    expect(template.version).toBe(1);
  });

  it('should model signed tenant configuration and verify signature integrity presence', () => {
    const tenantCfg: PlatformTenantConfig = {
      id: 'tcfg_tenant_44',
      tenantId: 'tenant_44',
      templateId: 'pct_ceramics',
      configPayload: {
        taxRate: 14,
        currency: 'EGP',
        syncIntervalSec: 15,
      },
      signature: 'sig_v1_mocked_ed25519_base64_hash_signature',
      version: 2,
      status: 'ACTIVE',
      createdAt: '2026-11-14T10:00:00Z',
      updatedAt: '2026-11-14T12:00:00Z',
    };

    expect(tenantCfg.tenantId).toBe('tenant_44');
    expect(tenantCfg.signature).toMatch(/^sig_v1_/);
    expect(tenantCfg.status).toBe('ACTIVE');
    expect(tenantCfg.version).toBe(2);
  });

  it('should model canary phased rollout campaigns and device ACK tracking', () => {
    const rollout: PlatformConfigRollout = {
      id: 'ro_001',
      title: 'تحديث قواعد المزامنة والضرائب الجديدة - تجريبي 20%',
      targetType: 'CANARY_PERCENT',
      targetFilter: { percentage: 20 },
      configSnapshot: { taxRate: 14, syncIntervalSec: 10 },
      signature: 'sig_v1_rollout_signature',
      status: 'IN_PROGRESS',
      totalTenants: 50,
      receivedCount: 10,
      appliedCount: 9,
      failedCount: 1,
      createdBy: 'super-admin',
      createdAt: '2026-11-14T18:00:00Z',
    };

    const ack: PlatformConfigAck = {
      id: 'ack_123',
      tenantId: 'tenant_44',
      deviceId: 'device-terminal-01',
      rolloutId: 'ro_001',
      version: 2,
      status: 'APPLIED',
      acknowledgedAt: '2026-11-14T18:05:00Z',
    };

    expect(rollout.targetType).toBe('CANARY_PERCENT');
    expect(rollout.receivedCount).toBe(10);
    expect(ack.status).toBe('APPLIED');
  });
});
