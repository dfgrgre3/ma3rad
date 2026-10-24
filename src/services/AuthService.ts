import { DatabaseManager } from '../database/db';
import type { User, UserRole } from '../types';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PermissionService } from './PermissionService';

const SESSION_KEY = 'ceramisys_session_user_id';
const SESSION_ID_KEY = 'ceramisys_session_id';

export class AuthService {
  private db = DatabaseManager.getInstance();
  private static currentUser: User | null = null;

  private static currentSessionId: string | null = null;

  private static deviceLabel(): string {
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

  private static startSession(userId: string): void {
    try {
      const db = DatabaseManager.getInstance();
      AuthService.endSession('EXPIRED');
      const id = `ses_${uuidv4().substring(0, 10)}`;
      db.run(
        `INSERT INTO user_sessions (id, user_id, device_label, started_at, last_seen_at, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [id, userId, AuthService.deviceLabel(), new Date().toISOString(), new Date().toISOString()]
      );
      AuthService.currentSessionId = id;
      try { localStorage.setItem(SESSION_ID_KEY, id); } catch { /* ignore */ }
    } catch {
      // Session tracking must never block authentication.
    }
  }

  public static touchSession(): void {
    if (!AuthService.currentSessionId) return;
    try {
      DatabaseManager.getInstance().run(
        `UPDATE user_sessions SET last_seen_at = ? WHERE id = ? AND is_active = 1`,
        [new Date().toISOString(), AuthService.currentSessionId]
      );
    } catch {
      // ignore
    }
  }

  private static endSession(reason: 'LOGOUT' | 'EXPIRED' | 'REVOKED' | 'CRASH'): void {
    const id = AuthService.currentSessionId;
    AuthService.currentSessionId = null;
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
    return AuthService.currentSessionId;
  }

  /** Returns the logged-in user, or null if not authenticated. Never silently impersonates admin. */
  public static getCurrentUser(): User | null {
    return AuthService.currentUser;
  }

  /** Throws if no user is authenticated. Use at the top of every service method (brief §108). */
  public static requireAuth(): User {
    if (!AuthService.currentUser) {
      throw new Error('يجب تسجيل الدخول لتنفيذ هذا الإجراء.');
    }
    return AuthService.currentUser;
  }

  public static setCurrentUser(user: User): void {
    AuthService.currentUser = user;
    PermissionService.invalidate(user);
  }

  public static logout(): void {
    if (AuthService.currentUser) PermissionService.invalidate(AuthService.currentUser);
    AuthService.endSession('LOGOUT');
    AuthService.currentUser = null;
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // localStorage unavailable (e.g. node test harness) — session stays in memory only
    }
  }

  /** Clear any session left by a previous app run instead of restoring it. */
  public static clearPersistedSession(): void {
    if (AuthService.currentUser) PermissionService.invalidate(AuthService.currentUser);
    AuthService.currentUser = null;

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
    AuthService.currentSessionId = null;
  }

  private static recordLogin(userId: string | null, username: string, succeeded: boolean, reason?: string): void {
    try {
      DatabaseManager.getInstance().run(
        `INSERT INTO login_history (id, user_id, username_attempted, succeeded, failure_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`lh_${uuidv4().substring(0, 8)}`, userId, username, succeeded ? 1 : 0, reason || null, new Date().toISOString()]
      );
    } catch {
      // login must never fail because audit logging failed
    }
  }

  /** Restore a previously authenticated session (survives reloads). */
  public static restoreSession(): User | null {
    let userId: string | null = null;
    try {
      userId = localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
    if (!userId) return null;

    const rows = DatabaseManager.getInstance().query<any>(
      `SELECT id, username, full_name, role, phone, is_active, created_at, updated_at
       FROM users WHERE id = ? AND is_active = 1`,
      [userId]
    );
    if (rows.length === 0) {
      try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      return null;
    }
    const u = rows[0];
    const user: User = {
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      phone: u.phone,
      isActive: Boolean(u.isActive),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
    AuthService.currentUser = user;
    try {
      const sessionId = localStorage.getItem(SESSION_ID_KEY);
      const active = sessionId
        ? DatabaseManager.getInstance().query<any>(
            `SELECT id FROM user_sessions WHERE id = ? AND user_id = ? AND is_active = 1`,
            [sessionId, user.id]
          )
        : [];
      if (active.length > 0 && sessionId) {
        AuthService.currentSessionId = sessionId;
        AuthService.touchSession();
      } else {
        AuthService.startSession(user.id);
      }
    } catch {
      AuthService.startSession(user.id);
    }
    return user;
  }

  public static login(username: string, passwordAttempt: string): User {
    const db = DatabaseManager.getInstance();
    const rows = db.query<any>(`SELECT * FROM users WHERE username = ? AND is_active = 1`, [username]);
    if (rows.length === 0) {
      AuthService.recordLogin(null, username, false, 'USER_NOT_FOUND');
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }

    const userRecord = rows[0];
    try {
      const maxRow = db.query<{ value: string }>(
        `SELECT value FROM system_settings WHERE key = 'maxFailedLoginAttempts'`
      )[0];
      const maxAttempts = Number(maxRow?.value ?? 0);
      if (maxAttempts > 0) {
        const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
        const lastSuccess = db.query<{ createdAt: string }>(
          `SELECT created_at AS createdAt FROM login_history
           WHERE username_attempted = ? AND succeeded = 1
           ORDER BY created_at DESC LIMIT 1`,
          [username]
        )[0]?.createdAt;
        const since = lastSuccess && lastSuccess > cutoff ? lastSuccess : cutoff;
        const failures = db.query<{ c: number }>(
          `SELECT COUNT(*) AS c FROM login_history
           WHERE username_attempted = ? AND succeeded = 0 AND created_at > ?`,
          [username, since]
        )[0]?.c ?? 0;
        if (failures >= maxAttempts) {
          AuthService.recordLogin(userRecord.id, username, false, 'LOCKED_OUT');
          throw new Error('تم إيقاف المحاولات مؤقتاً بسبب كثرة الأخطاء. حاول مجدداً بعد 15 دقيقة.');
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('إيقاف المحاولات')) throw error;
      // Login must still work if the security settings table is unavailable.
    }

    const isValid = bcrypt.compareSync(passwordAttempt, userRecord.passwordHash);
    if (!isValid) {
      AuthService.recordLogin(userRecord.id, username, false, 'WRONG_PASSWORD');
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }

    const user: User = {
      id: userRecord.id,
      username: userRecord.username,
      fullName: userRecord.fullName,
      role: userRecord.role,
      phone: userRecord.phone,
      isActive: Boolean(userRecord.isActive),
      createdAt: userRecord.createdAt,
      updatedAt: userRecord.updatedAt
    };

    AuthService.setCurrentUser(user);
    AuthService.recordLogin(user.id, username, true);
    AuthService.startSession(user.id);
    try {
      localStorage.setItem(SESSION_KEY, user.id);
    } catch {
      // ignore
    }
    return user;
  }

  public getAllUsers(): User[] {
    PermissionService.require(AuthService.requireAuth(), 'users.view');
    const rows = this.db.query<any>(`SELECT id, username, full_name, role, phone, pin_code, is_active, created_at, updated_at FROM users ORDER BY full_name ASC`);
    return rows.map(r => ({
      id: r.id,
      username: r.username,
      fullName: r.fullName,
      role: r.role,
      phone: r.phone,
      pinCode: r.pinCode,
      isActive: Boolean(r.isActive),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
  }

  public createUser(
    user: { username: string; password: string; fullName: string; role: UserRole; phone?: string; pinCode?: string },
    performedBy = 'usr_admin',
    actor?: User | null
  ): User {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'users.create');
    const roleExists = this.db.query('SELECT code FROM roles WHERE code = ?', [user.role]);
    if (roleExists.length === 0) {
      throw new Error('الدور المحدد غير موجود.');
    }
    const existing = this.db.query(`SELECT id FROM users WHERE username = ?`, [user.username]);
    if (existing.length > 0) {
      throw new Error('اسم المستخدم مسجل مسبقاً.');
    }

    const id = `usr_${uuidv4().substring(0, 8)}`;
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(user.password, salt);

    this.db.run(`
      INSERT INTO users (id, username, password_hash, full_name, role, phone, pin_code, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `, [id, user.username, hash, user.fullName, user.role, user.phone || null, user.pinCode || null]);

    this.db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id)
      VALUES (?, ?, ?, 'إنشاء مستخدم جديد', 'USERS', ?)
    `, [`aud_${uuidv4().substring(0, 8)}`, subject.id || performedBy, subject.fullName, id]);

    return {
      id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  public checkPermission(user: User, requiredRole: UserRole[]): boolean {
    if (user.role === 'ADMIN') return true;
    return requiredRole.includes(user.role);
  }

  // ─── Admin user management ──────────────────────────────────────────────────

  public getUserById(id: string): User | null {
    const row = this.db.query<any>(
      `SELECT id, username, full_name, role, phone, pin_code, is_active, created_at, updated_at
       FROM users WHERE id = ?`,
      [id]
    )[0];
    return row ? this.mapUser(row) : null;
  }

  public updateUser(
    id: string,
    patch: Partial<Pick<User, 'fullName' | 'role' | 'phone' | 'pinCode' | 'isActive'>>,
    actor?: User | null
  ): User {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'users.update');
    const existing = this.getUserById(id);
    if (!existing) throw new Error('المستخدم غير موجود.');
    if (existing.id === subject.id && patch.isActive === false) {
      throw new Error('لا يمكنك تعطيل حسابك الحالي.');
    }
    if (existing.id === subject.id && patch.role && patch.role !== 'ADMIN' && existing.role === 'ADMIN') {
      throw new Error('لا يمكنك إزالة صلاحية مدير النظام عن حسابك الحالي.');
    }

    this.db.run(
      `UPDATE users SET full_name = ?, role = ?, phone = ?, pin_code = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [
        patch.fullName ?? existing.fullName,
        patch.role ?? existing.role,
        patch.phone ?? existing.phone ?? null,
        patch.pinCode ?? existing.pinCode ?? null,
        (patch.isActive ?? existing.isActive) ? 1 : 0,
        new Date().toISOString(),
        id,
      ]
    );
    this.audit(subject, 'تعديل بيانات مستخدم', 'USERS', id, existing, patch);
    PermissionService.invalidate(existing);
    return this.getUserById(id)!;
  }

  public resetPassword(id: string, newPassword: string, actor?: User | null): void {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'users.reset_password');
    if (newPassword.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
    const existing = this.getUserById(id);
    if (!existing) throw new Error('المستخدم غير موجود.');
    const hash = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10));
    this.db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
      hash,
      new Date().toISOString(),
      id,
    ]);
    this.audit(subject, 'إعادة تعيين كلمة مرور مستخدم', 'USERS', id, null, { username: existing.username });
  }

