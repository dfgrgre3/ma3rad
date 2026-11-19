import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { User } from '../../../../types';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PermissionService } from '../PermissionService';
import { authSession } from '../session';
import { PlatformStaffAuthService } from '../../platform/PlatformStaffAuthService';
import { twoFactorAuth } from '../twoFactorAuth';
import { getConfiguredPasswordPolicy } from '../passwordPolicy';
import { SESSION_KEY, SESSION_ID_KEY } from './shared';
import { AuthServiceCore } from './core';

/**
 * Session & account-lifecycle group for AuthService: device session tracking
 * (user_sessions rows), login history recording, session restore/logout,
 * account switching, password policy and the setup-completion gate.
 */
export class AuthServiceSession extends AuthServiceCore {
  protected static currentSessionId: string | null = null;

  protected static deviceLabel(): string {
    try {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      if (!ua) return 'سطح المكتب';
      if (/Edg\//.test(ua)) return 'Microsoft Edge';
      if (/Chrome\//.test(ua)) return 'Chrome';
      if (/Firefox\//.test(ua)) return 'Firefox';
      if (/Electron\//.test(ua)) return 'CeramiSys Desktop';
      return ua.slice(0, 80);
    } catch {
      return 'غير معروف';
    }
  }

  protected static startSession(userId: string): void {
    try {
      const db = DatabaseManager.getInstance();
      AuthServiceSession.endSession('EXPIRED');
      const id = `ses_${uuidv4().substring(0, 10)}`;
      db.run(
        `INSERT INTO user_sessions (id, user_id, device_label, started_at, last_seen_at, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [id, userId, AuthServiceSession.deviceLabel(), new Date().toISOString(), new Date().toISOString()]
      );
      AuthServiceSession.currentSessionId = id;
      try { localStorage.setItem(SESSION_ID_KEY, id); } catch { /* ignore */ }
    } catch {
      // Session tracking must never block authentication.
    }
  }

  public static touchSession(): void {
    if (!AuthServiceSession.currentSessionId) {
      try { PlatformStaffAuthService.touchCurrentSession(); } catch { /* ignore */ }
      return;
    }
    try {
      DatabaseManager.getInstance().run(
        `UPDATE user_sessions SET last_seen_at = ? WHERE id = ? AND is_active = 1`,
        [new Date().toISOString(), AuthServiceSession.currentSessionId]
      );
    } catch {
      // ignore
    }
    try { PlatformStaffAuthService.touchCurrentSession(); } catch { /* ignore */ }
  }

  protected static endSession(reason: 'LOGOUT' | 'EXPIRED' | 'REVOKED' | 'CRASH'): void {
    const id = AuthServiceSession.currentSessionId;
    AuthServiceSession.currentSessionId = null;
    try { localStorage.removeItem(SESSION_ID_KEY); } catch { /* ignore */ }
    if (!id) return;
    try {
      DatabaseManager.getInstance().run(
        `UPDATE user_sessions SET is_active = 0, ended_at = ?, end_reason = ? WHERE id = ?`,
        [new Date().toISOString(), reason, id]
      );
    } catch {
      // ignore
    }
  }

  public static getSessionId(): string | null {
    return AuthServiceSession.currentSessionId;
  }

  public static logout(): void {
    const currentUser = authSession.getCurrentUser();
    if (currentUser) PermissionService.invalidate(currentUser);
    try { PlatformStaffAuthService.endCurrentSession(); } catch { /* ignore */ }
    AuthServiceSession.endSession('LOGOUT');
    authSession.setCurrentUser(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // localStorage unavailable (e.g. node test harness) - session stays in memory only
    }
  }

  public static clearPersistedSession(): void {
    const currentUser = authSession.getCurrentUser();
    if (currentUser) PermissionService.invalidate(currentUser);
    authSession.setCurrentUser(null);

    let sessionId: string | null = null;
    try {
      sessionId = localStorage.getItem(SESSION_ID_KEY);
      localStorage.removeItem(SESSION_ID_KEY);
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // Browser storage may be unavailable in the test harness.
    }

    if (sessionId) {
      try {
        DatabaseManager.getInstance().run(
          `UPDATE user_sessions SET is_active = 0, ended_at = ?, end_reason = 'LOGOUT'
           WHERE id = ? AND is_active = 1`,
          [new Date().toISOString(), sessionId]
        );
      } catch {
        // Startup must continue even if an earlier session cannot be closed.
      }
    }
    AuthServiceSession.currentSessionId = null;
  }

  protected static recordLogin(userId: string | null, username: string, succeeded: boolean, reason?: string): void {
    try {
      DatabaseManager.getInstance().run(
        `INSERT INTO login_history (id, user_id, username_attempted, succeeded, failure_reason, device_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `lh_${uuidv4().substring(0, 8)}`,
          userId,
          username,
          succeeded ? 1 : 0,
          reason || null,
          AuthServiceSession.deviceLabel(),
          new Date().toISOString(),
        ]
      );
    } catch {
      // login must never fail because audit logging failed
    }
  }

  public static getLoginPinLength(): number {
    try {
      const value = Number(DatabaseManager.getInstance().query<{ value: string }>(
        `SELECT value FROM system_settings WHERE key = 'loginPinLength'`
      )[0]?.value ?? 4);
      return Number.isInteger(value) && value >= 4 && value <= 8 ? value : 4;
    } catch {
      return 4;
    }
  }

  public static getSwitchableUsers(): User[] {
    const currentUser = AuthServiceSession.requireAuth();
    const row = DatabaseManager.getInstance().query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'switchableUserIds'`
    )[0];
    let allowedIds: string[] = [];
    try {
      const parsed: unknown = JSON.parse(row?.value || '[]');
      if (Array.isArray(parsed)) {
        allowedIds = [...new Set(parsed.filter((id): id is string => typeof id === 'string'))];
      }
    } catch {
      throw new Error('إعداد الحسابات المسموح بالتبديل إليها غير صالح.');
    }
    if (allowedIds.length === 0) return [];
    const placeholders = allowedIds.map(() => '?').join(', ');
    return DatabaseManager.getInstance().query<any>(
      `SELECT id, username, full_name AS fullName, role, phone, is_active AS isActive,
              created_at AS createdAt, updated_at AS updatedAt
       FROM users
       WHERE is_active = 1 AND id IN (${placeholders}) AND id <> ?
       ORDER BY full_name COLLATE NOCASE`,
      [...allowedIds, currentUser.id]
    ).map((row) => ({
      ...row,
      isActive: Boolean(row.isActive),
    }));
  }

  public static switchToUser(userId: string): User {
    const actor = AuthServiceSession.requireAuth();
    const allowed = AuthServiceSession.getSwitchableUsers().some((user) => user.id === userId);
    if (!allowed) throw new Error('هذا الحساب غير مسموح بالتبديل إليه.');

    const row = DatabaseManager.getInstance().query<any>(
      `SELECT id, username, password_hash AS passwordHash, full_name AS fullName,
              role, phone, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt,
              security_key_hash AS securityKeyHash
       FROM users WHERE id = ? AND is_active = 1`,
      [userId]
    )[0];
    if (!row) throw new Error('الحساب المحدد غير موجود أو غير نشط.');
    if (twoFactorAuth.isEnabled(row.id)) {
      throw new Error('لا يمكن التبديل إلى حساب يتطلب التحقق الثنائي. سجّل الدخول ببياناته.');
    }

    const target: User = {
      id: row.id,
      username: row.username,
      fullName: row.fullName,
      role: row.role,
      phone: row.phone,
      isActive: Boolean(row.isActive),
      mustChangePassword: row.username === 'admin' && bcrypt.compareSync('admin123', row.passwordHash),
      securityKeySetupRequired: row.id === 'usr_admin' && !row.securityKeyHash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    PermissionService.invalidate(actor);
    AuthServiceSession.endSession('LOGOUT');
    AuthServiceSession.setCurrentUser(target);
    AuthServiceSession.startSession(target.id);
    AuthServiceSession.recordLogin(actor.id, `SWITCH_TO:${target.username}`, true, 'ACCOUNT_SWITCH');
    try { localStorage.setItem(SESSION_KEY, target.id); } catch { /* ignore */ }
    return target;
  }

  /** Restore a previously authenticated session (survives reloads). */
  public static restoreSession(): User | null {
    let userId: string | null = null;
    try {
      userId = localStorage.getItem(SESSION_KEY);
    } catch {
      userId = null;
    }

    if (userId) {
      const rows = DatabaseManager.getInstance().query<any>(
        `SELECT id, username, password_hash, full_name, role, phone, is_active, created_at, updated_at,
                security_key_hash
         FROM users WHERE id = ? AND is_active = 1`,
        [userId]
      );
      if (rows.length === 0) {
        try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      } else {
        const u = rows[0];
        const isDefaultAdmin = u.username === 'admin' && bcrypt.compareSync('admin123', u.passwordHash);
        const user: User = {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          role: u.role,
          phone: u.phone,
          isActive: Boolean(u.isActive),
          mustChangePassword: isDefaultAdmin,
          securityKeySetupRequired: u.id === 'usr_admin' && !u.securityKeyHash,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        };
        authSession.setCurrentUser(user);
        try {
          const sessionId = localStorage.getItem(SESSION_ID_KEY);
          const active = sessionId
            ? DatabaseManager.getInstance().query<any>(
                `SELECT id FROM user_sessions WHERE id = ? AND user_id = ? AND is_active = 1`,
                [sessionId, user.id]
              )
            : [];
          if (active.length > 0 && sessionId) {
            AuthServiceSession.currentSessionId = sessionId;
          } else {
            AuthServiceSession.startSession(user.id);
          }
        } catch {
          AuthServiceSession.startSession(user.id);
        }
        return user;
      }
    }

    try {
      const staffSessionId = localStorage.getItem(PlatformStaffAuthService.SESSION_KEY);
      if (!staffSessionId) return null;
      const row = DatabaseManager.getInstance().query<any>(
        `SELECT s.id AS sessionId, s.staff_id AS staffId, s.is_current AS isCurrent, s.expires_at AS expiresAt,
                st.full_name AS fullName, st.email AS email, st.phone AS phone, st.role AS role,
                st.is_active AS isActive, st.must_change_password AS mustChangePassword,
                st.created_at AS createdAt, st.updated_at AS updatedAt
         FROM platform_staff_sessions s
         JOIN platform_staff st ON st.id = s.staff_id
         WHERE s.id = ?
           AND (st.deleted_at IS NULL OR st.deleted_at = '')
         LIMIT 1`,
        [staffSessionId]
      )[0];
      if (!row || !row.isActive || !row.isCurrent) {
        try { localStorage.removeItem(PlatformStaffAuthService.SESSION_KEY); } catch { /* ignore */ }
        return null;
      }
      if (row.expiresAt && new Date(String(row.expiresAt)).getTime() < Date.now()) {
        try { localStorage.removeItem(PlatformStaffAuthService.SESSION_KEY); } catch { /* ignore */ }
        return null;
      }
      const user: User = {
        id: String(row.staffId),
        username: String(row.email || ''),
        fullName: String(row.fullName || row.email || ''),
        role: String(row.role || 'SUPPORT_AGENT') as User['role'],
        phone: row.phone ?? undefined,
        isActive: true,
        mustChangePassword: Boolean(row.mustChangePassword),
        createdAt: String(row.createdAt || new Date().toISOString()),
        updatedAt: String(row.updatedAt || new Date().toISOString()),
      };
      authSession.setCurrentUser(user);
      try {
        DatabaseManager.getInstance().run(
          `UPDATE platform_staff_sessions SET last_activity_at = ? WHERE id = ? AND is_current = 1`,
          [new Date().toISOString(), String(row.sessionId)]
        );
      } catch { /* ignore */ }
      return user;
    } catch {
      return null;
    }
  }

  public static validatePasswordPolicy(password: string, username?: string): void {
    const policy = getConfiguredPasswordPolicy();
    if (!password || password.length < policy.minLength) {
      throw new Error(`كلمة المرور يجب أن تكون ${policy.minLength} أحرف على الأقل.`);
    }
    if (password === 'admin123') {
      throw new Error('لا يمكن استخدام كلمة المرور الافتراضية.');
    }
    if (username && password.toLowerCase() === username.toLowerCase()) {
      throw new Error('لا يمكن أن تطابق كلمة المرور اسم المستخدم.');
    }
    if (!/[a-zA-Z\u0600-\u06FF]/.test(password)) {
      throw new Error('يجب أن تحتوي كلمة المرور على حرف واحد على الأقل.');
    }
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      throw new Error('يجب أن تحتوي كلمة المرور على حرف إنجليزي كبير واحد على الأقل.');
    }
    if (policy.requireNumbers && !/[0-9]/.test(password)) {
      throw new Error('يجب أن تحتوي كلمة المرور على رقم واحد على الأقل.');
    }
    if (policy.requireSpecialChars && !/[^a-zA-Z0-9\u0600-\u06FF\s]/.test(password)) {
      throw new Error('يجب أن تحتوي كلمة المرور على رمز خاص واحد على الأقل.');
    }
  }

  /**
   * ERP first-run setup gate. A fresh installation must complete the setup
   * wizard (which writes `setup_completed = '1'` to system_settings) before ERP
   * user accounts can be created. Platform owner bootstrap goes through a raw,
   * purpose-built path (PlatformBootstrapService) and is intentionally exempt.
   */
  protected static assertSetupCompleted(db: DatabaseManager): void {
    const value = db.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'setup_completed'`,
    )[0]?.value;
    if (value !== '1') {
      throw new Error('يجب إكمال إعداد النظام أولًا قبل إنشاء المستخدمين في ERP.');
    }
  }
}
