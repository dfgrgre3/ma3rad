import bcrypt from 'bcryptjs';
import type { PlatformAlertDetail } from '../platformTypes';
import { toNumber, formatDate } from '../platformUtils';
import type { AnalyticsServiceContext } from './context';

export function getAlertDetails(ctx: AnalyticsServiceContext): PlatformAlertDetail[] {
  ctx.requirePlatformAccess('analytics', 'platform.analytics.alerts');

  const alerts: PlatformAlertDetail[] = [];

  // Expiring licenses
  const expiringLicenses = ctx.db.query<any>(`
    SELECT l.*, t.name AS tenantName
    FROM platform_licenses l
    JOIN platform_tenants t ON t.id = l.tenant_id
    WHERE l.status IN ('ACTIVE','ISSUED')
      AND l.expires_at IS NOT NULL
      AND date(l.expires_at) BETWEEN date('now') AND date('now', '+7 day')
    ORDER BY l.expires_at
  `);

  for (const lic of expiringLicenses) {
    alerts.push({
      id: `alert-license-${lic.id}`,
      severity: 'warning',
      title: `ترخيص ينتهي قريباً: ${lic.tenantName}`,
      description: `ترخيص "${lic.license_key}" للعميل ${lic.tenantName} ينتهي في ${formatDate(lic.expires_at)}`,
      link: `/platform/licenses/${lic.id}`,
      entityType: 'LICENSE',
      entityId: lic.id,
      entityName: lic.license_key,
      actionRequired: true,
      suggestedActions: ['تجديد الترخيص', 'مراسلة العميل'],
      metadata: { daysLeft: Math.ceil((new Date(lic.expires_at).getTime() - Date.now()) / 86400000) },
    });
  }

  // Expiring subscriptions
  const expiringSubs = ctx.db.query<any>(`
    SELECT s.*, t.name AS tenantName
    FROM platform_subscriptions s
    JOIN platform_tenants t ON t.id = s.tenant_id
    WHERE s.status IN ('ACTIVE','TRIAL')
      AND s.end_date IS NOT NULL
      AND date(s.end_date) BETWEEN date('now') AND date('now', '+7 day')
    ORDER BY s.end_date
  `);

  for (const sub of expiringSubs) {
    alerts.push({
      id: `alert-sub-${sub.id}`,
      severity: 'warning',
      title: `اشتراك ينتهي قريباً: ${sub.tenantName}`,
      description: `اشتراك العميل ${sub.tenantName} ينتهي في ${formatDate(sub.end_date)}`,
      link: `/platform/tenants/${sub.tenant_id}`,
      entityType: 'SUBSCRIPTION',
      entityId: sub.id,
      entityName: sub.plan_id,
      actionRequired: true,
      suggestedActions: ['تجديد الاشتراك', 'مراسلة العميل'],
      metadata: { daysLeft: Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000) },
    });
  }

  // Overdue invoices
  const overdueInvoices = ctx.db.query<any>(`
    SELECT i.*, t.name AS tenantName
    FROM platform_invoices i
    JOIN platform_tenants t ON t.id = i.tenant_id
    WHERE i.status IN ('SENT','PARTIAL','OVERDUE')
      AND i.due_date IS NOT NULL
      AND date(i.due_date) < date('now')
    ORDER BY i.due_date
    LIMIT 20
  `);

  for (const inv of overdueInvoices) {
    alerts.push({
      id: `alert-invoice-${inv.id}`,
      severity: 'danger',
      title: `فاتورة متأخرة: ${inv.tenantName}`,
      description: `فاتورة ${inv.id} للعميل ${inv.tenantName} مستحقة منذ ${formatDate(inv.due_date)}`,
      link: `/platform/invoices/${inv.id}`,
      entityType: 'INVOICE',
      entityId: inv.id,
      entityName: inv.id,
      actionRequired: true,
      suggestedActions: ['متابعة الدفع', 'إرسال تذكير'],
      metadata: { amount: toNumber(inv.total, 0) - toNumber(inv.paid, 0), daysOverdue: Math.ceil((Date.now() - new Date(inv.due_date).getTime()) / 86400000) },
    });
  }

  // Suspended tenants
  const suspendedTenants = ctx.db.query<any>('SELECT * FROM platform_tenants WHERE status = \'SUSPENDED\'');
  for (const tenant of suspendedTenants) {
    alerts.push({
      id: `alert-tenant-${tenant.id}`,
      severity: 'warning',
      title: `عميل موقوف: ${tenant.name}`,
      description: `العميل ${tenant.name} (${tenant.code}) في حالة موقوف`,
      link: `/platform/tenants/${tenant.id}`,
      entityType: 'TENANT',
      entityId: tenant.id,
      entityName: tenant.name,
      actionRequired: true,
      suggestedActions: ['مراجعة حالة العميل', 'التواصل مع العميل'],
      metadata: {},
    });
  }

  // Clone suspected devices
  const cloneDevices = ctx.db.query<any>(`
    SELECT d.*, l.license_key, t.name AS tenantName
    FROM platform_devices d
    JOIN platform_licenses l ON l.id = d.license_id
    JOIN platform_tenants t ON t.id = l.tenant_id
    WHERE d.clone_suspected = 1 AND d.status = 'ACTIVE'
  `);

  for (const dev of cloneDevices) {
    alerts.push({
      id: `alert-device-${dev.id}`,
      severity: 'danger',
      title: `جهاز مشبوه: ${dev.tenantName}`,
      description: `جهاز ${dev.hardware_id} للعميل ${dev.tenantName} مشتبه به كاستنساخ`,
      link: `/platform/devices/${dev.id}`,
      entityType: 'DEVICE',
      entityId: dev.id,
      entityName: dev.hardware_id,
      actionRequired: true,
      suggestedActions: ['التحقق من الجهاز', 'إيقاف الجهاز'],
      metadata: { hardwareId: dev.hardware_id },
    });
  }

  try {
    const platformAccount = ctx.db.query<any>(
      `SELECT password_hash AS passwordHash FROM users WHERE username = 'platform' LIMIT 1`
    )[0];
    if (platformAccount?.passwordHash && bcrypt.compareSync('Platform@2026', platformAccount.passwordHash)) {
      alerts.push({
        id: 'default-platform-password',
        severity: 'warning',
        title: 'كلمة مرور مالك المنصة الافتراضية',
        description: 'ما زال الحساب يستخدم كلمة المرور الافتراضية. غيّرها الآن لحماية كل بيانات المنصة.',
        link: '/platform/settings',
        entityType: 'TENANT',
        entityId: 'platform',
        entityName: 'حساب المنصة',
        actionRequired: true,
        suggestedActions: ['تغيير كلمة المرور من الإعدادات', 'تفعيل المصادقة الثنائية'],
        metadata: { account: 'platform' },
      });
    }
  } catch {
    // Password inspection is best-effort; never block the dashboard.
  }

  return alerts;
}
