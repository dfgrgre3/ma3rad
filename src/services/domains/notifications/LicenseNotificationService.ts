import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { NotificationServicePart01 } from './NotificationServicePart01';
import type { NotificationType } from '../../../types/notifications';
import { addLocalDays } from '../../../utils/shared/date';

/**
 * خدمة إشعارات انتهاء صلاحية التراخيص والاشتراكات.
 * تُنفذ دورياً للتحقق من التراخيص والاشتراكات التي تقترب من نهاية صلاحيتها
 * وتُنشئ إشعارات للمسؤولين والعملاء.
 */
export class LicenseNotificationService extends NotificationServicePart01 {

  /**
   * يتحقق من التراخيص والاشتراكات التي تقترب من نهاية صلاحيتها خلال الأيام المحددة
   * وينشئ إشعارات لكل منها إذا لم يكن هناك إشعار مماثل غير مقروء بالفعل.
   * @param horizonDays عدد الأيام المستقبلية للتحقق (الافتراضي 30)
   */
  public checkExpiringLicensesAndSubscriptions(horizonDays = 30): {
    licenseNotifications: number;
    subscriptionNotifications: number;
  } {
    const horizons = [1, 7, 14, 30];
    let licenseCount = 0;
    let subscriptionCount = 0;

    for (const days of horizons) {
      if (days > horizonDays) continue;
      const cutoff = addLocalDays(new Date(), days).toISOString().slice(0, 10);

      // ── تراخيص تقترب من الانتهاء ────────────────────────────────────────
      const expiringLicenses = this.db.query<any>(`
        SELECT l.*, t.name AS tenantName, t.id AS tenantId
        FROM platform_licenses l
        JOIN platform_tenants t ON t.id = l.tenant_id
        WHERE l.status IN ('ACTIVE', 'ISSUED')
          AND l.expires_at IS NOT NULL
          AND date(l.expires_at) = date(?)
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.reference_type = 'LICENSE'
              AND n.reference_id = l.id
              AND n.type = 'LICENSE_EXPIRING_SOON'
              AND n.is_read = 0
          )
      `, [cutoff]);

      for (const lic of expiringLicenses) {
        const daysLeft = days;
        this.createNotification(
          'LICENSE_EXPIRING_SOON' as NotificationType,
          `تنبيه: ترخيص يقترب من الانتهاء`,
          `التغذية "${lic.tenantName}" - ترخيص "${lic.licenseKey}" ينتهي خلال ${daysLeft} يوم (${lic.expires_at}).`,
          undefined,
          'LICENSE',
          String(lic.id)
        );
        licenseCount += 1;
      }

      // ── اشتراكات تقترب من الانتهاء ──────────────────────────────────────
      const expiringSubscriptions = this.db.query<any>(`
        SELECT s.*, t.name AS tenantName, t.id AS tenantId
        FROM platform_subscriptions s
        JOIN platform_tenants t ON t.id = s.tenant_id
        WHERE s.status IN ('ACTIVE', 'TRIAL')
          AND s.end_date IS NOT NULL
          AND date(s.end_date) = date(?)
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.reference_type = 'SUBSCRIPTION'
              AND n.reference_id = s.id
              AND n.type = 'SUBSCRIPTION_EXPIRING_SOON'
              AND n.is_read = 0
          )
      `, [cutoff]);

      for (const sub of expiringSubscriptions) {
        const daysLeft = days;
        this.createNotification(
          'SUBSCRIPTION_EXPIRING_SOON' as NotificationType,
          `تنبيه: اشتراك يقترب من الانتهاء`,
          `التغذية "${sub.tenantName}" - الاشتراك "${sub.planId}" ينتهي خلال ${daysLeft} يوم (${sub.end_date}).`,
          undefined,
          'SUBSCRIPTION',
          String(sub.id)
        );
        subscriptionCount += 1;
      }
    }

    // ── تراخيص منتهية بالفعل ─────────────────────────────────────────────
    const expiredLicenses = this.db.query<any>(`
      SELECT l.*, t.name AS tenantName, t.id AS tenantId
      FROM platform_licenses l
      JOIN platform_tenants t ON t.id = l.tenant_id
      WHERE l.status IN ('ACTIVE', 'ISSUED')
        AND l.expires_at IS NOT NULL
        AND date(l.expires_at) < date('now')
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.reference_type = 'LICENSE'
            AND n.reference_id = l.id
            AND n.type = 'LICENSE_EXPIRED'
            AND n.is_read = 0
        )
    `);

    for (const lic of expiredLicenses) {
      this.createNotification(
        'LICENSE_EXPIRED' as NotificationType,
        `تنبيه مهم: ترخيص منتهي`,
        `التغذية "${lic.tenantName}" - ترخيص "${lic.licenseKey}" قد انقضت صلاحيته في ${lic.expires_at}. يرجى التجديد لاستمرار الخدمة.`,
        undefined,
        'LICENSE',
        String(lic.id)
      );
    }

    // ── اشتراكات منتهية بالفعل ────────────────────────────────────────────
    const expiredSubscriptions = this.db.query<any>(`
      SELECT s.*, t.name AS tenantName, t.id AS tenantId
      FROM platform_subscriptions s
      JOIN platform_tenants t ON t.id = s.tenant_id
      WHERE s.status IN ('ACTIVE', 'TRIAL')
        AND s.end_date IS NOT NULL
        AND date(s.end_date) < date('now')
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
            WHERE n.reference_type = 'SUBSCRIPTION'
            AND n.reference_id = s.id
            AND n.type = 'SUBSCRIPTION_EXPIRED'
            AND n.is_read = 0
        )
    `);

    for (const sub of expiredSubscriptions) {
      this.createNotification(
        'SUBSCRIPTION_EXPIRED' as NotificationType,
        `تنبيه مهم: اشتراك منتهي`,
        `التغذية "${sub.tenantName}" - الاشتراك "${sub.planId}" قد انقضت مدته في ${sub.end_date}. يرجى التجديد لاستمرار الخدمة.`,
        undefined,
        'SUBSCRIPTION',
        String(sub.id)
      );
    }

    return { licenseNotifications: licenseCount, subscriptionNotifications: subscriptionCount };
  }

