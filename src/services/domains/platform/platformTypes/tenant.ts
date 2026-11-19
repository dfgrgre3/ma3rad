import type { PlatformPlan } from './plans';
import type { PlatformInvoice, PlatformPayment, PlatformSubscription } from './billing';
import type { PlatformLicense } from './license';
import type { PlatformAuditEntry } from './audit';

export type PlatformTenantStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';

export const PLATFORM_TENANT_STATUS_LABELS: Record<PlatformTenantStatus, string> = {
  TRIAL: 'تجريبي',
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  EXPIRED: 'منتهي',
  CANCELLED: 'ملغي',
};

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
