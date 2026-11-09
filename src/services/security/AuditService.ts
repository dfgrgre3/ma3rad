import { DatabaseManager } from '../../database/repositories/databaseManager';
import { localDateString } from '../../utils/shared/date';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { writeAuditLog } from './auditWriter';

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  recordId?: string;
  oldValues?: string;
  newValues?: string;
  ipAddress?: string;
  createdAt: string;
}

export interface AuditFilters {
  dateFrom?: string;
  dateTo?: string;
  module?: string;
  userId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditStats {
  totalLogs: number;
  byModule: { module: string; count: number }[];
  byUser: { userId: string; userName: string; count: number }[];
  todayActions: number;
}

export type AuditTimelineSource = 'business' | 'login';

export interface AuditTimelineEntry extends Omit<AuditLogEntry, 'userId'> {
  userId: string | null;
  source: AuditTimelineSource;
  succeeded: boolean | null;
  failureReason?: string | null;
  deviceLabel?: string | null;
}

export interface AuditTimelineFilters extends AuditFilters {
  source?: AuditTimelineSource;
}

export interface AuditTimelineStats {
  totalEvents: number;
  todayEvents: number;
  businessEvents: number;
  successfulLogins: number;
  failedLogins: number;
}

export class AuditService {
  private db = DatabaseManager.getInstance();

  private getTimelineQuery(): string {
    return `SELECT
        al.id AS id,
        al.user_id AS userId,
        al.user_name AS userName,
        al.action AS action,
        al.module AS module,
        al.record_id AS recordId,
        al.old_values AS oldValues,
        al.new_values AS newValues,
        al.ip_address AS ipAddress,
        al.created_at AS createdAt,
        'business' AS source,
        1 AS succeeded,
        NULL AS failureReason,
        NULL AS deviceLabel
      FROM audit_logs al
      UNION ALL
      SELECT
        lh.id AS id,
        lh.user_id AS userId,
        lh.username_attempted AS userName,
        CASE WHEN lh.succeeded = 1 THEN 'تسجيل دخول ناجح' ELSE 'محاولة تسجيل دخول غير ناجحة' END AS action,
        'LOGIN' AS module,
        NULL AS recordId,
        NULL AS oldValues,
        NULL AS newValues,
        NULL AS ipAddress,
        lh.created_at AS createdAt,
        'login' AS source,
        lh.succeeded AS succeeded,
        lh.failure_reason AS failureReason,
        lh.device_label AS deviceLabel
      FROM login_history lh`;
  }

  private getTimelineWhere(filters: AuditTimelineFilters): { clause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.dateFrom) {
      conditions.push('substr(timeline.createdAt, 1, 10) >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push('substr(timeline.createdAt, 1, 10) <= ?');
      params.push(filters.dateTo);
    }
    if (filters.module) {
      conditions.push('timeline.module = ?');
      params.push(filters.module);
    }
    if (filters.source) {
      conditions.push('timeline.source = ?');
      params.push(filters.source);
    }
    if (filters.userId) {
      conditions.push('timeline.userId = ?');
      params.push(filters.userId);
    }
    if (filters.search) {
      conditions.push(`(
        timeline.action LIKE ?
        OR timeline.userName LIKE ?
        OR timeline.module LIKE ?
        OR timeline.id LIKE ?
        OR timeline.recordId LIKE ?
        OR timeline.failureReason LIKE ?
        OR timeline.deviceLabel LIKE ?
      )`);
      const term = `%${filters.search}%`;
      params.push(term, term, term, term, term, term, term);
    }

    return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
  }

  public getAuditTimeline(filters: AuditTimelineFilters = {}): { logs: AuditTimelineEntry[]; total: number } {
    PermissionService.require(AuthService.requireAuth(), 'ui.audit.log.view');
    const { clause, params } = this.getTimelineWhere(filters);
    const union = this.getTimelineQuery();
    const total = this.db.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM (${union}) AS timeline ${clause}`,
      params
    )[0]?.total || 0;
    const page = Math.max(1, Math.floor(filters.page || 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(filters.pageSize || 50)));
    const rows = this.db.query<AuditTimelineEntry>(
      `SELECT * FROM (${union}) AS timeline
       ${clause}
       ORDER BY timeline.createdAt DESC, timeline.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    return {
      logs: rows.map((row) => ({
        ...row,
        succeeded: row.source === 'business' ? null : Boolean(row.succeeded),
      })),
      total,
    };
  }

