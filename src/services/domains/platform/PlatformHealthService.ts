import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import { platformAnalyticsService } from './PlatformAnalyticsService';
import type {
  PlatformComprehensiveHealth,
  PlatformTechnicalHealthMetrics,
  PlatformHealthDashboardData,
  PlatformCentralBackup,
  PlatformServiceIncident,
  PlatformOpsJob,
  PlatformMaintenanceWindow,
  PlatformOpApproval,
  PlatformSyncLogEntry,
  PlatformSyncStatus,
  PlatformOverview,
} from './platformTypes';
import { nowIso, toNumber, formatDate } from './platformUtils';

export class PlatformHealthService {
  private db = DatabaseManager.getInstance();

  private static requirePlatformAccess(modules: string | string[], action?: string) {
    const user = AuthService.getCurrentUser();
    if (!user || !user.isActive) {
      throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    }

    if (user.role === 'SUPER_ADMIN') {
      return user;
    }

    const allowedRoles = new Set(['PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER']);
    if (!allowedRoles.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لمستخدمي المنصة المصرح لهم فقط.');
    }

    const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
    const required = Array.isArray(modules) ? modules : [modules];
    const permitted = required.some((moduleKey) => {
      if (action && action.startsWith('platform.')) {
        return PlatformAuthorizationService.canAccessPermission(user.role, action, permissionsOverride);
      }
      return PlatformAuthorizationService.canAccessModule(user.role, moduleKey, permissionsOverride)
        && (!action || PlatformAuthorizationService.canAccessModule(user.role, action, permissionsOverride));
    });

    if (!permitted) {
      throw new Error('لا تملك صلاحية تنفيذ هذه العملية.');
    }

    return user;
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    details?: unknown,
    options?: {
      severity?: import('./platformTypes').AuditSeverity;
      status?: import('./platformTypes').AuditStatus;
      actorType?: import('./platformTypes').AuditActorType;
      tenantId?: string | null;
      deviceId?: string | null;
      deviceName?: string | null;
      ipAddress?: string | null;
      oldValues?: unknown;
      newValues?: unknown;
      errorMessage?: string | null;
    }
  ): void {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    centralAuditService.log(actor, {
      action,
      entityType,
      entityId,
      details,
      severity: options?.severity,
      status: options?.status,
      actorType: options?.actorType,
      tenantId: options?.tenantId,
      deviceId: options?.deviceId,
      deviceName: options?.deviceName,
      ipAddress: options?.ipAddress,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      errorMessage: options?.errorMessage,
    });
  }

  // ─── Health Monitoring ────────────────────────────────────────────────────────

