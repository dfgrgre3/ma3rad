import { DatabaseManager } from '../database/db';

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

export class AuditService {
  private db = DatabaseManager.getInstance();

  public getAuditLogs(filters: AuditFilters = {}): { logs: AuditLogEntry[]; total: number } {
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
    const rows = this.db.query<AuditLogEntry>('SELECT * FROM audit_logs WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public getAuditStats(): AuditStats {
    const totalResult = this.db.query<any>('SELECT COUNT(*) as total FROM audit_logs')[0];
    const totalLogs = totalResult?.total || 0;

    const today = new Date().toISOString().slice(0, 10);
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
    const rows = this.db.query<{ module: string }>('SELECT DISTINCT module FROM audit_logs ORDER BY module');
    return rows.map(r => r.module);
  }
}
