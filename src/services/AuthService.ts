import { DatabaseManager } from '../database/db';
import type { User, UserRole } from '../types';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';

// Use sessionStorage instead of localStorage for session data (cleared on tab close)
const SESSION_KEY = 'ceramisys_session_user_id';
const SESSION_ID_KEY = 'ceramisys_session_id';

/** Window during which failed attempts are counted before the account is temporarily locked. */
export const LOGIN_LOCKOUT_WINDOW_MINUTES = 15;

export interface LoginGuardStatus {
  /** Configured maximum failed attempts. 0 means lockout is disabled. */
  maxAttempts: number;
  /** Failed attempts counted inside the current window. */
  failedAttempts: number;
  /** Attempts left before lockout, or null when lockout is disabled. */
  remainingAttempts: number | null;
  isLocked: boolean;
  /** ISO timestamp when the lockout expires, or null when not locked. */
  lockedUntil: string | null;
  windowMinutes: number;
}

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
        `INSERT INTO login_history (id, user_id, username_attempted, succeeded, failure_reason, device_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `lh_${uuidv4().substring(0, 8)}`,
          userId,
          username,
          succeeded ? 1 : 0,
          reason || null,
          AuthService.deviceLabel(),
          new Date().toISOString(),
        ]
      );
    } catch {
      // login must never fail because audit logging failed
    }
  }

  /**
   * Read-only lockout state for a username. Safe to call from the login screen:
   * never throws, never requires authentication, and returns a disabled state
   * when the security settings are unavailable.
   */
  public static getLoginGuardStatus(username: string): LoginGuardStatus {
    const disabled: LoginGuardStatus = {
      maxAttempts: 0,
      failedAttempts: 0,
      remainingAttempts: null,
      isLocked: false,
      lockedUntil: null,
      windowMinutes: LOGIN_LOCKOUT_WINDOW_MINUTES,
    };
    if (!username) return disabled;

    try {
      const db = DatabaseManager.getInstance();
      const maxRow = db.query<{ value: string }>(
        `SELECT value FROM system_settings WHERE key = 'maxFailedLoginAttempts'`
      )[0];
      const maxAttempts = Number(maxRow?.value ?? 0);
      if (!Number.isFinite(maxAttempts) || maxAttempts <= 0) return disabled;

      const windowMs = LOGIN_LOCKOUT_WINDOW_MINUTES * 60_000;
      const cutoff = new Date(Date.now() - windowMs).toISOString();
      const lastSuccess = db.query<{ createdAt: string }>(
        `SELECT created_at AS createdAt FROM login_history
         WHERE username_attempted = ? AND succeeded = 1
         ORDER BY created_at DESC LIMIT 1`,
        [username]
      )[0]?.createdAt;
      const since = lastSuccess && lastSuccess > cutoff ? lastSuccess : cutoff;

      const rows = db.query<{ createdAt: string }>(
        `SELECT created_at AS createdAt FROM login_history
         WHERE username_attempted = ? AND succeeded = 0 AND created_at > ?
         ORDER BY created_at ASC`,
        [username, since]
      );
      const failedAttempts = rows.length;
      const isLocked = failedAttempts >= maxAttempts;
      // The lockout lifts once the oldest counted failure leaves the window.
      const lockedUntil = isLocked && rows[0]?.createdAt
        ? new Date(new Date(rows[0].createdAt).getTime() + windowMs).toISOString()
        : null;

      return {
        maxAttempts,
        failedAttempts,
        remainingAttempts: Math.max(0, maxAttempts - failedAttempts),
        isLocked,
        lockedUntil,
        windowMinutes: LOGIN_LOCKOUT_WINDOW_MINUTES,
      };
    } catch {
      // Login must still work if the security settings table is unavailable.
      return disabled;
    }
  }

  private static lockoutMessage(lockedUntil: string | null): string {
    const remainingMs = lockedUntil ? new Date(lockedUntil).getTime() - Date.now() : 0;
    const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    return `تم إيقاف المحاولات مؤقتاً بسبب كثرة الأخطاء. حاول مجدداً بعد ${minutes} دقيقة.`;
  }

  public static validatePasswordPolicy(password: string, username?: string): void {
    if (!password || password.length < 8) {
      throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
    }
    if (password === 'admin123') {
      throw new Error('لا يمكن استخدام كلمة المرور الافتراضية.');
    }
    if (username && password.toLowerCase() === username.toLowerCase()) {
      throw new Error('لا يمكن أن تطابق كلمة المرور اسم المستخدم.');
    }
    const hasLetter = /[a-zA-Z\u0600-\u06FF]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    if (!hasLetter || !hasDigit) {
      throw new Error('يجب أن تحتوي كلمة المرور على أحرف وأرقام معاً.');
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
      `SELECT id, username, password_hash, full_name, role, phone, is_active, created_at, updated_at
       FROM users WHERE id = ? AND is_active = 1`,
      [userId]
    );
    if (rows.length === 0) {
      try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      return null;
    }
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
    const guard = AuthService.getLoginGuardStatus(username);
    if (guard.isLocked) {
      AuthService.recordLogin(userRecord.id, username, false, 'LOCKED_OUT');
      throw new Error(AuthService.lockoutMessage(guard.lockedUntil));
    }

    const isValid = bcrypt.compareSync(passwordAttempt, userRecord.passwordHash);
    if (!isValid) {
      AuthService.recordLogin(userRecord.id, username, false, 'WRONG_PASSWORD');
      const updated = AuthService.getLoginGuardStatus(username);
      if (updated.isLocked) {
        // The triggering attempt is still reported as a wrong password; the next
        // attempt is refused by the lockout check above.
        throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
      }
      if (updated.remainingAttempts != null) {
        throw new Error(
          `اسم المستخدم أو كلمة المرور غير صحيحة. المحاولات المتبقية قبل الإيقاف المؤقت: ${updated.remainingAttempts}.`
        );
      }
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }

    const isDefaultAdmin = userRecord.username === 'admin' && bcrypt.compareSync('admin123', userRecord.passwordHash);
    const user: User = {
      id: userRecord.id,
      username: userRecord.username,
      fullName: userRecord.fullName,
      role: userRecord.role,
      phone: userRecord.phone,
      isActive: Boolean(userRecord.isActive),
      mustChangePassword: isDefaultAdmin,
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
    const rows = this.db.query<any>(`SELECT id, username, full_name, role, phone, is_active, created_at, updated_at FROM users ORDER BY full_name ASC`);
    return rows.map(r => ({
      id: r.id,
      username: r.username,
      fullName: r.fullName,
      role: r.role,
      phone: r.phone,
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
    const pinHash = user.pinCode ? this.hashPin(user.pinCode) : null;
    const existing = this.db.query(`SELECT id FROM users WHERE username = ?`, [user.username]);
    if (existing.length > 0) {
      throw new Error('اسم المستخدم مسجل مسبقاً.');
    }

    const id = `usr_${uuidv4().substring(0, 8)}`;
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(user.password, salt);
    const branchId = new BranchAccessService().getDefaultAccessibleBranchId(subject);

    this.db.executeTransaction((db) => {
      db.run(`
        INSERT INTO users (id, username, password_hash, full_name, role, phone, pin_code, is_active, branch_id, branch_scope)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'ASSIGNED')
      `, [id, user.username, hash, user.fullName, user.role, user.phone || null, pinHash, branchId]);
      db.run(
        'INSERT INTO users_branches (user_id, branch_id) VALUES (?, ?)',
        [id, branchId]
      );
      db.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id)
        VALUES (?, ?, ?, 'إنشاء مستخدم جديد', 'USERS', ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, subject.id || performedBy, subject.fullName, id]);
    });

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
    PermissionService.require(AuthService.requireAuth(), 'users.view');
    return this.getUserRecordById(id)?.user ?? null;
  }

  private getUserRecordById(id: string): { user: User; pinHash: string | null } | null {
    const row = this.db.query<any>(
      `SELECT id, username, full_name, role, phone, pin_code, is_active, created_at, updated_at
       FROM users WHERE id = ?`,
      [id]
    )[0];
    return row ? { user: this.mapUser(row), pinHash: row.pinCode || null } : null;
  }

  public updateUser(
    id: string,
    patch: Partial<Pick<User, 'fullName' | 'role' | 'phone' | 'isActive'>> & { pinCode?: string },
    actor?: User | null
  ): User {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'users.update');
    const record = this.getUserRecordById(id);
    if (!record) throw new Error('المستخدم غير موجود.');
    const existing = record.user;
    if (existing.id === subject.id && patch.isActive === false) {
      throw new Error('لا يمكنك تعطيل حسابك الحالي.');
    }
    if (existing.id === subject.id && patch.role && patch.role !== 'ADMIN' && existing.role === 'ADMIN') {
      throw new Error('لا يمكنك إزالة صلاحية مدير النظام عن حسابك الحالي.');
    }
    const pinHash = patch.pinCode === undefined
      ? record.pinHash
      : patch.pinCode === ''
        ? null
        : this.hashPin(patch.pinCode);

    this.db.run(
      `UPDATE users SET full_name = ?, role = ?, phone = ?, pin_code = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [
        patch.fullName ?? existing.fullName,
        patch.role ?? existing.role,
        patch.phone ?? existing.phone ?? null,
        pinHash,
        (patch.isActive ?? existing.isActive) ? 1 : 0,
        new Date().toISOString(),
        id,
      ]
    );
    this.audit(subject, 'تعديل بيانات مستخدم', 'USERS', id, existing, patch);
    PermissionService.invalidate(existing);
    return this.getUserRecordById(id)!.user;
  }

  public resetPassword(id: string, newPassword: string, actor?: User | null): void {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'users.reset_password');
    const existing = this.getUserRecordById(id)?.user;
    if (!existing) throw new Error('المستخدم غير موجود.');
    AuthService.validatePasswordPolicy(newPassword, existing.username);
    const hash = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10));
    this.db.executeTransaction(() => {
      this.db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
        hash,
        new Date().toISOString(),
        id,
      ]);
      // Invalidate all active sessions for that user to prevent unauthorized access
      this.db.run(
        `UPDATE user_sessions SET is_active = 0, ended_at = ?, end_reason = 'REVOKED'
         WHERE user_id = ? AND is_active = 1`,
        [new Date().toISOString(), id]
      );
    });
    this.audit(subject, 'إعادة تعيين كلمة مرور مستخدم', 'USERS', id, null, { username: existing.username });
  }

  public changeOwnPassword(userId: string, currentPassword: string, newPassword: string): void {
    const currentUser = AuthService.requireAuth();
    if (currentUser.id !== userId) {
      throw new Error('يمكنك تغيير كلمة مرور حسابك الحالي فقط.');
    }
    const row = this.db.query<any>('SELECT password_hash FROM users WHERE id = ?', [currentUser.id])[0];
    if (!row) throw new Error('المستخدم غير موجود.');
    if (!bcrypt.compareSync(currentPassword, row.passwordHash)) {
      throw new Error('كلمة المرور الحالية غير صحيحة.');
    }
    AuthService.validatePasswordPolicy(newPassword, currentUser.username);
    this.db.executeTransaction(() => {
      this.db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
        bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10)),
        new Date().toISOString(),
        currentUser.id,
      ]);
      // Invalidate all other active sessions for this user
      const currentSes = AuthService.currentSessionId || '';
      this.db.run(
        `UPDATE user_sessions SET is_active = 0, ended_at = ?, end_reason = 'REVOKED'
         WHERE user_id = ? AND id != ? AND is_active = 1`,
        [new Date().toISOString(), currentUser.id, currentSes]
      );
    });
    currentUser.mustChangePassword = false;
  }

  public deleteUser(id: string, actor?: User | null): void {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'users.delete');
    if (id === subject.id) throw new Error('لا يمكنك حذف حسابك الحالي.');
    const existing = this.getUserRecordById(id)?.user;
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
    PermissionService.require(AuthService.requireAuth(), 'users.view');
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

  private requireActor(_actor?: User | null): User {
    return AuthService.requireAuth();
  }

  private hashPin(pin: string): string {
    if (!/^\d{4,8}$/.test(pin)) {
      throw new Error('رمز PIN يجب أن يتكون من 4 إلى 8 أرقام.');
    }
    return bcrypt.hashSync(pin, bcrypt.genSaltSync(10));
  }

  private mapUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      fullName: row.fullName,
      role: row.role,
      phone: row.phone,
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
