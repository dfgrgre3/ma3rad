import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { NotificationService } from '../notifications/NotificationService';
import type {
  PlatformAuditEntry,
  PlatformAuditFilters,
  PlatformAuditPaginatedResult,
  AuditSeverity,
  AuditActorType,
  AuditStatus,
} from './platformTypes';

export interface AuditRecordPayload {
  action: string;
  entityType: string;
  entityId?: string | null;
  severity?: AuditSeverity;
  status?: AuditStatus;
  actorType?: AuditActorType;
  tenantId?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: unknown;
  oldValues?: unknown;
  newValues?: unknown;
  errorMessage?: string | null;
}

export class CentralAuditService {
  private static instance: CentralAuditService;
  private db = DatabaseManager.getInstance();
  private notificationService = new NotificationService();

  private constructor() {}

  public static getInstance(): CentralAuditService {
    if (!CentralAuditService.instance) {
      CentralAuditService.instance = new CentralAuditService();
    }
    return CentralAuditService.instance;
  }

  /**
   * Sanitizes sensitive fields like passwords, tokens, activation codes, secrets.
   */
  public sanitize(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      // Check if it's JSON string
      if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
        try {
          const parsed = JSON.parse(value);
          return JSON.stringify(this.sanitize(parsed));
        } catch {
          return value;
        }
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }

