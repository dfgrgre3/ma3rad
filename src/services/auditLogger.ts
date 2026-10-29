/**
 * نظام التتبع والمراقبة المحلية المتقدم
 * تسجيل شامل لجميع العمليات الحساسة والنشاط الأمني
 */

export interface AuditLog {
  timestamp: string;           // وقت العملية
  sessionId: string;            // معرف الجلسة
  userId: string;               // معرف المستخدم
  action: string;               // نوع العملية
  entityType: string;           // نوع الكيان (مستخدم، عملية بيع، إلخ)
  entityId: string;             // معرف الكيان
  description: string;          // وصف العملية
  changes: Record<string, unknown> | null;  // التغييرات (قبل وبعد)
  ipAddress: string;            // IP (شبكة محلية فقط)
  userAgent: string;            // متصفح/تطبيق
  success: boolean;             // هل نجحت العملية
  error?: string;               // رسالة الخطأ
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface SecurityEvent {
  timestamp: string;
  event_type: 'login_attempt' | 'logout' | 'failed_login' | 'password_change' | 'permission_denied' | 'system_alert';
  user_id: string;
  description: string;
  ip_address: string;
  outcome: 'success' | 'failure';
  details?: Record<string, unknown>;
}

interface DatabaseStats {
  size_mb: number;
  record_count: number;
  last_backup?: string;
  backups_count: number;
  avg_access_time_ms: number;
}

class AuditLoggerService {
  private static instance: AuditLoggerService;
  private logs: AuditLog[] = [];
  private maxLogs: number = 10000;  // الحد الأقصى للسجلات
  private flushInterval: number = 5 * 60 * 1000;  // كل 5 دقائق

  private constructor() {
    this.loadLogs();
    this.startScheduledFlush();
  }

  static getInstance(): AuditLoggerService {
    if (!AuditLoggerService.instance) {
      AuditLoggerService.instance = new AuditLoggerService();
    }
    return AuditLoggerService.instance;
  }

  private loadLogs(): void {
    try {
      const stored = localStorage.getItem('audit_logs');
      if (stored) {
        this.logs = JSON.parse(stored);
        this.flushToDisk();
      }
    } catch (error) {
      console.error('فشل تحميل سجلات التدقيق:', error);
    }
  }

  private saveLogs(): void {
    try {
      localStorage.setItem('audit_logs', JSON.stringify(this.logs.slice(-this.maxLogs)));
    } catch (error) {
      console.error('فشل حفظ سجلات التدقيق:', error);
    }
  }

  private flushToDisk(): void {
    // يمكن إضافة هنا serialization للنصوص على القرص
    // الحالي: يتم الحفظ في الذاكرة فقط
  }

  private startScheduledFlush(): void {
    setInterval(() => this.saveLogs(), this.flushInterval);
  }

  /**
   * تهيئة النظام
   */
  initialize(): void {
    this.loadLogs();
    this.startScheduledFlush();
    console.log('AuditLogger initialized');
  }

  /**
   * تسجيل عملية مع wanna الأمان
   */
  log(
    userId: string,
    sessionId: string,
    action: string,
    entityType: string,
    entityId: string,
    description: string,
    changes: Record<string, unknown> | null = null,
    success: boolean = true,
    error?: string,
    severity: AuditLog['severity'] = 'medium'
  ): void {
    const logEntry: AuditLog = {
      timestamp: new Date().toISOString(),
      sessionId,
      userId,
      action,
      entityType,
      entityId,
      description,
      changes,
      ipAddress: '127.0.0.1',  // محلي فقط
      userAgent: window.navigator.userAgent,
      success,
      error,
      severity
    };

    this.logs.push(logEntry);

    // قص السجلات القديمة للحفاظ على الأداء
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    this.saveLogs();

    // إرسال إشعار للأنظمة الحيوية
    if (severity === 'high' || severity === 'critical') {
      this.emitAlert(logEntry);
    }
  }

