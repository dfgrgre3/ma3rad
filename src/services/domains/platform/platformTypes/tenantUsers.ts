export type PlatformTenantUserProvisioningStatus =
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'PROCESSING'
  | 'INVITED'
  | 'PROVISIONED'
  | 'FAILED'
  | 'RETRYING'
  | 'CANCELLED'
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
  isActive: boolean;
  notes?: string | null;
  /** Directory/provisioning record is not a real tenant identity account until provisioned. */
  provisioningStatus: PlatformTenantUserProvisioningStatus;
  provisioningMode?: 'INVITE' | 'DIRECT_CREATE' | null;
  identityUserId?: string | null;
  scope?: string | null;
  inviteCode?: string | null;
  temporaryPassword?: string | null,
  inviteExpiresAt?: string | null,
  provisionedAt?: string | null,
  lastError?: string | null,
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
  activationCode?: string | null;
  loginUrl?: string;
  provisioned: boolean;
  message: string;
}
