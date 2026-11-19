import type { DatabaseManager } from '../../../database/repositories/databaseManager';
import type {
  PlatformStaff,
  PlatformStaffInvite,
  PlatformStaffLogin,
  PlatformStaffSession,
  PlatformCentralSecurityIncident,
  PlatformSigningKey,
} from '../platformTypes';

export interface StaffAuditOptions {
  severity?: import('../platformTypes').AuditSeverity;
  status?: import('../platformTypes').AuditStatus;
  actorType?: import('../platformTypes').AuditActorType;
  tenantId?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  ipAddress?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  errorMessage?: string | null;
}

export type StaffAuditFn = (
  action: string,
  entityType: string,
  entityId: string | null,
  details?: unknown,
  options?: StaffAuditOptions
) => void;

export type RequirePlatformAccessFn = (modules: string | string[], action?: string) => any;

export type AssertOwnerRoleGrantFn = (role: string, options?: { creating?: boolean }) => void;

export interface StaffServiceContext {
  db: DatabaseManager;
  audit: StaffAuditFn;
  requirePlatformAccess: RequirePlatformAccessFn;
  assertOwnerRoleGrant: AssertOwnerRoleGrantFn;
  setting: (key: string, fallback?: string) => string;
  getPlatformStaff: (id: string) => PlatformStaff | null;
  getStaffInvite: (id: string) => PlatformStaffInvite | null;
  getStaffInviteByToken: (token: string) => PlatformStaffInvite;
  getStaffMfaEnforcement: () => 'off' | 'optional' | 'required';
  listPlatformSecurityIncidents: () => PlatformCentralSecurityIncident[];
  getStaffMfaCompliance: () => {
    total: number;
    enabled: number;
    requiredButDisabled: number;
    byRole: Record<string, { total: number; enabled: number }>;
  };
  listStaffLogins: (limit?: number, failedOnly?: boolean, staffId?: string) => PlatformStaffLogin[];
  listPlatformSigningKeys: () => PlatformSigningKey[];
  listStaffSessions: (staffId?: string) => PlatformStaffSession[];
}
