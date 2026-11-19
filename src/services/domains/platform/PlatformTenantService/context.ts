import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type {
  PlatformTenant,
  PlatformTenantAccount,
  PlatformTenantUser,
} from '../platformTypes';

export interface TenantAuditOptions {
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

export type TenantAuditFn = (
  action: string,
  entityType: string,
  entityId: string | null,
  details?: unknown,
  options?: TenantAuditOptions
) => void;

export type RequirePlatformAccessFn = (modules: string | string[], action?: string) => any;

export interface TenantServiceContext {
  db: DatabaseManager;
  audit: TenantAuditFn;
  requirePlatformAccess: RequirePlatformAccessFn;
  staffTenantScope: (user: any) => string[] | null;
  setting: (key: string, fallback?: string) => string;
  getTenant: (id: string) => PlatformTenant | null;
  getTenantAccount: (tenantId: string) => PlatformTenantAccount | null;
  getTenantUser: (id: string) => PlatformTenantUser | null;
}
