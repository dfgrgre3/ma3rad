import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import type { User } from '../../../types';
import type {
  PlatformActivationDetails,
  PlatformAlert,
  PlatformAuditEntry,
  PlatformCoupon,
  PlatformFeatureFlag,
  PlatformInvoice,
  PlatformInvoiceInput,
  PlatformInvoiceStatus,
  PlatformDevice,
  PlatformLicense,
  PlatformLicenseActivation,
  PlatformLicenseStatus,
  PlatformModule,
  PlatformModuleUsage,
  PlatformOverview,
  PlatformPayment,
  PlatformPaymentInput,
  PlatformApiKey,
  PlatformApiKeyCreated,
  PlatformPlan,
  PlatformPlanInput,
  PlatformRelease,
  PlatformReleaseTarget,
  PlatformSettingsMap,
  PlatformSubscription,
  PlatformSupportMessage,
  PlatformSupportTicket,
  PlatformTenant,
  PlatformTenantAccount,
  PlatformTenantAccountInput,
  PlatformTenantInput,
  PlatformTenantOverride,
  PlatformTenantOverrideInput,
  PlatformTenantProfile,
  PlatformTenantStatus,
  PlatformTenantUser,
  PlatformTenantUserInput,
} from './platformTypes';

const TENANT_STATUS_LABEL: Record<PlatformTenantStatus, string> = {
  TRIAL: 'تجريبي',
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  EXPIRED: 'منتهي',
  CANCELLED: 'ملغي',
};

const INVOICE_STATUS_LABEL: Record<PlatformInvoiceStatus, string> = {
  DRAFT: 'مسودة',
  SENT: 'مرسلة',
  PARTIAL: 'مدفوعة جزئياً',
  PAID: 'مدفوعة',
  OVERDUE: 'متأخرة',
  VOID: 'ملغاة',
};

export const PLATFORM_TENANT_STATUS_LABELS = TENANT_STATUS_LABEL;
export const PLATFORM_INVOICE_STATUS_LABELS = INVOICE_STATUS_LABEL;

