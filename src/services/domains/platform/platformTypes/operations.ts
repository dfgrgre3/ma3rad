// ─── Operations Center ────────────────────────────────────────────────────────

export type PlatformOpsJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
export type PlatformOpsJobType =
  | 'TENANT_PROVISION'
  | 'TENANT_SUSPEND'
  | 'TENANT_DELETE'
  | 'DATA_EXPORT'
  | 'DATA_IMPORT'
  | 'BILLING_CHARGE'
  | 'DEVICE_SYNC'
  | 'SCHEMA_MIGRATE'
  | 'BACKUP'
  | 'RESTORE'
  | 'NOTIFICATION_BLAST'
  | 'CUSTOM';

export interface PlatformOpsJob {
  id: string;
  type: PlatformOpsJobType | string;
  tenantId?: string;
  payload: Record<string, unknown>;
  status: PlatformOpsJobStatus;
  priority: number;
  retries: number;
  maxRetries: number;
  errorMessage?: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
}

export type PlatformMaintenanceStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface PlatformMaintenanceWindow {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  affectedServices: string[];
  status: PlatformMaintenanceStatus;
  createdBy: string;
  createdAt: string;
}

export type PlatformOpApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface PlatformOpApproval {
  id: string;
  opType: string;
  opPayload: Record<string, unknown>;
  requestedBy: string;
  approvedBy?: string;
  status: PlatformOpApprovalStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PlatformSyncStatus = 'SUCCESS' | 'FAIL' | 'PARTIAL';

export interface PlatformSyncLogEntry {
  id: string;
  tenantId?: string;
  deviceId?: string;
  syncType: string;
  status: PlatformSyncStatus;
  recordsSynced: number;
  errorDetail?: string;
  createdAt: string;
}
