import { DatabaseManager } from '../../database/repositories/databaseManager';
import type { User, UserRole } from '../../types';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PermissionService } from './PermissionService';
import { authSession } from './session';
import { CentralUsageLimitService } from '../licensing/CentralUsageLimitService';
import { BranchAccessService } from './BranchAccessService';
import { twoFactorAuth } from './twoFactorAuth';
import { getConfiguredPasswordPolicy } from './passwordPolicy';

/** Raised when the password was correct but a second factor is required. */
export class TwoFactorRequiredError extends Error {
  readonly code = 'TWO_FACTOR_REQUIRED';
  readonly username: string;

  constructor(username: string) {
    super('أدخل رمز التحقق الثنائي لإكمال تسجيل الدخول.');
    this.name = 'TwoFactorRequiredError';
    this.username = username;
  }

}

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
    return authSession.getCurrentUser();
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
    const currentUser = AuthService.requireAuth();
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
    const actor = AuthService.requireAuth();
    const allowed = AuthService.getSwitchableUsers().some((user) => user.id === userId);
    if (!allowed) throw new Error('هذا الحساب غير مسموح بالتبديل إليه.');

    const row = DatabaseManager.getInstance().query<any>(
      `SELECT id, username, password_hash AS passwordHash, full_name AS fullName,
              role, phone, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    PermissionService.invalidate(actor);
    AuthService.endSession('LOGOUT');
    AuthService.setCurrentUser(target);
    AuthService.startSession(target.id);
    AuthService.recordLogin(actor.id, `SWITCH_TO:${target.username}`, true, 'ACCOUNT_SWITCH');
    try { localStorage.setItem(SESSION_KEY, target.id); } catch { /* ignore */ }
    return target;
  }

  /** Throws if no user is authenticated. Use at the top of every service method (brief §108). */
  public static requireAuth(): User {
    return authSession.requireAuth();
  }

  public static setCurrentUser(user: User): void {
    authSession.setCurrentUser(user);
    PermissionService.invalidate(user);
  }

  public static logout(): void {
    const currentUser = authSession.getCurrentUser();
    if (currentUser) PermissionService.invalidate(currentUser);
    AuthService.endSession('LOGOUT');
    authSession.setCurrentUser(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // localStorage unavailable (e.g. node test harness) — session stays in memory only
    }
  }

  /** Clear any session left by a previous app run instead of restoring it. */
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

  private static getLoginRecord(username: string): any {
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
    return userRecord;
  }

  private static rejectInvalidPassword(userRecord: any, username: string): never {
    AuthService.recordLogin(userRecord.id, username, false, 'WRONG_PASSWORD');
    const updated = AuthService.getLoginGuardStatus(username);
    if (updated.isLocked) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }
    if (updated.remainingAttempts != null) {
      throw new Error(
        `اسم المستخدم أو كلمة المرور غير صحيحة. المحاولات المتبقية قبل الإيقاف المؤقت: ${updated.remainingAttempts}.`
      );
    }
    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
  }

  private static finishLogin(
    userRecord: any,
    username: string,
    isDefaultAdmin: boolean,
    twoFactorCode?: string
  ): User {
    // Second factor is checked only after the password succeeds, so a missing or
    // wrong code never reveals whether a username exists.
    if (twoFactorAuth.isEnabled(userRecord.id)) {
      const code = String(twoFactorCode ?? '').trim();
      if (!code) {
        throw new TwoFactorRequiredError(username);
      }
      const normalizedCode = code.replace(/\s+/g, '');
      if (!twoFactorAuth.verifyLoginCodeSync(userRecord.id, normalizedCode)) {
        AuthService.recordLogin(userRecord.id, username, false, 'TWO_FACTOR_FAILED');
        const updated = AuthService.getLoginGuardStatus(username);
        if (updated.isLocked) {
          throw new Error('رمز التحقق الثنائي غير صحيح. تم إيقاف المحاولات مؤقتًا.');
        }
        if (updated.remainingAttempts != null) {
          throw new Error(
            `رمز التحقق الثنائي غير صحيح. المحاولات المتبقية قبل الإيقاف المؤقت: ${updated.remainingAttempts}.`
          );
        }
        throw new Error('رمز التحقق الثنائي غير صحيح.');
      }
    }

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

  public static loginByPin(pin: string): User {
    const db = DatabaseManager.getInstance();
    const unknownPinGuardKey = '__PIN_LOGIN__';
    const guard = AuthService.getLoginGuardStatus(unknownPinGuardKey);
    if (guard.isLocked) {
      AuthService.recordLogin(null, unknownPinGuardKey, false, 'LOCKED_OUT');
      throw new Error(AuthService.lockoutMessage(guard.lockedUntil));
    }
    const rows = db.query<any>(`SELECT * FROM users WHERE is_active = 1 AND pin_code IS NOT NULL`);
    const matches: any[] = [];
    for (const row of rows) {
      try {
        if (bcrypt.compareSync(pin, row.pinCode)) matches.push(row);
      } catch { /* ignore */ }
    }
    if (matches.length !== 1) {
      AuthService.recordLogin(null, unknownPinGuardKey, false, matches.length > 1 ? 'DUPLICATE_PIN' : 'WRONG_PIN');
      const updated = AuthService.getLoginGuardStatus(unknownPinGuardKey);
      if (updated.isLocked) throw new Error(AuthService.lockoutMessage(updated.lockedUntil));
      throw new Error('رمز PIN غير صحيح.');
    }
    const matched = matches[0];
    const pinGuardKey = AuthService.pinLoginLabel(matched.username);
    const passwordGuard = AuthService.getLoginGuardStatus(matched.username);
    if (passwordGuard.isLocked) {
      AuthService.recordLogin(matched.id, AuthService.pinLoginLabel(matched.username), false, 'PASSWORD_LOCKED_OUT');
      throw new Error(AuthService.lockoutMessage(passwordGuard.lockedUntil));
    }
    const accountPinGuard = AuthService.getLoginGuardStatus(pinGuardKey);
    if (accountPinGuard.isLocked) {
      AuthService.recordLogin(matched.id, AuthService.pinLoginLabel(matched.username), false, 'LOCKED_OUT');
      throw new Error(AuthService.lockoutMessage(accountPinGuard.lockedUntil));
    }
    if (twoFactorAuth.isEnabled(matched.id)) {
      // A 4-6 digit PIN must never bypass a second factor.
      AuthService.recordLogin(matched.id, AuthService.pinLoginLabel(matched.username), false, 'TWO_FACTOR_REQUIRED');
      throw new Error('هذا الحساب محمي بالتحقق الثنائي. سجّل الدخول بكلمة المرور ورمز التحقق.');
    }
    const user: User = {
      id: matched.id,
      username: matched.username,
      fullName: matched.fullName,
      role: matched.role,
      phone: matched.phone,
      isActive: Boolean(matched.isActive),
      mustChangePassword: matched.username === 'admin' && bcrypt.compareSync('admin123', matched.passwordHash),
      createdAt: matched.createdAt,
      updatedAt: matched.updatedAt
    };
    AuthService.setCurrentUser(user);
    AuthService.recordLogin(user.id, AuthService.pinLoginLabel(matched.username), true);
    AuthService.startSession(user.id);
    try { localStorage.setItem(SESSION_KEY, user.id); } catch { /* ignore */ }
    return user;
  }

  public getOwnLoginPinStatus(): { hasPin: boolean; pending: boolean; requestedAt?: string } {
    const user = AuthService.requireAuth();
    const record = this.db.query<{ pinCode: string | null }>(
      'SELECT pin_code AS pinCode FROM users WHERE id = ? AND is_active = 1',
      [user.id]
    )[0];
    if (!record) throw new Error('حساب المستخدم غير موجود أو غير نشط.');
    const request = this.db.query<{ requestedAt: string }>(
      `SELECT requested_at AS requestedAt FROM user_login_pin_change_requests
       WHERE user_id = ? AND status = 'PENDING'`,
      [user.id]
    )[0];
    return { hasPin: Boolean(record.pinCode), pending: Boolean(request), requestedAt: request?.requestedAt };
  }

  public async requestOwnLoginPinChange(pin: string): Promise<void> {
    const user = AuthService.requireAuth();
    const pinHash = this.hashPin(pin);
    const pinCiphertext = await this.encryptLoginPin(pin);
    this.assertUniqueActivePin(pin, user.id);
    if (this.db.query(
      `SELECT id FROM user_login_pin_change_requests WHERE user_id = ? AND status = 'PENDING'`,
      [user.id]
    ).length > 0) {
      throw new Error('لديك بالفعل طلب تغيير رمز دخول قيد المراجعة.');
    }

    this.db.run(
      `INSERT INTO user_login_pin_change_requests (id, user_id, pin_hash, pin_ciphertext)
       VALUES (?, ?, ?, ?)`,
      [`pinreq_${uuidv4().replace(/-/g, '').slice(0, 12)}`, user.id, pinHash, pinCiphertext]
    );
    this.audit(user, 'طلب تغيير رمز الدخول', 'USERS', user.id, null, { status: 'PENDING' });
  }

  public getPendingLoginPinChanges(): Array<{
    id: string;
    userId: string;
    username: string;
    fullName: string;
    requestedAt: string;
  }> {
    const actor = AuthService.requireAuth();
    this.requirePinChangeApprover(actor);
    PermissionService.require(actor, 'ui.users.users.update');
    return this.db.query(
      `SELECT request.id, request.user_id AS userId, users.username,
              users.full_name AS fullName, request.requested_at AS requestedAt
       FROM user_login_pin_change_requests request
       JOIN users ON users.id = request.user_id
       WHERE request.status = 'PENDING' AND users.is_active = 1 AND request.user_id <> ?
       ORDER BY request.requested_at, users.full_name`,
      [actor.id]
    );
  }

  public approveLoginPinChange(requestId: string): void {
    const actor = AuthService.requireAuth();
    this.requirePinChangeApprover(actor);
    PermissionService.require(actor, 'ui.users.users.update');
    const request = this.db.query<{ id: string; userId: string; pinHash: string; pinCiphertext: string | null; username: string }>(
      `SELECT request.id, request.user_id AS userId, request.pin_hash AS pinHash,
              request.pin_ciphertext AS pinCiphertext,
              users.username
       FROM user_login_pin_change_requests request
       JOIN users ON users.id = request.user_id
       WHERE request.id = ? AND request.status = 'PENDING' AND users.is_active = 1
         AND request.user_id <> ?`,
      [requestId, actor.id]
    )[0];
    if (!request) throw new Error('طلب تغيير رمز الدخول غير موجود أو لم يعد معلقًا.');
    if (!request.pinCiphertext) {
      throw new Error('هذا الطلب قديم ولا يمكن استعادة رمزه. اطلب من المستخدم إنشاء طلب جديد.');
    }

    const reviewedAt = new Date().toISOString();
    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE users SET pin_code = ?, pin_ciphertext = ?, updated_at = ? WHERE id = ? AND is_active = 1`,
        [request.pinHash, request.pinCiphertext, reviewedAt, request.userId]
      );
      this.db.run(
        `UPDATE user_login_pin_change_requests
         SET status = 'APPROVED', reviewed_by = ?, reviewed_at = ?
         WHERE id = ? AND status = 'PENDING'`,
        [actor.id, reviewedAt, requestId]
      );
    });
    this.audit(actor, 'اعتماد تغيير رمز الدخول', 'USERS', request.userId, null, {
      username: request.username,
      status: 'APPROVED',
    });
  }

  public rejectLoginPinChange(requestId: string): void {
    const actor = AuthService.requireAuth();
    this.requirePinChangeApprover(actor);
    PermissionService.require(actor, 'ui.users.users.update');
    const request = this.db.query<{ userId: string }>(
      `SELECT user_id AS userId FROM user_login_pin_change_requests
       WHERE id = ? AND status = 'PENDING' AND user_id <> ?`,
      [requestId, actor.id]
    )[0];
    if (!request) throw new Error('طلب تغيير رمز الدخول غير موجود أو لم يعد معلقًا.');
    this.db.run(
      `UPDATE user_login_pin_change_requests
       SET status = 'REJECTED', reviewed_by = ?, reviewed_at = ?
       WHERE id = ? AND status = 'PENDING'`,
      [actor.id, new Date().toISOString(), requestId]
    );
    this.audit(actor, 'رفض تغيير رمز الدخول', 'USERS', request.userId, null, { status: 'REJECTED' });
  }

  private static pinLoginLabel(username: string): string {
    return `PIN:${username}`;
  }

  public static login(username: string, passwordAttempt: string, twoFactorCode?: string): User {
    const userRecord = AuthService.getLoginRecord(username);
    const isValid = bcrypt.compareSync(passwordAttempt, userRecord.passwordHash);
    if (!isValid) AuthService.rejectInvalidPassword(userRecord, username);

    const isDefaultAdmin = userRecord.username === 'admin' && bcrypt.compareSync('admin123', userRecord.passwordHash);
    return AuthService.finishLogin(userRecord, username, isDefaultAdmin, twoFactorCode);
  }

  public static async loginAsync(username: string, passwordAttempt: string, twoFactorCode?: string): Promise<User> {
    const userRecord = AuthService.getLoginRecord(username);
    const isValid = await bcrypt.compare(passwordAttempt, userRecord.passwordHash);
    if (!isValid) AuthService.rejectInvalidPassword(userRecord, username);

    const isDefaultAdmin = userRecord.username === 'admin'
      && await bcrypt.compare('admin123', userRecord.passwordHash);
    return AuthService.finishLogin(userRecord, username, isDefaultAdmin, twoFactorCode);
  }

  public getAllUsers(): User[] {
    PermissionService.require(AuthService.requireAuth(), 'ui.users.users.view');
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

  public async getRecoverableLoginPins(): Promise<Record<string, string | null>> {
    const actor = AuthService.requireAuth();
    if (actor.role !== 'ADMIN') throw new Error('عرض رموز الدخول متاح لمدير النظام فقط.');
    PermissionService.require(actor, 'ui.users.users.view');
    const rows = this.db.query<{ id: string; pinCiphertext: string | null }>(
      'SELECT id, pin_ciphertext AS pinCiphertext FROM users'
    );
    const decrypt = typeof window === 'undefined'
      ? undefined
      : window.ceramisys?.security?.decryptDatabaseSecret;
    if (rows.some((row) => row.pinCiphertext) && !decrypt) {
      throw new Error('خدمة فك تشفير الرموز غير متاحة. افتح النظام من تطبيق سطح المكتب.');
    }
    const entries = await Promise.all(rows.map(async ({ id, pinCiphertext }) => [
      id,
      pinCiphertext ? await decrypt!(pinCiphertext) : null,
    ] as const));
    return Object.fromEntries(entries);
  }

  public async regenerateAllLoginPinsForAdmin(): Promise<void> {
    const actor = AuthService.requireAuth();
    if (actor.role !== 'ADMIN') throw new Error('إعادة إنشاء رموز الدخول متاحة لمدير النظام فقط.');
    PermissionService.require(actor, 'ui.users.users.update');
    const users = this.db.query<{ id: string }>('SELECT id FROM users ORDER BY id');
    if (users.length === 0) throw new Error('لا توجد حسابات لإعادة إنشاء رموز الدخول.');
    const encrypt = typeof window === 'undefined'
      ? undefined
      : window.ceramisys?.security?.encryptDatabaseSecret;
    if (!encrypt) throw new Error('خدمة تشفير الرموز غير متاحة. افتح النظام من تطبيق سطح المكتب.');

    const generated = new Set<string>();
    const updates: Array<{ id: string; pinHash: string; pinCiphertext: string }> = [];
    for (const user of users) {
      let pin = '';
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidate = this.generateUniqueLoginPin();
        if (!generated.has(candidate)) {
          pin = candidate;
          break;
        }
      }
      if (!pin) throw new Error('تعذر إنشاء رموز دخول فريدة لجميع الحسابات.');
      generated.add(pin);
      updates.push({
        id: user.id,
        pinHash: this.hashPin(pin),
        pinCiphertext: await encrypt(pin),
      });
    }

    const updatedAt = new Date().toISOString();
    this.db.executeTransaction(() => {
      for (const update of updates) {
        this.db.run(
          'UPDATE users SET pin_code = ?, pin_ciphertext = ?, updated_at = ? WHERE id = ?',
          [update.pinHash, update.pinCiphertext, updatedAt, update.id]
        );
      }
      this.db.run(
        `UPDATE user_login_pin_change_requests
         SET status = 'REJECTED', reviewed_by = ?, reviewed_at = ?
         WHERE status = 'PENDING'`,
        [actor.id, updatedAt]
      );
    });
    this.audit(actor, 'إعادة إنشاء رموز دخول جميع المستخدمين', 'USERS', 'all', null, {
      usersCount: updates.length,
    });
  }

  public createUser(
    user: { username: string; password: string; fullName: string; role: UserRole; phone?: string; pinCode?: string; pinCiphertext?: string },
    performedBy = 'usr_admin',
    actor?: User | null
  ): User {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'ui.users.users.create');
    if (user.pinCode && subject.role !== 'ADMIN') {
      throw new Error('تعيين رمز الدخول متاح لمدير النظام فقط.');
    }
    AuthService.validatePasswordPolicy(user.password, user.username);
    CentralUsageLimitService.assertWithin('maxUsers');
    const roleExists = this.db.query('SELECT code FROM roles WHERE code = ?', [user.role]);
    if (roleExists.length === 0) {
      throw new Error('الدور المحدد غير موجود.');
    }
    const pinHash = user.pinCode ? this.hashPin(user.pinCode) : null;
    if (user.pinCode) this.assertUniqueActivePin(user.pinCode);
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
        INSERT INTO users (id, username, password_hash, full_name, role, phone, pin_code, pin_ciphertext, is_active, branch_id, branch_scope)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'ASSIGNED')
      `, [id, user.username, hash, user.fullName, user.role, user.phone || null, pinHash, user.pinCiphertext || null, branchId]);
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

  /**
   * إنشاء/تحديث حساب محلي من بيانات الحساب المركزي بعد نجاح تفعيل الجهاز، ليتمكن
   * العميل من تسجيل الدخول بنفس بيانات الحساب الذي أنشأه مسؤول النظام.
   * لا يُطبَّق فحص صلاحيات هنا لأن هذا الحساب يُنشأ قبل أي تسجيل دخول (تهيئة أولى).
   */
  public static provisionCentralAccount(params: { username: string; password: string; fullName?: string; phone?: string; role?: string }): void {
    const username = String(params.username || '').trim();
    if (!username || !params.password) return;

    const roleMap: Record<string, UserRole> = {
      admin: 'ADMIN', manager: 'MANAGER', accountant: 'ACCOUNTANT',
      cashier: 'CASHIER', sales: 'SALES', warehouse: 'WAREHOUSE',
    };
    const role: UserRole = roleMap[String(params.role || '').trim().toLowerCase()] || 'ADMIN';
    const fullName = String(params.fullName || '').trim() || username;
    const phone = params.phone ? String(params.phone).trim() : null;

    const db = DatabaseManager.getInstance();
    const hash = bcrypt.hashSync(params.password, bcrypt.genSaltSync(10));

    const existing = db.query<any>('SELECT id FROM users WHERE username = ?', [username])[0];
    if (existing) {
      db.run(
        'UPDATE users SET password_hash = ?, full_name = ?, phone = ?, role = ?, is_active = 1, updated_at = ? WHERE id = ?',
        [hash, fullName, phone, role, new Date().toISOString(), existing.id]
      );
      return;
    }

    const branchRow = db.query<any>('SELECT id FROM branches ORDER BY is_main DESC, created_at ASC LIMIT 1')[0];
    const branchId = branchRow?.id || 'br_main';
    const id = `usr_${uuidv4().substring(0, 8)}`;
    db.executeTransaction((tx) => {
      tx.run(`
        INSERT INTO users (id, username, password_hash, full_name, role, phone, pin_code, is_active, branch_id, branch_scope)
        VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, 'ALL')
      `, [id, username, hash, fullName, role, phone, branchId]);
      tx.run('INSERT INTO users_branches (user_id, branch_id) VALUES (?, ?)', [id, branchId]);
    });
  }

  public checkPermission(user: User, requiredRole: UserRole[]): boolean {
    if (user.role === 'ADMIN') return true;
    return requiredRole.includes(user.role);
  }

  // ─── Admin user management ──────────────────────────────────────────────────

  public getUserById(id: string): User | null {
    PermissionService.require(AuthService.requireAuth(), 'ui.users.users.view');
    return this.getUserRecordById(id)?.user ?? null;
  }

  private getUserRecordById(id: string): { user: User; pinHash: string | null; pinCiphertext: string | null } | null {
    const row = this.db.query<any>(
      `SELECT id, username, full_name, role, phone, pin_code, pin_ciphertext, is_active, created_at, updated_at
       FROM users WHERE id = ?`,
      [id]
    )[0];
    return row ? {
      user: this.mapUser(row),
      pinHash: row.pinCode || null,
      pinCiphertext: row.pinCiphertext || null,
    } : null;
  }

  public updateUser(
    id: string,
    patch: Partial<Pick<User, 'fullName' | 'role' | 'phone' | 'isActive'>> & { pinCode?: string; pinCiphertext?: string },
    actor?: User | null
  ): User {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'ui.users.users.update');
    if (patch.pinCode !== undefined && subject.role !== 'ADMIN') {
      throw new Error('تعديل رمز الدخول متاح لمدير النظام فقط.');
    }
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
    const pinCiphertext = patch.pinCode === undefined
      ? record.pinCiphertext
      : patch.pinCode === ''
        ? null
        : patch.pinCiphertext || null;
    if (patch.pinCode && (patch.isActive ?? existing.isActive)) {
      this.assertUniqueActivePin(patch.pinCode, id);
    }

    this.db.run(
      `UPDATE users SET full_name = ?, role = ?, phone = ?, pin_code = ?, pin_ciphertext = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [
        patch.fullName ?? existing.fullName,
        patch.role ?? existing.role,
        patch.phone ?? existing.phone ?? null,
        pinHash,
        pinCiphertext,
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
    PermissionService.require(subject, 'ui.users.users.reset_password');
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

  public completeFirstRunAdminSetup(
    userId: string,
    account: { username: string; fullName: string; phone: string; password: string }
  ): User {
    const currentUser = AuthService.requireAuth();
    if (currentUser.id !== userId || currentUser.role !== 'ADMIN') {
      throw new Error('يجب تسجيل الدخول بحساب المدير الأساسي لإكمال تهيئته.');
    }

    const username = account.username.trim();
    const fullName = account.fullName.trim();
    const phone = account.phone.trim();
    if (username.length < 3 || username.length > 50 || /\s/.test(username)) {
      throw new Error('اسم المستخدم يجب أن يتكون من 3 إلى 50 حرفًا دون مسافات.');
    }
    if (fullName.length < 2 || fullName.length > 100) {
      throw new Error('الاسم المعروض يجب أن يتكون من حرفين إلى 100 حرف.');
    }
    if (phone.length > 30) {
      throw new Error('رقم الهاتف لا يمكن أن يتجاوز 30 حرفًا.');
    }

    const admin = this.db.query<{ username: string; passwordHash: string }>(
      'SELECT username, password_hash AS passwordHash FROM users WHERE id = ?',
      [userId]
    )[0];
    if (!admin || admin.username !== 'admin' || !bcrypt.compareSync('admin123', admin.passwordHash)) {
      throw new Error('حساب المدير لم يعد يستخدم بيانات الدخول الافتراضية.');
    }
    if (this.db.query(
      'SELECT id FROM users WHERE lower(username) = lower(?) AND id <> ? LIMIT 1',
      [username, userId]
    ).length > 0) {
      throw new Error('اسم المستخدم مسجل مسبقًا.');
    }
    AuthService.validatePasswordPolicy(account.password, username);

    const updatedAt = new Date().toISOString();
    const passwordHash = bcrypt.hashSync(account.password, bcrypt.genSaltSync(10));
    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE users
         SET username = ?, full_name = ?, phone = ?, password_hash = ?, updated_at = ?
         WHERE id = ?`,
        [username, fullName, phone || null, passwordHash, updatedAt, userId]
      );
      const currentSessionId = AuthService.currentSessionId || '';
      this.db.run(
        `UPDATE user_sessions SET is_active = 0, ended_at = ?, end_reason = 'REVOKED'
         WHERE user_id = ? AND id != ? AND is_active = 1`,
        [updatedAt, userId, currentSessionId]
      );
      this.audit(currentUser, 'إكمال تهيئة حساب المدير الأول', 'USERS', userId, {
        username: admin.username,
        fullName: currentUser.fullName,
        phone: currentUser.phone,
      }, { username, fullName, phone: phone || null });
    });

    return {
      ...currentUser,
      username,
      fullName,
      phone: phone || undefined,
      mustChangePassword: false,
      updatedAt,
    };
  }

  public deleteUser(id: string, actor?: User | null): void {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'ui.users.users.delete');
    if (id === subject.id) throw new Error('لا يمكنك حذف حسابك الحالي.');
    const existing = this.getUserRecordById(id)?.user;
    if (!existing) throw new Error('المستخدم غير موجود.');
    if (existing.id === 'usr_admin' || existing.username === 'admin') {
      throw new Error('لا يمكن حذف حساب المدير الأساسي.');
    }
    this.db.executeTransaction(() => {
      this.db.run('DELETE FROM user_permissions WHERE user_id = ?', [id]);
      this.db.run('DELETE FROM users WHERE id = ?', [id]);
    });
    this.audit(subject, 'حذف مستخدم', 'USERS', id, existing, null);
    PermissionService.invalidate(existing);
  }

  public getLoginHistory(userId?: string, limit = 100): any[] {
    PermissionService.require(AuthService.requireAuth(), 'ui.users.users.view');
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

  public generateUniqueLoginPin(): string {
    const length = AuthService.getLoginPinLength();
    const digits = new Uint32Array(length);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      globalThis.crypto.getRandomValues(digits);
      const pin = Array.from(digits, (digit) => String(digit % 10)).join('');
      try {
        this.assertUniqueActivePin(pin);
        return pin;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('مستخدم نشط آخر')) throw error;
      }
    }
    throw new Error('تعذر إنشاء رمز دخول فريد. حاول مرة أخرى.');
  }

  private hashPin(pin: string): string {
    const length = AuthService.getLoginPinLength();
    if (!new RegExp(`^\\d{${length}}$`).test(pin)) {
      throw new Error(`رمز الدخول يجب أن يتكون من ${length} أرقام.`);
    }
    return bcrypt.hashSync(pin, bcrypt.genSaltSync(10));
  }

  public async encryptLoginPin(pin: string): Promise<string> {
    this.hashPin(pin);
    const encrypt = typeof window === 'undefined'
      ? undefined
      : window.ceramisys?.security?.encryptDatabaseSecret;
    if (!encrypt) throw new Error('خدمة تشفير الرموز غير متاحة. افتح النظام من تطبيق سطح المكتب.');
    return encrypt(pin);
  }

  private assertUniqueActivePin(pin: string, excludeUserId?: string): void {
    const rows = this.db.query<{ pinCode: string }>(
      `SELECT pin_code AS pinCode FROM users
       WHERE is_active = 1 AND pin_code IS NOT NULL AND id <> ?`,
      [excludeUserId || '']
    );
    if (rows.some((row) => {
      try { return bcrypt.compareSync(pin, row.pinCode); } catch { return false; }
    })) {
      throw new Error('لا يمكن استخدام رمز PIN مخصص لمستخدم نشط آخر.');
    }
    const pending = this.db.query<{ pinHash: string }>(
      `SELECT pin_hash AS pinHash FROM user_login_pin_change_requests
       WHERE status = 'PENDING' AND user_id <> ?`,
      [excludeUserId || '']
    );
    if (pending.some((request) => {
      try { return bcrypt.compareSync(pin, request.pinHash); } catch { return false; }
    })) {
      throw new Error('رمز الدخول مستخدم في طلب آخر قيد المراجعة.');
    }
  }

  private requirePinChangeApprover(actor: User): void {
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
      throw new Error('مراجعة طلبات تغيير رمز الدخول متاحة للمدير فقط.');
    }
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