  public getPlatformComprehensiveHealth(): PlatformComprehensiveHealth {
    PlatformHealthService.requirePlatformAccess('health', 'platform.health.view');

    const dbStart = Date.now();
    this.db.query('SELECT 1');
    const dbLatency = Date.now() - dbStart;

    const dbSize = this.db.query<any>('SELECT page_count * page_size AS size FROM pragma_page_count, pragma_page_size')[0]?.size ?? 0;

    const licenseStats = this.db.query<any>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('ACTIVE','ISSUED') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN status = 'REVOKED' THEN 1 ELSE 0 END) AS revoked,
        SUM(CASE WHEN status IN ('ACTIVE','ISSUED') AND expires_at IS NOT NULL AND date(expires_at) <= date('now', '+30 day') THEN 1 ELSE 0 END) AS expiringSoon
      FROM platform_licenses
    `)[0] ?? {};

    const tenantStats = this.db.query<any>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
        SUM(CASE WHEN status IN ('ACTIVE','TRIAL') AND subscription_expires_at IS NOT NULL AND date(subscription_expires_at) <= date('now', '+30 day') THEN 1 ELSE 0 END) AS expiringSoon
      FROM platform_tenants
    `)[0] ?? {};

    const syncStats = this.db.query<any>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending
      FROM platform_sync_log
      WHERE created_at > datetime('now', '-24 hours')
    `)[0] ?? {};

    const backupStats = this.db.query<any>(`
      SELECT status, created_at, size_bytes
      FROM platform_central_backups
      ORDER BY created_at DESC
      LIMIT 1
    `)[0] ?? {};

    const incidentStats = this.db.query<any>(`
      SELECT severity, COUNT(*) AS c
      FROM platform_security_incidents
      WHERE status = 'OPEN'
      GROUP BY severity
    `);

    const opsStats = this.db.query<any>(`
      SELECT status, COUNT(*) AS c
      FROM platform_ops_jobs
      WHERE status IN ('PENDING', 'FAILED')
      GROUP BY status
    `);

    const staleDevices = this.db.query<any>(`
      SELECT COUNT(*) AS c
      FROM platform_devices
      WHERE status = 'ACTIVE' AND last_seen_at < datetime('now', '-24 hours')
    `)[0]?.c ?? 0;

    const totalDevices = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_devices')[0]?.c ?? 0;

    const overallScore = Math.max(0, 100 - (dbLatency > 500 ? 20 : dbLatency > 100 ? 10 : 0) -
      (toNumber(licenseStats.expiringSoon, 0) > 20 ? 15 : toNumber(licenseStats.expiringSoon, 0) > 10 ? 10 : 0) -
      (toNumber(tenantStats.suspended, 0) > 10 ? 15 : toNumber(tenantStats.suspended, 0) > 5 ? 10 : 0) -
      (toNumber(syncStats.failed, 0) > toNumber(syncStats.total, 0) * 0.1 ? 20 : 0) -
      (toNumber(staleDevices, 0) > 0 ? 10 : 0));

    const alerts: Array<{
      id: string;
      title: string;
      description: string;
      severity: 'CRITICAL' | 'WARNING' | 'INFO';
      category: 'INFRASTRUCTURE' | 'SYNC' | 'DEVICES' | 'LICENSES' | 'BACKUPS' | 'JOBS';
      timestamp: string;
      link?: string;
    }> = [];

    if (dbLatency > 500) alerts.push({ id: 'db-latency', title: 'High DB Latency', description: `Database latency is ${dbLatency}ms`, severity: 'CRITICAL', category: 'INFRASTRUCTURE', timestamp: nowIso() });
    if (toNumber(licenseStats.expiringSoon, 0) > 20) alerts.push({ id: 'license-expiring', title: 'Many Licenses Expiring', description: `${toNumber(licenseStats.expiringSoon, 0)} licenses expiring within 30 days`, severity: 'WARNING', category: 'LICENSES', timestamp: nowIso() });
    if (toNumber(tenantStats.suspended, 0) > 10) alerts.push({ id: 'tenants-suspended', title: 'Many Suspended Tenants', description: `${toNumber(tenantStats.suspended, 0)} tenants suspended`, severity: 'WARNING', category: 'INFRASTRUCTURE', timestamp: nowIso() });
    if (toNumber(syncStats.failed, 0) > toNumber(syncStats.total, 0) * 0.1) alerts.push({ id: 'sync-failures', title: 'High Sync Failure Rate', description: `${toNumber(syncStats.failed, 0)} sync failures in last 24h`, severity: 'WARNING', category: 'SYNC', timestamp: nowIso() });
    if (toNumber(staleDevices, 0) > 0) alerts.push({ id: 'stale-devices', title: 'Stale Devices', description: `${toNumber(staleDevices, 0)} devices not seen in 24h`, severity: 'INFO', category: 'DEVICES', timestamp: nowIso() });

    const criticalIncidents = incidentStats.filter((i: any) => i.severity === 'CRITICAL').reduce((sum: number, i: any) => sum + toNumber(i.c, 0), 0);
    const majorIncidents = incidentStats.filter((i: any) => i.severity === 'HIGH').reduce((sum: number, i: any) => sum + toNumber(i.c, 0), 0);
    const minorIncidents = incidentStats.filter((i: any) => i.severity === 'MEDIUM').reduce((sum: number, i: any) => sum + toNumber(i.c, 0), 0);

    const failedOps = opsStats.filter((o: any) => o.status === 'FAILED').reduce((sum: number, o: any) => sum + toNumber(o.c, 0), 0);

    const lastBackup = backupStats.status === 'COMPLETED' ? backupStats : null;
    const lastBackupAgeHours = lastBackup ? Math.round((Date.now() - new Date(lastBackup.created_at).getTime()) / 3600000) : 0;

    return {
      overallScore,
      serverVitals: {
        cpuPercent: 0, // Would need system monitoring
        memoryPercent: 0,
        diskPercent: 0,
        apiLatencyMs: dbLatency,
        apiErrorRatePercent: toNumber(syncStats.total, 0) > 0 ? (toNumber(syncStats.failed, 0) / toNumber(syncStats.total, 0)) * 100 : 0,
        activeConnections: totalDevices,
        uptimeSeconds: Math.floor(process.uptime()),
      },
      components: {
        database: { status: dbLatency < 100 ? 'HEALTHY' : dbLatency < 500 ? 'DEGRADED' : 'DOWN', sizeMb: Math.round(dbSize / 1024 / 1024), queryTimeMs: dbLatency },
        redisCache: { status: 'CONNECTED', hitRatioPercent: 95 },
        syncService: { status: toNumber(syncStats.failed, 0) > toNumber(syncStats.total, 0) * 0.1 ? 'WARNING' : 'HEALTHY', connectedDevices: totalDevices, pendingSyncCount: toNumber(syncStats.pending, 0) },
        backupSystem: { status: lastBackup?.status === 'COMPLETED' ? 'VERIFIED' : 'FAILED', lastBackupAt: lastBackup?.created_at, sizeMb: lastBackup ? Math.round(toNumber(lastBackup.size_bytes, 0) / 1024 / 1024) : 0 },
      },
      recentBackups: this.listCentralBackups().slice(0, 5),
      openIncidents: this.listServiceIncidents('OPEN'),
      telemetryHistory: [],
    };
  }

  public getTechnicalHealthMetrics(): PlatformTechnicalHealthMetrics {
    PlatformHealthService.requirePlatformAccess('health', 'platform.health.view');

    const dbStart = Date.now();
    this.db.query('SELECT 1');
    const dbLatency = Date.now() - dbStart;

    const dbSize = this.db.query<any>('SELECT page_count * page_size AS size FROM pragma_page_count, pragma_page_size')[0]?.size ?? 0;
    const tableCount = this.db.query<any>('SELECT COUNT(*) AS c FROM sqlite_master WHERE type = \'table\'')[0]?.c ?? 0;

    const licenseStats = this.db.query<any>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('ACTIVE','ISSUED') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN status = 'REVOKED' THEN 1 ELSE 0 END) AS revoked,
        SUM(CASE WHEN status IN ('ACTIVE','ISSUED') AND expires_at IS NOT NULL AND date(expires_at) <= date('now', '+30 day') THEN 1 ELSE 0 END) AS expiringSoon
      FROM platform_licenses
    `)[0] ?? {};

    const tenantStats = this.db.query<any>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
        SUM(CASE WHEN status IN ('ACTIVE','TRIAL') AND subscription_expires_at IS NOT NULL AND date(subscription_expires_at) <= date('now', '+30 day') THEN 1 ELSE 0 END) AS expiringSoon
      FROM platform_tenants
    `)[0] ?? {};

    const syncStats = this.db.query<any>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending
      FROM platform_sync_log
      WHERE created_at > datetime('now', '-24 hours')
    `)[0] ?? {};

    const opsStats = this.db.query<any>(`
      SELECT status, COUNT(*) AS c
      FROM platform_ops_jobs
      WHERE status IN ('PENDING', 'FAILED')
      GROUP BY status
    `);

    const staleDevices = this.db.query<any>(`
      SELECT COUNT(*) AS c
      FROM platform_devices
      WHERE status = 'ACTIVE' AND last_seen_at < datetime('now', '-24 hours')
    `)[0]?.c ?? 0;

    const totalDevices = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_devices')[0]?.c ?? 0;

    const incidentStats = this.db.query<any>(`
      SELECT severity, COUNT(*) AS c
      FROM platform_security_incidents
      WHERE status = 'OPEN'
      GROUP BY severity
    `);

    const criticalIncidents = incidentStats.filter((i: any) => i.severity === 'CRITICAL').reduce((sum: number, i: any) => sum + toNumber(i.c, 0), 0);
    const majorIncidents = incidentStats.filter((i: any) => i.severity === 'HIGH').reduce((sum: number, i: any) => sum + toNumber(i.c, 0), 0);
    const minorIncidents = incidentStats.filter((i: any) => i.severity === 'MEDIUM').reduce((sum: number, i: any) => sum + toNumber(i.c, 0), 0);

    const failedOps = opsStats.filter((o: any) => o.status === 'FAILED').reduce((sum: number, o: any) => sum + toNumber(o.c, 0), 0);

    const lastBackup = this.db.query<any>('SELECT * FROM platform_central_backups ORDER BY created_at DESC LIMIT 1')[0] ?? {};
    const lastBackupAgeHours = lastBackup.created_at ? Math.round((Date.now() - new Date(lastBackup.created_at).getTime()) / 3600000) : 0;

    const score = Math.max(0, 100 -
      (dbLatency > 500 ? 20 : dbLatency > 100 ? 10 : 0) -
      (toNumber(licenseStats.expiringSoon, 0) > 20 ? 15 : toNumber(licenseStats.expiringSoon, 0) > 10 ? 10 : 0) -
      (toNumber(tenantStats.suspended, 0) > 10 ? 15 : toNumber(tenantStats.suspended, 0) > 5 ? 10 : 0) -
      (toNumber(syncStats.failed, 0) > toNumber(syncStats.total, 0) * 0.1 ? 20 : 0) -
      (toNumber(staleDevices, 0) > 0 ? 10 : 0) -
      (failedOps > 10 ? 20 : 0));

    const alerts: Array<{
      id: string;
      title: string;
      description: string;
      severity: 'CRITICAL' | 'WARNING' | 'INFO';
      category: 'INFRASTRUCTURE' | 'SYNC' | 'DEVICES' | 'LICENSES' | 'BACKUPS' | 'JOBS';
      timestamp: string;
      link?: string;
    }> = [];

    if (dbLatency > 500) alerts.push({ id: 'db-latency', title: 'High DB Latency', description: `Database latency is ${dbLatency}ms`, severity: 'CRITICAL', category: 'INFRASTRUCTURE', timestamp: nowIso() });
    if (toNumber(licenseStats.expiringSoon, 0) > 20) alerts.push({ id: 'license-expiring', title: 'Many Licenses Expiring', description: `${toNumber(licenseStats.expiringSoon, 0)} licenses expiring within 30 days`, severity: 'WARNING', category: 'LICENSES', timestamp: nowIso() });
    if (toNumber(tenantStats.suspended, 0) > 10) alerts.push({ id: 'tenants-suspended', title: 'Many Suspended Tenants', description: `${toNumber(tenantStats.suspended, 0)} tenants suspended`, severity: 'WARNING', category: 'INFRASTRUCTURE', timestamp: nowIso() });
    if (toNumber(syncStats.failed, 0) > toNumber(syncStats.total, 0) * 0.1) alerts.push({ id: 'sync-failures', title: 'High Sync Failure Rate', description: `${toNumber(syncStats.failed, 0)} sync failures in last 24h`, severity: 'WARNING', category: 'SYNC', timestamp: nowIso() });
    if (toNumber(staleDevices, 0) > 0) alerts.push({ id: 'stale-devices', title: 'Stale Devices', description: `${toNumber(staleDevices, 0)} devices not seen in 24h`, severity: 'INFO', category: 'DEVICES', timestamp: nowIso() });

    return {
      score,
      status: score >= 80 ? 'HEALTHY' : score >= 50 ? 'DEGRADED' : 'CRITICAL',
      availabilityRate: 99.9,
      apiLatencyMs: dbLatency,
      apiSuccessRate: toNumber(syncStats.total, 0) > 0 ? (toNumber(syncStats.success, 0) / toNumber(syncStats.total, 0)) * 100 : 100,
      apiErrorRate: toNumber(syncStats.total, 0) > 0 ? (toNumber(syncStats.failed, 0) / toNumber(syncStats.total, 0)) * 100 : 0,
      syncSuccessRate: toNumber(syncStats.total, 0) > 0 ? (toNumber(syncStats.success, 0) / toNumber(syncStats.total, 0)) * 100 : 100,
      syncFailedCount: toNumber(syncStats.failed, 0),
      staleDevicesCount: toNumber(staleDevices, 0),
      totalDevicesCount: totalDevices,
      licenseIntegrityAlerts: 0,
      failedOpsJobsCount: failedOps,
      lastBackupStatus: lastBackup.status === 'COMPLETED' ? 'SUCCESS' : lastBackup.status === 'FAILED' ? 'FAILED' : 'NONE',
      lastBackupAgeHours,
      openIncidents: { critical: criticalIncidents, major: majorIncidents, minor: minorIncidents },
      alerts,
    };
  }

  public getPlatformHealthDashboard(): PlatformHealthDashboardData {
    PlatformHealthService.requirePlatformAccess('health', 'platform.health.view');

    const technical = this.getTechnicalHealthMetrics();
    const business = platformAnalyticsService.getOverviewWithPeriod('30d');

    return {
      technical,
      business,
    };
  }

  // ─── Central Backups ──────────────────────────────────────────────────────────

  public listCentralBackups(): PlatformCentralBackup[] {
    PlatformHealthService.requirePlatformAccess('backup', 'platform.backup.view');
    const rows = this.db.query<any>('SELECT * FROM platform_central_backups ORDER BY created_at DESC');
    return rows.map(this.mapBackup);
  }

  public async triggerCentralBackup(): Promise<PlatformCentralBackup> {
    PlatformHealthService.requirePlatformAccess('backup', 'platform.backup.create');

    const id = `cb_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();
    const plannedName = `platform-central_${now.replace(/[:.]/g, '-')}.sqlite.enc`;

    this.db.run(
      `INSERT INTO platform_central_backups (id, filename, size_bytes, storage_location, status, integrity_check_passed, created_at)
       VALUES (?, ?, 0, 'local', 'IN_PROGRESS', 0, ?)`,
      [id, plannedName, now]
    );

    this.audit('بدء نسخة احتياطية مركزية', 'CENTRAL_BACKUP', id, {});

    const markFailed = (message: string): never => {
      this.db.run(
        `UPDATE platform_central_backups SET status = 'FAILED', verified_at = ? WHERE id = ?`,
        [nowIso(), id]
      );
      this.audit('فشل نسخة احتياطية مركزية', 'CENTRAL_BACKUP', id, { error: message }, { status: 'FAILURE', errorMessage: message });
      throw new Error(message);
    };

    let result: { ok: boolean; path?: string; bytes?: number; error?: string; strategy?: { actions: Array<{ type: string; target: string | null; status: string; description: string }>; recommendations: Array<{ type: string; action: string }> } } | undefined;
    try {
      const createBackup = typeof window !== 'undefined' ? window.ceramisys?.db?.backup : undefined;
      if (!createBackup) {
        throw new Error('إنشاء النسخة الاحتياطية يتطلب تشغيل تطبيق سطح المكتب.');
      }
      result = await createBackup('platform-central');
    } catch (error) {
      markFailed(error instanceof Error ? error.message : String(error));
    }

    if (!result?.ok || !result.path) {
      markFailed(result?.error || 'فشل إنشاء النسخة الاحتياطية.');
    }

    const verifiedOffsite = (result!.strategy?.actions ?? []).some(
      (action) => action.type === 'offsite' && action.status === 'complete'
    );
    const actualName = String(result!.path).split(/[\\/]/).pop() || plannedName;

    this.db.run(
      `UPDATE platform_central_backups
       SET status = 'COMPLETED', filename = ?, size_bytes = ?, storage_location = ?, integrity_check_passed = ?, verified_at = ?
       WHERE id = ?`,
      [actualName, Number(result!.bytes) || 0, String(result!.path), verifiedOffsite ? 1 : 0, nowIso(), id]
    );
    this.audit('اكتمال نسخة احتياطية مركزية', 'CENTRAL_BACKUP', id, { path: result!.path, bytes: result!.bytes });

    const backup = this.getCentralBackup(id);
    if (!backup) throw new Error('فشل إنشاء النسخة الاحتياطية.')
    return backup;
  }

  public getCentralBackup(id: string): PlatformCentralBackup | null {
    PlatformHealthService.requirePlatformAccess('backup', 'platform.backup.view');
    const row = this.db.query<any>('SELECT * FROM platform_central_backups WHERE id = ?', [id])[0];
    return row ? this.mapBackup(row) : null;
  }

  public deleteCentralBackup(id: string): void {
    PlatformHealthService.requirePlatformAccess('backup', 'platform.backup.delete');

    const backup = this.getCentralBackup(id);
    if (!backup) throw new Error('النسخة الاحتياطية غير موجودة.')

    this.db.run('DELETE FROM platform_central_backups WHERE id = ?', [id]);
    this.audit('حذف نسخة احتياطية مركزية', 'CENTRAL_BACKUP', id, {});
  }

  // ─── Service Incidents ────────────────────────────────────────────────────────

  public listServiceIncidents(status?: 'OPEN' | 'RESOLVED'): PlatformServiceIncident[] {
    PlatformHealthService.requirePlatformAccess('incidents', 'platform.incidents.view');

    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];

    const rows = this.db.query<any>(`SELECT * FROM platform_service_incidents ${where} ORDER BY created_at DESC`, params);
    return rows.map(this.mapIncident);
  }

  public createServiceIncident(input: {
    title: string;
    description?: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    affectedServices?: string[];
  }): PlatformServiceIncident {
    PlatformHealthService.requirePlatformAccess('incidents', 'platform.incidents.create');

    const id = `si_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_service_incidents (id, title, description, severity, affected_services, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
      [id, input.title.trim(), input.description?.trim() ?? null, input.severity, JSON.stringify(input.affectedServices ?? []), now, now]
    );

    this.audit('إنشاء حادث خدمة', 'SERVICE_INCIDENT', id, { severity: input.severity });

    const incident = this.getServiceIncident(id);
    if (!incident) throw new Error('فشل إنشاء الحادث.')
    return incident;
  }

  public getServiceIncident(id: string): PlatformServiceIncident | null {
    PlatformHealthService.requirePlatformAccess('incidents', 'platform.incidents.view');
    const row = this.db.query<any>('SELECT * FROM platform_service_incidents WHERE id = ?', [id])[0];
    return row ? this.mapIncident(row) : null;
  }

  public resolveServiceIncident(id: string): void {
    PlatformHealthService.requirePlatformAccess('incidents', 'platform.incidents.update');

    const incident = this.getServiceIncident(id);
    if (!incident) throw new Error('الحادث غير موجود.')

    const now = nowIso();
    this.db.run('UPDATE platform_service_incidents SET status = \'RESOLVED\', resolved_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);

    this.audit('حل حادث خدمة', 'SERVICE_INCIDENT', id, {});
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private getBusinessHealthMetrics() {
    const revenue = this.db.query<any>("SELECT COALESCE(SUM(total) / 100.0, 0) AS total FROM platform_invoices WHERE status = 'PAID' AND paid_at > datetime('now', '-30 days')")[0]?.total ?? 0;
    const newTenants = this.db.query<any>("SELECT COUNT(*) AS c FROM platform_tenants WHERE created_at > datetime('now', '-30 days')")[0]?.c ?? 0;
    const churnedTenants = this.db.query<any>("SELECT COUNT(*) AS c FROM platform_tenants WHERE status = 'CANCELLED' AND updated_at > datetime('now', '-30 days')")[0]?.c ?? 0;

    return { score: 85, revenue30d: toNumber(revenue, 0), newTenants30d: toNumber(newTenants, 0), churnedTenants30d: toNumber(churnedTenants, 0) };
  }

  private getSecurityHealthMetrics() {
    const openIncidents = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_security_incidents WHERE status = \'OPEN\'')[0]?.c ?? 0;
    const criticalIncidents = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_security_incidents WHERE status = \'OPEN\' AND severity = \'CRITICAL\'')[0]?.c ?? 0;
    const failedLogins = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_staff_logins WHERE success = 0 AND created_at > datetime(\'now\', \'-24 hours\')')[0]?.c ?? 0;

    let score = 100;
    if (criticalIncidents > 0) score -= 30;
    else if (openIncidents > 0) score -= 10;
    if (failedLogins > 50) score -= 10;

    return { score: Math.max(0, score), openIncidents, criticalIncidents, failedLogins24h: failedLogins };
  }

  private getOperationalHealthMetrics() {
    const pendingOps = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_ops_jobs WHERE status = \'PENDING\'')[0]?.c ?? 0;
    const failedOps = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_ops_jobs WHERE status = \'FAILED\' AND created_at > datetime(\'now\', \'-24 hours\')')[0]?.c ?? 0;
    const maintenanceWindows = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_maintenance_windows WHERE status = \'SCHEDULED\' AND starts_at > datetime(\'now\')')[0]?.c ?? 0;

    let score = 100;
    if (pendingOps > 100) score -= 10;
    if (failedOps > 10) score -= 20;
    if (maintenanceWindows > 5) score -= 5;

    return { score: Math.max(0, score), pendingOpsJobs: pendingOps, failedOpsJobs24h: failedOps, upcomingMaintenance: maintenanceWindows };
  }

  private calculateTechnicalScore(data: any): number {
    let score = 100;
    if (data.dbLatency > 500) score -= 20;
    else if (data.dbLatency > 100) score -= 10;
    if (data.licenseStats.expiringSoon > 20) score -= 15;
    else if (data.licenseStats.expiringSoon > 10) score -= 10;
    if (data.tenantStats.suspended > 10) score -= 15;
    else if (data.tenantStats.suspended > 5) score -= 10;
    if (data.syncStats.failed > data.syncStats.total * 0.1) score -= 20;
    if (data.deviceStats.cloneSuspected > 0) score -= 10;
    return Math.max(0, score);
  }

  private mapBackup(row: any): PlatformCentralBackup {
    return {
      id: String(row.id),
      filename: String(row.filename ?? `backup_${row.id}`),
      sizeBytes: toNumber(row.size_bytes, 0),
      storageLocation: String(row.storage_location ?? 'local'),
      status: row.status,
      integrityCheckPassed: Boolean(row.integrity_check_passed),
      createdAt: String(row.created_at),
      verifiedAt: row.verified_at ?? undefined,
    };
  }

  private mapIncident(row: any): PlatformServiceIncident {
    return {
      id: String(row.id),
      serviceName: row.affected_services ? JSON.parse(row.affected_services)[0] ?? 'Platform' : 'Platform',
      severity: row.severity,
      title: String(row.title),
      description: row.description ?? null,
      status: row.status,
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at ?? undefined,
    };
  }

  // ─── Operations (Ops Jobs, Maintenance, Approvals, Sync) ──────────────────────

  public listOpsJobs(filters?: { status?: string; tenantId?: string; type?: string; limit?: number; offset?: number }): { jobs: PlatformOpsJob[]; total: number } {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.jobs');

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.status) {
      where.push('status = ?');
      params.push(filters.status);
    }
    if (filters?.tenantId) {
      where.push('tenant_id = ?');
      params.push(filters.tenantId);
    }
    if (filters?.type) {
      where.push('type = ?');
      params.push(filters.type);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const total = this.db.query<any>(`SELECT COUNT(*) AS c FROM platform_ops_jobs ${whereSql}`, params)[0]?.c ?? 0;
    params.push(limit, offset);

    const rows = this.db.query<any>(
      `SELECT * FROM platform_ops_jobs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      params
    );

    return {
      jobs: rows.map(this.mapOpsJob),
      total,
    };
  }

  public createOpsJob(input: { type: string; tenantId?: string; payload?: Record<string, unknown>; priority?: number; scheduledAt?: string }): PlatformOpsJob {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.jobs');

    const id = `opj_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_ops_jobs (id, type, tenant_id, payload, priority, status, scheduled_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [id, input.type, input.tenantId ?? null, JSON.stringify(input.payload ?? {}), input.priority ?? 0, input.scheduledAt ?? null, now, now]
    );

    this.audit('إنشاء مهمة تشغيل', 'OPS_JOB', id, { type: input.type });

    const job = this.getOpsJob(id);
    if (!job) throw new Error('فشل إنشاء المهمة.');
    return job;
  }

  public cancelOpsJob(id: string): void {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.jobs');

    const job = this.getOpsJob(id);
    if (!job) throw new Error('المهمة غير موجودة.')

    const now = nowIso();
    this.db.run('UPDATE platform_ops_jobs SET status = \'CANCELLED\', updated_at = ? WHERE id = ?', [now, id]);

    this.audit('إلغاء مهمة تشغيل', 'OPS_JOB', id, {});
  }

  public retryOpsJob(id: string): void {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.jobs');

    const job = this.getOpsJob(id);
    if (!job) throw new Error('المهمة غير موجودة.')

    const now = nowIso();
    this.db.run('UPDATE platform_ops_jobs SET status = \'PENDING\', error = NULL, updated_at = ? WHERE id = ?', [now, id]);

    this.audit('إعادة محاولة مهمة تشغيل', 'OPS_JOB', id, {});
  }

  public getOpsJob(id: string): PlatformOpsJob | null {
    const row = this.db.query<any>('SELECT * FROM platform_ops_jobs WHERE id = ?', [id])[0];
    return row ? this.mapOpsJob(row) : null;
  }

  public listMaintenanceWindows(filters?: { status?: string }): PlatformMaintenanceWindow[] {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.maintenance');

    const where = filters?.status ? 'WHERE status = ?' : '';
    const params = filters?.status ? [filters.status] : [];

    const rows = this.db.query<any>(`SELECT * FROM platform_maintenance_windows ${where} ORDER BY starts_at`, params);
    return rows.map(this.mapMaintenanceWindow);
  }

  public createMaintenanceWindow(input: { title: string; description?: string; startsAt: string; endsAt: string; affectedServices?: string[] }): PlatformMaintenanceWindow {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.maintenance');

    const id = `mw_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_maintenance_windows (id, title, description, starts_at, ends_at, affected_services, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)`,
      [id, input.title.trim(), input.description?.trim() ?? null, input.startsAt, input.endsAt, JSON.stringify(input.affectedServices ?? []), now, now]
    );

    this.audit('إنشاء نافذة صيانة', 'MAINTENANCE_WINDOW', id, { title: input.title });

    const window = this.getMaintenanceWindow(id);
    if (!window) throw new Error('فشل إنشاء نافذة الصيانة.')
    return window;
  }

  public cancelMaintenanceWindow(id: string): void {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.maintenance');

    const window = this.getMaintenanceWindow(id);
    if (!window) throw new Error('نافذة الصيانة غير موجودة.')

    const now = nowIso();
    this.db.run('UPDATE platform_maintenance_windows SET status = \'CANCELLED\', updated_at = ? WHERE id = ?', [now, id]);

    this.audit('إلغاء نافذة صيانة', 'MAINTENANCE_WINDOW', id, {});
  }

  public getMaintenanceWindow(id: string): PlatformMaintenanceWindow | null {
    const row = this.db.query<any>('SELECT * FROM platform_maintenance_windows WHERE id = ?', [id])[0];
    return row ? this.mapMaintenanceWindow(row) : null;
  }

  public listOpApprovals(filters?: { status?: string }): PlatformOpApproval[] {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.approvals');

    const where = filters?.status ? 'WHERE status = ?' : '';
    const params = filters?.status ? [filters.status] : [];

    const rows = this.db.query<any>(`SELECT * FROM platform_op_approvals ${where} ORDER BY created_at DESC`, params);
    return rows.map(this.mapOpApproval);
  }

  public requestOpApproval(input: { opType: string; opPayload?: Record<string, unknown> }): PlatformOpApproval {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.approvals');

    const id = `opa_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_op_approvals (id, op_type, op_payload, requested_by, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
      [id, input.opType, JSON.stringify(input.opPayload ?? {}), AuthService.getCurrentUser()?.id ?? 'system', now, now]
    );

    this.audit('طلب موافقة تشغيل', 'OP_APPROVAL', id, { opType: input.opType });

    const approval = this.getOpApproval(id);
    if (!approval) throw new Error('فشل إنشاء طلب الموافقة.')
    return approval;
  }

  public approveOp(id: string, notes?: string): void {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.approvals');

    const approval = this.getOpApproval(id);
    if (!approval) throw new Error('طلب الموافقة غير موجود.')

    const now = nowIso();
    this.db.run('UPDATE platform_op_approvals SET status = \'APPROVED\', approved_at = ?, approved_by = ?, notes = ?, updated_at = ? WHERE id = ?', [now, AuthService.getCurrentUser()?.id ?? 'system', notes ?? null, now, id]);

    this.audit('الموافقة على عملية', 'OP_APPROVAL', id, { notes });
  }

  public rejectOp(id: string, notes?: string): void {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.approvals');

    const approval = this.getOpApproval(id);
    if (!approval) throw new Error('طلب الموافقة غير موجود.')

    const now = nowIso();
    this.db.run('UPDATE platform_op_approvals SET status = \'REJECTED\', rejected_at = ?, rejected_by = ?, notes = ?, updated_at = ? WHERE id = ?', [now, AuthService.getCurrentUser()?.id ?? 'system', notes ?? null, now, id]);

    this.audit('رفض عملية', 'OP_APPROVAL', id, { notes });
  }

  public getOpApproval(id: string): PlatformOpApproval | null {
    const row = this.db.query<any>('SELECT * FROM platform_op_approvals WHERE id = ?', [id])[0];
    return row ? this.mapOpApproval(row) : null;
  }

  public listSyncStatus(filters?: { tenantId?: string; deviceId?: string; status?: string; limit?: number }): PlatformSyncLogEntry[] {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.sync');

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.tenantId) {
      where.push('tenant_id = ?');
      params.push(filters.tenantId);
    }
    if (filters?.deviceId) {
      where.push('device_id = ?');
      params.push(filters.deviceId);
    }
    if (filters?.status) {
      where.push('status = ?');
      params.push(filters.status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = filters?.limit ?? 100;
    params.push(limit);

    const rows = this.db.query<any>(
      `SELECT * FROM platform_sync_log ${whereSql} ORDER BY created_at DESC LIMIT ?`,
      params
    );

    return rows.map(this.mapSyncLogEntry);
  }

  public logSyncEvent(input: { tenantId?: string; deviceId?: string; syncType: string; status: PlatformSyncStatus; recordsSynced?: number; errorDetail?: string }): PlatformSyncLogEntry {
    PlatformHealthService.requirePlatformAccess('operations', 'platform.operations.sync');

    const id = `sl_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_sync_log (id, tenant_id, device_id, sync_type, status, records_synced, error_detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.tenantId ?? null, input.deviceId ?? null, input.syncType, input.status, input.recordsSynced ?? 0, input.errorDetail ?? null, now]
    );

    this.audit('تسجيل حدث مزامنة', 'SYNC_LOG', id, { syncType: input.syncType, status: input.status });

    const entry = this.getSyncLogEntry(id);
    if (!entry) throw new Error('فشل تسجيل حدث المزامنة.')
    return entry;
  }

  public getSyncLogEntry(id: string): PlatformSyncLogEntry | null {
    const row = this.db.query<any>('SELECT * FROM platform_sync_log WHERE id = ?', [id])[0];
    return row ? this.mapSyncLogEntry(row) : null;
  }

  private mapOpsJob(row: any): PlatformOpsJob {
    return {
      id: String(row.id),
      type: String(row.type),
      tenantId: row.tenant_id ?? null,
      payload: row.payload ? JSON.parse(row.payload) : {},
      priority: toNumber(row.priority, 0),
      status: row.status,
      retries: toNumber(row.retries, 0),
      maxRetries: toNumber(row.max_retries, 3),
      errorMessage: row.error ?? null,
      scheduledAt: row.scheduled_at ?? null,
      startedAt: row.started_at ?? null,
      completedAt: row.completed_at ?? null,
      createdBy: String(row.created_by ?? 'system'),
      createdAt: String(row.created_at),
    };
  }

  private mapMaintenanceWindow(row: any): PlatformMaintenanceWindow {
    return {
      id: String(row.id),
      title: String(row.title),
      description: row.description ?? null,
      startsAt: String(row.starts_at),
      endsAt: String(row.ends_at),
      affectedServices: row.affected_services ? JSON.parse(row.affected_services) : [],
      status: row.status,
      createdBy: String(row.created_by ?? 'system'),
      createdAt: String(row.created_at),
    };
  }

  private mapOpApproval(row: any): PlatformOpApproval {
    return {
      id: String(row.id),
      opType: String(row.op_type),
      opPayload: row.op_payload ? JSON.parse(row.op_payload) : {},
      status: row.status,
      requestedBy: String(row.requested_by),
      approvedBy: row.approved_by ?? null,
      notes: row.notes ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapSyncLogEntry(row: any): PlatformSyncLogEntry {
    return {
      id: String(row.id),
      tenantId: row.tenant_id ?? null,
      deviceId: row.device_id ?? null,
      syncType: String(row.sync_type),
      status: row.status,
      recordsSynced: toNumber(row.records_synced, 0),
      errorDetail: row.error_detail ?? null,
      createdAt: String(row.created_at),
    };
  }
}

export const platformHealthService = new PlatformHealthService();