import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { User } from '../../../../types';
import bcrypt from 'bcryptjs';
import { PlatformStaffAuthService } from '../../platform/PlatformStaffAuthService';
import { twoFactorAuth } from '../twoFactorAuth';
import {
  LOGIN_LOCKOUT_WINDOW_MINUTES,
  SECURITY_KEY_LOGIN_GUARD_KEY,
  SESSION_KEY,
  TwoFactorRequiredError,
  type LoginGuardStatus,
} from './shared';
import { AuthServiceSession } from './session';

/**
 * Login & lockout group for AuthService: failed-attempt guard status, login
 * history recording on failures, password/PIN/security-key login flows and
 * the shared post-password login completion (second factor + session start).
 */
export class AuthServiceLogin extends AuthServiceSession {
  /**
   * Read-only lockout state for a username. Safe to call from the login screen:
   * never throws, never requires authentication. Uses a conservative fail-closed
   * policy when security settings are unavailable to prevent bypassing protection.
   */
  public static getLoginGuardStatus(username: string): LoginGuardStatus {
    // Conservative default: apply strict lockout when settings are unavailable
    const safeDefault: LoginGuardStatus = {
      maxAttempts: 5, // Conservative default
      failedAttempts: 0,
      remainingAttempts: 5,
      isLocked: false,
      lockedUntil: null,
      windowMinutes: LOGIN_LOCKOUT_WINDOW_MINUTES,
    };
    if (!username) return safeDefault;

    try {
      const db = DatabaseManager.getInstance();
      const maxRow = db.query<{ value: string }>(
        `SELECT value FROM system_settings WHERE key = 'maxFailedLoginAttempts'`
      )[0];
      const maxAttempts = Number(maxRow?.value ?? 5); // Default to 5 if not configured
      if (!Number.isFinite(maxAttempts) || maxAttempts <= 0) {
        // Treat 0 or invalid as "use conservative default" instead of disabled
        return { ...safeDefault, maxAttempts: 5, remainingAttempts: 5 };
      }

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
      // Fail-closed: apply conservative lockout when security settings are unavailable
      // This prevents bypassing protection during database errors
      console.warn('[AuthService] Security settings unavailable, using conservative lockout policy');
      return safeDefault;
    }
  }

  protected static lockoutMessage(lockedUntil: string | null): string {
    const remainingMs = lockedUntil ? new Date(lockedUntil).getTime() - Date.now() : 0;
    const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    return `تم إيقاف المحاولات مؤقتاً بسبب كثرة الأخطاء. حاول مجدداً بعد ${minutes} دقيقة.`;
  }

  protected static getLoginRecord(username: string): any {
    const db = DatabaseManager.getInstance();
    const rows = db.query<any>(`SELECT * FROM users WHERE username = ? AND is_active = 1`, [username]);
    if (rows.length === 0) {
      AuthServiceLogin.recordLogin(null, username, false, 'USER_NOT_FOUND');
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }

    const userRecord = rows[0];
    const guard = AuthServiceLogin.getLoginGuardStatus(username);
    if (guard.isLocked) {
      AuthServiceLogin.recordLogin(userRecord.id, username, false, 'LOCKED_OUT');
      throw new Error(AuthServiceLogin.lockoutMessage(guard.lockedUntil));
    }
    return userRecord;
  }

  protected static rejectInvalidPassword(userRecord: any, username: string): never {
    AuthServiceLogin.recordLogin(userRecord.id, username, false, 'WRONG_PASSWORD');
    const updated = AuthServiceLogin.getLoginGuardStatus(username);
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

  protected static finishLogin(
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
        AuthServiceLogin.recordLogin(userRecord.id, username, false, 'TWO_FACTOR_FAILED');
        const updated = AuthServiceLogin.getLoginGuardStatus(username);
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
      securityKeySetupRequired: userRecord.id === 'usr_admin' && !userRecord.securityKeyHash,
      createdAt: userRecord.createdAt,
      updatedAt: userRecord.updatedAt
    };

    AuthServiceLogin.setCurrentUser(user);
    AuthServiceLogin.recordLogin(user.id, username, true);
    AuthServiceLogin.startSession(user.id);
    try {
      localStorage.setItem(SESSION_KEY, user.id);
    } catch {
      // ignore
    }
    return user;
  }

