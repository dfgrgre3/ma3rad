import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { identityLinkService } from './IdentityLinkService';

/**
 * One-time secure bootstrap for the platform owner account.
 *
 * Security model
 * --------------
 * - No default password is ever shipped. The operator must invoke this
 *   explicitly with a strong password before the platform can be used.
 * - The owner role (SUPER_ADMIN) is a *root* privilege: it short-circuits every
 *   granular permission check, therefore it may only be created through this
 *   service — never through the normal staff-management screens.
 * - The bootstrap is idempotent-safe: once an owner exists the operation is
 *   refused, so it can never be replayed to mint a second owner.
 * - Every run is written to the audit ledger.
 *
 * Two stores are involved and both are kept in sync:
 *   - `platform_staff` — the platform console identity (used by
 *     PlatformStaffAuthService and by the staff management screens).
 *   - `users`         — the ERP identity (used by AuthService.login for the
 *     regular login screen and by the ERP-side permission checks).
 */

export interface PlatformOwnerBootstrapInput {
  /** Login e-mail — also the platform staff e-mail. */
  email: string;
  /** Password, minimum 12 characters with mixed classes. */
  password: string;
  /** Optional ERP login name; defaults to the e-mail local part. */
  username?: string;
  /** Optional display name; defaults to "مالك المنصة". */
  fullName?: string;
  /** Optional contact phone. */
  phone?: string;
}

export interface PlatformOwnerBootstrapResult {
  /** The platform_staff id of the owner. */
  staffId: string;
  /** The users id of the owner. */
  userId: string;
  /** The ERP login name. */
  username: string;
  email: string;
  /** True when the seeded placeholder owner row was claimed. */
  claimedSeededRow: boolean;
}

export interface PlatformOwnerAuditEntry {
  /** 'platform_staff' | 'users' */
  source: 'platform_staff' | 'users';
  id: string;
  label: string;
  isActive: boolean;
  hasPassword: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  /**
   * True when the account was created by this bootstrap service (approved
   * owner). False means the account claims the owner role without a traceable
   * origin — it must be reviewed and deactivated.
   */
  approved: boolean;
  /** Reason the account is considered unapproved. */
  concerns: string[];
}

const MIN_PASSWORD_LENGTH = 12;

/** Ids created by this service — the allow-list of "approved" owner accounts. */
const APPROVED_STAFF_ID_PREFIX = 'staff_owner_';
const APPROVED_USER_ID_PREFIX = 'usr_platform_';

