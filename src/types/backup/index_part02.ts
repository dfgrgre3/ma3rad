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