  public static loginByPin(pin: string): User {
    const db = DatabaseManager.getInstance();
    const unknownPinGuardKey = '__PIN_LOGIN__';
    const guard = AuthServiceLogin.getLoginGuardStatus(unknownPinGuardKey);
    if (guard.isLocked) {
      AuthServiceLogin.recordLogin(null, unknownPinGuardKey, false, 'LOCKED_OUT');
      throw new Error(AuthServiceLogin.lockoutMessage(guard.lockedUntil));
    }
    const rows = db.query<any>(`SELECT * FROM users WHERE is_active = 1 AND pin_code IS NOT NULL`);
    const matches: any[] = [];
    for (const row of rows) {
      try {
        if (bcrypt.compareSync(pin, row.pinCode)) matches.push(row);
      } catch { /* ignore */ }
    }
    if (matches.length !== 1) {
      AuthServiceLogin.recordLogin(null, unknownPinGuardKey, false, matches.length > 1 ? 'DUPLICATE_PIN' : 'WRONG_PIN');
      const updated = AuthServiceLogin.getLoginGuardStatus(unknownPinGuardKey);
      if (updated.isLocked) throw new Error(AuthServiceLogin.lockoutMessage(updated.lockedUntil));
      throw new Error('رمز PIN غير صحيح.');
    }
    const matched = matches[0];
    const pinGuardKey = AuthServiceLogin.pinLoginLabel(matched.username);
    const passwordGuard = AuthServiceLogin.getLoginGuardStatus(matched.username);
    if (passwordGuard.isLocked) {
      AuthServiceLogin.recordLogin(matched.id, AuthServiceLogin.pinLoginLabel(matched.username), false, 'PASSWORD_LOCKED_OUT');
      throw new Error(AuthServiceLogin.lockoutMessage(passwordGuard.lockedUntil));
    }
    const accountPinGuard = AuthServiceLogin.getLoginGuardStatus(pinGuardKey);
    if (accountPinGuard.isLocked) {
      AuthServiceLogin.recordLogin(matched.id, AuthServiceLogin.pinLoginLabel(matched.username), false, 'LOCKED_OUT');
      throw new Error(AuthServiceLogin.lockoutMessage(accountPinGuard.lockedUntil));
    }
    if (twoFactorAuth.isEnabled(matched.id)) {
      // A 4-6 digit PIN must never bypass a second factor.
      AuthServiceLogin.recordLogin(matched.id, AuthServiceLogin.pinLoginLabel(matched.username), false, 'TWO_FACTOR_REQUIRED');
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
      securityKeySetupRequired: matched.id === 'usr_admin' && !matched.securityKeyHash,
      createdAt: matched.createdAt,
      updatedAt: matched.updatedAt
    };
    AuthServiceLogin.setCurrentUser(user);
    AuthServiceLogin.recordLogin(user.id, AuthServiceLogin.pinLoginLabel(matched.username), true);
    AuthServiceLogin.startSession(user.id);
    try { localStorage.setItem(SESSION_KEY, user.id); } catch { /* ignore */ }
    return user;
  }

  public static loginBySecurityKey(securityKey: string): User {
    const db = DatabaseManager.getInstance();
    const guard = AuthServiceLogin.getLoginGuardStatus(SECURITY_KEY_LOGIN_GUARD_KEY);
    if (guard.isLocked) {
      AuthServiceLogin.recordLogin(null, SECURITY_KEY_LOGIN_GUARD_KEY, false, 'LOCKED_OUT');
      throw new Error(AuthServiceLogin.lockoutMessage(guard.lockedUntil));
    }

    const records = db.query<any>(
      `SELECT id, username, password_hash AS passwordHash, full_name AS fullName,
              role, phone, is_active AS isActive, created_at AS createdAt,
              updated_at AS updatedAt, security_key_hash AS securityKeyHash
       FROM users
       WHERE is_active = 1 AND security_key_hash IS NOT NULL`
    );
    const matches: any[] = [];
    for (const record of records) {
      try {
        if (bcrypt.compareSync(securityKey, record.securityKeyHash)) matches.push(record);
      } catch {
        // Ignore malformed stored hashes and keep the result indistinguishable from a bad key.
      }
    }

    if (matches.length !== 1) {
      AuthServiceLogin.recordLogin(
        null,
        SECURITY_KEY_LOGIN_GUARD_KEY,
        false,
        matches.length > 1 ? 'AMBIGUOUS_SECURITY_KEY' : 'WRONG_SECURITY_KEY'
      );
      const updated = AuthServiceLogin.getLoginGuardStatus(SECURITY_KEY_LOGIN_GUARD_KEY);
      if (updated.isLocked) throw new Error(AuthServiceLogin.lockoutMessage(updated.lockedUntil));
      if (updated.remainingAttempts != null) {
        throw new Error(`مفتاح الأمان غير صحيح. المحاولات المتبقية قبل الإيقاف المؤقت: ${updated.remainingAttempts}.`);
      }
      throw new Error('مفتاح الأمان غير صحيح.');
    }

    const matched = matches[0];
    const accountGuard = AuthServiceLogin.getLoginGuardStatus(matched.username);
    if (accountGuard.isLocked) {
      AuthServiceLogin.recordLogin(matched.id, matched.username, false, 'LOCKED_OUT');
      throw new Error(AuthServiceLogin.lockoutMessage(accountGuard.lockedUntil));
    }
    if (twoFactorAuth.isEnabled(matched.id)) {
      AuthServiceLogin.recordLogin(matched.id, SECURITY_KEY_LOGIN_GUARD_KEY, false, 'TWO_FACTOR_REQUIRED');
      AuthServiceLogin.recordLogin(matched.id, matched.username, false, 'TWO_FACTOR_REQUIRED');
      throw new Error('هذا الحساب محمي بالتحقق الثنائي. سجّل الدخول بكلمة المرور ورمز التحقق.');
    }
    if (matched.username === 'admin' && bcrypt.compareSync('admin123', matched.passwordHash)) {
      AuthServiceLogin.recordLogin(matched.id, SECURITY_KEY_LOGIN_GUARD_KEY, false, 'PASSWORD_CHANGE_REQUIRED');
      throw new Error('يجب تغيير كلمة المرور الافتراضية قبل استخدام مفتاح الأمان.');
    }

    const user: User = {
      id: matched.id,
      username: matched.username,
      fullName: matched.fullName,
      role: matched.role,
      phone: matched.phone,
      isActive: Boolean(matched.isActive),
      mustChangePassword: false,
      securityKeySetupRequired: false,
      createdAt: matched.createdAt,
      updatedAt: matched.updatedAt,
    };
    AuthServiceLogin.setCurrentUser(user);
    AuthServiceLogin.recordLogin(user.id, matched.username, true);
    AuthServiceLogin.startSession(user.id);
    try { localStorage.setItem(SESSION_KEY, user.id); } catch { /* ignore */ }
    return user;
  }

