import type {
  PlatformStaff,
  PlatformStaffInvite,
  PlatformTrustedDevice,
  PlatformStaffSession,
  PlatformStaffLogin,
  PlatformStaffRole,
  PlatformCentralSecurityIncident,
  PlatformSigningKey,
} from '../platformTypes';
import { toNumber } from '../platformUtils';

export function mapStaff(row: any): PlatformStaff {
  return {
    id: String(row.id),
    username: String(row.username),
    fullName: String(row.full_name),
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: String(row.role) as PlatformStaffRole,
    isActive: Boolean(row.is_active),
    mfaEnabled: Boolean(row.mfa_enabled),
    mfaEnforcement: row.mfa_enforcement,
    totpSecret: row.totp_secret ?? null,
    backupCodes: row.backup_codes ? JSON.parse(row.backup_codes) : null,
    dataScope: row.data_scope,
    dataScopeTenantIds: row.data_scope_tenant_ids ? JSON.parse(row.data_scope_tenant_ids) : null,
    lastLoginAt: row.last_login_at ?? null,
    failedLoginAttempts: toNumber(row.failed_login_attempts, 0),
    lockedUntil: row.locked_until ?? null,
    mustChangePassword: Boolean(row.must_change_password),
    deletedAt: row.deleted_at ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    passwordHash: row.password_hash,
  };
}

export function mapInvite(row: any, options: { includeToken?: boolean } = {}): PlatformStaffInvite {
  return {
    id: String(row.id),
    // The raw invite token is a credential — only surface it on flows that
    // explicitly need it (lookup-by-token). Listings must never expose it;
    // the DB keeps `token`/`token_hash` columns untouched for compatibility.
    token: options.includeToken ? String(row.token ?? '') : '',
    email: String(row.email),
    fullName: String(row.full_name),
    role: String(row.role) as PlatformStaffRole,
    invitedBy: String(row.invited_by),
    status: row.status,
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  };
}

export function mapTrustedDevice(row: any): PlatformTrustedDevice {
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    deviceName: row.device_name ?? null,
    fingerprint: String(row.fingerprint),
    ipAddress: row.ip_address ?? null,
    userAgent: row.user_agent ?? null,
    trustedAt: String(row.trusted_at),
    lastSeenAt: row.last_used_at ?? null,
    createdAt: String(row.created_at),
  };
}

export function mapSession(row: any, getStaff: (id: string) => PlatformStaff | null): PlatformStaffSession {
  const staff = getStaff(String(row.staff_id));
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    staffName: staff?.fullName ?? '',
    staffRole: staff?.role ?? '',
    ipAddress: row.ip_address ?? null,
    deviceName: row.device_name ?? null,
    userAgent: row.user_agent ?? null,
    isTrustedDevice: Boolean(row.is_trusted_device ?? false),
    isCurrent: Boolean(row.is_current ?? false),
    expiresAt: row.expires_at ?? null,
    createdAt: String(row.created_at),
    lastActivityAt: row.last_activity_at ?? null,
  };
}

export function mapLogin(row: any): PlatformStaffLogin {
  return {
    id: String(row.id),
    staffId: row.staff_id ?? null,
    username: row.username ?? null,
    email: row.email ?? null,
    ipAddress: row.ip_address ?? null,
    userAgent: row.user_agent ?? null,
    status: row.success !== undefined && row.success !== null ? (row.success ? 'SUCCESS' : 'FAILED') : (row.status ?? 'FAILED'),
    failureReason: row.failure_reason ?? null,
    mfaUsed: Boolean(row.mfa_used),
    attemptedAt: String(row.created_at),
  };
}

export function mapSecurityIncident(row: any): PlatformCentralSecurityIncident {
  return {
    id: String(row.id),
    type: String(row.type),
    severity: row.severity,
    title: String(row.title),
    description: row.description ?? null,
    details: row.details ?? row.description ?? null,
    sourceIp: row.source_ip ?? row.ip_address ?? null,
    tenantId: row.tenant_id ?? null,
    staffId: row.staff_id ?? null,
    deviceId: row.device_id ?? null,
    ipAddress: row.ip_address ?? null,
    status: row.status,
    response: row.response ?? null,
    containmentAction: row.containment_action ?? row.response ?? null,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    resolvedAt: row.resolved_at ?? null,
  };
}

export function mapSigningKey(row: any): PlatformSigningKey {
  return {
    id: String(row.id),
    alias: String(row.key_alias ?? row.alias ?? ''),
    keyAlias: row.key_alias ?? row.alias,
    privateKey: row.private_key ?? null,
    publicKey: row.public_key ?? null,
    algorithm: row.algorithm ?? 'Ed25519',
    version: toNumber(row.version, 1),
    status: row.status,
    fingerprint: row.fingerprint ?? null,
    isCurrent: Boolean(row.is_current),
    rotatedAt: row.rotated_at ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
