export interface PlatformAlert {
  id: string;
  severity: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
  link?: string;
}

export interface PlatformModuleUsage {
  code: string;
  name: string;
  category?: string | null;
  enabled: boolean;
  licenseCount: number;
  tenantCount: number;
}

export interface PlatformModule {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isEnabled: boolean;
  minPlanCode?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformFeatureFlag {
  id: string;
  /** Feature code/key used at runtime (e.g. sales.quick_invoice). */
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isEnabled: boolean;
  rolloutPercent: number;
  isStagingOnly?: boolean;
  minPlanTier?: string | null;
  /** Tenant-app page paths owned by this feature (hidden when feature is inactive). */
  pagePaths?: string[];
  overridesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformFeatureOverride {
  id: string;
  featureId: string;
  targetType: 'TENANT' | 'PLAN' | 'STAGING_GROUP';
  targetId: string;
  targetName?: string | null;
  isEnabled: boolean;
  customRolloutPercent?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformRelease {
  id: string;
  version: string;
  channel: string;
  status?: string | null;
  isMandatory?: boolean | null;
  minVersion?: string | null;
  rolloutGroup?: string | null;
  notes?: string | null;
  releasedAt?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  checksumSha256?: string | null;
  packageSignature?: string | null;
  changelog?: string | null;
  rollbackVersion?: string | null;
  stagingGroup?: string | null;
  targetsSummary?: Record<string, number> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformReleaseTarget {
  id: string;
  releaseId: string;
  tenantId: string;
  tenantName?: string | null;
  deviceId?: string | null;
  clientVersion?: string | null;
  attemptCount?: number;
  status: string;
  appliedAt?: string | null;
  error?: string | null;
  deployedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSettingsMap {
  [key: string]: string | number | undefined;
}
