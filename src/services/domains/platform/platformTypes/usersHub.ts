import type { PlatformStaff } from './staff';
import type { PlatformTenantUser, PlatformTenantUserDirectoryEntry } from './tenantUsers';

/** Aggregated counters shown on the unified users overview tab. */
export interface PlatformUsersOverview {
  staff: {
    total: number;
    active: number;
    inactive: number;
    locked: number;
    mustChangePassword: number;
    byRole: Record<string, number>;
  };
  tenantUsers: {
    total: number;
    byStatus: Record<string, number>;
    byProvisioning: Record<string, number>;
    byOrigin: Record<string, number>;
    newLast7Days: number;
  };
  provisioning: {
    pending: number;
    failed: number;
  };
  recentEvents: PlatformUserAuditEvent[];
}

export interface PlatformUserAuditEvent {
  id: string;
  actorName?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  tenantId?: string | null;
  createdAt?: string | null;
}

export interface PlatformUsersSearchResults {
  staff: PlatformStaff[];
  tenantUsers: PlatformTenantUserDirectoryEntry[];
}

export interface PlatformTenantUserJob {
  id: string;
  event?: string | null;
  status?: string | null;
  attempts?: number | null;
  maxAttempts?: number | null;
  lastError?: string | null;
  claimedByDeviceId?: string | null;
  resultIdentityUserId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
}

export interface PlatformTenantUserDetail {
  user: PlatformTenantUser & {
    tenantName?: string | null;
    tenantCode?: string | null;
    tenantStatus?: string | null;
  };
  tenant: { id: string; name?: string | null; code?: string | null; status?: string | null } | null;
  jobs: PlatformTenantUserJob[];
  events: PlatformUserAuditEvent[];
}

export interface PlatformStaffPermissionEntry {
  code: string;
  module?: string | null;
  action?: string | null;
  name?: string | null;
}

export interface PlatformStaffLoginEntry {
  username?: string | null;
  success?: boolean | number | null;
  failureReason?: string | null;
  ipAddress?: string | null;
  createdAt?: string | null;
}

export interface PlatformStaffUserDetail {
  staff: PlatformStaff;
  roles: string[];
  grants: PlatformStaffPermissionEntry[];
  denies: PlatformStaffPermissionEntry[];
  activeSessions: number;
  recentLogins: PlatformStaffLoginEntry[];
}
