import { v4 as uuidv4 } from 'uuid';
import { platformAdminService } from '../platform/PlatformAdminService';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { PlatformNotification } from '../platform/platformTypes';

/**
 * Service for automated license and subscription expiry notifications.
 * Runs periodically (e.g., via cron or background job) to check for expiring items.
 */
export class LicenseNotificationService {
  private db = DatabaseManager.getInstance();
  private static instance: LicenseNotificationService | null = null;

  public static getInstance(): LicenseNotificationService {
    if (!LicenseNotificationService.instance) {
      LicenseNotificationService.instance = new LicenseNotificationService();
    }
    return LicenseNotificationService.instance;
  }

  /**
   * Main entry point: check all expiring licenses/subscriptions and send notifications.
   * Should be called daily via scheduled job.
   */
  public async runDailyExpiryCheck(): Promise<{
    licenseNotifications: number;
    subscriptionNotifications: number;
    offlineLeaseWarnings: number;
    cloneDetections: number;
  }> {
    console.log('[LicenseNotificationService] Starting daily expiry check...');

    // 1. Check expiring licenses and subscriptions
    const expiryResult = platformAdminService.checkExpiringLicensesAndSubscriptions();

    // 2. Run clone detection. Cross-tenant detection requires a platform
    //    session: try the local platform service first (platform-owner
    //    installs), then the central admin API when a platform token exists
    //    on this device. Tenant installs have neither — the central server
    //    runs its own scheduled detection for them, so skipping here is
    //    expected rather than an error.
    let cloneResult: ReturnType<typeof platformAdminService.detectCloneDevices> | null = null;
    try {
      cloneResult = platformAdminService.detectCloneDevices();
    } catch {
      try {
        cloneResult = await platformAdminService.detectCloneDevicesCentral();
      } catch (centralError) {
        console.warn('Clone detection via central API failed:', centralError);
      }
      if (!cloneResult) {
        console.info('[LicenseNotificationService] Clone detection skipped: no valid platform session on this device.');
      }
    }
    const cloneDetections = cloneResult
      ? cloneResult.duplicateHwids.length +
        cloneResult.overLimitLicenses.length +
        cloneResult.suspiciousTransfers.length
      : 0;

    // 3. Create notifications for clone detections
    if (cloneResult) {
    for (const dup of cloneResult.duplicateHwids) {
      for (const tenantId of dup.tenants) {
        this.createNotification({
          tenantId,
          type: 'CLONE_DETECTED',
          title: 'اكتشاف استنساخ محتمل',
          message: `جهاز بمعرف ${dup.hardwareId} مسجل لدى ${dup.tenantCount} عملاء.`,
          referenceType: 'DEVICE',
          referenceId: dup.hardwareId,
          severity: 'CRITICAL',
          channels: ['IN_APP', 'EMAIL'],
          metadata: { hardwareId: dup.hardwareId, tenants: dup.tenants },
        });
      }
    }

    for (const over of cloneResult.overLimitLicenses) {
      this.createNotification({
        tenantId: over.tenantId,
        type: 'CLONE_DETECTED',
        title: 'ترخيص يتجاوز حد الأجهزة',
        message: `الترخيص ${over.licenseKey} مفعل على ${over.deviceCount} جهاز بينما الحد ${over.deviceLimit}.`,
        referenceType: 'LICENSE',
        referenceId: over.licenseId,
        severity: 'WARNING',
        channels: ['IN_APP', 'EMAIL'],
        metadata: { licenseKey: over.licenseKey, deviceCount: over.deviceCount, deviceLimit: over.deviceLimit },
      });
    }

    for (const trans of cloneResult.suspiciousTransfers) {
      this.createNotification({
        tenantId: trans.tenantId,
        type: 'CLONE_DETECTED',
        title: 'نقل ترخيص مشبوه',
        message: `تم نقل الترخيص ${trans.licenseId} ${trans.transferCount} مرة خلال 30 يوماً.`,
        referenceType: 'LICENSE',
        referenceId: trans.licenseId,
        severity: 'WARNING',
        channels: ['IN_APP'],
        metadata: { transferCount: trans.transferCount },
      });
    }
    }

    console.log('[LicenseNotificationService] Daily check completed:', {
      licenseNotifications: expiryResult.licenseNotifications,
      subscriptionNotifications: expiryResult.subscriptionNotifications,
      offlineLeaseWarnings: expiryResult.offlineLeaseWarnings,
      cloneDetections,
    });

    return {
      licenseNotifications: expiryResult.licenseNotifications,
      subscriptionNotifications: expiryResult.subscriptionNotifications,
      offlineLeaseWarnings: expiryResult.offlineLeaseWarnings,
      cloneDetections,
    };
  }

  /**
   * Create a notification in the database.
   */
  private createNotification(input: {
    tenantId: string;
    type: string;
    title: string;
    message: string;
    referenceType: string;
    referenceId: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    channels: string[];
    metadata: Record<string, unknown>;
  }): void {
    const id = `notif_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO platform_notifications
        (id, tenant_id, type, title, message, reference_type, reference_id, severity, channels, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.tenantId,
        input.type,
        input.title,
        input.message,
        input.referenceType,
        input.referenceId,
        input.severity,
        JSON.stringify(input.channels),
        JSON.stringify(input.metadata),
        now,
      ]
    );
  }

  /**
   * Get notifications for a tenant.
   */
  public getNotifications(tenantId: string, options: { unreadOnly?: boolean; limit?: number } = {}): PlatformNotification[] {
    let query = 'SELECT * FROM platform_notifications WHERE tenant_id = ?';
    const params: unknown[] = [tenantId];

    if (options.unreadOnly) {
      query += ' AND read_at IS NULL';
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    return this.db.query<any>(query, params).map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      type: row.type,
      title: row.title,
      message: row.message,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      severity: row.severity,
      channels: JSON.parse(row.channels || '["IN_APP"]'),
      metadata: JSON.parse(row.metadata || '{}'),
      readAt: row.read_at,
      createdAt: row.created_at,
    }));
  }

  /**
   * Mark notification as read.
   */
  public markAsRead(notificationId: string): void {
    const now = new Date().toISOString();
    this.db.run('UPDATE platform_notifications SET read_at = ? WHERE id = ?', [now, notificationId]);
  }

  /**
   * Mark all notifications as read for a tenant.
   */
  public markAllAsRead(tenantId: string): void {
    const now = new Date().toISOString();
    this.db.run('UPDATE platform_notifications SET read_at = ? WHERE tenant_id = ? AND read_at IS NULL', [now, tenantId]);
  }
}

export const licenseNotificationService = LicenseNotificationService.getInstance();