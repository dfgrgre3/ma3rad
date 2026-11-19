import type { PlatformLicenseMetrics } from '../platformTypes';
import { toNumber } from '../platformUtils';
import type { AnalyticsServiceContext } from './context';
import { createMetricComparison } from './periods';

export function getLicenseMetrics(ctx: AnalyticsServiceContext): PlatformLicenseMetrics {
  ctx.requirePlatformAccess('analytics', 'platform.analytics.licenses');

  // Total licenses
  const total = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_licenses')[0]?.c ?? 0;

  // By status
  const byStatus = ctx.db.query<any>('SELECT status, COUNT(*) AS c FROM platform_licenses GROUP BY status');
  const statusCounts: Record<string, number> = {};
  for (const row of byStatus) {
    statusCounts[row.status] = toNumber(row.c, 0);
  }

  // Devices
  const devices = ctx.db.query<any>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
       SUM(CASE WHEN clone_suspected = 1 THEN 1 ELSE 0 END) AS cloneSuspected
     FROM platform_devices`
  )[0] ?? {};

  // Pending licenses (ISSUED but not ACTIVE)
  const pendingLicenses = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_licenses WHERE status = \'ISSUED\'')[0]?.c ?? 0;

  // Failed activations
  const failedActivations = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_license_activations WHERE is_online = 0 AND created_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

  // Expiring soon
  const expiringSoon = ctx.db.query<any>(
    `SELECT COUNT(*) AS c FROM platform_licenses
     WHERE status IN ('ACTIVE','ISSUED') AND expires_at IS NOT NULL
       AND date(expires_at) BETWEEN date('now') AND date('now', '+30 day')`
  )[0]?.c ?? 0;

  // Activations in period
  const activations = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_license_activations WHERE activated_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

  // Deactivations in period
  const deactivations = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_devices WHERE status IN (\'SUSPENDED\',\'RELEASED\',\'REVOKED\') AND updated_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

  // Activation success rate
  const totalActivations = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_license_activations WHERE activated_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;
  const successRate = totalActivations > 0 ? ((totalActivations - failedActivations) / totalActivations) * 100 : 100;

  // Pending licenses list
  const pendingLicensesList = ctx.db.query<any>('SELECT * FROM platform_licenses WHERE status = \'ISSUED\' LIMIT 20');

  // Failed activations list
  const failedActivationsList = ctx.db.query<any>('SELECT * FROM platform_license_activations WHERE is_online = 0 AND created_at > date(\'now\', \'-30 days\') LIMIT 20');

  return {
    activatedDevices: createMetricComparison(toNumber(devices.active, 0), 0),
    utilizationRate: createMetricComparison(
      toNumber(devices.total, 0) > 0 ? (toNumber(devices.active, 0) / toNumber(devices.total, 0)) * 100 : 0,
      0
    ),
    pendingLicenses: createMetricComparison(toNumber(pendingLicenses, 0), 0),
    failedActivations: createMetricComparison(toNumber(failedActivations, 0), 0),
    activationSuccessRate: createMetricComparison(Math.round(successRate * 100) / 100, 0),
    expiringSoon: createMetricComparison(toNumber(expiringSoon, 0), 0),
    timeSeries: {
      activations: [],
      deactivations: [],
      failedActivations: [],
      utilization: [],
    },
    failedActivationsList: failedActivationsList.map((a: any) => ({
      id: String(a.id),
      licenseId: String(a.license_id),
      tenantId: String(a.tenant_id ?? ''),
      tenantName: a.tenantName ?? '',
      licenseKey: a.license_key ?? '',
      deviceId: a.device_id ?? null,
      activationCode: a.activation_code ?? null,
      mode: a.is_online ? 'ONLINE' : 'OFFLINE',
      action: 'ACTIVATE',
      status: a.is_online ? 'SUCCESS' : 'FAILED',
      ipAddress: a.ip_address ?? null,
      notes: a.error_detail ?? null,
      createdAt: String(a.created_at),
    })),
    pendingLicensesList: pendingLicensesList.map((l: any) => ({
      id: String(l.id),
      tenantId: String(l.tenant_id),
      subscriptionId: String(l.subscription_id),
      planId: String(l.plan_id),
      licenseKey: String(l.license_key),
      status: l.status as any,
      issuedAt: String(l.issued_at),
      startsAt: String(l.starts_at),
      expiresAt: l.expires_at ?? null,
      seats: toNumber(l.seats, 1),
      deviceLimit: toNumber(l.device_limit, 1),
      branchesLimit: toNumber(l.branches_limit, 1),
      modules: JSON.parse(l.modules || '[]'),
      features: JSON.parse(l.features || '[]'),
      activationCode: l.activation_code ?? null,
      certificate: l.certificate ?? null,
      offlineGracePeriodDays: toNumber(l.offline_grace_period_days, 14),
      couplingMode: l.coupling_mode,
      hardwareId: l.hardware_id ?? null,
      notes: l.notes ?? null,
      createdAt: String(l.created_at),
      updatedAt: String(l.updated_at),
    })),
  };
}
