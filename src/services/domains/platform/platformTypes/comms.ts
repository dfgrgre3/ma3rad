// ─── Bulk Operations & Remote Control Types (PLAN_TENANTS_ENHANCEMENT) ───────────

export interface PlatformConfigPush {
  id: string;
  tenantId: string;
  configJson: string;
  pushedBy: string;
  status: 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'FAILED';
  pushedAt: string;
  acknowledgedAt?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  createdAt: string;
}

export interface PlatformTenantConfigPushInput {
  tenantId: string;
  configJson: string;
  pushedBy?: string;
  force?: boolean;
}

export interface PlatformOutboxEvent {
  id: string;
  entityType: 'TENANT' | 'LICENSE' | 'SUBSCRIPTION' | 'CONFIG' | 'DEVICE';
  entityId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  createdAt: string;
  sentAt?: string | null;
  errorMessage?: string | null;
}

// ─── Notifications (Phase 5: LICENSE_MANAGEMENT_IMPLEMENTATION_PLAN) ──────────────

export interface PlatformNotification {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  message: string;
  referenceType: string;
  referenceId: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  channels: string[];
  metadata: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}
