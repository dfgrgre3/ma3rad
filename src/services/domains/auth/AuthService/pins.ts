import type { User } from '../../../../types';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PermissionService } from '../PermissionService';
import { AuthServiceLogin } from './login';

/**
 * Login-PIN management group for AuthService: the user's own PIN status and
 * change requests, manager approval/rejection of pending PIN changes, admin
 * PIN recovery/regeneration, and the PIN hashing/encryption/uniqueness helpers.
 */
export class AuthServicePins extends AuthServiceLogin {
  public getOwnLoginPinStatus(): { hasPin: boolean; pending: boolean; requestedAt?: string } {
    const user = AuthServicePins.requireAuth();
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
    const user = AuthServicePins.requireAuth();
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
    const actor = AuthServicePins.requireAuth();
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
    const actor = AuthServicePins.requireAuth();
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
    const actor = AuthServicePins.requireAuth();
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

  public async getRecoverableLoginPins(): Promise<Record<string, string | null>> {
    const actor = AuthServicePins.requireAuth();
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
    const actor = AuthServicePins.requireAuth();
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

  public generateUniqueLoginPin(): string {
    const length = AuthServicePins.getLoginPinLength();
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

  protected hashPin(pin: string): string {
    const length = AuthServicePins.getLoginPinLength();
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

  protected assertUniqueActivePin(pin: string, excludeUserId?: string): void {
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
}