function nowIso(): string {
  return new Date().toISOString();
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCount(value: unknown): string {
  return toNumber(value).toLocaleString('ar-EG');
}

function formatMoneyText(value: unknown): string {
  const amount = toNumber(value);
  try {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('ar-EG')} EGP`;
  }
}

function safeJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetMonth = result.getMonth() + months;
  const day = result.getDate();
  result.setMonth(targetMonth);
  // Keep the original day when the target month is shorter (e.g. Jan 31 → Feb 28).
  if (result.getDate() < day) result.setDate(0);
  return result;
}

function randomToken(length: number, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'): string {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

function generateTemporaryPassword(): string {
  return `Cs-${randomToken(4)}${randomToken(4, '23456789')}!`;
}

function generateActivationCode(): string {
  return `${randomToken(4)}-${randomToken(4)}`;
}

function generateLicenseActivationCode(): string {
  return `${randomToken(4)}-${randomToken(4)}-${randomToken(4)}`;
}

function signCertificate(payload: Record<string, unknown>): string {
  const secret = 'ceramisys-platform-certificate-secret';
  const body = JSON.stringify(payload);
  // Lightweight signature (demo): base64 payload + HMAC-like digest derived from secret.
  const signature = btoa(`${secret}:${body}`).replace(/=+$/, '');
  return btoa(JSON.stringify({ ...payload, signature })).replace(/=+$/, '');
}

function mapTenantAccount(row: any): PlatformTenantAccount {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    username: String(row.username),
    email: row.email ?? null,
    fullName: row.fullName ?? null,
    isActive: Boolean(row.isActive),
    activationCode: row.activationCode ?? null,
    lastActivatedAt: row.lastActivatedAt ?? null,
    lastLoginAt: row.lastLoginAt ?? null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapTenantOverride(row: any): PlatformTenantOverride {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    kind: row.kind,
    code: String(row.code),
    value: row.value ?? null,
    isEnabled: Boolean(row.isEnabled),
    expiresAt: row.expiresAt ?? null,
    notes: row.notes ?? null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapTenantUser(row: any): PlatformTenantUser {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    fullName: String(row.fullName),
    username: row.username ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: String(row.role || 'USER'),
    status: row.status,
    notes: row.notes ?? null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapDevice(row: any): PlatformDevice {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    licenseId: row.licenseId ?? null,
    hardwareId: String(row.hardwareId),
    name: row.name ?? null,
    os: row.os ?? null,
    appVersion: row.appVersion ?? null,
    ipAddress: row.ipAddress ?? null,
    status: row.status,
    firstActivatedAt: String(row.firstActivatedAt),
    lastSeenAt: row.lastSeenAt ?? null,
    cloneSuspected: Boolean(row.cloneSuspected),
    notes: row.notes ?? null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapSupportTicket(row: any): PlatformSupportTicket {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    tenantName: row.tenantName ?? null,
    deviceId: row.deviceId ?? null,
    subject: String(row.subject),
    description: row.description ?? null,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assignedTo ?? null,
    remoteAccessRequested: Boolean(row.remoteAccessRequested),
    remoteAccessApproved: Boolean(row.remoteAccessApproved),
    resolvedAt: row.resolvedAt ?? null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapSupportMessage(row: any): PlatformSupportMessage {
  return {
    id: String(row.id),
    ticketId: String(row.ticketId),
    authorName: String(row.authorName),
    authorRole: row.authorRole,
    body: String(row.body),
    attachmentUrl: row.attachmentUrl ?? null,
    createdAt: String(row.createdAt),
  };
}

function mapTenant(row: any): PlatformTenant {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    contactName: row.contactName ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    country: row.country ?? null,
    city: row.city ?? null,
    address: row.address ?? null,
    businessType: row.businessType ?? null,
    status: row.status as PlatformTenantStatus,
    planId: row.planId ?? null,
    planName: row.planName ?? null,
    planPrice: row.planPrice !== undefined && row.planPrice !== null ? toNumber(row.planPrice) : null,
    subscriptionStartedAt: row.subscriptionStartedAt ?? null,
    subscriptionExpiresAt: row.subscriptionExpiresAt ?? null,
    seatsLimit: toNumber(row.seatsLimit, 1),
    branchesLimit: toNumber(row.branchesLimit, 1),
    devicesLimit: toNumber(row.devicesLimit, 1),
    notes: row.notes ?? null,
    activeLicenses: toNumber(row.activeLicenses, 0),
    licensesTotal: toNumber(row.licensesTotal, 0),
    devicesUsed: toNumber(row.devicesUsed, 0),
    outstanding: toNumber(row.outstanding, 0),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapSubscription(row: any): PlatformSubscription {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    tenantName: row.tenantName ?? null,
    planId: String(row.planId),
    planName: row.planName ?? null,
    status: row.status as PlatformSubscription['status'],
    startDate: String(row.startDate),
    endDate: row.endDate ?? null,
    seats: toNumber(row.seats, 1),
    price: toNumber(row.price),
    billingCycle: row.billingCycle,
    autoRenew: Boolean(row.autoRenew),
    createdAt: row.createdAt ? String(row.createdAt) : undefined,
  };
}

function mapPlan(row: any): PlatformPlan {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    description: row.description ?? null,
    billingCycle: row.billingCycle,
    price: toNumber(row.price),
    monthlyPrice: toNumber(row.monthlyPrice, 0),
    yearlyPrice: toNumber(row.yearlyPrice, 0),
    currency: String(row.currency || 'EGP'),
    seatsLimit: toNumber(row.seatsLimit, 1),
    branchesLimit: toNumber(row.branchesLimit, 1),
    devicesLimit: toNumber(row.devicesLimit, 1),
    storageLimitMb: toNumber(row.storageLimitMb, 500),
    maxProducts: toNumber(row.maxProducts, 1000),
    maxWarehouses: toNumber(row.maxWarehouses, 2),
    trialDays: toNumber(row.trialDays, 14),
    includedModules: safeJsonArray(row.includedModules),
    features: safeJsonArray(row.features),
    permissions: safeJsonArray(row.permissions),
    isActive: Boolean(row.isActive),
    isDefault: Boolean(row.isDefault),
    sortOrder: toNumber(row.sortOrder),
    subscriberCount: toNumber(row.subscriberCount, 0),
  };
}

function mapLicense(row: any): PlatformLicense {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    tenantName: row.tenantName ?? undefined,
    subscriptionId: row.subscriptionId ?? null,
    planId: row.planId ?? null,
    planName: row.planName ?? null,
    licenseKey: String(row.licenseKey),
    status: row.status as PlatformLicenseStatus,
    issuedAt: String(row.issuedAt),
    activatedAt: row.activatedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    seats: toNumber(row.seats, 1),
    deviceLimit: toNumber(row.deviceLimit, 1),
    hardwareId: row.hardwareId ?? null,
    activationCode: row.activationCode ?? null,
    certificate: row.certificate ?? null,
    transferCount: toNumber(row.transferCount, 0),
    modules: safeJsonArray(row.modules),
    features: safeJsonArray(row.features),
    notes: row.notes ?? null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapInvoice(row: any): PlatformInvoice {
  return {
    id: String(row.id),
    number: String(row.number),
    tenantId: String(row.tenantId),
    tenantName: row.tenantName ?? undefined,
    subscriptionId: row.subscriptionId ?? null,
    issueDate: String(row.issueDate),
    dueDate: row.dueDate ?? null,
    status: row.status as PlatformInvoiceStatus,
    currency: String(row.currency || 'EGP'),
    subtotal: toNumber(row.subtotal),
    discount: toNumber(row.discount),
    tax: toNumber(row.tax),
    total: toNumber(row.total),
    paidAmount: toNumber(row.paidAmount),
    notes: row.notes ?? null,
    createdAt: String(row.createdAt),
  };
}

function mapPayment(row: any): PlatformPayment {
  return {
    id: String(row.id),
    invoiceId: row.invoiceId ?? null,
    invoiceNumber: row.invoiceNumber ?? null,
    tenantId: String(row.tenantId),
    tenantName: row.tenantName ?? undefined,
    amount: toNumber(row.amount),
    method: row.method,
    reference: row.reference ?? null,
    paidAt: String(row.paidAt),
    notes: row.notes ?? null,
  };
}

/**
 * Platform-owner (Super Admin) domain service.
 *
 * Every mutating method is guarded by `requirePlatformOwner()` so the console
 * cannot be driven by a tenant administrator, even if a route guard is bypassed.
 */
export class PlatformAdminService {
  private db = DatabaseManager.getInstance();

  private static owner(): User {
    const user = AuthService.getCurrentUser();
    if (!user || !user.isActive || user.role !== 'SUPER_ADMIN') {
      throw new Error('هذه العملية متاحة لمالك المنصة فقط.');
    }
    return user;
  }

  public static isPlatformOwner(user: User | null | undefined): boolean {
    return Boolean(user && user.isActive && user.role === 'SUPER_ADMIN');
  }

  public static requirePlatformOwner(): User {
    return PlatformAdminService.owner();
  }

  private audit(action: string, entityType: string, entityId: string | null, details?: unknown): void {
    const actor = PlatformAdminService.owner();
    this.db.run(
      `INSERT INTO platform_audit_logs (id, actor_id, actor_name, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `paud_${uuidv4().replace(/-/g, '').slice(0, 14)}`,
        actor.id,
        actor.fullName,
        action,
        entityType,
        entityId,
        details === undefined ? null : JSON.stringify(details),
      ]
    );
  }

  private setting(key: string, fallback = ''): string {
    const row = this.db.query<{ value: string }>(
      'SELECT value FROM platform_settings WHERE key = ?',
      [key]
    )[0];
    return row?.value ?? fallback;
  }

  private nextSequence(table: string): number {
    const row = this.db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)[0];
    return toNumber(row?.count, 0) + 1;
  }

  // ─── Overview ──────────────────────────────────────────────────────────────

  public getOverview(): PlatformOverview {
    PlatformAdminService.owner();

    const tenantStats = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'TRIAL' THEN 1 ELSE 0 END) AS trial,
         SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
         SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
         SUM(CASE WHEN status IN ('ACTIVE','TRIAL') AND subscription_expires_at IS NOT NULL
                   AND date(subscription_expires_at) <= date('now', '+30 day') THEN 1 ELSE 0 END) AS expiringSoon
       FROM platform_tenants`
    )[0] ?? {};

    const subscriptionStats = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'TRIAL' THEN 1 ELSE 0 END) AS trial,
         SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
         SUM(CASE WHEN status IN ('ACTIVE','TRIAL') AND end_date IS NOT NULL
                   AND date(end_date) <= date('now', '+30 day') THEN 1 ELSE 0 END) AS expiringSoon
       FROM platform_subscriptions`
    )[0] ?? {};

    const licenseStats = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
         SUM(CASE WHEN status = 'REVOKED' THEN 1 ELSE 0 END) AS revoked,
         SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN status IN ('ACTIVE','ISSUED') AND expires_at IS NOT NULL
                   AND date(expires_at) <= date('now', '+30 day') THEN 1 ELSE 0 END) AS expiringSoon
       FROM platform_licenses`
    )[0] ?? {};

    const invoiceStats = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid,
         SUM(CASE WHEN status = 'DRAFT' THEN 1 ELSE 0 END) AS draft,
         COALESCE(SUM(CASE WHEN status <> 'VOID' THEN total ELSE 0 END), 0) AS invoicedTotal
       FROM platform_invoices`
    )[0] ?? {};

    const revenueTotal = toNumber(this.db.query<any>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM platform_payments`
    )[0]?.total);
    const revenueThisMonth = toNumber(this.db.query<any>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM platform_payments
       WHERE date(paid_at) >= date('now', 'start of month')`
    )[0]?.total);
    const outstanding = toNumber(this.db.query<any>(
      `SELECT COALESCE(SUM(total - paid_amount), 0) AS total FROM platform_invoices
       WHERE status IN ('SENT','PARTIAL','OVERDUE')`
    )[0]?.total);
    const overdueInvoices = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_invoices
       WHERE status IN ('SENT','PARTIAL','OVERDUE') AND due_date IS NOT NULL
         AND date(due_date) < date('now')`
    )[0]?.count);

    const activeSubscriptions = this.db.query<any>(
      `SELECT price, billing_cycle AS billingCycle FROM platform_subscriptions WHERE status = 'ACTIVE'`
    );
    const mrr = activeSubscriptions.reduce((sum: number, row: any) => {
      const price = toNumber(row.price);
      switch (row.billingCycle) {
        case 'MONTHLY': return sum + price;
        case 'QUARTERLY': return sum + price / 3;
        case 'YEARLY': return sum + price / 12;
        default: return sum;
      }
    }, 0);

    const deviceStats = this.db.query<any>(
      `SELECT
         SUM(CASE WHEN status IN ('ACTIVE','ISSUED') AND hardware_id IS NOT NULL AND hardware_id <> '' THEN 1 ELSE 0 END) AS boundLicenses,
         SUM(CASE WHEN status IN ('ACTIVE','ISSUED') AND (hardware_id IS NULL OR hardware_id = '') THEN 1 ELSE 0 END) AS unboundLicenses,
         COALESCE(SUM(CASE WHEN status IN ('ACTIVE','ISSUED') THEN device_limit ELSE 0 END), 0) AS devicesLimit
       FROM platform_licenses`
    )[0] ?? {};

    const branchLimit = toNumber(this.db.query<any>(
      `SELECT COALESCE(SUM(branches_limit), 0) AS total FROM platform_tenants
       WHERE status IN ('ACTIVE','TRIAL')`
    )[0]?.total);

    const recentTenants = this.listTenants().slice(0, 6);
    const expiringLicenses = this.db.query<any>(
      `SELECT l.*, t.name AS tenantName, p.name AS planName
       FROM platform_licenses l
       JOIN platform_tenants t ON t.id = l.tenant_id
       LEFT JOIN platform_plans p ON p.id = l.plan_id
       WHERE l.status IN ('ACTIVE','ISSUED') AND l.expires_at IS NOT NULL
         AND date(l.expires_at) <= date('now', '+60 day')
       ORDER BY date(l.expires_at) ASC LIMIT 6`
    ).map(mapLicense);
    const expiringSubscriptions = this.db.query<any>(
      `SELECT s.*, t.name AS tenantName, p.name AS planName
       FROM platform_subscriptions s
       JOIN platform_tenants t ON t.id = s.tenant_id
       LEFT JOIN platform_plans p ON p.id = s.plan_id
       WHERE s.status IN ('ACTIVE','TRIAL') AND s.end_date IS NOT NULL
         AND date(s.end_date) <= date('now', '+60 day')
       ORDER BY date(s.end_date) ASC LIMIT 6`
    ).map(mapSubscription);
    const recentPayments = this.listPayments(6);
    const recentAudit = this.listAudit(8);

    const releases = this.listReleases().slice(0, 6);

    // Module adoption across the licences currently in force.
    const moduleRows = this.db.query<any>(
      `SELECT tenant_id AS tenantId, modules FROM platform_licenses
       WHERE status IN ('ACTIVE','ISSUED')`
    );
    const moduleLicenseCount = new Map<string, number>();
    const moduleTenants = new Map<string, Set<string>>();
    for (const row of moduleRows) {
      for (const code of safeJsonArray(row.modules)) {
        moduleLicenseCount.set(code, (moduleLicenseCount.get(code) ?? 0) + 1);
        if (!moduleTenants.has(code)) moduleTenants.set(code, new Set());
        moduleTenants.get(code)!.add(String(row.tenantId));
      }
    }
    const moduleUsage: PlatformModuleUsage[] = this.listModules()
      .map((module) => ({
        code: module.code,
        name: module.name,
        category: module.category,
        enabled: module.isEnabled,
        licenseCount: moduleLicenseCount.get(module.code) ?? 0,
        tenantCount: moduleTenants.get(module.code)?.size ?? 0,
      }))
      .sort((a, b) => b.licenseCount - a.licenseCount || b.tenantCount - a.tenantCount || a.name.localeCompare(b.name));

    const tenantsWithoutLicense = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants t
       WHERE t.status IN ('ACTIVE','TRIAL')
         AND NOT EXISTS (SELECT 1 FROM platform_licenses l WHERE l.tenant_id = t.id AND l.status = 'ACTIVE')`
    )[0]?.count);

    const alerts: PlatformAlert[] = [];
    try {
      const platformAccount = this.db.query<any>(
        `SELECT password_hash AS passwordHash FROM users WHERE username = 'platform' LIMIT 1`
      )[0];
      if (platformAccount?.passwordHash && bcrypt.compareSync('Platform@2026', platformAccount.passwordHash)) {
        alerts.push({
          id: 'default-platform-password',
          severity: 'warning',
          title: 'كلمة مرور مالك المنصة الافتراضية',
          description: 'ما زال الحساب يستخدم كلمة المرور الافتراضية. غيّرها الآن لحماية كل بيانات المنصة.',
          link: '/platform/settings',
        });
      }
    } catch {
      // Password inspection is best-effort; never block the dashboard.
    }
    if (toNumber(licenseStats.expired) > 0) {
      alerts.push({
        id: 'expired-licenses',
        severity: 'danger',
        title: `${formatCount(licenseStats.expired)} ترخيص منتهي`,
        description: 'تراخيص انتهت صلاحيتها وما زالت مرتبطة بعملاء. جدّدها أو أوقف الوصول.',
        link: '/platform/licenses',
      });
    }
    if (overdueInvoices > 0) {
      alerts.push({
        id: 'overdue-invoices',
        severity: 'danger',
        title: `${formatCount(overdueInvoices)} فاتورة متأخرة`,
        description: `مستحقات غير محصلة بقيمة ${formatMoneyText(outstanding)}. راجع المبيعات والفواتير.`,
        link: '/platform/billing',
      });
    }
    if (toNumber(licenseStats.expiringSoon) > 0) {
      alerts.push({
        id: 'expiring-licenses',
        severity: 'warning',
        title: `${formatCount(licenseStats.expiringSoon)} ترخيص ينتهي خلال 30 يوماً`,
        description: 'تواصل مع العملاء للتجديد قبل انتهاء الصلاحية.',
        link: '/platform/licenses',
      });
    }
    if (tenantsWithoutLicense > 0) {
      alerts.push({
        id: 'tenants-without-license',
        severity: 'warning',
        title: `${formatCount(tenantsWithoutLicense)} عميل نشط بدون ترخيص ساري`,
        description: 'عملاء بحالة نشطة أو تجريبية دون ترخيص فعّال. أصدر ترخيصاً أو راجع حالتهم.',
        link: '/platform/tenants',
      });
    }
    if (toNumber(tenantStats.suspended) > 0) {
      alerts.push({
        id: 'suspended-tenants',
        severity: 'info',
        title: `${formatCount(tenantStats.suspended)} عميل موقوف`,
        description: 'عملاء تم إيقاف وصولهم. راجع أسباب الإيقاف قبل إعادة التفعيل.',
        link: '/platform/tenants',
      });
    }

    let installationBranches = 0;
    let currentInstallation: PlatformOverview['currentInstallation'] = null;
    const count = (table: string, where = '') => {
      try {
        return toNumber(this.db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} ${where}`)[0]?.count);
      } catch {
        return 0;
      }
    };
    try {
      const company = this.db.query<any>(`SELECT name, currency FROM companies ORDER BY created_at LIMIT 1`)[0];
      installationBranches = count('branches');
      currentInstallation = {
        companyName: String(company?.name || this.setting('platform_name', 'المنشأة الحالية')),
        currency: String(company?.currency || this.setting('default_currency', 'EGP')),
        users: count('users', `WHERE role <> 'SUPER_ADMIN'`),
        products: count('products'),
        invoices: count('sales_invoices'),
        customers: count('customers'),
      };
    } catch {
      currentInstallation = null;
    }

    return {
      tenants: {
        total: toNumber(tenantStats.total),
        active: toNumber(tenantStats.active),
        trial: toNumber(tenantStats.trial),
        suspended: toNumber(tenantStats.suspended),
        expired: toNumber(tenantStats.expired),
        cancelled: toNumber(tenantStats.cancelled),
        expiringSoon: toNumber(tenantStats.expiringSoon),
      },
      subscriptions: {
        total: toNumber(subscriptionStats.total),
        active: toNumber(subscriptionStats.active),
        trial: toNumber(subscriptionStats.trial),
        expired: toNumber(subscriptionStats.expired),
        cancelled: toNumber(subscriptionStats.cancelled),
        expiringSoon: toNumber(subscriptionStats.expiringSoon),
      },
      licenses: {
        total: toNumber(licenseStats.total),
        active: toNumber(licenseStats.active),
        suspended: toNumber(licenseStats.suspended),
        expiringSoon: toNumber(licenseStats.expiringSoon),
        revoked: toNumber(licenseStats.revoked),
        expired: toNumber(licenseStats.expired),
      },
      billing: {
        revenueTotal,
        revenueThisMonth,
        invoicedTotal: toNumber(invoiceStats.invoicedTotal),
        outstanding,
        overdueInvoices,
        mrr,
        invoicesTotal: toNumber(invoiceStats.total),
        paidInvoices: toNumber(invoiceStats.paid),
        draftInvoices: toNumber(invoiceStats.draft),
      },
      devices: {
        boundLicenses: toNumber(deviceStats.boundLicenses),
        unboundLicenses: toNumber(deviceStats.unboundLicenses),
        devicesLimit: toNumber(deviceStats.devicesLimit),
      },
      branches: {
        totalLimit: branchLimit,
        installationBranches,
      },
      releases,
      moduleUsage,
      alerts,
      recentTenants,
      expiringLicenses,
      expiringSubscriptions,
      recentPayments,
      recentAudit,
      currentInstallation,
    };
  }

  // ─── Customers (tenants) ───────────────────────────────────────────────────

  public listTenants(search = '', status = ''): PlatformTenant[] {
    PlatformAdminService.owner();
    const term = `%${search.trim()}%`;
    return this.db.query<any>(
      `SELECT t.*, p.name AS planName, p.price AS planPrice,
         (SELECT COUNT(*) FROM platform_licenses l
           WHERE l.tenant_id = t.id AND l.status = 'ACTIVE') AS activeLicenses,
         (SELECT COUNT(*) FROM platform_licenses l
           WHERE l.tenant_id = t.id AND l.status IN ('ACTIVE','ISSUED','SUSPENDED')) AS licensesTotal,
         (SELECT COUNT(*) FROM platform_licenses l
           WHERE l.tenant_id = t.id AND l.status IN ('ACTIVE','ISSUED')
             AND l.hardware_id IS NOT NULL AND l.hardware_id <> '') AS devicesUsed,
         (SELECT COALESCE(SUM(i.total - i.paid_amount), 0) FROM platform_invoices i
           WHERE i.tenant_id = t.id AND i.status IN ('SENT','PARTIAL','OVERDUE')) AS outstanding
       FROM platform_tenants t
       LEFT JOIN platform_plans p ON p.id = t.plan_id
       WHERE (? = '' OR t.name LIKE ? OR t.code LIKE ? OR COALESCE(t.email,'') LIKE ? OR COALESCE(t.phone,'') LIKE ?)
         AND (? = '' OR t.status = ?)
       ORDER BY t.created_at DESC`,
      [search.trim(), term, term, term, term, status, status]
    ).map(mapTenant);
  }

  public getTenant(id: string): PlatformTenant | null {
    PlatformAdminService.owner();
    const row = this.db.query<any>(
      `SELECT t.*, p.name AS planName, p.price AS planPrice,
         (SELECT COUNT(*) FROM platform_licenses l
           WHERE l.tenant_id = t.id AND l.status = 'ACTIVE') AS activeLicenses,
         (SELECT COUNT(*) FROM platform_licenses l
           WHERE l.tenant_id = t.id AND l.status IN ('ACTIVE','ISSUED','SUSPENDED')) AS licensesTotal,
         (SELECT COUNT(*) FROM platform_licenses l
           WHERE l.tenant_id = t.id AND l.status IN ('ACTIVE','ISSUED')
             AND l.hardware_id IS NOT NULL AND l.hardware_id <> '') AS devicesUsed,
         (SELECT COALESCE(SUM(i.total - i.paid_amount), 0) FROM platform_invoices i
           WHERE i.tenant_id = t.id AND i.status IN ('SENT','PARTIAL','OVERDUE')) AS outstanding
       FROM platform_tenants t
       LEFT JOIN platform_plans p ON p.id = t.plan_id
       WHERE t.id = ?`,
      [id]
    )[0];
    return row ? mapTenant(row) : null;
  }

  private uniqueTenantCode(preferred?: string): string {
    const base = (preferred || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (base && this.db.query('SELECT 1 FROM platform_tenants WHERE code = ?', [base]).length === 0) {
      return base;
    }
    let index = this.nextSequence('platform_tenants');
    while (this.db.query('SELECT 1 FROM platform_tenants WHERE code = ?', [`TEN-${String(index).padStart(4, '0')}`]).length) {
      index += 1;
    }
    return `TEN-${String(index).padStart(4, '0')}`;
  }

  public createTenant(input: PlatformTenantInput): PlatformTenant {
    PlatformAdminService.owner();
    const name = String(input.name || '').trim();
    if (name.length < 2) throw new Error('اسم العميل مطلوب (حرفان على الأقل).');

    const plan = input.planId
      ? this.db.query<any>('SELECT * FROM platform_plans WHERE id = ?', [input.planId])[0]
      : this.db.query<any>('SELECT * FROM platform_plans WHERE is_default = 1 AND is_active = 1 ORDER BY sort_order LIMIT 1')[0];

    const now = new Date();
    const trialDays = Math.max(1, toNumber(this.setting('default_trial_days', '14'), 14));
    const expires = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const id = `ten_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const code = this.uniqueTenantCode(input.code);
    const status: PlatformTenantStatus = input.status || 'TRIAL';

    this.db.run(
      `INSERT INTO platform_tenants
        (id, code, name, contact_name, email, phone, country, city, address, business_type, status, plan_id,
         subscription_started_at, subscription_expires_at, seats_limit, branches_limit, devices_limit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        code,
        name,
        input.contactName?.trim() || null,
        input.email?.trim() || null,
        input.phone?.trim() || null,
        input.country?.trim() || null,
        input.city?.trim() || null,
        input.address?.trim() || null,
        input.businessType?.trim() || null,
        status,
        plan?.id || null,
        now.toISOString(),
        expires.toISOString(),
        toNumber(input.seatsLimit, plan?.seatsLimit ?? 1),
        toNumber(input.branchesLimit, plan?.branchesLimit ?? 1),
        toNumber(input.devicesLimit, plan?.devicesLimit ?? 1),
        input.notes?.trim() || null,
      ]
    );

    if (plan) {
      this.db.run(
        `INSERT INTO platform_subscriptions
          (id, tenant_id, plan_id, status, start_date, end_date, seats, price, billing_cycle, auto_renew)
         VALUES (?, ?, ?, 'TRIAL', ?, ?, ?, ?, ?, 1)`,
        [
          `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
          id,
          plan.id,
          now.toISOString(),
          expires.toISOString(),
          toNumber(plan.seatsLimit, 1),
          toNumber(plan.price),
          plan.billingCycle,
        ]
      );
    }

    this.audit('إنشاء عميل جديد', 'TENANT', id, { name, code, plan: plan?.code || null });
    return this.getTenant(id)!;
  }

  public updateTenant(id: string, input: PlatformTenantInput): PlatformTenant {
    PlatformAdminService.owner();
    const existing = this.getTenant(id);
    if (!existing) throw new Error('العميل غير موجود.');
    const name = String(input.name ?? existing.name).trim();
    if (name.length < 2) throw new Error('اسم العميل مطلوب.');

    const plan = input.planId !== undefined
      ? (input.planId ? this.db.query<any>('SELECT * FROM platform_plans WHERE id = ?', [input.planId])[0] : null)
      : null;
    const planId = input.planId !== undefined ? (plan?.id || null) : existing.planId;

    this.db.run(
      `UPDATE platform_tenants SET
         name = ?, contact_name = ?, email = ?, phone = ?, country = ?, city = ?, address = ?,
         business_type = ?, status = ?, plan_id = ?, seats_limit = ?, branches_limit = ?,
         devices_limit = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [
        name,
        input.contactName ?? existing.contactName ?? null,
        input.email ?? existing.email ?? null,
        input.phone ?? existing.phone ?? null,
        input.country ?? existing.country ?? null,
        input.city ?? existing.city ?? null,
        input.address ?? existing.address ?? null,
        input.businessType ?? existing.businessType ?? null,
        input.status ?? existing.status,
        planId,
        toNumber(input.seatsLimit, plan?.seatsLimit ?? existing.seatsLimit),
        toNumber(input.branchesLimit, plan?.branchesLimit ?? existing.branchesLimit),
        toNumber(input.devicesLimit, plan?.devicesLimit ?? existing.devicesLimit),
        input.notes ?? existing.notes ?? null,
        nowIso(),
        id,
      ]
    );
    this.audit('تعديل بيانات عميل', 'TENANT', id, { name, planId });
    return this.getTenant(id)!;
  }

  public setTenantStatus(id: string, status: PlatformTenantStatus): void {
    PlatformAdminService.owner();
    const tenant = this.getTenant(id);
    if (!tenant) throw new Error('العميل غير موجود.');
    this.db.run('UPDATE platform_tenants SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
    if (status === 'SUSPENDED' || status === 'CANCELLED') {
      this.db.run(
        `UPDATE platform_licenses SET status = 'SUSPENDED', updated_at = ? WHERE tenant_id = ? AND status = 'ACTIVE'`,
        [nowIso(), id]
      );
      this.db.run(
        `UPDATE platform_subscriptions SET status = 'SUSPENDED', updated_at = ? WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE')`,
        [nowIso(), id]
      );
    } else if (status === 'ACTIVE') {
      this.db.run(
        `UPDATE platform_subscriptions SET status = 'ACTIVE', updated_at = ? WHERE tenant_id = ? AND status = 'SUSPENDED'`,
        [nowIso(), id]
      );
    }
    this.audit('تغيير حالة عميل', 'TENANT', id, { status });
  }

  public archiveTenant(id: string): void {
    PlatformAdminService.owner();
    const tenant = this.getTenant(id);
    if (!tenant) throw new Error('العميل غير موجود.');
    this.db.executeTransaction(() => {
      this.db.run(`UPDATE platform_tenants SET status = 'CANCELLED', updated_at = ? WHERE id = ?`, [nowIso(), id]);
      this.db.run(
        `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ? WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED')`,
        [nowIso(), id]
      );
      this.db.run(
        `UPDATE platform_subscriptions SET status = 'CANCELLED', auto_renew = 0, updated_at = ? WHERE tenant_id = ?`,
        [nowIso(), id]
      );
    });
    this.audit('أرشفة عميل وإلغاء تراخيصه', 'TENANT', id, { name: tenant.name });
  }

  // ─── Tenant central file (account, subscription actions, logs) ─────────────

  public getTenantProfile(id: string): PlatformTenantProfile {
    PlatformAdminService.owner();
    const tenant = this.getTenant(id);
    if (!tenant) throw new Error('العميل غير موجود.');

    const account = this.getTenantAccount(id);
    const subscriptions = this.db.query<any>(
      `SELECT s.*, t.name AS tenantName, p.name AS planName
       FROM platform_subscriptions s
       JOIN platform_tenants t ON t.id = s.tenant_id
       LEFT JOIN platform_plans p ON p.id = s.plan_id
       WHERE s.tenant_id = ?
       ORDER BY s.created_at DESC`,
      [id]
    ).map(mapSubscription);
    const licenses = this.db.query<any>(
      `SELECT l.*, t.name AS tenantName, p.name AS planName
       FROM platform_licenses l
       JOIN platform_tenants t ON t.id = l.tenant_id
       LEFT JOIN platform_plans p ON p.id = l.plan_id
       WHERE l.tenant_id = ?
       ORDER BY l.created_at DESC`,
      [id]
    ).map(mapLicense);
    const invoices = this.db.query<any>(
      `SELECT i.*, t.name AS tenantName
       FROM platform_invoices i
       JOIN platform_tenants t ON t.id = i.tenant_id
       WHERE i.tenant_id = ?
       ORDER BY i.created_at DESC`,
      [id]
    ).map(mapInvoice);
    const payments = this.db.query<any>(
      `SELECT p.*, t.name AS tenantName, i.number AS invoiceNumber
       FROM platform_payments p
       JOIN platform_tenants t ON t.id = p.tenant_id
       LEFT JOIN platform_invoices i ON i.id = p.invoice_id
       WHERE p.tenant_id = ?
       ORDER BY p.paid_at DESC`,
      [id]
    ).map(mapPayment);

    const relatedAudit = this.db.query<any>(
      `SELECT * FROM platform_audit_logs
       WHERE entity_id = ? OR (entity_type = 'TENANT' AND details LIKE ?)
       ORDER BY created_at DESC LIMIT 300`,
      [id, `%${id}%`]
    ).map((row) => ({
      id: String(row.id),
      actorId: row.actorId ?? null,
      actorName: row.actorName ?? null,
      action: String(row.action),
      entityType: String(row.entityType),
      entityId: row.entityId ?? null,
      details: row.details ?? null,
      createdAt: String(row.createdAt),
    }));

    const activeModules = new Set<string>();
    for (const license of licenses) {
      if (license.status !== 'ACTIVE' && license.status !== 'ISSUED') continue;
      for (const module of license.modules) activeModules.add(module);
    }

    return {
      tenant,
      plan: this.listPlans().find((plan) => plan.id === tenant.planId) ?? null,
      account,
      subscriptions,
      licenses,
      invoices,
      payments,
      activationLog: relatedAudit.filter((entry) => entry.entityType === 'ACTIVATION'),
      changeLog: relatedAudit.filter((entry) => entry.entityType === 'TENANT'),
      activityLog: relatedAudit,
      usage: {
        seatsLimit: tenant.seatsLimit,
        devicesLimit: tenant.devicesLimit,
        devicesUsed: tenant.devicesUsed ?? 0,
        branchesLimit: tenant.branchesLimit,
        branchesUsed: 0,
        modulesCount: activeModules.size,
      },
    };
  }

  public getTenantAccount(tenantId: string): PlatformTenantAccount | null {
    PlatformAdminService.owner();
    const row = this.db.query<any>(
      'SELECT * FROM platform_tenant_accounts WHERE tenant_id = ?',
      [tenantId]
    )[0];
    return row ? mapTenantAccount(row) : null;
  }

  private uniqueAccountUsername(preferred: string): string {
    const base = String(preferred || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/^[-_.]+|[-_.]+$/g, '')
      .slice(0, 24) || 'tenant';
    let candidate = base;
    let index = 1;
    while (this.db.query('SELECT 1 FROM platform_tenant_accounts WHERE username = ?', [candidate]).length) {
      index += 1;
      candidate = `${base.slice(0, 20)}${index}`;
    }
    return candidate;
  }

  public createTenantAccount(
    tenantId: string,
    input: PlatformTenantAccountInput = {}
  ): { account: PlatformTenantAccount; temporaryPassword: string } {
    PlatformAdminService.owner();
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    if (this.getTenantAccount(tenantId)) throw new Error('هذا العميل لديه حساب بالفعل.');

    const preferredUsername =
      input.username?.trim() ||
      tenant.email?.split('@')[0] ||
      tenant.code.toLowerCase();
    const username = this.uniqueAccountUsername(preferredUsername);
    const temporaryPassword = input.password?.trim() || generateTemporaryPassword();
    if (temporaryPassword.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
    const activationCode = generateActivationCode();
    const id = `tacc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    this.db.run(
      `INSERT INTO platform_tenant_accounts
        (id, tenant_id, username, password_hash, email, full_name, is_active, activation_code)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        id,
        tenantId,
        username,
        bcrypt.hashSync(temporaryPassword, 10),
        input.email?.trim() || tenant.email || null,
        input.fullName?.trim() || tenant.contactName || tenant.name,
        activationCode,
      ]
    );
    this.audit('إنشاء حساب عميل', 'TENANT', tenantId, { username });
    this.audit('توليد بيانات تفعيل', 'ACTIVATION', tenantId, { username, activationCode });

    return { account: this.getTenantAccount(tenantId)!, temporaryPassword };
  }

  public resetTenantAccountPassword(
    tenantId: string,
    password?: string
  ): { account: PlatformTenantAccount; temporaryPassword: string } {
    PlatformAdminService.owner();
    const account = this.getTenantAccount(tenantId);
    if (!account) throw new Error('لا يوجد حساب لهذا العميل. أنشئ حساباً أولاً.');
    const temporaryPassword = password?.trim() || generateTemporaryPassword();
    if (temporaryPassword.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
    this.db.run(
      'UPDATE platform_tenant_accounts SET password_hash = ?, updated_at = ? WHERE tenant_id = ?',
      [bcrypt.hashSync(temporaryPassword, 10), nowIso(), tenantId]
    );
    this.audit('إعادة تعيين كلمة مرور حساب عميل', 'TENANT', tenantId, { username: account.username });
    return { account: this.getTenantAccount(tenantId)!, temporaryPassword };
  }

  public setTenantAccountActive(tenantId: string, active: boolean): PlatformTenantAccount {
    PlatformAdminService.owner();
    const account = this.getTenantAccount(tenantId);
    if (!account) throw new Error('لا يوجد حساب لهذا العميل. أنشئ حساباً أولاً.');
    this.db.run(
      'UPDATE platform_tenant_accounts SET is_active = ?, updated_at = ? WHERE tenant_id = ?',
      [active ? 1 : 0, nowIso(), tenantId]
    );
    this.audit(active ? 'تفعيل حساب عميل' : 'تعليق حساب عميل', 'TENANT', tenantId, { username: account.username });
    return this.getTenantAccount(tenantId)!;
  }

  public changeTenantPlan(
    tenantId: string,
    planId: string,
    options: { months?: number; seats?: number; price?: number } = {}
  ): PlatformTenant {
    PlatformAdminService.owner();
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const plan = this.db.query<any>('SELECT * FROM platform_plans WHERE id = ?', [planId])[0];
    if (!plan) throw new Error('الخطة غير موجودة.');
    if (!plan.isActive) throw new Error('هذه الخطة غير مفعّلة.');

    const months = Math.max(1, toNumber(options.months, 12));
    const start = new Date();
    const expires = plan.billingCycle === 'LIFETIME' ? null : addMonths(start, months);
    const seats = Math.max(1, toNumber(options.seats, plan.seatsLimit));
    const price = Math.max(0, toNumber(options.price, plan.price));
    const subscriptionId = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const licenseKey = this.generateLicenseKey();

    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE platform_subscriptions SET status = 'CANCELLED', auto_renew = 0, updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED')`,
        [nowIso(), tenantId]
      );
      this.db.run(
        `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED')`,
        [nowIso(), tenantId]
      );
      this.db.run(
        `INSERT INTO platform_subscriptions
          (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, 1)`,
        [subscriptionId, tenantId, planId, start.toISOString(), expires?.toISOString() ?? null, seats, price, plan.billingCycle]
      );
      this.db.run(
        `INSERT INTO platform_licenses
          (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, expires_at,
           seats, device_limit, modules, features, activation_code, certificate, notes)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          licenseId,
          tenantId,
          subscriptionId,
          planId,
          licenseKey,
          start.toISOString(),
          expires?.toISOString() ?? null,
          seats,
          toNumber(plan.devicesLimit, 1),
          plan.includedModules,
          plan.features,
          generateLicenseActivationCode(),
          signCertificate({ licenseKey, tenantId, planId, issuedAt: start.toISOString(), expiresAt: expires?.toISOString() ?? null, deviceLimit: toNumber(plan.devicesLimit, 1), seats }),
          `ترقية/تغيير إلى خطة ${plan.name}`,
        ]
      );
      this.db.run(
        `UPDATE platform_tenants SET status = 'ACTIVE', plan_id = ?, subscription_started_at = ?,
           subscription_expires_at = ?, seats_limit = ?, branches_limit = ?, devices_limit = ?, updated_at = ?
         WHERE id = ?`,
        [
          planId,
          start.toISOString(),
          expires?.toISOString() ?? null,
          seats,
          toNumber(plan.branchesLimit, 1),
          toNumber(plan.devicesLimit, 1),
          nowIso(),
          tenantId,
        ]
      );
    });
    this.audit('تغيير باقة العميل', 'TENANT', tenantId, {
      from: tenant.planName || tenant.planId,
      to: plan.name,
      planId,
      months,
      price,
    });
    this.audit('إصدار ترخيص مع تغيير الباقة', 'LICENSE', licenseId, { tenantId, planId, months, seats });
    return this.getTenant(tenantId)!;
  }

  public renewTenantSubscription(tenantId: string, months = 12): PlatformTenant {
    PlatformAdminService.owner();
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const duration = Math.max(1, toNumber(months, 12));
    const base = tenant.subscriptionExpiresAt && new Date(tenant.subscriptionExpiresAt) > new Date()
      ? new Date(tenant.subscriptionExpiresAt)
      : new Date();
    const expires = addMonths(base, duration);

    this.db.executeTransaction(() => {
      const activeSubscriptions = this.db.query<any>(
        `SELECT id FROM platform_subscriptions
         WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED')`,
        [tenantId]
      );
      if (activeSubscriptions.length > 0) {
        this.db.run(
          `UPDATE platform_subscriptions SET status = 'ACTIVE', end_date = ?, auto_renew = 1, updated_at = ?
           WHERE tenant_id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED')`,
          [expires.toISOString(), nowIso(), tenantId]
        );
      } else if (tenant.planId) {
        const plan = this.db.query<any>('SELECT * FROM platform_plans WHERE id = ?', [tenant.planId])[0];
        if (plan) {
          this.db.run(
            `INSERT INTO platform_subscriptions
              (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew)
             VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, 1)`,
            [
              `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
              tenantId,
              plan.id,
              nowIso(),
              expires.toISOString(),
              tenant.seatsLimit,
              toNumber(plan.price),
              plan.billingCycle,
            ]
          );
        }
      }
      this.db.run(
        `UPDATE platform_licenses SET status = 'ACTIVE', expires_at = ?, updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED','EXPIRED')`,
        [expires.toISOString(), nowIso(), tenantId]
      );
      this.db.run(
        `UPDATE platform_tenants SET status = 'ACTIVE', subscription_expires_at = ?, updated_at = ? WHERE id = ?`,
        [expires.toISOString(), nowIso(), tenantId]
      );
    });
    this.audit('تجديد اشتراك العميل', 'TENANT', tenantId, { months: duration, expiresAt: expires.toISOString() });
    return this.getTenant(tenantId)!;
  }

  public cancelTenantSubscription(tenantId: string, reason?: string): PlatformTenant {
    PlatformAdminService.owner();
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE platform_subscriptions SET status = 'CANCELLED', auto_renew = 0, updated_at = ? WHERE tenant_id = ?`,
        [nowIso(), tenantId]
      );
      this.db.run(
        `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ?
         WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED','EXPIRED')`,
        [nowIso(), tenantId]
      );
      this.db.run(
        `UPDATE platform_tenants SET status = 'CANCELLED', updated_at = ? WHERE id = ?`,
        [nowIso(), tenantId]
      );
      this.db.run(
        `UPDATE platform_tenant_accounts SET is_active = 0, updated_at = ? WHERE tenant_id = ?`,
        [nowIso(), tenantId]
      );
    });
    this.audit('إلغاء اشتراك عميل', 'TENANT', tenantId, { reason: reason?.trim() || null });
    return this.getTenant(tenantId)!;
  }

  public resetTenantDevices(tenantId: string): number {
    PlatformAdminService.owner();
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const bound = this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_licenses
       WHERE tenant_id = ? AND hardware_id IS NOT NULL AND hardware_id <> ''`,
      [tenantId]
    )[0];
    this.db.run(
      `UPDATE platform_licenses SET hardware_id = NULL, activated_at = NULL, updated_at = ?
       WHERE tenant_id = ?`,
      [nowIso(), tenantId]
    );
    this.audit('إعادة تعيين أجهزة العميل', 'TENANT', tenantId, { releasedDevices: toNumber(bound?.count) });
    return toNumber(bound?.count);
  }

  public sendTenantActivation(
    tenantId: string,
    channels: string[] = ['EMAIL']
  ): PlatformActivationDetails {
    PlatformAdminService.owner();
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    let temporaryPassword: string | null = null;
    if (!this.getTenantAccount(tenantId)) {
      const created = this.createTenantAccount(tenantId);
      temporaryPassword = created.temporaryPassword;
    }
    const account = this.getTenantAccount(tenantId)!;
    const activationCode = account.activationCode || generateActivationCode();
    if (!account.activationCode) {
      this.db.run(
        'UPDATE platform_tenant_accounts SET activation_code = ?, updated_at = ? WHERE tenant_id = ?',
        [activationCode, nowIso(), tenantId]
      );
    }

    const primaryLicense = this.db.query<any>(
      `SELECT l.*, p.name AS planName
       FROM platform_licenses l
       LEFT JOIN platform_plans p ON p.id = l.plan_id
       WHERE l.tenant_id = ? AND l.status IN ('ACTIVE','ISSUED')
       ORDER BY l.created_at DESC LIMIT 1`,
      [tenantId]
    )[0];
    const license = primaryLicense ? mapLicense(primaryLicense) : null;
    const plan = this.listPlans().find((item) => item.id === tenant.planId) ?? null;
    const modules = license?.modules?.length ? license.modules : plan?.includedModules ?? [];
    const loginUrl = typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/login`
      : '/login';

    this.audit('إرسال بيانات التفعيل', 'ACTIVATION', tenantId, {
      username: account.username,
      channels,
      activationCode,
      licenseKey: license?.licenseKey || null,
    });

    return {
      tenant,
      account: this.getTenantAccount(tenantId),
      username: account.username,
      temporaryPassword,
      activationCode,
      planName: plan?.name ?? license?.planName ?? null,
      licenseKey: license?.licenseKey ?? null,
      licenseExpiresAt: license?.expiresAt ?? tenant.subscriptionExpiresAt,
      modules,
      loginUrl,
      generatedAt: nowIso(),
    };
  }

  // ─── Plans ─────────────────────────────────────────────────────────────────

  public listPlans(includeInactive = true): PlatformPlan[] {
    PlatformAdminService.owner();
    return this.db.query<any>(
      `SELECT p.*,
         (SELECT COUNT(*) FROM platform_tenants t WHERE t.plan_id = p.id AND t.status IN ('ACTIVE','TRIAL')) AS subscriberCount
       FROM platform_plans p
       ${includeInactive ? '' : 'WHERE p.is_active = 1'}
       ORDER BY p.sort_order, p.price`
    ).map(mapPlan);
  }

  public createPlan(input: PlatformPlanInput): PlatformPlan {
    PlatformAdminService.owner();
    const code = String(input.code || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (code.length < 2) throw new Error('رمز الخطة مطلوب.');
    if (!input.name?.trim()) throw new Error('اسم الخطة مطلوب.');
    if (this.db.query('SELECT 1 FROM platform_plans WHERE code = ?', [code]).length) {
      throw new Error('رمز الخطة مستخدم بالفعل.');
    }
    const id = `plan_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    this.db.run(
      `INSERT INTO platform_plans
        (id, code, name, description, billing_cycle, price, monthly_price, yearly_price, currency, seats_limit, branches_limit,
         devices_limit, storage_limit_mb, max_products, max_warehouses, trial_days, included_modules, features, permissions,
         is_active, is_default, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        id,
        code,
        input.name.trim(),
        input.description?.trim() || null,
        input.billingCycle || 'YEARLY',
        toNumber(input.price ?? input.yearlyPrice ?? 0),
        toNumber(input.monthlyPrice ?? 0),
        toNumber(input.yearlyPrice ?? input.price ?? 0),
        input.currency || this.setting('default_currency', 'EGP'),
        toNumber(input.seatsLimit, 1),
        toNumber(input.branchesLimit, 1),
        toNumber(input.devicesLimit, 1),
        toNumber(input.storageLimitMb, 500),
        toNumber(input.maxProducts, 1000),
        toNumber(input.maxWarehouses, 2),
        toNumber(input.trialDays, 14),
        JSON.stringify(input.includedModules ?? []),
        JSON.stringify(input.features ?? []),
        JSON.stringify(input.permissions ?? []),
        input.isActive === false ? 0 : 1,
        this.nextSequence('platform_plans') + 10,
      ]
    );
    this.audit('إنشاء خطة اشتراك', 'PLAN', id, { code, name: input.name });
    return this.listPlans().find((plan) => plan.id === id)!;
  }

  public updatePlan(id: string, input: PlatformPlanInput): PlatformPlan {
    PlatformAdminService.owner();
    const existing = this.listPlans().find((plan) => plan.id === id);
    if (!existing) throw new Error('الخطة غير موجودة.');
    this.db.run(
      `UPDATE platform_plans SET
         name = ?, description = ?, billing_cycle = ?, price = ?, monthly_price = ?, yearly_price = ?, currency = ?,
         seats_limit = ?, branches_limit = ?, devices_limit = ?, storage_limit_mb = ?, max_products = ?,
         max_warehouses = ?, trial_days = ?, included_modules = ?, features = ?, permissions = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [
        (input.name ?? existing.name).trim(),
        input.description ?? existing.description ?? null,
        input.billingCycle ?? existing.billingCycle,
        toNumber(input.price ?? existing.price, existing.price),
        toNumber(input.monthlyPrice ?? existing.monthlyPrice, existing.monthlyPrice),
        toNumber(input.yearlyPrice ?? existing.yearlyPrice, existing.yearlyPrice),
        input.currency ?? existing.currency,
        toNumber(input.seatsLimit, existing.seatsLimit),
        toNumber(input.branchesLimit, existing.branchesLimit),
        toNumber(input.devicesLimit, existing.devicesLimit),
        toNumber(input.storageLimitMb, existing.storageLimitMb),
        toNumber(input.maxProducts, existing.maxProducts),
        toNumber(input.maxWarehouses, existing.maxWarehouses),
        toNumber(input.trialDays, existing.trialDays),
        JSON.stringify(input.includedModules ?? existing.includedModules),
        JSON.stringify(input.features ?? existing.features),
        JSON.stringify(input.permissions ?? existing.permissions),
        (input.isActive ?? existing.isActive) ? 1 : 0,
        nowIso(),
        id,
      ]
    );
    this.audit('تعديل خطة اشتراك', 'PLAN', id, { name: input.name ?? existing.name });
    return this.listPlans().find((plan) => plan.id === id)!;
  }

  public setPlanActive(id: string, active: boolean): void {
    PlatformAdminService.owner();
    this.db.run('UPDATE platform_plans SET is_active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, nowIso(), id]);
    this.audit(active ? 'تفعيل خطة اشتراك' : 'تعطيل خطة اشتراك', 'PLAN', id, { active });
  }

  // ─── Per-tenant overrides (without changing the base plan) ─────────────────

  public listTenantOverrides(tenantId: string): PlatformTenantOverride[] {
    PlatformAdminService.owner();
    return this.db.query<any>(
      `SELECT * FROM platform_tenant_overrides WHERE tenant_id = ? ORDER BY created_at DESC`,
      [tenantId]
    ).map(mapTenantOverride);
  }

  public addTenantOverride(tenantId: string, input: PlatformTenantOverrideInput): PlatformTenantOverride {
    PlatformAdminService.owner();
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const code = String(input.code || '').trim();
    if (!code) throw new Error('رمز الميزة/الحد مطلوب.');
    const id = `ovr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO platform_tenant_overrides
        (id, tenant_id, kind, code, value, is_enabled, expires_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        input.kind,
        code,
        input.value?.trim() || null,
        input.isEnabled === false ? 0 : 1,
        input.expiresAt || null,
        input.notes?.trim() || null,
      ]
    );
    this.audit('إضافة ميزة/حد خاص للعميل', 'TENANT', tenantId, { kind: input.kind, code, value: input.value ?? null });
    return this.listTenantOverrides(tenantId).find((item) => item.id === id)!;
  }

  public setTenantOverrideEnabled(id: string, enabled: boolean): PlatformTenantOverride {
    PlatformAdminService.owner();
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_tenant_overrides WHERE id = ?', [id])[0];
    if (!row) throw new Error('التجاوز غير موجود.');
    this.db.run('UPDATE platform_tenant_overrides SET is_enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, nowIso(), id]);
    this.audit(enabled ? 'تفعيل تجاوز خاص للعميل' : 'تعطيل تجاوز خاص للعميل', 'TENANT', String(row.tenantId), { id, enabled });
    return this.db.query<any>('SELECT * FROM platform_tenant_overrides WHERE id = ?', [id]).map(mapTenantOverride)[0];
  }

  public removeTenantOverride(id: string): void {
    PlatformAdminService.owner();
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_tenant_overrides WHERE id = ?', [id])[0];
    if (!row) throw new Error('التجاوز غير موجود.');
    this.db.run('DELETE FROM platform_tenant_overrides WHERE id = ?', [id]);
    this.audit('حذف تجاوز خاص للعميل', 'TENANT', String(row.tenantId), { id });
  }

  // ─── Per-tenant user directory ─────────────────────────────────────────────

  public listTenantUsers(tenantId: string): PlatformTenantUser[] {
    PlatformAdminService.owner();
    return this.db.query<any>(
      `SELECT * FROM platform_tenant_users WHERE tenant_id = ? ORDER BY created_at DESC`,
      [tenantId]
    ).map(mapTenantUser);
  }

  public createTenantUser(tenantId: string, input: PlatformTenantUserInput): PlatformTenantUser {
    PlatformAdminService.owner();
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const fullName = String(input.fullName || '').trim();
    if (fullName.length < 2) throw new Error('اسم المستخدم مطلوب.');
    const id = `tusr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO platform_tenant_users
        (id, tenant_id, full_name, username, email, phone, role, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        fullName,
        input.username?.trim() || null,
        input.email?.trim() || null,
        input.phone?.trim() || null,
        input.role?.trim() || 'USER',
        input.status || 'ACTIVE',
        input.notes?.trim() || null,
      ]
    );
    this.audit('إضافة مستخدم للعميل', 'TENANT', tenantId, { fullName, role: input.role || 'USER' });
    return this.listTenantUsers(tenantId).find((item) => item.id === id)!;
  }

  public updateTenantUser(id: string, input: PlatformTenantUserInput): PlatformTenantUser {
    PlatformAdminService.owner();
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_tenant_users WHERE id = ?', [id])[0];
    if (!row) throw new Error('المستخدم غير موجود.');
    const tenantId = String(row.tenantId);
    const existing = this.listTenantUsers(tenantId).find((item) => item.id === id)!;
    const fullName = String(input.fullName ?? existing.fullName).trim();
    if (fullName.length < 2) throw new Error('اسم المستخدم مطلوب.');
    this.db.run(
      `UPDATE platform_tenant_users SET
         full_name = ?, username = ?, email = ?, phone = ?, role = ?, status = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [
        fullName,
        input.username ?? existing.username ?? null,
        input.email ?? existing.email ?? null,
        input.phone ?? existing.phone ?? null,
        input.role ?? existing.role,
        input.status ?? existing.status,
        input.notes ?? existing.notes ?? null,
        nowIso(),
        id,
      ]
    );
    this.audit('تعديل مستخدم عميل', 'TENANT', tenantId, { id, fullName });
    return this.listTenantUsers(tenantId).find((item) => item.id === id)!;
  }

  public setTenantUserActive(id: string, active: boolean): PlatformTenantUser {
    PlatformAdminService.owner();
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_tenant_users WHERE id = ?', [id])[0];
    if (!row) throw new Error('المستخدم غير موجود.');
    const tenantId = String(row.tenantId);
    this.db.run(
      `UPDATE platform_tenant_users SET status = ?, updated_at = ? WHERE id = ?`,
      [active ? 'ACTIVE' : 'SUSPENDED', nowIso(), id]
    );
    this.audit(active ? 'تفعيل مستخدم عميل' : 'تعليق مستخدم عميل', 'TENANT', tenantId, { id, active });
    return this.listTenantUsers(tenantId).find((item) => item.id === id)!;
  }

  public deleteTenantUser(id: string): void {
    PlatformAdminService.owner();
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_tenant_users WHERE id = ?', [id])[0];
    if (!row) throw new Error('المستخدم غير موجود.');
    this.db.run('DELETE FROM platform_tenant_users WHERE id = ?', [id]);
    this.audit('حذف مستخدم عميل', 'TENANT', String(row.tenantId), { id });
  }

  // ─── Licenses ──────────────────────────────────────────────────────────────

  public listLicenses(search = '', status = ''): PlatformLicense[] {
    PlatformAdminService.owner();
    const term = `%${search.trim()}%`;
    return this.db.query<any>(
      `SELECT l.*, t.name AS tenantName, p.name AS planName
       FROM platform_licenses l
       JOIN platform_tenants t ON t.id = l.tenant_id
       LEFT JOIN platform_plans p ON p.id = l.plan_id
       WHERE (? = '' OR t.name LIKE ? OR l.license_key LIKE ? OR COALESCE(l.hardware_id,'') LIKE ?)
         AND (? = '' OR l.status = ?)
       ORDER BY l.created_at DESC`,
      [search.trim(), term, term, term, status, status]
    ).map(mapLicense);
  }

  public getLicense(id: string): PlatformLicense | null {
    PlatformAdminService.owner();
    const row = this.db.query<any>(
      `SELECT l.*, t.name AS tenantName, p.name AS planName
       FROM platform_licenses l
       JOIN platform_tenants t ON t.id = l.tenant_id
       LEFT JOIN platform_plans p ON p.id = l.plan_id
       WHERE l.id = ?`,
      [id]
    )[0];
    return row ? mapLicense(row) : null;
  }

  private generateLicenseKey(): string {
    const block = () => uuidv4().replace(/-/g, '').slice(0, 4).toUpperCase();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const key = `CS-${block()}-${block()}-${block()}-${block()}`;
      if (this.db.query('SELECT 1 FROM platform_licenses WHERE license_key = ?', [key]).length === 0) return key;
    }
    throw new Error('تعذر توليد مفتاح ترخيص فريد. أعد المحاولة.');
  }

  public issueLicense(
    tenantId: string,
    planId: string,
    options: { months?: number; seats?: number; notes?: string } = {}
  ): PlatformLicense {
    PlatformAdminService.owner();
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const plan = this.db.query<any>('SELECT * FROM platform_plans WHERE id = ?', [planId])[0];
    if (!plan) throw new Error('الخطة غير موجودة.');

    const months = Math.max(1, toNumber(options.months, 12));
    const start = new Date();
    const expires = plan.billingCycle === 'LIFETIME'
      ? null
      : addMonths(start, months);
    const subscriptionId = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const seats = Math.max(1, toNumber(options.seats, plan.seatsLimit));
    const licenseKey = this.generateLicenseKey();
    const activationCode = generateLicenseActivationCode();
    const certificate = signCertificate({
      licenseKey,
      tenantId,
      planId,
      issuedAt: start.toISOString(),
      expiresAt: expires?.toISOString() ?? null,
      deviceLimit: toNumber(plan.devicesLimit, 1),
      seats,
    });

    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO platform_subscriptions
          (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, 1)`,
        [subscriptionId, tenantId, planId, start.toISOString(), expires?.toISOString() ?? null, seats, toNumber(plan.price), plan.billingCycle]
      );
      this.db.run(
        `INSERT INTO platform_licenses
          (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, expires_at,
           seats, device_limit, modules, features, activation_code, certificate, notes)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          licenseId,
          tenantId,
          subscriptionId,
          planId,
          licenseKey,
          start.toISOString(),
          expires?.toISOString() ?? null,
          seats,
          toNumber(plan.devicesLimit, 1),
          plan.includedModules,
          plan.features,
          activationCode,
          certificate,
          options.notes?.trim() || null,
        ]
      );
      this.db.run(
        `UPDATE platform_tenants SET status = 'ACTIVE', plan_id = ?, subscription_started_at = ?,
           subscription_expires_at = ?, seats_limit = ?, branches_limit = ?, devices_limit = ?, updated_at = ?
         WHERE id = ?`,
        [
          planId,
          start.toISOString(),
          expires?.toISOString() ?? null,
          seats,
          toNumber(plan.branchesLimit, 1),
          toNumber(plan.devicesLimit, 1),
          nowIso(),
          tenantId,
        ]
      );
    });
    this.recordLicenseActivation(this.getLicense(licenseId)!, null, 'ACTIVATE', 'ONLINE', 'SUCCESS', 'إصدار ترخيص');
    this.audit('إصدار ترخيص جديد', 'LICENSE', licenseId, { tenantId, planId, months, seats });
    return this.getLicense(licenseId)!;
  }

  public renewLicense(id: string, months = 12): PlatformLicense {
    PlatformAdminService.owner();
    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');
    const base = license.expiresAt && new Date(license.expiresAt) > new Date()
      ? new Date(license.expiresAt)
      : new Date();
    const expires = addMonths(base, Math.max(1, months));
    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE platform_licenses SET status = 'ACTIVE', expires_at = ?, updated_at = ? WHERE id = ?`,
        [expires.toISOString(), nowIso(), id]
      );
      if (license.subscriptionId) {
        this.db.run(
          `UPDATE platform_subscriptions SET status = 'ACTIVE', end_date = ?, updated_at = ? WHERE id = ?`,
          [expires.toISOString(), nowIso(), license.subscriptionId]
        );
      }
      this.db.run(
        `UPDATE platform_tenants SET status = 'ACTIVE', subscription_expires_at = ?, updated_at = ? WHERE id = ?`,
        [expires.toISOString(), nowIso(), license.tenantId]
      );
    });
    this.recordLicenseActivation(license, license.hardwareId ?? null, 'RENEW', 'ONLINE', 'SUCCESS', `تجديد ${months} شهر`);
    this.audit('تجديد ترخيص', 'LICENSE', id, { months, expiresAt: expires.toISOString() });
    return this.getLicense(id)!;
  }

  public setLicenseStatus(id: string, status: PlatformLicenseStatus): void {
    PlatformAdminService.owner();
    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');
    this.db.run('UPDATE platform_licenses SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
    if (status === 'ACTIVE') {
      this.db.run(
        `UPDATE platform_tenants SET status = 'ACTIVE', updated_at = ? WHERE id = ?`,
        [nowIso(), license.tenantId]
      );
    } else if (status === 'SUSPENDED' || status === 'REVOKED' || status === 'EXPIRED') {
      this.db.run(
        `UPDATE platform_tenants SET status = 'SUSPENDED', updated_at = ? WHERE id = ?`,
        [nowIso(), license.tenantId]
      );
    }
    this.audit('تغيير حالة ترخيص', 'LICENSE', id, { status });
  }

  public bindLicenseHardware(id: string, hardwareId: string): void {
    PlatformAdminService.owner();
    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');
    const newHardware = hardwareId.trim() || null;
    const action = license.hardwareId && newHardware && license.hardwareId !== newHardware ? 'TRANSFER' : 'ACTIVATE';
    this.db.run(
      `UPDATE platform_licenses SET hardware_id = ?, activated_at = COALESCE(activated_at, ?), updated_at = ? WHERE id = ?`,
      [newHardware, nowIso(), nowIso(), id]
    );
    if (action === 'TRANSFER') {
      this.db.run('UPDATE platform_licenses SET transfer_count = transfer_count + 1, updated_at = ? WHERE id = ?', [nowIso(), id]);
    }
    this.recordLicenseActivation(license, newHardware, action, 'ONLINE', 'SUCCESS', newHardware ? 'ربط بجهاز' : 'إلغاء الربط');
    this.audit(action === 'TRANSFER' ? 'نقل ترخيص إلى جهاز آخر' : 'ربط ترخيص بجهاز', 'LICENSE', id, { hardwareId: newHardware });
  }

  public deactivateLicenseDevice(id: string, notes?: string): void {
    PlatformAdminService.owner();
    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');
    this.db.run(
      `UPDATE platform_licenses SET hardware_id = NULL, updated_at = ? WHERE id = ?`,
      [nowIso(), id]
    );
    this.recordLicenseActivation(license, license.hardwareId ?? null, 'DEACTIVATE', 'ONLINE', 'SUCCESS', notes || 'إلغاء تفعيل جهاز');
    this.audit('إلغاء تفعيل جهاز ترخيص', 'LICENSE', id, { previousDevice: license.hardwareId });
  }

  public listLicenseActivations(licenseId: string): PlatformLicenseActivation[] {
    PlatformAdminService.owner();
    return this.db.query<any>(
      `SELECT * FROM platform_license_activations WHERE license_id = ? ORDER BY created_at DESC`,
      [licenseId]
    ).map((row) => ({
      id: String(row.id),
      licenseId: String(row.licenseId),
      tenantId: String(row.tenantId),
      deviceId: row.deviceId ?? null,
      activationCode: row.activationCode ?? null,
      mode: row.mode,
      action: row.action,
      status: row.status,
      ipAddress: row.ipAddress ?? null,
      notes: row.notes ?? null,
      createdAt: String(row.createdAt),
    }));
  }

  // ─── Devices ────────────────────────────────────────────────────────────────

  public listDevices(tenantId?: string): PlatformDevice[] {
    PlatformAdminService.owner();
    const rows = tenantId
      ? this.db.query<any>(`SELECT * FROM platform_devices WHERE tenant_id = ? ORDER BY last_seen_at DESC, created_at DESC`, [tenantId])
      : this.db.query<any>(`SELECT * FROM platform_devices ORDER BY last_seen_at DESC, created_at DESC`);
    return rows.map(mapDevice);
  }

  public registerDevice(input: {
    tenantId: string;
    licenseId?: string | null;
    hardwareId: string;
    name?: string;
    os?: string;
    appVersion?: string;
    ipAddress?: string;
  }): PlatformDevice {
    PlatformAdminService.owner();
    const tenant = this.getTenant(input.tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const hardwareId = String(input.hardwareId || '').trim();
    if (!hardwareId) throw new Error('معرف الجهاز (Hardware ID) مطلوب.');
    const existing = this.db.query<any>(
      `SELECT * FROM platform_devices WHERE tenant_id = ? AND hardware_id = ?`,
      [input.tenantId, hardwareId]
    )[0];
    if (existing) {
      this.db.run(
        `UPDATE platform_devices SET license_id = COALESCE(?, license_id), name = COALESCE(?, name),
           os = COALESCE(?, os), app_version = COALESCE(?, app_version), ip_address = COALESCE(?, ip_address),
           last_seen_at = ?, updated_at = ? WHERE id = ?`,
        [
          input.licenseId ?? null,
          input.name?.trim() || null,
          input.os?.trim() || null,
          input.appVersion?.trim() || null,
          input.ipAddress?.trim() || null,
          nowIso(),
          nowIso(),
          existing.id,
        ]
      );
      return this.listDevices(input.tenantId).find((item) => item.id === existing.id)!;
    }
    const id = `pdev_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO platform_devices
        (id, tenant_id, license_id, hardware_id, name, os, app_version, ip_address, first_activated_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.tenantId,
        input.licenseId ?? null,
        hardwareId,
        input.name?.trim() || null,
        input.os?.trim() || null,
        input.appVersion?.trim() || null,
        input.ipAddress?.trim() || null,
        nowIso(),
        nowIso(),
      ]
    );
    this.audit('تسجيل جهاز جديد', 'TENANT', input.tenantId, { hardwareId, name: input.name || null });
    return this.listDevices(input.tenantId).find((item) => item.id === id)!;
  }

  public setDeviceStatus(id: string, status: PlatformDevice['status']): PlatformDevice {
    PlatformAdminService.owner();
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_devices WHERE id = ?', [id])[0];
    if (!row) throw new Error('الجهاز غير موجود.');
    this.db.run('UPDATE platform_devices SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
    this.audit(status === 'SUSPENDED' ? 'إيقاف جهاز' : 'تفعيل جهاز', 'TENANT', String(row.tenantId), { id, status });
    const tenantId = String(row.tenantId);
    return this.listDevices(tenantId).find((item) => item.id === id)!;
  }

  public deleteDevice(id: string): void {
    PlatformAdminService.owner();
    const row = this.db.query<any>('SELECT tenant_id AS tenantId, hardware_id AS hardwareId FROM platform_devices WHERE id = ?', [id])[0];
    if (!row) throw new Error('الجهاز غير موجود.');
    this.db.run('DELETE FROM platform_devices WHERE id = ?', [id]);
    this.audit('حذف تفعيل جهاز', 'TENANT', String(row.tenantId), { id, hardwareId: row.hardwareId });
  }

  public markDeviceCloneSuspected(id: string, suspected: boolean): PlatformDevice {
    PlatformAdminService.owner();
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_devices WHERE id = ?', [id])[0];
    if (!row) throw new Error('الجهاز غير موجود.');
    this.db.run('UPDATE platform_devices SET clone_suspected = ?, updated_at = ? WHERE id = ?', [suspected ? 1 : 0, nowIso(), id]);
    this.audit(suspected ? 'اشتباه استنساخ جهاز' : 'رفع اشتباه استنساخ جهاز', 'TENANT', String(row.tenantId), { id, suspected });
    return this.listDevices(String(row.tenantId)).find((item) => item.id === id)!;
  }

  public reassignDeviceSeat(deviceId: string, licenseId: string): PlatformDevice {
    PlatformAdminService.owner();
    const device = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_devices WHERE id = ?', [deviceId])[0];
    if (!device) throw new Error('الجهاز غير موجود.');
    const license = this.getLicense(licenseId);
    if (!license) throw new Error('الترخيص غير موجود.');
    this.db.run('UPDATE platform_devices SET license_id = ?, updated_at = ? WHERE id = ?', [licenseId, nowIso(), deviceId]);
    this.audit('إعادة تخصيص مقعد جهاز', 'TENANT', String(device.tenantId), { deviceId, licenseId });
    return this.listDevices(String(device.tenantId)).find((item) => item.id === deviceId)!;
  }

  // ─── Support tickets ───────────────────────────────────────────────────────

  public listSupportTickets(search = '', status = ''): PlatformSupportTicket[] {
    PlatformAdminService.owner();
    const term = `%${search.trim()}%`;
    return this.db.query<any>(
      `SELECT t.*, tn.name AS tenantName
       FROM platform_support_tickets t
       JOIN platform_tenants tn ON tn.id = t.tenant_id
       WHERE (? = '' OR t.subject LIKE ? OR tn.name LIKE ? OR COALESCE(t.description,'') LIKE ?)
         AND (? = '' OR t.status = ?)
       ORDER BY t.created_at DESC`,
      [search.trim(), term, term, term, status, status]
    ).map(mapSupportTicket);
  }

  public createSupportTicket(input: {
    tenantId: string;
    deviceId?: string;
    subject: string;
    description?: string;
    priority?: PlatformSupportTicket['priority'];
    assignedTo?: string;
  }): PlatformSupportTicket {
    PlatformAdminService.owner();
    const tenant = this.getTenant(input.tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const subject = String(input.subject || '').trim();
    if (subject.length < 3) throw new Error('موضوع التذكرة مطلوب.');
    const id = `tkt_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO platform_support_tickets
        (id, tenant_id, device_id, subject, description, priority, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.tenantId,
        input.deviceId || null,
        subject,
        input.description?.trim() || null,
        input.priority || 'MEDIUM',
        input.assignedTo?.trim() || null,
      ]
    );
    this.audit('إنشاء تذكرة دعم', 'TENANT', input.tenantId, { ticketId: id, subject, priority: input.priority || 'MEDIUM' });
    return this.listSupportTickets().find((item) => item.id === id)!;
  }

  public setSupportTicketStatus(id: string, status: PlatformSupportTicket['status']): PlatformSupportTicket {
    PlatformAdminService.owner();
    const ticket = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_support_tickets WHERE id = ?', [id])[0];
    if (!ticket) throw new Error('التذكرة غير موجودة.');
    this.db.run(
      `UPDATE platform_support_tickets SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ?`,
      [status, status === 'RESOLVED' || status === 'CLOSED' ? nowIso() : null, nowIso(), id]
    );
    this.audit('تغيير حالة تذكرة دعم', 'TENANT', String(ticket.tenantId), { ticketId: id, status });
    return this.listSupportTickets().find((item) => item.id === id)!;
  }

  public requestRemoteAccess(id: string, requested: boolean): PlatformSupportTicket {
    PlatformAdminService.owner();
    const ticket = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_support_tickets WHERE id = ?', [id])[0];
    if (!ticket) throw new Error('التذكرة غير موجودة.');
    this.db.run(
      `UPDATE platform_support_tickets SET remote_access_requested = ?, updated_at = ? WHERE id = ?`,
      [requested ? 1 : 0, nowIso(), id]
    );
    this.audit(requested ? 'طلب وصول عن بعد' : 'إلغاء طلب وصول عن بعد', 'TENANT', String(ticket.tenantId), { ticketId: id, requested });
    return this.listSupportTickets().find((item) => item.id === id)!;
  }

  public approveRemoteAccess(id: string, approved: boolean): PlatformSupportTicket {
    PlatformAdminService.owner();
    const ticket = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_support_tickets WHERE id = ?', [id])[0];
    if (!ticket) throw new Error('التذكرة غير موجودة.');
    this.db.run(
      `UPDATE platform_support_tickets SET remote_access_approved = ?, updated_at = ? WHERE id = ?`,
      [approved ? 1 : 0, nowIso(), id]
    );
    this.audit(approved ? 'موافقة العميل على الوصول عن بعد' : 'رفض العميل للوصول عن بعد', 'TENANT', String(ticket.tenantId), { ticketId: id, approved });
    return this.listSupportTickets().find((item) => item.id === id)!;
  }

  public addSupportMessage(input: {
    ticketId: string;
    authorName: string;
    authorRole?: 'CUSTOMER' | 'SUPPORT' | 'SYSTEM';
    body: string;
    attachmentUrl?: string;
  }): PlatformSupportMessage {
    PlatformAdminService.owner();
    const ticket = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_support_tickets WHERE id = ?', [input.ticketId])[0];
    if (!ticket) throw new Error('التذكرة غير موجودة.');
    const body = String(input.body || '').trim();
    if (!body) throw new Error('نص الرسالة مطلوب.');
    const id = `msg_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO platform_support_messages (id, ticket_id, author_name, author_role, body, attachment_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.ticketId, input.authorName.trim(), input.authorRole || 'SUPPORT', body, input.attachmentUrl?.trim() || null]
    );
    this.audit('إضافة رسالة دعم', 'TENANT', String(ticket.tenantId), { ticketId: input.ticketId, author: input.authorName });
    return this.db.query<any>('SELECT * FROM platform_support_messages WHERE id = ?', [id]).map(mapSupportMessage)[0];
  }

  public listSupportMessages(ticketId: string): PlatformSupportMessage[] {
    PlatformAdminService.owner();
    return this.db.query<any>(
      `SELECT * FROM platform_support_messages WHERE ticket_id = ? ORDER BY created_at ASC`,
      [ticketId]
    ).map(mapSupportMessage);
  }

  // ─── API keys ───────────────────────────────────────────────────────────────

  public listApiKeys(tenantId?: string): PlatformApiKey[] {
    PlatformAdminService.owner();
    const rows = tenantId
      ? this.db.query<any>(`SELECT * FROM platform_api_keys WHERE tenant_id = ? ORDER BY created_at DESC`, [tenantId])
      : this.db.query<any>(`SELECT * FROM platform_api_keys ORDER BY created_at DESC`);
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenantId),
      name: String(row.name),
      keyPrefix: String(row.keyPrefix),
      scopes: safeJsonArray(row.scopes),
      isActive: Boolean(row.isActive),
      expiresAt: row.expiresAt ?? null,
      lastUsedAt: row.lastUsedAt ?? null,
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    }));
  }

  public createApiKey(input: { tenantId: string; name: string; scopes?: string[]; expiresAt?: string }): PlatformApiKeyCreated {
    PlatformAdminService.owner();
    const tenant = this.getTenant(input.tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const name = String(input.name || '').trim();
    if (name.length < 2) throw new Error('اسم المفتاح مطلوب.');
    const plainTextKey = `csk_${randomToken(8, 'abcdefghijklmnopqrstuvwxyz0123456789')}_${randomToken(16, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
    const prefix = plainTextKey.slice(0, 12);
    const hash = btoa(plainTextKey).replace(/=+$/, '');
    const id = `apikey_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO platform_api_keys (id, tenant_id, name, key_prefix, key_hash, scopes, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.tenantId, name, prefix, hash, JSON.stringify(input.scopes ?? []), input.expiresAt || null]
    );
    this.audit('إنشاء مفتاح API', 'TENANT', input.tenantId, { name, scopes: input.scopes ?? [] });
    return {
      key: this.listApiKeys(input.tenantId).find((item) => item.id === id)!,
      plainTextKey,
    };
  }

  public revokeApiKey(id: string): void {
    PlatformAdminService.owner();
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_api_keys WHERE id = ?', [id])[0];
    if (!row) throw new Error('المفتاح غير موجود.');
    this.db.run('UPDATE platform_api_keys SET is_active = 0, updated_at = ? WHERE id = ?', [nowIso(), id]);
    this.audit('إلغاء مفتاح API', 'TENANT', String(row.tenantId), { id });
  }

  public rotateApiKey(id: string): PlatformApiKeyCreated {
    PlatformAdminService.owner();
    const existing = this.db.query<any>('SELECT * FROM platform_api_keys WHERE id = ?', [id])[0];
    if (!existing) throw new Error('المفتاح غير موجود.');
    const tenantId = String(existing.tenantId);
    const name = String(existing.name);
    const scopes = safeJsonArray(existing.scopes);
    this.revokeApiKey(id);
    return this.createApiKey({ tenantId, name: `${name} (rotated)`, scopes, expiresAt: existing.expiresAt ?? undefined });
  }

  public validateApiKey(plainTextKey: string): PlatformApiKey | null {
    const hash = btoa(plainTextKey).replace(/=+$/, '');
    const row = this.db.query<any>('SELECT * FROM platform_api_keys WHERE key_hash = ? AND is_active = 1', [hash])[0];
    if (!row) return null;
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) return null;
    this.db.run('UPDATE platform_api_keys SET last_used_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), row.id]);
    return {
      id: String(row.id),
      tenantId: String(row.tenantId),
      name: String(row.name),
      keyPrefix: String(row.keyPrefix),
      scopes: safeJsonArray(row.scopes),
      isActive: Boolean(row.isActive),
      expiresAt: row.expiresAt ?? null,
      lastUsedAt: nowIso(),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    };
  }

  // ─── Coupons ───────────────────────────────────────────────────────────────

  public listCoupons(): PlatformCoupon[] {
    PlatformAdminService.owner();
    return this.db.query<any>('SELECT * FROM platform_coupons ORDER BY created_at DESC').map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      discountType: row.discountType,
      discountValue: toNumber(row.discountValue),
      maxUses: row.maxUses ?? null,
      usedCount: toNumber(row.usedCount),
      expiresAt: row.expiresAt ?? null,
      isActive: Boolean(row.isActive),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    }));
  }

  public createCoupon(input: {
    code: string;
    name: string;
    discountType: 'PERCENT' | 'FIXED';
    discountValue: number;
    maxUses?: number;
    expiresAt?: string;
  }): PlatformCoupon {
    PlatformAdminService.owner();
    const code = String(input.code || '').trim().toUpperCase();
    if (!code) throw new Error('رمز الكوبون مطلوب.');
    if (!input.name?.trim()) throw new Error('اسم الكوبون مطلوب.');
    if (this.db.query('SELECT 1 FROM platform_coupons WHERE code = ?', [code]).length) throw new Error('رمز الكوبون مستخدم بالفعل.');
    const id = `cpn_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO platform_coupons (id, code, name, discount_type, discount_value, max_uses, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, code, input.name.trim(), input.discountType, toNumber(input.discountValue), input.maxUses ?? null, input.expiresAt || null]
    );
    this.audit('إنشاء كوبون خصم', 'SETTINGS', id, { code, discountType: input.discountType, discountValue: input.discountValue });
    return this.listCoupons().find((item) => item.id === id)!;
  }

  public validateCoupon(code: string, subtotal: number): { coupon: PlatformCoupon; discount: number } {
    PlatformAdminService.owner();
    const coupon = this.db.query<any>('SELECT * FROM platform_coupons WHERE code = ?', [code.trim().toUpperCase()])[0];
    if (!coupon) throw new Error('الكوبون غير موجود.');
    if (!coupon.isActive) throw new Error('الكوبون غير فعّال.');
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) throw new Error('الكوبون منتهي الصلاحية.');
    if (coupon.maxUses && toNumber(coupon.usedCount) >= toNumber(coupon.maxUses)) throw new Error('تم استنفاد استخدامات الكوبون.');
    const value = toNumber(coupon.discountValue);
    const discount = coupon.discountType === 'PERCENT' ? Math.max(0, subtotal * (value / 100)) : Math.max(0, value);
    return {
      coupon: {
        id: String(coupon.id),
        code: String(coupon.code),
        name: String(coupon.name),
        discountType: coupon.discountType,
        discountValue: value,
        maxUses: coupon.maxUses ?? null,
        usedCount: toNumber(coupon.usedCount),
        expiresAt: coupon.expiresAt ?? null,
        isActive: Boolean(coupon.isActive),
        createdAt: String(coupon.createdAt),
        updatedAt: String(coupon.updatedAt),
      },
      discount: Math.min(discount, subtotal),
    };
  }

  public applyCoupon(code: string): PlatformCoupon {
    PlatformAdminService.owner();
    const coupon = this.db.query<any>('SELECT * FROM platform_coupons WHERE code = ?', [code.trim().toUpperCase()])[0];
    if (!coupon) throw new Error('الكوبون غير موجود.');
    this.db.run('UPDATE platform_coupons SET used_count = used_count + 1, updated_at = ? WHERE code = ?', [nowIso(), code.trim().toUpperCase()]);
    this.audit('تطبيق كوبون خصم', 'SETTINGS', String(coupon.id), { code: coupon.code });
    return this.listCoupons().find((item) => item.code === String(coupon.code).toUpperCase())!;
  }

  private recordLicenseActivation(
    license: PlatformLicense,
    deviceId: string | null,
    action: PlatformLicenseActivation['action'],
    mode: 'ONLINE' | 'OFFLINE',
    status: 'SUCCESS' | 'FAILED' | 'PENDING',
    notes?: string | null
  ): void {
    this.db.run(
      `INSERT INTO platform_license_activations
        (id, license_id, tenant_id, device_id, activation_code, mode, action, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `lact_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        license.id,
        license.tenantId,
        deviceId,
        license.activationCode ?? null,
        mode,
        action,
        status,
        notes ?? null,
      ]
    );
  }

  // ─── Billing ───────────────────────────────────────────────────────────────

  private refreshOverdueInvoices(): void {
    this.db.run(
      `UPDATE platform_invoices
         SET status = 'OVERDUE', updated_at = ?
       WHERE status IN ('SENT','PARTIAL') AND due_date IS NOT NULL
         AND date(due_date) < date('now') AND paid_amount < total`,
      [nowIso()]
    );
  }

  public listInvoices(search = '', status = ''): PlatformInvoice[] {
    PlatformAdminService.owner();
    this.refreshOverdueInvoices();
    const term = `%${search.trim()}%`;
    return this.db.query<any>(
      `SELECT i.*, t.name AS tenantName
       FROM platform_invoices i
       JOIN platform_tenants t ON t.id = i.tenant_id
       WHERE (? = '' OR i.number LIKE ? OR t.name LIKE ?)
         AND (? = '' OR i.status = ?)
       ORDER BY i.created_at DESC`,
      [search.trim(), term, term, status, status]
    ).map(mapInvoice);
  }

  public getInvoice(id: string): PlatformInvoice | null {
    PlatformAdminService.owner();
    const row = this.db.query<any>(
      `SELECT i.*, t.name AS tenantName
       FROM platform_invoices i JOIN platform_tenants t ON t.id = i.tenant_id
       WHERE i.id = ?`,
      [id]
    )[0];
    if (!row) return null;
    const invoice = mapInvoice(row);
    invoice.items = this.db.query<any>(
      `SELECT id, description, quantity, unit_price AS unitPrice, total
       FROM platform_invoice_items WHERE invoice_id = ? ORDER BY rowid`,
      [id]
    ).map((item) => ({
      id: item.id,
      description: String(item.description),
      quantity: toNumber(item.quantity, 1),
      unitPrice: toNumber(item.unitPrice),
      total: toNumber(item.total),
    }));
    return invoice;
  }

  private nextInvoiceNumber(): string {
    const prefix = this.setting('invoice_prefix', 'CS-INV');
    const stamp = new Date().toISOString().slice(0, 7).replace('-', '');
    let index = this.nextSequence('platform_invoices');
    let number = `${prefix}-${stamp}-${String(index).padStart(4, '0')}`;
    while (this.db.query('SELECT 1 FROM platform_invoices WHERE number = ?', [number]).length) {
      index += 1;
      number = `${prefix}-${stamp}-${String(index).padStart(4, '0')}`;
    }
    return number;
  }

  public createInvoice(input: PlatformInvoiceInput): PlatformInvoice {
    PlatformAdminService.owner();
    const tenant = this.getTenant(input.tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const items = (input.items || []).filter((item) => item.description?.trim());
    if (items.length === 0) throw new Error('أضف بنداً واحداً على الأقل للفاتورة.');

    const subtotal = items.reduce(
      (sum, item) => sum + toNumber(item.quantity, 1) * toNumber(item.unitPrice),
      0
    );
    const discount = Math.max(0, toNumber(input.discount));
    const tax = Math.max(0, toNumber(input.tax));
    const total = Math.max(0, subtotal - discount + tax);
    const id = `inv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const number = this.nextInvoiceNumber();
    const issueDate = input.issueDate || nowIso();
    const status = input.status === 'SENT' ? 'SENT' : 'DRAFT';

    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO platform_invoices
          (id, number, tenant_id, subscription_id, issue_date, due_date, status, currency,
           subtotal, discount, tax, total, paid_amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          id,
          number,
          input.tenantId,
          input.subscriptionId || null,
          issueDate,
          input.dueDate || null,
          status,
          this.setting('default_currency', 'EGP'),
          subtotal,
          discount,
          tax,
          total,
          input.notes?.trim() || null,
        ]
      );
      for (const item of items) {
        const quantity = toNumber(item.quantity, 1);
        const unitPrice = toNumber(item.unitPrice);
        this.db.run(
          `INSERT INTO platform_invoice_items (id, invoice_id, description, quantity, unit_price, total)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            `pii_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
            id,
            item.description.trim(),
            quantity,
            unitPrice,
            quantity * unitPrice,
          ]
        );
      }
    });
    this.audit('إنشاء فاتورة مبيعات', 'INVOICE', id, { number, tenantId: input.tenantId, total });
    return this.getInvoice(id)!;
  }

  public setInvoiceStatus(id: string, status: PlatformInvoiceStatus): void {
    PlatformAdminService.owner();
    const invoice = this.getInvoice(id);
    if (!invoice) throw new Error('الفاتورة غير موجودة.');
    this.db.run('UPDATE platform_invoices SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
    this.audit('تغيير حالة فاتورة', 'INVOICE', id, { status, number: invoice.number });
  }

  public voidInvoice(id: string): void {
    PlatformAdminService.owner();
    const invoice = this.getInvoice(id);
    if (!invoice) throw new Error('الفاتورة غير موجودة.');
    this.db.run(`UPDATE platform_invoices SET status = 'VOID', updated_at = ? WHERE id = ?`, [nowIso(), id]);
    this.audit('إلغاء فاتورة', 'INVOICE', id, { number: invoice.number });
  }

  public listPayments(limit = 200): PlatformPayment[] {
    PlatformAdminService.owner();
    return this.db.query<any>(
      `SELECT p.*, t.name AS tenantName, i.number AS invoiceNumber
       FROM platform_payments p
       JOIN platform_tenants t ON t.id = p.tenant_id
       LEFT JOIN platform_invoices i ON i.id = p.invoice_id
       ORDER BY p.paid_at DESC, p.created_at DESC
       LIMIT ?`,
      [Math.max(1, Math.min(1000, limit))]
    ).map(mapPayment);
  }

  private recalculateInvoice(invoiceId: string): void {
    const invoice = this.getInvoice(invoiceId);
    if (!invoice) return;
    const paid = toNumber(this.db.query<any>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM platform_payments WHERE invoice_id = ?`,
      [invoiceId]
    )[0]?.total);
    let status = invoice.status;
    if (status !== 'VOID' && status !== 'DRAFT') {
      if (paid >= invoice.total) status = 'PAID';
      else if (paid > 0) status = 'PARTIAL';
      else if (invoice.dueDate && new Date(invoice.dueDate) < new Date()) status = 'OVERDUE';
      else status = 'SENT';
    }
    this.db.run(
      `UPDATE platform_invoices SET paid_amount = ?, status = ?, updated_at = ? WHERE id = ?`,
      [paid, status, nowIso(), invoiceId]
    );
  }

  public addPayment(input: PlatformPaymentInput): PlatformPayment {
    PlatformAdminService.owner();
    const tenant = this.getTenant(input.tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const amount = toNumber(input.amount);
    if (amount <= 0) throw new Error('قيمة الدفعة يجب أن تكون أكبر من صفر.');
    if (input.invoiceId) {
      const invoice = this.getInvoice(input.invoiceId);
      if (!invoice) throw new Error('الفاتورة غير موجودة.');
      if (invoice.tenantId !== input.tenantId) throw new Error('الفاتورة لا تخص هذا العميل.');
      if (invoice.status === 'VOID') throw new Error('لا يمكن تسجيل دفعة على فاتورة ملغاة.');
    }
    const id = `pay_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO platform_payments (id, invoice_id, tenant_id, amount, method, reference, paid_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.invoiceId || null,
          input.tenantId,
          amount,
          input.method || 'CASH',
          input.reference?.trim() || null,
          input.paidAt || nowIso(),
          input.notes?.trim() || null,
        ]
      );
      if (input.invoiceId) this.recalculateInvoice(input.invoiceId);
    });
    this.audit('تسجيل دفعة', 'PAYMENT', id, { tenantId: input.tenantId, amount, invoiceId: input.invoiceId || null });
    const saved = this.db.query<any>(
      `SELECT p.*, t.name AS tenantName, i.number AS invoiceNumber
       FROM platform_payments p
       JOIN platform_tenants t ON t.id = p.tenant_id
       LEFT JOIN platform_invoices i ON i.id = p.invoice_id
       WHERE p.id = ?`,
      [id]
    )[0];
    return saved
      ? mapPayment(saved)
      : { id, invoiceId: input.invoiceId || null, tenantId: input.tenantId, amount, method: input.method || 'CASH', paidAt: input.paidAt || nowIso() };
  }

  public voidPayment(id: string): void {
    PlatformAdminService.owner();
    const payment = this.db.query<any>('SELECT * FROM platform_payments WHERE id = ?', [id])[0];
    if (!payment) throw new Error('الدفعة غير موجودة.');
    this.db.executeTransaction(() => {
      this.db.run('DELETE FROM platform_payments WHERE id = ?', [id]);
      if (payment.invoiceId) this.recalculateInvoice(String(payment.invoiceId));
    });
    this.audit('إلغاء دفعة', 'PAYMENT', id, { amount: toNumber(payment.amount), invoiceId: payment.invoiceId });
  }

  // ─── Product control ───────────────────────────────────────────────────────

  public listModules(): PlatformModule[] {
    PlatformAdminService.owner();
    return this.listModulesForRuntime();
  }

  public listModulesForRuntime(): PlatformModule[] {
    return this.db.query<any>('SELECT * FROM platform_modules ORDER BY sort_order, name').map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ?? null,
      category: row.category ?? null,
      isEnabled: Boolean(row.isEnabled),
      minPlanCode: row.minPlanCode ?? null,
      sortOrder: toNumber(row.sortOrder),
    }));
  }

  public listFeatureFlags(): PlatformFeatureFlag[] {
    PlatformAdminService.owner();
    return this.listFeatureFlagsForRuntime();
  }

  public listFeatureFlagsForRuntime(): PlatformFeatureFlag[] {
    return this.db.query<any>('SELECT * FROM platform_feature_flags ORDER BY category, name').map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ?? null,
      category: row.category ?? null,
      isEnabled: Boolean(row.isEnabled),
      rolloutPercent: toNumber(row.rolloutPercent, 100),
    }));
  }

  public setModuleEnabled(id: string, enabled: boolean): void {
    PlatformAdminService.owner();
    this.db.run('UPDATE platform_modules SET is_enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, nowIso(), id]);
    this.audit(enabled ? 'تفعيل وحدة منتج' : 'تعطيل وحدة منتج', 'MODULE', id, { enabled });
  }

  public upsertFeatureFlag(input: { id?: string; code: string; name: string; description?: string; category?: string; isEnabled?: boolean; rolloutPercent?: number }): PlatformFeatureFlag {
    PlatformAdminService.owner();
    const code = String(input.code || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!code) throw new Error('رمز الميزة مطلوب.');
    if (!input.name?.trim()) throw new Error('اسم الميزة مطلوب.');
    const rollout = Math.max(0, Math.min(100, toNumber(input.rolloutPercent, 100)));
    if (input.id) {
      this.db.run(
        `UPDATE platform_feature_flags SET name = ?, description = ?, category = ?, is_enabled = ?, rollout_percent = ?, updated_at = ? WHERE id = ?`,
        [input.name.trim(), input.description?.trim() || null, input.category?.trim() || null, input.isEnabled === false ? 0 : 1, rollout, nowIso(), input.id]
      );
      this.audit('تعديل ميزة منتج', 'FEATURE', input.id, { code, rollout });
      return this.listFeatureFlags().find((flag) => flag.id === input.id)!;
    }
    if (this.db.query('SELECT 1 FROM platform_feature_flags WHERE code = ?', [code]).length) {
      throw new Error('رمز الميزة مستخدم بالفعل.');
    }
    const id = `pflag_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    this.db.run(
      `INSERT INTO platform_feature_flags (id, code, name, description, category, is_enabled, rollout_percent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, code, input.name.trim(), input.description?.trim() || null, input.category?.trim() || null, input.isEnabled === false ? 0 : 1, rollout]
    );
    this.audit('إنشاء ميزة منتج', 'FEATURE', id, { code, rollout });
    return this.listFeatureFlags().find((flag) => flag.id === id)!;
  }

  public setFeatureEnabled(id: string, enabled: boolean): void {
    PlatformAdminService.owner();
    this.db.run('UPDATE platform_feature_flags SET is_enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, nowIso(), id]);
    this.audit(enabled ? 'تفعيل ميزة منتج' : 'تعطيل ميزة منتج', 'FEATURE', id, { enabled });
  }

  public listReleases(): PlatformRelease[] {
    PlatformAdminService.owner();
    return this.db.query<any>('SELECT * FROM platform_releases ORDER BY created_at DESC').map((row) => ({
      id: String(row.id),
      version: String(row.version),
      channel: row.channel,
      status: row.status,
      isMandatory: Boolean(row.isMandatory),
      minVersion: row.minVersion ?? null,
      rolloutGroup: String(row.rolloutGroup || 'ALL'),
      notes: row.notes ?? null,
      releasedAt: row.releasedAt ?? null,
      createdAt: String(row.createdAt),
    }));
  }

  public listReleaseTargets(releaseId: string): PlatformReleaseTarget[] {
    PlatformAdminService.owner();
    return this.db.query<any>(
      `SELECT t.*, tn.name AS tenantName
       FROM platform_release_targets t
       JOIN platform_tenants tn ON tn.id = t.tenant_id
       WHERE t.release_id = ?
       ORDER BY tn.name`,
      [releaseId]
    ).map((row) => ({
      id: String(row.id),
      releaseId: String(row.releaseId),
      tenantId: String(row.tenantId),
      tenantName: row.tenantName ?? null,
      status: row.status,
      appliedAt: row.appliedAt ?? null,
      error: row.error ?? null,
      createdAt: String(row.createdAt),
    }));
  }

  public setReleaseTargets(releaseId: string, tenantIds: string[]): PlatformReleaseTarget[] {
    PlatformAdminService.owner();
    const release = this.listReleases().find((item) => item.id === releaseId);
    if (!release) throw new Error('الإصدار غير موجود.');
    this.db.executeTransaction(() => {
      this.db.run('DELETE FROM platform_release_targets WHERE release_id = ?', [releaseId]);
      for (const tenantId of tenantIds) {
        this.db.run(
          `INSERT INTO platform_release_targets (id, release_id, tenant_id, status)
           VALUES (?, ?, ?, 'PENDING')`,
          [`rtgt_${uuidv4().replace(/-/g, '').slice(0, 12)}`, releaseId, tenantId]
        );
      }
    });
    this.audit('تحديد عملاء لإصدار', 'RELEASE', releaseId, { tenantCount: tenantIds.length });
    return this.listReleaseTargets(releaseId);
  }

  public updateReleaseTargetStatus(id: string, status: PlatformReleaseTarget['status'], error?: string): PlatformReleaseTarget {
    PlatformAdminService.owner();
    const row = this.db.query<any>('SELECT release_id AS releaseId FROM platform_release_targets WHERE id = ?', [id])[0];
    if (!row) throw new Error('هدف الإصدار غير موجود.');
    this.db.run(
      `UPDATE platform_release_targets SET status = ?, applied_at = ?, error = ?, updated_at = ? WHERE id = ?`,
      [status, status === 'PENDING' ? null : nowIso(), error?.trim() || null, nowIso(), id]
    );
    this.audit('تحديث حالة تطبيق إصدار', 'RELEASE', String(row.releaseId), { targetId: id, status, error: error || null });
    return this.db.query<any>(
      `SELECT t.*, tn.name AS tenantName FROM platform_release_targets t JOIN platform_tenants tn ON tn.id = t.tenant_id WHERE t.id = ?`,
      [id]
    ).map((r) => ({
      id: String(r.id),
      releaseId: String(r.releaseId),
      tenantId: String(r.tenantId),
      tenantName: r.tenantName ?? null,
      status: r.status,
      appliedAt: r.appliedAt ?? null,
      error: r.error ?? null,
      createdAt: String(r.createdAt),
    }))[0];
  }

  public disableRelease(id: string): PlatformRelease {
    PlatformAdminService.owner();
    this.db.run(`UPDATE platform_releases SET status = 'DEPRECATED', updated_at = ? WHERE id = ?`, [nowIso(), id]);
    this.audit('إيقاف إصدار به مشكلة', 'RELEASE', id, { status: 'DEPRECATED' });
    return this.listReleases().find((release) => release.id === id)!;
  }public upsertRelease(input: { id?: string; version: string; channel?: PlatformRelease['channel']; status?: PlatformRelease['status']; isMandatory?: boolean; minVersion?: string; rolloutGroup?: string; notes?: string; releasedAt?: string }): PlatformRelease {
    PlatformAdminService.owner();
    const version = String(input.version || '').trim();
    if (!version) throw new Error('رقم الإصدار مطلوب.');
    if (input.id) {
      this.db.run(
        `UPDATE platform_releases SET version = ?, channel = ?, status = ?, is_mandatory = ?, min_version = ?, rollout_group = ?, notes = ?, released_at = ?, updated_at = ? WHERE id = ?`,
        [version, input.channel || 'STABLE', input.status || 'PUBLISHED', input.isMandatory ? 1 : 0, input.minVersion?.trim() || null, input.rolloutGroup || 'ALL', input.notes?.trim() || null, input.releasedAt || null, nowIso(), input.id]
      );
      this.audit('تعديل إصدار منتج', 'RELEASE', input.id, { version });
      return this.listReleases().find((release) => release.id === input.id)!;
    }
    if (this.db.query('SELECT 1 FROM platform_releases WHERE version = ?', [version]).length) {
      throw new Error('رقم الإصدار مسجل بالفعل.');
    }
    const id = `prel_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    this.db.run(
      `INSERT INTO platform_releases (id, version, channel, status, is_mandatory, min_version, rollout_group, notes, released_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, version, input.channel || 'STABLE', input.status || 'PUBLISHED', input.isMandatory ? 1 : 0, input.minVersion?.trim() || null, input.rolloutGroup || 'ALL', input.notes?.trim() || null, input.releasedAt || nowIso()]
    );
    this.audit('إنشاء إصدار منتج', 'RELEASE', id, { version, channel: input.channel || 'STABLE' });
    return this.listReleases().find((release) => release.id === id)!;
  }

  // ─── Audit & settings ──────────────────────────────────────────────────────

  public listAudit(limit = 200, search = ''): PlatformAuditEntry[] {
    PlatformAdminService.owner();
    const term = `%${search.trim()}%`;
    return this.db.query<any>(
      `SELECT * FROM platform_audit_logs
       WHERE (? = '' OR action LIKE ? OR entity_type LIKE ? OR COALESCE(actor_name,'') LIKE ?)
       ORDER BY created_at DESC LIMIT ?`,
      [search.trim(), term, term, term, Math.max(1, Math.min(1000, limit))]
    ).map((row) => ({
      id: String(row.id),
      actorId: row.actorId ?? null,
      actorName: row.actorName ?? null,
      action: String(row.action),
      entityType: String(row.entityType),
      entityId: row.entityId ?? null,
      details: row.details ?? null,
      createdAt: String(row.createdAt),
    }));
  }

  public getSettings(): PlatformSettingsMap {
    PlatformAdminService.owner();
    const values = this.db.query<{ key: string; value: string }>('SELECT key, value FROM platform_settings');
    const map = new Map(values.map((row) => [row.key, row.value]));
    return {
      platformName: map.get('platform_name') || 'سيراميسي',
      supportEmail: map.get('support_email') || '',
      supportPhone: map.get('support_phone') || '',
      defaultCurrency: map.get('default_currency') || 'EGP',
      defaultTrialDays: toNumber(map.get('default_trial_days'), 14),
      invoicePrefix: map.get('invoice_prefix') || 'CS-INV',
    };
  }

  public updateSettings(input: Partial<PlatformSettingsMap>): PlatformSettingsMap {
    PlatformAdminService.owner();
    const pairs: Array<[string, string]> = [
      ['platform_name', input.platformName ?? this.getSettings().platformName],
      ['support_email', input.supportEmail ?? this.getSettings().supportEmail],
      ['support_phone', input.supportPhone ?? this.getSettings().supportPhone],
      ['default_currency', input.defaultCurrency ?? this.getSettings().defaultCurrency],
      ['default_trial_days', String(input.defaultTrialDays ?? this.getSettings().defaultTrialDays)],
      ['invoice_prefix', input.invoicePrefix ?? this.getSettings().invoicePrefix],
    ];
    this.db.executeTransaction(() => {
      for (const [key, value] of pairs) {
        this.db.run(
          `INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [key, value.trim(), nowIso()]
        );
      }
    });
    this.audit('تحديث إعدادات المنصة', 'SETTINGS', null, input);
    return this.getSettings();
  }
}

export const platformAdminService = new PlatformAdminService();
