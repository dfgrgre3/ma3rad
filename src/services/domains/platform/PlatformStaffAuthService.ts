import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { authSession } from '../auth/session';
import { platformStaffTwoFactorAuth } from '../auth/twoFactorAuth';
import type { User } from '../../../types';

const STAFF_LOCKOUT_MINUTES = 15;
const STAFF_MAX_FAILED_ATTEMPTS = 5;

function nowIso() {
  return new Date().toISOString();
}

/**
 * Lightweight device fingerprint (not a credential — used only to flag
 * "remembered/trusted" devices for this staff member).
 */
export function computePlatformDeviceFingerprint(): string | null {
  try {
    if (typeof window === 'undefined' || !window.navigator) return null;
    const nav = window.navigator as Navigator & { deviceMemory?: number };
    const raw = [
      nav.userAgent ?? '',
      nav.language ?? '',
      (nav as unknown as { platform?: string }).platform ?? '',
      String(nav.hardwareConcurrency ?? ''),
      String(nav.deviceMemory ?? ''),
    ].join('|');
    if (!raw.trim()) return null;
    let hash = 0x811c9dc5;
    for (let i = 0; i < raw.length; i += 1) {
      hash ^= raw.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return `dev_${hash.toString(16).padStart(8, '0')}`;
  } catch {
    return null;
  }
}

export function platformDeviceName(): string | null {
  try {
    if (typeof window === 'undefined' || !window.navigator) return null;
    const ua = window.navigator.userAgent || '';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad|iOS/i.test(ua)) return 'iOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return ua.slice(0, 64) || null;
  } catch {
    return null;
  }
}

export class PlatformStaffAuthService {
  static readonly SESSION_KEY = 'ceramisys_platform_staff_session_id';

  static getCurrentSessionId(): string | null {
    try {
      return localStorage.getItem(PlatformStaffAuthService.SESSION_KEY);
    } catch {
      return null;
    }
  }

