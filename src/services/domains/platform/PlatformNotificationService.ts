import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import {
  PlatformTenant,
  PlatformLicense,
  PlatformSubscription,
} from './platformTypes';
import { nowIso, toNumber, addDays, formatDate } from './platformUtils';

export interface PlatformNotification {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  message: string;
  referenceType: string;
  referenceId: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  channels: string[];
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export class PlatformNotificationService {
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
    if (!actor) return;
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

  // ─── Notification Management ──────────────────────────────────────────────────

  public listNotifications(tenantId?: string, limit = 100): PlatformNotification[] {
    PlatformNotificationService.requirePlatformAccess('notifications', 'platform.notifications.view');

    const where = tenantId ? 'WHERE tenant_id = ?' : '';
    const params = tenantId ? [tenantId, limit] : [limit];

    const rows = this.db.query<any>(`SELECT * FROM platform_notifications ${where} ORDER BY created_at DESC LIMIT ?`, params);
    return rows.map(this.mapNotification);
  }

  public getNotification(id: string): PlatformNotification | null {
    PlatformNotificationService.requirePlatformAccess('notifications', 'platform.notifications.view');
    const row = this.db.query<any>('SELECT * FROM platform_notifications WHERE id = ?', [id])[0];
    return row ? this.mapNotification(row) : null;
  }

  public createNotification(input: {
    tenantId: string;
    type: string;
    title: string;
    message: string;
    referenceType: string;
    referenceId: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    channels: string[];
    metadata: Record<string, unknown>;
  }): PlatformNotification {
    PlatformNotificationService.requirePlatformAccess('notifications', 'platform.notifications.create');

    const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [input.tenantId])[0];
    if (!tenant) throw new Error('العميل غير موجود.');

    const id = `notif_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_notifications
        (id, tenant_id, type, title, message, reference_type, reference_id, severity, channels, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.tenantId, input.type, input.title, input.message, input.referenceType, input.referenceId, input.severity, JSON.stringify(input.channels), JSON.stringify(input.metadata), now]
    );

    this.audit('إنشاء إشعار', 'NOTIFICATION', id, { tenantId: input.tenantId, type: input.type });

    const notification = this.getNotification(id);
    if (!notification) throw new Error('فشل إنشاء الإشعار.');
    return notification;
  }

  public markAsRead(id: string): PlatformNotification {
    PlatformNotificationService.requirePlatformAccess('notifications', 'platform.notifications.update');

    const notification = this.getNotification(id);
    if (!notification) throw new Error('الإشعار غير موجود.')

    const now = nowIso();
    this.db.run('UPDATE platform_notifications SET read_at = ? WHERE id = ?', [now, id]);

    this.audit('قراءة إشعار', 'NOTIFICATION', id, {});

    const updated = this.getNotification(id);
    if (!updated) throw new Error('فشل تحديث الإشعار.')
    return updated;
  }

  public markAllAsRead(tenantId: string): number {
    PlatformNotificationService.requirePlatformAccess('notifications', 'platform.notifications.update');

    const now = nowIso();
    this.db.run('UPDATE platform_notifications SET read_at = ? WHERE tenant_id = ? AND read_at IS NULL', [now, tenantId]);

    this.audit('قراءة جميع الإشعارات', 'NOTIFICATION', null, { tenantId });

    return 0; // sql.js doesn't expose changes count directly
  }

  public deleteNotification(id: string): void {
    PlatformNotificationService.requirePlatformAccess('notifications', 'platform.notifications.delete');

    const notification = this.getNotification(id);
    if (!notification) throw new Error('الإشعار غير موجود.')

    this.db.run('DELETE FROM platform_notifications WHERE id = ?', [id]);
    this.audit('حذف إشعار', 'NOTIFICATION', id, {});
  }

  // ─── Expiration Checking ──────────────────────────────────────────────────────

  public checkExpiringLicensesAndSubscriptions(): {
    licenseNotifications: number;
    subscriptionNotifications: number;
    offlineLeaseWarnings: number;
  } {
    // System/scheduled task: runs without a platform session on app startup.
    // Skip permission gating for this automated check.
    const horizons = [30, 14, 7, 1];
    let licenseNotifications = 0;
    let subscriptionNotifications = 0;
    let offlineLeaseWarnings = 0;

    for (const days of horizons) {
      const cutoff = addDays(new Date(), days).toISOString();

      // Licenses expiring
      const expiringLicenses = this.db.query<any>(`
        SELECT l.*, t.name AS tenantName, t.id AS tenantId, t.email AS tenantEmail
        FROM platform_licenses l
        JOIN platform_tenants t ON t.id = l.tenant_id
        WHERE l.status IN ('ACTIVE','ISSUED')
          AND l.expires_at IS NOT NULL
          AND date(l.expires_at) = date(?)
          AND NOT EXISTS (
            SELECT 1 FROM platform_notifications n
            WHERE n.reference_type = 'LICENSE' AND n.reference_id = l.id
              AND n.type = 'LICENSE_EXPIRING_SOON'
              AND n.created_at > date('now', '-1 day')
          )
      `, [cutoff]);

      for (const lic of expiringLicenses) {
        this.createNotification({
          tenantId: lic.tenantId,
          type: 'LICENSE_EXPIRING_SOON',
          title: `ترخيص ينتهي خلال ${days} يوم`,
          message: `ترخيص العميل "${lic.tenantName}" (${lic.license_key}) ينتهي في ${formatDate(lic.expires_at)}.`,
          referenceType: 'LICENSE',
          referenceId: lic.id,
          severity: days <= 7 ? 'WARNING' : 'INFO',
          channels: ['IN_APP', 'EMAIL'],
          metadata: { days, licenseKey: lic.license_key },
        });
        licenseNotifications++;
      }

      // Subscriptions expiring
      const expiringSubs = this.db.query<any>(`
        SELECT s.*, t.name AS tenantName, t.id AS tenantId, t.email AS tenantEmail
        FROM platform_subscriptions s
        JOIN platform_tenants t ON t.id = s.tenant_id
        WHERE s.status IN ('ACTIVE','TRIAL')
          AND s.end_date IS NOT NULL
          AND date(s.end_date) = date(?)
          AND NOT EXISTS (
            SELECT 1 FROM platform_notifications n
            WHERE n.reference_type = 'SUBSCRIPTION' AND n.reference_id = s.id
              AND n.type = 'SUBSCRIPTION_EXPIRING_SOON'
              AND n.created_at > date('now', '-1 day')
          )
      `, [cutoff]);

      for (const sub of expiringSubs) {
        this.createNotification({
          tenantId: sub.tenantId,
          type: 'SUBSCRIPTION_EXPIRING_SOON',
          title: `اشتراك ينتهي خلال ${days} يوم`,
          message: `اشتراك العميل "${sub.tenantName}" ينتهي في ${formatDate(sub.end_date)}.`,
          referenceType: 'SUBSCRIPTION',
          referenceId: sub.id,
          severity: days <= 7 ? 'WARNING' : 'INFO',
          channels: ['IN_APP', 'EMAIL'],
          metadata: { days, planId: sub.plan_id },
        });
        subscriptionNotifications++;
      }
    }

    // Offline lease expiring warnings
    const offlineExpiring = this.db.query<any>(`
      SELECT l.*, t.name AS tenantName, d.id AS deviceId, d.hardware_id AS hardwareId
      FROM platform_licenses l
      JOIN platform_tenants t ON t.id = l.tenant_id
      JOIN platform_devices d ON d.license_id = l.id
      WHERE l.status = 'ACTIVE'
        AND l.offline_grace_period_days IS NOT NULL
        AND l.activated_at IS NOT NULL
        AND d.status = 'ACTIVE'
        AND date(l.activated_at, '+' || l.offline_grace_period_days || ' days') BETWEEN date('now') AND date('now', '+3 day')
        AND NOT EXISTS (
          SELECT 1 FROM platform_notifications n
          WHERE n.reference_type = 'LICENSE' AND n.reference_id = l.id
            AND n.type = 'OFFLINE_LEASE_EXPIRING'
            AND n.created_at > date('now', '-1 day')
        )
    `);

    for (const lic of offlineExpiring) {
      this.createNotification({
        tenantId: lic.tenantId,
        type: 'OFFLINE_LEASE_EXPIRING',
        title: 'فترة السماح غير المتصلة تنتهي قريباً',
        message: `جهاز العميل "${lic.tenantName}" (${lic.hardwareId}) سينتهي فترة السماح غير المتصلة خلال 3 أيام. يرجى الاتصال بالإنترنت.`,
        referenceType: 'LICENSE',
        referenceId: lic.id,
        severity: 'WARNING',
        channels: ['IN_APP'],
        metadata: { deviceId: lic.deviceId, hardwareId: lic.hardwareId, daysLeft: 3 },
      });
      offlineLeaseWarnings++;
    }

    return { licenseNotifications, subscriptionNotifications, offlineLeaseWarnings };
  }

  // ─── Notification Actions ─────────────────────────────────────────────────────

  public handleNotificationAction(notificationId: string, action: string): void {
    PlatformNotificationService.requirePlatformAccess('notifications', 'platform.notifications.action');

    const notif = this.db.query<any>('SELECT * FROM platform_notifications WHERE id = ?', [notificationId])[0];
    if (!notif) throw new Error('الإشعار غير موجود.')

    // Mark as read
    this.db.run('UPDATE platform_notifications SET read_at = ? WHERE id = ?', [nowIso(), notificationId]);

    switch (action) {
      case 'RENEW_LICENSE':
        if (notif.reference_type === 'LICENSE') {
          // Would call license service
          this.audit('تجديد ترخيص من إشعار', 'NOTIFICATION_ACTION', notificationId, {});
        }
        break;
      case 'RENEW_SUBSCRIPTION':
        if (notif.reference_type === 'SUBSCRIPTION') {
          const sub = this.db.query<any>('SELECT tenant_id FROM platform_subscriptions WHERE id = ?', [notif.reference_id])[0];
          if (sub) {
            // Would call subscription service
            this.audit('تجديد اشتراك من إشعار', 'NOTIFICATION_ACTION', notificationId, {});
          }
        }
        break;
      case 'VIEW_TENANT':
        // Just mark as read, UI will navigate
        break;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private mapNotification(row: any): PlatformNotification {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      type: String(row.type),
      title: String(row.title),
      message: String(row.message),
      referenceType: String(row.reference_type),
      referenceId: String(row.reference_id),
      severity: row.severity,
      channels: JSON.parse(row.channels || '[]'),
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      readAt: row.read_at ?? null,
      createdAt: String(row.created_at),
    };
  }
}

export const platformNotificationService = new PlatformNotificationService();