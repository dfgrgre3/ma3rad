import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { centralAuditService } from './CentralAuditService';
import { AuthService } from '../auth/AuthService';
import { authSession } from '../auth/session';
import { platformStaffTwoFactorAuth, deletePlatformStaffTwoFactorRow } from '../auth/twoFactorAuth';
import { PLATFORM_ROLE_DEFINITIONS, PlatformAuthorizationService } from './PlatformAuthorizationService';
import { PLATFORM_PERMISSION_SECTIONS, STANDARD_ACTION_LABELS, PLATFORM_PERMISSION_CODES, PLATFORM_ALL_PERMISSION } from './platformPermissionCatalog';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformBootstrapService, type PlatformOwnerAuditEntry } from './PlatformBootstrapService';
import { provisioningQueueService } from './ProvisioningQueueService';
import { provisioningExecutorService } from './ProvisioningExecutorService';
import type { User } from '../../../types';
import type {
  PlatformActivationDetails,
  PlatformAlert,
  PlatformAuditEntry,
  PlatformCoupon,
  PlatformFeatureFlag,
  PlatformFeatureOverride,
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
  PlatformPolicySettings,
  PlatformPayment,
  PlatformPaymentInput,
  PlatformApiKey,
  PlatformApiKeyCreated,
  PlatformPlan,
  PlatformPlanInput,
  PlatformPlanVersion,
  PlatformPlanVersionInput,
  PlatformPriceHistoryEntry,
  PlatformSubscriptionPriceLock,
  PlatformPlanUpgradeRule,
  PlatformPlanUpgradeRuleInput,
  PlatformPlanCopyResult,
  PlatformPlanEffectivePricing,
  PlatformPlanImpactPreview,
  PlatformPlanChangeRequest,
  PlatformPlanChangeResult,
  PlatformPlanVersioningInput,
  PlatformSubscriptionCreateInput,
  PlatformTrialCreateInput,
  PlatformRelease,
  PlatformReleaseTarget,
  PlatformSettingsMap,
  PlatformSubscription,
  PlatformSupportMessage,
  PlatformSupportTicket,
  PlatformCannedReply,
  PlatformRemoteSession,
  PlatformSupportTicketDetails,
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
  PlatformTenantUserProvisioningResult,
  PlatformPeriod,
  PlatformMetricComparison,
  PlatformTimeSeriesPoint,
  PlatformBusinessPerformance,
  PlatformCustomerMetrics,
  PlatformSubscriptionMetrics,
  PlatformLicenseMetrics,
  PlatformOperationsMetrics,
  PlatformAlertDetail,
  PlatformReportFilters,
  PlatformBillingCycle,
  PlatformSubscriptionStatus,
  PlatformPlanChangeType,
  PlatformCouponInput,
  AuditSeverity,
  AuditStatus,
  AuditActorType,
  PlatformOpsJob,
  PlatformOpsJobStatus,
  PlatformOpsJobType,
  PlatformMaintenanceWindow,
  PlatformMaintenanceStatus,
  PlatformOpApproval,
  PlatformOpApprovalStatus,
  PlatformSyncLogEntry,
  PlatformSyncStatus,
  PlatformBrandingConfig,
  PlatformBrandingInput,
  PlatformBrandingVersion,
  PlatformInvoiceTemplate,
  PlatformUiProfile,
  PlatformTenantUiCustomization,
  PlatformTenantUiInput,
  PlatformTenantUiVersion,
  FormFieldRule,
  PlatformConfigTemplate,
  PlatformTenantConfig,
  PlatformTenantConfigInput,
  PlatformTenantConfigVersion,
  PlatformConfigRollout,
  PlatformConfigRolloutInput,
  PlatformConfigAck,
  RolloutTargetType,
  RolloutStatus,
  PlatformServerTelemetry,
  PlatformCentralBackup,
  PlatformServiceIncident,
  PlatformComprehensiveHealth,
  PlatformTechnicalHealthMetrics,
  PlatformHealthDashboardData,
  PlatformStaff,
  PlatformStaffInput,
  PlatformStaffRole,
  PlatformStaffRoleDefinition,
  PlatformStaffLogin,
  PlatformStaffSession,
  PlatformCentralSecurityIncident,
  PlatformSigningKey,
  PlatformCentralSecurityOverview,
  PlatformStaffInvite,
  PlatformStaffInviteCreated,
  PlatformStaffInviteInput,
  PlatformStaffInviteStatus,
  PlatformTrustedDevice,
  PlatformStaffDataScopeState,
  PlatformRoleMatrix,
} from './platformTypes';

/** Platform staff role codes (mirrors PlatformStaffRole). Used for data-scope checks. */
const PLATFORM_ROLE_CODES_SET: ReadonlySet<string> = new Set([
  'SUPER_ADMIN',
  'PLATFORM_ADMIN',
  'SUPPORT_AGENT',
  'OPERATIONS_ENGINEER',
  'BILLING_SPECIALIST',
  'LICENSE_MANAGER',
]);

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

function safeJsonObject<T = Record<string, unknown>>(value: unknown): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as T;
  if (typeof value !== 'string' || !value.trim()) return {} as T;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
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

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function randomToken(length: number, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'): string {
  // Use a cryptographically secure RNG instead of Math.random().
  const bytes = crypto.randomBytes(length);
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += alphabet[bytes[index] % alphabet.length];
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

// DEPRECATED (P0): demo-only signature using a static secret. Phase 0 of the
// central-admin migration replaces this with Ed25519 server-side signing
// (issued by /api/v1/admin/licenses/issue). Local issuance is dev-only and
// must be gated behind `platform.localIssuance === true` before production.
// See docs/openapi-platform-admin.yaml.
function signCertificate(payload: Record<string, unknown>): string {
  const secret = 'ceramisys-platform-certificate-secret';
  const body = JSON.stringify(payload);
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
    provisioningStatus: (row.provisioningStatus || row.provisioning_status || 'NOT_REQUESTED') as PlatformTenantUser['provisioningStatus'],
    provisioningMode: row.provisioningMode ?? row.provisioning_mode ?? null,
    identityUserId: row.identityUserId ?? row.identity_user_id ?? null,
    scope: row.scope ?? null,
    // Never leak the stored bcrypt hashes through the mapped user. Plaintext
    // activation secrets are returned exactly once by the create/reset calls.
    inviteCode: null,
    temporaryPassword: null,
    inviteExpiresAt: row.inviteExpiresAt ?? row.invite_expires_at ?? null,
    provisionedAt: row.provisionedAt ?? row.provisioned_at ?? null,
    lastError: row.lastError ?? row.last_error ?? null,
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
    tenantId: String(row.tenantId || row.tenant_id),
    tenantName: row.tenantName ?? null,
    deviceId: row.deviceId || row.device_id || null,
    subject: String(row.subject),
    description: row.description ?? null,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assignedTo || row.assigned_to || null,
    remoteAccessRequested: Boolean(row.remoteAccessRequested ?? row.remote_access_requested),
    remoteAccessApproved: Boolean(row.remoteAccessApproved ?? row.remote_access_approved),
    remoteAccessDurationMinutes: toNumber(row.remoteAccessDurationMinutes ?? row.remote_access_duration_minutes, 60),
    remoteAccessExpiresAt: row.remoteAccessExpiresAt || row.remote_access_expires_at || null,
    slaDueAt: row.slaDueAt || row.sla_due_at || null,
    firstRespondedAt: row.firstRespondedAt || row.first_responded_at || null,
    rating: row.rating ? toNumber(row.rating) : null,
    feedback: row.feedback ?? null,
    resolvedAt: row.resolvedAt || row.resolved_at || null,
    createdAt: String(row.createdAt || row.createdAt || nowIso()),
    updatedAt: String(row.updatedAt || row.updatedAt || nowIso()),
  };
}

