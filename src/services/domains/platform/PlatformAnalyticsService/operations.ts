import type { PlatformOperationsMetrics } from '../platformTypes';
import { toNumber } from '../platformUtils';
import type { AnalyticsServiceContext } from './context';
import { createMetricComparison } from './periods';

export function getOperationsMetrics(ctx: AnalyticsServiceContext): PlatformOperationsMetrics {
  ctx.requirePlatformAccess('analytics', 'platform.analytics.operations');

  // Connected/disconnected devices
  const devices = ctx.db.query<any>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended
     FROM platform_devices`
  )[0] ?? {};

  // Sync errors
  const sync = ctx.db.query<any>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
       SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed
     FROM platform_sync_log
     WHERE created_at > date('now', '-30 days')`
  )[0] ?? {};

  // API health (simplified)
  const apiSuccessRate = toNumber(sync.total, 0) > 0 ? (toNumber(sync.success, 0) / toNumber(sync.total, 0)) * 100 : 100;

  // Recent sync errors
  const recentSyncErrors = ctx.db.query<any>(
    `SELECT sl.*, d.hardware_id, t.name AS tenantName
     FROM platform_sync_log sl
     JOIN platform_devices d ON d.id = sl.device_id
     JOIN platform_tenants t ON t.id = d.license_id
     WHERE sl.status = 'FAILED' AND sl.created_at > date('now', '-30 days')
     ORDER BY sl.created_at DESC
     LIMIT 20`
  );

  return {
    connectedDevices: createMetricComparison(toNumber(devices.active, 0), 0),
    disconnectedDevices: createMetricComparison(toNumber(devices.suspended, 0), 0),
    syncErrors: createMetricComparison(toNumber(sync.failed, 0), 0),
    apiHealth: createMetricComparison(Math.round(apiSuccessRate * 100) / 100, 0),
    averageResponseTime: createMetricComparison(0, 0),
    timeSeries: {
      onlineDevices: [],
      offlineDevices: [],
      syncErrors: [],
      apiSuccessRate: [],
    },
    recentSyncErrors: recentSyncErrors.map((e: any) => ({
      id: String(e.id),
      deviceId: String(e.device_id),
      deviceName: e.hardware_id,
      tenantId: String(e.tenant_id),
      tenantName: String(e.tenantName),
      error: String(e.error_detail ?? 'Unknown error'),
      occurredAt: String(e.created_at),
      resolved: false,
    })),
    apiEndpointsHealth: [],
  };
}