  public changeOwnPassword(userId: string, currentPassword: string, newPassword: string): void {
    const row = this.db.query<any>('SELECT password_hash FROM users WHERE id = ?', [userId])[0];
    if (!row) throw new Error('المستخدم غير موجود.');
    if (!bcrypt.compareSync(currentPassword, row.passwordHash)) {
      throw new Error('كلمة المرور الحالية غير صحيحة.');
    }
    if (newPassword.length < 6) throw new Error('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.');
    this.db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
      bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10)),
      new Date().toISOString(),
      userId,
    ]);
  }

  public deleteUser(id: string, actor?: User | null): void {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'users.delete');
    if (id === subject.id) throw new Error('لا يمكنك حذف حسابك الحالي.');
    const existing = this.getUserById(id);
    if (!existing) throw new Error('المستخدم غير موجود.');
    if (existing.username === 'admin') throw new Error('لا يمكن حذف حساب المدير الأساسي.');
    this.db.executeTransaction(() => {
      this.db.run('DELETE FROM user_permissions WHERE user_id = ?', [id]);
      this.db.run('DELETE FROM users WHERE id = ?', [id]);
    });
    this.audit(subject, 'حذف مستخدم', 'USERS', id, existing, null);
    PermissionService.invalidate(existing);
  }

  public getLoginHistory(userId?: string, limit = 100): any[] {
    const params: any[] = [];
    let where = '';
    if (userId) {
      where = 'WHERE user_id = ?';
      params.push(userId);
    }
    params.push(Math.min(Math.max(limit, 1), 500));
    return this.db.query(
      `SELECT id, user_id AS userId, username_attempted AS username, succeeded,
              failure_reason AS failureReason, created_at AS createdAt
       FROM login_history ${where} ORDER BY created_at DESC LIMIT ?`,
      params
    );
  }

  private requireActor(actor?: User | null): User {
    const subject = actor ?? AuthService.currentUser ?? AuthService.requireAuth();
    return subject;
  }

  private mapUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      fullName: row.fullName,
      role: row.role,
      phone: row.phone,
      pinCode: row.pinCode,
      isActive: Boolean(row.isActive),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private audit(actor: User, action: string, module: string, recordId: string, oldValues: unknown, newValues: unknown): void {
    try {
      this.db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 10)}`,
          actor.id,
          actor.fullName,
          action,
          module,
          recordId,
          oldValues == null ? null : JSON.stringify(oldValues),
          newValues == null ? null : JSON.stringify(newValues),
        ]
      );
    } catch {
      // audit must never break the operation
    }
  }
}
