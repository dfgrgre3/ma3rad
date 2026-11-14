export type PlatformTenantStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';
export type PlatformLicenseStatus = 'ISSUED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
export type PlatformSubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
export type PlatformInvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID';
export type PlatformPaymentMethod = 'CASH' | 'BANK' | 'CARD' | 'WALLET' | 'OTHER';
export type PlatformBillingCycle = 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'LIFETIME';

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
  activatedAt?: string | null;
  expiresAt?: string | null;
  seats: number;
  deviceLimit: number;
  hardwareId?: string | null;
  activationCode?: string | null;
  certificate?: string | null;
  transferCount?: number;
  modules: string[];
  features: string[];
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
  billingCycle: PlatformBillingCycle;
  autoRenew: boolean;
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
  releasedAt?: string | null;
  createdAt: string;
}

export interface PlatformReleaseTarget {
  id: string;
  releaseId: string;
  tenantId: string;
  tenantName?: string | null;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  appliedAt?: string | null;
  error?: string | null;
  createdAt: string;
}

export interface PlatformAuditEntry {
  id: string;
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: string | null;
  createdAt: string;
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
}

export interface PlatformLicenseActivation {
  id: string;
  licenseId: string;
  tenantId: string;
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
  attachmentUrl?: string | null;
  createdAt: string;
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
}

export interface PlatformSettingsMap {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  defaultCurrency: string;
  defaultTrialDays: number;
  invoicePrefix: string;
}
