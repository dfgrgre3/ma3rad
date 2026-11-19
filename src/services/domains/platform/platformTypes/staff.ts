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
  username: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role: PlatformStaffRole;
  passwordHash?: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  permissionsOverride?: string[];
  mfaEnabled: boolean;
  mfaEnforcement: 'off' | 'optional' | 'required';
  totpSecret?: string | null;
  backupCodes?: string[] | null;
  dataScope: 'ALL' | 'LIMITED';
  dataScopeTenantIds: string[] | null;
  lastLoginAt?: string | null;
  failedLoginAttempts: number;
  lockedUntil?: string | null;
  deletedAt?: string | null;
  invitedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformStaffInput {
  username?: string;
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

// ─── Platform Staff Security & RBAC v2 ───────────────────────────────────────

export type PlatformStaffInviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface PlatformStaffInvite {
  id: string;
  token: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: PlatformStaffRole;
  status: PlatformStaffInviteStatus;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  invitedBy?: string | null;
  invitedByName?: string | null,
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
  loginUrl: string;
  temporaryPassword: string;
}

export interface PlatformTrustedDevice {
  id: string;
  staffId: string;
  staffName?: string | null;
  deviceName?: string | null;
  fingerprint: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  trustedAt: string;
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