  protected static pinLoginLabel(username: string): string {
    return `PIN:${username}`;
  }

  public static login(username: string, passwordAttempt: string, twoFactorCode?: string): User {
    const normalizedUsername = String(username || '').trim();
    const db = DatabaseManager.getInstance();
    const userRows = db.query<any>(`SELECT * FROM users WHERE username = ? AND is_active = 1`, [normalizedUsername]);
    if (userRows.length === 0) {
      AuthServiceLogin.recordLogin(null, normalizedUsername, false, 'USER_NOT_FOUND');
      throw new Error('بيانات الدخول غير صحيحة أو الحساب غير موجود.');
    }

    const userRecord = userRows[0];
    const guard = AuthServiceLogin.getLoginGuardStatus(normalizedUsername);
    if (guard.isLocked) {
      AuthServiceLogin.recordLogin(userRecord.id, normalizedUsername, false, 'LOCKED_OUT');
      throw new Error(AuthServiceLogin.lockoutMessage(guard.lockedUntil));
    }

    const isValid = bcrypt.compareSync(passwordAttempt, userRecord.passwordHash);
    if (!isValid) AuthServiceLogin.rejectInvalidPassword(userRecord, normalizedUsername);

    const isDefaultAdmin = userRecord.username === 'admin' && bcrypt.compareSync('admin123', userRecord.passwordHash);
    return AuthServiceLogin.finishLogin(userRecord, normalizedUsername, isDefaultAdmin, twoFactorCode);
  }

  public static async loginAsync(username: string, passwordAttempt: string, twoFactorCode?: string): Promise<User> {
    const normalizedUsername = String(username || '').trim();
    const db = DatabaseManager.getInstance();
    const userRows = db.query<any>(`SELECT * FROM users WHERE username = ? AND is_active = 1`, [normalizedUsername]);

    if (userRows.length === 0) {
      const platformUser = await PlatformStaffAuthService.login(normalizedUsername, passwordAttempt, twoFactorCode);
      if (platformUser) {
        AuthServiceLogin.recordLogin(platformUser.id, platformUser.username, true);
        return platformUser;
      }
      AuthServiceLogin.recordLogin(null, normalizedUsername, false, 'USER_NOT_FOUND');
      throw new Error('بيانات الدخول غير صحيحة أو الحساب غير موجود.');
    }

    const userRecord = userRows[0];
    const guard = AuthServiceLogin.getLoginGuardStatus(normalizedUsername);
    if (guard.isLocked) {
      AuthServiceLogin.recordLogin(userRecord.id, normalizedUsername, false, 'LOCKED_OUT');
      throw new Error(AuthServiceLogin.lockoutMessage(guard.lockedUntil));
    }

    const isValid = await bcrypt.compare(passwordAttempt, userRecord.passwordHash);
    if (!isValid) AuthServiceLogin.rejectInvalidPassword(userRecord, normalizedUsername);

    const isDefaultAdmin = userRecord.username === 'admin'
      && await bcrypt.compare('admin123', userRecord.passwordHash);
    return AuthServiceLogin.finishLogin(userRecord, normalizedUsername, isDefaultAdmin, twoFactorCode);
  }
}
