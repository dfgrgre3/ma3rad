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
