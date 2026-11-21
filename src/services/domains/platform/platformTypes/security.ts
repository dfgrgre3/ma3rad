// ─── Platform Central Security Center (Item 19) ───────────────────────────────

export interface PlatformStaffLogin {
  id: string;
  staffId?: string | null;
  username?: string | null;
  email: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  failureReason?: string | null;
  mfaUsed?: boolean;
  attemptedAt: string;
}

export interface PlatformStaffSession {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  ipAddress?: string | null;
  deviceName?: string | null;
  userAgent?: string | null;
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
  description?: string | null;
  details?: string | null;
  sourceIp?: string | null;
  ipAddress?: string | null;
  tenantId?: string | null;
  staffId?: string | null;
  deviceId?: string | null,
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CONTAINED';
  containmentAction?: string | null;
  response?: string | null;
  metadata?: Record<string, unknown> | null,
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string | null;
}

export interface PlatformSigningKey {
  id: string;
  alias: string;
  keyAlias?: string;
  privateKey?: string;
  publicKey?: string;
  algorithm: string;
  version: number;
  status: 'ACTIVE' | 'ROTATED' | 'REVOKED';
  fingerprint?: string;
  isCurrent?: boolean;
  rotatedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type PlatformSecurityEventSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Unified security event row. Centrally this maps `platform_security_events`
 * (snake_case wire → camelCase here); locally it is synthesized from staff
 * logins and incidents so the events feed works in both data modes.
 */
export interface PlatformSecurityEvent {
  id: string;
  eventType: string;
  severity: PlatformSecurityEventSeverity;
  title: string;
  description?: string | null;
  sourceIp?: string | null;
  tenantId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  metadata?: Record<string, unknown> | null;
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
  /** Recent platform security events (central: platform_security_events; local: synthesized). */
  securityEvents?: PlatformSecurityEvent[];
  /** Severity → count breakdown of events in the last 24h (central overview payload). */
  events24hBySeverity?: Record<string, number>;
}
