import type { PlatformOperationsMetrics } from '../platformTypes';
import { toNumber } from '../platformUtils';
import type { AnalyticsServiceContext } from './context';
import { createMetricComparison, createTimeSeriesPoint } from './periods';

export function getOperationsMetrics(ctx: AnalyticsServiceContext): PlatformOperationsMetrics {
  ctx.requirePlatformAccess('analytics', 'platform.analytics.operations');

  // Connected/disconnected devices
  const devices = ctx.db.query<any>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status <> 'ACTIVE' THEN 1 ELSE 0 END) AS offline
     FROM platform_devices`
  )[0] ?? {};

  // Sync events — platform_sync_log.status is SUCCESS | FAIL | PARTIAL
  const sync = ctx.db.query<any>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
       SUM(CASE WHEN status IN ('FAIL','PARTIAL') THEN 1 ELSE 0 END) AS failed
     FROM platform_sync_log
     WHERE created_at > date('now', '-30 days')`
  )[0] ?? {};

  // Sync success rate (labeled apiHealth for dashboard compatibility)
  const apiSuccessRate = toNumber(sync.total, 0) > 0 ? (toNumber(sync.success, 0) / toNumber(sync.total, 0)) * 100 : 100;

  // Recent sync errors — join on tenant_id/device_id (not license_id)
  const recentSyncErrors = ctx.db.query<any>(
    `SELECT sl.id, sl.device_id, d.hardware_id, sl.tenant_id, t.name AS tenant_name,
            sl.error_detail, sl.created_at
     FROM platform_sync_log sl
     LEFT JOIN platform_devices d ON d.id = sl.device_id
     LEFT JOIN platform_tenants t ON t.id = sl.tenant_id
     WHERE sl.status IN ('FAIL','PARTIAL') AND sl.created_at > date('now', '-30 days')
     ORDER BY sl.created_at DESC
     LIMIT 20`
  );

  // Daily time series (last 30 days)
  const onlineSeries = ctx.db.query<any>(
    `SELECT date(last_seen_at) AS period, COUNT(*) AS count
     FROM platform_devices
     WHERE status = 'ACTIVE' AND last_seen_at IS NOT NULL AND last_seen_at > date('now', '-30 days')
     GROUP BY period ORDER BY period`
  ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

  const syncErrorsSeries = ctx.db.query<any>(
    `SELECT date(created_at) AS period, COUNT(*) AS count
     FROM platform_sync_log
     WHERE status IN ('FAIL','PARTIAL') AND created_at > date('now', '-30 days')
     GROUP BY period ORDER BY period`
  ).map(r => createTimeSeriesPoint(r.period, toNumber(r.count, 0)));

  const apiSeries = ctx.db.query<any>(
    `SELECT date(created_at) AS period,
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success
     FROM platform_sync_log
     WHERE created_at > date('now', '-30 days')
     GROUP BY period ORDER BY period`
  ).map(r => createTimeSeriesPoint(
    r.period,
    toNumber(r.total, 0) > 0 ? Math.round((toNumber(r.success, 0) / toNumber(r.total, 0)) * 10000) / 100 : 100
  ));

  return {
    connectedDevices: createMetricComparison(toNumber(devices.active, 0), 0),
    disconnectedDevices: createMetricComparison(toNumber(devices.offline, 0), 0),
    syncErrors: createMetricComparison(toNumber(sync.failed, 0), 0),
    apiHealth: createMetricComparison(Math.round(apiSuccessRate * 100) / 100, 0),
    averageResponseTime: createMetricComparison(0, 0),
    timeSeries: {
      onlineDevices: onlineSeries,
      offlineDevices: [],
      syncErrors: syncErrorsSeries,
      apiSuccessRate: apiSeries,
    },
    recentSyncErrors: recentSyncErrors.map((e: any) => ({
      id: String(e.id),
      deviceId: String(e.device_id ?? ''),
      deviceName: e.hardware_id ?? '',
      tenantId: String(e.tenant_id ?? ''),
      tenantName: e.tenant_name ?? '',
      error: String(e.error_detail ?? 'Unknown error'),
      occurredAt: String(e.created_at),
      resolved: false,
    })),
    apiEndpointsHealth: [],
  };
}