  static getCurrentPermissionsOverride(): string[] {
    const sessionId = PlatformStaffAuthService.getCurrentSessionId();
    const user = authSession.getCurrentUser();
    if (!sessionId || !user) return [];

    try {
      const db = DatabaseManager.getInstance();
      const row = db.query<any>(
        `SELECT s.staff_id AS staffId, s.is_current AS isCurrent, s.expires_at AS expiresAt, st.permissions_override AS permissionsOverride, st.is_active AS isActive
         FROM platform_staff_sessions s
         JOIN platform_staff st ON st.id = s.staff_id
         WHERE s.id = ?
         LIMIT 1`,
        [sessionId]
      )[0];
      if (!row) return [];
      const expired = row.expiresAt && new Date(String(row.expiresAt)).getTime() < Date.now();
      if (!row.isActive || !row.isCurrent || expired || String(row.staffId) !== String(user.id)) {
        if (expired || !row.isActive || !row.isCurrent) {
          try {
            db.run(`UPDATE platform_staff_sessions SET is_current = 0, last_activity_at = ? WHERE id = ?`, [nowIso(), sessionId]);
          } catch {
            // ignore
          }
        }
        return [];
      }
      const raw = row.permissionsOverride;
      if (!raw) return [];
      try {
        const parsed = JSON.parse(String(raw));
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    } catch {
      return [];
    }
  }

  static touchCurrentSession(): void {
    const sessionId = PlatformStaffAuthService.getCurrentSessionId();
    if (!sessionId) return;
    try {
      const db = DatabaseManager.getInstance();
      const row = db.query<any>(
        `SELECT s.is_current AS isCurrent, s.expires_at AS expiresAt, st.is_active AS staffActive
         FROM platform_staff_sessions s
         JOIN platform_staff st ON st.id = s.staff_id
         WHERE s.id = ? LIMIT 1`,
        [sessionId]
      )[0];
      if (!row) return;
      const expired = row.expiresAt && new Date(String(row.expiresAt)).getTime() < Date.now();
      if (!row.isCurrent || !row.staffActive || expired) {
        db.run(`UPDATE platform_staff_sessions SET is_current = 0, last_activity_at = ? WHERE id = ?`, [nowIso(), sessionId]);
        return;
      }
      db.run(
        `UPDATE platform_staff_sessions
         SET last_activity_at = ?
         WHERE id = ? AND is_current = 1`,
        [nowIso(), sessionId]
      );
    } catch {
      // ignore
    }
  }

  /** Mark the current device as trusted for this staff member (and flag the live session). */
  static trustCurrentDevice(deviceName?: string): void {
    const user = authSession.getCurrentUser();
    const fingerprint = computePlatformDeviceFingerprint();
    const sessionId = PlatformStaffAuthService.getCurrentSessionId();
    if (!user || !fingerprint) {
      throw new Error('تعذر التعرف على الجهاز الحالي لتوثيقه.');
    }
    const db = DatabaseManager.getInstance();
    const name = (deviceName || platformDeviceName() || 'جهاز غير مسمى').slice(0, 80);
    const id = `tdev_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    const now = nowIso();
    db.run(
      `INSERT INTO platform_trusted_devices (id, staff_id, device_name, fingerprint, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(staff_id, fingerprint) DO UPDATE SET revoked_at = NULL, device_name = excluded.device_name, last_seen_at = excluded.last_seen_at`,
      [id, user.id, name, fingerprint, now, now]
    );
    if (sessionId) {
      try {
        db.run('UPDATE platform_staff_sessions SET is_trusted_device = 1 WHERE id = ?', [sessionId]);
      } catch {
        // ignore
      }
    }
  }

  /** True when the current device is trusted for this staff member. */
  static isCurrentDeviceTrusted(): boolean {
    const user = authSession.getCurrentUser();
    const fingerprint = computePlatformDeviceFingerprint();
    if (!user || !fingerprint) return false;
    try {
      const db = DatabaseManager.getInstance();
      const row = db.query<any>(
        'SELECT id FROM platform_trusted_devices WHERE staff_id = ? AND fingerprint = ? AND revoked_at IS NULL LIMIT 1',
        [user.id, fingerprint]
      )[0];
      return Boolean(row);
    } catch {
      return false;
    }
  }

  static endCurrentSession(): void {
    const sessionId = PlatformStaffAuthService.getCurrentSessionId();
    if (sessionId) {
      try {
        const db = DatabaseManager.getInstance();
        db.run(
          `UPDATE platform_staff_sessions
           SET is_current = 0, last_activity_at = ?
           WHERE id = ?`,
          [nowIso(), sessionId]
        );
      } catch {
        // ignore
      }
    }
    try {
      localStorage.removeItem(PlatformStaffAuthService.SESSION_KEY);
    } catch {
      // ignore
    }
  }

  static revokeSessionsForStaff(staffId: string): void {
    if (!staffId) return;
    try {
      const db = DatabaseManager.getInstance();
      db.run(
        `UPDATE platform_staff_sessions
         SET is_current = 0, last_activity_at = ?
         WHERE staff_id = ? AND is_current = 1`,
        [nowIso(), staffId]
      );
    } catch {
      // ignore
    }
  }

  static revokeAllSessions(): void {
    try {
      const db = DatabaseManager.getInstance();
      db.run(
        `UPDATE platform_staff_sessions
         SET is_current = 0, last_activity_at = ?
         WHERE is_current = 1`,
        [nowIso()]
      );
    } catch {
      // ignore
    }
  }

  static async login(email: string, passwordAttempt: string, twoFactorCode?: string): Promise<User | null> {
    const db = DatabaseManager.getInstance();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !passwordAttempt) return null;

    const staff = db.query<any>(
      `SELECT id, full_name, email, phone, role, password_hash, is_active, failed_login_attempts, locked_until, must_change_password, created_at, updated_at
       FROM platform_staff
       WHERE lower(email) = ?
         AND (deleted_at IS NULL OR deleted_at = '')
       LIMIT 1`,
      [normalizedEmail]
    )[0];

    // Do not reveal whether a platform staff account exists from non-email ERP login attempts.
    if (!staff) return null;

    const staffId = String(staff.id);
    const ipAddress = null;
    const userAgent = null;
    const auditEmail = String(staff.email || normalizedEmail);

    if (!staff.isActive) {
      PlatformStaffAuthService.recordLogin(db, { staffId, email: auditEmail, ipAddress, userAgent, status: 'BLOCKED', failureReason: 'INACTIVE' });
      throw new Error('حساب موظف المنصة غير مفعّل.');
    }

    if (!staff.passwordHash) {
      PlatformStaffAuthService.recordLogin(db, { staffId, email: auditEmail, ipAddress, userAgent, status: 'BLOCKED', failureReason: 'NO_PASSWORD' });
      throw new Error('حساب موظف المنصة لا يملك كلمة مرور صالحة. يرجى إعادة تعيينها من مالك المنصة.');
    }

    const lockedUntil = staff.lockedUntil ? new Date(String(staff.lockedUntil)).getTime() : 0;
    if (lockedUntil > Date.now()) {
      PlatformStaffAuthService.recordLogin(db, { staffId, email: auditEmail, ipAddress, userAgent, status: 'BLOCKED', failureReason: 'LOCKED_OUT' });
      const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
      throw new Error(`تم إيقاف محاولات الدخول مؤقتًا لحساب موظف المنصة. حاول مجددًا بعد ${minutes} دقيقة.`);
    }

    const valid = await bcrypt.compare(passwordAttempt, String(staff.passwordHash));
    if (!valid) {
      const failed = Number(staff.failedLoginAttempts || 0) + 1;
      const shouldLock = failed >= STAFF_MAX_FAILED_ATTEMPTS;
      const nextLockedUntil = shouldLock ? new Date(Date.now() + STAFF_LOCKOUT_MINUTES * 60000).toISOString() : null;
      db.run(
        `UPDATE platform_staff SET failed_login_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?`,
        [shouldLock ? 0 : failed, nextLockedUntil, nowIso(), staffId]
      );
      PlatformStaffAuthService.recordLogin(db, {
        staffId,
        email: auditEmail,
        ipAddress,
        userAgent,
        status: shouldLock ? 'BLOCKED' : 'FAILED',
        failureReason: shouldLock ? 'LOCKED_OUT' : 'WRONG_PASSWORD',
      });
      if (shouldLock) {
        throw new Error(`تم إيقاف محاولات الدخول مؤقتًا لحساب موظف المنصة. حاول مجددًا بعد ${STAFF_LOCKOUT_MINUTES} دقيقة.`);
      }
      const remaining = STAFF_MAX_FAILED_ATTEMPTS - failed;
      throw new Error(`بيانات الدخول غير صحيحة. المحاولات المتبقية قبل الإيقاف المؤقت: ${remaining}.`);
    }

    // Second factor — checked only after the password succeeds so a missing or
    // wrong code never reveals whether the account exists.
    if (platformStaffTwoFactorAuth.isEnabled(staffId)) {
      const code = String(twoFactorCode ?? '').replace(/\s+/g, '');
      if (!code) {
        PlatformStaffAuthService.recordLogin(db, { staffId, email: auditEmail, ipAddress, userAgent, status: 'BLOCKED', failureReason: 'TWO_FACTOR_REQUIRED' });
        const challenge = new Error('التحقق الثنائي مطلوب لهذا الحساب. أدخل رمز التطبيق أو رمز الاسترداد.');
        (challenge as Error & { code?: string }).code = 'TWO_FACTOR_REQUIRED';
        throw challenge;
      }
      if (!platformStaffTwoFactorAuth.verifyLoginCodeSync(staffId, code)) {
        PlatformStaffAuthService.recordLogin(db, { staffId, email: auditEmail, ipAddress, userAgent, status: 'FAILED', failureReason: 'TWO_FACTOR_FAILED' });
        throw new Error('رمز التحقق الثنائي غير صحيح. حاول مرة أخرى أو استخدم رمز الاسترداد.');
      }
    }

    const now = nowIso();
    db.run(
      `UPDATE platform_staff
       SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
       WHERE id = ?`,
      [now, now, staffId]
    );

    // Trusted devices — a remembered device (staff chose "trust this device")
    // gets its session flagged so the security center can report them.
    const fingerprint = computePlatformDeviceFingerprint();
    let isTrustedDevice = 0;
    if (fingerprint) {
      try {
        const trusted = db.query<any>(
          'SELECT id FROM platform_trusted_devices WHERE staff_id = ? AND fingerprint = ? AND revoked_at IS NULL LIMIT 1',
          [staffId, fingerprint]
        )[0];
        if (trusted) {
          isTrustedDevice = 1;
          db.run('UPDATE platform_trusted_devices SET last_seen_at = ? WHERE id = ?', [now, trusted.id]);
        }
      } catch {
        // pre-migration schema — ignore
      }
    }

    const sessionId = `psess_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    db.run(
      `INSERT INTO platform_staff_sessions
        (id, staff_id, staff_name, staff_role, ip_address, device_name, is_trusted_device, is_current, expires_at, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        sessionId,
        staffId,
        String(staff.fullName || ''),
        String(staff.role || ''),
        ipAddress,
        platformDeviceName(),
        isTrustedDevice,
        new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        now,
        now,
      ]
    );

    PlatformStaffAuthService.recordLogin(db, { staffId, email: auditEmail, ipAddress, userAgent, status: 'SUCCESS' });

    const user: User = {
      id: staffId,
      username: auditEmail,
      fullName: String(staff.fullName || auditEmail),
      role: String(staff.role || 'SUPPORT_AGENT') as User['role'],
      phone: staff.phone ?? undefined,
      isActive: true,
      mustChangePassword: Boolean(staff.mustChangePassword),
      createdAt: String(staff.createdAt || now),
      updatedAt: now,
    };

    // Persist staff session marker for platform-aware flows.
    try {
      localStorage.setItem('ceramisys_platform_staff_session_id', sessionId);
    } catch {
      // ignore
    }

    authSession.setCurrentUser(user);
    return user;
  }

  private static recordLogin(db: DatabaseManager, input: {
    staffId?: string | null;
    email: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
    failureReason?: string;
  }) {
    const id = `login_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    db.run(
      `INSERT INTO platform_staff_logins (id, staff_id, email, ip_address, user_agent, status, failure_reason, attempted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.staffId || null, input.email, input.ipAddress || null, input.userAgent || null, input.status, input.failureReason || null, nowIso()]
    );
  }
}
