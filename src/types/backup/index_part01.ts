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
