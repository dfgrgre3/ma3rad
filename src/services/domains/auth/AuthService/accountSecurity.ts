import type { User } from '../../../../types';
import bcrypt from 'bcryptjs';
import { AuthServiceUserAdmin } from './userAdmin';

/**
 * Self-service account-security group for AuthService: changing one's own
 * password (sync/async), enrolling a security key and completing the
 * first-run admin setup.
 */
export class AuthServiceAccountSecurity extends AuthServiceUserAdmin {
  public changeOwnPassword(userId: string, currentPassword: string, newPassword: string): void {
    const currentUser = AuthServiceAccountSecurity.requireSetupAuth();
    if (currentUser.id !== userId) {
      throw new Error('يمكنك تغيير كلمة مرور حسابك الحالي فقط.');
    }
    const row = this.db.query<any>('SELECT password_hash FROM users WHERE id = ?', [currentUser.id])[0];
    if (!row) throw new Error('المستخدم غير موجود.');
    if (!bcrypt.compareSync(currentPassword, row.passwordHash)) {
      throw new Error('كلمة المرور الحالية غير صحيحة.');
    }
    AuthServiceAccountSecurity.validatePasswordPolicy(newPassword, currentUser.username);
    this.db.executeTransaction(() => {
      this.db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
        bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10)),
        new Date().toISOString(),
        currentUser.id,
      ]);
      // Invalidate all other active sessions for this user
      const currentSes = AuthServiceAccountSecurity.currentSessionId || '';
      this.db.run(
        `UPDATE user_sessions SET is_active = 0, ended_at = ?, end_reason = 'REVOKED'
         WHERE user_id = ? AND id != ? AND is_active = 1`,
        [new Date().toISOString(), currentUser.id, currentSes]
      );
    });
    currentUser.mustChangePassword = false;
  }

  public async changeOwnPasswordAsync(
    userId: string,
    currentPassword: string,
    newPassword: string,
    fullName?: string,
    deferForcedSetupCompletion = false
  ): Promise<void> {
    const currentUser = AuthServiceAccountSecurity.requireSetupAuth();
    if (currentUser.id !== userId) {
      throw new Error('يمكنك تغيير كلمة مرور حسابك الحالي فقط.');
    }
    const updatedFullName = fullName?.trim();
    if (updatedFullName !== undefined && (updatedFullName.length < 2 || updatedFullName.length > 100)) {
      throw new Error('يجب أن يتكون الاسم المعروض من حرفين إلى 100 حرف.');
    }
    const row = this.db.query<any>('SELECT password_hash FROM users WHERE id = ?', [currentUser.id])[0];
    if (!row) throw new Error('المستخدم غير موجود.');
    const isCurrentValid = await bcrypt.compare(currentPassword, row.passwordHash);
    if (!isCurrentValid) {
      throw new Error('كلمة المرور الحالية غير صحيحة.');
    }
    AuthServiceAccountSecurity.validatePasswordPolicy(newPassword, currentUser.username);
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    this.db.executeTransaction(() => {
      this.db.run('UPDATE users SET password_hash = ?, full_name = ?, updated_at = ? WHERE id = ?', [
        hash,
        updatedFullName ?? currentUser.fullName,
        new Date().toISOString(),
        currentUser.id,
      ]);
      // Invalidate all other active sessions for this user
      const currentSes = AuthServiceAccountSecurity.currentSessionId || '';
      this.db.run(
        `UPDATE user_sessions SET is_active = 0, ended_at = ?, end_reason = 'REVOKED'
         WHERE user_id = ? AND id != ? AND is_active = 1`,
        [new Date().toISOString(), currentUser.id, currentSes]
      );
    });
    if (updatedFullName !== undefined) currentUser.fullName = updatedFullName;
    if (deferForcedSetupCompletion) {
      currentUser.securityKeySetupRequired = true;
    } else {
      currentUser.mustChangePassword = false;
    }
  }

  public async setOwnSecurityKeyAsync(userId: string, securityKey: string): Promise<void> {
    const currentUser = AuthServiceAccountSecurity.requireSetupAuth();
    if (currentUser.id !== userId) {
      throw new Error('يمكنك إنشاء مفتاح الأمان لحسابك الحالي فقط.');
    }
    const normalizedKey = securityKey.trim();
    if (normalizedKey.length < 8 || normalizedKey.length > 12) {
      throw new Error('يجب أن يتكون مفتاح الأمان من 8 إلى 12 حرفًا.');
    }

    const user = this.db.query<{ username: string; isActive: number; passwordHash: string }>(
      `SELECT username, is_active AS isActive, password_hash AS passwordHash
       FROM users WHERE id = ?`,
      [currentUser.id]
    )[0];
    if (!user || !user.isActive) throw new Error('حساب المستخدم غير موجود أو غير نشط.');
    if (user.username === 'admin' && await bcrypt.compare('admin123', user.passwordHash)) {
      throw new Error('يجب تغيير كلمة المرور الافتراضية قبل إنشاء مفتاح الأمان.');
    }

    const securityKeyHash = await bcrypt.hash(normalizedKey, await bcrypt.genSalt(10));
    this.db.executeTransaction(() => {
      const activeKeys = this.db.query<{ userId: string; securityKeyHash: string }>(
        `SELECT id AS userId, security_key_hash AS securityKeyHash
         FROM users
         WHERE is_active = 1 AND security_key_hash IS NOT NULL AND id <> ?`,
        [currentUser.id]
      );
      if (activeKeys.some(({ securityKeyHash: existingHash }) => {
        try { return bcrypt.compareSync(normalizedKey, existingHash); } catch { return false; }
      })) {
        throw new Error('مفتاح الأمان مستخدم بالفعل من حساب نشط آخر.');
      }
      this.db.run(
        'UPDATE users SET security_key_hash = ?, updated_at = ? WHERE id = ? AND is_active = 1',
        [securityKeyHash, new Date().toISOString(), currentUser.id]
      );
    });
    this.audit(currentUser, 'إنشاء مفتاح الأمان', 'USERS', currentUser.id, null, { configured: true });
    currentUser.securityKeySetupRequired = false;
  }

  public completeFirstRunAdminSetup(
    userId: string,
    account: { username: string; fullName: string; phone: string; password: string }
  ): User {
    const currentUser = AuthServiceAccountSecurity.requireSetupAuth();
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
    AuthServiceAccountSecurity.validatePasswordPolicy(account.password, username);

    const updatedAt = new Date().toISOString();
    const passwordHash = bcrypt.hashSync(account.password, bcrypt.genSaltSync(10));
    this.db.executeTransaction(() => {
      this.db.run(
        `UPDATE users
         SET username = ?, full_name = ?, phone = ?, password_hash = ?, updated_at = ?
         WHERE id = ?`,
        [username, fullName, phone || null, passwordHash, updatedAt, userId]
      );
      const currentSessionId = AuthServiceAccountSecurity.currentSessionId || '';
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
      securityKeySetupRequired: true,
      updatedAt,
    };
  }
}