  /**
   * يُنشئ إشعار عند اكتشاف استنساخ ترخيص (نفس HWID على عدة عملاء أو تجاوز عدد الأجهزة).
   */
  public notifyCloneDetection(licenseId: string, tenantId: string, message: string): void {
    this.createNotification(
      'CLONE_DETECTED' as NotificationType,
      `تنبيه أمني: اشتباه استنساخ ترخيص`,
      message,
      undefined,
      'LICENSE',
      licenseId
    );
  }

  /**
   * يُنشئ إشعار عند إيقاف جهاز عن بُعد.
   */
  public notifyDeviceSuspended(deviceId: string, tenantId: string, hardwareId: string, reason: string): void {
    this.createNotification(
      'DEVICE_SUSPENDED_REMOTELY' as NotificationType,
      `تنبيه: تم إيقاف الجهاز عن بُعد`,
      `الجهاز ${hardwareId} (${deviceId}) تم إيقافه عن بُعد. السبب: ${reason}.`,
      undefined,
      'DEVICE',
      deviceId
    );
  }

  /**
   * يُنشئ إشعار عند اقتراب انتهاء فترة العمل أوفلاين (offline lease).
   */
  public notifyOfflineLeaseExpiring(licenseKey: string, tenantId: string, expiresAt: string, daysLeft: number): void {
    this.createNotification(
      'OFFLINE_LEASE_EXPIRING' as NotificationType,
      `تنبيه: فترة العمل أوفلاين تقترب من الانتهاء`,
      `الترخيص "${licenseKey}" - فترة العمل أوفلاين تنتهي خلال ${daysLeft} يوم (في ${expiresAt}). يرجى الاتصال بالإنترنت لتجديد الترخيص.`,
      undefined,
      'LICENSE',
      licenseKey
    );
  }
}
