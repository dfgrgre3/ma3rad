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

// ---------------------------------------------------------------------------
// Company account links (ربط حساب شركة آخر بكود أو مفتاح API + كلمة سر)
// ---------------------------------------------------------------------------

export type AccountLinkStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'REVOKED';

export interface AccountLink {
  id: string;
  companyName: string;
  linkCode?: string | null;
  apiToken?: string | null;
  tenantId?: string | null;
  branchId?: string | null;
  deviceId?: string | null;
  status: AccountLinkStatus;
  requiresApproval: boolean;
  linkedBy?: string | null;
  linkedAt?: string | null;
  lastVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountLinkSummary extends AccountLink {
  permissions: string[];
  pendingChanges: number;
}

// ---------------------------------------------------------------------------
// Owner approvals for edits produced by branches / linked accounts
// ---------------------------------------------------------------------------

export type PendingChangeStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLIED'
  | 'CANCELLED';

export interface PendingChange {
  id: string;
  tenantId?: string | null;
  branchId?: string | null;
  deviceId?: string | null;
  linkId?: string | null;
  entityType: string;
  entityId: string;
  operationType: SyncOperation;
  entityVersion: number;
  dataScope: SyncDataScope;
  payload: string;
  title: string;
  summary?: string | null;
  status: PendingChangeStatus;
  requestedBy: string;
  requestedByName?: string | null;
  requestedByRole?: string | null;
  requestedBranchId?: string | null;
  decidedBy?: string | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
  decisionNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  notes?: PendingChangeNote[];
}

export interface PendingChangeNote {
  id: string;
  changeId: string;
  recipientUserId?: string | null;
  recipientLinkId?: string | null;
  recipientLabel?: string | null;
  notes: string;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Sync status surface (حالة المزامنة وآخر اتصال)
// ---------------------------------------------------------------------------

export interface SyncBranchStatus {
  branchId: string;
  name: string;
  status: string;
  isVerified: boolean;
  lastContactAt?: string | null;
  lastSyncAt?: string | null;
  deviceCount: number;
  pendingChanges: number;
  online: boolean;
}

export interface SyncOverview {
  configured: boolean;
  connected: boolean;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  pendingCount: number;
  failedCount: number;
  deadLetterCount: number;
  inboxPendingCount: number;
  conflictCount: number;
  pendingApprovalCount: number;
  branches: SyncBranchStatus[];
  links: AccountLinkSummary[];
}
