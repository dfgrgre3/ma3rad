// ─── App Configuration & Rollouts (Item 13) ───────────────────────────────────

export interface PlatformConfigTemplate {
  id: string;
  code: string;
  name: string;
  businessType?: string | null;
  planId?: string | null;
  configPayload: Record<string, unknown>;
  version: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantConfig {
  id: string;
  tenantId: string;
  templateId?: string;
  configPayload: Record<string, unknown>;
  signature?: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'DEPRECATED';
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantConfigInput {
  tenantId: string;
  templateId?: string;
  values: Record<string, unknown>;
  configPayload?: Record<string, unknown>;
  status?: 'DRAFT' | 'ACTIVE' | 'DEPRECATED';
  changeSummary?: string;
}

export interface PlatformTenantConfigVersion {
  id: string;
  tenantId: string;
  version: number;
  configPayload: Record<string, unknown>;
  signature?: string;
  changeSummary?: string;
  createdBy?: string;
  createdAt: string;
}

export type RolloutTargetType = 'ALL' | 'ACTIVITY' | 'PLAN' | 'CANARY_PERCENT' | 'SPECIFIC_TENANTS';
export type RolloutStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'ROLLED_BACK';

export interface PlatformConfigRollout {
  id: string;
  title: string;
  targetType: RolloutTargetType;
  targetFilter: Record<string, unknown>;
  configSnapshot: Record<string, unknown>;
  signature: string;
  status: RolloutStatus;
  totalTenants: number;
  receivedCount: number;
  appliedCount: number;
  failedCount: number;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface PlatformConfigRolloutInput {
  templateId: string;
  name: string;
  description?: string;
  targetType: RolloutTargetType;
  targetIds?: string[];
  rolloutPercentage?: number;
  scheduledAt?: string;
}

export interface PlatformConfigAck {
  id: string;
  tenantId: string;
  deviceId?: string;
  rolloutId?: string;
  version: number;
  status: 'RECEIVED' | 'APPLIED' | 'FAILED';
  errorMessage?: string;
  acknowledgedAt: string;
}
