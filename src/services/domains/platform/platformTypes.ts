export type PlatformTenantStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';
export type PlatformLicenseStatus = 'ISSUED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
export type PlatformSubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
export type PlatformInvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID';
export type PlatformPaymentMethod = 'CASH' | 'BANK' | 'CARD' | 'WALLET' | 'OTHER';
export type PlatformBillingCycle = 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'LIFETIME';
/** How subscription and license changes are coupled. */
export type PlatformCouplingMode = 'FULL' | 'EXPIRY_ONLY' | 'NONE';

export interface PlatformTenant {
  id: string;
  code: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  businessType?: string | null;
  status: PlatformTenantStatus;
  planId?: string | null;
  planName?: string | null;
  planPrice?: number | null;
  subscriptionStartedAt?: string | null;
  subscriptionExpiresAt?: string | null;
  seatsLimit: number;
  branchesLimit: number;
  devicesLimit: number;
  notes?: string | null;
  activeLicenses?: number;
  licensesTotal?: number;
  devicesUsed?: number;
  outstanding?: number;
  subscriptionId?: string | null;
  price?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantInput {
  name: string;
  code?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  address?: string;
  businessType?: string;
  status?: PlatformTenantStatus;
  planId?: string | null;
  seatsLimit?: number;
  branchesLimit?: number;
  devicesLimit?: number;
  notes?: string;
}

export interface PlatformTenantAccount {
  id: string;
  tenantId: string;
  username: string;
  email?: string | null;
  fullName?: string | null;
  isActive: boolean;
  activationCode?: string | null;
  lastActivatedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantAccountInput {
  username?: string;
  password?: string;
  email?: string;
  fullName?: string;
}

export interface PlatformTenantUsage {
  seatsLimit: number;
  devicesLimit: number;
  devicesUsed: number;
  branchesLimit: number;
  branchesUsed: number;
  modulesCount: number;
}

export interface PlatformTenantProfile {
  tenant: PlatformTenant;
  plan: PlatformPlan | null;
  account: PlatformTenantAccount | null;
  subscriptions: PlatformSubscription[];
  licenses: PlatformLicense[];
  invoices: PlatformInvoice[];
  payments: PlatformPayment[];
  activationLog: PlatformAuditEntry[];
  changeLog: PlatformAuditEntry[];
  activityLog: PlatformAuditEntry[];
  usage: PlatformTenantUsage;
}

export interface PlatformActivationDetails {
  tenant: PlatformTenant;
  account: PlatformTenantAccount | null;
  username: string;
  /** Present only right after an account is created or its password is reset. */
  temporaryPassword?: string | null;
  activationCode: string;
  planName?: string | null;
  licenseKey?: string | null;
  licenseExpiresAt?: string | null;
  modules: string[];
  loginUrl: string;
  generatedAt: string;
}

export interface PlatformPlan {
  id: string;
  code: string;
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
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  subscriberCount?: number;
  /** Default offline grace period in days for licenses issued under this plan. */
  offlineGracePeriodDays: number;
  versioned?: boolean;
  currentVersion?: number;
}

export interface PlatformPlanInput {
  code: string;
  name: string;
  description?: string;
  billingCycle?: PlatformBillingCycle;
  price?: number;
  monthlyPrice?: number;
  yearlyPrice?: number;
  currency?: string;
  seatsLimit?: number;
  branchesLimit?: number;
  devicesLimit?: number;
  storageLimitMb?: number;
  maxProducts?: number;
  maxWarehouses?: number;
  trialDays?: number;
  includedModules?: string[];
  features?: string[];
  permissions?: string[];
  isActive?: boolean;
  /** Default offline grace period in days for licenses issued under this plan. */
  offlineGracePeriodDays?: number;
  /** إذا كانت الخطة تدعم نسخ الأسعار مع تواريخ سريان. */
  versioned?: boolean;
  /** تاريخ سريان الإصدار الأولي (للخطات ذات النسخ). */
  effectiveFrom?: string;
  /** ملاحظة الإصدار الأولي. */
  initialChangeNote?: string;
}

export interface PlatformTenantOverride {
  id: string;
  tenantId: string;
  kind: 'MODULE' | 'FEATURE' | 'LIMIT' | 'PERMISSION';
  code: string;
  value?: string | null;
  isEnabled: boolean;
  expiresAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantOverrideInput {
  kind: PlatformTenantOverride['kind'];
  code: string;
  value?: string;
  isEnabled?: boolean;
  expiresAt?: string;
  notes?: string;
}

export interface PlatformLicense {
  id: string;
  tenantId: string;
  tenantName?: string;
  subscriptionId?: string | null;
  planId?: string | null;
  planName?: string | null;
  licenseKey: string;
  status: PlatformLicenseStatus;
  issuedAt: string;
  /** License effective start date (may differ from issuedAt for future-dated licenses). */
  startsAt?: string | null;
  activatedAt?: string | null;
  expiresAt?: string | null;
  seats: number;
  deviceLimit: number;
  /** Maximum number of branches allowed by this license. */
  branchesLimit: number;
  hardwareId?: string | null;
  activationCode?: string | null;
  certificate?: string | null;
  transferCount?: number;
  modules: string[];
  features: string[];
  /** Offline grace period in days (overrides plan default if set). */
  offlineGracePeriodDays?: number | null;
  /** Subscription-license coupling mode. */
  couplingMode?: 'FULL' | 'EXPIRY_ONLY' | 'NONE';
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformInvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total?: number;
}

export interface PlatformInvoice {
  id: string;
  number: string;
  tenantId: string;
  tenantName?: string;
  subscriptionId?: string | null;
  issueDate: string;
  dueDate?: string | null;
  status: PlatformInvoiceStatus;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  notes?: string | null;
  createdAt: string;
  items?: PlatformInvoiceItem[];
}

export interface PlatformInvoiceInput {
  tenantId: string;
  subscriptionId?: string | null;
  issueDate?: string;
  dueDate?: string;
  discount?: number;
  tax?: number;
  notes?: string;
  status?: 'DRAFT' | 'SENT';
  items: PlatformInvoiceItem[];
}

export interface PlatformPayment {
  id: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  tenantId: string;
  tenantName?: string;
  amount: number;
  method: PlatformPaymentMethod;
  reference?: string | null;
  paidAt: string;
  notes?: string | null;
}

export interface PlatformPaymentInput {
  invoiceId?: string | null;
  tenantId: string;
  amount: number;
  method?: PlatformPaymentMethod;
  reference?: string;
  paidAt?: string;
  notes?: string;
}

export interface PlatformSubscription {
  id: string;
  tenantId: string;
  tenantName?: string | null;
  planId: string;
  planName?: string | null;
  status: PlatformSubscriptionStatus;
  startDate: string;
  endDate?: string | null;
  seats: number;
  price: number;
  discount?: number;
  billingCycle: PlatformBillingCycle;
  autoRenew: boolean;
  /** Maximum number of branches allowed by this subscription. */
  branchesLimit: number;
  /** السعر المقفل لهذا الاشتراك (للحفاظ على السعر القديم عند تغيير الخطة). */
  lockedPrice?: number | null;
  /** العملة المقفلة. */
  lockedCurrency?: string | null;
  /** رمز الكوبون المطبق على هذا الاشتراك (إن وجد). */
  couponCode?: string | null;
  /** رقم الإصدار الساري من الخطة. */
  planVersion?: number;
  /** نوع التغيير الأخير: upgrade / downgrade / same / renewal. */
  lastChangeType?: PlatformPlanChangeType | null;
  /** تاريخ انتهاء الفترة التجريبية المجانية. */
  trialEndsAt?: string | null;
  /** هل هذه فترة تجريبية مجانية. */
  isTrial?: boolean;
  createdAt?: string;
}

export interface PlatformAlert {
  id: string;
  severity: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
  link?: string;
}

export interface PlatformModuleUsage {
  code: string;
  name: string;
  category?: string | null;
  enabled: boolean;
  licenseCount: number;
  tenantCount: number;
}

export interface PlatformModule {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isEnabled: boolean;
  minPlanCode?: string | null;
  sortOrder: number;
}

export interface PlatformFeatureFlag {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isEnabled: boolean;
  rolloutPercent: number;
  isStagingOnly?: boolean;
  minPlanTier?: string | null;
  overridesCount?: number;
}

export interface PlatformFeatureOverride {
  id: string;
  featureId: string;
  targetType: 'TENANT' | 'PLAN' | 'STAGING_GROUP';
  targetId: string;
  targetName?: string | null;
  isEnabled: boolean;
  customRolloutPercent?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformRelease {
  id: string;
  version: string;
  channel: 'STABLE' | 'BETA' | 'NIGHTLY';
  status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';
  isMandatory: boolean;
  minVersion?: string | null;
  rolloutGroup: string;
  notes?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  checksumSha256?: string | null;
  packageSignature?: string | null;
  changelog?: string | null;
  rollbackVersion?: string | null;
  stagingGroup?: string;
  releasedAt?: string | null;
  createdAt: string;
  targetsSummary?: {
    total: number;
    pending: number;
    success: number;
    failed: number;
  };
}

export interface PlatformReleaseTarget {
  id: string;
  releaseId: string;
  tenantId: string;
  tenantName?: string | null;
  deviceId?: string | null;
  clientVersion?: string | null;
  attemptCount?: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  appliedAt?: string | null;
  error?: string | null;
  createdAt: string;
}

export type AuditSeverity = 'INFO' | 'NOTICE' | 'WARNING' | 'SECURITY' | 'CRITICAL';
export type AuditActorType = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'DEVICE' | 'API_CLIENT' | 'SYSTEM';
export type AuditStatus = 'SUCCESS' | 'FAILURE' | 'BLOCKED';

export interface PlatformAuditEntry {
  id: string;
  actorId?: string | null;
  actorName?: string | null;
  actorType?: AuditActorType;
  tenantId?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  severity: AuditSeverity;
  status: AuditStatus;
  details?: string | null;
  oldValues?: string | null;
  newValues?: string | null;
  errorMessage?: string | null;
  prevHash?: string | null;
  recordHash?: string | null;
  createdAt: string;
}

export interface PlatformAuditFilters {
  search?: string;
  tenantId?: string;
  severity?: AuditSeverity | 'all';
  status?: AuditStatus | 'all';
  actorType?: AuditActorType | 'all';
  actorId?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface PlatformAuditPaginatedResult {
  entries: PlatformAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  integrityVerified: boolean;
}

export interface PlatformOverview {
  tenants: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    expired: number;
    cancelled: number;
    expiringSoon: number;
  };
  subscriptions: {
    total: number;
    active: number;
    trial: number;
    expired: number;
    cancelled: number;
    expiringSoon: number;
  };
  licenses: {
    total: number;
    active: number;
    expiringSoon: number;
    revoked: number;
    expired: number;
    suspended: number;
  };
  billing: {
    revenueTotal: number;
    revenueThisMonth: number;
    invoicedTotal: number;
    outstanding: number;
    overdueInvoices: number;
    mrr: number;
    invoicesTotal: number;
    paidInvoices: number;
    draftInvoices: number;
  };
  devices: {
    boundLicenses: number;
    unboundLicenses: number;
    devicesLimit: number;
  };
  branches: {
    totalLimit: number;
    installationBranches: number;
  };
  releases: PlatformRelease[];
  moduleUsage: PlatformModuleUsage[];
  revenueByPlan: { planName: string; revenue: number; tenants: number }[];
  alerts: PlatformAlert[];
  recentTenants: PlatformTenant[];
  expiringLicenses: PlatformLicense[];
  expiringSubscriptions: PlatformSubscription[];
  recentPayments: PlatformPayment[];
  recentAudit: PlatformAuditEntry[];
  currentInstallation: {
    companyName: string;
    currency: string;
    users: number;
    products: number;
    invoices: number;
    customers: number;
  } | null;
}

export type PlatformTenantUserProvisioningStatus =
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'INVITED'
  | 'PROVISIONED'
  | 'FAILED'
  | 'DIRECTORY_ONLY';

export interface PlatformTenantUser {
  id: string;
  tenantId: string;
  fullName: string;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  role: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  notes?: string | null;
  /** Directory/provisioning record is not a real tenant identity account until provisioned. */
  provisioningStatus: PlatformTenantUserProvisioningStatus;
  provisioningMode?: 'INVITE' | 'DIRECT_CREATE' | null;
  identityUserId?: string | null;
  scope?: string | null;
  inviteCode?: string | null;
  temporaryPassword?: string | null;
  inviteExpiresAt?: string | null;
  provisionedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantUserInput {
  fullName: string;
  username?: string;
  email?: string;
  phone?: string;
  role?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  notes?: string;
  /** Provision/invite into tenant's actual identity system (default: true). */
  provisionIdentity?: boolean;
  /** INVITE = issue invite code/temp password; DIRECT_CREATE = create active account now. */
  provisioningMode?: 'INVITE' | 'DIRECT_CREATE';
  /** Role/scope in tenant identity system (e.g. branch scope or JSON). */
  scope?: string;
  /** Optional initial password for DIRECT_CREATE; otherwise generated. */
  password?: string;
}

export interface PlatformTenantUserProvisioningResult {
  user: PlatformTenantUser;
  inviteCode?: string | null;
  temporaryPassword?: string | null;
  provisioned: boolean;
  message: string;
}

export interface PlatformLicenseActivation {
  id: string;
  licenseId: string;
  tenantId: string;
  tenantName?: string;
  licenseKey?: string;
  deviceId?: string | null;
  activationCode?: string | null;
  mode: 'ONLINE' | 'OFFLINE';
  action: 'ACTIVATE' | 'DEACTIVATE' | 'TRANSFER' | 'RENEW' | 'REVOKE';
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  ipAddress?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface PlatformDevice {
  id: string;
  tenantId: string;
  licenseId?: string | null;
  hardwareId: string;
  name?: string | null;
  os?: string | null;
  appVersion?: string | null;
  ipAddress?: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'OFFLINE';
  firstActivatedAt: string;
  lastSeenAt?: string | null;
  cloneSuspected: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSupportTicket {
  id: string;
  tenantId: string;
  tenantName?: string | null;
  deviceId?: string | null;
  subject: string;
  description?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
  assignedTo?: string | null;
  remoteAccessRequested: boolean;
  remoteAccessApproved: boolean;
  remoteAccessDurationMinutes?: number;
  remoteAccessExpiresAt?: string | null;
  slaDueAt?: string | null;
  firstRespondedAt?: string | null;
  rating?: number | null;
  feedback?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSupportMessage {
  id: string;
  ticketId: string;
  authorName: string;
  authorRole: 'CUSTOMER' | 'SUPPORT' | 'SYSTEM';
  body: string;
  isInternal?: boolean;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSize?: string | null;
  createdAt: string;
}

export interface PlatformCannedReply {
  id: string;
  title: string;
  category: string;
  body: string;
  createdAt: string;
}

export interface PlatformRemoteSession {
  id: string;
  ticketId: string;
  tenantId: string;
  technicianName: string;
  startedAt: string;
  endedAt?: string | null;
  durationMinutes: number;
  actionsSummary?: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'TERMINATED';
}

export interface PlatformSupportTicketDetails {
  ticket: PlatformSupportTicket;
  messages: PlatformSupportMessage[];
  remoteSessions: PlatformRemoteSession[];
}

export interface PlatformApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformApiKeyCreated {
  key: PlatformApiKey;
  plainTextKey: string;
}

export interface PlatformCoupon {
  id: string;
  code: string;
  name: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  maxUses?: number | null;
  usedCount: number;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** إذا كان الكوبون خاصاً بخطة معينة (null = كل الخطط). */
  planId?: string | null;
  /** إذا كان الكوبون للدفعة الأولى فقط. */
  firstPaymentOnly: boolean;
  /** الحد الأدنى لمبلغ الفاتورة لتطبيق الكوبون. */
  minSubtotal: number;
  /** تاريخ بدء سريان الكوبون. */
  startsAt?: string | null;
  notes?: string | null;
}

export interface PlatformCouponInput {
  code: string;
  name: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  maxUses?: number | null;
  expiresAt?: string | null;
  isActive?: boolean;
  planId?: string | null;
  firstPaymentOnly?: boolean;
  minSubtotal?: number;
  startsAt?: string | null;
  notes?: string;
}

// ─── Plan Versioning ─────────────────────────────────────────────────────────

export type PlatformPlanChangeType = 'upgrade' | 'downgrade' | 'same' | 'renewal';

export interface PlatformPlanVersion {
  id: string;
  planId: string;
  version: number;
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
  /** تاريخ بدء سريان هذا الإصدار (ISO). */
  effectiveFrom: string;
  /** إذا كان هذا الإصدار هو الساري حالياً للخطة الأساسية. */
  isCurrent: boolean;
  /** ملاحظة حول التغيير في هذا الإصدار. */
  changeNote?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface PlatformPlanVersionInput {
  planId: string;
  version: number;
  name: string;
  description?: string;
  billingCycle?: PlatformBillingCycle;
  price?: number;
  monthlyPrice?: number;
  yearlyPrice?: number;
  currency?: string;
  seatsLimit?: number;
  branchesLimit?: number;
  devicesLimit?: number;
  storageLimitMb?: number;
  maxProducts?: number;
  maxWarehouses?: number;
  trialDays?: number;
  includedModules?: string[];
  features?: string[];
  permissions?: string[];
  offlineGracePeriodDays?: number;
  /** تاريخ بدء سريان هذا الإصدار (ISO). مطلوب. */
  effectiveFrom: string;
  /** إذا كان هذا الإصدار هو الساري حالياً. */
  isCurrent?: boolean;
  changeNote?: string;
  createdBy?: string;
}

export interface PlatformPriceHistoryEntry {
  id: string;
  planId: string;
  version: number;
  oldPrice?: number | null;
  newPrice: number;
  currency: string;
  effectiveFrom: string;
  reason?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  createdAt: string;
}

export interface PlatformSubscriptionPriceLock {
  id: string;
  subscriptionId: string;
  planId: string;
  lockedPrice: number;
  lockedMonthlyPrice: number;
  lockedYearlyPrice: number;
  currency: string;
  /** التاريخ الذي ينتهي عنده القفل (null = دائم). */
  expiresAt?: string | null;
  /** إذا كان السعر مقفلاً من خطة سابقة عند الترقية/التخفيض. */
  isGrandfathered: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Upgrade/Downgrade Rules ─────────────────────────────────────────────────

export interface PlatformPlanUpgradeRule {
  id: string;
  fromPlanId: string;
  toPlanId: string;
  /** هل يسمح بالترقية/التخفيض من هذه الخطة إلى تلك؟ */
  allowed: boolean;
  /** نسبة رسم الترقية من الفرق (0-100). */
  upgradeFeePercent: number;
  /** هل يتطلب موافقة يدوية؟ */
  requiresApproval: boolean;
  notes?: string | null;
  createdAt: string;
}

export interface PlatformPlanUpgradeRuleInput {
  fromPlanId: string;
  toPlanId: string;
  allowed?: boolean;
  upgradeFeePercent?: number;
  requiresApproval?: boolean;
  notes?: string;
}

// ─── Plan Copy / Versioning Results ──────────────────────────────────────────

export interface PlatformPlanCopyResult {
  /** معرف الخطة الجديدة المنسوخة. */
  newPlanId: string;
  /** معرف الإصدار الذي تم إنشاؤه للخطة الأصلية. */
  versionId: string;
  /** رقم الإصدار الجديد. */
  newVersion: number;
  /** السريان من تاريخ. */
  effectiveFrom: string;
}

export interface PlatformPlanEffectivePricing {
  /** الخطة السارية للعميل في هذا التاريخ. */
  plan: PlatformPlan | null;
  /** الإصدار الساري من الخطة. */
  version: PlatformPlanVersion | null;
  /** السعر المطبق فعلياً (بعد القفل إن وجد). */
  appliedPrice: number;
  /** السعر الشهري المطبق. */
  appliedMonthlyPrice: number;
  /** السعر السنوي المطبق. */
  appliedYearlyPrice: number;
  /** العملة المطبق. */
  appliedCurrency: string;
  /** إذا كان السعر مقفلاً (grandfathered). */
  isPriceLocked: boolean;
  /** معرف القفل إن وجد. */
  priceLockId?: string | null;
}

// ─── Impact Preview ──────────────────────────────────────────────────────────

export interface PlatformPlanImpactPreview {
  /** معرف الخطة المقترحة للتعديل. */
  planId: string;
  /** number of active subscriptions affected. */
  affectedSubscriptions: number;
  /** number of tenants affected. */
  affectedTenants: number;
  /** tenants whose price will change. */
  priceChanges: Array<{
    subscriptionId: string;
    tenantId: string;
    tenantName: string;
    oldPrice: number;
    newPrice: number;
    currency: string;
    isLocked: boolean;
    effectiveFrom: string;
  }>;
  /** tenants who will lose access to modules/features. */
  moduleChanges: Array<{
    subscriptionId: string;
    tenantId: string;
    tenantName: string;
    removedModules: string[];
    removedFeatures: string[];
  }>;
  /** tenants exceeding new limits. */
  limitViolations: Array<{
    subscriptionId: string;
    tenantId: string;
    tenantName: string;
    metric: 'seats' | 'branches' | 'devices' | 'products' | 'warehouses' | 'storage';
    currentUsage: number;
    newLimit: number;
  }>;
  /** overall risk assessment. */
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** recommended action. */
  recommendation: string;
  /** estimated revenue impact. */
  estimatedRevenueImpact: number;
}

// ─── Plan Change Request (upgrade/downgrade with effective date) ─────────────

export interface PlatformPlanChangeRequest {
  tenantId: string;
  targetPlanId: string;
  /** تاريخ سريان التغيير الجديد. */
  effectiveFrom: string;
  /** إذا كان السعر مقفلاً للعميل الحالي (احتفظ بالسعر القديم). */
  lockOldPrice?: boolean;
  /** عدد المقاعد الجديد. */
  seats?: number;
  /** عدد الفروع الجديد. */
  branchesLimit?: number;
  /** ملاحظة حول التغيير. */
  notes?: string;
}

export interface PlatformPlanChangeResult {
  subscriptionId: string;
  planId: string;
  oldPlanId: string;
  effectiveFrom: string;
  priceChange: {
    oldPrice: number;
    newPrice: number;
    currency: string;
    proratedAmount: number;
  };
  status: PlatformSubscriptionStatus;
}

// ─── Extended PlanInput ──────────────────────────────────────────────────────

export interface PlatformPlanVersioningInput {
  /** إذا كانت الخطة تدعم نسخ الأسعار مع تواريخ سريان. */
  versioned?: boolean;
  /** نسخة أولية للخطة (لإنشاء إصدار أولي). */
  initialVersion?: PlatformPlanVersionInput;
}

export interface PlatformSubscriptionCreateInput {
  tenantId: string;
  planId: string;
  status?: PlatformSubscriptionStatus;
  startDate?: string;
  endDate?: string | null;
  seats?: number;
  price?: number;
  discount?: number;
  billingCycle?: PlatformBillingCycle;
  autoRenew?: boolean;
  branchesLimit?: number;
  /** إذا كان السعر مقفلاً (احتفظ بالسعر القديم). */
  lockPrice?: boolean;
  /** رمز الكوبون المطبق. */
  couponCode?: string | null;
  /** إذا كانت فترة تجريبية. */
  isTrial?: boolean;
  /** تاريخ نهاية الفترة التجريبية. */
  trialEndsAt?: string | null;
}

export interface PlatformTrialCreateInput {
  tenantId: string;
  planId: string;
  trialDays?: number;
  startsAt?: string;
  couponCode?: string | null;
}


export interface PlatformSettingsMap {
  // 1. Identity & General
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  defaultCurrency: string;
  defaultTrialDays: number;
  invoicePrefix: string;
  defaultLocale?: string;
  timezone?: string;

  // 2. Legal & Tax
  companyLegalName?: string;
  commercialRegistry?: string;
  taxNumber?: string;
  officialAddress?: string;
  legalRepresentative?: string;

  // 3. Email & SMS
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFromEmail?: string;
  smtpEncryption?: 'NONE' | 'TLS' | 'SSL';
  smsProvider?: string;
  smsSenderId?: string;
  smsApiKey?: string;

  // 4. Payments & Billing
  paymentGateway?: 'PAYMOB' | 'STRIPE' | 'FAWRY' | 'MOYASAR' | 'MANUAL';
  paymentMode?: 'TEST' | 'LIVE';
  paymentApiKey?: string;
  paymentMerchantId?: string;
  defaultTaxRate?: number;
  licenseGracePeriodDays?: number;
  autoRenewalPolicy?: boolean;

  // 5. Network & APIs
  platformDomain?: string;
  centralApiEndpoint?: string;
  syncServerEndpoint?: string;
  enforceHttps?: boolean;

  // 6. Security, MFA & Sessions
  sessionTimeoutMinutes?: number;
  maxFailedLogins?: number;
  enforceMfa?: boolean;
  passwordMinLength?: number;
  passwordRequireComplex?: boolean;
  kmsProvider?: string;
  lastEncryptionRotation?: string;

  // 7. Backup & Retention
  backupFrequency?: 'DAILY' | 'TWICE_DAILY' | 'WEEKLY';
  backupRetentionDays?: number;
  backupStorageTarget?: 'CLOUD_ENCRYPTED' | 'LOCAL_SECURE';
}

// ─── Per-Tenant Activity Customization & Versions ───────────────────────────

export interface PlatformTenantActivityConfig {
  id: string;
  tenantId: string;
  activityId: string;
  activityLabel?: string;
  familyId?: string;
  profileId: string;
  enabledModules: string[];
  customTerminology: Record<string, string>;
  navigationOverrides: Array<{ path: string; label?: string; hidden?: boolean }>;
  featuresEnabled: string[];
  customAttributes: Array<{ code: string; name: string; dataType: string; unit?: string }>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantActivityVersion {
  id: string;
  tenantId: string;
  version: number;
  activityId: string;
  profileId: string;
  configSnapshot: PlatformTenantActivityConfig;
  changeSummary?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface PlatformTenantActivityInput {
  tenantId: string;
  activityId: string;
  profileId?: string;
  enabledModules?: string[];
  customTerminology?: Record<string, string>;
  navigationOverrides?: Array<{ path: string; label?: string; hidden?: boolean }>;
  featuresEnabled?: string[];
  changeSummary?: string;
}

// ─── Time Period & Analytics ───────────────────────────────────────────────────

export type PlatformPeriod = '7d' | '30d' | '90d' | '180d' | '365d' | 'ytd' | 'all';

export interface PlatformPeriodOption {
  value: PlatformPeriod;
  label: string;
  days: number | null;
}

export const PLATFORM_PERIODS: PlatformPeriodOption[] = [
  { value: '7d', label: 'آخر 7 أيام', days: 7 },
  { value: '30d', label: 'آخر 30 يوم', days: 30 },
  { value: '90d', label: 'آخر 90 يوم', days: 90 },
  { value: '180d', label: 'آخر 180 يوم', days: 180 },
  { value: '365d', label: 'آخر 365 يوم', days: 365 },
  { value: 'ytd', label: 'منذ بداية السنة', days: null },
  { value: 'all', label: 'الكل', days: null },
];

export interface PlatformTimeSeriesPoint {
  period: string; // ISO date string for the period start (day/month)
  value: number;
  label: string; // Human-readable label
}

export interface PlatformMetricComparison {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
}

// ─── Business Performance (الأداء التجاري) ──────────────────────────────────────

export interface PlatformBusinessPerformance {
  revenue: {
    total: PlatformMetricComparison;
    mrr: PlatformMetricComparison;
    arr: PlatformMetricComparison;
    netRevenue: PlatformMetricComparison;
    growthRate: PlatformMetricComparison;
  };
  timeSeries: {
    revenue: PlatformTimeSeriesPoint[];
    mrr: PlatformTimeSeriesPoint[];
    arr: PlatformTimeSeriesPoint[];
  };
}

// ─── Customers (العملاء) ────────────────────────────────────────────────────────

export interface PlatformCustomerMetrics {
  newCustomers: PlatformMetricComparison;
  activeCustomers: PlatformMetricComparison;
  cancelledCustomers: PlatformMetricComparison;
  churnRate: PlatformMetricComparison;
  trialToPaidConversion: PlatformMetricComparison;
  averageRevenuePerCustomer: PlatformMetricComparison;
  timeSeries: {
    newCustomers: PlatformTimeSeriesPoint[];
    activeCustomers: PlatformTimeSeriesPoint[];
    churnedCustomers: PlatformTimeSeriesPoint[];
    trialConversions: PlatformTimeSeriesPoint[];
  };
  topCustomersByRevenue: Array<{
    id: string;
    code: string;
    name: string;
    revenue: number;
    invoicesCount: number;
    status: PlatformTenantStatus;
  }>;
  recentlyCancelled: PlatformTenant[];
}

// ─── Subscriptions (الاشتراكات) ─────────────────────────────────────────────────

export interface PlatformSubscriptionMetrics {
  expiredTrials: PlatformMetricComparison;
  upcomingRenewals: PlatformMetricComparison;
  strugglingSubscriptions: PlatformMetricComparison; // PAST_DUE
  trialConversionRate: PlatformMetricComparison;
  averageSubscriptionValue: PlatformMetricComparison;
  renewalRate: PlatformMetricComparison;
  timeSeries: {
    newSubscriptions: PlatformTimeSeriesPoint[];
    renewedSubscriptions: PlatformTimeSeriesPoint[];
    cancelledSubscriptions: PlatformTimeSeriesPoint[];
    expiredTrials: PlatformTimeSeriesPoint[];
  };
  upcomingRenewalsList: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    tenantCode: string;
    planName: string;
    endDate: string;
    price: number;
    billingCycle: PlatformBillingCycle;
    autoRenew: boolean;
    status: PlatformSubscriptionStatus;
  }>;
  strugglingList: PlatformSubscription[];
}

// ─── Licenses (التراخيص) ────────────────────────────────────────────────────────

export interface PlatformLicenseMetrics {
  activatedDevices: PlatformMetricComparison;
  utilizationRate: PlatformMetricComparison; // activated / limit
  pendingLicenses: PlatformMetricComparison; // ISSUED but not ACTIVE
  failedActivations: PlatformMetricComparison;
  activationSuccessRate: PlatformMetricComparison;
  expiringSoon: PlatformMetricComparison;
  timeSeries: {
    activations: PlatformTimeSeriesPoint[];
    deactivations: PlatformTimeSeriesPoint[];
    failedActivations: PlatformTimeSeriesPoint[];
    utilization: PlatformTimeSeriesPoint[];
  };
  failedActivationsList: PlatformLicenseActivation[];
  pendingLicensesList: PlatformLicense[];
}

// ─── Operations (التشغيل) ───────────────────────────────────────────────────────

export interface PlatformOperationsMetrics {
  connectedDevices: PlatformMetricComparison;
  disconnectedDevices: PlatformMetricComparison;
  syncErrors: PlatformMetricComparison;
  apiHealth: PlatformMetricComparison; // success rate
  averageResponseTime: PlatformMetricComparison;
  timeSeries: {
    onlineDevices: PlatformTimeSeriesPoint[];
    offlineDevices: PlatformTimeSeriesPoint[];
    syncErrors: PlatformTimeSeriesPoint[];
    apiSuccessRate: PlatformTimeSeriesPoint[];
  };
  recentSyncErrors: Array<{
    id: string;
    deviceId: string;
    deviceName: string;
    tenantId: string;
    tenantName: string;
    error: string;
    occurredAt: string;
    resolved: boolean;
  }>;
  apiEndpointsHealth: Array<{
    endpoint: string;
    requests: number;
    errors: number;
    avgResponseMs: number;
    successRate: number;
  }>;
}

// ─── Alerts (التنبيهات) ─────────────────────────────────────────────────────────

export interface PlatformAlertDetail extends PlatformAlert {
  entityType: 'TENANT' | 'LICENSE' | 'SUBSCRIPTION' | 'INVOICE' | 'DEVICE' | 'PAYMENT' | 'API';
  entityId: string;
  entityName: string;
  actionRequired: boolean;
  suggestedActions: string[];
  metadata: Record<string, unknown>;
}

// ─── Reports (التقارير) ──────────────────────────────────────────────────────────

export interface PlatformReportFilters {
  period: PlatformPeriod;
  planId?: string;
  tenantId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PlatformComparisonReport {
  period: PlatformPeriod;
  businessPerformance: PlatformBusinessPerformance;
  customers: PlatformCustomerMetrics;
  subscriptions: PlatformSubscriptionMetrics;
  licenses: PlatformLicenseMetrics;
  operations: PlatformOperationsMetrics;
  generatedAt: string;
}

// ─── Extended Overview ──────────────────────────────────────────────────────────

export interface PlatformOverview {
  tenants: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    expired: number;
    cancelled: number;
    expiringSoon: number;
  };
  subscriptions: {
    total: number;
    active: number;
    trial: number;
    expired: number;
    cancelled: number;
    expiringSoon: number;
  };
  licenses: {
    total: number;
    active: number;
    suspended: number;
    expiringSoon: number;
    revoked: number;
    expired: number;
  };
  billing: {
    revenueTotal: number;
    revenueThisMonth: number;
    invoicedTotal: number;
    outstanding: number;
    overdueInvoices: number;
    mrr: number;
    invoicesTotal: number;
    paidInvoices: number;
    draftInvoices: number;
  };
  devices: {
    boundLicenses: number;
    unboundLicenses: number;
    devicesLimit: number;
  };
  branches: {
    totalLimit: number;
    installationBranches: number;
  };
  releases: PlatformRelease[];
  moduleUsage: PlatformModuleUsage[];
  revenueByPlan: { planName: string; revenue: number; tenants: number }[];
  alerts: PlatformAlert[];
  recentTenants: PlatformTenant[];
  expiringLicenses: PlatformLicense[];
  expiringSubscriptions: PlatformSubscription[];
  recentPayments: PlatformPayment[];
  recentAudit: PlatformAuditEntry[];
  currentInstallation: {
    companyName: string;
    currency: string;
    users: number;
    products: number;
    invoices: number;
    customers: number;
  } | null;

  // ─── NEW: Extended metrics sections ──────────────────────────────────────────
  businessPerformance?: PlatformBusinessPerformance;
  customerMetrics?: PlatformCustomerMetrics;
  subscriptionMetrics?: PlatformSubscriptionMetrics;
  licenseMetrics?: PlatformLicenseMetrics;
  operationsMetrics?: PlatformOperationsMetrics;
  alertDetails?: PlatformAlertDetail[];
  reportFilters?: PlatformReportFilters;
}

// ─── Central License Issuance API Contract ───────────────────────────────

export type CentralLicenseIssueAction = 'ISSUE' | 'RENEW' | 'SUSPEND' | 'REVOKE' | 'TRANSFER';

export interface CentralLicenseIssueRequest {
  tenantId: string;
  planId: string;
  action?: CentralLicenseIssueAction;
  months?: number;
  seats?: number;
  branchesLimit?: number;
  deviceLimit?: number;
  startsAt?: string;
  expiresAt?: string;
  offlineGracePeriodDays?: number;
  couplingMode?: PlatformCouplingMode;
  modules?: string[];
  features?: string[];
  hardwareId?: string | null;
  notes?: string;
}

export interface CentralLicenseIssueResponse {
  license: {
    id: string;
    licenseKey: string;
    status: PlatformLicenseStatus;
    issuedAt: string;
    startsAt?: string | null;
    expiresAt?: string | null;
    seats: number;
    deviceLimit: number;
    branchesLimit: number;
    hardwareId?: string | null;
    modules: string[];
    features: string[];
    certificate: {
      payload: Record<string, unknown>;
      signature: string;
    };
    activationCode: string;
  };
  subscription: {
    id: string;
    planId: string;
    status: PlatformSubscriptionStatus;
    startDate: string;
    endDate?: string | null;
    seats: number;
    price: number;
    billingCycle: PlatformBillingCycle;
    branchesLimit: number;
  };
  tenant: {
    id: string;
    name: string;
    code: string;
    status: PlatformTenantStatus;
  };
}

export interface CentralDeviceActionRequest {
  deviceId: string;
  tenantId: string;
  action: 'SUSPEND' | 'RELEASE' | 'REVOKE';
  reason?: string;
}

export interface CentralDeviceActionResponse {
  deviceId: string;
  tenantId: string;
  action: string;
  status: 'SUCCESS' | 'FAILED';
  previousStatus: string;
  newStatus: string;
  message?: string;
}

export interface CentralLicenseRenewRequest {
  licenseId: string;
  months?: number;
  extendsSubscription?: boolean;
}

export interface CentralLicenseRenewResponse {
  licenseId: string;
  previousExpiresAt: string | null;
  newExpiresAt: string | null;
  status: PlatformLicenseStatus;
}

export interface CentralLicenseSuspendRequest {
  licenseId: string;
  reason?: string;
}

export interface CentralLicenseSuspendResponse {
  licenseId: string;
  status: PlatformLicenseStatus;
  suspendedAt: string;
}

export interface CentralLicenseRevokeRequest {
  licenseId: string;
  reason?: string;
}

export interface CentralLicenseRevokeResponse {
  licenseId: string;
  status: PlatformLicenseStatus;
  revokedAt: string;
}

export interface CentralLicenseTransferRequest {
  licenseId: string;
  newHardwareId: string;
  reason?: string;
}

export interface CentralLicenseTransferResponse {
  licenseId: string;
  previousHardwareId: string | null;
  newHardwareId: string;
  transferCount: number;
}

export interface CentralDeviceListItem {
  id: string;
  tenantId: string;
  tenantName?: string;
  licenseId?: string | null;
  hardwareId: string;
  name?: string | null;
  os?: string | null;
  appVersion?: string | null;
  ipAddress?: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'OFFLINE';
  firstActivatedAt: string;
  lastSeenAt?: string | null;
  cloneSuspected: boolean;
}

export interface CentralLicenseListItem {
  id: string;
  tenantId: string;
  tenantName?: string;
  licenseKey: string;
  status: PlatformLicenseStatus;
  issuedAt: string;
  expiresAt?: string | null;
  seats: number;
  deviceLimit: number;
  branchesLimit: number;
  hardwareId?: string | null;
  modules: string[];
  couplingMode: PlatformCouplingMode;
}

// ─── Operations Center ────────────────────────────────────────────────────────

export type PlatformOpsJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
export type PlatformOpsJobType =
  | 'TENANT_PROVISION'
  | 'TENANT_SUSPEND'
  | 'TENANT_DELETE'
  | 'DATA_EXPORT'
  | 'DATA_IMPORT'
  | 'BILLING_CHARGE'
  | 'DEVICE_SYNC'
  | 'SCHEMA_MIGRATE'
  | 'BACKUP'
  | 'RESTORE'
  | 'NOTIFICATION_BLAST'
  | 'CUSTOM';

export interface PlatformOpsJob {
  id: string;
  type: PlatformOpsJobType | string;
  tenantId?: string;
  payload: Record<string, unknown>;
  status: PlatformOpsJobStatus;
  priority: number;
  retries: number;
  maxRetries: number;
  errorMessage?: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
}

export type PlatformMaintenanceStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface PlatformMaintenanceWindow {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  affectedServices: string[];
  status: PlatformMaintenanceStatus;
  createdBy: string;
  createdAt: string;
}

export type PlatformOpApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface PlatformOpApproval {
  id: string;
  opType: string;
  opPayload: Record<string, unknown>;
  requestedBy: string;
  approvedBy?: string;
  status: PlatformOpApprovalStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PlatformSyncStatus = 'SUCCESS' | 'FAIL' | 'PARTIAL';

export interface PlatformSyncLogEntry {
  id: string;
  tenantId?: string;
  deviceId?: string;
  syncType: string;
  status: PlatformSyncStatus;
  recordsSynced: number;
  errorDetail?: string;
  createdAt: string;
}

// ─── Branding & White-Labeling (Item 11) ──────────────────────────────────────

export type PlatformInvoiceTemplate = 'classic' | 'modern' | 'minimal' | 'thermal_pos';

export interface PlatformAllowedCustomizations {
  canChangeLogo: boolean;
  canChangeColors: boolean;
  canChangeInvoiceTemplate: boolean;
  canChangeLogin: boolean;
}

export interface PlatformBrandingConfig {
  id: string;
  tenantId?: string | null;
  companyName: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  invoiceTemplate: PlatformInvoiceTemplate;
  loginBackgroundUrl?: string;
  loginWelcomeTitle?: string;
  loginWelcomeSubtitle?: string;
  emailHeaderLogo?: string;
  emailFooterText?: string;
  customSubdomain?: string;
  allowedCustomizations: PlatformAllowedCustomizations;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformBrandingInput {
  tenantId?: string | null;
  companyName?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  invoiceTemplate?: PlatformInvoiceTemplate;
  loginBackgroundUrl?: string;
  loginWelcomeTitle?: string;
  loginWelcomeSubtitle?: string;
  emailHeaderLogo?: string;
  emailFooterText?: string;
  customSubdomain?: string;
  allowedCustomizations?: Partial<PlatformAllowedCustomizations>;
  changeSummary?: string;
}

export interface PlatformBrandingVersion {
  id: string;
  tenantId?: string | null;
  version: number;
  brandingSnapshot: PlatformBrandingConfig;
  changeSummary?: string;
  createdBy?: string;
  createdAt: string;
}

// ─── UI Customization & Profiles (Item 12) ────────────────────────────────────

export interface FormFieldRule {
  visible: boolean;
  required?: boolean;
  defaultValue?: string | number | boolean;
}

export interface PlatformUiProfile {
  id: string;
  code: string;
  name: string;
  businessType?: string;
  hiddenPages: string[];
  hiddenActions: string[];
  customLabels: Record<string, string>;
  navOrder: string[];
  formFieldRules: Record<string, FormFieldRule>;
  isDefault: boolean;
  createdAt: string;
}

export interface PlatformTenantUiCustomization {
  id: string;
  tenantId: string;
  profileId?: string;
  hiddenPages: string[];
  hiddenActions: string[];
  customLabels: Record<string, string>;
  navOrder: string[];
  formFieldRules: Record<string, FormFieldRule>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantUiInput {
  tenantId: string;
  profileId?: string;
  hiddenPages?: string[];
  hiddenActions?: string[];
  customLabels?: Record<string, string>;
  navOrder?: string[];
  formFieldRules?: Record<string, FormFieldRule>;
  changeSummary?: string;
}

export interface PlatformTenantUiVersion {
  id: string;
  tenantId: string;
  version: number;
  configSnapshot: PlatformTenantUiCustomization;
  changeSummary?: string;
  createdBy?: string;
  createdAt: string;
}

// ─── App Configuration & Rollouts (Item 13) ───────────────────────────────────

export interface PlatformConfigTemplate {
  id: string;
  code: string;
  name: string;
  businessType?: string;
  planId?: string;
  configPayload: Record<string, unknown>;
  version: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantConfig {
  id: string;
  tenantId: string;
  templateId?: string;
  configPayload: Record<string, unknown>;
  signature?: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'DEPRECATED';
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantConfigInput {
  tenantId: string;
  templateId?: string;
  configPayload: Record<string, unknown>;
  status?: 'DRAFT' | 'ACTIVE' | 'DEPRECATED';
  changeSummary?: string;
}

export interface PlatformTenantConfigVersion {
  id: string;
  tenantId: string;
  version: number;
  configPayload: Record<string, unknown>;
  signature?: string;
  changeSummary?: string;
  createdBy?: string;
  createdAt: string;
}

export type RolloutTargetType = 'ALL' | 'ACTIVITY' | 'PLAN' | 'CANARY_PERCENT' | 'SPECIFIC_TENANTS';
export type RolloutStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'ROLLED_BACK';

export interface PlatformConfigRollout {
  id: string;
  title: string;
  targetType: RolloutTargetType;
  targetFilter: Record<string, unknown>;
  configSnapshot: Record<string, unknown>;
  signature: string;
  status: RolloutStatus;
  totalTenants: number;
  receivedCount: number;
  appliedCount: number;
  failedCount: number;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface PlatformConfigRolloutInput {
  title: string;
  targetType: RolloutTargetType;
  targetFilter?: Record<string, unknown>;
  configSnapshot: Record<string, unknown>;
}

export interface PlatformConfigAck {
  id: string;
  tenantId: string;
  deviceId?: string;
  rolloutId?: string;
  version: number;
  status: 'RECEIVED' | 'APPLIED' | 'FAILED';
  errorMessage?: string;
  acknowledgedAt: string;
}

// ─── Platform System Health & Server Diagnostics (Item 14) ────────────────────

export interface PlatformServerTelemetry {
  id: string;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  apiLatencyMs: number;
  apiErrorRate: number;
  redisStatus: 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED';
  activeConnections: number;
  recordedAt: string;
}

export interface PlatformPolicyRetention {
  auditRetentionDays: number;
  backupRetentionDays: number;
  syncLogRetentionDays: number;
  softDeleteGraceDays: number;
}

export interface PlatformPolicySettings {
  terms: string;
  privacy: string;
  retention: PlatformPolicyRetention;
  updatedAt: string | null;
}

export interface PlatformCentralBackup {
  id: string;
  filename: string;
  sizeBytes: number;
  storageLocation: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'VERIFIED';
  integrityCheckPassed: boolean;
  createdAt: string;
  verifiedAt?: string;
}

export interface PlatformServiceIncident {
  id: string;
  serviceName: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description?: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
  createdAt: string;
  resolvedAt?: string;
}

export interface PlatformComprehensiveHealth {
  overallScore: number;
  serverVitals: {
    cpuPercent: number;
    memoryPercent: number;
    diskPercent: number;
    apiLatencyMs: number;
    apiErrorRatePercent: number;
    activeConnections: number;
    uptimeSeconds: number;
  };
  components: {
    database: { status: 'HEALTHY' | 'DEGRADED' | 'DOWN'; sizeMb: number; queryTimeMs: number };
    redisCache: { status: 'CONNECTED' | 'DISCONNECTED'; hitRatioPercent: number };
    syncService: { status: 'HEALTHY' | 'WARNING'; connectedDevices: number; pendingSyncCount: number };
    backupSystem: { status: 'VERIFIED' | 'FAILED'; lastBackupAt?: string; sizeMb?: number };
  };
  recentBackups: PlatformCentralBackup[];
  openIncidents: PlatformServiceIncident[];
  telemetryHistory: PlatformServerTelemetry[];
}

// ─── Platform Technical Health & Business Monitoring Dashboard (Item 15) ───────────────

export interface PlatformTechnicalHealthMetrics {
  score: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  availabilityRate: number;
  apiLatencyMs: number;
  apiSuccessRate: number;
  apiErrorRate: number;
  syncSuccessRate: number;
  syncFailedCount: number;
  staleDevicesCount: number;
  totalDevicesCount: number;
  licenseIntegrityAlerts: number;
  failedOpsJobsCount: number;
  lastBackupStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | 'NONE';
  lastBackupAgeHours: number;
  openIncidents: {
    critical: number;
    major: number;
    minor: number;
  };
  alerts: Array<{
    id: string;
    title: string;
    description: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    category: 'INFRASTRUCTURE' | 'SYNC' | 'DEVICES' | 'LICENSES' | 'BACKUPS' | 'JOBS';
    timestamp: string;
    link?: string;
  }>;
}

export interface PlatformHealthDashboardData {
  technical: PlatformTechnicalHealthMetrics;
  business: PlatformOverview;
}

// ─── Platform Staff & RBAC Management (Item 18) ───────────────────────────────

export type PlatformStaffRole =
  | 'SUPER_ADMIN'
  | 'PLATFORM_ADMIN'
  | 'SUPPORT_AGENT'
  | 'OPERATIONS_ENGINEER'
  | 'BILLING_SPECIALIST'
  | 'LICENSE_MANAGER';

export interface PlatformStaff {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role: PlatformStaffRole;
  permissionsOverride?: string[];
  isActive: boolean;
  lastLoginAt?: string | null;
  mustChangePassword?: boolean;
  dataScope?: 'ALL' | 'LIMITED';
  deletedAt?: string | null;
  invitedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformStaffInput {
  fullName: string;
  email: string;
  phone?: string;
  role: PlatformStaffRole;
  password?: string;
  permissionsOverride?: string[];
  isActive?: boolean;
}

export interface PlatformStaffRoleDefinition {
  role: PlatformStaffRole;
  title: string;
  description: string;
  allowedModules: string[];
  restrictedModules: string[];
}

// ─── Platform Central Security Center (Item 19) ───────────────────────────────

export interface PlatformStaffLogin {
  id: string;
  staffId?: string | null;
  email: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  failureReason?: string | null;
  attemptedAt: string;
}

export interface PlatformStaffSession {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  ipAddress?: string | null;
  deviceName?: string | null;
  isTrustedDevice: boolean;
  isCurrent: boolean;
  expiresAt?: string | null;
  createdAt: string;
  lastActivityAt: string;
}

export interface PlatformCentralSecurityIncident {
  id: string;
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  details?: string | null;
  sourceIp?: string | null;
  status: 'OPEN' | 'CONTAINED' | 'RESOLVED';
  containmentAction?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface PlatformSigningKey {
  id: string;
  keyAlias: string;
  algorithm: string;
  version: number;
  status: 'ACTIVE' | 'ROTATED' | 'REVOKED';
  rotatedAt?: string | null;
  createdAt: string;
}

export interface PlatformCentralSecurityOverview {
  securityScore: number;
  twoFactorEnforcement: {
    enabled: boolean;
    compliantStaffCount: number;
    totalStaffCount: number;
  };
  activeStaffSessionsCount: number;
  failedLogins24hCount: number;
  activeIncidentsCount: number;
  signingKeysCount: number;
  trustedDevicesCount: number;
  sessions: PlatformStaffSession[];
  recentLogins: PlatformStaffLogin[];
  incidents: PlatformCentralSecurityIncident[];
  signingKeys: PlatformSigningKey[];
}

// ─── Platform Staff Security & RBAC v2 ───────────────────────────────────────

export type PlatformStaffInviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface PlatformStaffInvite {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: PlatformStaffRole;
  status: PlatformStaffInviteStatus;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  invitedBy?: string | null;
  invitedByName?: string | null;
  createdAt: string;
}

export interface PlatformStaffInviteInput {
  fullName: string;
  email: string;
  phone?: string;
  role: PlatformStaffRole;
  /** Hours until the invite link expires (default 72). */
  expiresInHours?: number;
}

export interface PlatformStaffInviteCreated {
  invite: PlatformStaffInvite;
  /** Plaintext token — shown ONCE to the inviter; only its hash is stored. */
  token: string;
  /** Ready-to-share invite link (embeds the token). */
  link: string;
}

export interface PlatformTrustedDevice {
  id: string;
  staffId: string;
  staffName?: string | null;
  deviceName?: string | null;
  fingerprint: string;
  lastSeenAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export type PlatformStaffDataScope = 'ALL' | 'LIMITED';

export interface PlatformStaffDataScopeState {
  staffId: string;
  scope: PlatformStaffDataScope;
  tenantIds: string[];
}

export interface PlatformRoleMatrix {
  /** role code → granted permission codes */
  matrix: Record<string, string[]>;
  /** flat catalog grouped by section for rendering the matrix */
  sections: Array<{
    module: string;
    title: string;
    standardActions: string[];
    permissions: Array<{ code: string; action: string; name: string; special?: boolean }>;
  }>;
  standardActionLabels: Record<string, string>;
  fetchedAt: string;
}
