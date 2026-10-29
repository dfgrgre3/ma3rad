// Shared types for the offline-first multi-branch synchronization subsystem.

export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE' | 'UPSERT';
export type SyncDataScope = 'TENANT' | 'BRANCH';

export type SyncDeliveryStatus =
  | 'PENDING'
  | 'IN_FLIGHT'
  | 'ACKNOWLEDGED'
  | 'FAILED'
  | 'DEAD_LETTER';

export type SyncInboxStatus =
  | 'RECEIVED'
  | 'APPLIED'
  | 'DUPLICATE'
  | 'FAILED'
  | 'REJECTED';

export interface SyncEvent {
  eventId: string;
  tenantId?: string | null;
  branchId: string;
  deviceId?: string | null;
  entityType: string;
  entityId: string;
  operationType: SyncOperation;
  entityVersion: number;
  schemaVersion: number;
  dataScope?: SyncDataScope;
  payload: unknown;
  createdAt: string;
  deliveryStatus?: SyncDeliveryStatus;
  attempts?: number;
  lastError?: string | null;
  nextRetryAt?: string | null;
}

export interface SyncPushResult {
  acknowledged: string[];
  failed: Array<{ eventId: string; error: string }>;
}

export interface SyncPullResult {
  events: SyncEvent[];
  nextCursor: string | null;
}

export interface SyncTransport {
  pushEvents(events: SyncEvent[]): Promise<SyncPushResult>;
  pullEvents(scope: string, cursor: string | null, limit: number): Promise<SyncPullResult>;
}

export interface SyncStatus {
  connected: boolean;
  lastSuccessfulSyncAt: string | null;
  pendingCount: number;
  failedCount: number;
  deadLetterCount: number;
  lastError: string | null;
}
