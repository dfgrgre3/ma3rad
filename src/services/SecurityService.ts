import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { SettingsService } from './SettingsService';

export interface ActiveSession {
  id: string;
  userId: string;
  userName: string;
  username: string;
  role: string;
  deviceLabel?: string | null;
  startedAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

export interface LoginRecord {
  id: string;
  userId?: string | null;
  userName?: string | null;
  username: string;
  succeeded: boolean;
  failureReason?: string | null;
  deviceLabel?: string | null;
  createdAt: string;
}

export interface SecurityOverview {
  usersCount: number;
  activeUsers: number;
  activeSessions: number;
  failed24h: number;
  success24h: number;
  lockedAccounts: number;
  maxFailedAttempts: number;
  sessionTimeoutMinutes: number;
  lastBackupAt?: string | null;
}

export class SecurityService {
  private db = DatabaseManager.getInstance();

  private requireView(): void {
    PermissionService.require(AuthService.requireAuth(), 'users.view');
  }

  public getOverview(): SecurityOverview {
    this.requireView();
    const settings = SettingsService.getSettings();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();

    const scalar = (sql: string, params: any[] = []): number => {
      const row = this.db.query<any>(sql, params)[0];
      return row ? Number(Object.values(row)[0]) || 0 : 0;
    };

    const failed24h = scalar(`SELECT COUNT(*) FROM login_history WHERE succeeded = 0 AND created_at >= ?`, [since]);
    const success24h = scalar(`SELECT COUNT(*) FROM login_history WHERE succeeded = 1 AND created_at >= ?`, [since]);
    const usersCount = scalar(`SELECT COUNT(*) FROM users WHERE is_active = 1`);
    const maxFailedAttempts = settings.maxFailedLoginAttempts ?? 5;

    let lockedAccounts = 0;
    if (maxFailedAttempts > 0) {
      const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
      lockedAccounts = scalar(
        `SELECT COUNT(*) FROM (
           SELECT username_attempted FROM login_history
           WHERE succeeded = 0 AND created_at >= ?
           GROUP BY username_attempted HAVING COUNT(*) >= ?
         )`,
        [cutoff, maxFailedAttempts]
      );
    }

    return {
      usersCount,
      activeUsers: scalar(`SELECT COUNT(DISTINCT user_id) FROM user_sessions WHERE is_active = 1`),
      activeSessions: scalar(`SELECT COUNT(*) FROM user_sessions WHERE is_active = 1`),
      failed24h,
      success24h,
      lockedAccounts,
      maxFailedAttempts,
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes ?? 480,
      lastBackupAt: this.db.query<any>(
        `SELECT created_at AS createdAt FROM backup_history ORDER BY created_at DESC LIMIT 1`
      )[0]?.createdAt || null,
    };
  }

  public getActiveSessions(): ActiveSession[] {
    this.requireView();
    this.endStaleSessions();
    return this.db.query<any>(`
      SELECT s.id, s.user_id AS userId, u.full_name AS userName, u.username, u.role,
             s.device_label AS deviceLabel, s.started_at AS startedAt, s.last_seen_at AS lastSeenAt
      FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.is_active = 1 AND s.ended_at IS NULL
      ORDER BY s.last_seen_at DESC
    `).map((row) => ({ ...row, isCurrent: row.id === AuthService.getSessionId() }));
  }

  public getLoginHistory(filters: { search?: string; onlyFailed?: boolean; limit?: number } = {}): LoginRecord[] {
    this.requireView();
    let sql = `
      SELECT l.id, l.user_id AS userId, u.full_name AS userName, l.username_attempted AS username,
             l.succeeded, l.failure_reason AS failureReason, l.device_label AS deviceLabel,
             l.created_at AS createdAt
      FROM login_history l LEFT JOIN users u ON u.id = l.user_id
      WHERE 1 = 1`;
    const params: any[] = [];
    if (filters.search?.trim()) {
      sql += ` AND (l.username_attempted LIKE ? OR u.full_name LIKE ?)`;
      const term = `%${filters.search.trim()}%`;
      params.push(term, term);
    }
    if (filters.onlyFailed) sql += ` AND l.succeeded = 0`;
    const limit = Math.min(Math.max(filters.limit || 100, 1), 500);
    sql += ` ORDER BY l.created_at DESC LIMIT ?`;
    params.push(limit);

    return this.db.query<any>(sql, params).map((row) => ({ ...row, succeeded: Boolean(row.succeeded) }));
  }

  public revokeSession(id: string): void {
    PermissionService.require(AuthService.requireAuth(), 'users.update');
    this.db.run(
      `UPDATE user_sessions SET is_active = 0, ended_at = ?, end_reason = 'REVOKED' WHERE id = ? AND is_active = 1`,
      [new Date().toISOString(), id]
    );
    this.audit('إنهاء جلسة مستخدم', id, { reason: 'REVOKED' });
  }

  public revokeUserSessions(userId: string): number {
    PermissionService.require(AuthService.requireAuth(), 'users.update');
    const sessions = this.db.query<any>(
      `SELECT id FROM user_sessions WHERE user_id = ? AND is_active = 1`,
      [userId]
    );
    this.db.run(
      `UPDATE user_sessions SET is_active = 0, ended_at = ?, end_reason = 'REVOKED' WHERE user_id = ? AND is_active = 1`,
      [new Date().toISOString(), userId]
    );
    this.audit('إنهاء جميع جلسات مستخدم', userId, { count: sessions.length });
    return sessions.length;
  }

  public endStaleSessions(): number {
    const timeout = (SettingsService.getSettings().sessionTimeoutMinutes ?? 480) * 60_000;
    if (timeout <= 0) return 0;
    const cutoff = new Date(Date.now() - timeout).toISOString();
    const stale = this.db.query<any>(
      `SELECT id FROM user_sessions WHERE is_active = 1 AND last_seen_at < ?`,
      [cutoff]
    );
    if (stale.length === 0) return 0;
    this.db.run(
      `UPDATE user_sessions SET is_active = 0, ended_at = ?, end_reason = 'EXPIRED'
       WHERE is_active = 1 AND last_seen_at < ?`,
      [new Date().toISOString(), cutoff]
    );
    return stale.length;
  }

  private audit(action: string, recordId: string, values: unknown): void {
    try {
      const actor = AuthService.requireAuth();
      this.db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, ?, 'SECURITY', ?, ?)`,
        [`aud_sec_${Date.now()}`, actor.id, actor.fullName, action, recordId, JSON.stringify(values)]
      );
    } catch {
      // ignore
    }
  }
}