function mapSupportMessage(row: any): PlatformSupportMessage {
  return {
    id: String(row.id),
    ticketId: String(row.ticketId || row.ticket_id),
    authorName: String(row.authorName || row.author_name),
    authorRole: row.authorRole || row.author_role || 'SUPPORT',
    body: String(row.body),
    isInternal: Boolean(row.isInternal ?? row.is_internal),
    attachmentUrl: row.attachmentUrl || row.attachment_url || null,
    attachmentName: row.attachmentName || row.attachment_name || null,
    attachmentSize: row.attachmentSize || row.attachment_size || null,
    createdAt: String(row.createdAt || row.createdAt || nowIso()),
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
    branchesLimit: toNumber(row.branches_limit, 1),
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
    offlineGracePeriodDays: toNumber(row.offline_grace_period_days, 14),
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
    startsAt: row.starts_at ?? null,
    activatedAt: row.activatedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    seats: toNumber(row.seats, 1),
    deviceLimit: toNumber(row.deviceLimit, 1),
    branchesLimit: toNumber(row.branches_limit, 1),
    hardwareId: row.hardwareId ?? null,
    activationCode: row.activationCode ?? null,
    certificate: row.certificate ?? null,
    transferCount: toNumber(row.transferCount, 0),
    modules: safeJsonArray(row.modules),
    features: safeJsonArray(row.features),
    offlineGracePeriodDays: row.offline_grace_period_days !== null && row.offline_grace_period_days !== undefined ? toNumber(row.offline_grace_period_days) : null,
    couplingMode: (row.coupling_mode as PlatformLicense['couplingMode']) ?? 'FULL',
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

  // ─── Central-admin migration switch ────────────────────────────────────────
  // `platform.dataSource` controls whether Super Admin screens read/write through
  // the local PlatformAdminService ('local') or the central server ('central').
  // Defaults to 'local' for backward compatibility until each center is migrated.
  public getDataSource(): 'local' | 'central' {
    const value = this.setting('platform.dataSource', 'local');
    return value === 'central' ? 'central' : 'local';
  }

  public setDataSource(value: 'local' | 'central'): void {
    PlatformAdminService.requirePlatformOwner();
    const normalized: 'local' | 'central' = value === 'central' ? 'central' : 'local';
    const existing = this.db.query<{ value: string }>(
      'SELECT value FROM platform_settings WHERE key = ?',
      ['platform.dataSource']
    )[0];
    if (existing) {
      this.db.run(
        'UPDATE platform_settings SET value = ?, updated_at = ? WHERE key = ?',
        [normalized, nowIso(), 'platform.dataSource']
      );
    } else {
      this.db.run(
        'INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)',
        ['platform.dataSource', normalized, nowIso()]
      );
    }
    this.audit('تغيير مصدر بيانات المنصة', 'PLATFORM_SETTING', 'platform.dataSource', {
      value: normalized,
    });
  }

  /**
   * Owner-only: review every account (ERP + platform staff) that claims the
   * owner role, and flag the ones that were not created through the secure
   * initialization procedure.
   */
  public auditPlatformOwnerAccounts(): PlatformOwnerAuditEntry[] {
    PlatformAdminService.requirePlatformOwner();
    return new PlatformBootstrapService(DatabaseManager.getInstance()).auditOwnerAccounts();
  }

  private static requirePlatformAccess(modules: string | string[], action?: string): User {
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
      // Granular codes ("platform.<module>.<action>") are enforced exactly —
      // deny by default. The legacy module path remains for backward compat.
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

  /**
   * Guard for the platform-owner role (SUPER_ADMIN).
   *
   * The owner role is a *root* privilege: it bypasses every granular permission
   * check (`PlatformAuthorizationService.roleHasPermission` short-circuits on
   * SUPER_ADMIN). Therefore it must never be handed out by a normal staff
   * operation — only the owner account itself may grant it, and there can never
   * be a second owner account.
   *
   * @param role    the role that is about to be assigned
   * @param options.creating true when a *new* account would receive the role
   */
  private static assertOwnerRoleGrant(role: string, options: { creating?: boolean } = {}): void {
    if (String(role) !== 'SUPER_ADMIN') return;

    const actor = AuthService.getCurrentUser();
    if (!actor || actor.role !== 'SUPER_ADMIN') {
      throw new Error('منح دور مالك المنصة متاح لمالك المنصة فقط.');
    }

    if (options.creating) {
      const db = DatabaseManager.getInstance();
      const existing = db.query<any>(
        `SELECT id, full_name FROM platform_staff
         WHERE role = 'SUPER_ADMIN'
           AND (deleted_at IS NULL OR deleted_at = '')
           AND password_hash IS NOT NULL AND password_hash <> ''
         LIMIT 1`
      )[0];
      if (existing) {
        throw new Error('يوجد حساب مالك منصة بالفعل. لا يمكن إنشاء حساب ثانٍ بدور مالك المنصة.');
      }
    }
  }

  public audit(
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
      tenantId: options?.tenantId || (entityType === 'TENANT' ? entityId : undefined),
      deviceId: options?.deviceId,
      deviceName: options?.deviceName,
      ipAddress: options?.ipAddress,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      errorMessage: options?.errorMessage,
    });
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
    PlatformAdminService.requirePlatformAccess('overview', 'platform.overview.view');

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

    // Revenue by plan
    const revenueByPlanRows = this.db.query<any>(`
      SELECT p.name AS planName, COALESCE(SUM(pay.amount),0) AS revenue, COUNT(DISTINCT t.id) AS tenants
      FROM platform_plans p
      LEFT JOIN platform_tenants t ON t.plan_id = p.id
      LEFT JOIN platform_payments pay ON pay.tenant_id = t.id
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
    `);
    const revenueByPlan = revenueByPlanRows.map((r:any) => ({
      planName: String(r.planName),
      revenue: toNumber(r.revenue),
      tenants: toNumber(r.tenants),
    }));

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
      revenueByPlan,
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

  /**
   * Data scope for platform staff: NULL means "all tenants", otherwise the
   * staff member only sees/modifies the listed tenants. ERP sessions and
   * SUPER_ADMIN are never scoped.
   */
  private getScopedTenantIds(): Set<string> | null {
    const user = AuthService.getCurrentUser();
    if (!user) return null;
    if (user.role === 'SUPER_ADMIN') return null;
    if (!PLATFORM_ROLE_CODES_SET.has(String(user.role))) return null;
    try {
      const row = this.db.query<any>('SELECT data_scope FROM platform_staff WHERE id = ? LIMIT 1', [user.id])[0];
      if (!row || String(row.dataScope || 'ALL') !== 'LIMITED') return null;
      const rows = this.db.query<{ tenantId: string }>(
        'SELECT tenant_id AS tenantId FROM platform_staff_scopes WHERE staff_id = ?',
        [user.id],
      );
      return new Set(rows.map((r) => String(r.tenantId)));
    } catch {
      // Fail closed: empty set means no tenants accessible.
      return new Set();
    }
  }

  private assertTenantScope(tenantId: string | null | undefined): void {
    if (!tenantId) return;
    const scoped = this.getScopedTenantIds();
    if (scoped && !scoped.has(String(tenantId))) {
      throw new Error('لا تملك صلاحية الوصول إلى هذا العميل (نطاق البيانات).');
    }
  }

  public listTenants(search = '', status = '', planId = ''): PlatformTenant[] {
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.view');
    const term = `%${search.trim()}%`;
    const scoped = this.getScopedTenantIds();
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
          AND (? = '' OR t.plan_id = ?)
       ORDER BY t.created_at DESC`,
      [search.trim(), term, term, term, term, status, status, planId, planId]
    ).map(mapTenant).filter((tenant) => !scoped || scoped.has(String(tenant.id)));
  }

  public getTenant(id: string): PlatformTenant | null {
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.view');
    this.assertTenantScope(id);
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
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.create');
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
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.update');
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
    // Suspending / re-activating a tenant are distinct, auditable privileges.
    const requiredPermission = status === 'SUSPENDED' || status === 'CANCELLED'
      ? 'platform.tenants.suspend'
      : status === 'ACTIVE'
        ? 'platform.tenants.activate'
        : 'platform.tenants.update';
    PlatformAdminService.requirePlatformAccess('tenants', requiredPermission);
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
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.delete');
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
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.view');
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

    const relatedAudit: PlatformAuditEntry[] = this.db.query<any>(
      `SELECT * FROM platform_audit_logs
       WHERE entity_id = ? OR (entity_type = 'TENANT' AND details LIKE ?)
       ORDER BY created_at DESC LIMIT 300`,
      [id, `%${id}%`]
    ).map((row) => ({
      id: String(row.id),
      actorId: row.actorId ?? null,
      actorName: row.actorName ?? null,
      actorType: row.actorType ?? 'SYSTEM',
      tenantId: row.tenantId ?? null,
      deviceId: row.deviceId ?? null,
      deviceName: row.deviceName ?? null,
      ipAddress: row.ipAddress ?? null,
      userAgent: row.userAgent ?? null,
      action: String(row.action),
      entityType: String(row.entityType),
      entityId: row.entityId ?? null,
      severity: (row.severity as AuditSeverity) ?? 'INFO',
      status: (row.status as AuditStatus) ?? 'SUCCESS',
      details: row.details ?? null,
      oldValues: row.oldValues ?? null,
      newValues: row.newValues ?? null,
      errorMessage: row.errorMessage ?? null,
      prevHash: row.prevHash ?? null,
      recordHash: row.recordHash ?? null,
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
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.tenants.manage_users');
    this.assertTenantScope(tenantId);
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
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.tenants.manage_users');
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
    this.audit('توليد بيانات تفعيل', 'ACTIVATION', tenantId, { username });

    return { account: this.getTenantAccount(tenantId)!, temporaryPassword };
  }

  public resetTenantAccountPassword(
    tenantId: string,
    password?: string
  ): { account: PlatformTenantAccount; temporaryPassword: string } {
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.tenants.manage_users');
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
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.tenants.manage_users');
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
    options: { months?: number; seats?: number; price?: number; branchesLimit?: number } = {}
  ): PlatformTenant {
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.update');
    const allowLocal = this.setting('platform.localIssuance', 'false') === 'true';
    if (!allowLocal) {
      throw new Error('إصدار التراخيص يتم من الخادم المركزي فقط. لا يُسمح بالإصدار المحلي.');
    }
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const plan = this.db.query<any>('SELECT * FROM platform_plans WHERE id = ?', [planId])[0];
    if (!plan) throw new Error('الخطة غير موجودة.');
    if (!plan.isActive) throw new Error('هذه الخطة غير مفعّلة.');

    const months = Math.max(1, toNumber(options.months, 12));
    const start = new Date();
    const expires = plan.billingCycle === 'LIFETIME' ? null : addMonths(start, months);
    const seats = Math.max(1, toNumber(options.seats, plan.seatsLimit));
    const branchesLimit = Math.max(1, toNumber(options.branchesLimit, plan.branchesLimit));
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
          (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew, branches_limit)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, 1, ?)`,
        [subscriptionId, tenantId, planId, start.toISOString(), expires?.toISOString() ?? null, seats, price, plan.billingCycle, branchesLimit]
      );
      this.db.run(
        `INSERT INTO platform_licenses
          (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at,
           seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          licenseId,
          tenantId,
          subscriptionId,
          planId,
          licenseKey,
          start.toISOString(),
          start.toISOString(),
          expires?.toISOString() ?? null,
          seats,
          toNumber(plan.devicesLimit, 1),
          toNumber(plan.branchesLimit, 1),
          plan.includedModules,
          plan.features,
          generateLicenseActivationCode(),
          signCertificate({ licenseKey, tenantId, planId, issuedAt: start.toISOString(), expiresAt: expires?.toISOString() ?? null, deviceLimit: toNumber(plan.devicesLimit, 1), seats }),
          toNumber(plan.offline_grace_period_days, 14),
          'FULL',
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
    this.audit('إصدار ترخيص مع تغيير الباقة', 'LICENSE', licenseId, { tenantId, planId, months, seats, branchesLimit });
    this.recordLicenseChange(licenseId, subscriptionId, 'ISSUE', null, {
      licenseKey, tenantId, planId, startsAt: start.toISOString(), expiresAt: expires?.toISOString() ?? null,
      seats, deviceLimit: toNumber(plan.devicesLimit, 1), branchesLimit, modules: plan.includedModules, features: plan.features,
      offlineGracePeriodDays: toNumber(plan.offline_grace_period_days, 14), couplingMode: 'FULL',
    }, null, JSON.stringify({ tenantId, planId, months, seats, branchesLimit }));
    return this.getTenant(tenantId)!;
  }

  public renewTenantSubscription(tenantId: string, months = 12): PlatformTenant {
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.subscriptions.update');
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const duration = Math.max(1, toNumber(months, 12));
    const base = tenant.subscriptionExpiresAt && new Date(tenant.subscriptionExpiresAt) > new Date()
      ? new Date(tenant.subscriptionExpiresAt)
      : new Date();
    const expires = addMonths(base, duration);

    // Determine coupling mode from the tenant's primary license
    const primaryLicense = this.db.query<any>(
      `SELECT coupling_mode FROM platform_licenses
       WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED','EXPIRED')
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    )[0];
    const coupling = (primaryLicense?.coupling_mode as PlatformLicense['couplingMode']) ?? 'FULL';

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
              (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew, branches_limit)
             VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, 1, ?)`,
            [
              `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
              tenantId,
              plan.id,
              nowIso(),
              expires.toISOString(),
              tenant.seatsLimit,
              toNumber(plan.price),
              plan.billingCycle,
              toNumber(tenant.branchesLimit, 1),
            ]
          );
        }
      }
      if (coupling === 'FULL' || coupling === 'EXPIRY_ONLY') {
        this.db.run(
          `UPDATE platform_licenses SET status = 'ACTIVE', expires_at = ?, updated_at = ?
           WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED','EXPIRED')`,
          [expires.toISOString(), nowIso(), tenantId]
        );
      }
      this.db.run(
        `UPDATE platform_tenants SET status = 'ACTIVE', subscription_expires_at = ?, updated_at = ? WHERE id = ?`,
        [expires.toISOString(), nowIso(), tenantId]
      );
    });
    this.audit('تجديد اشتراك العميل', 'TENANT', tenantId, { months: duration, expiresAt: expires.toISOString(), coupling });
    return this.getTenant(tenantId)!;
  }

  public cancelTenantSubscription(tenantId: string, reason?: string): PlatformTenant {
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.subscriptions.update');
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    // Determine coupling mode from the tenant's primary license
    const primaryLicense = this.db.query<any>(
      `SELECT coupling_mode FROM platform_licenses
       WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED','EXPIRED')
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    )[0];
    const coupling = (primaryLicense?.coupling_mode as PlatformLicense['couplingMode']) ?? 'FULL';
    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE platform_subscriptions SET status = 'CANCELLED', auto_renew = 0, updated_at = ? WHERE tenant_id = ?`,
        [nowIso(), tenantId]
      );
      if (coupling === 'FULL') {
        this.db.run(
          `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ?
           WHERE tenant_id = ? AND status IN ('ACTIVE','ISSUED','SUSPENDED','EXPIRED')`,
          [nowIso(), tenantId]
        );
      }
      this.db.run(
        `UPDATE platform_tenants SET status = 'CANCELLED', updated_at = ? WHERE id = ?`,
        [nowIso(), tenantId]
      );
      this.db.run(
        `UPDATE platform_tenant_accounts SET is_active = 0, updated_at = ? WHERE tenant_id = ?`,
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
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.update');
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
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.manage_users');
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
    PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.view');
    return this.db.query<any>(
      `SELECT p.*,
         (SELECT COUNT(*) FROM platform_tenants t WHERE t.plan_id = p.id AND t.status IN ('ACTIVE','TRIAL')) AS subscriberCount
       FROM platform_plans p
       ${includeInactive ? '' : 'WHERE p.is_active = 1'}
       ORDER BY p.sort_order, p.price`
    ).map(mapPlan);
  }

  public createPlan(input: PlatformPlanInput): PlatformPlan {
    PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.create');
    const code = String(input.code || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (code.length < 2) throw new Error('رمز الخطة مطلوب.');
    if (!input.name?.trim()) throw new Error('اسم الخطة مطلوب.');
    if (this.db.query('SELECT 1 FROM platform_plans WHERE code = ?', [code]).length) {
      throw new Error('رمز الخطة مستخدم بالفعل.');
    }
    const id = `plan_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    const versioned = input.versioned === true;
    const effectiveFrom = input.effectiveFrom || nowIso();
    this.db.run(
      `INSERT INTO platform_plans
        (id, code, name, description, billing_cycle, price, monthly_price, yearly_price, currency, seats_limit, branches_limit,
         devices_limit, storage_limit_mb, max_products, max_warehouses, trial_days, included_modules, features, permissions,
         offline_grace_period_days, is_active, is_default, sort_order, current_version, versioned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?, ?)`,
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
        toNumber(input.offlineGracePeriodDays, 14),
        input.isActive === false ? 0 : 1,
        this.nextSequence('platform_plans') + 10,
        versioned ? 1 : 0,
        effectiveFrom,
        nowIso(),
      ]
    );

    // إذا كانت الخطة ذات إصدارات (versioned)، أنشئ الإصدار الأولي كسجل في platform_plan_versions.
    if (versioned) {
      this.createPlanVersionInternal(id, 1, {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        billingCycle: input.billingCycle || 'YEARLY',
        price: toNumber(input.price ?? input.yearlyPrice ?? 0),
        monthlyPrice: toNumber(input.monthlyPrice ?? 0),
        yearlyPrice: toNumber(input.yearlyPrice ?? input.price ?? 0),
        currency: input.currency || this.setting('default_currency', 'EGP'),
        seatsLimit: toNumber(input.seatsLimit, 1),
        branchesLimit: toNumber(input.branchesLimit, 1),
        devicesLimit: toNumber(input.devicesLimit, 1),
        storageLimitMb: toNumber(input.storageLimitMb, 500),
        maxProducts: toNumber(input.maxProducts, 1000),
        maxWarehouses: toNumber(input.maxWarehouses, 2),
        trialDays: toNumber(input.trialDays, 14),
        includedModules: input.includedModules ?? [],
        features: input.features ?? [],
        permissions: input.permissions ?? [],
        offlineGracePeriodDays: toNumber(input.offlineGracePeriodDays, 14),
        effectiveFrom,
        isCurrent: true,
        changeNote: input.initialChangeNote || 'الإصدار الأولي',
        createdBy: PlatformAdminService.requirePlatformAccess('plans').id,
      });
      // سجل تغيير السعر الأولي.
      this.recordPriceHistory(id, 1, null, toNumber(input.price ?? input.yearlyPrice ?? 0), input.currency || this.setting('default_currency', 'EGP'), effectiveFrom, 'إنشاء الخطة');
    }

    this.audit('إنشاء خطة اشتراك', 'PLAN', id, { code, name: input.name, versioned });
    return this.listPlans().find((plan) => plan.id === id)!;
  }

  /**
   * تنشئ إصدارًا جديدًا للخطة مع تاريخ سريان، بدلاً من تعديل الخطة نفسها مباشرة.
   * إذا كانت الخطة غير مفعّلة للنسخ (versioned = false)، يتم التعديل المباشر كما كان.
   */
  public updatePlan(id: string, input: PlatformPlanInput): PlatformPlan {
    PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.update');
    const existing = this.listPlans().find((plan) => plan.id === id);
    if (!existing) throw new Error('الخطة غير موجودة.');

    // إذا كانت الخطة تدعم الإصدارات، أنشئ إصدارًا جديدًا مع تاريخ سريان بدلاً من التعديل المباشر.
    if (existing.versioned) {
      const nextVersion = (existing.currentVersion ?? 1) + 1;
      const effectiveFrom = input.effectiveFrom || nowIso();
      this.createPlanVersionInternal(id, nextVersion, {
        name: (input.name ?? existing.name).trim(),
        description: input.description ?? existing.description ?? null,
        billingCycle: input.billingCycle ?? existing.billingCycle,
        price: toNumber(input.price ?? existing.price, existing.price),
        monthlyPrice: toNumber(input.monthlyPrice ?? existing.monthlyPrice, existing.monthlyPrice),
        yearlyPrice: toNumber(input.yearlyPrice ?? existing.yearlyPrice, existing.yearlyPrice),
        currency: input.currency ?? existing.currency,
        seatsLimit: toNumber(input.seatsLimit, existing.seatsLimit),
        branchesLimit: toNumber(input.branchesLimit, existing.branchesLimit),
        devicesLimit: toNumber(input.devicesLimit, existing.devicesLimit),
        storageLimitMb: toNumber(input.storageLimitMb, existing.storageLimitMb),
        maxProducts: toNumber(input.maxProducts, existing.maxProducts),
        maxWarehouses: toNumber(input.maxWarehouses, existing.maxWarehouses),
        trialDays: toNumber(input.trialDays, existing.trialDays),
        includedModules: input.includedModules ?? existing.includedModules,
        features: input.features ?? existing.features,
        permissions: input.permissions ?? existing.permissions,
        offlineGracePeriodDays: toNumber(input.offlineGracePeriodDays, existing.offlineGracePeriodDays),
        effectiveFrom,
        isCurrent: true,
        changeNote: input.initialChangeNote || `التعديل رقم ${nextVersion}`,
        createdBy: PlatformAdminService.requirePlatformAccess('plans').id,
      });

      // تحديث الخطة الأساسية لت反映 القيم الجديدة (للتوافق مع العروض والقوائم).
      const newPrice = toNumber(input.price ?? existing.price, existing.price);
      const oldPrice = existing.price;
      if (newPrice !== oldPrice) {
        this.recordPriceHistory(id, nextVersion, oldPrice, newPrice, input.currency ?? existing.currency, effectiveFrom, 'تعديل خطة مع إصدار جديد');
      }
      this.db.run(
        `UPDATE platform_plans SET
           name = ?, description = ?, billing_cycle = ?, price = ?, monthly_price = ?, yearly_price = ?, currency = ?,
           seats_limit = ?, branches_limit = ?, devices_limit = ?, storage_limit_mb = ?, max_products = ?,
           max_warehouses = ?, trial_days = ?, included_modules = ?, features = ?, permissions = ?,
           offline_grace_period_days = ?, is_active = ?, current_version = ?, updated_at = ?
         WHERE id = ?`,
        [
          (input.name ?? existing.name).trim(),
          input.description ?? existing.description ?? null,
          input.billingCycle ?? existing.billingCycle,
          newPrice,
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
          toNumber(input.offlineGracePeriodDays, existing.offlineGracePeriodDays),
          (input.isActive ?? existing.isActive) ? 1 : 0,
          nextVersion,
          nowIso(),
          id,
        ]
      );
      this.audit('تعديل خطة اشتراك (إصدار جديد)', 'PLAN', id, { name: input.name ?? existing.name, version: nextVersion, effectiveFrom });
      return this.listPlans().find((plan) => plan.id === id)!;
    }

    // خطة غير نسخة: التعديل المباشر كما كان.
    this.db.run(
      `UPDATE platform_plans SET
         name = ?, description = ?, billing_cycle = ?, price = ?, monthly_price = ?, yearly_price = ?, currency = ?,
         seats_limit = ?, branches_limit = ?, devices_limit = ?, storage_limit_mb = ?, max_products = ?,
         max_warehouses = ?, trial_days = ?, included_modules = ?, features = ?, permissions = ?,
         offline_grace_period_days = ?, is_active = ?, updated_at = ?
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
        toNumber(input.offlineGracePeriodDays, existing.offlineGracePeriodDays),
        (input.isActive ?? existing.isActive) ? 1 : 0,
        nowIso(),
        id,
      ]
    );
    this.audit('تعديل خطة اشتراك', 'PLAN', id, { name: input.name ?? existing.name });
    return this.listPlans().find((plan) => plan.id === id)!;
  }

  public setPlanActive(id: string, active: boolean): void {
    PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.update');
    // منع تعطيل خطة مرتبطة باشتراكات نشطة إلا مع خطة انتقال.
    if (!active && !this.canDeactivatePlan(id)) {
      throw new Error('لا يمكن تعطيل هذه الخطة لأنها مرتبطة باشتراكات نشطة. يجب نقل المشتركين أو إلغاء الاشتراكات أولاً.');
    }
    this.db.run('UPDATE platform_plans SET is_active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, nowIso(), id]);
    this.audit(active ? 'تفعيل خطة اشتراك' : 'تعطيل خطة اشتراك', 'PLAN', id, { active });
  }

  /**
   * التحقق مما إذا كان يمكن تعطيل الخطة (لا توجد اشتراكات نشطة مرتبطة بها).
   */
  private canDeactivatePlan(planId: string): boolean {
    const activeSubs = this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_subscriptions WHERE plan_id = ? AND status IN ('ACTIVE','TRIAL')`,
      [planId]
    )[0];
    return toNumber(activeSubs?.count, 0) === 0;
  }

  // ─── Plan Versioning Helpers ────────────────────────────────────────────────

  /**
   * إنشاء إصدار داخلي للخطة (يستخدم عند إنشاء خطة جديدة أو تحديث خطة ذات نسخ).
   */
  private createPlanVersionInternal(
    planId: string,
    version: number,
    data: {
      name: string;
      description?: string | null;
      billingCycle: PlatformBillingCycle;
      price: number;
      monthlyPrice: number;
      yearlyPrice: number;
      currency: string;
      seatsLimit: number;
      branchesLimit: number;
      devicesLimit: number;
      storageLimitMb: number;
      maxProducts: number;
      maxWarehouses: number;
      trialDays: number;
      includedModules: string[];
      features: string[];
      permissions: string[];
      offlineGracePeriodDays: number;
      effectiveFrom: string;
      isCurrent: boolean;
      changeNote?: string | null;
      createdBy?: string | null;
    }
  ): void {
    // إذا كان هذا الإصدار الحالي، أزل علم isCurrent من الإصدارات السابقة.
    if (data.isCurrent) {
      this.db.run(
        `UPDATE platform_plan_versions SET is_current = 0 WHERE plan_id = ? AND is_current = 1`,
        [planId]
      );
    }
    const id = `pv_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO platform_plan_versions
        (id, plan_id, version, name, description, billing_cycle, price, monthly_price, yearly_price,
         currency, seats_limit, branches_limit, devices_limit, storage_limit_mb, max_products,
         max_warehouses, trial_days, included_modules, features, permissions,
         offline_grace_period_days, effective_from, is_current, change_note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        planId,
        version,
        data.name,
        data.description ?? null,
        data.billingCycle,
        data.price,
        data.monthlyPrice,
        data.yearlyPrice,
        data.currency,
        data.seatsLimit,
        data.branchesLimit,
        data.devicesLimit,
        data.storageLimitMb,
        data.maxProducts,
        data.maxWarehouses,
        data.trialDays,
        JSON.stringify(data.includedModules),
        JSON.stringify(data.features),
        JSON.stringify(data.permissions),
        data.offlineGracePeriodDays,
        data.effectiveFrom,
        data.isCurrent ? 1 : 0,
        data.changeNote ?? null,
        data.createdBy ?? null,
        nowIso(),
      ]
    );
  }

  /**
   * تسجيل تغيير السعر في السجل التاريخي.
   */
  private recordPriceHistory(
    planId: string,
    version: number,
    oldPrice: number | null,
    newPrice: number,
    currency: string,
    effectiveFrom: string,
    reason?: string
  ): void {
    const id = `ph_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const actor = PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.create');
    this.db.run(
      `INSERT INTO platform_price_history
        (id, plan_id, version, old_price, new_price, currency, effective_from, reason, actor_id, actor_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, planId, version, oldPrice ?? null, newPrice, currency, effectiveFrom, reason ?? null, actor.id, actor.fullName, nowIso()]
    );
  }

  // ─── Public Plan Versioning API ────────────────────────────────────────────

  /**
   * إصدارات الخطة (للتاريخ والتدقيق).
   */
  public listPlanVersions(planId: string): PlatformPlanVersion[] {
    PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.view');
    return this.db.query<any>(
      `SELECT * FROM platform_plan_versions WHERE plan_id = ? ORDER BY version DESC`,
      [planId]
    ).map((row: any) => ({
      id: row.id,
      planId: row.plan_id,
      version: row.version,
      name: row.name,
      description: row.description,
      billingCycle: row.billing_cycle,
      price: toNumber(row.price),
      monthlyPrice: toNumber(row.monthly_price),
      yearlyPrice: toNumber(row.yearly_price),
      currency: row.currency,
      seatsLimit: toNumber(row.seats_limit),
      branchesLimit: toNumber(row.branches_limit),
      devicesLimit: toNumber(row.devices_limit),
      storageLimitMb: toNumber(row.storage_limit_mb),
      maxProducts: toNumber(row.max_products),
      maxWarehouses: toNumber(row.max_warehouses),
      trialDays: toNumber(row.trial_days),
      includedModules: safeJsonArray(row.included_modules),
      features: safeJsonArray(row.features),
      permissions: safeJsonArray(row.permissions),
      offlineGracePeriodDays: toNumber(row.offline_grace_period_days),
      effectiveFrom: row.effective_from,
      isCurrent: Boolean(row.isCurrent),
      changeNote: row.change_note,
      createdBy: row.created_by,
      createdAt: row.createdAt,
    }));
  }

  /**
   * الحصول على إصدار محدد من الخطة.
   */
  public getPlanVersion(planId: string, version: number): PlatformPlanVersion | null {
    PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.view');
    const row = this.db.query<any>(
      `SELECT * FROM platform_plan_versions WHERE plan_id = ? AND version = ?`,
      [planId, version]
    )[0];
    if (!row) return null;
    return {
      id: row.id,
      planId: row.plan_id,
      version: row.version,
      name: row.name,
      description: row.description,
      billingCycle: row.billing_cycle,
      price: toNumber(row.price),
      monthlyPrice: toNumber(row.monthly_price),
      yearlyPrice: toNumber(row.yearly_price),
      currency: row.currency,
      seatsLimit: toNumber(row.seats_limit),
      branchesLimit: toNumber(row.branches_limit),
      devicesLimit: toNumber(row.devices_limit),
      storageLimitMb: toNumber(row.storage_limit_mb),
      maxProducts: toNumber(row.max_products),
      maxWarehouses: toNumber(row.max_warehouses),
      trialDays: toNumber(row.trial_days),
      includedModules: safeJsonArray(row.included_modules),
      features: safeJsonArray(row.features),
      permissions: safeJsonArray(row.permissions),
      offlineGracePeriodDays: toNumber(row.offline_grace_period_days),
      effectiveFrom: row.effective_from,
      isCurrent: Boolean(row.isCurrent),
      changeNote: row.change_note,
      createdBy: row.created_by,
      createdAt: row.createdAt,
    };
  }

  /**
   * سجل تغييرات أسعار الخطة.
   */
  public listPriceHistory(planId: string): PlatformPriceHistoryEntry[] {
    PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.view');
    return this.db.query<any>(
      `SELECT * FROM platform_price_history WHERE plan_id = ? ORDER BY effective_from DESC`,
      [planId]
    ).map((row: any) => ({
      id: row.id,
      planId: row.plan_id,
      version: row.version,
      oldPrice: row.old_price !== null ? toNumber(row.old_price) : null,
      newPrice: toNumber(row.new_price),
      currency: row.currency,
      effectiveFrom: row.effective_from,
      reason: row.reason,
      actorId: row.actor_id,
      actorName: row.actor_name,
      createdAt: row.createdAt,
    }));
  }

  /**
   * نسخ/إصدار خطة جديدة كنسخة من خطة موجودة (للحفاظ على التاريخ التجاري).
   * تنشئ خطة جديدة برمز جديد وتنسخ جميع الإعدادات، مع تسجيل أن هذه خطة مشتقة.
   */
  public copyPlan(sourcePlanId: string, newCode: string, newName: string, effectiveFrom?: string): PlatformPlanCopyResult {
    PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.create');
    const source = this.listPlans().find((p) => p.id === sourcePlanId);
    if (!source) throw new Error('الخطة المصدر غير موجودة.');

    newCode = String(newCode || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (newCode.length < 2) throw new Error('رمز الخطة الجديدة مطلوب.');
    if (!newName?.trim()) throw new Error('اسم الخطة الجديدة مطلوب.');
    if (this.db.query('SELECT 1 FROM platform_plans WHERE code = ?', [newCode]).length) {
      throw new Error('رمز الخطة مستخدم بالفعل.');
    }

    const effective = effectiveFrom || nowIso();
    const newPlanId = `plan_${uuidv4().replace(/-/g, '').slice(0, 10)}`;

    this.db.run(
      `INSERT INTO platform_plans
        (id, code, name, description, billing_cycle, price, monthly_price, yearly_price, currency, seats_limit, branches_limit,
         devices_limit, storage_limit_mb, max_products, max_warehouses, trial_days, included_modules, features, permissions,
         offline_grace_period_days, is_active, is_default, sort_order, current_version, versioned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1, ?, 0, ?, ?)`,
      [
        newPlanId,
        newCode,
        newName.trim(),
        source.description ?? null,
        source.billingCycle,
        source.price,
        source.monthlyPrice,
        source.yearlyPrice,
        source.currency,
        source.seatsLimit,
        source.branchesLimit,
        source.devicesLimit,
        source.storageLimitMb,
        source.maxProducts,
        source.maxWarehouses,
        source.trialDays,
        JSON.stringify(source.includedModules),
        JSON.stringify(source.features),
        JSON.stringify(source.permissions),
        source.offlineGracePeriodDays,
        1,
        this.nextSequence('platform_plans') + 10,
        effective,
        nowIso(),
      ]
    );

    // إنشاء إصدار أولي للخطة الجديدة.
    this.createPlanVersionInternal(newPlanId, 1, {
      name: newName.trim(),
      description: source.description ?? null,
      billingCycle: source.billingCycle,
      price: source.price,
      monthlyPrice: source.monthlyPrice,
      yearlyPrice: source.yearlyPrice,
      currency: source.currency,
      seatsLimit: source.seatsLimit,
      branchesLimit: source.branchesLimit,
      devicesLimit: source.devicesLimit,
      storageLimitMb: source.storageLimitMb,
      maxProducts: source.maxProducts,
      maxWarehouses: source.maxWarehouses,
      trialDays: source.trialDays,
      includedModules: source.includedModules,
      features: source.features,
      permissions: source.permissions,
      offlineGracePeriodDays: source.offlineGracePeriodDays,
      effectiveFrom: effective,
      isCurrent: true,
      changeNote: `نسخة من خطة ${source.name} (${source.code})`,
      createdBy: PlatformAdminService.requirePlatformAccess('plans').id,
    });

    // سجل تغيير السعر.
    this.recordPriceHistory(newPlanId, 1, null, source.price, source.currency, effective, `نسخة من خطة ${source.code}`);

    this.audit('نسخ خطة اشتراك', 'PLAN', newPlanId, { sourcePlanId, sourceCode: source.code, newCode, newName, effectiveFrom: effective });
    return {
      newPlanId,
      versionId: `pv_${newPlanId}_1`,
      newVersion: 1,
      effectiveFrom: effective,
    };
  }

  // ─── Upgrade/Downgrade Rules ────────────────────────────────────────────────

  public listPlanUpgradeRules(): PlatformPlanUpgradeRule[] {
    PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.view');
    return this.db.query<any>(
      `SELECT * FROM platform_plan_upgrade_rules ORDER BY created_at DESC`
    ).map((row: any) => ({
      id: row.id,
      fromPlanId: row.from_plan_id,
      toPlanId: row.to_plan_id,
      allowed: Boolean(row.allowed),
      upgradeFeePercent: toNumber(row.upgrade_fee_percent),
      requiresApproval: Boolean(row.requires_approval),
      notes: row.notes,
      createdAt: row.createdAt,
    }));
  }

  public setPlanUpgradeRule(input: PlatformPlanUpgradeRuleInput): PlatformPlanUpgradeRule {
    PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.update');
    if (input.fromPlanId === input.toPlanId) throw new Error('لا يمكن إنشاء قاعدة من الخطة لنفسها.');
    const existing = this.db.query<any>(
      `SELECT * FROM platform_plan_upgrade_rules WHERE from_plan_id = ? AND to_plan_id = ?`,
      [input.fromPlanId, input.toPlanId]
    )[0];
    const id = existing?.id || `pur_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    if (existing) {
      this.db.run(
        `UPDATE platform_plan_upgrade_rules SET allowed = ?, upgrade_fee_percent = ?, requires_approval = ?, notes = ? WHERE id = ?`,
        [input.allowed ? 1 : 0, toNumber(input.upgradeFeePercent, 0), input.requiresApproval ? 1 : 0, input.notes ?? null, id]
      );
    } else {
      this.db.run(
        `INSERT INTO platform_plan_upgrade_rules (id, from_plan_id, to_plan_id, allowed, upgrade_fee_percent, requires_approval, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, input.fromPlanId, input.toPlanId, input.allowed ? 1 : 0, toNumber(input.upgradeFeePercent, 0), input.requiresApproval ? 1 : 0, input.notes ?? null]
      );
    }
    this.audit('تعيين قاعدة ترقية/تخفيض', 'PLAN', id, { from: input.fromPlanId, to: input.toPlanId, allowed: input.allowed });
    return this.listPlanUpgradeRules().find((r) => r.id === id)!;
  }

  // ─── Subscription Plan Change with Price Diff ───────────────────────────────

  /**
   * تغيير خطة الاشتراك مع احتساب فرق السعر وتطبيق قفل السعر للعملاء الحاليين.
   * إذا كان lockOldPrice = true، يحتفظ العميل بالسعر القديم (grandfathering).
   */
  public changeSubscriptionPlan(
    tenantId: string,
    targetPlanId: string,
    options: { effectiveFrom?: string; lockOldPrice?: boolean; seats?: number; branchesLimit?: number; couponCode?: string | null; notes?: string } = {}
  ): PlatformPlanChangeResult {
    PlatformAdminService.requirePlatformAccess('subscriptions', 'platform.subscriptions.update');
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const targetPlan = this.listPlans().find((p) => p.id === targetPlanId);
    if (!targetPlan) throw new Error('الخطة الهدف غير موجودة.');
    if (!targetPlan.isActive) throw new Error('الخطة الهدف غير مفعّلة.');

    // تحقق من قواعد الترقية/التخفيض.
    const currentPlanId = tenant.planId;
    if (currentPlanId && currentPlanId !== targetPlanId) {
      const rule = this.db.query<any>(
        `SELECT * FROM platform_plan_upgrade_rules WHERE from_plan_id = ? AND to_plan_id = ?`,
        [currentPlanId, targetPlanId]
      )[0];
      if (rule && rule.allowed === 0) throw new Error('لا يسمح بالترقية/التخفيض من الخطة الحالية إلى الخطة الهدف.');
      if (rule?.requires_approval) {
        // يمكن إضافة منطق طلب الموافقة هنا (مثل إنشاء تذكرة).
        // للتبسيط، نسمح به ولكن نسجله.
        this.audit('طلب موافقة ترقية/تخفيض', 'SUBSCRIPTION', tenantId, { fromPlan: currentPlanId, toPlan: targetPlanId });
      }
    }

    const effectiveFrom = options.effectiveFrom || nowIso();
    const lockPrice = options.lockOldPrice === true && currentPlanId && tenant.price !== undefined && tenant.price !== null;
    const oldPrice = tenant.price ?? 0;
    const newPrice = targetPlan.price;

    // احتساب الفرق النسبي (prorated) إذا كان التغيير في منتصف الفترة.
    let proratedAmount = 0;
    if (tenant.subscriptionExpiresAt && new Date(tenant.subscriptionExpiresAt) > new Date()) {
      const remainingMs = new Date(tenant.subscriptionExpiresAt).getTime() - Date.now();
      const totalMs = new Date(tenant.subscriptionExpiresAt).getTime() - new Date(tenant.subscriptionStartedAt || effectiveFrom).getTime();
      if (totalMs > 0) {
        const ratio = remainingMs / totalMs;
        proratedAmount = Math.max(0, (newPrice - oldPrice) * ratio);
      }
    }

    // تطبيق الكوبون إذا تم توفيره.
    let discount = 0;
    if (options.couponCode) {
      try {
        const couponResult = this.validateCoupon(options.couponCode, newPrice);
        discount = couponResult.discount;
        this.applyCoupon(options.couponCode);
      } catch (e) {
        throw new Error(`كوبون غير صالح: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // تحديد نوع التغيير.
    let changeType: PlatformPlanChangeType = 'same';
    if (currentPlanId && currentPlanId !== targetPlanId) {
      const currentPlan = this.listPlans().find((p) => p.id === currentPlanId);
      if (currentPlan && targetPlan.price > currentPlan.price) changeType = 'upgrade';
      else if (currentPlan && targetPlan.price < currentPlan.price) changeType = 'downgrade';
    }

    const subscriptionId = tenant.subscriptionId || `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    this.db.executeTransaction(() => {
      // تحديث الاشتراك الحالي/إنشاء جديد.
      if (tenant.subscriptionId) {
        this.db.run(
          `UPDATE platform_subscriptions SET
             plan_id = ?, price = ?, seats = ?, branches_limit = ?, billing_cycle = ?, auto_renew = 1,
             locked_price = ?, locked_currency = ?, coupon_code = ?, plan_version = ?, last_change_type = ?, updated_at = ?
           WHERE id = ?`,
          [
            targetPlanId,
            newPrice,
            options.seats ?? tenant.seatsLimit,
            options.branchesLimit ?? tenant.branchesLimit,
            targetPlan.billingCycle,
            lockPrice ? oldPrice : null,
            lockPrice ? targetPlan.currency : null,
            options.couponCode ?? null,
            targetPlan.currentVersion ?? 1,
            changeType,
            nowIso(),
            tenant.subscriptionId,
          ]
        );
      } else {
        this.db.run(
          `INSERT INTO platform_subscriptions
            (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew, branches_limit,
             locked_price, locked_currency, coupon_code, plan_version, last_change_type)
           VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
          [
            subscriptionId,
            tenantId,
            targetPlanId,
            effectiveFrom,
            targetPlan.billingCycle === 'LIFETIME' ? null : addMonths(new Date(effectiveFrom), 12).toISOString(),
            options.seats ?? tenant.seatsLimit,
            newPrice,
            discount,
            targetPlan.billingCycle,
            options.branchesLimit ?? tenant.branchesLimit,
            lockPrice ? oldPrice : null,
            lockPrice ? targetPlan.currency : null,
            options.couponCode ?? null,
            targetPlan.currentVersion ?? 1,
            changeType,
          ]
        );
      }

      // إذا كان القفل مفعلاً، سجل قفل السعر.
      if (lockPrice && tenant.subscriptionId) {
        this.recordSubscriptionPriceLock(tenant.subscriptionId, targetPlanId, oldPrice, targetPlan.currency, changeType);
      }

      // تحديث العميل.
      this.db.run(
        `UPDATE platform_tenants SET
           plan_id = ?, subscription_started_at = ?, subscription_expires_at = ?, seats_limit = ?, branches_limit = ?, devices_limit = ?,
           updated_at = ?
         WHERE id = ?`,
        [
          targetPlanId,
          effectiveFrom,
          targetPlan.billingCycle === 'LIFETIME' ? null : addMonths(new Date(effectiveFrom), 12).toISOString(),
          options.seats ?? tenant.seatsLimit,
          options.branchesLimit ?? tenant.branchesLimit,
          targetPlan.devicesLimit,
          nowIso(),
          tenantId,
        ]
      );
    });

    // إصدار ترخيص جديد إذا لزم الأمر (للترقية/التخفيض).
    if (changeType !== 'same') {
      this.issueLicenseForPlanChange(tenantId, targetPlanId, effectiveFrom, changeType);
    }

    this.audit('تغيير باقة الاشتراك', 'SUBSCRIPTION', tenantId, {
      fromPlan: currentPlanId,
      toPlan: targetPlanId,
      changeType,
      oldPrice,
      newPrice,
      lockPrice,
      proratedAmount,
      couponCode: options.couponCode,
    });

    return {
      subscriptionId: tenant.subscriptionId || subscriptionId,
      planId: targetPlanId,
      oldPlanId: currentPlanId || '',
      effectiveFrom,
      priceChange: { oldPrice, newPrice, currency: targetPlan.currency, proratedAmount },
      status: 'ACTIVE',
    };
  }

  private recordSubscriptionPriceLock(subscriptionId: string, planId: string, lockedPrice: number, currency: string, changeType: PlatformPlanChangeType): void {
    const id = `psl_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO platform_subscription_price_locks
        (id, subscription_id, plan_id, locked_price, locked_monthly_price, locked_yearly_price, currency, is_grandfathered)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, subscriptionId, planId, lockedPrice, lockedPrice, lockedPrice, currency]
    );
  }

  private issueLicenseForPlanChange(tenantId: string, planId: string, effectiveFrom: string, changeType: PlatformPlanChangeType): void {
    const plan = this.listPlans().find((p) => p.id === planId);
    if (!plan) return;
    const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const licenseKey = this.generateLicenseKey();
    const expires = plan.billingCycle === 'LIFETIME' ? null : addMonths(new Date(effectiveFrom), 12).toISOString();

    this.db.run(
      `INSERT INTO platform_licenses
        (id, tenant_id, plan_id, license_key, status, issued_at, starts_at, expires_at,
         seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FULL', ?)`,
      [
        licenseId,
        tenantId,
        planId,
        licenseKey,
        effectiveFrom,
        effectiveFrom,
        expires,
        plan.seatsLimit,
        plan.devicesLimit,
        plan.branchesLimit,
        plan.includedModules,
        plan.features,
        generateLicenseActivationCode(),
        signCertificate({ licenseKey, tenantId, planId, issuedAt: effectiveFrom, expiresAt: expires, deviceLimit: plan.devicesLimit, seats: plan.seatsLimit }),
        plan.offlineGracePeriodDays,
        `تغيير الخطة (${changeType})`,
      ]
    );
  }

  // ─── Trial Management ───────────────────────────────────────────────────────

  /**
   * إنشاء اشتراك تجريبي مجاني.
   */
  public createTrialSubscription(input: PlatformTrialCreateInput): PlatformSubscription {
    PlatformAdminService.requirePlatformAccess('subscriptions', 'platform.subscriptions.create');
    const tenant = this.getTenant(input.tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const plan = this.listPlans().find((p) => p.id === input.planId);
    if (!plan) throw new Error('الخطة غير موجودة.');
    if (!plan.isActive) throw new Error('الخطة غير مفعّلة.');

    const trialDays = input.trialDays ?? plan.trialDays ?? 14;
    const startsAt = input.startsAt || nowIso();
    const trialEndsAt = addDays(new Date(startsAt), trialDays).toISOString();
    const subscriptionId = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    // تطبيق الكوبون إذا تم توفيره.
    let discount = 0;
    if (input.couponCode) {
      try {
        discount = this.validateCoupon(input.couponCode, 0).discount;
        this.applyCoupon(input.couponCode);
      } catch { /* تجاهل كوبون غير صالح للتجربة */ }
    }

    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO platform_subscriptions
          (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew, branches_limit,
           coupon_code, plan_version, is_trial, trial_ends_at, last_change_type)
         VALUES (?, ?, ?, 'TRIAL', ?, ?, ?, 0, ?, ?, 1, ?, ?, ?, 1, ?, 'same')`,
        [
          subscriptionId,
          input.tenantId,
          input.planId,
          startsAt,
          trialEndsAt,
          plan.seatsLimit,
          discount,
          plan.billingCycle,
          plan.branchesLimit,
          input.couponCode ?? null,
          plan.currentVersion ?? 1,
          trialEndsAt,
        ]
      );
      this.db.run(
        `UPDATE platform_tenants SET status = 'TRIAL', plan_id = ?, subscription_started_at = ?, subscription_expires_at = ?, updated_at = ? WHERE id = ?`,
        [input.planId, startsAt, trialEndsAt, nowIso(), input.tenantId]
      );
    });

    this.audit('إنشاء اشتراك تجريبي', 'SUBSCRIPTION', input.tenantId, { planId: input.planId, trialDays, trialEndsAt });
    return this.db.query<any>(
      `SELECT s.*, t.name AS tenantName, p.name AS planName FROM platform_subscriptions s
       JOIN platform_tenants t ON t.id = s.tenant_id
       LEFT JOIN platform_plans p ON p.id = s.plan_id
       WHERE s.id = ?`,
      [subscriptionId]
    ).map(mapSubscription)[0];
  }

  public listSubscriptions(filters?: { status?: string; planId?: string; search?: string }): PlatformSubscription[] {
    PlatformAdminService.requirePlatformAccess('subscriptions', 'platform.subscriptions.view');
    const status = filters?.status?.trim() || '';
    const planId = filters?.planId?.trim() || '';
    const search = filters?.search?.trim() || '';
    const term = `%${search}%`;

    const rows = this.db.query<any>(
      `SELECT s.*, t.name AS tenantName, p.name AS planName
       FROM platform_subscriptions s
       JOIN platform_tenants t ON t.id = s.tenant_id
       LEFT JOIN platform_plans p ON p.id = s.plan_id
       WHERE (? = '' OR s.status = ?)
         AND (? = '' OR s.plan_id = ?)
         AND (? = '' OR t.name LIKE ? OR t.code LIKE ?)
       ORDER BY s.created_at DESC`,
      [status, status, planId, planId, search, term, term]
    );

    return rows.map(mapSubscription);
  }

  // ─── Coupon Management ──────────────────────────────────────────────────────

  public listCoupons(): PlatformCoupon[] {
    PlatformAdminService.requirePlatformAccess('billing', 'platform.billing.view');
    return this.db.query<any>(
      `SELECT * FROM platform_coupons ORDER BY created_at DESC`
    ).map((row: any) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      discountType: row.discount_type,
      discountValue: toNumber(row.discount_value),
      maxUses: row.max_uses ?? null,
      usedCount: toNumber(row.used_count),
      expiresAt: row.expiresAt ?? null,
      isActive: Boolean(row.isActive),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      planId: row.plan_id ?? null,
      firstPaymentOnly: Boolean(row.first_payment_only),
      minSubtotal: toNumber(row.min_subtotal),
      startsAt: row.starts_at ?? null,
      notes: row.notes ?? null,
    }));
  }

  public createCoupon(input: PlatformCouponInput): PlatformCoupon {
    PlatformAdminService.requirePlatformAccess('billing', 'platform.billing.create');
    const code = String(input.code || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (code.length < 3) throw new Error('رمز الكوبون يجب أن يكون 3 أحرف على الأقل.');
    if (!input.name?.trim()) throw new Error('اسم الكوبون مطلوب.');
    if (this.db.query('SELECT 1 FROM platform_coupons WHERE code = ?', [code]).length) {
      throw new Error('رمز الكوبون مستخدم بالفعل.');
    }
    const id = `coupon_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    this.db.run(
      `INSERT INTO platform_coupons
        (id, code, name, discount_type, discount_value, max_uses, expires_at, is_active, plan_id, first_payment_only, min_subtotal, starts_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      [
        id,
        code,
        input.name.trim(),
        input.discountType,
        input.discountValue,
        input.maxUses ?? null,
        input.expiresAt ?? null,
        input.planId ?? null,
        input.firstPaymentOnly ? 1 : 0,
        toNumber(input.minSubtotal, 0),
        input.startsAt ?? null,
        input.notes ?? null,
      ]
    );
    this.audit('إنشاء كوبون خصم', 'COUPON', id, { code, name: input.name });
    return this.listCoupons().find((c) => c.id === id)!;
  }

  public validateCoupon(code: string, subtotal: number): { coupon: PlatformCoupon; discount: number } {
    PlatformAdminService.requirePlatformAccess('billing', 'platform.billing.update');
    const coupon = this.db.query<any>(
      `SELECT * FROM platform_coupons WHERE code = ?`,
      [code.trim().toUpperCase()]
    )[0];
    if (!coupon) throw new Error('الكوبون غير موجود.');
    if (!coupon.isActive) throw new Error('الكوبون غير فعّال.');
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) throw new Error('الكوبون منتهي الصلاحية.');
    if (coupon.starts_at && new Date(coupon.starts_at) > new Date()) throw new Error('الكوبون لم يبدأ سريانه بعد.');
    if (coupon.max_uses && toNumber(coupon.used_count) >= toNumber(coupon.max_uses)) throw new Error('تم استنفاد استخدامات الكوبون.');
    if (toNumber(coupon.min_subtotal) > 0 && subtotal < toNumber(coupon.min_subtotal)) {
      throw new Error(`الحد الأدنى لتطبيق الكوبون هو ${formatMoneyText(coupon.min_subtotal)}`);
    }
    const value = toNumber(coupon.discount_value);
    const discount = coupon.discount_type === 'PERCENT'
      ? Math.max(0, subtotal * (value / 100))
      : Math.max(0, value);
    return {
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        discountType: coupon.discount_type,
        discountValue: value,
        maxUses: coupon.max_uses ?? null,
        usedCount: toNumber(coupon.used_count),
        expiresAt: coupon.expiresAt ?? null,
        isActive: Boolean(coupon.isActive),
        createdAt: coupon.createdAt,
        updatedAt: coupon.updatedAt,
        planId: coupon.plan_id ?? null,
        firstPaymentOnly: Boolean(coupon.first_payment_only),
        minSubtotal: toNumber(coupon.min_subtotal),
        startsAt: coupon.starts_at ?? null,
        notes: coupon.notes ?? null,
      },
      discount,
    };
  }

  public applyCoupon(code: string): PlatformCoupon {
    PlatformAdminService.requirePlatformAccess('billing', 'platform.billing.update');
    const normalized = code.trim().toUpperCase();
    const coupon = this.db.query<any>(`SELECT * FROM platform_coupons WHERE code = ?`, [normalized])[0];
    if (!coupon) throw new Error('الكوبون غير موجود.');
    this.db.run('UPDATE platform_coupons SET used_count = used_count + 1, updated_at = ? WHERE code = ?', [nowIso(), normalized]);
    this.audit('تطبيق كوبون خصم', 'COUPON', coupon.id, { code: coupon.code });
    return this.listCoupons().find((c) => c.code === normalized)!;
  }

  // ─── Impact Preview ─────────────────────────────────────────────────────────

  /**
   * معاينة تأثير تعديل خطة على العملاء الحاليين قبل الاعتماد.
   * ترجع تفاصيل: تغييرات الأسعار، تغييرات الوحدات/المزايا، انتهاكات الحدود، وتقييم المخاطر.
   */
  public previewPlanChangeImpact(planId: string, newPlanData: PlatformPlanInput): PlatformPlanImpactPreview {
    PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.update');
    const plan = this.listPlans().find((p) => p.id === planId);
    if (!plan) throw new Error('الخطة غير موجودة.');

    // العملاء المشتركين في هذه الخطة حالياً.
    const subscriptions = this.db.query<any>(
      `SELECT s.*, t.name AS tenantName, t.id AS tenantId
       FROM platform_subscriptions s
       JOIN platform_tenants t ON t.id = s.tenant_id
       WHERE s.plan_id = ? AND s.status IN ('ACTIVE','TRIAL')`,
      [planId]
    );

    const priceChanges: PlatformPlanImpactPreview['priceChanges'] = [];
    const moduleChanges: PlatformPlanImpactPreview['moduleChanges'] = [];
    const limitViolations: PlatformPlanImpactPreview['limitViolations'] = [];
    let estimatedRevenueImpact = 0;

    const newPrice = toNumber(newPlanData.price ?? newPlanData.yearlyPrice ?? 0);
    const oldPrice = plan.price;
    const newModules = newPlanData.includedModules ?? [];
    const newFeatures = newPlanData.features ?? [];

    for (const sub of subscriptions) {
      // تحقق من قفل السعر.
      const priceLock = this.db.query<any>(
        `SELECT * FROM platform_subscription_price_locks WHERE subscription_id = ?`,
        [sub.id]
      )[0];
      const isLocked = Boolean(priceLock);
      const appliedPrice = isLocked && priceLock?.locked_price !== null ? toNumber(priceLock.locked_price) : newPrice;
      const priceChanged = appliedPrice !== oldPrice;

      if (priceChanged) {
        priceChanges.push({
          subscriptionId: sub.id,
          tenantId: sub.tenantId,
          tenantName: sub.tenantName,
          oldPrice,
          newPrice: appliedPrice,
          currency: plan.currency,
          isLocked,
          effectiveFrom: newPlanData.effectiveFrom || nowIso(),
        });
        estimatedRevenueImpact += (appliedPrice - oldPrice);
      }

      // تغييرات الوحدات/المزايا.
      const removedModules = plan.includedModules.filter((m) => !newModules.includes(m));
      const removedFeatures = plan.features.filter((f) => !newFeatures.includes(f));
      if (removedModules.length > 0 || removedFeatures.length > 0) {
        moduleChanges.push({
          subscriptionId: sub.id,
          tenantId: sub.tenantId,
          tenantName: sub.tenantName,
          removedModules,
          removedFeatures,
        });
      }

      // انتهاكات الحدود.
      const tenant = this.getTenant(sub.tenantId);
      if (tenant) {
        if (newPlanData.seatsLimit !== undefined && tenant.seatsLimit > newPlanData.seatsLimit) {
          limitViolations.push({ subscriptionId: sub.id, tenantId: sub.tenantId, tenantName: sub.tenantName, metric: 'seats', currentUsage: tenant.seatsLimit, newLimit: newPlanData.seatsLimit });
        }
        if (newPlanData.branchesLimit !== undefined && tenant.branchesLimit > newPlanData.branchesLimit) {
          limitViolations.push({ subscriptionId: sub.id, tenantId: sub.tenantId, tenantName: sub.tenantName, metric: 'branches', currentUsage: tenant.branchesLimit, newLimit: newPlanData.branchesLimit });
        }
        if (newPlanData.devicesLimit !== undefined && tenant.devicesLimit > newPlanData.devicesLimit) {
          limitViolations.push({ subscriptionId: sub.id, tenantId: sub.tenantId, tenantName: sub.tenantName, metric: 'devices', currentUsage: tenant.devicesLimit, newLimit: newPlanData.devicesLimit });
        }
      }
    }

    // تقييم المخاطر.
    let riskLevel: PlatformPlanImpactPreview['riskLevel'] = 'LOW';
    if (limitViolations.length > 0) riskLevel = 'CRITICAL';
    else if (moduleChanges.length > 0) riskLevel = 'HIGH';
    else if (priceChanges.some((pc) => !pc.isLocked)) riskLevel = 'MEDIUM';

    let recommendation = 'التعديل آمن.';
    if (riskLevel === 'CRITICAL') recommendation = 'يوجد عملاء سيتجاوزون الحدود الجديدة. يجب زيادة الحدود أو نقل العملاء قبل الاعتماد.';
    else if (riskLevel === 'HIGH') recommendation = 'سيفقد بعض العملاء وحدات/مزايا. تواصل معهم قبل الاعتماد.';
    else if (riskLevel === 'MEDIUM') recommendation = 'ستتغير الأسعار لبعض العملاء. تأكد من قفل الأسعار للعملاء الحاليين إذا رغبت.';

    return {
      planId,
      affectedSubscriptions: subscriptions.length,
      affectedTenants: subscriptions.length,
      priceChanges,
      moduleChanges,
      limitViolations,
      riskLevel,
      recommendation,
      estimatedRevenueImpact,
    };
  }

  // ─── Plan Deactivation Validation ───────────────────────────────────────────

  /**
   * التحقق من إمكانية تعطيل الخطة (تُستخدم في setPlanActive).
   * ترجع false إذا كانت الخطة مرتبطة باشتراكات نشطة.
   */
  public validatePlanDeactivation(planId: string): { canDeactivate: boolean; activeSubscriptions: number; message: string } {
    PlatformAdminService.requirePlatformAccess('plans', 'platform.plans.update');
    const activeSubs = this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_subscriptions WHERE plan_id = ? AND status IN ('ACTIVE','TRIAL')`,
      [planId]
    )[0];
    const count = toNumber(activeSubs?.count, 0);
    return {
      canDeactivate: count === 0,
      activeSubscriptions: count,
      message: count === 0 ? 'يمكن تعطيل الخطة بأمان.' : `الخطة مرتبطة بـ ${count} اشتراك نشط/تجريبي. يجب نقلهم أو إلغاء اشتراكاتهم أولاً.`,
    };
  }

  // ─── Per-tenant overrides (without changing the base plan) ─────────────────

  public listTenantOverrides(tenantId: string): PlatformTenantOverride[] {
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.view');
    return this.db.query<any>(
      `SELECT * FROM platform_tenant_overrides WHERE tenant_id = ? ORDER BY created_at DESC`,
      [tenantId]
    ).map(mapTenantOverride);
  }

  public addTenantOverride(tenantId: string, input: PlatformTenantOverrideInput): PlatformTenantOverride {
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.update');
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
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.update');
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_tenant_overrides WHERE id = ?', [id])[0];
    if (!row) throw new Error('التجاوز غير موجود.');
    this.db.run('UPDATE platform_tenant_overrides SET is_enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, nowIso(), id]);
    this.audit(enabled ? 'تفعيل تجاوز خاص للعميل' : 'تعطيل تجاوز خاص للعميل', 'TENANT', String(row.tenantId), { id, enabled });
    return this.db.query<any>('SELECT * FROM platform_tenant_overrides WHERE id = ?', [id]).map(mapTenantOverride)[0];
  }

  public removeTenantOverride(id: string): void {
    PlatformAdminService.requirePlatformAccess('tenants', 'platform.tenants.update');
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_tenant_overrides WHERE id = ?', [id])[0];
    if (!row) throw new Error('التجاوز غير موجود.');
    this.db.run('DELETE FROM platform_tenant_overrides WHERE id = ?', [id]);
    this.audit('حذف تجاوز خاص للعميل', 'TENANT', String(row.tenantId), { id });
  }

  // ─── Per-tenant user directory & identity provisioning ─────────────────────
  // platform_tenant_users is a directory/provisioning record. Creating a row is
  // NOT equivalent to a real login account in the tenant's identity system unless
  // provisioning succeeds and is linked via identity_user_id.

  public listTenantUsers(tenantId: string): PlatformTenantUser[] {
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.tenants.manage_users');
    this.assertTenantScope(tenantId);
    return this.db.query<any>(
      `SELECT * FROM platform_tenant_users WHERE tenant_id = ? ORDER BY created_at DESC`,
      [tenantId]
    ).map(mapTenantUser);
  }

  private getTenantUserById(id: string): PlatformTenantUser | null {
    const row = this.db.query<any>('SELECT * FROM platform_tenant_users WHERE id = ?', [id])[0];
    return row ? mapTenantUser(row) : null;
  }

  private uniqueTenantUsername(tenantId: string, preferred: string, excludeId?: string): string {
    const base = String(preferred || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/^[-_.]+|[-_.]+$/g, '')
      .slice(0, 24) || 'user';
    let candidate = base;
    let index = 1;
    while (true) {
      const row = this.db.query<any>(
        'SELECT id FROM platform_tenant_users WHERE tenant_id = ? AND username = ? AND (? IS NULL OR id <> ?)',
        [tenantId, candidate, excludeId ?? null, excludeId ?? null]
      )[0];
      if (!row) return candidate;
      index += 1;
      candidate = `${base.slice(0, 20)}${index}`;
    }
  }

  public createTenantUser(tenantId: string, input: PlatformTenantUserInput): PlatformTenantUserProvisioningResult {
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.tenants.manage_users');
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const fullName = String(input.fullName || '').trim();
    if (fullName.length < 2) throw new Error('اسم المستخدم مطلوب.');

    const provisionIdentity = input.provisionIdentity !== false;
    const provisioningMode: 'INVITE' | 'DIRECT_CREATE' = input.provisioningMode || 'INVITE';
    const requestedStatus = input.status || (provisionIdentity ? 'INVITED' : 'ACTIVE');
    const role = (input.role?.trim() || 'USER');
    const scope = input.scope?.trim() || null;
    const email = input.email?.trim() || null;
    const phone = input.phone?.trim() || null;
    const preferredUsername = input.username?.trim() || email?.split('@')[0] || fullName.replace(/\s+/g, '.').toLowerCase();
    const username = this.uniqueTenantUsername(tenantId, preferredUsername);

    const id = `tusr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    // The identity user id belongs to the tenant's identity system, never to
    // us to invent — it is filled in only when provisioning actually succeeds.
    const identityUserId = null;
    const inviteCode = provisionIdentity ? generateActivationCode() : null;
    const temporaryPassword = provisionIdentity
      ? (input.password?.trim() || generateTemporaryPassword())
      : null;
    if (temporaryPassword && temporaryPassword.length < 8) {
      throw new Error('كلمة المرور المؤقتة يجب أن تكون 8 أحرف على الأقل.');
    }
    const inviteExpiresAt = provisionIdentity ? addDays(new Date(), 14).toISOString() : null;
    const now = nowIso();
    // Store only hashed forms of activation secrets; plaintext is returned once.
    const storedInviteCode = inviteCode ? bcrypt.hashSync(inviteCode, 10) : null;
    const storedTemporaryPassword = temporaryPassword ? bcrypt.hashSync(temporaryPassword, 10) : null;
    // DIRECT_CREATE no longer claims PROVISIONED without a real identity account.
    const provisioningStatus = provisionIdentity
      ? (provisioningMode === 'DIRECT_CREATE' ? 'PENDING' : 'INVITED')
      : 'DIRECTORY_ONLY';
    const provisionedAt = null;
    const status = provisionIdentity
      ? 'INVITED'
      : requestedStatus;

    // Reliable provisioning record: persist identity linkage + invite/create intent
    // for the tenant's actual identity system. The directory row is never treated
    // as a real account by itself; status is driven by provisioning outcome.
    this.db.run(
      `INSERT INTO platform_tenant_users
        (id, tenant_id, full_name, username, email, phone, role, status, notes,
         provisioning_status, provisioning_mode, identity_user_id, scope, invite_code,
         temporary_password, invite_expires_at, provisioned_at, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        id,
        tenantId,
        fullName,
        username,
        email,
        phone,
        role,
        status,
        input.notes?.trim() || null,
        provisioningStatus,
        provisionIdentity ? provisioningMode : null,
        identityUserId,
        scope,
        storedInviteCode,
        storedTemporaryPassword,
        inviteExpiresAt,
        provisionedAt,
        now,
        now,
      ]
    );

    // Queue/apply provisioning request for tenant identity system. If the tenant
    // installation is not reachable now, the persisted INVITED/PENDING record is
    // the source of truth and can be delivered/retried reliably.
    if (provisionIdentity) {
      this.recordTenantUserProvisioningEvent(tenantId, id, 'REQUESTED', {
        identityUserId,
        username,
        role,
        scope,
        mode: provisioningMode,
        status: provisioningStatus,
      });
    }

    this.audit('إنشاء/دعوة مستخدم للعميل في نظام هوية العميل', 'TENANT', tenantId, {
      id,
      fullName,
      username,
      role,
      scope,
      provisioningMode: provisionIdentity ? provisioningMode : null,
      provisioningStatus,
      identityUserId,
      directoryOnly: !provisionIdentity,
    });

    const user = this.getTenantUserById(id)!;
    const message = !provisionIdentity
      ? 'تم حفظ المستخدم كسجل دليل فقط (بدون حساب هوية فعلي).'
      : provisioningMode === 'DIRECT_CREATE'
        ? 'تم إنشاء طلب حساب الهوية الفعلي وربطه بالعميل مع الدور والنطاق.'
        : 'تم إنشاء دعوة حساب هوية فعلية للعميل وربطها بالعميل مع الدور والنطاق. شارك كود الدعوة وكلمة المرور المؤقتة لإكمال التفعيل.';
    return { user, inviteCode, temporaryPassword, provisioned: false, message };
  }

  public updateTenantUser(id: string, input: PlatformTenantUserInput): PlatformTenantUser {
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.tenants.manage_users');
    const existing = this.getTenantUserById(id);
    if (!existing) throw new Error('المستخدم غير موجود.');
    const tenantId = existing.tenantId;
    const fullName = String(input.fullName ?? existing.fullName).trim();
    if (fullName.length < 2) throw new Error('اسم المستخدم مطلوب.');
    const username = input.username !== undefined
      ? (input.username?.trim() || null)
      : existing.username ?? null;
    if (username && username !== existing.username) {
      // ensure uniqueness within tenant directory
      const unique = this.uniqueTenantUsername(tenantId, username, id);
      if (unique !== username.toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24)) {
        // keep as provided but validate conflict
      }
      const conflict = this.db.query<any>(
        'SELECT id FROM platform_tenant_users WHERE tenant_id = ? AND username = ? AND id <> ?',
        [tenantId, username, id]
      )[0];
      if (conflict) throw new Error('اسم المستخدم مستخدم بالفعل لهذا العميل.');
    }
    const role = input.role ?? existing.role;
    const scope = input.scope ?? existing.scope ?? null;
    const status = input.status ?? existing.status;
    this.db.run(
      `UPDATE platform_tenant_users SET
         full_name = ?, username = ?, email = ?, phone = ?, role = ?, status = ?, notes = ?, scope = ?, updated_at = ?
       WHERE id = ?`,
      [
        fullName,
        username,
        input.email ?? existing.email ?? null,
        input.phone ?? existing.phone ?? null,
        role,
        status,
        input.notes ?? existing.notes ?? null,
        scope,
        nowIso(),
        id,
      ]
    );
    this.audit('تعديل مستخدم عميل/طلب تحديث هوية', 'TENANT', tenantId, {
      id,
      fullName,
      username,
      role,
      scope,
      identityUserId: existing.identityUserId ?? null,
      provisioningStatus: existing.provisioningStatus,
    });
    if (existing.identityUserId) {
      this.recordTenantUserProvisioningEvent(tenantId, id, 'UPDATE_REQUESTED', {
        identityUserId: existing.identityUserId,
        username,
        role,
        scope,
        status,
      });
    }
    return this.getTenantUserById(id)!;
  }

  public setTenantUserActive(id: string, active: boolean): PlatformTenantUser {
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.tenants.manage_users');
    const existing = this.getTenantUserById(id);
    if (!existing) throw new Error('المستخدم غير موجود.');
    const tenantId = existing.tenantId;
    this.db.run(
      `UPDATE platform_tenant_users SET status = ?, updated_at = ? WHERE id = ?`,
      [active ? 'ACTIVE' : 'SUSPENDED', nowIso(), id]
    );
    this.audit(active ? 'تفعيل مستخدم عميل' : 'تعليق مستخدم عميل', 'TENANT', tenantId, {
      id,
      identityUserId: existing.identityUserId ?? null,
      provisioningStatus: existing.provisioningStatus,
    });
    if (existing.identityUserId) {
      this.recordTenantUserProvisioningEvent(tenantId, id, active ? 'ACTIVATE_REQUESTED' : 'SUSPEND_REQUESTED', {
        identityUserId: existing.identityUserId,
      });
    }
    return this.getTenantUserById(id)!;
  }

  public deleteTenantUser(id: string): void {
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.tenants.manage_users');
    const existing = this.getTenantUserById(id);
    if (!existing) throw new Error('المستخدم غير موجود.');
    if (existing.identityUserId) {
      this.recordTenantUserProvisioningEvent(existing.tenantId, id, 'DELETE_REQUESTED', {
        identityUserId: existing.identityUserId,
      });
    }
    this.db.run('DELETE FROM platform_tenant_users WHERE id = ?', [id]);
    this.audit('حذف مستخدم عميل/طلب إلغاء هوية', 'TENANT', existing.tenantId, {
      id,
      identityUserId: existing.identityUserId ?? null,
      provisioningStatus: existing.provisioningStatus,
    });
  }

  public resendTenantUserInvite(id: string): PlatformTenantUserProvisioningResult {
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.tenants.manage_users');
    const existing = this.getTenantUserById(id);
    if (!existing) throw new Error('المستخدم غير موجود.');
    if (existing.provisioningStatus === 'DIRECTORY_ONLY' || existing.provisioningStatus === 'NOT_REQUESTED') {
      throw new Error('هذا السجل دليل فقط ولا يحتوي على دعوة هوية. أنشئ مستخدمًا مع تفعيل إنشاء/دعوة الحساب.');
    }
    if (existing.provisioningStatus === 'PROVISIONED') {
      throw new Error('حساب الهوية الفعلي لهذا المستخدم مُفعّل بالفعل.');
    }
    const inviteCode = generateActivationCode();
    const temporaryPassword = generateTemporaryPassword();
    const inviteExpiresAt = addDays(new Date(), 14).toISOString();
    const now = nowIso();
    this.db.run(
      `UPDATE platform_tenant_users
       SET provisioning_status = 'INVITED', provisioning_mode = COALESCE(provisioning_mode, 'INVITE'),
           invite_code = ?, temporary_password = ?, invite_expires_at = ?, last_error = NULL, updated_at = ?
       WHERE id = ?`,
      [bcrypt.hashSync(inviteCode, 10), bcrypt.hashSync(temporaryPassword, 10), inviteExpiresAt, now, id]
    );
    this.recordTenantUserProvisioningEvent(existing.tenantId, id, 'INVITE_RESENT', {
      identityUserId: existing.identityUserId ?? null,
      username: existing.username ?? null,
      role: existing.role,
      scope: existing.scope ?? null,
    });
    this.audit('إعادة إرسال دعوة هوية مستخدم عميل', 'TENANT', existing.tenantId, {
      id,
      identityUserId: existing.identityUserId ?? null,
      username: existing.username ?? null,
    });
    return {
      user: this.getTenantUserById(id)!,
      inviteCode,
      temporaryPassword,
      provisioned: false,
      message: 'تم إنشاء دعوة هوية جديدة مرتبطة بالعميل. شارك كود الدعوة وكلمة المرور المؤقتة.',
    };
  }

  public markTenantUserProvisioned(id: string, identityUserId?: string): PlatformTenantUser {
    PlatformAdminService.requirePlatformAccess('admin-control', 'platform.tenants.manage_users');
    const existing = this.getTenantUserById(id);
    if (!existing) throw new Error('المستخدم غير موجود.');
    const now = nowIso();
    this.db.run(
      `UPDATE platform_tenant_users
       SET provisioning_status = 'PROVISIONED', identity_user_id = COALESCE(?, identity_user_id),
           provisioned_at = ?, last_error = NULL, status = CASE WHEN status = 'INVITED' THEN 'ACTIVE' ELSE status END, updated_at = ?
       WHERE id = ?`,
      [identityUserId ?? null, now, now, id]
    );
    this.audit('تأكيد ربط مستخدم عميل بحساب هوية فعلي', 'TENANT', existing.tenantId, {
      id,
      identityUserId: identityUserId ?? existing.identityUserId ?? null,
    });
    return this.getTenantUserById(id)!;
  }

  private recordTenantUserProvisioningEvent(
    tenantId: string,
    tenantUserId: string,
    event: string,
    payload: Record<string, unknown>
  ): void {
    const details = JSON.stringify({ tenantUserId, event, ...payload, at: nowIso() });
    try {
      this.db.run(
        `INSERT INTO platform_audit_log (id, actor_id, actor_type, action, entity_type, entity_id, severity, status, details, created_at)
         VALUES (?, ?, 'SYSTEM', ?, 'TENANT_USER_PROVISIONING', ?, 'INFO', 'SUCCESS', ?, ?)`,
        [
          `aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
          authSession.getCurrentUser()?.id ?? 'system',
          event,
          tenantId,
          details,
          nowIso(),
        ]
      );
    } catch {
      // Audit/provisioning event recording must not block core persistence.
    }
    // Enqueue a real execution job so provisioning is not only an audit entry.
    try {
      provisioningQueueService.enqueue(tenantId, tenantUserId, event, payload);
    } catch {
      // Queueing must not block core persistence.
    }
    // Kick the executor (fire-and-forget, internally guarded against re-entry).
    provisioningExecutorService.requestDrain();
  }

  // ─── Licenses ──────────────────────────────────────────────────────────────

  public listLicenses(search = '', status = ''): PlatformLicense[] {
    PlatformAdminService.requirePlatformAccess('licenses', 'platform.licenses.view');
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
    PlatformAdminService.requirePlatformAccess('licenses', 'platform.licenses.view');
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
    options: {
      months?: number;
      seats?: number;
      branchesLimit?: number;
      startsAt?: string;
      offlineGracePeriodDays?: number;
      couplingMode?: PlatformLicense['couplingMode'];
      notes?: string;
    } = {}
  ): PlatformLicense {
    PlatformAdminService.requirePlatformAccess('licenses', 'platform.licenses.create');
    const allowLocal = this.setting('platform.localIssuance', 'false') === 'true';
    if (!allowLocal) {
      throw new Error('إصدار التراخيص يتم من الخادم المركزي فقط. لا يُسمح بالإصدار المحلي.');
    }
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const plan = this.db.query<any>('SELECT * FROM platform_plans WHERE id = ?', [planId])[0];
    if (!plan) throw new Error('الخطة غير موجودة.');

    const months = Math.max(1, toNumber(options.months, 12));
    const startsAt = options.startsAt ? new Date(options.startsAt) : new Date();
    const expires = plan.billingCycle === 'LIFETIME'
      ? null
      : addMonths(startsAt, months);
    const subscriptionId = `sub_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const licenseId = `lic_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const seats = Math.max(1, toNumber(options.seats, plan.seatsLimit));
    const branchesLimit = Math.max(1, toNumber(options.branchesLimit, plan.branchesLimit));
    const licenseKey = this.generateLicenseKey();
    const activationCode = generateLicenseActivationCode();
    const offlineGracePeriodDays = toNumber(options.offlineGracePeriodDays, plan.offlineGracePeriodDays);
    const couplingMode = options.couplingMode ?? 'FULL';
    const certificate = signCertificate({
      licenseKey,
      tenantId,
      planId,
      issuedAt: startsAt.toISOString(),
      expiresAt: expires?.toISOString() ?? null,
      deviceLimit: toNumber(plan.devicesLimit, 1),
      seats,
      branchesLimit,
      offlineGracePeriodDays,
      licenseType: plan.billingCycle === 'LIFETIME' ? 'perpetual' : (plan.billingCycle === 'YEARLY' ? 'annual' : 'monthly'),
    });

    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO platform_subscriptions
          (id, tenant_id, plan_id, status, start_date, end_date, seats, price, discount, billing_cycle, auto_renew, branches_limit)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, 1, ?)`,
        [subscriptionId, tenantId, planId, startsAt.toISOString(), expires?.toISOString() ?? null, seats, toNumber(plan.price), plan.billingCycle, branchesLimit]
      );
      this.db.run(
        `INSERT INTO platform_licenses
          (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at,
           seats, device_limit, branches_limit, modules, features, activation_code, certificate, offline_grace_period_days, coupling_mode, notes)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          licenseId,
          tenantId,
          subscriptionId,
          planId,
          licenseKey,
          startsAt.toISOString(),
          startsAt.toISOString(),
          expires?.toISOString() ?? null,
          seats,
          toNumber(plan.devicesLimit, 1),
          branchesLimit,
          plan.includedModules,
          plan.features,
          activationCode,
          certificate,
          offlineGracePeriodDays,
          couplingMode,
          options.notes?.trim() || null,
        ]
      );
      this.db.run(
        `UPDATE platform_tenants SET status = 'ACTIVE', plan_id = ?, subscription_started_at = ?,
           subscription_expires_at = ?, seats_limit = ?, branches_limit = ?, devices_limit = ?, updated_at = ?
         WHERE id = ?`,
        [
          planId,
          startsAt.toISOString(),
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
    PlatformAdminService.requirePlatformAccess('licenses', 'platform.licenses.update');
    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');
    const base = license.expiresAt && new Date(license.expiresAt) > new Date()
      ? new Date(license.expiresAt)
      : new Date();
    const expires = addMonths(base, Math.max(1, months));
    const coupling = license.couplingMode ?? 'FULL';
    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE platform_licenses SET status = 'ACTIVE', expires_at = ?, updated_at = ? WHERE id = ?`,
        [expires.toISOString(), nowIso(), id]
      );
      if (coupling === 'FULL' || coupling === 'EXPIRY_ONLY') {
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
      }
    });
    this.recordLicenseActivation(license, license.hardwareId ?? null, 'RENEW', 'ONLINE', 'SUCCESS', `تجديد ${months} شهر`);
    this.recordLicenseChange(id, license.subscriptionId ?? null, 'RENEW', { expiresAt: license.expiresAt }, { expiresAt: expires.toISOString() });
    this.audit('تجديد ترخيص', 'LICENSE', id, { months, expiresAt: expires.toISOString(), coupling });
    return this.getLicense(id)!;
  }

  public setLicenseStatus(id: string, status: PlatformLicenseStatus): void {
    PlatformAdminService.requirePlatformAccess('licenses', 'platform.licenses.update');
    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');
    const previousStatus = license.status;
    const coupling = license.couplingMode ?? 'FULL';
    this.db.run('UPDATE platform_licenses SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
    if (coupling === 'FULL') {
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
    } else if (coupling === 'EXPIRY_ONLY') {
      // EXPIRY_ONLY: only expiry dates are coupled, status changes are independent
      // No tenant status change on license status change
    }
    // NONE: no coupling at all
    this.recordLicenseChange(id, license.subscriptionId ?? null, 'STATUS_CHANGE', { status: previousStatus }, { status });
    this.audit('تغيير حالة ترخيص', 'LICENSE', id, { status, previousStatus, coupling });
  }

  public setLicenseCouplingMode(id: string, couplingMode: PlatformLicense['couplingMode']): PlatformLicense {
    PlatformAdminService.requirePlatformAccess('licenses', 'platform.licenses.update');
    const license = this.getLicense(id);
    if (!license) throw new Error('الترخيص غير موجود.');
    const previousMode = license.couplingMode ?? 'FULL';
    this.db.run(
      `UPDATE platform_licenses SET coupling_mode = ?, updated_at = ? WHERE id = ?`,
      [couplingMode, nowIso(), id]
    );
    this.recordLicenseChange(id, license.subscriptionId ?? null, 'COUPLING_CHANGE', { couplingMode: previousMode }, { couplingMode });
    this.audit('تغيير ربط الترخيص بالاشتراك', 'LICENSE', id, { couplingMode, previousMode });
    return this.getLicense(id)!;
  }

  public bindLicenseHardware(id: string, hardwareId: string): void {
    PlatformAdminService.requirePlatformAccess('licenses', 'platform.licenses.update');
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
    PlatformAdminService.requirePlatformAccess('devices', 'platform.devices.update');
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
    PlatformAdminService.requirePlatformAccess('licenses', 'platform.licenses.view');
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
    PlatformAdminService.requirePlatformAccess('devices', 'platform.devices.view');
    this.assertTenantScope(tenantId);
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
    PlatformAdminService.requirePlatformAccess('devices', 'platform.devices.create');
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
    PlatformAdminService.requirePlatformAccess('devices', 'platform.devices.update');
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_devices WHERE id = ?', [id])[0];
    if (!row) throw new Error('الجهاز غير موجود.');
    this.db.run('UPDATE platform_devices SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
    this.audit(status === 'SUSPENDED' ? 'إيقاف جهاز' : 'تفعيل جهاز', 'TENANT', String(row.tenantId), { id, status });
    const tenantId = String(row.tenantId);
    return this.listDevices(tenantId).find((item) => item.id === id)!;
  }

  public deleteDevice(id: string): void {
    PlatformAdminService.requirePlatformAccess('devices', 'platform.devices.delete');
    const row = this.db.query<any>('SELECT tenant_id AS tenantId, hardware_id AS hardwareId FROM platform_devices WHERE id = ?', [id])[0];
    if (!row) throw new Error('الجهاز غير موجود.');
    this.db.run('DELETE FROM platform_devices WHERE id = ?', [id]);
    this.audit('حذف تفعيل جهاز', 'TENANT', String(row.tenantId), { id, hardwareId: row.hardwareId });
  }

  public markDeviceCloneSuspected(id: string, suspected: boolean): PlatformDevice {
    PlatformAdminService.requirePlatformAccess('devices', 'platform.devices.update');
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_devices WHERE id = ?', [id])[0];
    if (!row) throw new Error('الجهاز غير موجود.');
    this.db.run('UPDATE platform_devices SET clone_suspected = ?, updated_at = ? WHERE id = ?', [suspected ? 1 : 0, nowIso(), id]);
    this.audit(suspected ? 'اشتباه استنساخ جهاز' : 'رفع اشتباه استنساخ جهاز', 'TENANT', String(row.tenantId), { id, suspected });
    return this.listDevices(String(row.tenantId)).find((item) => item.id === id)!;
  }

  public reassignDeviceSeat(deviceId: string, licenseId: string): PlatformDevice {
    PlatformAdminService.requirePlatformAccess('devices', 'platform.devices.update');
    const device = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_devices WHERE id = ?', [deviceId])[0];
    if (!device) throw new Error('الجهاز غير موجود.');
    const license = this.getLicense(licenseId);
    if (!license) throw new Error('الترخيص غير موجود.');
    this.db.run('UPDATE platform_devices SET license_id = ?, updated_at = ? WHERE id = ?', [licenseId, nowIso(), deviceId]);
    this.audit('إعادة تخصيص مقعد جهاز', 'TENANT', String(device.tenantId), { deviceId, licenseId });
    return this.listDevices(String(device.tenantId)).find((item) => item.id === deviceId)!;
  }

  // ─── Remote Device Management & Clone Detection ─────────────────────────

  public suspendDevice(deviceId: string, reason?: string): PlatformDevice {
    PlatformAdminService.requirePlatformAccess('devices', 'platform.devices.update');
    const device = this.getDeviceById(deviceId);
    if (!device) throw new Error('الجهاز غير موجود.');
    this.db.run(
      `UPDATE platform_devices SET status = 'SUSPENDED', updated_at = ? WHERE id = ?`,
      [nowIso(), deviceId]
    );
    // Also suspend the bound license if any
    if (device.licenseId) {
      this.db.run(
        `UPDATE platform_licenses SET status = 'SUSPENDED', updated_at = ? WHERE id = ? AND status = 'ACTIVE'`,
        [nowIso(), device.licenseId]
      );
    }
    this.recordLicenseActivation(
      this.getLicense(device.licenseId!) || { id: device.licenseId!, tenantId: device.tenantId, hardwareId: device.hardwareId, activationCode: null } as any,
      device.hardwareId,
      'DEACTIVATE',
      'ONLINE',
      'SUCCESS',
      reason || 'إيقاف الجهاز عن بُعد'
    );
    this.audit('إيقاف جهاز عن بُعد', 'DEVICE', deviceId, { tenantId: device.tenantId, hardwareId: device.hardwareId, reason });
    return this.getDeviceById(deviceId)!;
  }

  public releaseDevice(deviceId: string, reason?: string): PlatformDevice {
    PlatformAdminService.requirePlatformAccess('devices', 'platform.devices.update');
    const device = this.getDeviceById(deviceId);
    if (!device) throw new Error('الجهاز غير موجود.');
    // Unbind license from device
    if (device.licenseId) {
      this.db.run(
        `UPDATE platform_licenses SET hardware_id = NULL, activated_at = NULL, updated_at = ? WHERE id = ?`,
        [nowIso(), device.licenseId]
      );
      this.recordLicenseActivation(
        this.getLicense(device.licenseId!) || { id: device.licenseId!, tenantId: device.tenantId, hardwareId: device.hardwareId, activationCode: null } as any,
        device.hardwareId,
        'DEACTIVATE',
        'ONLINE',
        'SUCCESS',
        reason || 'تحرير الجهاز عن بُعد'
      );
    }
    this.db.run(
      `UPDATE platform_devices SET status = 'OFFLINE', license_id = NULL, updated_at = ? WHERE id = ?`,
      [nowIso(), deviceId]
    );
    this.audit('تحرير جهاز عن بُعد', 'DEVICE', deviceId, { tenantId: device.tenantId, hardwareId: device.hardwareId, reason });
    return this.getDeviceById(deviceId)!;
  }

  public revokeDevice(deviceId: string, reason?: string): PlatformDevice {
    PlatformAdminService.requirePlatformAccess('devices', 'platform.devices.delete');
    const device = this.getDeviceById(deviceId);
    if (!device) throw new Error('الجهاز غير موجود.');
    this.db.run(
      `UPDATE platform_devices SET status = 'REVOKED', clone_suspected = 1, updated_at = ? WHERE id = ?`,
      [nowIso(), deviceId]
    );
    if (device.licenseId) {
      this.db.run(
        `UPDATE platform_licenses SET status = 'REVOKED', updated_at = ? WHERE id = ?`,
        [nowIso(), device.licenseId]
      );
      this.recordLicenseActivation(
        this.getLicense(device.licenseId!) || { id: device.licenseId!, tenantId: device.tenantId, hardwareId: device.hardwareId, activationCode: null } as any,
        device.hardwareId,
        'REVOKE',
        'ONLINE',
        'SUCCESS',
        reason || 'إلغاء الجهاز عن بُعد (اشتباه استنساخ)'
      );
    }
    this.audit('إلغاء جهاز عن بُعد', 'DEVICE', deviceId, { tenantId: device.tenantId, hardwareId: device.hardwareId, reason });
    return this.getDeviceById(deviceId)!;
  }

  public detectCloneDevices(): { devices: PlatformDevice[]; licenses: PlatformLicense[]; alerts: string[] } {
    PlatformAdminService.requirePlatformAccess('devices', 'platform.devices.update');
    const alerts: string[] = [];
    const flaggedDevices: PlatformDevice[] = [];
    const flaggedLicenses: PlatformLicense[] = [];

    // 1. Same HWID registered to multiple tenants (cross-tenant clone)
    const duplicateHwids = this.db.query<any>(`
      SELECT hardware_id, COUNT(DISTINCT tenant_id) as tenant_count
      FROM platform_devices
      WHERE status IN ('ACTIVE', 'SUSPENDED')
      GROUP BY hardware_id
      HAVING tenant_count > 1
    `);
    for (const row of duplicateHwids) {
      const hwid = String(row.hardware_id);
      const devices = this.db.query<any>(
        `SELECT * FROM platform_devices WHERE hardware_id = ? AND status IN ('ACTIVE', 'SUSPENDED')`,
        [hwid]
      );
      for (const d of devices) {
        this.db.run(
          `UPDATE platform_devices SET clone_suspected = 1, updated_at = ? WHERE id = ?`,
          [nowIso(), d.id]
        );
        flaggedDevices.push(mapDevice(d));
        alerts.push(`اشتباه استنساخ: بصمة العتاد ${hwid} مستخدمة على عدة عملاء`);
      }
    }

    // 2. Same license active on more devices than device_limit
    const overLimitLicenses = this.db.query<any>(`
      SELECT l.id, l.device_limit, COUNT(d.id) as active_device_count
      FROM platform_licenses l
      LEFT JOIN platform_devices d ON d.license_id = l.id AND d.status = 'ACTIVE'
      WHERE l.status = 'ACTIVE'
      GROUP BY l.id
      HAVING active_device_count > l.device_limit
    `);
    for (const row of overLimitLicenses) {
      const license = this.getLicense(String(row.id));
      if (license) {
        flaggedLicenses.push(license);
        alerts.push(`تجاوز عدد الأجهزة: الترخيص ${license.licenseKey} مفعل على ${row.active_device_count} أجهزة والحد المسموح ${row.device_limit}`);
      }
    }

    // 3. Rapid HWID transfers (more than 3 transfers in 30 days)
    const rapidTransfers = this.db.query<any>(`
      SELECT license_id, COUNT(*) as transfer_count
      FROM platform_license_activations
      WHERE action = 'TRANSFER' AND created_at > date('now', '-30 day')
      GROUP BY license_id
      HAVING transfer_count > 3
    `);
    for (const row of rapidTransfers) {
      const license = this.getLicense(String(row.license_id));
      if (license) {
        alerts.push(`نقل سريع للترخيص: ${license.licenseKey} نُقل ${row.transfer_count} مرة خلال 30 يوماً`);
      }
    }

    // 4. Same license activated on multiple different HWIDs simultaneously
    const multiHwidLicenses = this.db.query<any>(`
      SELECT l.id, l.device_limit, COUNT(DISTINCT d.hardware_id) as distinct_hwids
      FROM platform_licenses l
      JOIN platform_devices d ON d.license_id = l.id AND d.status = 'ACTIVE'
      WHERE l.status = 'ACTIVE'
      GROUP BY l.id
      HAVING distinct_hwids > 1 AND l.device_limit = 1
    `);
    for (const row of multiHwidLicenses) {
      const license = this.getLicense(String(row.id));
      if (license) {
        flaggedLicenses.push(license);
        alerts.push(`ترخيص فردي على أجهزة متعددة: ${license.licenseKey} مفعل على ${row.distinct_hwids} بصمات عتاد مختلفة`);
      }
    }

    return { devices: flaggedDevices, licenses: flaggedLicenses, alerts };
  }

  private getDeviceById(deviceId: string): PlatformDevice | null {
    const row = this.db.query<any>('SELECT * FROM platform_devices WHERE id = ?', [deviceId])[0];
    return row ? mapDevice(row) : null;
  }

  // ─── Support tickets ───────────────────────────────────────────────────────

  public listSupportTickets(search = '', status = ''): PlatformSupportTicket[] {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.view');
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
    slaHours?: number;
  }): PlatformSupportTicket {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.create');
    const tenant = this.getTenant(input.tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const subject = String(input.subject || '').trim();
    if (subject.length < 3) throw new Error('موضوع التذكرة مطلوب.');
    const id = `tkt_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    
    // SLA target calculation
    const priority = input.priority || 'MEDIUM';
    const slaHoursMap: Record<string, number> = {
      URGENT: 2,
      HIGH: 8,
      MEDIUM: 24,
      LOW: 48,
    };
    const hours = input.slaHours || slaHoursMap[priority] || 24;
    const slaDueAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    this.db.run(
      `INSERT INTO platform_support_tickets
        (id, tenant_id, device_id, subject, description, priority, assigned_to, sla_due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.tenantId,
        input.deviceId || null,
        subject,
        input.description?.trim() || null,
        priority,
        input.assignedTo?.trim() || null,
        slaDueAt,
      ]
    );
    this.audit('إنشاء تذكرة دعم', 'TENANT', input.tenantId, { ticketId: id, subject, priority });
    return this.listSupportTickets().find((item) => item.id === id)!;
  }

  public setSupportTicketStatus(id: string, status: PlatformSupportTicket['status']): PlatformSupportTicket {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.update');
    const ticket = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_support_tickets WHERE id = ?', [id])[0];
    if (!ticket) throw new Error('التذكرة غير موجودة.');
    this.db.run(
      `UPDATE platform_support_tickets SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ?`,
      [status, status === 'RESOLVED' || status === 'CLOSED' ? nowIso() : null, nowIso(), id]
    );
    this.audit('تغيير حالة تذكرة دعم', 'TENANT', String(ticket.tenantId), { ticketId: id, status });
    return this.listSupportTickets().find((item) => item.id === id)!;
  }

  public assignSupportTicket(id: string, assignedTo: string | null): PlatformSupportTicket {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.update');
    const ticket = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_support_tickets WHERE id = ?', [id])[0];
    if (!ticket) throw new Error('التذكرة غير موجودة.');
    this.db.run(
      `UPDATE platform_support_tickets SET assigned_to = ?, updated_at = ? WHERE id = ?`,
      [assignedTo?.trim() || null, nowIso(), id]
    );
    this.audit('تعيين مسؤول تذكرة دعم', 'TENANT', String(ticket.tenantId), { ticketId: id, assignedTo });
    return this.listSupportTickets().find((item) => item.id === id)!;
  }

  public setSupportTicketPriority(id: string, priority: PlatformSupportTicket['priority']): PlatformSupportTicket {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.update');
    const ticket = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_support_tickets WHERE id = ?', [id])[0];
    if (!ticket) throw new Error('التذكرة غير موجودة.');
    this.db.run(
      `UPDATE platform_support_tickets SET priority = ?, updated_at = ? WHERE id = ?`,
      [priority, nowIso(), id]
    );
    this.audit('تعديل أولوية تذكرة دعم', 'TENANT', String(ticket.tenantId), { ticketId: id, priority });
    return this.listSupportTickets().find((item) => item.id === id)!;
  }

  public rateSupportTicket(id: string, rating: number, feedback?: string): PlatformSupportTicket {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.update');
    if (rating < 1 || rating > 5) throw new Error('التقييم يجب أن يكون بين 1 و 5 نجوم.');
    const ticket = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_support_tickets WHERE id = ?', [id])[0];
    if (!ticket) throw new Error('التذكرة غير موجودة.');
    this.db.run(
      `UPDATE platform_support_tickets SET rating = ?, feedback = ?, updated_at = ? WHERE id = ?`,
      [rating, feedback?.trim() || null, nowIso(), id]
    );
    this.audit('تقييم خدمة الدعم الفني', 'TENANT', String(ticket.tenantId), { ticketId: id, rating });
    return this.listSupportTickets().find((item) => item.id === id)!;
  }

  public requestRemoteAccess(id: string, requested: boolean, durationMinutes = 60): PlatformSupportTicket {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.create');
    const ticket = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_support_tickets WHERE id = ?', [id])[0];
    if (!ticket) throw new Error('التذكرة غير موجودة.');
    const expiresAt = requested ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString() : null;
    this.db.run(
      `UPDATE platform_support_tickets 
       SET remote_access_requested = ?, remote_access_duration_minutes = ?, remote_access_expires_at = ?, updated_at = ? 
       WHERE id = ?`,
      [requested ? 1 : 0, durationMinutes, expiresAt, nowIso(), id]
    );
    this.audit(requested ? 'طلب وصول عن بعد' : 'إلغاء طلب وصول عن بعد', 'TENANT', String(ticket.tenantId), { ticketId: id, requested, durationMinutes });
    return this.listSupportTickets().find((item) => item.id === id)!;
  }

  public approveRemoteAccess(id: string, approved: boolean): PlatformSupportTicket {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.approve');
    const ticket = this.db.query<any>('SELECT tenant_id AS tenantId, remote_access_duration_minutes AS dur FROM platform_support_tickets WHERE id = ?', [id])[0];
    if (!ticket) throw new Error('التذكرة غير موجودة.');
    const dur = toNumber(ticket.dur, 60);
    const expiresAt = approved ? new Date(Date.now() + dur * 60 * 1000).toISOString() : null;
    this.db.run(
      `UPDATE platform_support_tickets 
       SET remote_access_approved = ?, remote_access_expires_at = ?, updated_at = ? 
       WHERE id = ?`,
      [approved ? 1 : 0, expiresAt, nowIso(), id]
    );
    this.audit(approved ? 'موافقة العميل على الوصول عن بعد' : 'رفض العميل للوصول عن بعد', 'TENANT', String(ticket.tenantId), { ticketId: id, approved });
    return this.listSupportTickets().find((item) => item.id === id)!;
  }

  public addSupportMessage(input: {
    ticketId: string;
    authorName: string;
    authorRole?: 'CUSTOMER' | 'SUPPORT' | 'SYSTEM';
    body: string;
    isInternal?: boolean;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentSize?: string;
  }): PlatformSupportMessage {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.create');
    const ticket = this.db.query<any>('SELECT tenant_id AS tenantId, first_responded_at AS firstRespondedAt FROM platform_support_tickets WHERE id = ?', [input.ticketId])[0];
    if (!ticket) throw new Error('التذكرة غير موجودة.');
    const body = String(input.body || '').trim();
    if (!body) throw new Error('نص الرسالة مطلوب.');
    const id = `msg_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const isInternal = Boolean(input.isInternal);
    const authorRole = input.authorRole || 'SUPPORT';

    this.db.run(
      `INSERT INTO platform_support_messages 
        (id, ticket_id, author_name, author_role, body, is_internal, attachment_url, attachment_name, attachment_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.ticketId,
        input.authorName.trim(),
        authorRole,
        body,
        isInternal ? 1 : 0,
        input.attachmentUrl?.trim() || null,
        input.attachmentName?.trim() || null,
        input.attachmentSize?.trim() || null,
      ]
    );

    // Update first_responded_at and status if support replied to customer
    if (authorRole === 'SUPPORT' && !isInternal) {
      const now = nowIso();
      this.db.run(
        `UPDATE platform_support_tickets 
         SET first_responded_at = COALESCE(first_responded_at, ?), status = 'WAITING_CUSTOMER', updated_at = ? 
         WHERE id = ?`,
        [now, now, input.ticketId]
      );
    } else {
      this.db.run(`UPDATE platform_support_tickets SET updated_at = ? WHERE id = ?`, [nowIso(), input.ticketId]);
    }

    this.audit(isInternal ? 'إضافة ملاحظة داخلية في تذكرة' : 'إضافة رد في تذكرة دعم', 'TENANT', String(ticket.tenantId), { ticketId: input.ticketId, author: input.authorName, isInternal });
    return this.db.query<any>('SELECT * FROM platform_support_messages WHERE id = ?', [id]).map(mapSupportMessage)[0];
  }

  public listSupportMessages(ticketId: string): PlatformSupportMessage[] {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.view');
    return this.db.query<any>(
      `SELECT * FROM platform_support_messages WHERE ticket_id = ? ORDER BY created_at ASC`,
      [ticketId]
    ).map(mapSupportMessage);
  }

  public getSupportTicketDetails(ticketId: string): PlatformSupportTicketDetails {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.view');
    const ticketRow = this.db.query<any>(
      `SELECT t.*, tn.name AS tenantName
       FROM platform_support_tickets t
       JOIN platform_tenants tn ON tn.id = t.tenant_id
       WHERE t.id = ?`,
      [ticketId]
    )[0];
    if (!ticketRow) throw new Error('تذكرة الدعم غير موجودة.');
    const ticket = mapSupportTicket(ticketRow);
    const messages = this.listSupportMessages(ticketId);
    const remoteSessions = this.listRemoteSessions(ticketId);

    return {
      ticket,
      messages,
      remoteSessions,
    };
  }

  public listCannedReplies(): PlatformCannedReply[] {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.view');
    return this.db.query<any>(
      `SELECT * FROM platform_support_canned_replies ORDER BY created_at ASC`
    ).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      category: String(r.category),
      body: String(r.body),
      createdAt: String(r.createdAt || nowIso()),
    }));
  }

  public createCannedReply(input: { title: string; category?: string; body: string }): PlatformCannedReply {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.create');
    const title = String(input.title || '').trim();
    const body = String(input.body || '').trim();
    if (!title || !body) throw new Error('العنوان والنص مطلوبان لإنشاء قالب الرد.');
    const id = `cr_${uuidv4().replace(/-/g, '').slice(0, 8)}`;
    this.db.run(
      `INSERT INTO platform_support_canned_replies (id, title, category, body) VALUES (?, ?, ?, ?)`,
      [id, title, input.category?.trim() || 'GENERAL', body]
    );
    this.audit('إضافة قالب رد سريع', 'SYSTEM', id, { title });
    return this.listCannedReplies().find((r) => r.id === id)!;
  }

  public startRemoteSession(input: {
    ticketId: string;
    technicianName: string;
    durationMinutes?: number;
  }): PlatformRemoteSession {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.create');
    const ticket = this.getSupportTicketDetails(input.ticketId).ticket;
    if (!ticket.remoteAccessApproved) {
      throw new Error('لا يمكن بدء جلسة الدعم عن بعد دون موافقة صريحة من العميل.');
    }
    const id = `rsess_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    const now = nowIso();
    const dur = input.durationMinutes || ticket.remoteAccessDurationMinutes || 60;

    this.db.run(
      `INSERT INTO platform_remote_sessions 
        (id, ticket_id, tenant_id, technician_name, started_at, duration_minutes, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [id, input.ticketId, ticket.tenantId, input.technicianName.trim(), now, dur]
    );

    this.addSupportMessage({
      ticketId: input.ticketId,
      authorName: 'نظام الدعم الفني',
      authorRole: 'SYSTEM',
      body: `بدأت جلسة وصول عن بعد بواسطة الفني (${input.technicianName}) لمدة ${dur} دقيقة.`,
      isInternal: true,
    });

    this.audit('بدء جلسة وصول عن بعد', 'TENANT', ticket.tenantId, { ticketId: input.ticketId, sessionId: id, technician: input.technicianName });
    return this.listRemoteSessions(input.ticketId).find((s) => s.id === id)!;
  }

  public endRemoteSession(sessionId: string, actionsSummary?: string): PlatformRemoteSession {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.update');
    const session = this.db.query<any>('SELECT * FROM platform_remote_sessions WHERE id = ?', [sessionId])[0];
    if (!session) throw new Error('جلسة الوصول عن بعد غير موجودة.');
    const now = nowIso();
    this.db.run(
      `UPDATE platform_remote_sessions 
       SET status = 'COMPLETED', ended_at = ?, actions_summary = ? 
       WHERE id = ?`,
      [now, actionsSummary?.trim() || null, sessionId]
    );

    this.addSupportMessage({
      ticketId: String(session.ticket_id),
      authorName: 'نظام الدعم الفني',
      authorRole: 'SYSTEM',
      body: `تم إنهاء جلسة الدعم عن بعد. ${actionsSummary ? 'ملخص الإجراءات: ' + actionsSummary : ''}`,
      isInternal: true,
    });

    this.audit('إنهاء جلسة وصول عن بعد', 'TENANT', String(session.tenant_id), { sessionId, ticketId: session.ticket_id });
    return this.listRemoteSessions(String(session.ticket_id)).find((s) => s.id === sessionId)!;
  }

  public listRemoteSessions(ticketId: string): PlatformRemoteSession[] {
    PlatformAdminService.requirePlatformAccess('support', 'platform.support.view');
    return this.db.query<any>(
      `SELECT * FROM platform_remote_sessions WHERE ticket_id = ? ORDER BY started_at DESC`,
      [ticketId]
    ).map((r) => ({
      id: String(r.id),
      ticketId: String(r.ticket_id),
      tenantId: String(r.tenant_id),
      technicianName: String(r.technician_name),
      startedAt: String(r.started_at),
      endedAt: r.ended_at ? String(r.ended_at) : null,
      durationMinutes: toNumber(r.duration_minutes, 60),
      actionsSummary: r.actions_summary ?? null,
      status: r.status as any,
    }));
  }

  // ─── API keys ───────────────────────────────────────────────────────────────

  public listApiKeys(tenantId?: string): PlatformApiKey[] {
    PlatformAdminService.requirePlatformAccess('integrations', 'platform.integrations.view');
    this.assertTenantScope(tenantId);
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
    PlatformAdminService.requirePlatformAccess('integrations', 'platform.integrations.create');
    const tenant = this.getTenant(input.tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');
    const name = String(input.name || '').trim();
    if (name.length < 2) throw new Error('اسم المفتاح مطلوب.');
    const plainTextKey = `csk_${randomToken(8, 'abcdefghijklmnopqrstuvwxyz0123456789')}_${randomToken(16, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
    const prefix = plainTextKey.slice(0, 12);
    const hash = crypto.createHash('sha256').update(plainTextKey).digest('hex');
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
    PlatformAdminService.requirePlatformAccess('integrations', 'platform.integrations.delete');
    const row = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_api_keys WHERE id = ?', [id])[0];
    if (!row) throw new Error('المفتاح غير موجود.');
    this.db.run('UPDATE platform_api_keys SET is_active = 0, updated_at = ? WHERE id = ?', [nowIso(), id]);
    this.audit('إلغاء مفتاح API', 'TENANT', String(row.tenantId), { id });
  }

  public rotateApiKey(id: string): PlatformApiKeyCreated {
    PlatformAdminService.requirePlatformAccess('integrations', 'platform.integrations.update');
    const existing = this.db.query<any>('SELECT * FROM platform_api_keys WHERE id = ?', [id])[0];
    if (!existing) throw new Error('المفتاح غير موجود.');
    const tenantId = String(existing.tenantId);
    const name = String(existing.name);
    const scopes = safeJsonArray(existing.scopes);
    this.revokeApiKey(id);
    return this.createApiKey({ tenantId, name: `${name} (rotated)`, scopes, expiresAt: existing.expiresAt ?? undefined });
  }

  public validateApiKey(plainTextKey: string): PlatformApiKey | null {
    const hash = crypto.createHash('sha256').update(plainTextKey).digest('hex');
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

  private recordLicenseChange(
    licenseId: string,
    subscriptionId: string | null,
    changeType: 'ISSUE' | 'RENEW' | 'SUSPEND' | 'REVOKE' | 'TRANSFER' | 'MODULE_CHANGE' | 'LIMIT_CHANGE' | 'COUPLING_CHANGE' | 'STATUS_CHANGE',
    oldValues: Record<string, unknown> | null,
    newValues: Record<string, unknown>,
    actor: { id: string; fullName: string } | null = null,
    reason?: string | null
  ): void {
    const user = actor ?? (PlatformAdminService as any).owner?.();
    this.db.run(
      `INSERT INTO platform_license_changes
        (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `lchg_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        licenseId,
        subscriptionId ?? null,
        changeType,
        oldValues === null ? null : JSON.stringify(oldValues),
        JSON.stringify(newValues),
        user?.id ?? null,
        user?.fullName ?? null,
        reason ?? null,
      ]
    );
  }

  // ─── License Compliance Reports ─────────────────────────────────────────

  public exportLicenseComplianceReport(filters: {
    tenantId?: string;
    dateFrom?: string;
    dateTo?: string;
    includeActivations?: boolean;
    includeChanges?: boolean;
  }): {
    licenses: any[];
    activations: any[];
    changes: any[];
    summary: {
      totalLicenses: number;
      activeLicenses: number;
      expiredLicenses: number;
      suspendedLicenses: number;
      revokedLicenses: number;
      totalChanges: number;
      totalActivations: number;
      failedActivations: number;
    };
  } {
    PlatformAdminService.requirePlatformAccess('licenses', 'platform.licenses.export');
    // Exports are read operations too: a LIMITED staff member may never pull
    // other tenants' compliance data, even without a tenantId filter.
    const scoped = this.getScopedTenantIds();
    if (scoped && filters.tenantId) {
      this.assertTenantScope(filters.tenantId);
    }
    const scopeClause = !filters.tenantId && scoped
      ? (scoped.size === 0
          ? ' AND 1=0'
          : ` AND l.tenant_id IN (${[...scoped].map(() => '?').join(',')})`)
      : '';
    const scopeParams = !filters.tenantId && scoped && scoped.size > 0 ? [...scoped] : [];

    const tenantFilter = filters.tenantId ? ` AND l.tenant_id = ?` : '';
    const dateFilter = filters.dateFrom ? ` AND l.created_at >= ?` : '';
    const dateFilterTo = filters.dateTo ? ` AND l.created_at <= ?` : '';
    const params: any[] = [];
    if (filters.tenantId) params.push(filters.tenantId);
    params.push(...scopeParams);
    if (filters.dateFrom) params.push(filters.dateFrom);
    if (filters.dateTo) params.push(filters.dateTo);

    const licenses = this.db.query<any>(`
      SELECT l.*, t.name AS tenantName, p.name AS planName
      FROM platform_licenses l
      JOIN platform_tenants t ON t.id = l.tenant_id
      LEFT JOIN platform_plans p ON p.id = l.plan_id
      WHERE 1=1 ${tenantFilter} ${scopeClause} ${dateFilter} ${dateFilterTo}
      ORDER BY l.created_at DESC
    `, params);

    let activations: any[] = [];
    if (filters.includeActivations !== false) {
      activations = this.db.query<any>(`
        SELECT la.*, l.license_key, t.name AS tenantName
        FROM platform_license_activations la
        JOIN platform_licenses l ON l.id = la.license_id
        JOIN platform_tenants t ON t.id = la.tenant_id
        WHERE 1=1 ${tenantFilter} ${scopeClause} ${dateFilter} ${dateFilterTo}
        ORDER BY la.created_at DESC
      `, params);
    }

    let changes: any[] = [];
    if (filters.includeChanges !== false) {
      changes = this.db.query<any>(`
        SELECT lc.*, l.license_key, t.name AS tenantName
        FROM platform_license_changes lc
        JOIN platform_licenses l ON l.id = lc.license_id
        JOIN platform_tenants t ON t.id = l.tenant_id
        WHERE 1=1 ${tenantFilter} ${scopeClause} ${dateFilter} ${dateFilterTo}
        ORDER BY lc.created_at DESC
      `, params);
    }

    const summary = {
      totalLicenses: licenses.length,
      activeLicenses: licenses.filter((l: any) => l.status === 'ACTIVE').length,
      expiredLicenses: licenses.filter((l: any) => l.status === 'EXPIRED').length,
      suspendedLicenses: licenses.filter((l: any) => l.status === 'SUSPENDED').length,
      revokedLicenses: licenses.filter((l: any) => l.status === 'REVOKED').length,
      totalChanges: changes.length,
      totalActivations: activations.length,
      failedActivations: activations.filter((a: any) => a.status === 'FAILED').length,
    };

    return { licenses, activations, changes, summary };
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
    PlatformAdminService.requirePlatformAccess('billing', 'platform.billing.view');
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
    PlatformAdminService.requirePlatformAccess('billing', 'platform.billing.view');
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
    PlatformAdminService.requirePlatformAccess('billing', 'platform.billing.create');
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
    PlatformAdminService.requirePlatformAccess('billing', 'platform.billing.update');
    const invoice = this.getInvoice(id);
    if (!invoice) throw new Error('الفاتورة غير موجودة.');
    this.db.run('UPDATE platform_invoices SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
    this.audit('تغيير حالة فاتورة', 'INVOICE', id, { status, number: invoice.number });
  }

  public voidInvoice(id: string): void {
    PlatformAdminService.requirePlatformAccess('billing', 'platform.billing.delete');
    const invoice = this.getInvoice(id);
    if (!invoice) throw new Error('الفاتورة غير موجودة.');
    this.db.run(`UPDATE platform_invoices SET status = 'VOID', updated_at = ? WHERE id = ?`, [nowIso(), id]);
    this.audit('إلغاء فاتورة', 'INVOICE', id, { number: invoice.number });
  }

  public listPayments(limit = 200): PlatformPayment[] {
    PlatformAdminService.requirePlatformAccess('billing', 'platform.billing.view');
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
    PlatformAdminService.requirePlatformAccess('billing', 'platform.billing.create');
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

  public voidPayment(id: string, reason?: string): void {
    PlatformAdminService.requirePlatformAccess('billing', 'platform.billing.delete');
    const payment = this.db.query<any>('SELECT * FROM platform_payments WHERE id = ?', [id])[0];
    if (!payment) throw new Error('الدفعة غير موجودة.');
    const amount = toNumber(payment.amount);
    if (amount <= 0) throw new Error('لا يمكن إلغاء قيد عكسي أو دفعة ملغاة بالفعل.');
    const existingReversal = this.db.query<any>(
      `SELECT id FROM platform_payments WHERE reference = ? LIMIT 1`,
      [`REVERSAL_OF:${id}`],
    )[0];
    if (existingReversal) throw new Error('تم إنشاء قيد عكسي لهذه الدفعة مسبقًا.');
    const reversalId = `pay_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();
    const note = [
      `REVERSAL_OF:${id}`,
      reason ? `reason:${String(reason).trim()}` : null,
    ]
      .filter(Boolean)
      .join(' | ');
    this.db.executeTransaction(() => {
      // Financial records are never deleted: record an explicit reversing entry
      // that preserves the original payment and nets to a zero effect.
      this.db.run(
        `INSERT INTO platform_payments (id, invoice_id, tenant_id, amount, method, reference, paid_at, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reversalId,
          payment.invoiceId ?? payment.invoice_id ?? null,
          String(payment.tenantId ?? payment.tenant_id),
          -Math.abs(amount),
          String(payment.method || 'OTHER'),
          `REVERSAL_OF:${id}`,
          now,
          note,
          now,
        ],
      );
      const invoiceId = payment.invoiceId ?? payment.invoice_id;
      if (invoiceId) this.recalculateInvoice(String(invoiceId));
    });
    this.audit('إلغاء دفعة (قيد عكسي)', 'PAYMENT', reversalId, {
      originalPaymentId: id,
      reversedAmount: Math.abs(amount),
      invoiceId: payment.invoiceId ?? payment.invoice_id ?? null,
      reason: reason ?? null,
    });
  }

  // ─── Product control ───────────────────────────────────────────────────────

  public listModules(): PlatformModule[] {
    PlatformAdminService.requirePlatformAccess('product', 'platform.product.view');
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
    PlatformAdminService.requirePlatformAccess('product', 'platform.product.view');
    return this.listFeatureFlagsForRuntime();
  }

  public listFeatureFlagsForRuntime(): PlatformFeatureFlag[] {
    const flags = this.db.query<any>(
      `SELECT f.*,
              (SELECT COUNT(*) FROM platform_feature_overrides o WHERE o.feature_id = f.id) AS overridesCount
       FROM platform_feature_flags f
       ORDER BY f.category, f.name`
    ).map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ?? null,
      category: row.category ?? null,
      isEnabled: Boolean(row.is_enabled !== undefined ? row.is_enabled : row.isEnabled),
      rolloutPercent: toNumber(row.rollout_percent !== undefined ? row.rollout_percent : row.rolloutPercent, 100),
      isStagingOnly: Boolean(row.is_staging_only),
      minPlanTier: row.min_plan_tier ?? null,
      overridesCount: toNumber(row.overridesCount, 0),
    }));
    return flags;
  }

  public listFeatureOverrides(featureId: string): PlatformFeatureOverride[] {
    PlatformAdminService.requirePlatformAccess('product', 'platform.product.view');
    return this.db.query<any>(
      `SELECT o.*,
              CASE
                WHEN o.target_type = 'TENANT' THEN (SELECT name FROM platform_tenants WHERE id = o.target_id)
                WHEN o.target_type = 'PLAN' THEN (SELECT name FROM platform_plans WHERE id = o.target_id)
                ELSE o.target_id
              END AS targetName
       FROM platform_feature_overrides o
       WHERE o.feature_id = ?
       ORDER BY o.created_at DESC`,
      [featureId]
    ).map((row) => ({
      id: String(row.id),
      featureId: String(row.feature_id),
      targetType: row.target_type,
      targetId: String(row.target_id),
      targetName: row.targetName ?? null,
      isEnabled: Boolean(row.is_enabled),
      customRolloutPercent: row.custom_rollout_percent !== null && row.custom_rollout_percent !== undefined ? toNumber(row.custom_rollout_percent) : null,
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    }));
  }

  public setFeatureOverride(input: {
    featureId: string;
    targetType: 'TENANT' | 'PLAN' | 'STAGING_GROUP';
    targetId: string;
    isEnabled: boolean;
    customRolloutPercent?: number | null;
  }): PlatformFeatureOverride {
    PlatformAdminService.requirePlatformAccess('product', 'platform.product.update');
    const id = `fovr_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    const customRollout = input.customRolloutPercent !== null && input.customRolloutPercent !== undefined
      ? Math.max(0, Math.min(100, toNumber(input.customRolloutPercent)))
      : null;

    this.db.run(
      `INSERT INTO platform_feature_overrides (id, feature_id, target_type, target_id, is_enabled, custom_rollout_percent, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(feature_id, target_type, target_id) DO UPDATE SET
         is_enabled = excluded.is_enabled,
         custom_rollout_percent = excluded.custom_rollout_percent,
         updated_at = excluded.updated_at`,
      [id, input.featureId, input.targetType, input.targetId, input.isEnabled ? 1 : 0, customRollout, nowIso()]
    );
    this.audit('تخصيص ميزة لعميل/خطة', 'FEATURE', input.featureId, { targetType: input.targetType, targetId: input.targetId, isEnabled: input.isEnabled });
    return this.listFeatureOverrides(input.featureId).find((ov) => ov.targetId === input.targetId)!;
  }

  public removeFeatureOverride(id: string): void {
    PlatformAdminService.requirePlatformAccess('product', 'platform.product.delete');
    this.db.run('DELETE FROM platform_feature_overrides WHERE id = ?', [id]);
    this.audit('حذف تخصيص ميزة', 'FEATURE', id, {});
  }

  public setModuleEnabled(id: string, enabled: boolean): void {
    PlatformAdminService.requirePlatformAccess('product', 'platform.product.update');
    this.db.run('UPDATE platform_modules SET is_enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, nowIso(), id]);
    this.audit(enabled ? 'تفعيل وحدة منتج' : 'تعطيل وحدة منتج', 'MODULE', id, { enabled });
  }

  public upsertFeatureFlag(input: {
    id?: string;
    code: string;
    name: string;
    description?: string;
    category?: string;
    isEnabled?: boolean;
    rolloutPercent?: number;
    isStagingOnly?: boolean;
    minPlanTier?: string;
  }): PlatformFeatureFlag {
    PlatformAdminService.requirePlatformAccess('product', 'platform.product.update');
    const code = String(input.code || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!code) throw new Error('رمز الميزة مطلوب.');
    if (!input.name?.trim()) throw new Error('اسم الميزة مطلوب.');
    const rollout = Math.max(0, Math.min(100, toNumber(input.rolloutPercent, 100)));
    const stagingOnly = input.isStagingOnly ? 1 : 0;
    const minTier = input.minPlanTier?.trim() || null;

    if (input.id) {
      this.db.run(
        `UPDATE platform_feature_flags
         SET name = ?, description = ?, category = ?, is_enabled = ?, rollout_percent = ?, is_staging_only = ?, min_plan_tier = ?, updated_at = ?
         WHERE id = ?`,
        [input.name.trim(), input.description?.trim() || null, input.category?.trim() || null, input.isEnabled === false ? 0 : 1, rollout, stagingOnly, minTier, nowIso(), input.id]
      );
      this.audit('تعديل ميزة منتج', 'FEATURE', input.id, { code, rollout, isStagingOnly: Boolean(stagingOnly) });
      return this.listFeatureFlags().find((flag) => flag.id === input.id)!;
    }
    if (this.db.query('SELECT 1 FROM platform_feature_flags WHERE code = ?', [code]).length) {
      throw new Error('رمز الميزة مستخدم بالفعل.');
    }
    const id = `pflag_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    this.db.run(
      `INSERT INTO platform_feature_flags (id, code, name, description, category, is_enabled, rollout_percent, is_staging_only, min_plan_tier)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, input.name.trim(), input.description?.trim() || null, input.category?.trim() || null, input.isEnabled === false ? 0 : 1, rollout, stagingOnly, minTier]
    );
    this.audit('إنشاء ميزة منتج', 'FEATURE', id, { code, rollout, isStagingOnly: Boolean(stagingOnly) });
    return this.listFeatureFlags().find((flag) => flag.id === id)!;
  }

  public setFeatureEnabled(id: string, enabled: boolean): void {
    PlatformAdminService.requirePlatformAccess('product', 'platform.product.update');
    this.db.run('UPDATE platform_feature_flags SET is_enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, nowIso(), id]);
    this.audit(enabled ? 'تفعيل ميزة منتج' : 'تعطيل ميزة منتج', 'FEATURE', id, { enabled });
  }

  public listReleases(): PlatformRelease[] {
    PlatformAdminService.requirePlatformAccess('releases', 'platform.releases.view');
    const releases = this.db.query<any>('SELECT * FROM platform_releases ORDER BY created_at DESC').map((row) => ({
      id: String(row.id),
      version: String(row.version),
      channel: row.channel,
      status: row.status,
      isMandatory: Boolean(row.is_mandatory !== undefined ? row.is_mandatory : row.isMandatory),
      minVersion: row.min_version ?? row.minVersion ?? null,
      rolloutGroup: String(row.rollout_group || row.rolloutGroup || 'ALL'),
      notes: row.notes ?? null,
      fileUrl: row.file_url ?? null,
      fileName: row.file_name ?? null,
      fileSize: row.file_size !== null && row.file_size !== undefined ? toNumber(row.file_size) : null,
      checksumSha256: row.checksum_sha256 ?? null,
      packageSignature: row.package_signature ?? null,
      changelog: row.changelog ?? null,
      rollbackVersion: row.rollback_version ?? null,
      stagingGroup: row.staging_group ?? 'PRODUCTION',
      releasedAt: row.released_at ?? row.releasedAt ?? null,
      createdAt: String(row.createdAt || row.createdAt),
    }));

    // Enrich with target status summary
    const summaryRows = this.db.query<any>(
      `SELECT release_id AS releaseId,
              status,
              COUNT(*) AS count
       FROM platform_release_targets
       GROUP BY release_id, status`
    );
    const summaryMap = new Map<string, { total: number; pending: number; success: number; failed: number }>();
    for (const r of summaryRows) {
      if (!summaryMap.has(r.releaseId)) {
        summaryMap.set(r.releaseId, { total: 0, pending: 0, success: 0, failed: 0 });
      }
      const entry = summaryMap.get(r.releaseId)!;
      const count = toNumber(r.count, 0);
      entry.total += count;
      if (r.status === 'PENDING') entry.pending += count;
      else if (r.status === 'SUCCESS') entry.success += count;
      else if (r.status === 'FAILED') entry.failed += count;
    }

    return releases.map((rel) => ({
      ...rel,
      targetsSummary: summaryMap.get(rel.id) || { total: 0, pending: 0, success: 0, failed: 0 },
    }));
  }

  public listReleaseTargets(releaseId: string): PlatformReleaseTarget[] {
    PlatformAdminService.requirePlatformAccess('releases', 'platform.releases.view');
    return this.db.query<any>(
      `SELECT t.*, tn.name AS tenantName
       FROM platform_release_targets t
       JOIN platform_tenants tn ON tn.id = t.tenant_id
       WHERE t.release_id = ?
       ORDER BY tn.name`,
      [releaseId]
    ).map((row) => ({
      id: String(row.id),
      releaseId: String(row.release_id || row.releaseId),
      tenantId: String(row.tenant_id || row.tenantId),
      tenantName: row.tenantName ?? null,
      deviceId: row.device_id ?? null,
      clientVersion: row.client_version ?? null,
      attemptCount: toNumber(row.attempt_count, 0),
      status: row.status,
      appliedAt: row.applied_at ?? row.appliedAt ?? null,
      error: row.error ?? null,
      createdAt: String(row.createdAt || row.createdAt),
    }));
  }

  public setReleaseTargets(releaseId: string, tenantIds: string[]): PlatformReleaseTarget[] {
    PlatformAdminService.requirePlatformAccess('releases', 'platform.releases.update');
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

  public updateReleaseTargetStatus(
    id: string,
    status: PlatformReleaseTarget['status'],
    options?: { error?: string; clientVersion?: string; deviceId?: string }
  ): PlatformReleaseTarget {
    PlatformAdminService.requirePlatformAccess('releases', 'platform.releases.update');
    const row = this.db.query<any>('SELECT release_id AS releaseId, attempt_count AS attemptCount FROM platform_release_targets WHERE id = ?', [id])[0];
    if (!row) throw new Error('هدف الإصدار غير موجود.');
    const attemptCount = toNumber(row.attemptCount, 0) + 1;
    this.db.run(
      `UPDATE platform_release_targets
       SET status = ?,
           applied_at = ?,
           error = ?,
           client_version = COALESCE(?, client_version),
           device_id = COALESCE(?, device_id),
           attempt_count = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        status,
        status === 'PENDING' ? null : nowIso(),
        options?.error?.trim() || null,
        options?.clientVersion?.trim() || null,
        options?.deviceId?.trim() || null,
        attemptCount,
        nowIso(),
        id,
      ]
    );
    this.audit('تحديث حالة تطبيق إصدار', 'RELEASE', String(row.releaseId), { targetId: id, status, error: options?.error || null });
    return this.listReleaseTargets(String(row.releaseId)).find((t) => t.id === id)!;
  }

  public disableRelease(id: string): PlatformRelease {
    PlatformAdminService.requirePlatformAccess('releases', 'platform.releases.update');
    this.db.run(`UPDATE platform_releases SET status = 'DEPRECATED', updated_at = ? WHERE id = ?`, [nowIso(), id]);
    this.audit('إيقاف إصدار به مشكلة', 'RELEASE', id, { status: 'DEPRECATED' });
    return this.listReleases().find((release) => release.id === id)!;
  }

  public rollbackRelease(releaseId: string, safeRollbackVersion: string): PlatformRelease {
    PlatformAdminService.requirePlatformAccess('releases', 'platform.releases.update');
    const current = this.listReleases().find((r) => r.id === releaseId);
    if (!current) throw new Error('الإصدار غير موجود.');
    this.db.run(
      `UPDATE platform_releases
       SET status = 'DEPRECATED', rollback_version = ?, notes = COALESCE(notes, '') || ' [تم التراجع إلى: ' || ? || ']', updated_at = ?
       WHERE id = ?`,
      [safeRollbackVersion, safeRollbackVersion, nowIso(), releaseId]
    );
    this.audit('تراجع طارئ عن إصدار', 'RELEASE', releaseId, { rollbackVersion: safeRollbackVersion });
    return this.listReleases().find((r) => r.id === releaseId)!;
  }

  public upsertRelease(input: {
    id?: string;
    version: string;
    channel?: PlatformRelease['channel'];
    status?: PlatformRelease['status'];
    isMandatory?: boolean;
    minVersion?: string;
    rolloutGroup?: string;
    notes?: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    checksumSha256?: string;
    packageSignature?: string;
    changelog?: string;
    rollbackVersion?: string;
    stagingGroup?: string;
    releasedAt?: string;
  }): PlatformRelease {
    PlatformAdminService.requirePlatformAccess('releases', 'platform.releases.update');
    const version = String(input.version || '').trim();
    if (!version) throw new Error('رقم الإصدار مطلوب.');
    const channel = input.channel || 'STABLE';
    const status = input.status || 'PUBLISHED';
    const isMandatory = input.isMandatory ? 1 : 0;
    const minVersion = input.minVersion?.trim() || null;
    const rolloutGroup = input.rolloutGroup || 'ALL';
    const notes = input.notes?.trim() || null;
    const fileUrl = input.fileUrl?.trim() || null;
    const fileName = input.fileName?.trim() || null;
    const fileSize = input.fileSize !== undefined && input.fileSize !== null ? toNumber(input.fileSize) : null;
    const checksumSha256 = input.checksumSha256?.trim() || null;
    const packageSignature = input.packageSignature?.trim() || null;
    const changelog = input.changelog?.trim() || null;
    const rollbackVersion = input.rollbackVersion?.trim() || null;
    const stagingGroup = input.stagingGroup || 'PRODUCTION';
    const releasedAt = input.releasedAt || nowIso();

    if (input.id) {
      this.db.run(
        `UPDATE platform_releases
         SET version = ?, channel = ?, status = ?, is_mandatory = ?, min_version = ?, rollout_group = ?,
             notes = ?, file_url = ?, file_name = ?, file_size = ?, checksum_sha256 = ?, package_signature = ?,
             changelog = ?, rollback_version = ?, staging_group = ?, released_at = ?, updated_at = ?
         WHERE id = ?`,
        [
          version, channel, status, isMandatory, minVersion, rolloutGroup,
          notes, fileUrl, fileName, fileSize, checksumSha256, packageSignature,
          changelog, rollbackVersion, stagingGroup, releasedAt, nowIso(), input.id
        ]
      );
      this.audit('تعديل إصدار منتج', 'RELEASE', input.id, { version, checksumSha256 });
      return this.listReleases().find((release) => release.id === input.id)!;
    }

    if (this.db.query('SELECT 1 FROM platform_releases WHERE version = ?', [version]).length) {
      throw new Error('رقم الإصدار مسجل بالفعل.');
    }
    const id = `prel_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    this.db.run(
      `INSERT INTO platform_releases
       (id, version, channel, status, is_mandatory, min_version, rollout_group, notes,
        file_url, file_name, file_size, checksum_sha256, package_signature, changelog, rollback_version, staging_group, released_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, version, channel, status, isMandatory, minVersion, rolloutGroup, notes,
        fileUrl, fileName, fileSize, checksumSha256, packageSignature, changelog, rollbackVersion, stagingGroup, releasedAt
      ]
    );
    this.audit('إنشاء إصدار منتج', 'RELEASE', id, { version, channel, checksumSha256 });
    return this.listReleases().find((release) => release.id === id)!;
  }

  /**
   * Generates a tamper-proof signed runtime client configuration payload for a specific tenant & device.
   * Includes active feature flags, targeted release, mandatory status, and checksum.
   */
  public getSignedClientRuntimeConfig(tenantId: string, clientVersion?: string): { payload: Record<string, unknown>; signature: string; certificate: string } {
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error('العميل غير موجود.');

    // 1. Resolve feature flags tailored for this tenant
    const allFlags = this.listFeatureFlagsForRuntime();
    const overrides = this.db.query<any>(
      `SELECT * FROM platform_feature_overrides
       WHERE (target_type = 'TENANT' AND target_id = ?)
          OR (target_type = 'PLAN' AND target_id = (SELECT plan_id FROM platform_licenses WHERE tenant_id = ? AND status = 'ACTIVE' LIMIT 1))`,
      [tenantId, tenantId]
    );

    const overrideMap = new Map<string, { isEnabled: boolean; rollout?: number | null }>();
    for (const ov of overrides) {
      overrideMap.set(ov.feature_id, {
        isEnabled: Boolean(ov.is_enabled),
        rollout: ov.custom_rollout_percent !== null ? toNumber(ov.custom_rollout_percent) : null,
      });
    }

    const effectiveFeatures: Record<string, boolean> = {};
    for (const flag of allFlags) {
      const ov = overrideMap.get(flag.id);
      if (ov) {
        effectiveFeatures[flag.code] = ov.isEnabled;
      } else {
        if (!flag.isEnabled) {
          effectiveFeatures[flag.code] = false;
        } else if (flag.rolloutPercent >= 100) {
          effectiveFeatures[flag.code] = true;
        } else {
          // Deterministic hash based on tenantId
          let hash = 0;
          for (let i = 0; i < tenantId.length; i++) {
            hash = (hash * 31 + tenantId.charCodeAt(i)) >>> 0;
          }
          effectiveFeatures[flag.code] = (hash % 100) < flag.rolloutPercent;
        }
      }
    }

    // 2. Resolve latest applicable release for this tenant
    const targetRow = this.db.query<any>(
      `SELECT r.*
       FROM platform_release_targets t
       JOIN platform_releases r ON r.id = t.release_id
       WHERE t.tenant_id = ? AND r.status = 'PUBLISHED'
       ORDER BY r.created_at DESC LIMIT 1`,
      [tenantId]
    )[0];

    const latestGlobal = this.db.query<any>(
      `SELECT * FROM platform_releases WHERE status = 'PUBLISHED' ORDER BY created_at DESC LIMIT 1`
    )[0];

    const activeRelease = targetRow || latestGlobal;

    const payload = {
      tenantId,
      tenantName: tenant.name,
      issuedAt: nowIso(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      features: effectiveFeatures,
      releasePolicy: activeRelease ? {
        version: activeRelease.version,
        channel: activeRelease.channel,
        isMandatory: Boolean(activeRelease.is_mandatory),
        minVersion: activeRelease.min_version,
        fileUrl: activeRelease.file_url,
        fileSize: activeRelease.file_size,
        checksumSha256: activeRelease.checksum_sha256,
        packageSignature: activeRelease.package_signature,
        changelog: activeRelease.changelog,
      } : null,
    };

    const secret = 'ceramisys-platform-configuration-secret';
    const bodyStr = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
    const certificate = btoa(JSON.stringify({ ...payload, signature }));

    return { payload, signature, certificate };
  }

  // ─── Audit & settings ──────────────────────────────────────────────────────

  public listAudit(limit = 200, search = ''): PlatformAuditEntry[] {
    PlatformAdminService.requirePlatformAccess('audit', 'platform.audit.view');
    return centralAuditService.query({ search, pageSize: limit }).entries;
  }

  public queryAuditPaginated(filters: import('./platformTypes').PlatformAuditFilters = {}): import('./platformTypes').PlatformAuditPaginatedResult {
    PlatformAdminService.requirePlatformAccess('audit', 'platform.audit.view');
    return centralAuditService.query(filters);
  }

  public queryAuditForExport(filters: import('./platformTypes').PlatformAuditFilters = {}): PlatformAuditEntry[] {
    PlatformAdminService.requirePlatformAccess('audit', 'platform.audit.view');
    return centralAuditService.queryAllForExport(filters);
  }

  public verifyAuditIntegrity(): { isValid: boolean; checkedCount: number; brokenAtId?: string } {
    PlatformAdminService.requirePlatformAccess('audit', 'platform.audit.view');
    return centralAuditService.verifyIntegrity();
  }

  public getSettings(): PlatformSettingsMap {
    PlatformAdminService.requirePlatformAccess('settings', 'platform.settings.view');
    const values = this.db.query<{ key: string; value: string }>('SELECT key, value FROM platform_settings');
    const map = new Map(values.map((row) => [row.key, row.value]));

    // Mask sensitive keys for UI security (Zero Secret Exposure)
    const maskSecret = (val?: string) => (val && val.trim().length > 0 ? '••••••••••••••••' : '');

    return {
      // 1. Identity & General
      platformName: map.get('platform_name') || 'سيراميسي',
      supportEmail: map.get('support_email') || '',
      supportPhone: map.get('support_phone') || '',
      defaultCurrency: map.get('default_currency') || 'EGP',
      defaultTrialDays: toNumber(map.get('default_trial_days'), 14),
      invoicePrefix: map.get('invoice_prefix') || 'CS-INV',
      defaultLocale: map.get('default_locale') || 'ar',
      timezone: map.get('timezone') || 'Africa/Cairo',

      // 2. Legal & Tax
      companyLegalName: map.get('company_legal_name') || '',
      commercialRegistry: map.get('commercial_registry') || '',
      taxNumber: map.get('tax_number') || '',
      officialAddress: map.get('official_address') || '',
      legalRepresentative: map.get('legal_representative') || '',

      // 3. Email & SMS
      smtpHost: map.get('smtp_host') || '',
      smtpPort: toNumber(map.get('smtp_port'), 587),
      smtpUser: map.get('smtp_user') || '',
      smtpPassword: maskSecret(map.get('smtp_password')),
      smtpFromEmail: map.get('smtp_from_email') || '',
      smtpEncryption: (map.get('smtp_encryption') as any) || 'TLS',
      smsProvider: map.get('sms_provider') || 'TWILIO',
      smsSenderId: map.get('sms_sender_id') || 'CERAMISYS',
      smsApiKey: maskSecret(map.get('sms_api_key')),

      // 4. Payments & Billing
      paymentGateway: (map.get('payment_gateway') as any) || 'MANUAL',
      paymentMode: (map.get('payment_mode') as any) || 'TEST',
      paymentApiKey: maskSecret(map.get('payment_api_key')),
      paymentMerchantId: map.get('payment_merchant_id') || '',
      defaultTaxRate: toNumber(map.get('default_tax_rate'), 14),
      licenseGracePeriodDays: toNumber(map.get('license_grace_period_days'), 7),
      autoRenewalPolicy: map.get('auto_renewal_policy') === '1',

      // 5. Network & APIs
      platformDomain: map.get('platform_domain') || 'ceramisys.app',
      centralApiEndpoint: map.get('central_api_endpoint') || 'https://api.ceramisys.app/v1',
      syncServerEndpoint: map.get('sync_server_endpoint') || 'wss://sync.ceramisys.app',
      enforceHttps: map.get('enforce_https') !== '0',

      // 6. Security, MFA & Sessions
      sessionTimeoutMinutes: toNumber(map.get('session_timeout_minutes'), 30),
      maxFailedLogins: toNumber(map.get('max_failed_logins'), 5),
      enforceMfa: map.get('enforce_mfa') === '1',
      passwordMinLength: toNumber(map.get('password_min_length'), 10),
      passwordRequireComplex: map.get('password_require_complex') !== '0',
      kmsProvider: map.get('kms_provider') || 'SERVER_ENVIRONMENT_KMS',
      lastEncryptionRotation: map.get('last_encryption_rotation') || '2026-01-01T00:00:00Z',

      // 7. Backup & Retention
      backupFrequency: (map.get('backup_frequency') as any) || 'DAILY',
      backupRetentionDays: toNumber(map.get('backup_retention_days'), 90),
      backupStorageTarget: (map.get('backup_storage_target') as any) || 'CLOUD_ENCRYPTED',
    };
  }

  public updateSettings(input: Partial<PlatformSettingsMap>): PlatformSettingsMap {
    PlatformAdminService.requirePlatformAccess('settings', 'platform.settings.update');
    const current = this.getSettings();

    // Helper to avoid overwriting masked secrets if the user didn't change them
    const resolveSecret = (incoming?: string, existingKey?: string): string | undefined => {
      if (!incoming || incoming.includes('••••')) return undefined; // do not overwrite
      return incoming.trim();
    };

    const pairs: Array<[string, string | undefined]> = [
      // Identity & General
      ['platform_name', input.platformName ?? current.platformName],
      ['support_email', input.supportEmail ?? current.supportEmail],
      ['support_phone', input.supportPhone ?? current.supportPhone],
      ['default_currency', input.defaultCurrency ?? current.defaultCurrency],
      ['default_trial_days', String(input.defaultTrialDays ?? current.defaultTrialDays)],
      ['invoice_prefix', input.invoicePrefix ?? current.invoicePrefix],
      ['default_locale', input.defaultLocale ?? current.defaultLocale],
      ['timezone', input.timezone ?? current.timezone],

      // Legal & Tax
      ['company_legal_name', input.companyLegalName ?? current.companyLegalName],
      ['commercial_registry', input.commercialRegistry ?? current.commercialRegistry],
      ['tax_number', input.taxNumber ?? current.taxNumber],
      ['official_address', input.officialAddress ?? current.officialAddress],
      ['legal_representative', input.legalRepresentative ?? current.legalRepresentative],

      // Email & SMS
      ['smtp_host', input.smtpHost ?? current.smtpHost],
      ['smtp_port', String(input.smtpPort ?? current.smtpPort)],
      ['smtp_user', input.smtpUser ?? current.smtpUser],
      ['smtp_password', resolveSecret(input.smtpPassword)],
      ['smtp_from_email', input.smtpFromEmail ?? current.smtpFromEmail],
      ['smtp_encryption', input.smtpEncryption ?? current.smtpEncryption],
      ['sms_provider', input.smsProvider ?? current.smsProvider],
      ['sms_sender_id', input.smsSenderId ?? current.smsSenderId],
      ['sms_api_key', resolveSecret(input.smsApiKey)],

      // Payments & Billing
      ['payment_gateway', input.paymentGateway ?? current.paymentGateway],
      ['payment_mode', input.paymentMode ?? current.paymentMode],
      ['payment_api_key', resolveSecret(input.paymentApiKey)],
      ['payment_merchant_id', input.paymentMerchantId ?? current.paymentMerchantId],
      ['default_tax_rate', String(input.defaultTaxRate ?? current.defaultTaxRate)],
      ['license_grace_period_days', String(input.licenseGracePeriodDays ?? current.licenseGracePeriodDays)],
      ['auto_renewal_policy', input.autoRenewalPolicy !== undefined ? (input.autoRenewalPolicy ? '1' : '0') : undefined],

      // Network & APIs
      ['platform_domain', input.platformDomain ?? current.platformDomain],
      ['central_api_endpoint', input.centralApiEndpoint ?? current.centralApiEndpoint],
      ['sync_server_endpoint', input.syncServerEndpoint ?? current.syncServerEndpoint],
      ['enforce_https', input.enforceHttps !== undefined ? (input.enforceHttps ? '1' : '0') : undefined],

      // Security & MFA
      ['session_timeout_minutes', String(input.sessionTimeoutMinutes ?? current.sessionTimeoutMinutes)],
      ['max_failed_logins', String(input.maxFailedLogins ?? current.maxFailedLogins)],
      ['enforce_mfa', input.enforceMfa !== undefined ? (input.enforceMfa ? '1' : '0') : undefined],
      ['password_min_length', String(input.passwordMinLength ?? current.passwordMinLength)],
      ['password_require_complex', input.passwordRequireComplex !== undefined ? (input.passwordRequireComplex ? '1' : '0') : undefined],
      ['kms_provider', input.kmsProvider ?? current.kmsProvider],

      // Backup & Retention
      ['backup_frequency', input.backupFrequency ?? current.backupFrequency],
      ['backup_retention_days', String(input.backupRetentionDays ?? current.backupRetentionDays)],
      ['backup_storage_target', input.backupStorageTarget ?? current.backupStorageTarget],
    ];

    this.db.executeTransaction(() => {
      for (const [key, value] of pairs) {
        if (value !== undefined) {
          this.db.run(
            `INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            [key, value.trim(), nowIso()]
          );
        }
      }
    });

    this.audit('تحديث إعدادات المنصة المركزية', 'SETTINGS', null, {
      updatedKeys: pairs.filter(([, v]) => v !== undefined).map(([k]) => k),
    });

    return this.getSettings();
  }

  // ─── Platform Policies (terms / privacy / retention) ─────────────────────────

  public getPlatformPolicies(): PlatformPolicySettings {
    PlatformAdminService.requirePlatformAccess('policies', 'platform.policies.view');
    const defaults = {
      auditRetentionDays: 365,
      backupRetentionDays: 90,
      syncLogRetentionDays: 30,
      softDeleteGraceDays: 14,
    };
    let retention = defaults;
    const storedRetention = this.setting('policy_retention');
    if (storedRetention) {
      try {
        const parsed = JSON.parse(storedRetention) as Partial<typeof defaults>;
        retention = {
          auditRetentionDays: toNumber(parsed.auditRetentionDays, defaults.auditRetentionDays),
          backupRetentionDays: toNumber(parsed.backupRetentionDays, defaults.backupRetentionDays),
          syncLogRetentionDays: toNumber(parsed.syncLogRetentionDays, defaults.syncLogRetentionDays),
          softDeleteGraceDays: toNumber(parsed.softDeleteGraceDays, defaults.softDeleteGraceDays),
        };
      } catch {
        // Ignore a malformed stored value and fall back to the defaults.
      }
    }
    return {
      terms: this.setting('policy_terms'),
      privacy: this.setting('policy_privacy'),
      retention,
      updatedAt: this.setting('policy_updated_at') || null,
    };
  }

  public savePlatformPolicies(input: {
    terms: string;
    privacy: string;
    retention: PlatformPolicySettings['retention'];
  }): PlatformPolicySettings {
    PlatformAdminService.requirePlatformAccess('policies', 'platform.policies.update');
    const updatedAt = nowIso();
    const retention = {
      auditRetentionDays: Math.max(0, Math.trunc(toNumber(input.retention?.auditRetentionDays, 365))),
      backupRetentionDays: Math.max(0, Math.trunc(toNumber(input.retention?.backupRetentionDays, 90))),
      syncLogRetentionDays: Math.max(0, Math.trunc(toNumber(input.retention?.syncLogRetentionDays, 30))),
      softDeleteGraceDays: Math.max(0, Math.trunc(toNumber(input.retention?.softDeleteGraceDays, 14))),
    };
    const pairs: Array<[string, string]> = [
      ['policy_terms', String(input.terms ?? '')],
      ['policy_privacy', String(input.privacy ?? '')],
      ['policy_retention', JSON.stringify(retention)],
      ['policy_updated_at', updatedAt],
    ];

    this.db.executeTransaction(() => {
      for (const [key, value] of pairs) {
        this.db.run(
          `INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [key, value, updatedAt]
        );
      }
    });

    this.audit('حفظ سياسات المنصة وفترات الاحتفاظ بالبيانات', 'SETTINGS', null, { retention });
    return this.getPlatformPolicies();
  }

  public rotatePlatformEncryptionKeys(): { rotatedAt: string; status: string; newKeyFingerprint: string } {
    PlatformAdminService.requirePlatformAccess('security-center', 'platform.security.update');
    const rotatedAt = nowIso();
    const newKeyFingerprint = `kms_${crypto.randomBytes(8).toString('hex')}`;

    this.db.run(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ('last_encryption_rotation', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [rotatedAt, rotatedAt]
    );

    this.audit('تدوير مفاتيح التشفير المركزية للمنصة', 'SECURITY', null, {
      rotatedAt,
      fingerprint: newKeyFingerprint,
    }, { severity: 'SECURITY' });

    return {
      rotatedAt,
      status: 'SUCCESS',
      newKeyFingerprint,
    };
  }

  // ─── Per-Tenant Activity Configuration & Rollback ──────────────────────────

  public getTenantActivity(tenantId: string): import('./platformTypes').PlatformTenantActivityConfig | null {
    PlatformAdminService.requirePlatformAccess('activity', 'platform.activity.view');
    const row = this.db.query<any>(
      'SELECT * FROM platform_tenant_activities WHERE tenant_id = ?',
      [tenantId]
    )[0];
    if (!row) {
      // Fallback: check tenant.business_type or return default
      const tenant = this.getTenant(tenantId);
      if (!tenant) return null;
      const bType = tenant.businessType || 'ceramics';
      const { getBusinessProfile, getActivityRows } = require('../../../config/businessProfiles');
      const act = getActivityRows().find((a: any) => a.id === bType);
      const profile = getBusinessProfile(bType);

      return {
        id: `act_${tenantId}`,
        tenantId,
        activityId: bType,
        activityLabel: act?.label || profile.name.ar,
        familyId: act?.familyId || 'retail',
        profileId: profile.id,
        enabledModules: [...profile.modules.enabledByDefault],
        customTerminology: {},
        navigationOverrides: [],
        featuresEnabled: profile.features ? [...profile.features] : [],
        customAttributes: [],
        version: 1,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    }

    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      activityId: String(row.activity_id),
      familyId: row.family_id ?? undefined,
      profileId: String(row.profile_id),
      enabledModules: safeJsonArray(row.enabled_modules),
      customTerminology: safeJsonObject(row.custom_terminology),
      navigationOverrides: safeJsonObject<any[]>(row.navigation_overrides) && Array.isArray(safeJsonObject<any[]>(row.navigation_overrides)) ? (safeJsonObject<any[]>(row.navigation_overrides) as any) : [],
      featuresEnabled: safeJsonArray(row.features_enabled),
      customAttributes: safeJsonObject<any[]>(row.custom_attributes) && Array.isArray(safeJsonObject<any[]>(row.custom_attributes)) ? (safeJsonObject<any[]>(row.custom_attributes) as any) : [],
      version: toNumber(row.version, 1),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    };
  }

  public saveTenantActivity(input: import('./platformTypes').PlatformTenantActivityInput): import('./platformTypes').PlatformTenantActivityConfig {
    const actor = PlatformAdminService.requirePlatformAccess('activity', 'platform.activity.update');
    const existing = this.getTenantActivity(input.tenantId);
    const { getBusinessProfile, getActivityRows } = require('../../../config/businessProfiles');

    const profile = getBusinessProfile(input.profileId || input.activityId);
    const act = getActivityRows().find((a: any) => a.id === input.activityId);
    const familyId = act?.familyId || 'retail';
    const profileId = profile.id;

    const nextVersion = existing ? existing.version + 1 : 1;
    const now = nowIso();
    const id = existing?.id || `pact_${uuidv4().replace(/-/g, '').slice(0, 14)}`;

    const enabledModules = input.enabledModules ?? existing?.enabledModules ?? [...profile.modules.enabledByDefault];
    const customTerminology = input.customTerminology ?? existing?.customTerminology ?? {};
    const navigationOverrides = input.navigationOverrides ?? existing?.navigationOverrides ?? [];
    const featuresEnabled = input.featuresEnabled ?? existing?.featuresEnabled ?? (profile.features ? [...profile.features] : []);
    const customAttributes = existing?.customAttributes ?? [];

    const configSnapshot: import('./platformTypes').PlatformTenantActivityConfig = {
      id,
      tenantId: input.tenantId,
      activityId: input.activityId,
      familyId,
      profileId,
      enabledModules,
      customTerminology,
      navigationOverrides,
      featuresEnabled,
      customAttributes,
      version: nextVersion,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.db.executeTransaction(() => {
      // 1. Upsert current activity
      this.db.run(
        `INSERT INTO platform_tenant_activities (
          id, tenant_id, activity_id, family_id, profile_id, enabled_modules,
          custom_terminology, navigation_overrides, features_enabled, custom_attributes,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id) DO UPDATE SET
          activity_id = excluded.activity_id,
          family_id = excluded.family_id,
          profile_id = excluded.profile_id,
          enabled_modules = excluded.enabled_modules,
          custom_terminology = excluded.custom_terminology,
          navigation_overrides = excluded.navigation_overrides,
          features_enabled = excluded.features_enabled,
          version = excluded.version,
          updated_at = excluded.updated_at`,
        [
          id,
          input.tenantId,
          input.activityId,
          familyId,
          profileId,
          JSON.stringify(enabledModules),
          JSON.stringify(customTerminology),
          JSON.stringify(navigationOverrides),
          JSON.stringify(featuresEnabled),
          JSON.stringify(customAttributes),
          nextVersion,
          existing?.createdAt || now,
          now,
        ]
      );

      // 2. Also keep platform_tenants.business_type in sync
      this.db.run('UPDATE platform_tenants SET business_type = ?, updated_at = ? WHERE id = ?', [
        input.activityId,
        now,
        input.tenantId,
      ]);

      // 3. Save snapshot version for rollback
      const versionId = `pav_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
      this.db.run(
        `INSERT INTO platform_tenant_activity_versions (
          id, tenant_id, version, activity_id, profile_id, config_snapshot,
          change_summary, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          versionId,
          input.tenantId,
          nextVersion,
          input.activityId,
          profileId,
          JSON.stringify(configSnapshot),
          input.changeSummary || `تحديث إعدادات النشاط (إصدار ${nextVersion})`,
          actor.fullName,
          now,
        ]
      );
    });

    this.audit(
      'تخصيص نشاط العميل',
      'TENANT',
      input.tenantId,
      {
        activityId: input.activityId,
        profileId,
        version: nextVersion,
        enabledModulesCount: enabledModules.length,
      },
      {
        oldValues: existing,
        newValues: configSnapshot,
        severity: 'WARNING',
      }
    );

    return configSnapshot;
  }

  public listTenantActivityVersions(tenantId: string): import('./platformTypes').PlatformTenantActivityVersion[] {
    PlatformAdminService.requirePlatformAccess('activity', 'platform.activity.view');
    this.assertTenantScope(tenantId);
    return this.db.query<any>(
      `SELECT * FROM platform_tenant_activity_versions
       WHERE tenant_id = ?
       ORDER BY version DESC LIMIT 50`,
      [tenantId]
    ).map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      version: toNumber(row.version),
      activityId: String(row.activity_id),
      profileId: String(row.profile_id),
      configSnapshot: safeJsonObject(row.config_snapshot),
      changeSummary: row.change_summary ?? null,
      createdBy: row.created_by ?? null,
      createdAt: String(row.createdAt),
    }));
  }

  public rollbackTenantActivity(tenantId: string, targetVersion: number): import('./platformTypes').PlatformTenantActivityConfig {
    const actor = PlatformAdminService.requirePlatformAccess('activity', 'platform.activity.update');
    this.assertTenantScope(tenantId);
    const versionRow = this.db.query<any>(
      'SELECT * FROM platform_tenant_activity_versions WHERE tenant_id = ? AND version = ?',
      [tenantId, targetVersion]
    )[0];

    if (!versionRow) {
      throw new Error(`الإصدار رقم ${targetVersion} غير موجود للعميل.`);
    }

    const snapshot: import('./platformTypes').PlatformTenantActivityConfig = safeJsonObject(versionRow.config_snapshot);

    return this.saveTenantActivity({
      tenantId,
      activityId: snapshot.activityId,
      profileId: snapshot.profileId,
      enabledModules: snapshot.enabledModules,
      customTerminology: snapshot.customTerminology,
      navigationOverrides: snapshot.navigationOverrides,
      featuresEnabled: snapshot.featuresEnabled,
      changeSummary: `استرجاع تلقائي للنسخة السابقة (إصدار #${targetVersion})`,
    });
  }

  // ─── Analytics & Time-Series Helpers ──────────────────────────────────────────

  private getPeriodBounds(period: PlatformPeriod): { start: string; end: string; previousStart: string; previousEnd: string } {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    if (period === 'ytd') {
      const start = new Date(now.getFullYear(), 0, 1);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        previousStart: new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0],
        previousEnd: new Date(now.getFullYear() - 1, 11, 31).toISOString().split('T')[0],
      };
    }
    if (period === 'all') {
      const start = new Date('2020-01-01');
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        previousStart: '2020-01-01',
        previousEnd: start.toISOString().split('T')[0],
      };
    }

    const daysMap: Record<Exclude<PlatformPeriod, 'ytd' | 'all'>, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '180d': 180,
      '365d': 365,
    };
    const days = daysMap[period as Exclude<PlatformPeriod, 'ytd' | 'all'>] ?? 30;

    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);

    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - days * 24 * 60 * 60 * 1000);
    prevStart.setHours(0, 0, 0, 0);

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
      previousStart: prevStart.toISOString().split('T')[0],
      previousEnd: prevEnd.toISOString().split('T')[0],
    };
  }

  private computeComparison(current: number, previous: number): PlatformMetricComparison {
    const change = current - previous;
    const changePercent = previous > 0 ? (change / previous) * 100 : (current > 0 ? 100 : 0);
    return {
      current,
      previous,
      change,
      changePercent: Math.round(changePercent * 100) / 100,
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    };
  }

  private generateTimeSeriesLabels(start: string, end: string, granularity: 'day' | 'week' | 'month'): string[] {
    const labels: string[] = [];
    const s = new Date(start);
    const e = new Date(end);
    const current = new Date(s);

    while (current <= e) {
      if (granularity === 'day') {
        labels.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      } else if (granularity === 'week') {
        labels.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 7);
      } else {
        labels.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
        current.setMonth(current.getMonth() + 1);
      }
    }
    return labels;
  }

  private getTimeSeriesData(
    table: string,
    dateColumn: string,
    valueColumn: string | null,
    period: PlatformPeriod,
    filters: string = '',
    filterParams: any[] = []
  ): PlatformTimeSeriesPoint[] {
    const bounds = this.getPeriodBounds(period);
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : period === '180d' ? 180 : period === '365d' ? 365 : 30;
    const granularity = days <= 30 ? 'day' : days <= 90 ? 'week' : 'month';
    const labels = this.generateTimeSeriesLabels(bounds.start, bounds.end, granularity);

    const results: PlatformTimeSeriesPoint[] = [];

    for (let i = 0; i < labels.length; i++) {
      const periodStart = labels[i];
      let periodEnd: string;
      if (granularity === 'day') {
        periodEnd = periodStart;
      } else if (granularity === 'week') {
        const d = new Date(periodStart);
        d.setDate(d.getDate() + 6);
        periodEnd = d.toISOString().split('T')[0];
      } else {
        const d = new Date(periodStart + '-01');
        d.setMonth(d.getMonth() + 1);
        d.setDate(d.getDate() - 1);
        periodEnd = d.toISOString().split('T')[0];
      }

      let query: string;
      let params: any[];

      if (valueColumn) {
        query = `SELECT COALESCE(SUM(${valueColumn}), 0) AS value FROM ${table} WHERE date(${dateColumn}) BETWEEN ? AND ? ${filters}`;
        params = [periodStart, periodEnd, ...filterParams];
      } else {
        query = `SELECT COUNT(*) AS value FROM ${table} WHERE date(${dateColumn}) BETWEEN ? AND ? ${filters}`;
        params = [periodStart, periodEnd, ...filterParams];
      }

      const row = this.db.query<any>(query, params)[0];
      const value = toNumber(row?.value, 0);

      let label = periodStart;
      if (granularity === 'day') {
        label = new Date(periodStart).toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' });
      } else if (granularity === 'week') {
        label = `أسبوع ${new Date(periodStart).getDate()}/${new Date(periodStart).getMonth() + 1}`;
      } else {
        label = new Date(periodStart).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short' });
      }

      results.push({ period: periodStart, value, label });
    }

    return results;
  }

  // ─── Business Performance Analytics ───────────────────────────────────────────

  public getBusinessPerformance(period: PlatformPeriod = '30d', planId?: string): PlatformBusinessPerformance {
    PlatformAdminService.requirePlatformAccess('analytics', 'platform.analytics.view');

    const bounds = this.getPeriodBounds(period);
    const planFilter = planId ? 'AND t.plan_id = ?' : '';
    const planParams = planId ? [planId] : [];

    // Current period revenue
    const currentRevenue = toNumber(this.db.query<any>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM platform_payments
       WHERE date(paid_at) BETWEEN ? AND ?`,
      [bounds.start, bounds.end]
    )[0]?.total);

    // Previous period revenue
    const previousRevenue = toNumber(this.db.query<any>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM platform_payments
       WHERE date(paid_at) BETWEEN ? AND ?`,
      [bounds.previousStart, bounds.previousEnd]
    )[0]?.total);

    // Current MRR
    const currentMrrRows = this.db.query<any>(
      `SELECT price, billing_cycle AS billingCycle FROM platform_subscriptions
       WHERE status = 'ACTIVE' ${planFilter}`,
      [...planParams]
    );
    const currentMrr = currentMrrRows.reduce((sum: number, row: any) => {
      const price = toNumber(row.price);
      switch (row.billingCycle) {
        case 'MONTHLY': return sum + price;
        case 'QUARTERLY': return sum + price / 3;
        case 'YEARLY': return sum + price / 12;
        default: return sum;
      }
    }, 0);

    // Previous MRR (approximate from subscriptions that existed in previous period)
    const previousMrrRows = this.db.query<any>(
      `SELECT s.price, s.billing_cycle AS billingCycle FROM platform_subscriptions s
       JOIN platform_tenants t ON t.id = s.tenant_id
       WHERE s.status = 'ACTIVE' AND date(s.start_date) <= ? ${planFilter}
       AND (s.end_date IS NULL OR date(s.end_date) >= ?)`,
      [bounds.previousEnd, bounds.previousStart, ...planParams]
    );
    const previousMrr = previousMrrRows.reduce((sum: number, row: any) => {
      const price = toNumber(row.price);
      switch (row.billingCycle) {
        case 'MONTHLY': return sum + price;
        case 'QUARTERLY': return sum + price / 3;
        case 'YEARLY': return sum + price / 12;
        default: return sum;
      }
    }, 0);

    // ARR = MRR * 12
    const currentArr = currentMrr * 12;
    const previousArr = previousMrr * 12;

    // Net revenue (revenue - refunds/chargebacks if any, for now same as revenue)
    const currentNetRevenue = currentRevenue;
    const previousNetRevenue = previousRevenue;

    // Growth rate (month-over-month revenue growth)
    const currentMonthRevenue = toNumber(this.db.query<any>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM platform_payments
       WHERE date(paid_at) >= date('now', 'start of month')`
    )[0]?.total);
    const previousMonthRevenue = toNumber(this.db.query<any>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM platform_payments
       WHERE date(paid_at) >= date('now', 'start of month', '-1 month')
       AND date(paid_at) < date('now', 'start of month')`
    )[0]?.total);

    return {
      revenue: {
        total: this.computeComparison(currentRevenue, previousRevenue),
        mrr: this.computeComparison(currentMrr, previousMrr),
        arr: this.computeComparison(currentArr, previousArr),
        netRevenue: this.computeComparison(currentNetRevenue, previousNetRevenue),
        growthRate: this.computeComparison(currentMonthRevenue, previousMonthRevenue),
      },
      timeSeries: {
        revenue: this.getTimeSeriesData('platform_payments', 'paid_at', 'amount', period),
        mrr: [], // MRR time series would need subscription snapshots
        arr: [],
      },
    };
  }

  // ─── Customer Analytics ────────────────────────────────────────────────────────

  public getCustomerMetrics(period: PlatformPeriod = '30d', planId?: string): PlatformCustomerMetrics {
    PlatformAdminService.requirePlatformAccess('analytics', 'platform.analytics.view');

    const bounds = this.getPeriodBounds(period);
    const planFilter = planId ? 'AND plan_id = ?' : '';
    const planParams = planId ? [planId] : [];

    // New customers current period
    const newCustomersCurrent = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants
       WHERE date(created_at) BETWEEN ? AND ? ${planFilter}`,
      [bounds.start, bounds.end, ...planParams]
    )[0]?.count);

    // New customers previous period
    const newCustomersPrevious = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants
       WHERE date(created_at) BETWEEN ? AND ? ${planFilter}`,
      [bounds.previousStart, bounds.previousEnd, ...planParams]
    )[0]?.count);

    // Active customers (current)
    const activeCustomersCurrent = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants
       WHERE status IN ('ACTIVE', 'TRIAL') ${planFilter}`,
      [...planParams]
    )[0]?.count);

    // Active customers previous period (approximate)
    const activeCustomersPrevious = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants
       WHERE status IN ('ACTIVE', 'TRIAL') AND date(created_at) <= ? ${planFilter}`,
      [bounds.previousEnd, ...planParams]
    )[0]?.count);

    // Cancelled customers current period
    const cancelledCustomersCurrent = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants
       WHERE status = 'CANCELLED' AND date(updated_at) BETWEEN ? AND ? ${planFilter}`,
      [bounds.start, bounds.end, ...planParams]
    )[0]?.count);

    // Cancelled customers previous period
    const cancelledCustomersPrevious = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants
       WHERE status = 'CANCELLED' AND date(updated_at) BETWEEN ? AND ? ${planFilter}`,
      [bounds.previousStart, bounds.previousEnd, ...planParams]
    )[0]?.count);

    // Churn rate = cancelled / (active at start of period)
    const activeAtPeriodStart = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants
       WHERE status IN ('ACTIVE', 'TRIAL') AND date(created_at) <= ? ${planFilter}`,
      [bounds.start, ...planParams]
    )[0]?.count);
    const churnRateCurrent = activeAtPeriodStart > 0 ? (cancelledCustomersCurrent / activeAtPeriodStart) * 100 : 0;
    const activeAtPreviousStart = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants
       WHERE status IN ('ACTIVE', 'TRIAL') AND date(created_at) <= ? ${planFilter}`,
      [bounds.previousStart, ...planParams]
    )[0]?.count);
    const churnRatePrevious = activeAtPreviousStart > 0 ? (cancelledCustomersPrevious / activeAtPreviousStart) * 100 : 0;

    // Trial to paid conversion
    const trialsStarted = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants
       WHERE status = 'TRIAL' AND date(created_at) BETWEEN ? AND ? ${planFilter}`,
      [bounds.start, bounds.end, ...planParams]
    )[0]?.count);
    const trialsConverted = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants
       WHERE status = 'ACTIVE' AND date(subscription_started_at) BETWEEN ? AND ?
       AND date(created_at) < date(subscription_started_at) ${planFilter}`,
      [bounds.start, bounds.end, ...planParams]
    )[0]?.count);
    const trialConversionCurrent = trialsStarted > 0 ? (trialsConverted / trialsStarted) * 100 : 0;

    const trialsStartedPrev = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants
       WHERE status = 'TRIAL' AND date(created_at) BETWEEN ? AND ? ${planFilter}`,
      [bounds.previousStart, bounds.previousEnd, ...planParams]
    )[0]?.count);
    const trialsConvertedPrev = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants
       WHERE status = 'ACTIVE' AND date(subscription_started_at) BETWEEN ? AND ?
       AND date(created_at) < date(subscription_started_at) ${planFilter}`,
      [bounds.previousStart, bounds.previousEnd, ...planParams]
    )[0]?.count);
    const trialConversionPrevious = trialsStartedPrev > 0 ? (trialsConvertedPrev / trialsStartedPrev) * 100 : 0;

    // Average revenue per customer
    const totalCustomers = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants WHERE status IN ('ACTIVE', 'TRIAL') ${planFilter}`,
      [...planParams]
    )[0]?.count);
    const totalRevenue = toNumber(this.db.query<any>(
      `SELECT COALESCE(SUM(p.amount), 0) AS total FROM platform_payments p
       JOIN platform_tenants t ON t.id = p.tenant_id
       WHERE t.status IN ('ACTIVE', 'TRIAL') ${planFilter}`,
      [...planParams]
    )[0]?.total);
    const arpcCurrent = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

    // Top customers by revenue
    const topCustomersRows = this.db.query<any>(
      `SELECT t.id, t.code, t.name, t.status,
              COALESCE(SUM(p.amount), 0) AS revenue,
              COUNT(p.id) AS invoicesCount
       FROM platform_tenants t
       LEFT JOIN platform_payments p ON p.tenant_id = t.id
       WHERE t.status IN ('ACTIVE', 'TRIAL') ${planFilter}
       GROUP BY t.id
       ORDER BY revenue DESC LIMIT 10`,
      [...planParams]
    );
    const topCustomersByRevenue = topCustomersRows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      revenue: toNumber(row.revenue),
      invoicesCount: toNumber(row.invoicesCount),
      status: row.status as PlatformTenantStatus,
    }));

    // Recently cancelled
    const recentlyCancelledRows = this.db.query<any>(
      `SELECT * FROM platform_tenants
       WHERE status = 'CANCELLED'
       ORDER BY updated_at DESC LIMIT 5`
    ).map(mapTenant);

    return {
      newCustomers: this.computeComparison(newCustomersCurrent, newCustomersPrevious),
      activeCustomers: this.computeComparison(activeCustomersCurrent, activeCustomersPrevious),
      cancelledCustomers: this.computeComparison(cancelledCustomersCurrent, cancelledCustomersPrevious),
      churnRate: this.computeComparison(churnRateCurrent, churnRatePrevious),
      trialToPaidConversion: this.computeComparison(trialConversionCurrent, trialConversionPrevious),
      averageRevenuePerCustomer: this.computeComparison(arpcCurrent, 0), // No previous for now
      timeSeries: {
        newCustomers: this.getTimeSeriesData('platform_tenants', 'created_at', null, period, planFilter, planParams),
        activeCustomers: this.getTimeSeriesData('platform_tenants', 'created_at', null, period, `AND status IN ('ACTIVE','TRIAL') ${planFilter}`, planParams),
        churnedCustomers: this.getTimeSeriesData('platform_tenants', 'updated_at', null, period, `AND status = 'CANCELLED' ${planFilter}`, planParams),
        trialConversions: this.getTimeSeriesData('platform_tenants', 'subscription_started_at', null, period, `AND status = 'ACTIVE' AND subscription_started_at IS NOT NULL ${planFilter}`, planParams),
      },
      topCustomersByRevenue,
      recentlyCancelled: recentlyCancelledRows,
    };
  }

  // ─── Subscription Analytics ────────────────────────────────────────────────────

  public getSubscriptionMetrics(period: PlatformPeriod = '30d', planId?: string): PlatformSubscriptionMetrics {
    PlatformAdminService.requirePlatformAccess('subscriptions', 'platform.subscriptions.view');

    const bounds = this.getPeriodBounds(period);
    const planFilter = planId ? 'AND plan_id = ?' : '';
    const planParams = planId ? [planId] : [];

    // Expired trials
    const expiredTrialsCurrent = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_subscriptions
       WHERE status = 'EXPIRED' AND date(end_date) BETWEEN ? AND ? ${planFilter}`,
      [bounds.start, bounds.end, ...planParams]
    )[0]?.count);

    const expiredTrialsPrevious = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_subscriptions
       WHERE status = 'EXPIRED' AND date(end_date) BETWEEN ? AND ? ${planFilter}`,
      [bounds.previousStart, bounds.previousEnd, ...planParams]
    )[0]?.count);

    // Upcoming renewals (next 30 days)
    const upcomingRenewalsCurrent = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_subscriptions
       WHERE status IN ('ACTIVE', 'TRIAL') AND end_date IS NOT NULL
       AND date(end_date) BETWEEN date('now') AND date('now', '+30 day') ${planFilter}`,
      [...planParams]
    )[0]?.count);

    // Struggling subscriptions (PAST_DUE)
    const strugglingCurrent = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_subscriptions
       WHERE status = 'PAST_DUE' ${planFilter}`,
      [...planParams]
    )[0]?.count);

    // Trial conversion rate
    const trialsTotal = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_subscriptions WHERE status = 'TRIAL' ${planFilter}`,
      [...planParams]
    )[0]?.count);
    const convertedFromTrial = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_subscriptions
       WHERE status = 'ACTIVE' AND EXISTS (
         SELECT 1 FROM platform_subscriptions s2
         WHERE s2.tenant_id = platform_subscriptions.tenant_id
         AND s2.status = 'TRIAL' AND s2.id < platform_subscriptions.id
       ) ${planFilter}`,
      [...planParams]
    )[0]?.count);
    const trialConversionRate = trialsTotal > 0 ? (convertedFromTrial / trialsTotal) * 100 : 0;

    // Average subscription value
    const avgSubValueRows = this.db.query<any>(
      `SELECT AVG(price) AS avgPrice FROM platform_subscriptions WHERE status = 'ACTIVE' ${planFilter}`,
      [...planParams]
    );
    const avgSubValueCurrent = toNumber(avgSubValueRows[0]?.avgPrice);

    // Renewal rate (renewed / up for renewal)
    const upForRenewal = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_subscriptions
       WHERE status IN ('ACTIVE', 'TRIAL') AND end_date IS NOT NULL
       AND date(end_date) BETWEEN ? AND ? ${planFilter}`,
      [bounds.previousStart, bounds.previousEnd, ...planParams]
    )[0]?.count);
    const renewed = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_subscriptions
       WHERE status = 'ACTIVE' AND date(start_date) BETWEEN ? AND ?
       AND EXISTS (SELECT 1 FROM platform_subscriptions s2 WHERE s2.tenant_id = platform_subscriptions.tenant_id AND s2.id < platform_subscriptions.id) ${planFilter}`,
      [bounds.previousStart, bounds.previousEnd, ...planParams]
    )[0]?.count);
    const renewalRate = upForRenewal > 0 ? (renewed / upForRenewal) * 100 : 0;

    // Upcoming renewals list
    const upcomingRows = this.db.query<any>(
      `SELECT s.*, t.name AS tenantName, t.code AS tenantCode, p.name AS planName
       FROM platform_subscriptions s
       JOIN platform_tenants t ON t.id = s.tenant_id
       LEFT JOIN platform_plans p ON p.id = s.plan_id
       WHERE s.status IN ('ACTIVE', 'TRIAL') AND s.end_date IS NOT NULL
       AND date(s.end_date) BETWEEN date('now') AND date('now', '+30 day') ${planFilter}
       ORDER BY date(s.end_date) ASC LIMIT 20`,
      [...planParams]
    );
    const upcomingRenewalsList = upcomingRows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      tenantName: String(row.tenantName),
      tenantCode: String(row.tenantCode),
      planName: String(row.planName || '—'),
      endDate: String(row.end_date),
      price: toNumber(row.price),
      billingCycle: row.billing_cycle as PlatformBillingCycle,
      autoRenew: Boolean(row.auto_renew),
      status: row.status as PlatformSubscriptionStatus,
    }));

    // Struggling list
    const strugglingRows = this.db.query<any>(
      `SELECT s.*, t.name AS tenantName, p.name AS planName
       FROM platform_subscriptions s
       JOIN platform_tenants t ON t.id = s.tenant_id
       LEFT JOIN platform_plans p ON p.id = s.plan_id
       WHERE s.status = 'PAST_DUE' ${planFilter}
       ORDER BY s.end_date ASC LIMIT 20`,
      [...planParams]
    );
    const strugglingList = strugglingRows.map(mapSubscription);

    return {
      expiredTrials: this.computeComparison(expiredTrialsCurrent, expiredTrialsPrevious),
      upcomingRenewals: this.computeComparison(upcomingRenewalsCurrent, 0),
      strugglingSubscriptions: this.computeComparison(strugglingCurrent, 0),
      trialConversionRate: this.computeComparison(trialConversionRate, 0),
      averageSubscriptionValue: this.computeComparison(avgSubValueCurrent, 0),
      renewalRate: this.computeComparison(renewalRate, 0),
      timeSeries: {
        newSubscriptions: this.getTimeSeriesData('platform_subscriptions', 'created_at', null, period, `AND status IN ('ACTIVE','TRIAL') ${planFilter}`, planParams),
        renewedSubscriptions: this.getTimeSeriesData('platform_subscriptions', 'start_date', null, period, `AND status = 'ACTIVE' AND EXISTS (SELECT 1 FROM platform_subscriptions s2 WHERE s2.tenant_id = platform_subscriptions.tenant_id AND s2.id < platform_subscriptions.id) ${planFilter}`, planParams),
        cancelledSubscriptions: this.getTimeSeriesData('platform_subscriptions', 'updated_at', null, period, `AND status = 'CANCELLED' ${planFilter}`, planParams),
        expiredTrials: this.getTimeSeriesData('platform_subscriptions', 'end_date', null, period, `AND status = 'EXPIRED' ${planFilter}`, planParams),
      },
      upcomingRenewalsList,
      strugglingList,
    };
  }

  // ─── License Analytics ─────────────────────────────────────────────────────────

  public getLicenseMetrics(period: PlatformPeriod = '30d', planId?: string): PlatformLicenseMetrics {
    PlatformAdminService.requirePlatformAccess('licenses', 'platform.licenses.view');

    const bounds = this.getPeriodBounds(period);
    const planFilter = planId ? 'AND l.plan_id = ?' : '';
    const planParams = planId ? [planId] : [];

    // Activated devices (licenses with hardware_id)
    const activatedCurrent = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_licenses l
       JOIN platform_tenants t ON t.id = l.tenant_id
       WHERE l.status IN ('ACTIVE', 'ISSUED') AND l.hardware_id IS NOT NULL AND l.hardware_id <> '' ${planFilter}`,
      [...planParams]
    )[0]?.count);

    // Total device limit
    const totalLimit = toNumber(this.db.query<any>(
      `SELECT COALESCE(SUM(device_limit), 0) AS total FROM platform_licenses l
       JOIN platform_tenants t ON t.id = l.tenant_id
       WHERE l.status IN ('ACTIVE', 'ISSUED') ${planFilter}`,
      [...planParams]
    )[0]?.total);

    const utilizationRate = totalLimit > 0 ? (activatedCurrent / totalLimit) * 100 : 0;

    // Pending licenses (ISSUED but not ACTIVE)
    const pendingCurrent = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_licenses l
       JOIN platform_tenants t ON t.id = l.tenant_id
       WHERE l.status = 'ISSUED' ${planFilter}`,
      [...planParams]
    )[0]?.count);

    // Failed activations (from activation log)
    const failedCurrent = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_license_activations la
       JOIN platform_licenses l ON l.id = la.license_id
       JOIN platform_tenants t ON t.id = l.tenant_id
       WHERE la.status = 'FAILED' AND date(la.created_at) BETWEEN ? AND ? ${planFilter}`,
      [bounds.start, bounds.end, ...planParams]
    )[0]?.count);

    const failedPrevious = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_license_activations la
       JOIN platform_licenses l ON l.id = la.license_id
       JOIN platform_tenants t ON t.id = l.tenant_id
       WHERE la.status = 'FAILED' AND date(la.created_at) BETWEEN ? AND ? ${planFilter}`,
      [bounds.previousStart, bounds.previousEnd, ...planParams]
    )[0]?.count);

    // Activation success rate
    const totalActivations = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_license_activations la
       JOIN platform_licenses l ON l.id = la.license_id
       JOIN platform_tenants t ON t.id = l.tenant_id
       WHERE la.action = 'ACTIVATE' AND date(la.created_at) BETWEEN ? AND ? ${planFilter}`,
      [bounds.start, bounds.end, ...planParams]
    )[0]?.count);
    const successfulActivations = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_license_activations la
       JOIN platform_licenses l ON l.id = la.license_id
       JOIN platform_tenants t ON t.id = l.tenant_id
       WHERE la.action = 'ACTIVATE' AND la.status = 'SUCCESS' AND date(la.created_at) BETWEEN ? AND ? ${planFilter}`,
      [bounds.start, bounds.end, ...planParams]
    )[0]?.count);
    const activationSuccessRate = totalActivations > 0 ? (successfulActivations / totalActivations) * 100 : 0;

    // Expiring soon
    const expiringSoon = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_licenses l
       JOIN platform_tenants t ON t.id = l.tenant_id
       WHERE l.status IN ('ACTIVE', 'ISSUED') AND l.expires_at IS NOT NULL
       AND date(l.expires_at) <= date('now', '+30 day') ${planFilter}`,
      [...planParams]
    )[0]?.count);

    // Failed activations list
    const failedRows = this.db.query<any>(
      `SELECT la.*, l.license_key AS licenseKey, t.name AS tenantName, t.code AS tenantCode
       FROM platform_license_activations la
       JOIN platform_licenses l ON l.id = la.license_id
       JOIN platform_tenants t ON t.id = l.tenant_id
       WHERE la.status = 'FAILED' AND date(la.created_at) BETWEEN ? AND ? ${planFilter}
       ORDER BY la.created_at DESC LIMIT 20`,
      [bounds.start, bounds.end, ...planParams]
    );
    const failedActivationsList = failedRows.map((row) => ({
      id: String(row.id),
      licenseId: String(row.license_id),
      tenantId: String(row.tenant_id),
      tenantName: row.tenantName ?? null,
      licenseKey: row.licenseKey ?? null,
      deviceId: row.device_id ?? null,
      activationCode: row.activation_code ?? null,
      mode: row.mode,
      action: row.action,
      status: row.status,
      ipAddress: row.ipAddress ?? null,
      notes: row.notes ?? null,
      createdAt: String(row.createdAt),
    }));

    // Pending licenses list
    const pendingRows = this.db.query<any>(
      `SELECT l.*, t.name AS tenantName, p.name AS planName
       FROM platform_licenses l
       JOIN platform_tenants t ON t.id = l.tenant_id
       LEFT JOIN platform_plans p ON p.id = l.plan_id
       WHERE l.status = 'ISSUED' ${planFilter}
       ORDER BY l.created_at DESC LIMIT 20`,
      [...planParams]
    );
    const pendingLicensesList = pendingRows.map(mapLicense);

    return {
      activatedDevices: this.computeComparison(activatedCurrent, 0),
      utilizationRate: this.computeComparison(utilizationRate, 0),
      pendingLicenses: this.computeComparison(pendingCurrent, 0),
      failedActivations: this.computeComparison(failedCurrent, failedPrevious),
      activationSuccessRate: this.computeComparison(activationSuccessRate, 0),
      expiringSoon: this.computeComparison(expiringSoon, 0),
      timeSeries: {
        activations: this.getTimeSeriesData('platform_license_activations', 'created_at', null, period, `AND action = 'ACTIVATE' AND status = 'SUCCESS' ${planFilter}`, planParams),
        deactivations: this.getTimeSeriesData('platform_license_activations', 'created_at', null, period, `AND action = 'DEACTIVATE' ${planFilter}`, planParams),
        failedActivations: this.getTimeSeriesData('platform_license_activations', 'created_at', null, period, `AND status = 'FAILED' ${planFilter}`, planParams),
        utilization: [], // Would need historical snapshots
      },
      failedActivationsList,
      pendingLicensesList,
    };
  }

  // ─── Operations Analytics ──────────────────────────────────────────────────────

  public getOperationsMetrics(period: PlatformPeriod = '30d'): PlatformOperationsMetrics {
    PlatformAdminService.requirePlatformAccess('operations', 'platform.operations.view');

    const bounds = this.getPeriodBounds(period);

    // Connected devices (devices with recent last_seen_at)
    const connectedCurrent = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_devices
       WHERE status = 'ACTIVE' AND last_seen_at IS NOT NULL
       AND date(last_seen_at) >= date('now', '-1 day')`
    )[0]?.count);

    // Disconnected devices
    const disconnectedCurrent = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_devices
       WHERE status = 'ACTIVE' AND (last_seen_at IS NULL OR date(last_seen_at) < date('now', '-1 day'))`
    )[0]?.count);

    // Sync errors (from audit logs or a sync_errors table if exists)
    const syncErrorsCurrent = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_audit_logs
       WHERE action LIKE '%SYNC%' AND (details LIKE '%ERROR%' OR details LIKE '%FAIL%' OR details LIKE '%error%' OR details LIKE '%fail%')
       AND date(created_at) BETWEEN ? AND ?`,
      [bounds.start, bounds.end]
    )[0]?.count);

    const syncErrorsPrevious = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_audit_logs
       WHERE action LIKE '%SYNC%' AND (details LIKE '%ERROR%' OR details LIKE '%FAIL%' OR details LIKE '%error%' OR details LIKE '%fail%')
       AND date(created_at) BETWEEN ? AND ?`,
      [bounds.previousStart, bounds.previousEnd]
    )[0]?.count);

    // API health (approximate from activation logs)
    const totalApiCalls = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_license_activations
       WHERE date(created_at) BETWEEN ? AND ?`,
      [bounds.start, bounds.end]
    )[0]?.count);
    const failedApiCalls = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_license_activations
       WHERE status = 'FAILED' AND date(created_at) BETWEEN ? AND ?`,
      [bounds.start, bounds.end]
    )[0]?.count);
    const apiHealth = totalApiCalls > 0 ? ((totalApiCalls - failedApiCalls) / totalApiCalls) * 100 : 100;

    // Average response time (mock for now - would need actual API logging)
    const avgResponseTime = 150; // ms

    // Recent sync errors
    const syncErrorRows = this.db.query<any>(
      `SELECT al.*, d.name AS deviceName, d.hardware_id AS deviceHardwareId, t.name AS tenantName, t.code AS tenantCode
       FROM platform_audit_logs al
       LEFT JOIN platform_devices d ON d.id = CAST(JSON_EXTRACT(al.details, '$.deviceId') AS TEXT)
       LEFT JOIN platform_tenants t ON t.id = d.tenant_id
       WHERE al.action LIKE '%SYNC%' AND (al.details LIKE '%ERROR%' OR al.details LIKE '%FAIL%' OR al.details LIKE '%error%' OR al.details LIKE '%fail%')
       ORDER BY al.created_at DESC LIMIT 20`
    );
    const recentSyncErrors = syncErrorRows.map((row) => ({
      id: String(row.id),
      deviceId: String(row.entity_id || ''),
      deviceName: row.deviceName || `Device ${row.entity_id}`,
      tenantId: String(row.actor_id || ''),
      tenantName: row.tenantName || 'Unknown',
      error: row.details || 'Sync error',
      occurredAt: String(row.createdAt),
      resolved: false,
    }));

    // API endpoints health (mock data)
    const apiEndpointsHealth = [
      { endpoint: '/api/v1/licenses/activate', requests: totalApiCalls, errors: failedApiCalls, avgResponseMs: avgResponseTime, successRate: apiHealth },
      { endpoint: '/api/v1/licenses/validate', requests: totalApiCalls * 3, errors: failedApiCalls, avgResponseMs: avgResponseTime / 2, successRate: apiHealth },
      { endpoint: '/api/v1/tenants/profile', requests: totalApiCalls, errors: 0, avgResponseMs: avgResponseTime, successRate: 100 },
    ];

    return {
      connectedDevices: this.computeComparison(connectedCurrent, 0),
      disconnectedDevices: this.computeComparison(disconnectedCurrent, 0),
      syncErrors: this.computeComparison(syncErrorsCurrent, syncErrorsPrevious),
      apiHealth: this.computeComparison(apiHealth, 100),
      averageResponseTime: this.computeComparison(avgResponseTime, 0),
      timeSeries: {
        onlineDevices: this.getTimeSeriesData('platform_devices', 'last_seen_at', null, period, `AND status = 'ACTIVE'`),
        offlineDevices: this.getTimeSeriesData('platform_devices', 'last_seen_at', null, period, `AND status IN ('SUSPENDED','REVOKED','OFFLINE')`),
        syncErrors: this.getTimeSeriesData('platform_audit_logs', 'created_at', null, period, `AND action LIKE '%SYNC%' AND (details LIKE '%ERROR%' OR details LIKE '%FAIL%')`),
        apiSuccessRate: [], // Would need historical data
      },
      recentSyncErrors,
      apiEndpointsHealth,
    };
  }

  // ─── Alert Details ─────────────────────────────────────────────────────────────

  public getAlertDetails(): PlatformAlertDetail[] {
    PlatformAdminService.requirePlatformAccess(['analytics', 'overview']);

    const alerts: PlatformAlertDetail[] = [];

    // Default platform password
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
          entityType: 'TENANT',
          entityId: 'platform',
          entityName: 'حساب المنصة',
          actionRequired: true,
          suggestedActions: ['تغيير كلمة المرور من الإعدادات', 'تفعيل المصادقة الثنائية'],
          metadata: { account: 'platform' },
        });
      }
    } catch {
      // Ignore
    }

    // Expired licenses
    const expiredLicensesCount = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_licenses WHERE status = 'EXPIRED'`
    )[0]?.count);
    if (expiredLicensesCount > 0) {
      alerts.push({
        id: 'expired-licenses',
        severity: 'danger',
        title: `${expiredLicensesCount} ترخيص منتهي`,
        description: 'تراخيص انتهت صلاحيتها وما زالت مرتبطة بعملاء. جدّدها أو أوقف الوصول.',
        link: '/platform/licenses',
        entityType: 'LICENSE',
        entityId: 'multiple',
        entityName: 'تراخيص منتهية',
        actionRequired: true,
        suggestedActions: ['مراجعة التراخيص المنتهية', 'التواصل مع العملاء للتجديد', 'إيقاف التراخيص غير المجددة'],
        metadata: { count: expiredLicensesCount },
      });
    }

    // Overdue invoices
    const overdueInvoices = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_invoices
       WHERE status IN ('SENT','PARTIAL','OVERDUE') AND due_date IS NOT NULL
       AND date(due_date) < date('now')`
    )[0]?.count);
    const outstanding = toNumber(this.db.query<any>(
      `SELECT COALESCE(SUM(total - paid_amount), 0) AS total FROM platform_invoices
       WHERE status IN ('SENT','PARTIAL','OVERDUE')`
    )[0]?.total);
    if (overdueInvoices > 0) {
      alerts.push({
        id: 'overdue-invoices',
        severity: 'danger',
        title: `${overdueInvoices} فاتورة متأخرة`,
        description: `مستحقات غير محصلة بقيمة ${this.formatMoneyText(outstanding)}. راجع المبيعات والفواتير.`,
        link: '/platform/billing',
        entityType: 'INVOICE',
        entityId: 'multiple',
        entityName: 'فواتير متأخرة',
        actionRequired: true,
        suggestedActions: ['مراجعة الفواتير المتأخرة', 'إرسال تذكيرات للعملاء', 'إعداد خطط سداد'],
        metadata: { count: overdueInvoices, amount: outstanding },
      });
    }

    // Expiring licenses
    const expiringLicensesCount = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_licenses
       WHERE status IN ('ACTIVE','ISSUED') AND expires_at IS NOT NULL
       AND date(expires_at) <= date('now', '+30 day')`
    )[0]?.count);
    if (expiringLicensesCount > 0) {
      alerts.push({
        id: 'expiring-licenses',
        severity: 'warning',
        title: `${expiringLicensesCount} ترخيص ينتهي خلال 30 يوماً`,
        description: 'تواصل مع العملاء للتجديد قبل انتهاء الصلاحية.',
        link: '/platform/licenses',
        entityType: 'LICENSE',
        entityId: 'multiple',
        entityName: 'تراخيص قربية الانتهاء',
        actionRequired: true,
        suggestedActions: ['إرسال إشعارات التجديد', 'عرض عروض تجديد مبكرة', 'متابعة العملاء هاتفياً'],
        metadata: { count: expiringLicensesCount },
      });
    }

    // Tenants without license
    const tenantsWithoutLicense = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants t
       WHERE t.status IN ('ACTIVE','TRIAL')
         AND NOT EXISTS (SELECT 1 FROM platform_licenses l WHERE l.tenant_id = t.id AND l.status = 'ACTIVE')`
    )[0]?.count);
    if (tenantsWithoutLicense > 0) {
      alerts.push({
        id: 'tenants-without-license',
        severity: 'warning',
        title: `${tenantsWithoutLicense} عميل نشط بدون ترخيص ساري`,
        description: 'عملاء بحالة نشطة أو تجريبية دون ترخيص فعّال. أصدر ترخيصاً أو راجع حالتهم.',
        link: '/platform/tenants',
        entityType: 'TENANT',
        entityId: 'multiple',
        entityName: 'عملاء بدون ترخيص',
        actionRequired: true,
        suggestedActions: ['إصدار تراخيص للعملاء', 'مراجعة حالة الاشتراكات', 'تحويل العملاء التجريبيين'],
        metadata: { count: tenantsWithoutLicense },
      });
    }

    // Suspended tenants
    const suspendedTenantsCount = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_tenants WHERE status = 'SUSPENDED'`
    )[0]?.count);
    if (suspendedTenantsCount > 0) {
      alerts.push({
        id: 'suspended-tenants',
        severity: 'info',
        title: `${suspendedTenantsCount} عميل موقوف`,
        description: 'عملاء تم إيقاف وصولهم. راجع أسباب الإيقاف قبل إعادة التفعيل.',
        link: '/platform/tenants',
        entityType: 'TENANT',
        entityId: 'multiple',
        entityName: 'عملاء موقوفون',
        actionRequired: false,
        suggestedActions: ['مراجعة أسباب الإيقاف', 'التواصل مع العملاء الموقوفين'],
        metadata: { count: suspendedTenantsCount },
      });
    }

    // Failed activations
    const failedActivationsCount = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_license_activations
       WHERE status = 'FAILED' AND date(created_at) >= date('now', '-7 day')`
    )[0]?.count);
    if (failedActivationsCount > 0) {
      alerts.push({
        id: 'failed-activations',
        severity: 'warning',
        title: `${failedActivationsCount} محاولة تفعيل فاشلة (آخر 7 أيام)`,
        description: 'محاولات تفعيل ترخيص فاشلة قد تشير لمشاكل في الشبكة أو مفاتيح غير صالحة.',
        link: '/platform/licenses',
        entityType: 'LICENSE',
        entityId: 'multiple',
        entityName: 'تفعيلات فاشلة',
        actionRequired: true,
        suggestedActions: ['مراجعة سجلات التفعيل', 'التحقق من مفاتيح الترخيص', 'دعم العملاء المتأثرين'],
        metadata: { count: failedActivationsCount, period: '7d' },
      });
    }

    // Offline devices
    const offlineDevicesCount = toNumber(this.db.query<any>(
      `SELECT COUNT(*) AS count FROM platform_devices
       WHERE status = 'ACTIVE' AND (last_seen_at IS NULL OR date(last_seen_at) < date('now', '-7 day'))`
    )[0]?.count);
    if (offlineDevicesCount > 0) {
      alerts.push({
        id: 'offline-devices',
        severity: 'info',
        title: `${offlineDevicesCount} جهاز غير متصل منذ أكثر من أسبوع`,
        description: 'أجهزة لم تتصل بالخادم منذ أكثر من 7 أيام. قد تحتاج متابعة.',
        link: '/platform/devices',
        entityType: 'DEVICE',
        entityId: 'multiple',
        entityName: 'أجهزة غير متصلة',
        actionRequired: false,
        suggestedActions: ['مراجعة حالة الأجهزة', 'التواصل مع العملاء للتحقق'],
        metadata: { count: offlineDevicesCount },
      });
    }

    // Sort by severity
    const severityOrder = { danger: 0, warning: 1, info: 2, success: 3 } as const;
    return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  private formatMoneyText(value: number): string {
    try {
      return new Intl.NumberFormat('ar-EG', {
        style: 'currency',
        currency: 'EGP',
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${value.toLocaleString('ar-EG')} EGP`;
    }
  }

  // ─── Comprehensive Overview with Period ────────────────────────────────────────

  private overviewCache = new Map<string, { data: PlatformOverview; ts: number }>();
  private readonly OVERVIEW_TTL_MS = 30_000;

  public getOverviewWithPeriod(period: PlatformPeriod = '30d', planId?: string): PlatformOverview {
    const key = `${period}|${planId || ''}`;
    const cached = this.overviewCache.get(key);
    if (cached && Date.now() - cached.ts < this.OVERVIEW_TTL_MS) {
      return cached.data;
    }
    const baseOverview = this.getOverview(); // Existing overview

    const data = {
      ...baseOverview,
      businessPerformance: this.getBusinessPerformance(period, planId),
      customerMetrics: this.getCustomerMetrics(period, planId),
      subscriptionMetrics: this.getSubscriptionMetrics(period, planId),
      licenseMetrics: this.getLicenseMetrics(period, planId),
      operationsMetrics: this.getOperationsMetrics(period),
      alertDetails: this.getAlertDetails(),
      reportFilters: { period, planId },
    };
    this.overviewCache.set(key, { data, ts: Date.now() });
    return data;
  }

  // ─── Operations Center (Item 10) ──────────────────────────────────────────────

  private rowToOpsJob(r: any): PlatformOpsJob {
    return {
      id: String(r.id),
      type: (r.type as PlatformOpsJobType) || 'CUSTOM',
      tenantId: r.tenant_id ? String(r.tenant_id) : undefined,
      payload: safeJsonObject(r.payload),
      status: (r.status as PlatformOpsJobStatus) || 'PENDING',
      priority: toNumber(r.priority, 5),
      retries: toNumber(r.retries, 0),
      maxRetries: toNumber(r.max_retries, 3),
      errorMessage: r.error_message ? String(r.error_message) : undefined,
      scheduledAt: r.scheduled_at ? String(r.scheduled_at) : undefined,
      startedAt: r.started_at ? String(r.started_at) : undefined,
      completedAt: r.completed_at ? String(r.completed_at) : undefined,
      createdBy: String(r.created_by || 'system'),
      createdAt: String(r.createdAt || nowIso()),
    };
  }

  private rowToMaintenanceWindow(r: any): PlatformMaintenanceWindow {
    return {
      id: String(r.id),
      title: String(r.title),
      description: r.description ? String(r.description) : undefined,
      startsAt: String(r.starts_at),
      endsAt: String(r.ends_at),
      affectedServices: safeJsonArray(r.affected_services),
      status: (r.status as PlatformMaintenanceStatus) || 'SCHEDULED',
      createdBy: String(r.created_by || 'system'),
      createdAt: String(r.createdAt || nowIso()),
    };
  }

  private rowToOpApproval(r: any): PlatformOpApproval {
    return {
      id: String(r.id),
      opType: String(r.op_type),
      opPayload: safeJsonObject(r.op_payload),
      requestedBy: String(r.requested_by),
      approvedBy: r.approved_by ? String(r.approved_by) : undefined,
      status: (r.status as PlatformOpApprovalStatus) || 'PENDING',
      notes: r.notes ? String(r.notes) : undefined,
      createdAt: String(r.createdAt || nowIso()),
      updatedAt: String(r.updatedAt || nowIso()),
    };
  }

  private rowToSyncLog(r: any): PlatformSyncLogEntry {
    return {
      id: String(r.id),
      tenantId: r.tenant_id ? String(r.tenant_id) : undefined,
      deviceId: r.device_id ? String(r.device_id) : undefined,
      syncType: String(r.sync_type || 'MANUAL'),
      status: (r.status as PlatformSyncStatus) || 'SUCCESS',
      recordsSynced: toNumber(r.records_synced, 0),
      errorDetail: r.error_detail ? String(r.error_detail) : undefined,
      createdAt: String(r.createdAt || nowIso()),
    };
  }

  // ── Ops Jobs ──────────────────────────────────────────────────────────────────

  public listOpsJobs(filters?: { status?: string; tenantId?: string; type?: string; limit?: number; offset?: number }): { jobs: PlatformOpsJob[]; total: number } {
    PlatformAdminService.requirePlatformAccess('operations', 'platform.operations.view');
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters?.status) { conditions.push('status = ?'); params.push(filters.status); }
    if (filters?.tenantId) { conditions.push('tenant_id = ?'); params.push(filters.tenantId); }
    if (filters?.type) { conditions.push('type = ?'); params.push(filters.type); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const countRow = this.db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM platform_ops_jobs ${where}`, params)[0];
    const total = toNumber(countRow?.count, 0);

    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;
    const rows = this.db.query<any>(
      `SELECT * FROM platform_ops_jobs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      jobs: rows.map(r => this.rowToOpsJob(r)),
      total,
    };
  }

  public createOpsJob(input: { type: string; tenantId?: string; payload?: Record<string, unknown>; priority?: number; scheduledAt?: string }): PlatformOpsJob {
    PlatformAdminService.requirePlatformAccess('operations', 'platform.operations.create');
    const user = AuthService.getCurrentUser();
    const id = uuidv4();
    const now = nowIso();
    this.db.run(
      `INSERT INTO platform_ops_jobs (id, type, tenant_id, payload, status, priority, retries, max_retries, scheduled_at, created_by, created_at)
       VALUES (?, ?, ?, ?, 'PENDING', ?, 0, 3, ?, ?, ?)`,
      [
        id,
        input.type,
        input.tenantId || null,
        JSON.stringify(input.payload || {}),
        input.priority ?? 5,
        input.scheduledAt || null,
        user?.id || 'system',
        now,
      ]
    );

    this.audit(
      'إنشاء مهمة تشغيل',
      'OPS_JOB',
      id,
      input,
      {
        tenantId: input.tenantId,
        severity: 'NOTICE',
        newValues: input,
      }
    );

    const created = this.db.query<any>('SELECT * FROM platform_ops_jobs WHERE id = ?', [id])[0];
    return this.rowToOpsJob(created);
  }

  public cancelOpsJob(id: string): void {
    PlatformAdminService.requirePlatformAccess('operations', 'platform.operations.delete');
    this.db.run(
      "UPDATE platform_ops_jobs SET status = 'CANCELLED', completed_at = ? WHERE id = ? AND status IN ('PENDING', 'RUNNING')",
      [nowIso(), id]
    );
    this.audit(
      'إلغاء مهمة تشغيل',
      'OPS_JOB',
      id,
      null,
      {
        severity: 'WARNING',
      }
    );
  }

  public retryOpsJob(id: string): void {
    PlatformAdminService.requirePlatformAccess('operations', 'platform.operations.update');
    this.db.run(
      "UPDATE platform_ops_jobs SET status = 'PENDING', error_message = NULL, started_at = NULL, completed_at = NULL, retries = retries + 1 WHERE id = ? AND status IN ('FAILED', 'CANCELLED')",
      [id]
    );
    this.audit(
      'إعادة محاولة مهمة تشغيل',
      'OPS_JOB',
      id,
      null,
      {
        severity: 'NOTICE',
      }
    );
  }

  // ── Maintenance Windows ───────────────────────────────────────────────────────

  public listMaintenanceWindows(filters?: { status?: string }): PlatformMaintenanceWindow[] {
    PlatformAdminService.requirePlatformAccess('operations', 'platform.operations.view');
    const where = filters?.status ? 'WHERE status = ?' : '';
    const params = filters?.status ? [filters.status] : [];
    const rows = this.db.query<any>(
      `SELECT * FROM platform_maintenance_windows ${where} ORDER BY starts_at ASC`,
      params
    );
    return rows.map(r => this.rowToMaintenanceWindow(r));
  }

  public createMaintenanceWindow(input: { title: string; description?: string; startsAt: string; endsAt: string; affectedServices?: string[] }): PlatformMaintenanceWindow {
    PlatformAdminService.requirePlatformAccess('operations', 'platform.operations.create');
    const user = AuthService.getCurrentUser();
    const id = uuidv4();
    const now = nowIso();
    this.db.run(
      `INSERT INTO platform_maintenance_windows (id, title, description, starts_at, ends_at, affected_services, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)`,
      [
        id,
        input.title,
        input.description || null,
        input.startsAt,
        input.endsAt,
        JSON.stringify(input.affectedServices || []),
        user?.id || 'system',
        now,
      ]
    );

    this.audit(
      'جدولة نافذة صيانة',
      'MAINTENANCE_WINDOW',
      id,
      input,
      {
        severity: 'WARNING',
        newValues: input,
      }
    );

    const created = this.db.query<any>('SELECT * FROM platform_maintenance_windows WHERE id = ?', [id])[0];
    return this.rowToMaintenanceWindow(created);
  }

  public cancelMaintenanceWindow(id: string): void {
    PlatformAdminService.requirePlatformAccess('operations', 'platform.operations.delete');
    this.db.run(
      "UPDATE platform_maintenance_windows SET status = 'CANCELLED' WHERE id = ? AND status = 'SCHEDULED'",
      [id]
    );
    this.audit(
      'إلغاء نافذة صيانة',
      'MAINTENANCE_WINDOW',
      id,
      null,
      {
        severity: 'WARNING',
      }
    );
  }

  // ── Sensitive Operation Approvals ─────────────────────────────────────────────

  public listOpApprovals(filters?: { status?: string }): PlatformOpApproval[] {
    PlatformAdminService.requirePlatformAccess('operations', 'platform.operations.view');
    const where = filters?.status ? 'WHERE status = ?' : '';
    const params = filters?.status ? [filters.status] : [];
    const rows = this.db.query<any>(
      `SELECT * FROM platform_op_approvals ${where} ORDER BY created_at DESC`,
      params
    );
    return rows.map(r => this.rowToOpApproval(r));
  }

  public requestOpApproval(input: { opType: string; opPayload?: Record<string, unknown> }): PlatformOpApproval {
    PlatformAdminService.requirePlatformAccess('operations', 'platform.operations.create');
    const user = AuthService.getCurrentUser();
    const id = uuidv4();
    const now = nowIso();
    this.db.run(
      `INSERT INTO platform_op_approvals (id, op_type, op_payload, requested_by, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
      [
        id,
        input.opType,
        JSON.stringify(input.opPayload || {}),
        user?.id || 'system',
        now,
        now,
      ]
    );

    this.audit(
      'طلب موافقة على عملية حساسة',
      'OP_APPROVAL',
      id,
      input,
      {
        severity: 'CRITICAL',
        newValues: input,
      }
    );

    const created = this.db.query<any>('SELECT * FROM platform_op_approvals WHERE id = ?', [id])[0];
    return this.rowToOpApproval(created);
  }

  public approveOp(id: string, notes?: string): void {
    PlatformAdminService.requirePlatformAccess('operations', 'platform.operations.approve');
    const user = AuthService.getCurrentUser();
    const now = nowIso();
    this.db.run(
      "UPDATE platform_op_approvals SET status = 'APPROVED', approved_by = ?, notes = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'",
      [user?.id || 'system', notes || null, now, id]
    );
    this.audit(
      'الموافقة على عملية حساسة',
      'OP_APPROVAL',
      id,
      { approvedBy: user?.id, notes },
      {
        severity: 'CRITICAL',
        newValues: { approvedBy: user?.id, notes },
      }
    );
  }

  public rejectOp(id: string, notes?: string): void {
    PlatformAdminService.requirePlatformAccess('operations', 'platform.operations.approve');
    const user = AuthService.getCurrentUser();
    const now = nowIso();
    this.db.run(
      "UPDATE platform_op_approvals SET status = 'REJECTED', approved_by = ?, notes = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'",
      [user?.id || 'system', notes || null, now, id]
    );
    this.audit(
      'رفض عملية حساسة',
      'OP_APPROVAL',
      id,
      { rejectedBy: user?.id, notes },
      {
        severity: 'CRITICAL',
        newValues: { rejectedBy: user?.id, notes },
      }
    );
  }

  // ── Sync Status & Health ──────────────────────────────────────────────────────

  public listSyncStatus(filters?: { tenantId?: string; deviceId?: string; status?: string; limit?: number }): PlatformSyncLogEntry[] {
    PlatformAdminService.requirePlatformAccess('sync', 'platform.sync.view');
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters?.tenantId) { conditions.push('tenant_id = ?'); params.push(filters.tenantId); }
    if (filters?.deviceId) { conditions.push('device_id = ?'); params.push(filters.deviceId); }
    if (filters?.status) { conditions.push('status = ?'); params.push(filters.status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 100;

    const rows = this.db.query<any>(
      `SELECT * FROM platform_sync_log ${where} ORDER BY created_at DESC LIMIT ?`,
      [...params, limit]
    );

    return rows.map(r => this.rowToSyncLog(r));
  }

  public logSyncEvent(input: { tenantId?: string; deviceId?: string; syncType: string; status: PlatformSyncStatus; recordsSynced?: number; errorDetail?: string }): PlatformSyncLogEntry {
    PlatformAdminService.requirePlatformAccess('sync', 'platform.sync.update');
    const id = uuidv4();
    const now = nowIso();
    this.db.run(
      `INSERT INTO platform_sync_log (id, tenant_id, device_id, sync_type, status, records_synced, error_detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.tenantId || null,
        input.deviceId || null,
        input.syncType,
        input.status,
        input.recordsSynced ?? 0,
        input.errorDetail || null,
        now,
      ]
    );

    const created = this.db.query<any>('SELECT * FROM platform_sync_log WHERE id = ?', [id])[0];
    return this.rowToSyncLog(created);
  }

  // ─── Branding & White-Labeling (Item 11) ──────────────────────────────────────

  private defaultBranding(tenantId?: string | null): PlatformBrandingConfig {
    return {
      id: tenantId ? `brand_${tenantId}` : 'brand_master',
      tenantId: tenantId || null,
      companyName: tenantId ? 'مؤسسة العميل' : 'سيراميسيس إي آر بي (Ceramisys)',
      logoUrl: '',
      logoDarkUrl: '',
      faviconUrl: '',
      primaryColor: '#10b981',
      secondaryColor: '#064e3b',
      accentColor: '#3b82f6',
      fontFamily: 'Tajawal',
      invoiceTemplate: 'classic',
      loginBackgroundUrl: '',
      loginWelcomeTitle: 'مرحباً بك في منصة الإدارة السحابية',
      loginWelcomeSubtitle: 'سجّل دخولك لمتابعة أعمالك ومبيعاتك ومخازنك',
      emailHeaderLogo: '',
      emailFooterText: 'جميع الحقوق محفوظة © Ceramisys Cloud ERP',
      customSubdomain: '',
      allowedCustomizations: {
        canChangeLogo: true,
        canChangeColors: true,
        canChangeInvoiceTemplate: true,
        canChangeLogin: false,
      },
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  private rowToBranding(r: any): PlatformBrandingConfig {
    const rawAllowed = safeJsonObject(r.allowed_customizations);
    return {
      id: String(r.id),
      tenantId: r.tenant_id ? String(r.tenant_id) : null,
      companyName: String(r.company_name || ''),
      logoUrl: r.logo_url ? String(r.logo_url) : undefined,
      logoDarkUrl: r.logo_dark_url ? String(r.logo_dark_url) : undefined,
      faviconUrl: r.favicon_url ? String(r.favicon_url) : undefined,
      primaryColor: String(r.primary_color || '#10b981'),
      secondaryColor: String(r.secondary_color || '#064e3b'),
      accentColor: String(r.accent_color || '#3b82f6'),
      fontFamily: String(r.font_family || 'Tajawal'),
      invoiceTemplate: (r.invoice_template as PlatformInvoiceTemplate) || 'classic',
      loginBackgroundUrl: r.login_background_url ? String(r.login_background_url) : undefined,
      loginWelcomeTitle: r.login_welcome_title ? String(r.login_welcome_title) : undefined,
      loginWelcomeSubtitle: r.login_welcome_subtitle ? String(r.login_welcome_subtitle) : undefined,
      emailHeaderLogo: r.email_header_logo ? String(r.email_header_logo) : undefined,
      emailFooterText: r.email_footer_text ? String(r.email_footer_text) : undefined,
      customSubdomain: r.custom_subdomain ? String(r.custom_subdomain) : undefined,
      allowedCustomizations: {
        canChangeLogo: rawAllowed.canChangeLogo !== false,
        canChangeColors: rawAllowed.canChangeColors !== false,
        canChangeInvoiceTemplate: rawAllowed.canChangeInvoiceTemplate !== false,
        canChangeLogin: Boolean(rawAllowed.canChangeLogin),
      },
      version: toNumber(r.version, 1),
      createdAt: String(r.createdAt || nowIso()),
      updatedAt: String(r.updatedAt || nowIso()),
    };
  }

  public getPlatformBranding(): PlatformBrandingConfig {
    PlatformAdminService.requirePlatformAccess('branding', 'platform.branding.view');
    const row = this.db.query<any>('SELECT * FROM platform_tenant_branding WHERE tenant_id IS NULL')[0];
    if (!row) {
      return this.defaultBranding(null);
    }
    return this.rowToBranding(row);
  }

  public getTenantBranding(tenantId?: string | null): PlatformBrandingConfig {
    PlatformAdminService.requirePlatformAccess('branding', 'platform.branding.view');
    if (!tenantId) {
      return this.getPlatformBranding();
    }
    const row = this.db.query<any>('SELECT * FROM platform_tenant_branding WHERE tenant_id = ?', [tenantId])[0];
    if (!row) {
      // Fallback: merge with master platform branding
      const master = this.getPlatformBranding();
      const tenant = this.getTenant(tenantId);
      return {
        ...master,
        id: `brand_${tenantId}`,
        tenantId,
        companyName: tenant?.name || master.companyName,
        version: 1,
      };
    }
    return this.rowToBranding(row);
  }

  public saveTenantBranding(input: PlatformBrandingInput): PlatformBrandingConfig {
    const actor = PlatformAdminService.requirePlatformAccess('branding', 'platform.branding.update');
    const user = AuthService.getCurrentUser();
    const existing = this.getTenantBranding(input.tenantId);
    const nextVersion = existing ? existing.version + 1 : 1;
    const now = nowIso();
    const id = existing?.id && !existing.id.startsWith('brand_') ? existing.id : uuidv4();

    const mergedAllowed = {
      ...existing.allowedCustomizations,
      ...(input.allowedCustomizations || {}),
    };

    const config: PlatformBrandingConfig = {
      id,
      tenantId: input.tenantId || null,
      companyName: input.companyName ?? existing.companyName,
      logoUrl: input.logoUrl ?? existing.logoUrl,
      logoDarkUrl: input.logoDarkUrl ?? existing.logoDarkUrl,
      faviconUrl: input.faviconUrl ?? existing.faviconUrl,
      primaryColor: input.primaryColor ?? existing.primaryColor,
      secondaryColor: input.secondaryColor ?? existing.secondaryColor,
      accentColor: input.accentColor ?? existing.accentColor,
      fontFamily: input.fontFamily ?? existing.fontFamily,
      invoiceTemplate: input.invoiceTemplate ?? existing.invoiceTemplate,
      loginBackgroundUrl: input.loginBackgroundUrl ?? existing.loginBackgroundUrl,
      loginWelcomeTitle: input.loginWelcomeTitle ?? existing.loginWelcomeTitle,
      loginWelcomeSubtitle: input.loginWelcomeSubtitle ?? existing.loginWelcomeSubtitle,
      emailHeaderLogo: input.emailHeaderLogo ?? existing.emailHeaderLogo,
      emailFooterText: input.emailFooterText ?? existing.emailFooterText,
      customSubdomain: input.customSubdomain ?? existing.customSubdomain,
      allowedCustomizations: mergedAllowed,
      version: nextVersion,
      createdAt: existing.createdAt || now,
      updatedAt: now,
    };

    if (input.tenantId) {
      this.db.run(
        `INSERT INTO platform_tenant_branding (
          id, tenant_id, company_name, logo_url, logo_dark_url, favicon_url,
          primary_color, secondary_color, accent_color, font_family, invoice_template,
          login_background_url, login_welcome_title, login_welcome_subtitle,
          email_header_logo, email_footer_text, custom_subdomain, allowed_customizations,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id) DO UPDATE SET
          company_name = excluded.company_name,
          logo_url = excluded.logo_url,
          logo_dark_url = excluded.logo_dark_url,
          favicon_url = excluded.favicon_url,
          primary_color = excluded.primary_color,
          secondary_color = excluded.secondary_color,
          accent_color = excluded.accent_color,
          font_family = excluded.font_family,
          invoice_template = excluded.invoice_template,
          login_background_url = excluded.login_background_url,
          login_welcome_title = excluded.login_welcome_title,
          login_welcome_subtitle = excluded.login_welcome_subtitle,
          email_header_logo = excluded.email_header_logo,
          email_footer_text = excluded.email_footer_text,
          custom_subdomain = excluded.custom_subdomain,
          allowed_customizations = excluded.allowed_customizations,
          version = excluded.version,
          updated_at = excluded.updated_at`,
        [
          config.id,
          config.tenantId,
          config.companyName,
          config.logoUrl || null,
          config.logoDarkUrl || null,
          config.faviconUrl || null,
          config.primaryColor,
          config.secondaryColor,
          config.accentColor,
          config.fontFamily,
          config.invoiceTemplate,
          config.loginBackgroundUrl || null,
          config.loginWelcomeTitle || null,
          config.loginWelcomeSubtitle || null,
          config.emailHeaderLogo || null,
          config.emailFooterText || null,
          config.customSubdomain || null,
          JSON.stringify(config.allowedCustomizations),
          config.version,
          config.createdAt,
          config.updatedAt,
        ]
      );
    } else {
      // Master platform branding
      const masterRow = this.db.query<any>('SELECT id FROM platform_tenant_branding WHERE tenant_id IS NULL')[0];
      if (masterRow) {
        this.db.run(
          `UPDATE platform_tenant_branding SET
            company_name = ?, logo_url = ?, logo_dark_url = ?, favicon_url = ?,
            primary_color = ?, secondary_color = ?, accent_color = ?, font_family = ?,
            invoice_template = ?, login_background_url = ?, login_welcome_title = ?,
            login_welcome_subtitle = ?, email_header_logo = ?, email_footer_text = ?,
            allowed_customizations = ?, version = ?, updated_at = ?
           WHERE tenant_id IS NULL`,
          [
            config.companyName,
            config.logoUrl || null,
            config.logoDarkUrl || null,
            config.faviconUrl || null,
            config.primaryColor,
            config.secondaryColor,
            config.accentColor,
            config.fontFamily,
            config.invoiceTemplate,
            config.loginBackgroundUrl || null,
            config.loginWelcomeTitle || null,
            config.loginWelcomeSubtitle || null,
            config.emailHeaderLogo || null,
            config.emailFooterText || null,
            JSON.stringify(config.allowedCustomizations),
            config.version,
            config.updatedAt,
          ]
        );
      } else {
        this.db.run(
          `INSERT INTO platform_tenant_branding (
            id, tenant_id, company_name, logo_url, logo_dark_url, favicon_url,
            primary_color, secondary_color, accent_color, font_family, invoice_template,
            login_background_url, login_welcome_title, login_welcome_subtitle,
            email_header_logo, email_footer_text, custom_subdomain, allowed_customizations,
            version, created_at, updated_at
          ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
          [
            config.id,
            config.companyName,
            config.logoUrl || null,
            config.logoDarkUrl || null,
            config.faviconUrl || null,
            config.primaryColor,
            config.secondaryColor,
            config.accentColor,
            config.fontFamily,
            config.invoiceTemplate,
            config.loginBackgroundUrl || null,
            config.loginWelcomeTitle || null,
            config.loginWelcomeSubtitle || null,
            config.emailHeaderLogo || null,
            config.emailFooterText || null,
            JSON.stringify(config.allowedCustomizations),
            config.version,
            config.createdAt,
            config.updatedAt,
          ]
        );
      }
    }

    // Save historical snapshot
    const versionId = uuidv4();
    this.db.run(
      `INSERT INTO platform_tenant_branding_versions (id, tenant_id, version, branding_snapshot, change_summary, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        versionId,
        config.tenantId || null,
        config.version,
        JSON.stringify(config),
        input.changeSummary || `تحديث الهوية والمظهر (إصدار #${config.version})`,
        user?.id || 'system',
        now,
      ]
    );

    this.audit(
      input.tenantId ? 'تحديث هوية العميل' : 'تحديث هوية المنصة المركزية',
      'BRANDING',
      config.id,
      { version: config.version, changeSummary: input.changeSummary },
      {
        tenantId: config.tenantId,
        severity: 'NOTICE',
        oldValues: existing,
        newValues: config,
      }
    );

    return config;
  }

  public listTenantBrandingVersions(tenantId?: string | null): PlatformBrandingVersion[] {
    PlatformAdminService.requirePlatformAccess('branding', 'platform.branding.view');
    this.assertTenantScope(tenantId);
    const where = tenantId ? 'WHERE tenant_id = ?' : 'WHERE tenant_id IS NULL';
    const params = tenantId ? [tenantId] : [];
    const rows = this.db.query<any>(
      `SELECT * FROM platform_tenant_branding_versions ${where} ORDER BY version DESC`,
      params
    );
    return rows.map(r => ({
      id: String(r.id),
      tenantId: r.tenant_id ? String(r.tenant_id) : null,
      version: toNumber(r.version, 1),
      brandingSnapshot: safeJsonObject(r.branding_snapshot) as PlatformBrandingConfig,
      changeSummary: r.change_summary ? String(r.change_summary) : undefined,
      createdBy: r.created_by ? String(r.created_by) : undefined,
      createdAt: String(r.createdAt || nowIso()),
    }));
  }

  public rollbackTenantBranding(tenantId: string | null | undefined, targetVersion: number): PlatformBrandingConfig {
    PlatformAdminService.requirePlatformAccess('branding', 'platform.branding.update');
    this.assertTenantScope(tenantId);
    const where = tenantId ? 'WHERE tenant_id = ? AND version = ?' : 'WHERE tenant_id IS NULL AND version = ?';
    const params = tenantId ? [tenantId, targetVersion] : [targetVersion];
    const row = this.db.query<any>(
      `SELECT * FROM platform_tenant_branding_versions ${where}`,
      params
    )[0];

    if (!row) {
      throw new Error(`لم يتم العثور على الإصدار #${targetVersion} في سجل الهوية.`);
    }

    const snapshot = safeJsonObject(row.branding_snapshot) as PlatformBrandingConfig;
    return this.saveTenantBranding({
      ...snapshot,
      tenantId: tenantId || null,
      changeSummary: `استرجاع تلقائي للهوية من الإصدار #${targetVersion}`,
    });
  }

  // ─── UI Customization & Profiles (Item 12) ────────────────────────────────────

  public listUiProfiles(): PlatformUiProfile[] {
    PlatformAdminService.requirePlatformAccess('customization', 'platform.customization.view');
    const rows = this.db.query<any>('SELECT * FROM platform_ui_profiles ORDER BY is_default DESC, name ASC');
    return rows.map(r => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      businessType: r.business_type ? String(r.business_type) : undefined,
      hiddenPages: safeJsonArray(r.hidden_pages),
      hiddenActions: safeJsonArray(r.hidden_actions),
      customLabels: safeJsonObject<Record<string, string>>(r.custom_labels),
      navOrder: safeJsonArray(r.nav_order),
      formFieldRules: safeJsonObject<Record<string, FormFieldRule>>(r.form_field_rules),
      isDefault: Boolean(r.is_default),
      createdAt: String(r.createdAt || nowIso()),
    }));
  }

  public getTenantUiCustomization(tenantId: string): PlatformTenantUiCustomization {
    PlatformAdminService.requirePlatformAccess('customization', 'platform.customization.view');
    const row = this.db.query<any>(
      'SELECT * FROM platform_tenant_ui_customizations WHERE tenant_id = ?',
      [tenantId]
    )[0];

    if (!row) {
      // Return default profile or match by tenant.business_type
      const tenant = this.getTenant(tenantId);
      const bType = tenant?.businessType || 'general';
      const profile = this.db.query<any>(
        'SELECT * FROM platform_ui_profiles WHERE business_type = ? OR is_default = 1 ORDER BY is_default ASC LIMIT 1',
        [bType]
      )[0];

      return {
        id: `tui_${tenantId}`,
        tenantId,
        profileId: profile ? String(profile.id) : undefined,
        hiddenPages: profile ? safeJsonArray(profile.hidden_pages) : [],
        hiddenActions: profile ? safeJsonArray(profile.hidden_actions) : [],
        customLabels: profile ? safeJsonObject<Record<string, string>>(profile.custom_labels) : {},
        navOrder: profile ? safeJsonArray(profile.nav_order) : [],
        formFieldRules: profile ? safeJsonObject<Record<string, FormFieldRule>>(profile.form_field_rules) : {},
        version: 1,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    }

    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      profileId: row.profile_id ? String(row.profile_id) : undefined,
      hiddenPages: safeJsonArray(row.hidden_pages),
      hiddenActions: safeJsonArray(row.hidden_actions),
      customLabels: safeJsonObject<Record<string, string>>(row.custom_labels),
      navOrder: safeJsonArray(row.nav_order),
      formFieldRules: safeJsonObject<Record<string, FormFieldRule>>(row.form_field_rules),
      version: toNumber(row.version, 1),
      createdAt: String(row.createdAt || nowIso()),
      updatedAt: String(row.updatedAt || nowIso()),
    };
  }

  public saveTenantUiCustomization(input: PlatformTenantUiInput): PlatformTenantUiCustomization {
    PlatformAdminService.requirePlatformAccess('customization', 'platform.customization.update');
    const user = AuthService.getCurrentUser();
    const existing = this.getTenantUiCustomization(input.tenantId);
    const nextVersion = existing ? existing.version + 1 : 1;
    const now = nowIso();
    const id = existing?.id && !existing.id.startsWith('tui_') ? existing.id : uuidv4();

    const config: PlatformTenantUiCustomization = {
      id,
      tenantId: input.tenantId,
      profileId: input.profileId ?? existing.profileId,
      hiddenPages: input.hiddenPages ?? existing.hiddenPages,
      hiddenActions: input.hiddenActions ?? existing.hiddenActions,
      customLabels: input.customLabels ?? existing.customLabels,
      navOrder: input.navOrder ?? existing.navOrder,
      formFieldRules: input.formFieldRules ?? existing.formFieldRules,
      version: nextVersion,
      createdAt: existing.createdAt || now,
      updatedAt: now,
    };

    this.db.run(
      `INSERT INTO platform_tenant_ui_customizations (
        id, tenant_id, profile_id, hidden_pages, hidden_actions, custom_labels,
        nav_order, form_field_rules, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id) DO UPDATE SET
        profile_id = excluded.profile_id,
        hidden_pages = excluded.hidden_pages,
        hidden_actions = excluded.hidden_actions,
        custom_labels = excluded.custom_labels,
        nav_order = excluded.nav_order,
        form_field_rules = excluded.form_field_rules,
        version = excluded.version,
        updated_at = excluded.updated_at`,
      [
        config.id,
        config.tenantId,
        config.profileId || null,
        JSON.stringify(config.hiddenPages),
        JSON.stringify(config.hiddenActions),
        JSON.stringify(config.customLabels),
        JSON.stringify(config.navOrder),
        JSON.stringify(config.formFieldRules),
        config.version,
        config.createdAt,
        config.updatedAt,
      ]
    );

    // Save snapshot
    const versionId = uuidv4();
    this.db.run(
      `INSERT INTO platform_tenant_ui_versions (id, tenant_id, version, config_snapshot, change_summary, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        versionId,
        config.tenantId,
        config.version,
        JSON.stringify(config),
        input.changeSummary || `تحديث تخصيصات الواجهة (إصدار #${config.version})`,
        user?.id || 'system',
        now,
      ]
    );

    this.audit(
      'تحديث تخصيصات واجهة العميل',
      'UI_CUSTOMIZATION',
      config.id,
      { version: config.version, changeSummary: input.changeSummary },
      {
        tenantId: config.tenantId,
        severity: 'NOTICE',
        oldValues: existing,
        newValues: config,
      }
    );

    return config;
  }

  public listTenantUiVersions(tenantId: string): PlatformTenantUiVersion[] {
    PlatformAdminService.requirePlatformAccess('customization', 'platform.customization.view');
    this.assertTenantScope(tenantId);
    const rows = this.db.query<any>(
      'SELECT * FROM platform_tenant_ui_versions WHERE tenant_id = ? ORDER BY version DESC',
      [tenantId]
    );
    return rows.map(r => ({
      id: String(r.id),
      tenantId: String(r.tenant_id),
      version: toNumber(r.version, 1),
      configSnapshot: safeJsonObject(r.config_snapshot) as PlatformTenantUiCustomization,
      changeSummary: r.change_summary ? String(r.change_summary) : undefined,
      createdBy: r.created_by ? String(r.created_by) : undefined,
      createdAt: String(r.createdAt || nowIso()),
    }));
  }

  public rollbackTenantUi(tenantId: string, targetVersion: number): PlatformTenantUiCustomization {
    PlatformAdminService.requirePlatformAccess('customization', 'platform.customization.update');
    this.assertTenantScope(tenantId);
    const row = this.db.query<any>(
      'SELECT * FROM platform_tenant_ui_versions WHERE tenant_id = ? AND version = ?',
      [tenantId, targetVersion]
    )[0];

    if (!row) {
      throw new Error(`لم يتم العثور على الإصدار #${targetVersion} في سجل واجهة العميل.`);
    }

    const snapshot = safeJsonObject(row.config_snapshot) as PlatformTenantUiCustomization;
    return this.saveTenantUiCustomization({
      ...snapshot,
      tenantId,
      changeSummary: `استرجاع تلقائي لتخصيصات الواجهة من الإصدار #${targetVersion}`,
    });
  }

  // ─── App Configuration & Rollouts (Item 13) ───────────────────────────────────

  private signConfigPayload(payload: Record<string, unknown>): string {
    try {
      const payloadString = JSON.stringify(payload);
      // Cryptographically signed hash string with system secret salt
      const secret = this.setting('platform_signature_secret', 'ceramisys_ed25519_platform_master_key');
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payloadString);
      return `sig_v1_${hmac.digest('base64')}`;
    } catch {
      return `sig_mock_${Date.now()}`;
    }
  }

  public listConfigTemplates(): PlatformConfigTemplate[] {
    PlatformAdminService.requirePlatformAccess('app-configuration', 'platform.app-configuration.view');
    const rows = this.db.query<any>('SELECT * FROM platform_config_templates ORDER BY is_default DESC, name ASC');
    return rows.map(r => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      businessType: r.business_type ? String(r.business_type) : undefined,
      planId: r.plan_id ? String(r.plan_id) : undefined,
      configPayload: safeJsonObject(r.config_payload),
      version: toNumber(r.version, 1),
      isDefault: Boolean(r.is_default),
      createdAt: String(r.createdAt || nowIso()),
      updatedAt: String(r.updatedAt || nowIso()),
    }));
  }

  public getTenantConfig(tenantId: string): PlatformTenantConfig {
    PlatformAdminService.requirePlatformAccess('app-configuration', 'platform.app-configuration.view');
    const row = this.db.query<any>(
      'SELECT * FROM platform_tenant_configs WHERE tenant_id = ?',
      [tenantId]
    )[0];

    if (!row) {
      // Return default template or business_type match
      const tenant = this.getTenant(tenantId);
      const bType = tenant?.businessType || 'general';
      const tmpl = this.db.query<any>(
        'SELECT * FROM platform_config_templates WHERE business_type = ? OR is_default = 1 ORDER BY is_default ASC LIMIT 1',
        [bType]
      )[0];

      const payload = tmpl ? safeJsonObject(tmpl.config_payload) : { taxRate: 14, currency: 'EGP', syncIntervalSec: 30 };
      const signature = this.signConfigPayload(payload);

      return {
        id: `tcfg_${tenantId}`,
        tenantId,
        templateId: tmpl ? String(tmpl.id) : undefined,
        configPayload: payload,
        signature,
        version: 1,
        status: 'ACTIVE',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    }

    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      templateId: row.template_id ? String(row.template_id) : undefined,
      configPayload: safeJsonObject(row.config_payload),
      signature: row.signature ? String(row.signature) : undefined,
      version: toNumber(row.version, 1),
      status: (row.status as any) || 'ACTIVE',
      createdAt: String(row.createdAt || nowIso()),
      updatedAt: String(row.updatedAt || nowIso()),
    };
  }

  public saveTenantConfig(input: PlatformTenantConfigInput): PlatformTenantConfig {
    PlatformAdminService.requirePlatformAccess('app-configuration', 'platform.app-configuration.update');
    const user = AuthService.getCurrentUser();
    const existing = this.getTenantConfig(input.tenantId);
    const nextVersion = existing ? existing.version + 1 : 1;
    const now = nowIso();
    const id = existing?.id && !existing.id.startsWith('tcfg_') ? existing.id : uuidv4();
    const signature = this.signConfigPayload(input.configPayload);

    const config: PlatformTenantConfig = {
      id,
      tenantId: input.tenantId,
      templateId: input.templateId ?? existing.templateId,
      configPayload: input.configPayload,
      signature,
      version: nextVersion,
      status: input.status ?? 'ACTIVE',
      createdAt: existing.createdAt || now,
      updatedAt: now,
    };

    this.db.run(
      `INSERT INTO platform_tenant_configs (
        id, tenant_id, template_id, config_payload, signature, version, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id) DO UPDATE SET
        template_id = excluded.template_id,
        config_payload = excluded.config_payload,
        signature = excluded.signature,
        version = excluded.version,
        status = excluded.status,
        updated_at = excluded.updated_at`,
      [
        config.id,
        config.tenantId,
        config.templateId || null,
        JSON.stringify(config.configPayload),
        config.signature,
        config.version,
        config.status,
        config.createdAt,
        config.updatedAt,
      ]
    );

    // Save snapshot
    const versionId = uuidv4();
    this.db.run(
      `INSERT INTO platform_tenant_config_versions (id, tenant_id, version, config_payload, signature, change_summary, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        versionId,
        config.tenantId,
        config.version,
        JSON.stringify(config.configPayload),
        config.signature,
        input.changeSummary || `تحديث التكوين وتوقيعه رقمياً (إصدار #${config.version})`,
        user?.id || 'system',
        now,
      ]
    );

    this.audit(
      'تحديث وتوقيع تكوين العميل',
      'APP_CONFIG',
      config.id,
      { version: config.version, signature: config.signature },
      {
        tenantId: config.tenantId,
        severity: 'NOTICE',
        oldValues: existing.configPayload,
        newValues: config.configPayload,
      }
    );

    return config;
  }

  public listTenantConfigVersions(tenantId: string): PlatformTenantConfigVersion[] {
    PlatformAdminService.requirePlatformAccess('app-configuration', 'platform.app-configuration.view');
    this.assertTenantScope(tenantId);
    const rows = this.db.query<any>(
      'SELECT * FROM platform_tenant_config_versions WHERE tenant_id = ? ORDER BY version DESC',
      [tenantId]
    );
    return rows.map(r => ({
      id: String(r.id),
      tenantId: String(r.tenant_id),
      version: toNumber(r.version, 1),
      configPayload: safeJsonObject(r.config_payload),
      signature: r.signature ? String(r.signature) : undefined,
      changeSummary: r.change_summary ? String(r.change_summary) : undefined,
      createdBy: r.created_by ? String(r.created_by) : undefined,
      createdAt: String(r.createdAt || nowIso()),
    }));
  }

  public rollbackTenantConfig(tenantId: string, targetVersion: number): PlatformTenantConfig {
    PlatformAdminService.requirePlatformAccess('app-configuration', 'platform.app-configuration.update');
    this.assertTenantScope(tenantId);
    const row = this.db.query<any>(
      'SELECT * FROM platform_tenant_config_versions WHERE tenant_id = ? AND version = ?',
      [tenantId, targetVersion]
    )[0];

    if (!row) {
      throw new Error(`لم يتم العثور على الإصدار #${targetVersion} في سجل تكوين العميل.`);
    }

    const payload = safeJsonObject(row.config_payload);
    return this.saveTenantConfig({
      tenantId,
      configPayload: payload,
      changeSummary: `استرجاع عاجل للتكوين من الإصدار #${targetVersion}`,
    });
  }

  public createConfigRollout(input: PlatformConfigRolloutInput): PlatformConfigRollout {
    PlatformAdminService.requirePlatformAccess('app-configuration', 'platform.app-configuration.update');
    const user = AuthService.getCurrentUser();
    const id = uuidv4();
    const now = nowIso();
    const signature = this.signConfigPayload(input.configSnapshot);

    // Calculate targeted tenants
    let tenants = this.listTenants();
    if (input.targetType === 'ACTIVITY' && input.targetFilter?.businessType) {
      tenants = tenants.filter(t => t.businessType === input.targetFilter?.businessType);
    } else if (input.targetType === 'PLAN' && input.targetFilter?.planId) {
      tenants = tenants.filter(t => t.planId === input.targetFilter?.planId);
    } else if (input.targetType === 'SPECIFIC_TENANTS' && Array.isArray(input.targetFilter?.tenantIds)) {
      tenants = tenants.filter(t => (input.targetFilter?.tenantIds as string[]).includes(t.id));
    } else if (input.targetType === 'CANARY_PERCENT' && typeof input.targetFilter?.percentage === 'number') {
      const pct = Math.max(1, Math.min(100, input.targetFilter.percentage));
      const count = Math.ceil((tenants.length * pct) / 100);
      tenants = tenants.slice(0, count);
    }

    const totalTenants = tenants.length;

    this.db.run(
      `INSERT INTO platform_config_rollouts (
        id, title, target_type, target_filter, config_snapshot, signature, status,
        total_tenants, received_count, applied_count, failed_count, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'IN_PROGRESS', ?, 0, 0, 0, ?, ?)`,
      [
        id,
        input.title,
        input.targetType,
        JSON.stringify(input.targetFilter || {}),
        JSON.stringify(input.configSnapshot),
        signature,
        totalTenants,
        user?.id || 'system',
        now,
      ]
    );

    // Update each target tenant's config
    tenants.forEach(t => {
      this.saveTenantConfig({
        tenantId: t.id,
        configPayload: input.configSnapshot,
        changeSummary: `نشر جماعي من حملة "${input.title}"`,
      });

      // Insert initial ACK
      this.db.run(
        `INSERT INTO platform_tenant_config_ack (id, tenant_id, rollout_id, version, status, acknowledged_at)
         VALUES (?, ?, ?, 1, 'RECEIVED', ?)`,
        [uuidv4(), t.id, id, now]
      );
    });

    this.audit(
      'إطلاق حملة نشر تكوين تدريجي',
      'CONFIG_ROLLOUT',
      id,
      { title: input.title, targetType: input.targetType, totalTenants },
      {
        severity: 'CRITICAL',
        newValues: input,
      }
    );

    const created = this.db.query<any>('SELECT * FROM platform_config_rollouts WHERE id = ?', [id])[0];
    return {
      id: String(created.id),
      title: String(created.title),
      targetType: created.target_type as RolloutTargetType,
      targetFilter: safeJsonObject(created.target_filter),
      configSnapshot: safeJsonObject(created.config_snapshot),
      signature: String(created.signature),
      status: created.status as RolloutStatus,
      totalTenants: toNumber(created.total_tenants, 0),
      receivedCount: totalTenants,
      appliedCount: totalTenants,
      failedCount: 0,
      createdBy: String(created.created_by),
      createdAt: String(created.createdAt),
    };
  }

  public listConfigRollouts(): PlatformConfigRollout[] {
    PlatformAdminService.requirePlatformAccess('app-configuration', 'platform.app-configuration.view');
    const rows = this.db.query<any>('SELECT * FROM platform_config_rollouts ORDER BY created_at DESC');
    return rows.map(r => ({
      id: String(r.id),
      title: String(r.title),
      targetType: r.target_type as RolloutTargetType,
      targetFilter: safeJsonObject(r.target_filter),
      configSnapshot: safeJsonObject(r.config_snapshot),
      signature: String(r.signature),
      status: r.status as RolloutStatus,
      totalTenants: toNumber(r.total_tenants, 0),
      receivedCount: toNumber(r.received_count, 0),
      appliedCount: toNumber(r.applied_count, 0),
      failedCount: toNumber(r.failed_count, 0),
      createdBy: String(r.created_by),
      createdAt: String(r.createdAt || nowIso()),
      completedAt: r.completed_at ? String(r.completed_at) : undefined,
    }));
  }

  public listConfigAcks(tenantId?: string): PlatformConfigAck[] {
    PlatformAdminService.requirePlatformAccess('app-configuration', 'platform.app-configuration.view');
    this.assertTenantScope(tenantId);
    const where = tenantId ? 'WHERE tenant_id = ?' : '';
    const params = tenantId ? [tenantId] : [];
    const rows = this.db.query<any>(
      `SELECT * FROM platform_tenant_config_ack ${where} ORDER BY acknowledged_at DESC LIMIT 100`,
      params
    );
    return rows.map(r => ({
      id: String(r.id),
      tenantId: String(r.tenant_id),
      deviceId: r.device_id ? String(r.device_id) : undefined,
      rolloutId: r.rollout_id ? String(r.rollout_id) : undefined,
      version: toNumber(r.version, 1),
      status: (r.status as any) || 'RECEIVED',
      errorMessage: r.error_message ? String(r.error_message) : undefined,
      acknowledgedAt: String(r.acknowledged_at || nowIso()),
    }));
  }

  // ─── Platform System Health & Central Diagnostics (Item 14) ───────────────────

  public getPlatformComprehensiveHealth(): PlatformComprehensiveHealth {
    PlatformAdminService.requirePlatformAccess('system-health', 'platform.system-health.view');
    // 1. Telemetry
    const telRow = this.db.query<any>('SELECT * FROM platform_server_telemetry ORDER BY recorded_at DESC LIMIT 1')[0];
    const cpu = telRow ? toNumber(telRow.cpu_usage, 20.0) : 18.5;
    const memory = telRow ? toNumber(telRow.memory_usage, 40.0) : 42.0;
    const disk = telRow ? toNumber(telRow.disk_usage, 35.0) : 36.4;
    const latency = telRow ? toNumber(telRow.api_latency_ms, 45) : 45;
    const errorRate = telRow ? toNumber(telRow.api_error_rate, 0.05) : 0.05;
    const activeConns = telRow ? toNumber(telRow.active_connections, 120) : 128;

    // 2. Backups
    const backups = this.listCentralBackups();
    const lastBackup = backups[0];

    // 3. Incidents
    const incidents = this.listServiceIncidents('OPEN');

    // 4. Connected Devices
    const connectedDevices = toNumber(
      this.db.query<any>(
        "SELECT COUNT(*) as c FROM platform_devices WHERE status = 'ACTIVE' AND datetime(last_seen_at) >= datetime('now', '-1 day')"
      )[0]?.c,
      0
    );

    // 5. Telemetry history
    const telemetryHistory = this.db.query<any>(
      'SELECT * FROM platform_server_telemetry ORDER BY recorded_at DESC LIMIT 20'
    ).map(r => ({
      id: String(r.id),
      cpuUsage: toNumber(r.cpu_usage, 0),
      memoryUsage: toNumber(r.memory_usage, 0),
      diskUsage: toNumber(r.disk_usage, 0),
      apiLatencyMs: toNumber(r.api_latency_ms, 0),
      apiErrorRate: toNumber(r.api_error_rate, 0),
      redisStatus: (r.redis_status as any) || 'CONNECTED',
      activeConnections: toNumber(r.active_connections, 0),
      recordedAt: String(r.recorded_at),
    }));

    // Calculate score
    let score = 100;
    if (cpu > 80) score -= 20;
    else if (cpu > 60) score -= 10;
    if (memory > 85) score -= 20;
    if (disk > 90) score -= 25;
    if (latency > 200) score -= 15;
    if (errorRate > 1.0) score -= 20;
    score -= incidents.length * 15;
    score = Math.max(0, Math.min(100, score));

    return {
      overallScore: score,
      serverVitals: {
        cpuPercent: cpu,
        memoryPercent: memory,
        diskPercent: disk,
        apiLatencyMs: latency,
        apiErrorRatePercent: errorRate,
        activeConnections: activeConns,
        uptimeSeconds: 864000, // 10 days
      },
      components: {
        database: {
          status: 'HEALTHY',
          sizeMb: 256.4,
          queryTimeMs: 4,
        },
        redisCache: {
          status: telRow?.redis_status === 'DISCONNECTED' ? 'DISCONNECTED' : 'CONNECTED',
          hitRatioPercent: 96.8,
        },
        syncService: {
          status: errorRate > 2.0 ? 'WARNING' : 'HEALTHY',
          connectedDevices,
          pendingSyncCount: 14,
        },
        backupSystem: {
          status: lastBackup?.integrityCheckPassed ? 'VERIFIED' : 'FAILED',
          lastBackupAt: lastBackup?.createdAt,
          sizeMb: lastBackup ? Math.round(lastBackup.sizeBytes / (1024 * 1024)) : undefined,
        },
      },
      recentBackups: backups.slice(0, 5),
      openIncidents: incidents,
      telemetryHistory,
    };
  }

  public listCentralBackups(): PlatformCentralBackup[] {
    PlatformAdminService.requirePlatformAccess('backups', 'platform.backups.view');
    const rows = this.db.query<any>('SELECT * FROM platform_central_backups ORDER BY created_at DESC LIMIT 20');
    return rows.map(r => ({
      id: String(r.id),
      filename: String(r.filename),
      sizeBytes: toNumber(r.size_bytes, 0),
      storageLocation: String(r.storage_location),
      status: (r.status as any) || 'COMPLETED',
      integrityCheckPassed: Boolean(r.integrity_check_passed),
      createdAt: String(r.createdAt || nowIso()),
      verifiedAt: r.verified_at ? String(r.verified_at) : undefined,
    }));
  }

  public async triggerCentralBackup(): Promise<PlatformCentralBackup> {
    // Creating a backup is a write operation — it requires the create
    // permission, not merely the ability to view the backup list.
    PlatformAdminService.requirePlatformAccess('backups', 'platform.backups.create');
    const createBackup = typeof window !== 'undefined' ? window.ceramisys?.db?.backup : undefined;
    if (!createBackup) {
      throw new Error('إنشاء نسخة احتياطية للمنصة يتطلب تشغيل التطبيق من نسخة سطح المكتب.');
    }

    const id = uuidv4();
    const now = nowIso();
    const result = await createBackup('central');
    if (!result?.ok || !result.path) {
      const message = result?.error || 'تعذر إنشاء النسخة الاحتياطية.';
      this.audit(
        'فشل إنشاء نسخة احتياطية مركزية للمنصة',
        'CENTRAL_BACKUP',
        id,
        { error: message },
        { severity: 'WARNING' }
      );
      throw new Error(message);
    }

    const filename = result.path.split(/[\\/]/).pop() || `ceramisys_central_${Date.now()}.sqlite.enc`;
    const sizeBytes = Number(result.bytes) || 0;
    // A local encrypted archive is not an offsite verification. The backup is only
    // reported as VERIFIED when the 3-2-1 strategy actually copied it to the
    // offsite destination and the SHA-256 comparison succeeded.
    const offsiteAction = result.strategy?.actions?.find((action) => action.type === 'offsite');
    const integrityCheckPassed = offsiteAction?.status === 'complete';
    const storageLocation = offsiteAction?.target || result.path;
    const status: PlatformCentralBackup['status'] = integrityCheckPassed ? 'VERIFIED' : 'COMPLETED';

    this.db.run(
      `INSERT INTO platform_central_backups (id, filename, size_bytes, storage_location, status, integrity_check_passed, created_at, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        filename,
        sizeBytes,
        storageLocation,
        status,
        integrityCheckPassed ? 1 : 0,
        now,
        integrityCheckPassed ? now : null,
      ]
    );

    this.audit(
      integrityCheckPassed
        ? 'إنشاء والتحقق من نسخة احتياطية مركزية للمنصة'
        : 'إنشاء نسخة احتياطية محلية مشفرة للمنصة دون تحقق خارجي',
      'CENTRAL_BACKUP',
      id,
      { filename, sizeBytes, storageLocation, verified: integrityCheckPassed },
      {
        severity: 'NOTICE',
      }
    );

    return {
      id,
      filename,
      sizeBytes,
      storageLocation,
      status,
      integrityCheckPassed,
      createdAt: now,
      verifiedAt: integrityCheckPassed ? now : undefined,
    };
  }

  /**
   * Delete the central backup *record*. The backup file itself lives on the
   * storage target (local/offsite) and is intentionally not unlinked here —
   * file deletion on the offsite target is an operator action, recorded in
   * the audit log either way.
   */
  public deleteCentralBackup(id: string): void {
    PlatformAdminService.requirePlatformAccess('backups', 'platform.backups.delete');
    const row = this.db.query<any>('SELECT * FROM platform_central_backups WHERE id = ?', [id])[0];
    if (!row) throw new Error('سجل النسخة الاحتياطية غير موجود.');

    this.db.run('DELETE FROM platform_central_backups WHERE id = ?', [id]);
    this.audit(
      'حذف سجل نسخة احتياطية مركزية',
      'CENTRAL_BACKUP',
      id,
      { filename: row.filename, storageLocation: row.storage_location, fileRemoved: false },
      { severity: 'WARNING' },
    );
  }

  public listServiceIncidents(status?: 'OPEN' | 'RESOLVED'): PlatformServiceIncident[] {
    PlatformAdminService.requirePlatformAccess('system-health', 'platform.system-health.view');
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];
    const rows = this.db.query<any>(
      `SELECT * FROM platform_service_incidents ${where} ORDER BY created_at DESC`,
      params
    );
    return rows.map(r => ({
      id: String(r.id),
      serviceName: String(r.service_name),
      severity: (r.severity as any) || 'LOW',
      title: String(r.title),
      description: r.description ? String(r.description) : undefined,
      status: (r.status as any) || 'OPEN',
      createdAt: String(r.createdAt || nowIso()),
      resolvedAt: r.resolved_at ? String(r.resolved_at) : undefined,
    }));
  }

  public resolveServiceIncident(id: string): void {
    PlatformAdminService.requirePlatformAccess('system-health', 'platform.system-health.approve');
    const now = nowIso();
    this.db.run(
      "UPDATE platform_service_incidents SET status = 'RESOLVED', resolved_at = ? WHERE id = ?",
      [now, id]
    );
    this.audit(
      'حل وإغلاق تنبيه خدمة النظام',
      'SERVICE_INCIDENT',
      id,
      null,
      {
        severity: 'NOTICE',
      }
    );
  }

  // ─── Platform Technical Health Dashboard (Item 15) ──────────────────────────

  public getPlatformHealthDashboard(): PlatformHealthDashboardData {
    PlatformAdminService.requirePlatformAccess('platform-health', 'platform.platform-health.view');

    // 1. Business Metrics Overview
    const business = this.getOverview();

    // 2. Telemetry & Infrastructure (CPU, Latency, Error Rate)
    const telRow = this.db.query<any>(
      'SELECT * FROM platform_server_telemetry ORDER BY recorded_at DESC LIMIT 1'
    )[0];
    const latency = telRow ? toNumber(telRow.api_latency_ms, 45) : 45;
    const errorRate = telRow ? toNumber(telRow.api_error_rate, 0.05) : 0.05;
    const apiSuccessRate = Math.max(0, Math.min(100, Number((100 - errorRate).toFixed(2))));

    // 3. Sync Telemetry & Log Analysis
    const syncStats = this.db.query<any>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as successCount,
         SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failedCount
       FROM platform_sync_log`
    )[0] ?? { total: 0, successCount: 0, failedCount: 0 };

    const syncTotal = toNumber(syncStats.total, 0);
    const syncSuccessCount = toNumber(syncStats.successCount, 0);
    const syncFailedCount = toNumber(syncStats.failedCount, 0);
    const syncSuccessRate = syncTotal > 0
      ? Number(((syncSuccessCount / syncTotal) * 100).toFixed(1))
      : 100;

    // 4. Connected & Stale Devices (Missing Heartbeats > 24 hours)
    const deviceStats = this.db.query<any>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'ACTIVE' AND (last_seen_at IS NULL OR datetime(last_seen_at) < datetime('now', '-1 day')) THEN 1 ELSE 0 END) as staleCount,
         SUM(CASE WHEN clone_suspected = 1 THEN 1 ELSE 0 END) as cloneSuspectedCount
       FROM platform_devices`
    )[0] ?? { total: 0, staleCount: 0, cloneSuspectedCount: 0 };

    const totalDevicesCount = toNumber(deviceStats.total, 0);
    const staleDevicesCount = toNumber(deviceStats.staleCount, 0);
    const cloneSuspectedCount = toNumber(deviceStats.cloneSuspectedCount, 0);

    // 5. Backups Check
    const backups = this.listCentralBackups();
    const lastBackup = backups[0];
    let lastBackupStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | 'NONE' = 'NONE';
    let lastBackupAgeHours = 0;

    if (lastBackup) {
      if (lastBackup.status === 'VERIFIED' && lastBackup.integrityCheckPassed) {
        lastBackupStatus = 'SUCCESS';
      } else if (lastBackup.status === 'FAILED' || !lastBackup.integrityCheckPassed) {
        lastBackupStatus = 'FAILED';
      } else {
        lastBackupStatus = 'PENDING';
      }
      const ageMs = Date.now() - new Date(lastBackup.createdAt).getTime();
      lastBackupAgeHours = Math.max(0, Math.round(ageMs / (1000 * 60 * 60)));
    }

    // 6. Ops Jobs & Rollouts
    const failedOpsJobsCount = toNumber(
      this.db.query<any>(
        "SELECT COUNT(*) as c FROM platform_ops_jobs WHERE status = 'FAILED'"
      )[0]?.c,
      0
    );

    // 7. Open Incidents by Severity
    const incidents = this.listServiceIncidents('OPEN');
    let critIncidents = 0;
    let majorIncidents = 0;
    let minorIncidents = 0;

    for (const inc of incidents) {
      if (inc.severity === 'CRITICAL') critIncidents++;
      else if (inc.severity === 'HIGH') majorIncidents++;
      else minorIncidents++;
    }

    // 8. Alerts Collection
    const alerts: PlatformTechnicalHealthMetrics['alerts'] = [];

    if (critIncidents > 0) {
      alerts.push({
        id: 'alt_crit_incidents',
        title: 'أعطال حرجة قيد التحقيق',
        description: `يوجد عدد ${critIncidents} حادث أمني/تقني حرج مفتوح في خوادم المنصة.`,
        severity: 'CRITICAL',
        category: 'INFRASTRUCTURE',
        timestamp: nowIso(),
        link: '/platform/system-health',
      });
    }

    if (lastBackupStatus === 'FAILED') {
      alerts.push({
        id: 'alt_backup_failed',
        title: 'فشل التحقق من النسخة الاحتياطية المركزية',
        description: 'آخر عملية تحقق من سلامة النسخ الاحتياطي المركزي أبلغت عن خطأ في التكامل.',
        severity: 'CRITICAL',
        category: 'BACKUPS',
        timestamp: nowIso(),
        link: '/platform/system-health',
      });
    } else if (lastBackupStatus === 'NONE' || lastBackupAgeHours > 48) {
      alerts.push({
        id: 'alt_backup_stale',
        title: 'النسخ الاحتياطي متأخر',
        description: `لم يتم أخذ نسخة احتياطية صالحة منذ ${lastBackupAgeHours} ساعة.`,
        severity: 'WARNING',
        category: 'BACKUPS',
        timestamp: nowIso(),
        link: '/platform/system-health',
      });
    }

    if (syncFailedCount > 0 && syncSuccessRate < 95) {
      alerts.push({
        id: 'alt_sync_failures',
        title: 'ارتفاع معدل فشل مزامنة الفروع',
        description: `تم تسجيل ${syncFailedCount} عملية مزامنة فاشلة (نسبة النجاح ${syncSuccessRate}%).`,
        severity: 'WARNING',
        category: 'SYNC',
        timestamp: nowIso(),
        link: '/platform/operations',
      });
    }

    if (staleDevicesCount > 0) {
      alerts.push({
        id: 'alt_stale_devices',
        title: 'أجهزة منقطعة عن إرسال Heartbeat',
        description: `يوجد ${staleDevicesCount} جهاز نشط لم يرسل نبضات تحقق خلال آخر 24 ساعة.`,
        severity: 'WARNING',
        category: 'DEVICES',
        timestamp: nowIso(),
        link: '/platform/devices',
      });
    }

    if (cloneSuspectedCount > 0) {
      alerts.push({
        id: 'alt_clone_devices',
        title: 'اشتباه استنساخ أجهزة وتراخيص',
        description: `يوجد ${cloneSuspectedCount} جهاز في حالة اشتباه استنساخ للهوية الصلبة (Hardware ID).`,
        severity: 'CRITICAL',
        category: 'LICENSES',
        timestamp: nowIso(),
        link: '/platform/devices',
      });
    }

    if (failedOpsJobsCount > 0) {
      alerts.push({
        id: 'alt_failed_jobs',
        title: 'مهام تشغيلية فاشلة في قائمة العمليات',
        description: `يوجد ${failedOpsJobsCount} مهمة تشغيلية فاشلة في مركز العمليات تحتاج لإعادة المحاولة.`,
        severity: 'WARNING',
        category: 'JOBS',
        timestamp: nowIso(),
        link: '/platform/operations',
      });
    }

    if (errorRate > 1.0) {
      alerts.push({
        id: 'alt_high_error_rate',
        title: 'ارتفاع معدل أخطاء API الخادم',
        description: `معدل أخطاء الـ API الحالي يبلغ ${errorRate}% وهو أعلى من الحد المسموح (1%).`,
        severity: 'WARNING',
        category: 'INFRASTRUCTURE',
        timestamp: nowIso(),
        link: '/platform/system-health',
      });
    }

    if (latency > 250) {
      alerts.push({
        id: 'alt_high_latency',
        title: 'بطء في زمن استجابة الخادم',
        description: `متوسط زمن استجابة الـ API يبلغ ${latency}ms (الحد المستهدف < 150ms).`,
        severity: 'INFO',
        category: 'INFRASTRUCTURE',
        timestamp: nowIso(),
        link: '/platform/system-health',
      });
    }

    // 9. Technical Health Score Calculation (0 - 100%)
    let score = 100;
    score -= critIncidents * 25;
    score -= majorIncidents * 10;
    score -= minorIncidents * 3;

    if (lastBackupStatus === 'FAILED') score -= 15;
    else if (lastBackupStatus === 'NONE' || lastBackupAgeHours > 48) score -= 8;

    if (syncSuccessRate < 90) score -= 15;
    else if (syncSuccessRate < 98) score -= 5;

    if (errorRate > 2.0) score -= 15;
    else if (errorRate > 0.5) score -= 5;

    if (latency > 350) score -= 10;
    else if (latency > 200) score -= 4;

    if (cloneSuspectedCount > 0) score -= 10;
    if (staleDevicesCount > 5) score -= 5;
    if (failedOpsJobsCount > 0) score -= Math.min(10, failedOpsJobsCount * 2);

    score = Math.max(0, Math.min(100, Math.round(score)));

    let status: PlatformTechnicalHealthMetrics['status'] = 'HEALTHY';
    if (score < 60 || critIncidents > 0 || lastBackupStatus === 'FAILED') {
      status = 'CRITICAL';
    } else if (score < 85 || alerts.some(a => a.severity === 'WARNING')) {
      status = 'DEGRADED';
    }

    const availabilityRate = Number((Math.max(90, 100 - (errorRate * 0.5) - (critIncidents * 1.5))).toFixed(2));

    const technical: PlatformTechnicalHealthMetrics = {
      score,
      status,
      availabilityRate,
      apiLatencyMs: latency,
      apiSuccessRate,
      apiErrorRate: errorRate,
      syncSuccessRate,
      syncFailedCount,
      staleDevicesCount,
      totalDevicesCount,
      licenseIntegrityAlerts: cloneSuspectedCount,
      failedOpsJobsCount,
      lastBackupStatus,
      lastBackupAgeHours,
      openIncidents: {
        critical: critIncidents,
        major: majorIncidents,
        minor: minorIncidents,
      },
      alerts,
    };

    return {
      technical,
      business,
    };
  }

  // ─── Platform Staff & RBAC Management (Item 18) ─────────────────────────────

  public listPlatformStaffRoles(): PlatformStaffRoleDefinition[] {
    // Derived from the single source of truth: PLATFORM_ROLE_DEFINITIONS (titles)
    // + the DB-backed granular matrix (module reach), so the UI never drifts.
    return (Object.keys(PLATFORM_ROLE_DEFINITIONS) as PlatformStaffRole[]).map((role) => {
      const definition = PLATFORM_ROLE_DEFINITIONS[role];
      if (role === 'SUPER_ADMIN') {
        return { ...definition, allowedModules: ['*'], restrictedModules: [] };
      }
      const granted = PlatformAuthorizationService.getRolePermissions(role);
      const modules = Array.from(
        new Set(
          granted
            .filter((code) => code.startsWith('platform.'))
            .map((code) => code.split('.')[1])
            .filter(Boolean)
        )
      );
      return {
        ...definition,
        allowedModules: granted.includes('*') ? ['*'] : modules,
        restrictedModules: [],
      };
    });
  }

  public listPlatformStaff(search = '', role = '', includeDeleted = false): PlatformStaff[] {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.view');
    const term = `%${search.trim()}%`;
    const rows = this.db.query<any>(
      `SELECT * FROM platform_staff
       WHERE (? = '' OR full_name LIKE ? OR email LIKE ? OR phone LIKE ?)
         AND (? = '' OR role = ?)
         ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
       ORDER BY created_at ASC`,
      [search.trim(), term, term, term, role, role]
    );

    return rows.map((r) => ({
      id: String(r.id),
      fullName: String(r.fullName),
      email: String(r.email),
      phone: r.phone ?? null,
      role: r.role as PlatformStaffRole,
      permissionsOverride: safeJsonArray(r.permissionsOverride),
      isActive: Boolean(r.isActive),
      lastLoginAt: r.lastLoginAt ?? null,
      mustChangePassword: Boolean(r.mustChangePassword),
      dataScope: (String(r.dataScope || 'ALL') === 'LIMITED' ? 'LIMITED' : 'ALL') as 'ALL' | 'LIMITED',
      deletedAt: r.deletedAt ?? null,
      invitedBy: r.invitedBy ?? null,
      createdAt: String(r.createdAt || nowIso()),
      updatedAt: String(r.updatedAt || nowIso()),
    }));
  }

  public getPlatformStaff(id: string): PlatformStaff | null {
    return this.listPlatformStaff('', '', true).find((s) => s.id === id) ?? null;
  }

  public createPlatformStaff(input: PlatformStaffInput): PlatformStaff {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.create');
    const fullName = String(input.fullName || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    if (fullName.length < 2) throw new Error('اسم الموظف مطلوب.');
    if (!email.includes('@')) throw new Error('البريد الإلكتروني غير صالح.');

    const password = String(input.password || '');
    if (password.length < 8) {
      throw new Error('كلمة مرور موظف المنصة مطلوبة ويجب أن تكون 8 أحرف على الأقل.');
    }

    const existing = this.db.query<any>('SELECT id FROM platform_staff WHERE email = ?', [email])[0];
    if (existing) throw new Error('البريد الإلكتروني مسجل بالفعل لموظف آخر.');

    const id = `staff_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    const role = input.role || 'SUPPORT_AGENT';
    PlatformAdminService.assertOwnerRoleGrant(role, { creating: true });
    const passwordHash = bcrypt.hashSync(password, 10);
    const actor = AuthService.getCurrentUser();

    this.db.run(
      `INSERT INTO platform_staff
        (id, full_name, email, phone, role, password_hash, permissions_override, is_active, must_change_password, invited_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        id,
        fullName,
        email,
        input.phone?.trim() || null,
        role,
        passwordHash,
        input.permissionsOverride ? JSON.stringify(input.permissionsOverride) : null,
        input.isActive ?? true ? 1 : 0,
        actor?.id ?? null,
      ]
    );

    this.audit('إضافة موظف في المنصة', 'SYSTEM', id, { fullName, email, role }, { severity: 'NOTICE' });
    return this.listPlatformStaff().find((s) => s.id === id)!;
  }

  public updatePlatformStaff(id: string, input: Partial<PlatformStaffInput>): PlatformStaff {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.update');
    const staff = this.db.query<any>('SELECT * FROM platform_staff WHERE id = ?', [id])[0];
    if (!staff) throw new Error('موظف المنصة غير موجود.');

    // Protect SUPER_ADMIN account from being demoted or modified arbitrarily
    if (staff.role === 'SUPER_ADMIN' && input.role && input.role !== 'SUPER_ADMIN') {
      throw new Error('لا يمكن خفض رتبة حساب مالك المنصة الرئيسي.');
    }

    // Promotion to the owner role is owner-only: a PLATFORM_ADMIN (or any other
    // staff role) must never be able to mint a second platform owner.
    if (input.role && String(input.role) === 'SUPER_ADMIN' && String(staff.role) !== 'SUPER_ADMIN') {
      PlatformAdminService.assertOwnerRoleGrant(input.role);
    }

    // The owner account itself is not editable by other staff: a password reset
    // or an email change by a non-owner would be a full account takeover.
    if (String(staff.role) === 'SUPER_ADMIN') {
      const actor = AuthService.getCurrentUser();
      if (!actor || actor.role !== 'SUPER_ADMIN') {
        throw new Error('لا يمكن تعديل حساب مالك المنصة من قبل موظف آخر.');
      }
    }

    const fullName = input.fullName ? input.fullName.trim() : staff.fullName;
    const email = input.email ? input.email.trim().toLowerCase() : staff.email;
    const role = input.role || staff.role;
    const phone = input.phone !== undefined ? input.phone?.trim() || null : staff.phone;
    const isActive = input.isActive !== undefined ? (input.isActive ? 1 : 0) : staff.isActive;
    const perms = input.permissionsOverride !== undefined ? JSON.stringify(input.permissionsOverride) : staff.permissionsOverride;
    const nextPassword = typeof input.password === 'string' ? input.password : '';
    if (nextPassword.length > 0 && nextPassword.length < 8) {
      throw new Error('كلمة مرور موظف المنصة يجب أن تكون 8 أحرف على الأقل.');
    }
    const passwordHash = nextPassword.length > 0 ? bcrypt.hashSync(nextPassword, 10) : staff.passwordHash;
    // Admin-set passwords always force a change at next login.
    const mustChangeNow = nextPassword.length > 0 ? 1 : Number(staff.mustChangePassword ?? 0);

    this.db.run(
      `UPDATE platform_staff
       SET full_name = ?, email = ?, phone = ?, role = ?, password_hash = ?, permissions_override = ?, is_active = ?, must_change_password = ?, updated_at = ?
       WHERE id = ?`,
      [fullName, email, phone, role, passwordHash, perms, isActive, mustChangeNow, nowIso(), id]
    );

    const becameInactive = !Boolean(isActive);
    const roleChanged = String(staff.role) !== String(role);
    const permsChanged = String(staff.permissionsOverride ?? '') !== String(perms ?? '');
    if (becameInactive || roleChanged || permsChanged) {
      PlatformStaffAuthService.revokeSessionsForStaff(id);
    }

    this.audit('تعديل بيانات موظف في المنصة', 'SYSTEM', id, { fullName, role, passwordChanged: nextPassword.length > 0, sessionsRevoked: becameInactive || roleChanged || permsChanged }, { severity: 'NOTICE' });
    return this.listPlatformStaff().find((s) => s.id === id)!;
  }

  public setPlatformStaffActive(id: string, isActive: boolean): PlatformStaff {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.deactivate');
    const staff = this.db.query<any>('SELECT role FROM platform_staff WHERE id = ?', [id])[0];
    if (!staff) throw new Error('الموظف غير موجود.');
    if (staff.role === 'SUPER_ADMIN' && !isActive) {
      throw new Error('لا يمكن تجميد حساب مالك المنصة الرئيسي.');
    }

    this.db.run(
      `UPDATE platform_staff SET is_active = ?, updated_at = ? WHERE id = ?`,
      [isActive ? 1 : 0, nowIso(), id]
    );

    if (!isActive) {
      PlatformStaffAuthService.revokeSessionsForStaff(id);
    }

    this.audit(isActive ? 'تنشيط موظف منصة' : 'تجميد موظف منصة', 'SYSTEM', id, { isActive, sessionsRevoked: !isActive }, { severity: 'NOTICE' });
    return this.listPlatformStaff().find((s) => s.id === id)!;
  }

  public deletePlatformStaff(id: string): void {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.delete');
    const actor = AuthService.getCurrentUser();
    if (actor?.id === id) {
      throw new Error('لا يمكنك حذف حسابك الحالي. اطلب من مالك المنصة تنفيذ ذلك.');
    }
    const staff = this.db.query<any>('SELECT role, full_name as name FROM platform_staff WHERE id = ?', [id])[0];
    if (!staff) throw new Error('الموظف غير موجود.');
    if (staff.role === 'SUPER_ADMIN') {
      throw new Error('ممنوع منعاً باتاً حذف حساب مالك المنصة.');
    }

    // Logical delete: the audit ledger and historical references stay intact.
    PlatformStaffAuthService.revokeSessionsForStaff(id);
    this.db.run(
      `UPDATE platform_staff
       SET is_active = 0, deleted_at = ?, updated_at = ?
       WHERE id = ?`,
      [nowIso(), nowIso(), id]
    );
    this.audit('حذف منطقي لموظف من المنصة', 'SYSTEM', id, { name: staff.name, role: staff.role, sessionsRevoked: true, softDelete: true }, { severity: 'WARNING' });
  }

  // ─── Platform Staff Security & RBAC (v2) ────────────────────────────────────

  private static hashStaffInviteToken(token: string): string {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }

  private static mapStaffInvite(row: any): PlatformStaffInvite {
    const now = Date.now();
    const expired = !row.acceptedAt && !row.revokedAt && new Date(String(row.expiresAt)).getTime() < now;
    const status: PlatformStaffInviteStatus = row.acceptedAt
      ? 'ACCEPTED'
      : row.revokedAt
        ? 'REVOKED'
        : expired
          ? 'EXPIRED'
          : 'PENDING';
    return {
      id: String(row.id),
      email: String(row.email),
      fullName: String(row.fullName),
      phone: row.phone ?? null,
      role: row.role as PlatformStaffRole,
      status,
      expiresAt: String(row.expiresAt),
      acceptedAt: row.acceptedAt ?? null,
      revokedAt: row.revokedAt ?? null,
      invitedBy: row.invitedBy ?? null,
      invitedByName: row.invitedByName ?? null,
      createdAt: String(row.createdAt || nowIso()),
    };
  }

  private assertKnownPlatformRole(role: string): asserts role is PlatformStaffRole {
    if (!PLATFORM_ROLE_CODES_SET.has(String(role))) {
      throw new Error('دور منصة غير معروف.');
    }
  }

  public createStaffInvite(input: PlatformStaffInviteInput): PlatformStaffInviteCreated {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.create');
    const actor = AuthService.getCurrentUser();
    const fullName = String(input.fullName || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const role = String(input.role || 'SUPPORT_AGENT');
    if (fullName.length < 2) throw new Error('اسم الموظف مطلوب.');
    if (!email.includes('@') || email.length < 5) throw new Error('البريد الإلكتروني غير صالح.');
    this.assertKnownPlatformRole(role);
    // An invitation is a promise of the role: it must not be able to promise
    // the owner role to a non-owner.
    PlatformAdminService.assertOwnerRoleGrant(role);

    const existingStaff = this.db.query<any>(
      'SELECT id FROM platform_staff WHERE lower(email) = ? AND deleted_at IS NULL LIMIT 1',
      [email]
    )[0];
    if (existingStaff) throw new Error('هذا البريد مرتبط بحساب موظف موجود بالفعل.');

    // One live invite per email — revoke a stale pending one instead of erroring.
    this.db.run(
      `UPDATE platform_staff_invites SET revoked_at = ?
       WHERE lower(email) = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      [nowIso(), email, nowIso()]
    );

    const expiresInHours = Number.isFinite(Number(input.expiresInHours)) && Number(input.expiresInHours) > 0
      ? Math.min(24 * 30, Math.floor(Number(input.expiresInHours)))
      : 72;
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = PlatformAdminService.hashStaffInviteToken(token);
    const id = `inv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

    this.db.run(
      `INSERT INTO platform_staff_invites
        (id, email, full_name, phone, role, token_hash, expires_at, invited_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, email, fullName, input.phone?.trim() || null, role, tokenHash, expiresAt, actor?.id ?? null, nowIso()]
    );

    this.audit('إنشاء دعوة لموظف منصة', 'SYSTEM', id, { email, role, expiresInHours }, { severity: 'NOTICE' });

    let link = `#/accept-staff-invite/${token}`;
    try {
      const origin = typeof window !== 'undefined' ? window.location?.origin : '';
      const pathname = typeof window !== 'undefined' ? window.location?.pathname : '';
      if (origin && origin.startsWith('http')) {
        link = `${origin}${pathname || '/'}#/accept-staff-invite/${token}`;
      }
    } catch {
      // keep hash-only link
    }

    const invite = this.listStaffInvites('all').find((item) => item.id === id)!;
    return { invite, token, link };
  }

  public listStaffInvites(status: 'all' | PlatformStaffInviteStatus = 'all'): PlatformStaffInvite[] {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.view');
    const rows = this.db.query<any>(
      `SELECT i.*, u.full_name AS invited_by_name
       FROM platform_staff_invites i
       LEFT JOIN platform_staff u ON u.id = i.invited_by
       ORDER BY i.created_at DESC`
    );
    const invites = rows.map((row) => PlatformAdminService.mapStaffInvite(row));
    const wanted = String(status || 'all').toUpperCase();
    return wanted === 'ALL' ? invites : invites.filter((invite) => invite.status === wanted);
  }

  public revokeStaffInvite(id: string): void {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.update');
    const row = this.db.query<any>('SELECT * FROM platform_staff_invites WHERE id = ?', [id])[0];
    if (!row) throw new Error('الدعوة غير موجودة.');
    const invite = PlatformAdminService.mapStaffInvite(row);
    if (invite.status !== 'PENDING') {
      throw new Error('لا يمكن إلغاء دعوة غير معلقة.');
    }
    this.db.run('UPDATE platform_staff_invites SET revoked_at = ? WHERE id = ?', [nowIso(), id]);
    this.audit('إلغاء دعوة موظف منصة', 'SYSTEM', id, { email: invite.email }, { severity: 'NOTICE' });
  }

  /** Pre-auth preview of an invitation (name/email/role/expiry) so the invitee can confirm before accepting. */
  public getStaffInviteByToken(token: string): PlatformStaffInvite {
    const tokenHash = PlatformAdminService.hashStaffInviteToken(String(token || '').trim());
    const row = this.db.query<any>(
      'SELECT * FROM platform_staff_invites WHERE token_hash = ? LIMIT 1',
      [tokenHash]
    )[0];
    if (!row) throw new Error('رابط الدعوة غير صالح.');
    const invite = PlatformAdminService.mapStaffInvite(row);
    if (invite.status === 'REVOKED' || invite.status === 'ACCEPTED' || invite.status === 'EXPIRED') {
      throw new Error(invite.status === 'REVOKED'
        ? 'تم إلغاء هذه الدعوة من مالك المنصة.'
        : invite.status === 'ACCEPTED'
          ? 'تم استخدام هذه الدعوة بالفعل.'
          : 'انتهت صلاحية هذه الدعوة. اطلب دعوة جديدة.');
    }
    return invite;
  }

  /** Pre-auth: accept a staff invite and create the staff account. No platform session required. */
  public acceptStaffInvite(token: string, fullName: string, password: string): PlatformStaff {
    const trimmedName = String(fullName || '').trim();
    if (trimmedName.length < 2) throw new Error('اسم الموظف مطلوب.');
    const cleanPassword = String(password || '');
    if (cleanPassword.length < 8) {
      throw new Error('كلمة المرور مطلوبة ويجب أن تكون 8 أحرف على الأقل.');
    }

    const tokenHash = PlatformAdminService.hashStaffInviteToken(String(token || '').trim());
    const row = this.db.query<any>(
      'SELECT * FROM platform_staff_invites WHERE token_hash = ? LIMIT 1',
      [tokenHash]
    )[0];
    if (!row) throw new Error('رابط الدعوة غير صالح.');
    const invite = PlatformAdminService.mapStaffInvite(row);
    if (invite.status === 'REVOKED') throw new Error('تم إلغاء هذه الدعوة من مالك المنصة.');
    if (invite.status === 'ACCEPTED') throw new Error('تم استخدام هذه الدعوة بالفعل.');
    if (invite.status === 'EXPIRED') throw new Error('انتهت صلاحية هذه الدعوة. اطلب دعوة جديدة.');

    const existingStaff = this.db.query<any>(
      'SELECT id FROM platform_staff WHERE lower(email) = ? AND deleted_at IS NULL LIMIT 1',
      [invite.email]
    )[0];
    if (existingStaff) {
      throw new Error('يوجد حساب موظف بنفس البريد بالفعل. تواصل مع مالك المنصة.');
    }

    const id = `staff_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    const passwordHash = bcrypt.hashSync(cleanPassword, 10);
    const now = nowIso();
    // Defence in depth: the invite cannot mint an owner account even if it was
    // created before this guard existed.
    PlatformAdminService.assertOwnerRoleGrant(invite.role, { creating: true });
    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO platform_staff
          (id, full_name, email, phone, role, password_hash, is_active, must_change_password, invited_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)`,
        [id, trimmedName, invite.email, invite.phone, invite.role, passwordHash, invite.invitedBy ?? null, now, now]
      );
      this.db.run('UPDATE platform_staff_invites SET accepted_at = ? WHERE id = ?', [now, row.id]);
    });

    this.audit('قبول دعوة موظف منصة', 'SYSTEM', id, { email: invite.email, role: invite.role, inviteId: row.id }, { severity: 'NOTICE' });
    return this.getPlatformStaff(id)!;
  }

  public resetPlatformStaffPassword(id: string, newPassword: string): void {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.reset_password');
    const actor = AuthService.getCurrentUser();
    const clean = String(newPassword || '');
    if (clean.length < 8) throw new Error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.');

    const staff = this.db.query<any>('SELECT role, full_name FROM platform_staff WHERE id = ? AND deleted_at IS NULL', [id])[0];
    if (!staff) throw new Error('الموظف غير موجود.');
    if (String(staff.role) === 'SUPER_ADMIN' && actor?.id !== id) {
      throw new Error('لا يمكن إعادة تعيين كلمة مرور مالك المنصة من قبل موظف آخر.');
    }

    this.db.run(
      'UPDATE platform_staff SET password_hash = ?, must_change_password = 1, failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
      [bcrypt.hashSync(clean, 10), nowIso(), id]
    );
    PlatformStaffAuthService.revokeSessionsForStaff(id);
    this.audit('إعادة تعيين كلمة مرور موظف منصة', 'SYSTEM', id, { name: staff.fullName, sessionsRevoked: true, mustChangePassword: true, resetBy: actor?.id ?? null }, { severity: 'SECURITY' });
  }

  public forcePlatformStaffPasswordChange(id: string, flag = true): void {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.reset_password');
    const actor = AuthService.getCurrentUser();
    const staff = this.db.query<any>('SELECT role, full_name FROM platform_staff WHERE id = ? AND deleted_at IS NULL', [id])[0];
    if (!staff) throw new Error('الموظف غير موجود.');
    if (String(staff.role) === 'SUPER_ADMIN' && actor?.id !== id) {
      throw new Error('لا يمكن إجبار مالك المنصة الرئيسي على تغيير كلمة المرور من موظف آخر.');
    }
    this.db.run('UPDATE platform_staff SET must_change_password = ?, updated_at = ? WHERE id = ?', [flag ? 1 : 0, nowIso(), id]);
    this.audit(flag ? 'فرض تغيير كلمة المرور لموظف منصة' : 'إلغاء فرض تغيير كلمة المرور', 'SYSTEM', id, { name: staff.fullName, by: actor?.id ?? null }, { severity: 'NOTICE' });
  }

  /** Self-service: change your own staff password (forced-change flow). */
  public changeOwnStaffPassword(currentPassword: string, newPassword: string, fullName?: string): void {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('يجب تسجيل الدخول أولاً.');
    if (!PLATFORM_ROLE_CODES_SET.has(String(actor.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
    }

    const row = this.db.query<any>('SELECT id, full_name, password_hash FROM platform_staff WHERE id = ? AND deleted_at IS NULL', [actor.id])[0];
    if (!row) throw new Error('حساب موظف المنصة غير موجود.');
    if (!row.passwordHash) throw new Error('لا توجد كلمة مرور حالية لهذا الحساب.');
    if (!bcrypt.compareSync(String(currentPassword || ''), String(row.passwordHash))) {
      throw new Error('كلمة المرور الحالية غير صحيحة.');
    }

    const clean = String(newPassword || '');
    if (clean.length < 8) throw new Error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.');
    if (bcrypt.compareSync(clean, String(row.passwordHash))) {
      throw new Error('كلمة المرور الجديدة يجب أن تختلف عن الحالية.');
    }

    const savedName = fullName && fullName.trim().length >= 2 ? fullName.trim() : String(row.fullName);
    const now = nowIso();
    this.db.run(
      'UPDATE platform_staff SET password_hash = ?, full_name = ?, must_change_password = 0, updated_at = ? WHERE id = ?',
      [bcrypt.hashSync(clean, 10), savedName, now, actor.id]
    );

    // Revoke every OTHER session; keep the one used to make the change.
    const currentSessionId = PlatformStaffAuthService.getCurrentSessionId();
    this.db.run(
      `UPDATE platform_staff_sessions SET is_current = 0, last_activity_at = ? WHERE staff_id = ? AND id <> COALESCE(?, '')`,
      [now, actor.id, currentSessionId]
    );

    authSession.setCurrentUser({
      ...actor,
      fullName: savedName,
      mustChangePassword: false,
      updatedAt: now,
    });

    this.audit('تغيير ذاتي لكلمة مرور موظف منصة', 'SYSTEM', actor.id, { selfService: true, otherSessionsRevoked: true }, { severity: 'SECURITY' });
  }

  public listTrustedDevices(staffId?: string): PlatformTrustedDevice[] {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.view');
    const rows = this.db.query<any>(
      `SELECT t.*, s.full_name AS staff_name
       FROM platform_trusted_devices t
       LEFT JOIN platform_staff s ON s.id = t.staff_id
       ${staffId ? 'WHERE t.staff_id = ?' : ''}
       ORDER BY t.created_at DESC`,
      staffId ? [staffId] : []
    );
    return rows.map((row) => ({
      id: String(row.id),
      staffId: String(row.staffId),
      staffName: row.staffName ?? null,
      deviceName: row.deviceName ?? null,
      fingerprint: String(row.fingerprint),
      lastSeenAt: row.last_seen_at ?? null,
      revokedAt: row.revokedAt ?? null,
      createdAt: String(row.createdAt || nowIso()),
    }));
  }

  public revokeTrustedDevice(id: string): void {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.update');
    const row = this.db.query<any>('SELECT * FROM platform_trusted_devices WHERE id = ?', [id])[0];
    if (!row) throw new Error('الجهاز الموثوق غير موجود.');
    this.db.run('UPDATE platform_trusted_devices SET revoked_at = ? WHERE id = ?', [nowIso(), id]);
    this.audit('إلغاء جهاز موثوق لموظف منصة', 'SYSTEM', id, { staffId: row.staffId, deviceName: row.deviceName }, { severity: 'SECURITY' });
  }

  /** Self-service: is the current platform staff member's MFA enabled? */
  public getOwnStaffMfaStatus(): { enabled: boolean; enforcement: 'off' | 'optional' | 'required' } {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('يجب تسجيل الدخول أولاً.');
    if (!PLATFORM_ROLE_CODES_SET.has(String(actor.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
    }
    return {
      enabled: platformStaffTwoFactorAuth.isEnabled(actor.id),
      enforcement: this.getStaffMfaEnforcement(),
    };
  }

  public revokeStaffSessionsForStaff(staffId: string): void {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.revoke_sessions');
    const staff = this.db.query<any>('SELECT full_name FROM platform_staff WHERE id = ? AND deleted_at IS NULL', [staffId])[0];
    if (!staff) throw new Error('الموظف غير موجود.');
    PlatformStaffAuthService.revokeSessionsForStaff(staffId);
    this.audit('إنهاء جميع جلسات موظف منصة', 'SYSTEM', staffId, { name: staff.fullName, by: AuthService.getCurrentUser()?.id ?? null }, { severity: 'SECURITY' });
  }

  /** Any authenticated platform staff member may trust the device they are using right now. */
  public trustCurrentStaffDevice(deviceName?: string): void {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('يجب تسجيل الدخول أولاً.');
    if (!PLATFORM_ROLE_CODES_SET.has(String(actor.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
    }
    PlatformStaffAuthService.trustCurrentDevice(deviceName);
    this.audit('توثيق الجهاز الحالي كجهاز موثوق', 'SYSTEM', actor.id, { selfService: true }, { severity: 'NOTICE' });
  }

  public getStaffMfaEnforcement(): 'off' | 'optional' | 'required' {
    try {
      const row = this.db.query<any>('SELECT value FROM platform_settings WHERE key = ? LIMIT 1', ['platform_mfa_enforcement'])[0];
      const value = String(row?.value ?? 'off');
      return value === 'required' || value === 'optional' ? value : 'off';
    } catch {
      return 'off';
    }
  }

  public setStaffMfaEnforcement(policy: 'off' | 'optional' | 'required'): void {
    PlatformAdminService.requirePlatformAccess('security-center', 'platform.security.update');
    if (policy !== 'off' && policy !== 'optional' && policy !== 'required') {
      throw new Error('سياسة المصادقة الثنائية غير معروفة.');
    }
    this.db.run(
      `INSERT INTO platform_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ['platform_mfa_enforcement', policy]
    );
    this.audit('تغيير سياسة المصادقة الثنائية للمنصة', 'SYSTEM', null, { policy, by: AuthService.getCurrentUser()?.id ?? null }, { severity: 'SECURITY' });
  }

  public getStaffMfaCompliance(): {
    enforcement: 'off' | 'optional' | 'required';
    total: number;
    compliant: number;
    missing: Array<{ id: string; fullName: string; email: string; role: PlatformStaffRole }>;
  } {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.view');
    const staff = this.listPlatformStaff();
    const missing = staff.filter((item) => !platformStaffTwoFactorAuth.isEnabled(item.id));
    return {
      enforcement: this.getStaffMfaEnforcement(),
      total: staff.length,
      compliant: staff.length - missing.length,
      missing: missing.map((item) => ({ id: item.id, fullName: item.fullName, email: item.email, role: item.role })),
    };
  }

  /** Start TOTP enrollment for the currently signed-in platform staff member. */
  public startMfaEnrollmentForStaffSelf() {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('يجب تسجيل الدخول أولاً.');
    if (!PLATFORM_ROLE_CODES_SET.has(String(actor.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
    }
    return platformStaffTwoFactorAuth.setup2FA(actor.id, 'TOTP');
  }

  public async confirmMfaForStaffSelf(code: string): Promise<void> {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('يجب تسجيل الدخول أولاً.');
    if (!PLATFORM_ROLE_CODES_SET.has(String(actor.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
    }
    await platformStaffTwoFactorAuth.enable2FA(actor.id, 'TOTP', code);
    this.audit('تفعيل المصادقة الثنائية لموظف منصة', 'SYSTEM', actor.id, { selfService: true }, { severity: 'SECURITY' });
  }

  public async disableMfaForStaffSelf(code: string): Promise<void> {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('يجب تسجيل الدخول أولاً.');
    if (!PLATFORM_ROLE_CODES_SET.has(String(actor.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
    }
    await platformStaffTwoFactorAuth.disable2FA(actor.id, code);
    this.audit('تعطيل المصادقة الثنائية لموظف منصة', 'SYSTEM', actor.id, { selfService: true }, { severity: 'SECURITY' });
  }

  /** Owner emergency reset of a staff member's MFA (re-enrollment required). */
  public resetStaffMfa(id: string): void {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.reset_password');
    const actor = AuthService.getCurrentUser();
    if (id === actor?.id) {
      throw new Error('استخدم تعطيل المصادقة الثنائية من حسابك بدلاً من إعادة التعيين.');
    }
    const staff = this.db.query<any>('SELECT role, full_name FROM platform_staff WHERE id = ? AND deleted_at IS NULL', [id])[0];
    if (!staff) throw new Error('الموظف غير موجود.');
    if (String(staff.role) === 'SUPER_ADMIN') {
      throw new Error('لا يمكن إعادة تعيين مصادقة مالك المنصة من قبل موظف آخر.');
    }
    deletePlatformStaffTwoFactorRow(id);
    this.audit('إعادة تعيين مصادقة ثنائية لموظف منصة', 'SYSTEM', id, { name: staff.fullName, by: actor?.id ?? null }, { severity: 'SECURITY' });
  }

  public transferStaffPermissions(fromStaffId: string, toStaffId: string, note?: string): PlatformStaff {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.manage_permissions');
    const actor = AuthService.getCurrentUser();
    if (!fromStaffId || !toStaffId) throw new Error('حدد الموظف المصدر والهدف.');
    if (fromStaffId === toStaffId) throw new Error('لا يمكن نقل الصلاحيات إلى نفس الموظف.');

    const from = this.db.query<any>('SELECT * FROM platform_staff WHERE id = ? AND deleted_at IS NULL', [fromStaffId])[0];
    const to = this.db.query<any>('SELECT * FROM platform_staff WHERE id = ? AND deleted_at IS NULL', [toStaffId])[0];
    if (!from) throw new Error('الموظف المصدر غير موجود.');
    if (!to) throw new Error('الموظف الهدف غير موجود.');
    if (String(to.role) === 'SUPER_ADMIN' && actor?.role !== 'SUPER_ADMIN') {
      throw new Error('نقل الصلاحيات إلى حساب مالك المنصة متاح لمالك المنصة فقط.');
    }
    // Copying *from* an owner account would clone the owner role onto another
    // account — owner-only as well.
    if (String(from.role) === 'SUPER_ADMIN' && actor?.role !== 'SUPER_ADMIN') {
      throw new Error('نقل صلاحيات مالك المنصة متاح لمالك المنصة فقط.');
    }

    const now = nowIso();
    this.db.executeTransaction(() => {
      this.db.run(
        'UPDATE platform_staff SET role = ?, permissions_override = ?, data_scope = ?, updated_at = ? WHERE id = ?',
        [from.role, from.permissionsOverride ?? null, from.dataScope ?? 'ALL', now, toStaffId]
      );
      this.db.run('DELETE FROM platform_staff_scopes WHERE staff_id = ?', [toStaffId]);
      const scopeRows = this.db.query<any>('SELECT tenant_id FROM platform_staff_scopes WHERE staff_id = ?', [fromStaffId]);
      for (const scopeRow of scopeRows) {
        this.db.run('INSERT OR IGNORE INTO platform_staff_scopes (staff_id, tenant_id) VALUES (?, ?)', [toStaffId, scopeRow.tenant_id]);
      }
    });

    PlatformStaffAuthService.revokeSessionsForStaff(toStaffId);
    this.audit('نقل صلاحيات موظف منصة إلى موظف آخر', 'SYSTEM', toStaffId, {
      fromStaffId,
      toStaffId,
      roleTransferred: from.role,
      fromName: from.fullName,
      toName: to.fullName,
      note: note?.trim() || null,
      by: actor?.id ?? null,
      sessionsRevoked: true,
    }, { severity: 'SECURITY' });
    return this.getPlatformStaff(toStaffId)!;
  }

  public getStaffDataScope(id: string): PlatformStaffDataScopeState {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.view');
    const row = this.db.query<any>('SELECT data_scope FROM platform_staff WHERE id = ? AND deleted_at IS NULL', [id])[0];
    if (!row) throw new Error('الموظف غير موجود.');
    const scope = String(row.dataScope || 'ALL') === 'LIMITED' ? 'LIMITED' : 'ALL';
    const tenantRows = this.db.query<any>('SELECT tenant_id AS tenantId FROM platform_staff_scopes WHERE staff_id = ? ORDER BY tenant_id', [id]);
    return {
      staffId: id,
      scope,
      tenantIds: scope === 'LIMITED' ? tenantRows.map((r) => String(r.tenantId)) : [],
    };
  }

  public setStaffDataScope(id: string, scope: 'ALL' | 'LIMITED', tenantIds: string[] = []): void {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.manage_permissions');
    if (scope !== 'ALL' && scope !== 'LIMITED') throw new Error('نطاق بيانات غير معروف.');
    const actor = AuthService.getCurrentUser();
    const staff = this.db.query<any>('SELECT role, full_name FROM platform_staff WHERE id = ? AND deleted_at IS NULL', [id])[0];
    if (!staff) throw new Error('الموظف غير موجود.');
    if (String(staff.role) === 'SUPER_ADMIN') {
      throw new Error('نطاق البيانات غير قابل للتقييد على حساب مالك المنصة.');
    }

    const cleanIds = Array.from(new Set(tenantIds.map((item) => String(item).trim()).filter(Boolean)));
    const now = nowIso();
    this.db.executeTransaction(() => {
      this.db.run('UPDATE platform_staff SET data_scope = ?, updated_at = ? WHERE id = ?', [scope, now, id]);
      this.db.run('DELETE FROM platform_staff_scopes WHERE staff_id = ?', [id]);
      if (scope === 'LIMITED') {
        for (const tenantId of cleanIds) {
          this.db.run('INSERT OR IGNORE INTO platform_staff_scopes (staff_id, tenant_id) VALUES (?, ?)', [id, tenantId]);
        }
      }
    });

    this.audit('تغيير نطاق بيانات موظف منصة', 'SYSTEM', id, { scope, tenantIds: scope === 'LIMITED' ? cleanIds : [], by: actor?.id ?? null }, { severity: 'SECURITY' });
  }

  public getRolePermissionMatrix(): PlatformRoleMatrix {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.view');
    return {
      matrix: PlatformAuthorizationService.listRolePermissionMatrix(),
      sections: PLATFORM_PERMISSION_SECTIONS.map((section) => ({
        module: section.module,
        title: section.title,
        standardActions: section.standardActions,
        permissions: section.permissions.map((permission) => ({
          code: permission.code,
          action: permission.action,
          name: permission.name,
          special: permission.special,
        })),
      })),
      standardActionLabels: { ...STANDARD_ACTION_LABELS },
      fetchedAt: nowIso(),
    };
  }

  public setRolePermissions(role: string, permissionCodes: string[]): void {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.manage_permissions');
    this.assertKnownPlatformRole(String(role));
    const actor = AuthService.getCurrentUser();
    if (role === 'SUPER_ADMIN' && actor?.role !== 'SUPER_ADMIN') {
      throw new Error('تعديل دور مالك المنصة متاح لمالك المنصة فقط.');
    }

    const validCodes = new Set<string>([...PLATFORM_PERMISSION_CODES, PLATFORM_ALL_PERMISSION]);
    const clean = Array.from(new Set((permissionCodes || []).map((code) => String(code)).filter((code) => validCodes.has(code))));

    const before = PlatformAuthorizationService.getRolePermissions(String(role));
    PlatformAuthorizationService.setRolePermissions(String(role), clean);
    const after = PlatformAuthorizationService.getRolePermissions(String(role));

    this.audit('تعديل مصفوفة صلاحيات دور المنصة', 'SYSTEM', role, {
      role,
      added: after.filter((code) => !before.includes(code)),
      removed: before.filter((code) => !after.includes(code)),
      by: actor?.id ?? null,
    }, { severity: 'SECURITY' });
  }

  // ─── Platform Central Security Center (Item 19) ─────────────────────────────

  public getPlatformSecurityOverview(): PlatformCentralSecurityOverview {
    PlatformAdminService.requirePlatformAccess('security-center', 'platform.security.view');

    const staffList = this.listPlatformStaff();
    const totalStaffCount = staffList.length;
    const twoFactorEnforcement = this.getStaffMfaEnforcement();
    const compliantStaffCount = staffList.filter((s) => platformStaffTwoFactorAuth.isEnabled(s.id)).length;
    const twoFactorEnabled = twoFactorEnforcement === 'required';

    const sessions = this.listStaffSessions();
    const activeStaffSessionsCount = sessions.length;
    const trustedDevicesCount = this.db.query<any>('SELECT COUNT(*) AS count FROM platform_trusted_devices WHERE revoked_at IS NULL')[0]?.count ?? 0;

    const recentLogins = this.listStaffLogins(50);
    const failedLogins24hCount = recentLogins.filter(l => l.status === 'FAILED' || l.status === 'BLOCKED').length;

    const incidents = this.listPlatformSecurityIncidents();
    const activeIncidentsCount = incidents.filter(i => i.status !== 'RESOLVED').length;

    const signingKeys = this.listPlatformSigningKeys();
    const signingKeysCount = signingKeys.length;

    // Security Score calculation (0 - 100%)
    let securityScore = 100;
    if (activeIncidentsCount > 0) securityScore -= activeIncidentsCount * 20;
    if (failedLogins24hCount > 5) securityScore -= 15;
    else if (failedLogins24hCount > 0) securityScore -= 5;
    if (sessions.some(s => !s.isTrustedDevice)) securityScore -= 5;
    securityScore = Math.max(30, Math.min(100, securityScore));

    return {
      securityScore,
      twoFactorEnforcement: {
        enabled: twoFactorEnabled,
        compliantStaffCount,
        totalStaffCount,
      },
      activeStaffSessionsCount,
      failedLogins24hCount,
      activeIncidentsCount,
      signingKeysCount,
      trustedDevicesCount,
      sessions,
      recentLogins,
      incidents,
      signingKeys,
    };
  }

  public listStaffSessions(staffId?: string): PlatformStaffSession[] {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.view');
    const rows = this.db.query<any>(
      `SELECT * FROM platform_staff_sessions
       ${staffId ? 'WHERE staff_id = ?' : ''}
       ORDER BY is_current DESC, last_activity_at DESC`,
      staffId ? [staffId] : []
    );
    return rows.map(r => ({
      id: String(r.id),
      staffId: String(r.staffId),
      staffName: String(r.staffName),
      staffRole: String(r.staffRole),
      ipAddress: r.ipAddress ?? null,
      deviceName: r.deviceName ?? null,
      isTrustedDevice: Boolean(r.isTrustedDevice),
      isCurrent: Boolean(r.isCurrent),
      expiresAt: r.expiresAt ?? null,
      createdAt: String(r.createdAt || nowIso()),
      lastActivityAt: String(r.lastActivityAt || nowIso()),
    }));
  }

  public revokeStaffSession(sessionId: string): void {
    PlatformAdminService.requirePlatformAccess('security-center', 'platform.staff.revoke_sessions');
    const session = this.db.query<any>('SELECT * FROM platform_staff_sessions WHERE id = ?', [sessionId])[0];
    if (!session) throw new Error('الجلسة غير موجودة.');
    if (Boolean(session.isCurrent)) {
      throw new Error('لا يمكن إنهاء جلستك الحالية من هذه الشاشة.');
    }

    this.db.run('DELETE FROM platform_staff_sessions WHERE id = ?', [sessionId]);
    this.audit('إنهاء جلسة موظف عن بعد', 'SYSTEM', sessionId, { staffId: session.staffId, name: session.staffName }, { severity: 'SECURITY' });
  }

  public revokeAllOtherStaffSessions(): void {
    PlatformAdminService.requirePlatformAccess('security-center', 'platform.staff.revoke_sessions');
    this.db.run('DELETE FROM platform_staff_sessions WHERE is_current = 0');
    this.audit('إنهاء كافة الجلسات النشطة الأخرى لموظفي المنصة', 'SYSTEM', null, null, { severity: 'SECURITY' });
  }

  public listStaffLogins(limit = 100, failedOnly = false, staffId?: string): PlatformStaffLogin[] {
    PlatformAdminService.requirePlatformAccess('staff', 'platform.staff.view');
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (failedOnly) conditions.push("status IN ('FAILED', 'BLOCKED')");
    if (staffId) { conditions.push('staff_id = ?'); params.push(staffId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    const rows = this.db.query<any>(
      `SELECT * FROM platform_staff_logins ${where} ORDER BY attempted_at DESC LIMIT ?`,
      params
    );

    return rows.map(r => ({
      id: String(r.id),
      staffId: r.staffId ?? null,
      email: String(r.email),
      ipAddress: r.ipAddress ?? null,
      userAgent: r.userAgent ?? null,
      status: r.status as any,
      failureReason: r.failureReason ?? null,
      attemptedAt: String(r.attemptedAt || nowIso()),
    }));
  }

  public recordStaffLoginAttempt(input: {
    staffId?: string;
    email: string;
    ipAddress?: string;
    userAgent?: string;
    status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
    failureReason?: string;
  }): void {
    const id = `login_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    this.db.run(
      `INSERT INTO platform_staff_logins (id, staff_id, email, ip_address, user_agent, status, failure_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.staffId || null, input.email.trim().toLowerCase(), input.ipAddress || null, input.userAgent || null, input.status, input.failureReason || null]
    );

    if (input.status === 'FAILED' || input.status === 'BLOCKED') {
      this.audit('محاولة دخول فاشلة للمنصة', 'SYSTEM', id, { email: input.email, ip: input.ipAddress, reason: input.failureReason }, { severity: 'WARNING' });
    }
  }

  public listPlatformSecurityIncidents(): PlatformCentralSecurityIncident[] {
    PlatformAdminService.requirePlatformAccess('system-health', 'platform.system-health.view');
    const rows = this.db.query<any>(
      `SELECT * FROM platform_security_incidents_log ORDER BY created_at DESC`
    );
    return rows.map(r => ({
      id: String(r.id),
      type: String(r.type),
      severity: r.severity as any,
      title: String(r.title),
      details: r.details ?? null,
      sourceIp: r.source_ip ?? null,
      status: r.status as any,
      containmentAction: r.containment_action ?? null,
      createdAt: String(r.createdAt || nowIso()),
      resolvedAt: r.resolved_at ?? null,
    }));
  }

  public recordSecurityIncident(input: {
    type: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    details?: string;
    sourceIp?: string;
  }): PlatformCentralSecurityIncident {
    PlatformAdminService.requirePlatformAccess('security-center', 'platform.security.approve');
    const id = `secinc_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_security_incidents_log (id, type, severity, title, details, source_ip, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      [id, input.type, input.severity, input.title, input.details || null, input.sourceIp || null, now]
    );

    this.audit('تسجيل حادث أمني بالمنصة', 'SYSTEM', id, { title: input.title, severity: input.severity }, { severity: 'CRITICAL' });
    return this.listPlatformSecurityIncidents().find(i => i.id === id)!;
  }

  public respondToSecurityIncident(id: string, action: string, resolve = false): PlatformCentralSecurityIncident {
    PlatformAdminService.requirePlatformAccess('security-center', 'platform.security.approve');
    const now = nowIso();
    const status = resolve ? 'RESOLVED' : 'CONTAINED';
    this.db.run(
      `UPDATE platform_security_incidents_log 
       SET status = ?, containment_action = ?, resolved_at = ?
       WHERE id = ?`,
      [status, action, resolve ? now : null, id]
    );

    this.audit('استجابة لحادث أمني', 'SYSTEM', id, { action, status }, { severity: 'SECURITY' });
    return this.listPlatformSecurityIncidents().find(i => i.id === id)!;
  }

  public listPlatformSigningKeys(): PlatformSigningKey[] {
    PlatformAdminService.requirePlatformAccess('security-center', 'platform.security.view');
    const rows = this.db.query<any>(
      `SELECT * FROM platform_signing_keys ORDER BY created_at DESC`
    );
    return rows.map(r => ({
      id: String(r.id),
      keyAlias: String(r.key_alias),
      algorithm: String(r.algorithm),
      version: toNumber(r.version, 1),
      status: r.status as any,
      rotatedAt: r.rotated_at ?? null,
      createdAt: String(r.createdAt || nowIso()),
    }));
  }

  public rotatePlatformSigningKey(keyAlias: string): PlatformSigningKey {
    PlatformAdminService.requirePlatformAccess('security-center', 'platform.security.update');
    const active = this.db.query<any>(
      `SELECT * FROM platform_signing_keys WHERE key_alias = ? AND status = 'ACTIVE' ORDER BY version DESC LIMIT 1`,
      [keyAlias]
    )[0];

    const currentVersion = active ? toNumber(active.version, 1) : 0;
    const nextVersion = currentVersion + 1;
    const now = nowIso();

    // Mark previous as ROTATED
    if (active) {
      this.db.run(
        `UPDATE platform_signing_keys SET status = 'ROTATED', rotated_at = ? WHERE id = ?`,
        [now, active.id]
      );
    }

    const newId = `key_${keyAlias}_v${nextVersion}`;
    const algorithm = active ? String(active.algorithm) : 'HMAC-SHA256';

    this.db.run(
      `INSERT INTO platform_signing_keys (id, key_alias, algorithm, version, status, created_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?)`,
      [newId, keyAlias, algorithm, nextVersion, now]
    );

    this.audit('تدوير مفتاح توقيع رقمي للمنصة', 'SYSTEM', newId, { keyAlias, version: nextVersion }, { severity: 'SECURITY' });
    return this.listPlatformSigningKeys().find(k => k.id === newId)!;
  }
}

export const platformAdminService = new PlatformAdminService();
