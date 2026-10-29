/**
 * الأنواع المشتركة للخدمات الأمنية والأداء
 */

export interface BackupInfo {
  path: string;
  size: number;
  timestamp: string;
  type: 'full' | 'incremental' | 'differential' | 'daily' | 'weekly' | 'monthly';
  isEncrypted: boolean;
  checksum?: string;
}

export interface BackupStats {
  totalBackups: number;
  totalSizeBytes: number;
  lastBackupTime: string | null;
  recentBackups: BackupInfo[];
  strategy: {
    daily: number;
    weekly: number;
    monthly: number;
    keepDaily: number;
    keepWeekly: number;
    keepMonthly: number;
  };
}

export interface BackupStatus {
  lastSuccess: string | null;
  lastFailure: string | null;
  backupCount: number;
  nextScheduled: string | null;
  errors: string[];
}

export interface SecurityConfig {
  encryptionAlgorithm: 'aes-256-gcm' | 'aes-256-ctr';
  keyStorage: 'local' | 'secureEnclave';
  backupEncryption: boolean;
  auditLogging: boolean;
  performanceMonitoring: boolean;
  accessControl: 'strict' | 'moderate';
  twoFactorEnabled: boolean;
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
  };
}

export interface SecurityMetrics {
  activeUsers: number;
  failedLogins: number;
  successfulLogins: number;
  encryptionEvents: number;
  backupEvents: number;
  auditEvents: number;
  performanceAlerts: number;
  securityRanking: 'A' | 'B' | 'C' | 'D';
}

export interface LogEntry {
  id: string;
  timestamp: string;
  userId: string;
  sessionId: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  changes: Record<string, unknown> | null;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  error?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/** جلسة نشطة للمستخدم */
export interface ActiveSession {
  id: string;
  userId: string;
  userName: string;
  username: string;
  role: string;
  deviceLabel?: string;
  lastSeenAt?: string;
  startedAt?: string;
  isCurrent: boolean;
}

/** سجل محاولات الدخول */
export interface LoginRecord {
  id: string;
  userId: string | null;
  username: string;
  succeeded: boolean;
  failureReason?: string;
  deviceLabel?: string;
  createdAt: string;
  ipAddress?: string;
  userAgent?: string;
}

/** نظرة عامة على الأمان */
export interface SecurityOverview {
  activeSessions: number;
  usersCount: number;
  success24h: number;
  failed24h: number;
  sessionTimeoutMinutes?: number;
  maxFailedAttempts?: number;
  lockedAccounts?: number;
  lastBackupAt?: string;
}
