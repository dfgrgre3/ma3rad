import type { PlatformLicenseStatus, PlatformSubscriptionStatus, PlatformBillingCycle, PlatformCouplingMode } from './billing';
import type { PlatformTenantStatus } from './tenant';

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
