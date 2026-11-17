import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  PlatformStaffSession,
  PlatformStaffLogin,
  PlatformCentralSecurityIncident,
  PlatformSigningKey,
  PlatformCentralSecurityOverview,
} from './platformTypes';

test('should model staff sessions and trusted devices with remote revocation capability', () => {
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

  assert.strictEqual(session.isTrustedDevice, true);
  assert.strictEqual(session.isCurrent, false);
  assert.strictEqual(session.staffRole, 'SUPPORT_AGENT');
});

test('should model staff login audit with failure reasons and IP tracking', () => {
  const failedLogin: PlatformStaffLogin = {
    id: 'log_901',
    email: 'attacker@unknown.net',
    ipAddress: '45.12.89.2',
    userAgent: 'Python-requests/2.28',
    status: 'BLOCKED',
    failureReason: 'IP blocked due to repeated brute-force attempts',
    attemptedAt: '2026-11-14T20:15:00Z',
  };

  assert.strictEqual(failedLogin.status, 'BLOCKED');
  assert.ok(failedLogin.failureReason?.includes('brute-force'));
});

test('should model cryptographic signing key lifecycle and rotation', () => {
  const key: PlatformSigningKey = {
    id: 'key_master_license_v2',
    alias: 'master_license_signer',
    keyAlias: 'central_license_signer',
    algorithm: 'Ed25519',
    version: 2,
    status: 'ACTIVE',
    createdAt: '2026-11-14T20:00:00Z',
  };

  assert.strictEqual(key.version, 2);
  assert.strictEqual(key.status, 'ACTIVE');
  assert.strictEqual(key.algorithm, 'Ed25519');
});

test('should aggregate central security posture metrics and incidents', () => {
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

  assert.strictEqual(overview.securityScore, 92);
  assert.strictEqual(overview.twoFactorEnforcement.enabled, true);
  assert.strictEqual(overview.twoFactorEnforcement.compliantStaffCount, 5);
});