export class PlatformBootstrapService {
  private readonly db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * True when a *usable* platform owner already exists — in either identity
   * store. Placeholder rows (e.g. the seeded `staff_super_admin` row without a
   * password) do not count: they cannot sign in, so the owner initialization
   * must still be possible.
   */
  public isBootstrapped(): boolean {
    const staffOwners = this.db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM platform_staff
       WHERE role = 'SUPER_ADMIN'
         AND (deleted_at IS NULL OR deleted_at = '')
         AND is_active = 1
         AND password_hash IS NOT NULL AND password_hash <> ''`
    )[0];
    if (staffOwners && Number(staffOwners.c) > 0) return true;

    const userOwners = this.db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM users
       WHERE role = 'SUPER_ADMIN' AND is_active = 1
         AND password_hash IS NOT NULL AND password_hash <> ''`
    )[0];
    return Boolean(userOwners && Number(userOwners.c) > 0);
  }

  /**
   * List every account that claims the owner role, flagging the ones that were
   * not created by this service (i.e. unapproved / to be reviewed).
   */
  public auditOwnerAccounts(): PlatformOwnerAuditEntry[] {
    const entries: PlatformOwnerAuditEntry[] = [];

    const staffRows = this.db.query<any>(
      `SELECT id, full_name, email, password_hash, is_active, created_at, last_login_at, deleted_at
       FROM platform_staff
       WHERE role = 'SUPER_ADMIN'`
    );
    for (const row of staffRows) {
      const concerns: string[] = [];
      const id = String(row.id);
      const deleted = Boolean(row.deleted_at);
      if (deleted) concerns.push('محذوف منطقيًا');
      if (!row.password_hash) concerns.push('لا يحتوي على كلمة مرور — لا يمكن تسجيل الدخول');
      if (!row.is_active) concerns.push('غير مفعّل');
      const approved = id.startsWith(APPROVED_STAFF_ID_PREFIX) || id === 'staff_super_admin';
      if (!approved) concerns.push('غير معتمد — لم يُنشأ عبر إجراء تهيئة المالك');
      entries.push({
        source: 'platform_staff',
        id,
        label: String(row.email || row.full_name || id),
        isActive: Boolean(row.is_active) && !deleted,
        hasPassword: Boolean(row.password_hash),
        createdAt: row.created_at ? String(row.created_at) : null,
        lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
        approved,
        concerns,
      });
    }

    const userRows = this.db.query<any>(
      `SELECT id, username, password_hash, full_name, is_active, created_at FROM users WHERE role = 'SUPER_ADMIN'`
    );
    for (const row of userRows) {
      const concerns: string[] = [];
      const id = String(row.id);
      if (!row.password_hash) concerns.push('لا يحتوي على كلمة مرور — لا يمكن تسجيل الدخول');
      if (!row.is_active) concerns.push('غير مفعّل');
      const approved = id.startsWith(APPROVED_USER_ID_PREFIX);
      if (!approved) concerns.push('غير معتمد — لم يُنشأ عبر إجراء تهيئة المالك');
      entries.push({
        source: 'users',
        id,
        label: String(row.username || row.full_name || id),
        isActive: Boolean(row.is_active),
        hasPassword: Boolean(row.password_hash),
        createdAt: row.created_at ? String(row.created_at) : null,
        lastLoginAt: null,
        approved,
        concerns,
      });
    }

    return entries;
  }

  /**
   * Create the single platform owner account.
   * Throws when an owner already exists or when the input is not secure.
   */
  public bootstrap(input: PlatformOwnerBootstrapInput): PlatformOwnerBootstrapResult {
    if (this.isBootstrapped()) {
      throw new Error('مالك المنصة مُهيأ بالفعل. لا يمكن تهيئة حساب ثانٍ.');
    }

    const email = String(input.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('البريد الإلكتروني لمالك المنصة غير صالح.');
    }

    const password = String(input.password || '');
    PlatformBootstrapService.assertStrongPassword(password);

    const fullName = String(input.fullName || '').trim() || 'مالك المنصة';
    const username = (String(input.username || '').trim() || email.split('@')[0]).toLowerCase();
    const phone = String(input.phone || '').trim() || null;

    const existingUsername = this.db.query<any>(
      'SELECT id FROM users WHERE lower(username) = ? LIMIT 1',
      [username]
    )[0];
    if (existingUsername) {
      throw new Error('اسم المستخدم محجوز بالفعل. اختر اسمًا آخر لمالك المنصة.');
    }

    const hash = bcrypt.hashSync(password, 12);
    const now = new Date().toISOString();
    const userId = `usr_platform_${uuidv4().replace(/-/g, '').slice(0, 8)}`;

    // The seeded placeholder owner row ("staff_super_admin") is claimed instead
    // of creating a second owner row, so the staff list never shows two owners.
    const seeded = this.db.query<any>(
      `SELECT id FROM platform_staff
       WHERE id = 'staff_super_admin' AND (password_hash IS NULL OR password_hash = '')
       LIMIT 1`
    )[0];
    const staffId = seeded ? String(seeded.id) : `${APPROVED_STAFF_ID_PREFIX}${uuidv4().replace(/-/g, '').slice(0, 8)}`;

    this.db.executeTransaction((db) => {
      if (seeded) {
        db.run(
          `UPDATE platform_staff
           SET full_name = ?, email = ?, phone = ?, role = 'SUPER_ADMIN', password_hash = ?,
               permissions_override = NULL, is_active = 1, must_change_password = 0,
               failed_login_attempts = 0, locked_until = NULL, deleted_at = NULL, updated_at = ?
           WHERE id = ?`,
          [fullName, email, phone, hash, now, staffId]
        );
      } else {
        db.run(
          `INSERT INTO platform_staff
            (id, full_name, email, phone, role, password_hash, permissions_override, is_active,
             must_change_password, failed_login_attempts, locked_until, deleted_at, data_scope, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'SUPER_ADMIN', ?, NULL, 1, 0, 0, NULL, NULL, 'ALL', ?, ?)`,
          [staffId, fullName, email, phone, hash, now, now]
        );
      }

      db.run(
        `INSERT INTO users
           (id, username, password_hash, full_name, role, phone, pin_code, is_active, branch_id, branch_scope)
         VALUES (?, ?, ?, ?, 'SUPER_ADMIN', ?, NULL, 1, NULL, 'ALL')`,
        [userId, username, hash, fullName, phone]
      );

      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id)
         VALUES (?, ?, ?, ?, 'PLATFORM', ?)`,
        [`aud_${uuidv4().replace(/-/g, '').slice(0, 8)}`, userId, fullName, 'تهيئة حساب مالك المنصة', staffId]
      );
    });

    identityLinkService.link({ platformStaffId: staffId, erpUserId: userId, linkType: 'PLATFORM_OWNER' });
    return { staffId, userId, username, email, claimedSeededRow: Boolean(seeded) };
  }

  /** Reject weak owner passwords (length + character classes). */
  private static assertStrongPassword(password: string): void {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} حرفًا على الأقل.`);
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      throw new Error('كلمة المرور يجب أن تحتوي على حرف صغير وحرف كبير ورقم على الأقل.');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      throw new Error('كلمة المرور يجب أن تحتوي على رمز خاص على الأقل.');
    }
  }
}
