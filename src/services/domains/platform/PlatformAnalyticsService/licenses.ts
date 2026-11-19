import type { PlatformLicenseMetrics } from '../platformTypes';
import { toNumber } from '../platformUtils';
import type { AnalyticsServiceContext } from './context';
import { createMetricComparison, createTimeSeriesPoint } from './periods';

export function getLicenseMetrics(ctx: AnalyticsServiceContext): PlatformLicenseMetrics {
  ctx.requirePlatformAccess('analytics', 'platform.analytics.licenses');

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
  const failedActivations = ctx.db.query<any>('SELECT COUNT(*) AS c FROM platform_license_activations WHERE status = \'FAILED\' AND created_at > date(\'now\', \'-30 days\')')[0]?.c ?? 0;

  // Expiring soon
  const expiringSoon = ctx.db.query<any>(
    `SELECT COUNT(*) AS c FROM platform_licenses
     WHERE status IN ('ACTIVE','ISSUED') AND expires_at IS NOT NULL
       AND date(expires_at) BETWEEN date('now') AND date('now', '+30 day')`
  )[0]?.c ?? 0;

  // Activation success rate (attempts in the last 30 days)
  const activationStats = ctx.db.query<any>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success
     FROM platform_license_activations
     WHERE created_at > date('now', '-30 days')`
  )[0] ?? {};
  const totalActivations = toNumber(activationStats.total, 0);
  const successActivations = toNumber(activationStats.success, 0);
  const successRate = totalActivations > 0 ? (successActivations / totalActivations) * 100 : 100;

  // Pending licenses list (joined for tenant / plan names)
  const pendingLicensesList = ctx.db.query<any>(
    `SELECT l.*, t.name AS tenant_name, p.name AS plan_name
     FROM platform_licenses l
     LEFT JOIN platform_tenants t ON t.id = l.tenant_id
     LEFT JOIN platform_plans p ON p.id = l.plan_id
     WHERE l.status = 'ISSUED' LIMIT 20`
  );

  // Failed activations list (joined for license key / tenant name)
  const failedActivationsList = ctx.db.query<any>(
    `SELECT a.*, l.license_key, t.name AS tenant_name
     FROM platform_license_activations a
     LEFT JOIN platform_licenses l ON l.id = a.license_id
     LEFT JOIN platform_tenants t ON t.id = a.tenant_id
     WHERE a.status = 'FAILED' AND a.created_at > date('now', '-30 days')
     ORDER BY a.created_at DESC
     LIMIT 20`
  );

  // Activations / failures time series (daily, last 30 days)
  const activationsSeries = ctx.db.query<any>(
    `SELECT date(activated_at) AS period, COUNT(*) AS count
     FROM platform_license_activations
     WHERE activated_at IS NOT NULL AND activated_at > date('now', '-30 days')
     GROUP BY period ORDER BY period`
  ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

  const failedSeries = ctx.db.query<any>(
    `SELECT date(created_at) AS period, COUNT(*) AS count
     FROM platform_license_activations
     WHERE status = 'FAILED' AND created_at > date('now', '-30 days')
     GROUP BY period ORDER BY period`
  ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

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
      activations: activationsSeries,
      deactivations: [],
      failedActivations: failedSeries,
      utilization: [],
    },
    failedActivationsList: failedActivationsList.map((a: any) => ({
      id: String(a.id),
      licenseId: String(a.license_id),
      tenantId: String(a.tenant_id ?? ''),
      tenantName: a.tenant_name ?? '',
      licenseKey: a.license_key ?? '',
      deviceId: a.device_id ?? null,
      activationCode: a.activation_code ?? null,
      mode: a.mode === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
      action: a.action ?? 'ACTIVATE',
      status: a.status === 'FAILED' ? 'FAILED' : a.status === 'PENDING' ? 'PENDING' : 'SUCCESS',
      ipAddress: a.ip_address ?? null,
      notes: a.notes ?? null,
      createdAt: String(a.created_at),
    })),
    pendingLicensesList: pendingLicensesList.map((l: any) => ({
      id: String(l.id),
      tenantId: String(l.tenant_id),
      tenantName: l.tenant_name ?? null,
      subscriptionId: l.subscription_id != null ? String(l.subscription_id) : null,
      planId: l.plan_id != null ? String(l.plan_id) : null,
      planName: l.plan_name ?? null,
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
