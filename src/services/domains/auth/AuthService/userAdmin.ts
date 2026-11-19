import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { User, UserRole } from '../../../../types';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PermissionService } from '../PermissionService';
import { CentralUsageLimitService } from '../../licensing/CentralUsageLimitService';
import { BranchAccessService } from '../BranchAccessService';
import { AuthServicePins } from './pins';

/**
 * Admin user-management group for AuthService: listing, creation (with
 * approval gating), updates, password resets, deletion, provisioning of
 * central accounts and login-history inspection.
 */
export class AuthServiceUserAdmin extends AuthServicePins {
  public getAllUsers(): User[] {
    PermissionService.require(AuthServiceUserAdmin.requireAuth(), 'ui.users.users.view');
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
    user: { username: string; password: string; fullName: string; role: UserRole; phone?: string; pinCode?: string; pinCiphertext?: string },
    performedBy = 'usr_admin',
    actor?: User | null,
    options?: { approvalId?: string }
  ): User {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'ui.users.users.create');
    AuthServiceUserAdmin.assertSetupCompleted(this.db);
    if (user.pinCode && subject.role !== 'ADMIN') {
      throw new Error('تعيين رمز الدخول متاح لمدير النظام فقط.');
    }
    AuthServiceUserAdmin.validatePasswordPolicy(user.password, user.username);
    CentralUsageLimitService.assertWithin('maxUsers');

    if (user.role === 'SUPER_ADMIN') {
      throw new Error('لا يمكن إنشاء مستخدم بدور مالك المنصة (SUPER_ADMIN) من إدارة المستخدمين.');
    }

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

    // Approval must never carry the password, PIN hash or PIN ciphertext.
    const { gate, approvalId } = this.prepareOperationApproval(
      'users.create',
      `إنشاء مستخدم ${user.username}`,
      `الدور: ${user.role}`,
      { username: user.username },
      `create:user:${user.username}`,
      options,
    );

    const id = `usr_${uuidv4().substring(0, 8)}`;
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(user.password, salt);
    const branchId = new BranchAccessService().getDefaultAccessibleBranchId(subject);

    this.db.executeTransaction((db) => {
      db.run(`
        INSERT INTO users (id, username, password_hash, full_name, role, phone, pin_code, pin_ciphertext, is_active, branch_id, branch_scope)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'ASSIGNED')
      `, [id, user.username, hash, user.fullName, user.role, user.phone || null, pinHash, user.pinCiphertext || null, branchId]);
      if (approvalId) gate.consume(approvalId, 'USER', id, db);
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
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
    return requiredRole.includes(user.role);
  }

  // ─── Admin user management ──────────────────────────────────────────────────

  public getUserById(id: string): User | null {
    PermissionService.require(AuthServiceUserAdmin.requireAuth(), 'ui.users.users.view');
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
    actor?: User | null,
    options?: { approvalId?: string }
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
    if (patch.role === 'SUPER_ADMIN' && existing.role !== 'SUPER_ADMIN') {
      throw new Error('لا يمكن ترقية أي مستخدم إلى دور مالك المنصة (SUPER_ADMIN) من إدارة المستخدمين.');
    }
    // Secrets are deliberately excluded from the approval payload and match key.
    const changedFields = Object.keys(patch)
      .filter((key) => key !== 'pinCode' && key !== 'pinCiphertext' && (patch as Record<string, unknown>)[key] !== undefined)
      .sort();
    const { gate, approvalId } = this.prepareOperationApproval(
      'users.update',
      `تعديل مستخدم ${existing.username}`,
      `الحقول المعدّلة: ${changedFields.join(', ') || 'بدون تغييرات'}`,
      { userId: id, fields: changedFields },
      `update:user:${id}:${changedFields.join(',')}`,
      options,
    );
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

    this.db.executeTransaction((db) => {
      db.run(
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
      if (approvalId) gate.consume(approvalId, 'USER', id, db);
    });
    this.audit(subject, 'تعديل بيانات مستخدم', 'USERS', id, existing, patch);
    PermissionService.invalidate(existing);
    return this.getUserRecordById(id)!.user;
  }

  public resetPassword(id: string, newPassword: string, actor?: User | null): void {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'ui.users.users.reset_password');
    const existing = this.getUserRecordById(id)?.user;
    if (!existing) throw new Error('المستخدم غير موجود.');
    AuthServiceUserAdmin.validatePasswordPolicy(newPassword, existing.username);
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

  public deleteUser(id: string, actor?: User | null, options?: { approvalId?: string }): void {
    const subject = this.requireActor(actor);
    PermissionService.require(subject, 'ui.users.users.delete');
    if (id === subject.id) throw new Error('لا يمكنك حذف حسابك الحالي.');
    const existing = this.getUserRecordById(id)?.user;
    if (!existing) throw new Error('المستخدم غير موجود.');
    if (existing.id === 'usr_admin' || existing.username === 'admin') {
      throw new Error('لا يمكن حذف حساب المدير الأساسي.');
    }
    const { gate, approvalId } = this.prepareOperationApproval(
      'users.delete',
      `حذف مستخدم ${existing.username}`,
      `معرف المستخدم: ${id}`,
      { userId: id },
      `delete:user:${id}`,
      options,
    );
    this.db.executeTransaction((db) => {
      if (approvalId) gate.consume(approvalId, 'USER', id, db);
      this.db.run('DELETE FROM user_permissions WHERE user_id = ?', [id]);
      this.db.run('DELETE FROM users WHERE id = ?', [id]);
    });
    this.audit(subject, 'حذف مستخدم', 'USERS', id, existing, null);
    PermissionService.invalidate(existing);
  }

  public getLoginHistory(userId?: string, limit = 100): any[] {
    PermissionService.require(AuthServiceUserAdmin.requireAuth(), 'ui.users.users.view');
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
}