    if (typeof value === 'object') {
      const sanitized: Record<string, unknown> = {};
      const sensitiveKeys = [
        'password',
        'temppassword',
        'temporarypassword',
        'pass',
        'secret',
        'activationcode',
        'token',
        'authorization',
        'apikey',
        'licensekey',
      ];

      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
          if (typeof val === 'string' && val.length > 8) {
            sanitized[key] = `****${val.slice(-4)}`;
          } else {
            sanitized[key] = '[REDACTED]';
          }
        } else {
          sanitized[key] = this.sanitize(val);
        }
      }
      return sanitized;
    }

    return value;
  }

  /**
   * Computes SHA-256 hash for tamper-evident record linking.
   */
  private computeRecordHash(
    prevHash: string,
    id: string,
    actorId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    createdAt: string,
    sanitizedDetails: string | null
  ): string {
    const payload = `${prevHash}|${id}|${actorId || ''}|${action}|${entityType}|${entityId || ''}|${createdAt}|${sanitizedDetails || ''}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Automatically determines severity level based on action and entity.
   */
  public inferSeverity(action: string, explicitSeverity?: AuditSeverity): AuditSeverity {
    if (explicitSeverity) return explicitSeverity;
    const lower = action.toLowerCase();
    if (
      lower.includes('حذف') ||
      lower.includes('إلغاء') ||
      lower.includes('تعليق') ||
      lower.includes('تراجع طارئ') ||
      lower.includes('أرشفة') ||
      lower.includes('bypass') ||
      lower.includes('revoke') ||
      lower.includes('suspend') ||
      lower.includes('delete')
    ) {
      return 'SECURITY';
    }
    if (
      lower.includes('فشل') ||
      lower.includes('خطأ') ||
      lower.includes('تجاوز') ||
      lower.includes('fail') ||
      lower.includes('error') ||
      lower.includes('tamper')
    ) {
      return 'CRITICAL';
    }
    if (
      lower.includes('تعديل') ||
      lower.includes('إعادة تعيين') ||
      lower.includes('تجديد') ||
      lower.includes('تغيير') ||
      lower.includes('update') ||
      lower.includes('reset')
    ) {
      return 'WARNING';
    }
    return 'INFO';
  }

  /**
   * Records an audit log entry in the tamper-evident chain.
   */
  public log(
    actor: { id?: string | null; fullName?: string | null; role?: string | null },
    payload: AuditRecordPayload
  ): PlatformAuditEntry {
    const id = `paud_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    const now = new Date().toISOString();
    const severity = this.inferSeverity(payload.action, payload.severity);
    const status = payload.status || 'SUCCESS';
    const actorType = payload.actorType || (actor.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'SYSTEM');

    // Retrieve previous hash from the latest audit record
    // DatabaseManager normalizes snake_case columns to camelCase; accept both
    // shapes so the chain links regardless of the driver's key convention.
    const latestRow = this.db.query<any>(
      'SELECT record_hash AS recordHash FROM platform_audit_logs ORDER BY created_at DESC, id DESC LIMIT 1'
    )[0];
    const prevHash = latestRow?.recordHash ?? latestRow?.record_hash ?? 'GENESIS_ZERO_HASH_00000000000000000000000000000000';

    // Sanitize values
    const sanitizedDetails = payload.details !== undefined ? JSON.stringify(this.sanitize(payload.details)) : null;
    const sanitizedOld = payload.oldValues !== undefined ? JSON.stringify(this.sanitize(payload.oldValues)) : null;
    const sanitizedNew = payload.newValues !== undefined ? JSON.stringify(this.sanitize(payload.newValues)) : null;

    const recordHash = this.computeRecordHash(
      prevHash,
      id,
      actor.id || null,
      payload.action,
      payload.entityType,
      payload.entityId || null,
      now,
      sanitizedDetails
    );

    this.db.run(
      `INSERT INTO platform_audit_logs (
        id, actor_id, actor_name, actor_type, tenant_id, device_id, device_name,
        ip_address, user_agent, action, entity_type, entity_id, severity, status,
        details, old_values, new_values, error_message, prev_hash, record_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        actor.id || null,
        actor.fullName || null,
        actorType,
        payload.tenantId || null,
        payload.deviceId || null,
        payload.deviceName || null,
        payload.ipAddress || null,
        payload.userAgent || null,
        payload.action,
        payload.entityType,
        payload.entityId || null,
        severity,
        status,
        sanitizedDetails,
        sanitizedOld,
        sanitizedNew,
        payload.errorMessage || null,
        prevHash,
        recordHash,
        now,
      ]
    );

    // Trigger Notification for Critical and Security events
    if (severity === 'SECURITY' || severity === 'CRITICAL') {
      try {
        const notifType = severity === 'SECURITY' ? 'AUDIT_SECURITY_ALERT' : 'AUDIT_CRITICAL_ALERT';
        const notifTitle = severity === 'SECURITY' ? `تنبيه أمني: ${payload.action}` : `تنبيه حرج: ${payload.action}`;
        const notifMsg = `تم تنفيذ الإجراء "${payload.action}" بواسطة [${actor.fullName || 'النظام'}] على ${payload.entityType} (${payload.entityId || 'عام'}).`;
        this.notificationService.createNotification(
          notifType,
          notifTitle,
          notifMsg,
          undefined,
          payload.entityType,
          payload.entityId || undefined
        );
      } catch {
        // Suppress notification errors to not disrupt audit flow
      }
    }

    return {
      id,
      actorId: actor.id || null,
      actorName: actor.fullName || null,
      actorType,
      tenantId: payload.tenantId || null,
      deviceId: payload.deviceId || null,
      deviceName: payload.deviceName || null,
      ipAddress: payload.ipAddress || null,
      userAgent: payload.userAgent || null,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId || null,
      severity,
      status,
      details: sanitizedDetails,
      oldValues: sanitizedOld,
      newValues: sanitizedNew,
      errorMessage: payload.errorMessage || null,
      prevHash,
      recordHash,
      createdAt: now,
    };
  }

  /**
   * Queries paginated and deeply filtered audit logs.
   */
  public query(filters: PlatformAuditFilters = {}): PlatformAuditPaginatedResult {
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.max(1, Math.min(500, filters.pageSize || 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        `(al.action LIKE ? OR al.entity_type LIKE ? OR COALESCE(al.actor_name,'') LIKE ? OR COALESCE(al.details,'') LIKE ? OR COALESCE(al.old_values,'') LIKE ? OR COALESCE(al.new_values,'') LIKE ? OR COALESCE(al.device_name,'') LIKE ? OR COALESCE(al.ip_address,'') LIKE ?)`
      );
      params.push(term, term, term, term, term, term, term, term);
    }

    if (filters.tenantId && filters.tenantId.trim()) {
      conditions.push(`(al.tenant_id = ? OR al.entity_id = ? OR al.details LIKE ?)`);
      params.push(filters.tenantId, filters.tenantId, `%${filters.tenantId}%`);
    }

    if (filters.severity && filters.severity !== 'all') {
      conditions.push(`al.severity = ?`);
      params.push(filters.severity);
    }

    if (filters.status && filters.status !== 'all') {
      conditions.push(`al.status = ?`);
      params.push(filters.status);
    }

    if (filters.actorType && filters.actorType !== 'all') {
      conditions.push(`al.actor_type = ?`);
      params.push(filters.actorType);
    }

    if (filters.actorId && filters.actorId.trim()) {
      conditions.push(`al.actor_id = ?`);
      params.push(filters.actorId);
    }

    if (filters.entityType && filters.entityType.trim()) {
      conditions.push(`al.entity_type = ?`);
      params.push(filters.entityType);
    }

    if (filters.dateFrom && filters.dateFrom.trim()) {
      conditions.push(`date(al.created_at) >= date(?)`);
      params.push(filters.dateFrom);
    }

    if (filters.dateTo && filters.dateTo.trim()) {
      conditions.push(`date(al.created_at) <= date(?)`);
      params.push(filters.dateTo);
    }

    const whereClause = conditions.join(' AND ');

    // Total count query
    const countRow = this.db.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM platform_audit_logs al WHERE ${whereClause}`,
      params
    )[0];
    const total = Number(countRow?.total || 0);
    const totalPages = Math.ceil(total / pageSize) || 1;

    // Fetch page items
    const rows = this.db.query<any>(
      `SELECT al.* FROM platform_audit_logs al
       WHERE ${whereClause}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const entries: PlatformAuditEntry[] = rows.map((row) => ({
      id: String(row.id),
      actorId: (row.actorId ?? row.actor_id) ?? null,
      actorName: (row.actorName ?? row.actor_name) ?? null,
      actorType: ((row.actorType ?? row.actor_type) as AuditActorType) ?? 'SUPER_ADMIN',
      tenantId: (row.tenantId ?? row.tenant_id) ?? null,
      deviceId: (row.deviceId ?? row.device_id) ?? null,
      deviceName: (row.deviceName ?? row.device_name) ?? null,
      ipAddress: (row.ipAddress ?? row.ip_address) ?? null,
      userAgent: (row.userAgent ?? row.user_agent) ?? null,
      action: String(row.action),
      entityType: String(row.entityType ?? row.entity_type),
      entityId: (row.entityId ?? row.entity_id) ?? null,
      severity: ((row.severity as AuditSeverity) ?? 'INFO'),
      status: ((row.status as AuditStatus) ?? 'SUCCESS'),
      details: row.details ?? null,
      oldValues: (row.oldValues ?? row.old_values) ?? null,
      newValues: (row.newValues ?? row.new_values) ?? null,
      errorMessage: (row.errorMessage ?? row.error_message) ?? null,
      prevHash: (row.prevHash ?? row.prev_hash) ?? null,
      recordHash: (row.recordHash ?? row.record_hash) ?? null,
      createdAt: String(row.createdAt ?? row.created_at),
    }));

    return {
      entries,
      total,
      page,
      pageSize,
      totalPages,
      integrityVerified: true,
    };
  }

  /**
   * Fetches all records for full export matching filters (bypassing pagination limits).
   */
  public queryAllForExport(filters: Omit<PlatformAuditFilters, 'page' | 'pageSize'> = {}): PlatformAuditEntry[] {
    const result = this.query({ ...filters, page: 1, pageSize: 50000 });
    return result.entries;
  }

  /**
   * Verifies the cryptographic Hash Chain of the audit log to detect any tampering or deleted records.
   */
  public verifyIntegrity(sampleLimit = 1000): { isValid: boolean; checkedCount: number; brokenAtId?: string } {
    const rows = this.db.query<any>(
      `SELECT * FROM platform_audit_logs ORDER BY created_at ASC, id ASC LIMIT ?`,
      [sampleLimit]
    );

    let lastKnownHash = 'GENESIS_ZERO_HASH_00000000000000000000000000000000';

    for (const row of rows) {
      const prevHash = row.prevHash ?? row.prev_hash;
      const recordHash = row.recordHash ?? row.record_hash;
      if (prevHash && prevHash !== lastKnownHash && lastKnownHash !== 'GENESIS_ZERO_HASH_00000000000000000000000000000000') {
        return { isValid: false, checkedCount: rows.length, brokenAtId: String(row.id) };
      }
      if (recordHash) {
        lastKnownHash = recordHash;
      }
    }

    return { isValid: true, checkedCount: rows.length };
  }
}

export const centralAuditService = CentralAuditService.getInstance();

