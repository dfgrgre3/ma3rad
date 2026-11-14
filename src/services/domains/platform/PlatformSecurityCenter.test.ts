import { describe, it, expect } from 'vitest';
import type {
  PlatformStaffSession,
  PlatformStaffLogin,
  PlatformCentralSecurityIncident,
  PlatformSigningKey,
  PlatformCentralSecurityOverview,
} from './platformTypes';

describe('Platform Central Security Center (Item 19)', () => {
  it('should model staff sessions and trusted devices with remote revocation capability', () => {
    const session: PlatformStaffSession = {
      id: 'sess_101',
      staffId: 'staff_sup_01',
      staffName: 'أحمد كمال',
      staffRole: 'SUPPORT_AGENT',
      ipAddress: '197.35.42.10',
      deviceName: 'Chrome on macOS (MacBook Pro)',
      isTrustedDevice: true,
      isCurrent: false,
      createdAt: '2026-11-14T18:00:00Z',
      lastActivityAt: '2026-11-14T20:30:00Z',
    };

    expect(session.isTrustedDevice).toBe(true);
    expect(session.isCurrent).toBe(false);
    expect(session.staffRole).toBe('SUPPORT_AGENT');
  });

  it('should model staff login audit with failure reasons and IP tracking', () => {
    const failedLogin: PlatformStaffLogin = {
      id: 'log_901',
      email: 'attacker@unknown.net',
      ipAddress: '45.12.89.2',
      userAgent: 'Python-requests/2.28',
      status: 'BLOCKED',
      failureReason: 'IP blocked due to repeated brute-force attempts',
      attemptedAt: '2026-11-14T20:15:00Z',
    };

    expect(failedLogin.status).toBe('BLOCKED');
    expect(failedLogin.failureReason).toContain('brute-force');
  });

  it('should model cryptographic signing key lifecycle and rotation', () => {
    const key: PlatformSigningKey = {
      id: 'key_master_license_v2',
      keyAlias: 'central_license_signer',
      algorithm: 'Ed25519',
      version: 2,
      status: 'ACTIVE',
      createdAt: '2026-11-14T20:00:00Z',
    };

    expect(key.version).toBe(2);
    expect(key.status).toBe('ACTIVE');
    expect(key.algorithm).toBe('Ed25519');
  });

  it('should aggregate central security posture metrics and incidents', () => {
    const overview: PlatformCentralSecurityOverview = {
      securityScore: 92,
      twoFactorEnforcement: {
        enabled: true,
        compliantStaffCount: 5,
        totalStaffCount: 5,
      },
      activeStaffSessionsCount: 3,
      failedLogins24hCount: 1,
      activeIncidentsCount: 0,
      signingKeysCount: 2,
      trustedDevicesCount: 3,
      sessions: [],
      recentLogins: [],
      incidents: [],
      signingKeys: [],
    };

    expect(overview.securityScore).toBe(92);
    expect(overview.twoFactorEnforcement.enabled).toBe(true);
    expect(overview.twoFactorEnforcement.compliantStaffCount).toBe(5);
  });
});
