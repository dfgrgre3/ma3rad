export type AuditSeverity = 'INFO' | 'NOTICE' | 'WARNING' | 'SECURITY' | 'CRITICAL';
export type AuditActorType = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'DEVICE' | 'API_CLIENT' | 'SYSTEM';
export type AuditStatus = 'SUCCESS' | 'FAILURE' | 'BLOCKED';

export interface PlatformAuditEntry {
  id: string;
  actorId?: string | null;
  actorName?: string | null;
  actorType?: AuditActorType;
  tenantId?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  severity: AuditSeverity;
  status: AuditStatus;
  details?: string | null;
  oldValues?: string | null;
  newValues?: string | null;
  errorMessage?: string | null;
  prevHash?: string | null;
  recordHash?: string | null;
  createdAt: string;
}

export interface PlatformAuditFilters {
  search?: string;
  tenantId?: string;
  severity?: AuditSeverity | 'all';
  status?: AuditStatus | 'all';
  actorType?: AuditActorType | 'all';
  actorId?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface PlatformAuditPaginatedResult {
  entries: PlatformAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  integrityVerified: boolean;
}