  public getAuditTimelineStats(): AuditTimelineStats {
    PermissionService.require(AuthService.requireAuth(), 'ui.audit.log.view');
    const today = localDateString();
    const businessEvents = this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM audit_logs'
    )[0]?.count || 0;
    const todayEvents = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM (
        SELECT created_at AS createdAt FROM audit_logs
        UNION ALL
        SELECT created_at AS createdAt FROM login_history
      ) AS timeline
      WHERE substr(createdAt, 1, 10) = ?`,
      [today]
    )[0]?.count || 0;
    const loginCounts = this.db.query<{ succeeded: number; count: number }>(
      'SELECT succeeded, COUNT(*) AS count FROM login_history GROUP BY succeeded'
    );
    const successfulLogins = loginCounts.find((row) => Number(row.succeeded) === 1)?.count || 0;
    const failedLogins = loginCounts.find((row) => Number(row.succeeded) === 0)?.count || 0;

    return {
      totalEvents: businessEvents + successfulLogins + failedLogins,
      todayEvents,
      businessEvents,
      successfulLogins,
      failedLogins,
    };
  }

  public getAuditTimelineModules(): string[] {
    PermissionService.require(AuthService.requireAuth(), 'ui.audit.log.view');
    const rows = this.db.query<{ module: string }>(
      `SELECT module FROM audit_logs
       UNION
       SELECT 'LOGIN' AS module
       ORDER BY module`
    );
    return rows.map((row) => row.module);
  }

  /** Append-only audit entry. Never throws — logging must not break a business action. */
  public log(entry: {
    userId?: string;
    userName?: string;
    action: string;
    module: string;
    recordId?: string;
    oldValues?: string;
    newValues?: string;
    ipAddress?: string;
  }): void {
    writeAuditLog(entry);
  }

  public getAuditLogs(filters: AuditFilters = {}): { logs: AuditLogEntry[]; total: number } {
    PermissionService.require(AuthService.requireAuth(), 'ui.audit.log.view');
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (filters.dateFrom) {
      whereClause += ' AND al.created_at >= ?';
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      whereClause += ' AND al.created_at <= ?';
      params.push(filters.dateTo + ' 23:59:59');
    }
    if (filters.module) {
      whereClause += ' AND al.module = ?';
      params.push(filters.module);
    }
    if (filters.userId) {
      whereClause += ' AND al.user_id = ?';
      params.push(filters.userId);
    }
    if (filters.search) {
      whereClause += ' AND (al.action LIKE ? OR al.user_name LIKE ? OR al.module LIKE ?)';
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }

    const countResult = this.db.query<any>(
      `SELECT COUNT(*) as total FROM audit_logs al ${whereClause}`,
      params
    );
    const total = countResult[0]?.total || 0;

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const logs = this.db.query<AuditLogEntry>(
      `SELECT al.* FROM audit_logs al ${whereClause} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return { logs, total };
  }

  public getAuditLogById(id: string): AuditLogEntry | null {
    PermissionService.require(AuthService.requireAuth(), 'ui.audit.log.view');
    const rows = this.db.query<AuditLogEntry>('SELECT * FROM audit_logs WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public getAuditStats(): AuditStats {
    PermissionService.require(AuthService.requireAuth(), 'ui.audit.log.view');
    const totalResult = this.db.query<any>('SELECT COUNT(*) as total FROM audit_logs')[0];
    const totalLogs = totalResult?.total || 0;

    const today = localDateString();
    const todayResult = this.db.query<any>(
      'SELECT COUNT(*) as cnt FROM audit_logs WHERE created_at LIKE ?',
      [`${today}%`]
    );
    const todayActions = todayResult[0]?.cnt || 0;

    const byModule = this.db.query<{ module: string; count: number }>(
      `SELECT module, COUNT(*) as count FROM audit_logs GROUP BY module ORDER BY count DESC`
    );

    const byUser = this.db.query<{ userId: string; userName: string; count: number }>(
      `SELECT user_id as userId, user_name as userName, COUNT(*) as count 
       FROM audit_logs GROUP BY user_id, user_name ORDER BY count DESC LIMIT 10`
    );

    return { totalLogs, byModule, byUser, todayActions };
  }

  public getModulesList(): string[] {
    PermissionService.require(AuthService.requireAuth(), 'ui.audit.log.view');
    const rows = this.db.query<{ module: string }>('SELECT DISTINCT module FROM audit_logs ORDER BY module');
    return rows.map(r => r.module);
  }
}