  private emitAlert(logEntry: AuditLog): void {
    // إشعار النظام بالتفاعل مع المشاكل
    const event = new CustomEvent('audit-alert', { detail: logEntry });
    window.dispatchEvent(event);
  }

  /**
   * تسجيل حدث أمني
   */
  logSecurityEvent(
    eventType: SecurityEvent['event_type'],
    userId: string,
    description: string,
    outcome: SecurityEvent['outcome'],
    details?: Record<string, unknown>
  ): void {
    const event: SecurityEvent = {
      timestamp: new Date().toISOString(),
      event_type: eventType,
      user_id: userId,
      description,
      ip_address: '127.0.0.1',
      outcome,
      details
    };

    this.logs.push({
      timestamp: event.timestamp,
      sessionId: 'security',
      userId,
      action: `security-${eventType}`,
      entityType: 'security',
      entityId: eventType,
      description,
      changes: null,
      ipAddress: event.ip_address,
      userAgent: window.navigator.userAgent,
      success: outcome === 'success',
      severity: this.getSeverityForEvent(eventType, outcome),
      error: outcome === 'failure' ? `حدث: ${eventType}` : undefined
    });

    this.saveLogs();
  }

  private getSeverityForEvent(eventType: string, outcome: string): 'low' | 'medium' | 'high' | 'critical' {
    if (outcome === 'failure') {
      if (eventType.includes('login')) return 'high';
      if (eventType.includes('permission')) return 'medium';
    }
    return 'low';
  }

  /**
   * الحصول على السجلات مع التصفية
   */
  getLogs(filter?: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    action?: string;
    severity?: string;
    limit?: number;
  }): AuditLog[] {
    let logs = [...this.logs];

    if (filter) {
      if (filter.startDate) {
        logs = logs.filter(log => new Date(log.timestamp) >= filter.startDate!);
      }
      if (filter.endDate) {
        logs = logs.filter(log => new Date(log.timestamp) <= filter.endDate!);
      }
      if (filter.userId) {
        logs = logs.filter(log => log.userId === filter.userId);
      }
      if (filter.action) {
        logs = logs.filter(log => log.action === filter.action);
      }
      if (filter.severity) {
        logs = logs.filter(log => log.severity === filter.severity);
      }
    }

    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (filter?.limit) {
      return logs.slice(0, filter.limit);
    }
    return logs;
  }

  /**
   * تصدير السجلات بتنسيق CSV
   */
  exportLogsToCSV(filter?: Parameters<this['getLogs']>[0]): string {
    const logs = this.getLogs(filter);

    const headers = [
      'timestamp', 'user_id', 'session_id', 'action', 'entity_type',
      'entity_id', 'description', 'ip_address', 'success', 'severity', 'error'
    ];

    const rows = logs.map(log => [
      log.timestamp,
      log.userId,
      log.sessionId,
      log.action,
      log.entityType,
      log.entityId,
      `"${log.description.replace(/"/g, '""')}"`,
      log.ipAddress,
      log.success,
      log.severity,
      `"${(log.error || '').replace(/"/g, '""')}"`
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * تنظيف السجلات القديمة
   */
  archiveLogs(dateBefore: Date): number {
    const originalLength = this.logs.length;
    this.logs = this.logs.filter(log => new Date(log.timestamp) > dateBefore);
    this.saveLogs();
    return originalLength - this.logs.length;
  }

  /**
   * الحصول على إحصائيات النظام
   */
  getSystemStats(): Partial<DatabaseStats> {
    const backupLogs = this.getLogs({ action: 'backup' });
    const lastBackup = backupLogs.length > 0 ? backupLogs[0].timestamp : undefined;

    return {
      last_backup: lastBackup,
      backups_count: backupLogs.length,
      // حساب متوسط وقت الوصول (يمكن تطويره لاحقاً)
      avg_access_time_ms: 0  // سيتم حسابه عند إضافة تتبع الأداء
    };
  }
}

// تصدير Instance واحد متكامل
export const auditLogger = AuditLoggerService.getInstance();
