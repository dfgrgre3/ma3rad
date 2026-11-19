import type { PlatformOverview } from './overview';

// ─── Platform System Health & Server Diagnostics (Item 14) ────────────────────

export interface PlatformServerTelemetry {
  id: string;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  apiLatencyMs: number;
  apiErrorRate: number;
  redisStatus: 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED';
  activeConnections: number;
  recordedAt: string;
}

export interface PlatformPolicyDocument {
  terms: string;
  privacy: string;
  retention: PlatformPolicyRetention;
  updatedAt: string;
}

export interface PlatformPolicyRetention {
  auditRetentionDays: number;
  backupRetentionDays: number;
  syncLogRetentionDays: number;
  softDeleteGraceDays: number;
}

export interface PlatformPolicySettings {
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSymbols: boolean;
  passwordMaxAgeDays: number;
  passwordHistoryCount: number;
  sessionTimeoutMinutes: number;
  maxConcurrentSessions: number;
  mfaEnforcement: 'off' | 'optional' | 'required';
  lockoutFailedAttempts: number;
  lockoutDurationMinutes: number;
  requireEmailVerification: boolean;
  allowPasswordReset: boolean;
  auditRetentionDays: number;
  dataRetentionDays: number;
  backupRetentionDays: number;
  apiRateLimitPerMinute: number;
  webhookRetryAttempts: number;
  webhookTimeoutSeconds: number;
}

export interface PlatformCentralBackup {
  id: string;
  filename: string;
  sizeBytes: number;
  storageLocation: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'VERIFIED';
  integrityCheckPassed: boolean;
  createdAt: string;
  verifiedAt?: string;
}

export interface PlatformServiceIncident {
  id: string;
  serviceName: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description?: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
  createdAt: string;
  resolvedAt?: string;
}

export interface PlatformComprehensiveHealth {
  overallScore: number;
  serverVitals: {
    cpuPercent: number;
    memoryPercent: number;
    diskPercent: number;
    apiLatencyMs: number;
    apiErrorRatePercent: number;
    activeConnections: number;
    uptimeSeconds: number;
  };
  components: {
    database: { status: 'HEALTHY' | 'DEGRADED' | 'DOWN'; sizeMb: number; queryTimeMs: number };
    redisCache: { status: 'CONNECTED' | 'DISCONNECTED'; hitRatioPercent: number };
    syncService: { status: 'HEALTHY' | 'WARNING'; connectedDevices: number; pendingSyncCount: number };
    backupSystem: { status: 'VERIFIED' | 'FAILED'; lastBackupAt?: string; sizeMb?: number };
  };
  recentBackups: PlatformCentralBackup[];
  openIncidents: PlatformServiceIncident[];
  telemetryHistory: PlatformServerTelemetry[];
}

// ─── Platform Technical Health & Business Monitoring Dashboard (Item 15) ───────────────

export interface PlatformTechnicalHealthMetrics {
  score: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  availabilityRate: number;
  apiLatencyMs: number;
  apiSuccessRate: number;
  apiErrorRate: number;
  syncSuccessRate: number;
  syncFailedCount: number;
  staleDevicesCount: number;
  totalDevicesCount: number;
  licenseIntegrityAlerts: number;
  failedOpsJobsCount: number;
  lastBackupStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | 'NONE';
  lastBackupAgeHours: number;
  openIncidents: {
    critical: number;
    major: number;
    minor: number;
  };
  alerts: Array<{
    id: string;
    title: string;
    description: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    category: 'INFRASTRUCTURE' | 'SYNC' | 'DEVICES' | 'LICENSES' | 'BACKUPS' | 'JOBS';
    timestamp: string;
    link?: string;
  }>;
}

export interface PlatformHealthDashboardData {
  technical: PlatformTechnicalHealthMetrics;
  business: PlatformOverview;
}
