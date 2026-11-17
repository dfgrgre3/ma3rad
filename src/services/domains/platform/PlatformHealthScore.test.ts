import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  PlatformTechnicalHealthMetrics,
  PlatformHealthDashboardData,
} from './platformTypes';

test('should model technical health metrics with reliability & uptime scores', () => {
  const tech: PlatformTechnicalHealthMetrics = {
    score: 95,
    status: 'HEALTHY',
    availabilityRate: 99.95,
    apiLatencyMs: 42,
    apiSuccessRate: 99.98,
    apiErrorRate: 0.02,
    syncSuccessRate: 98.5,
    syncFailedCount: 3,
    staleDevicesCount: 1,
    totalDevicesCount: 65,
    licenseIntegrityAlerts: 0,
    failedOpsJobsCount: 0,
    lastBackupStatus: 'SUCCESS',
    lastBackupAgeHours: 4,
    openIncidents: {
      critical: 0,
      major: 0,
      minor: 1,
    },
    alerts: [
      {
        id: 'alt_01',
        title: 'تأخر طفيف في نبض جهاز فرعي',
        description: 'جهاز فرع المعادي لم يرسل نبضات منذ 26 ساعة',
        severity: 'WARNING',
        category: 'DEVICES',
        timestamp: '2026-11-14T20:00:00Z',
        link: '/platform/devices',
      },
    ],
  };

  assert.strictEqual(tech.score, 95);
  assert.strictEqual(tech.status, 'HEALTHY');
  assert.ok(tech.availabilityRate > 99);
  assert.ok(tech.apiLatencyMs < 100);
  assert.strictEqual(tech.lastBackupStatus, 'SUCCESS');
  assert.strictEqual(tech.alerts[0].severity, 'WARNING');
});

test('should properly structure business commercial health alongside technical metrics', () => {
  const dashboard: PlatformHealthDashboardData = {
    technical: {
      score: 82,
      status: 'DEGRADED',
      availabilityRate: 98.5,
      apiLatencyMs: 160,
      apiSuccessRate: 98.8,
      apiErrorRate: 1.2,
      syncSuccessRate: 92.0,
      syncFailedCount: 14,
      staleDevicesCount: 4,
      totalDevicesCount: 80,
      licenseIntegrityAlerts: 1,
      failedOpsJobsCount: 2,
      lastBackupStatus: 'SUCCESS',
      lastBackupAgeHours: 12,
      openIncidents: { critical: 0, major: 1, minor: 2 },
      alerts: [],
    },
    business: {
      tenants: { total: 120, active: 110, trial: 5, suspended: 3, expired: 2, cancelled: 0, expiringSoon: 8 },
      licenses: { total: 250, active: 230, suspended: 5, revoked: 2, expired: 13, expiringSoon: 15 },
      subscriptions: { total: 120, active: 112, trial: 4, expired: 4, cancelled: 0, expiringSoon: 9 },
      billing: { revenueTotal: 5400000, revenueThisMonth: 450000, invoicedTotal: 68000, outstanding: 68000, overdueInvoices: 12, mrr: 450000, invoicesTotal: 340, paidInvoices: 310, draftInvoices: 18 },
      devices: { boundLicenses: 0, unboundLicenses: 0, devicesLimit: 0 },
      branches: { totalLimit: 0, installationBranches: 0 },
      releases: [],
      moduleUsage: [],
      revenueByPlan: [],
      recentTenants: [],
      expiringLicenses: [],
      expiringSubscriptions: [],
      recentPayments: [],
      currentInstallation: null,
      alerts: [],
      recentAudit: [],
    },
  };

  assert.strictEqual(dashboard.technical.score, 82);
  assert.strictEqual(dashboard.technical.status, 'DEGRADED');

  // Business assertions
  assert.strictEqual(dashboard.business.tenants.total, 120);
  assert.strictEqual(dashboard.business.billing.mrr, 450000);
  assert.strictEqual(dashboard.business.tenants.active, 110);
});

test('should classify alert severities and categories correctly', () => {
  const alertCritical = {
    id: 'alt_crit',
    title: 'فشل النسخة الاحتياطية',
    description: 'فشل التحقق التلقائي',
    severity: 'CRITICAL' as const,
    category: 'BACKUPS' as const,
    timestamp: '2026-11-14T20:00:00Z',
  };

  assert.ok(['CRITICAL', 'WARNING', 'INFO'].includes(alertCritical.severity));
  assert.ok(['INFRASTRUCTURE', 'SYNC', 'DEVICES', 'LICENSES', 'BACKUPS', 'JOBS'].includes(alertCritical.category));
});
