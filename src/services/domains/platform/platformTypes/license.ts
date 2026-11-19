import type { PlatformLicenseStatus } from './billing';

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
