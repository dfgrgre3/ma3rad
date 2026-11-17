import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService, PLATFORM_ROLE_DEFINITIONS, PLATFORM_PERMISSION_SECTIONS_FOR_UI as PLATFORM_PERMISSION_SECTIONS } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import {
  PlatformStaff,
  PlatformStaffInput,
  PlatformStaffRole,
  PlatformStaffRoleDefinition,
  PlatformStaffInvite,
  PlatformStaffInviteInput,
  PlatformStaffInviteCreated,
  PlatformStaffInviteStatus,
  PlatformTrustedDevice,
  PlatformStaffSession,
  PlatformStaffLogin,
  PlatformStaffDataScopeState,
  PlatformRoleMatrix,
  PlatformCentralSecurityIncident,
  PlatformSigningKey,
  PlatformCentralSecurityOverview,
} from './platformTypes';
import { nowIso, toNumber, randomToken, generateTemporaryPassword, safeJsonArray, formatDate } from './platformUtils';
import { STANDARD_ACTION_LABELS } from './platformPermissionCatalog';

const PLATFORM_ROLE_CODES_SET: ReadonlySet<string> = new Set([
  'SUPER_ADMIN',
  'PLATFORM_ADMIN',
  'SUPPORT_AGENT',
  'OPERATIONS_ENGINEER',
  'BILLING_SPECIALIST',
  'LICENSE_MANAGER',
]);

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

export class PlatformStaffService {
  private db = DatabaseManager.getInstance();

  private static requirePlatformAccess(modules: string | string[], action?: string) {
    const user = AuthService.getCurrentUser();
    if (!user || !user.isActive) {
      throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    }

    if (user.role === 'SUPER_ADMIN') {
      return user;
    }

    const allowedRoles = new Set(['PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER']);
    if (!allowedRoles.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لمستخدمي المنصة المصرح لهم فقط.');
    }

    const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
    const required = Array.isArray(modules) ? modules : [modules];
    const permitted = required.some((moduleKey) => {
      if (action && action.startsWith('platform.')) {
        return PlatformAuthorizationService.canAccessPermission(user.role, action, permissionsOverride);
      }
      return PlatformAuthorizationService.canAccessModule(user.role, moduleKey, permissionsOverride)
        && (!action || PlatformAuthorizationService.canAccessModule(user.role, action, permissionsOverride));
    });

    if (!permitted) {
      throw new Error('لا تملك صلاحية تنفيذ هذه العملية.');
    }

    return user;
  }

  private static assertOwnerRoleGrant(role: string, options: { creating?: boolean } = {}): void {
    if (String(role) !== 'SUPER_ADMIN') return;

    const actor = AuthService.getCurrentUser();
    if (!actor || actor.role !== 'SUPER_ADMIN') {
      throw new Error('منح دور مالك المنصة متاح لمالك المنصة فقط.');
    }

    if (options.creating) {
      const db = DatabaseManager.getInstance();
      const existing = db.query<any>(
        `SELECT id, full_name FROM platform_staff
         WHERE role = 'SUPER_ADMIN'
           AND (deleted_at IS NULL OR deleted_at = '')
           AND password_hash IS NOT NULL AND password_hash <> ''
         LIMIT 1`
      )[0];
      if (existing) {
        throw new Error('يوجد حساب مالك منصة بالفعل. لا يمكن إنشاء حساب ثانٍ بدور مالك المنصة.');
      }
    }
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    details?: unknown,
    options?: {
      severity?: import('./platformTypes').AuditSeverity;
      status?: import('./platformTypes').AuditStatus;
      actorType?: import('./platformTypes').AuditActorType;
      tenantId?: string | null;
      deviceId?: string | null;
      deviceName?: string | null;
      ipAddress?: string | null;
      oldValues?: unknown;
      newValues?: unknown;
      errorMessage?: string | null;
    }
  ): void {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    centralAuditService.log(actor, {
      action,
      entityType,
      entityId,
      details,
      severity: options?.severity,
      status: options?.status,
      actorType: options?.actorType,
      tenantId: options?.tenantId,
      deviceId: options?.deviceId,
      deviceName: options?.deviceName,
      ipAddress: options?.ipAddress,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      errorMessage: options?.errorMessage,
    });
  }

  // ─── Staff Roles ──────────────────────────────────────────────────────────────

  public listPlatformStaffRoles(): PlatformStaffRoleDefinition[] {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.view');
    return Object.values(PLATFORM_ROLE_DEFINITIONS);
  }

  // ─── Staff Management ─────────────────────────────────────────────────────────

  public listPlatformStaff(search = '', role = '', includeDeleted = false): PlatformStaff[] {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.view');

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (!includeDeleted) {
      where.push('(deleted_at IS NULL OR deleted_at = \'\')');
    }
    if (search) {
      where.push('(full_name LIKE ? OR username LIKE ? OR email LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    if (role) {
      where.push('role = ?');
      params.push(role);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.db.query<any>(`SELECT * FROM platform_staff ${whereSql} ORDER BY created_at DESC`, params);
    return rows.map(this.mapStaff);
  }

  public getPlatformStaff(id: string): PlatformStaff | null {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.view');
    const row = this.db.query<any>('SELECT * FROM platform_staff WHERE id = ?', [id])[0];
    return row ? this.mapStaff(row) : null;
  }

  public createPlatformStaff(input: PlatformStaffInput): PlatformStaff {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.create');

    PlatformStaffService.assertOwnerRoleGrant(input.role, { creating: true });

    const username = input.username?.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24);
    if (!username) throw new Error('اسم المستخدم مطلوب.');

    if (this.db.query('SELECT 1 FROM platform_staff WHERE username = ?', [username]).length) {
      throw new Error('اسم المستخدم مستخدم بالفعل.');
    }

    if (input.email && this.db.query('SELECT 1 FROM platform_staff WHERE email = ?', [input.email.trim()]).length) {
      throw new Error('البريد الإلكتروني مستخدم بالفعل.');
    }

    const temporaryPassword = input.password || generateTemporaryPassword();
    const passwordHash = bcrypt.hashSync(temporaryPassword, 10);

    const id = `stf_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_staff
        (id, username, full_name, email, phone, role, password_hash, is_active, mfa_enabled, mfa_enforcement, totp_secret, backup_codes, data_scope, data_scope_tenant_ids, last_login_at, failed_login_attempts, locked_until, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 'optional', NULL, NULL, 'ALL', NULL, NULL, 0, NULL, NULL, ?, ?)`,
      [id, username, input.fullName.trim(), input.email?.trim() ?? null, input.phone?.trim() ?? null, input.role, passwordHash, now, now]
    );

    this.audit('إنشاء موظف منصة', 'STAFF', id, { username, role: input.role });

    const staff = this.getPlatformStaff(id);
    if (!staff) throw new Error('فشل إنشاء الموظف.');
    return staff;
  }

  public updatePlatformStaff(id: string, input: Partial<PlatformStaffInput>): PlatformStaff {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.update');

    const existing = this.getPlatformStaff(id);
    if (!existing) throw new Error('الموظف غير موجود.');

    PlatformStaffService.assertOwnerRoleGrant(input.role ?? existing.role, { creating: false });

    if (input.username && input.username !== existing.username) {
      const username = input.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24);
      if (this.db.query('SELECT 1 FROM platform_staff WHERE username = ? AND id <> ?', [username, id]).length) {
        throw new Error('اسم المستخدم مستخدم بالفعل.');
      }
    }

    if (input.email && input.email !== existing.email) {
      if (this.db.query('SELECT 1 FROM platform_staff WHERE email = ? AND id <> ?', [input.email.trim(), id]).length) {
        throw new Error('البريد الإلكتروني مستخدم بالفعل.');
      }
    }

    const now = nowIso();
    this.db.run(
      `UPDATE platform_staff SET
         username = ?, full_name = ?, email = ?, phone = ?, role = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.username?.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24) ?? existing.username,
        input.fullName?.trim() ?? existing.fullName,
        input.email?.trim() ?? existing.email,
        input.phone?.trim() ?? existing.phone,
        input.role ?? existing.role,
        now, id,
      ]
    );

    this.audit('تحديث موظف منصة', 'STAFF', id, { role: input.role ?? existing.role });

    const updated = this.getPlatformStaff(id);
    if (!updated) throw new Error('فشل تحديث الموظف.');
    return updated;
  }

  public setPlatformStaffActive(id: string, isActive: boolean): PlatformStaff {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.update');

    const existing = this.getPlatformStaff(id);
    if (!existing) throw new Error('الموظف غير موجود.');

    const now = nowIso();
    this.db.run(
      'UPDATE platform_staff SET is_active = ?, updated_at = ? WHERE id = ?',
      [isActive ? 1 : 0, now, id]
    );

    this.audit(isActive ? 'تفعيل موظف منصة' : 'تعطيل موظف منصة', 'STAFF', id, {});

    const updated = this.getPlatformStaff(id);
    if (!updated) throw new Error('فشل تحديث الموظف.');
    return updated;
  }

  public deletePlatformStaff(id: string): void {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.delete');

    const existing = this.getPlatformStaff(id);
    if (!existing) throw new Error('الموظف غير موجود.');

    if (existing.role === 'SUPER_ADMIN') throw new Error('لا يمكن حذف حساب مالك المنصة.');

    const now = nowIso();
    this.db.run('UPDATE platform_staff SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);

    this.audit('حذف موظف منصة', 'STAFF', id, {});
  }

  // ─── Staff Invites ────────────────────────────────────────────────────────────

  public createStaffInvite(input: PlatformStaffInviteInput): PlatformStaffInviteCreated {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.invite');

    PlatformStaffService.assertOwnerRoleGrant(input.role, { creating: true });

    const token = randomToken(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
    const expiresAt = addDays(new Date(), 7).toISOString();

    const id = `si_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_staff_invites
        (id, token, email, full_name, role, invited_by, status, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [id, token, input.email.trim().toLowerCase(), input.fullName.trim(), input.role, AuthService.getCurrentUser()!.id, expiresAt, now, now]
    );

    this.audit('إنشاء دعوة موظف', 'STAFF_INVITE', id, { email: input.email, role: input.role });

    const invite = this.getStaffInvite(id);
    if (!invite) throw new Error('فشل إنشاء الدعوة.');

    const loginUrl = `${this.setting('platform.staffLoginUrl', 'https://admin.ceramisys.com')}/invite/${token}`;

    return { invite, token, link: loginUrl, loginUrl, temporaryPassword: generateTemporaryPassword() };
  }

  public listStaffInvites(status: 'all' | PlatformStaffInviteStatus = 'all'): PlatformStaffInvite[] {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.view');

    const where = status !== 'all' ? 'WHERE status = ?' : '';
    const params = status !== 'all' ? [status] : [];

    const rows = this.db.query<any>(`SELECT * FROM platform_staff_invites ${where} ORDER BY created_at DESC`, params);
    return rows.map(this.mapInvite);
  }

  public revokeStaffInvite(id: string): void {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.invite');

    const invite = this.getStaffInvite(id);
    if (!invite) throw new Error('الدعوة غير موجودة.');

    this.db.run('DELETE FROM platform_staff_invites WHERE id = ?', [id]);
    this.audit('إلغاء دعوة موظف', 'STAFF_INVITE', id, {});
  }

  public getStaffInviteByToken(token: string): PlatformStaffInvite {
    const row = this.db.query<any>('SELECT * FROM platform_staff_invites WHERE token = ?', [token])[0];
    if (!row) throw new Error('الدعوة غير موجودة.');
    return this.mapInvite(row);
  }

  public acceptStaffInvite(token: string, fullName: string, password: string): PlatformStaff {
    const invite = this.getStaffInviteByToken(token);
    if (!invite) throw new Error('الدعوة غير موجودة.');
    if (invite.status !== 'PENDING') throw new Error('الدعوة لم تعد صالحة.');
    if (new Date(invite.expiresAt) < new Date()) throw new Error('الدعوة منتهية الصلاحية.');

    if (password.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');

    const username = invite.email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24);
    let finalUsername = username;
    let index = 1;
    while (this.db.query('SELECT 1 FROM platform_staff WHERE username = ?', [finalUsername]).length) {
      finalUsername = `${username}${index}`;
      index++;
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const id = `stf_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.executeTransaction(() => {
      this.db.run(
        `INSERT INTO platform_staff
          (id, username, full_name, email, phone, role, password_hash, is_active, mfa_enabled, mfa_enforcement, totp_secret, backup_codes, data_scope, data_scope_tenant_ids, last_login_at, failed_login_attempts, locked_until, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, 1, 0, 'optional', NULL, NULL, 'ALL', NULL, NULL, 0, NULL, NULL, ?, ?)`,
        [id, finalUsername, fullName.trim(), invite.email, invite.role, passwordHash, now, now]
      );

      this.db.run('UPDATE platform_staff_invites SET status = \'ACCEPTED\', updated_at = ? WHERE id = ?', [now, invite.id]);
    });

    this.audit('قبول دعوة موظف', 'STAFF_INVITE', invite.id, { staffId: id });

    const staff = this.getPlatformStaff(id);
    if (!staff) throw new Error('فشل إنشاء حساب الموظف.');
    return staff;
  }

  public getStaffInvite(id: string): PlatformStaffInvite | null {
    const row = this.db.query<any>('SELECT * FROM platform_staff_invites WHERE id = ?', [id])[0];
    return row ? this.mapInvite(row) : null;
  }

  // ─── Password Management ──────────────────────────────────────────────────────

  public resetPlatformStaffPassword(id: string, newPassword: string): void {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.password');

    const existing = this.getPlatformStaff(id);
    if (!existing) throw new Error('الموظف غير موجود.');

    if (newPassword.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    const now = nowIso();

    this.db.run('UPDATE platform_staff SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?', [passwordHash, now, id]);

    this.audit('إعادة تعيين كلمة مرور موظف', 'STAFF', id, {});
  }

  public forcePlatformStaffPasswordChange(id: string, flag = true): void {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.password');

    const existing = this.getPlatformStaff(id);
    if (!existing) throw new Error('الموظف غير موجود.');

    const now = nowIso();
    this.db.run('UPDATE platform_staff SET force_password_change = ?, updated_at = ? WHERE id = ?', [flag ? 1 : 0, now, id]);

    this.audit(flag ? 'إجبار تغيير كلمة المرور' : 'إلغاء إجبار تغيير كلمة المرور', 'STAFF', id, {});
  }

  public changeOwnStaffPassword(currentPassword: string, newPassword: string, fullName?: string): void {
    const user = AuthService.getCurrentUser();
    if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
    }

    const staff = this.getPlatformStaff(user.id);
    if (!staff) throw new Error('حساب الموظف غير موجود.');

    if (!bcrypt.compareSync(currentPassword, staff.passwordHash || '')) {
      throw new Error('كلمة المرور الحالية غير صحيحة.');
    }

    if (newPassword.length < 8) throw new Error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.');

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    const now = nowIso();

    this.db.run('UPDATE platform_staff SET password_hash = ?, force_password_change = 0, updated_at = ? WHERE id = ?', [passwordHash, now, staff.id]);

    this.audit('تغيير كلمة مرور ذاتية', 'STAFF', staff.id, {});
  }

  // ─── Trusted Devices ──────────────────────────────────────────────────────────

  public listTrustedDevices(staffId?: string): PlatformTrustedDevice[] {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.devices');

    const where = staffId ? 'WHERE staff_id = ?' : '';
    const params = staffId ? [staffId] : [];

    const rows = this.db.query<any>(`SELECT * FROM platform_trusted_devices ${where} ORDER BY created_at DESC`, params);
    return rows.map(this.mapTrustedDevice);
  }

  public revokeTrustedDevice(id: string): void {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.devices');

    const row = this.db.query<any>('SELECT * FROM platform_trusted_devices WHERE id = ?', [id])[0];
    if (!row) throw new Error('الجهاز غير موجود.');

    this.db.run('DELETE FROM platform_trusted_devices WHERE id = ?', [id]);
    this.audit('إلغاء جهاز موثوق', 'TRUSTED_DEVICE', id, { staffId: row.staff_id });
  }

  public trustCurrentStaffDevice(deviceName?: string): void {
    const user = AuthService.getCurrentUser();
    if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
    }

    // This would be called from client with device fingerprint
    // For now, just a placeholder
    this.audit('إضافة جهاز موثوق', 'TRUSTED_DEVICE', null, { deviceName });
  }

  // ─── MFA Management ───────────────────────────────────────────────────────────

  public getOwnStaffMfaStatus(): { enabled: boolean; enforcement: 'off' | 'optional' | 'required' } {
    const user = AuthService.getCurrentUser();
    if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
    }

    const staff = this.getPlatformStaff(user.id);
    if (!staff) throw new Error('حساب الموظف غير موجود.');

    return { enabled: staff.mfaEnabled, enforcement: staff.mfaEnforcement };
  }

  public getStaffMfaEnforcement(): 'off' | 'optional' | 'required' {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.mfa');
    const row = this.db.query<any>('SELECT value FROM platform_settings WHERE key = ?', ['platform.staffMfaEnforcement'])[0];
    return (row?.value as 'off' | 'optional' | 'required') ?? 'optional';
  }

  public setStaffMfaEnforcement(policy: 'off' | 'optional' | 'required'): void {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.mfa');

    const now = nowIso();
    const existing = this.db.query<any>('SELECT 1 FROM platform_settings WHERE key = ?', ['platform.staffMfaEnforcement'])[0];
    if (existing) {
      this.db.run('UPDATE platform_settings SET value = ?, updated_at = ? WHERE key = ?', [policy, now, 'platform.staffMfaEnforcement']);
    } else {
      this.db.run('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)', ['platform.staffMfaEnforcement', policy, now]);
    }

    this.audit('تعيين سياسة MFA', 'STAFF_MFA', null, { policy });
  }

  public getStaffMfaCompliance(): {
    total: number;
    enabled: number;
    requiredButDisabled: number;
    byRole: Record<string, { total: number; enabled: number }>;
  } {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.view');

    const rows = this.db.query<any>(
      `SELECT role, mfa_enabled FROM platform_staff
       WHERE (deleted_at IS NULL OR deleted_at = '')`
    );

    const byRole: Record<string, { total: number; enabled: number }> = {};
    let total = 0, enabled = 0, requiredButDisabled = 0;
    const enforcement = this.getStaffMfaEnforcement();

    for (const row of rows) {
      total++;
      if (row.mfa_enabled) enabled++;

      if (!byRole[row.role]) byRole[row.role] = { total: 0, enabled: 0 };
      byRole[row.role].total++;
      if (row.mfa_enabled) byRole[row.role].enabled++;

      if (enforcement === 'required' && !row.mfa_enabled) requiredButDisabled++;
    }

    return { total, enabled, requiredButDisabled, byRole };
  }

  public startMfaEnrollmentForStaffSelf(): { secret: string; uri: string; backupCodes: string[] } {
    const user = AuthService.getCurrentUser();
    if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
    }

    const secret = randomToken(32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
    const backupCodes = Array.from({ length: 10 }, () => randomToken(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'));

    const now = nowIso();
    this.db.run(
      'UPDATE platform_staff SET totp_secret = ?, backup_codes = ?, updated_at = ? WHERE id = ?',
      [secret, JSON.stringify(backupCodes), now, user.id]
    );

    const issuer = 'Ceramisys Platform';
    const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user.username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

    this.audit('بدء تسجيل MFA', 'STAFF_MFA', user.id, {});

    return { secret, uri, backupCodes };
  }

  public async confirmMfaForStaffSelf(code: string): Promise<void> {
    const user = AuthService.getCurrentUser();
    if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
    }

    const staff = this.getPlatformStaff(user.id);
    if (!staff || !staff.totpSecret) throw new Error('لا يوجد تسجيل MFA معلق.');

    const expected = this.generateTotp(staff.totpSecret);
    if (code !== expected) {
      throw new Error('رمز التحقق غير صحيح.');
    }

    const now = nowIso();
    this.db.run('UPDATE platform_staff SET mfa_enabled = 1, updated_at = ? WHERE id = ?', [now, user.id]);

    this.audit('تأكيد MFA', 'STAFF_MFA', user.id, {});
  }

  public async disableMfaForStaffSelf(code: string): Promise<void> {
    const user = AuthService.getCurrentUser();
    if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
    }

    const staff = this.getPlatformStaff(user.id);
    if (!staff || !staff.mfaEnabled) throw new Error('MFA غير مفعل.')

    let valid = false;
    if (staff.totpSecret) {
      const expected = this.generateTotp(staff.totpSecret);
      if (code === expected) valid = true;
    }
    if (!valid && staff.backupCodes) {
      const codes = staff.backupCodes;
      const index = codes.indexOf(code);
      if (index !== -1) {
        codes.splice(index, 1);
        valid = true;
        this.db.run('UPDATE platform_staff SET backup_codes = ? WHERE id = ?', [JSON.stringify(codes), user.id]);
      }
    }

    if (!valid) throw new Error('رمز التحقق غير صحيح.');

    const now = nowIso();
    this.db.run('UPDATE platform_staff SET mfa_enabled = 0, totp_secret = NULL, backup_codes = NULL, updated_at = ? WHERE id = ?', [now, user.id]);

    this.audit('تعطيل MFA', 'STAFF_MFA', user.id, {});
  }

  public resetStaffMfa(id: string): void {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.mfa');

    const staff = this.getPlatformStaff(id);
    if (!staff) throw new Error('الموظف غير موجود.')

    const now = nowIso();
    this.db.run('UPDATE platform_staff SET mfa_enabled = 0, totp_secret = NULL, backup_codes = NULL, updated_at = ? WHERE id = ?', [now, id]);

    this.audit('إعادة تعيين MFA موظف', 'STAFF_MFA', id, {});
  }

  // ─── Session Management ───────────────────────────────────────────────────────

  public listStaffSessions(staffId?: string): PlatformStaffSession[] {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.sessions');

    const where = staffId ? 'WHERE staff_id = ?' : '';
    const params = staffId ? [staffId] : [];

    const rows = this.db.query<any>(`SELECT * FROM platform_staff_sessions ${where} ORDER BY created_at DESC`, params);
    return rows.map(this.mapSession);
  }

  public revokeStaffSession(sessionId: string): void {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.sessions');

    const row = this.db.query<any>('SELECT * FROM platform_staff_sessions WHERE id = ?', [sessionId])[0];
    if (!row) throw new Error('الجلسة غير موجودة.')

    this.db.run('DELETE FROM platform_staff_sessions WHERE id = ?', [sessionId]);
    this.audit('إلغاء جلسة موظف', 'STAFF_SESSION', sessionId, { staffId: row.staff_id });
  }

  public revokeAllOtherStaffSessions(): void {
    const user = AuthService.getCurrentUser();
    if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لموظفي المنصة فقط.')
    }

    this.db.run('DELETE FROM platform_staff_sessions WHERE staff_id = ? AND id <> (SELECT id FROM platform_staff_sessions WHERE staff_id = ? ORDER BY created_at DESC LIMIT 1)', [user.id, user.id]);
    this.audit('إلغاء جميع الجلسات الأخرى', 'STAFF_SESSION', null, { staffId: user.id });
  }

  // ─── Login Tracking ───────────────────────────────────────────────────────────

  public listStaffLogins(limit = 100, failedOnly = false, staffId?: string): PlatformStaffLogin[] {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.logins');

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (failedOnly) where.push('success = 0');
    if (staffId) {
      where.push('staff_id = ?');
      params.push(staffId);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);

    const rows = this.db.query<any>(`SELECT * FROM platform_staff_logins ${whereSql} ORDER BY created_at DESC LIMIT ?`, params);
    return rows.map(this.mapLogin);
  }

  public recordStaffLoginAttempt(input: {
    staffId?: string;
    username?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
    mfaUsed?: boolean;
  }): void {
    const id = `sl_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_staff_logins
        (id, staff_id, username, ip_address, user_agent, success, failure_reason, mfa_used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.staffId ?? null, input.username ?? null, input.ipAddress ?? null, input.userAgent ?? null, input.success ? 1 : 0, input.failureReason ?? null, input.mfaUsed ? 1 : 0, now]
    );

    if (!input.success && input.staffId) {
      this.db.run(
        `UPDATE platform_staff SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN datetime('now', '+15 minutes') ELSE locked_until END
         WHERE id = ?`,
        [input.staffId]
      );
    } else if (input.success && input.staffId) {
      this.db.run(
        `UPDATE platform_staff SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?`,
        [now, input.staffId]
      );
    }
  }

  // ─── Security Incidents ───────────────────────────────────────────────────────

  public listPlatformSecurityIncidents(): PlatformCentralSecurityIncident[] {
    PlatformStaffService.requirePlatformAccess('security', 'platform.security.incidents');
    const rows = this.db.query<any>('SELECT * FROM platform_security_incidents ORDER BY created_at DESC');
    return rows.map(this.mapSecurityIncident);
  }

  public recordSecurityIncident(input: {
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    description?: string;
    tenantId?: string;
    staffId?: string;
    deviceId?: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }): PlatformCentralSecurityIncident {
    PlatformStaffService.requirePlatformAccess('security', 'platform.security.incidents');

    const id = `sec_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_security_incidents
        (id, type, severity, title, description, tenant_id, staff_id, device_id, ip_address, status, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
      [id, input.type, input.severity, input.title.trim(), input.description?.trim() ?? null, input.tenantId ?? null, input.staffId ?? null, input.deviceId ?? null, input.ipAddress ?? null, input.metadata ? JSON.stringify(input.metadata) : null, now, now]
    );

    this.audit('تسجيل حادث أمني', 'SECURITY_INCIDENT', id, { type: input.type, severity: input.severity });

    const incident = this.getSecurityIncident(id);
    if (!incident) throw new Error('فشل تسجيل الحادث.');
    return incident;
  }

  public respondToSecurityIncident(id: string, action: string, resolve = false): PlatformCentralSecurityIncident {
    PlatformStaffService.requirePlatformAccess('security', 'platform.security.incidents');

    const incident = this.getSecurityIncident(id);
    if (!incident) throw new Error('الحادث غير موجود.')

    const now = nowIso();
    const status = resolve ? 'RESOLVED' : 'IN_PROGRESS';

    this.db.run(
      'UPDATE platform_security_incidents SET status = ?, response = ?, updated_at = ? WHERE id = ?',
      [status, action, now, id]
    );

    if (resolve) {
      this.db.run('UPDATE platform_security_incidents SET resolved_at = ? WHERE id = ?', [now, id]);
    }

    this.audit('الرد على حادث أمني', 'SECURITY_INCIDENT', id, { action, resolve });

    const updated = this.getSecurityIncident(id);
    if (!updated) throw new Error('فشل تحديث الحادث.');
    return updated;
  }

  public getSecurityIncident(id: string): PlatformCentralSecurityIncident | null {
    const row = this.db.query<any>('SELECT * FROM platform_security_incidents WHERE id = ?', [id])[0];
    return row ? this.mapSecurityIncident(row) : null;
  }

  // ─── Signing Keys ─────────────────────────────────────────────────────────────

  public listPlatformSigningKeys(): PlatformSigningKey[] {
    PlatformStaffService.requirePlatformAccess('security', 'platform.security.keys');
    const rows = this.db.query<any>('SELECT * FROM platform_signing_keys ORDER BY created_at DESC');
    return rows.map(this.mapSigningKey);
  }

  public rotatePlatformSigningKey(keyAlias: string): PlatformSigningKey {
    PlatformStaffService.requirePlatformAccess('security', 'platform.security.keys');

    const existing = this.db.query<any>('SELECT * FROM platform_signing_keys WHERE alias = ?', [keyAlias])[0];
    const now = nowIso();

    // Generate new Ed25519 key pair (simplified - would use proper crypto in production)
    const privateKey = randomToken(64, 'abcdefghijklmnopqrstuvwxyz0123456789');
    const publicKey = randomToken(64, 'abcdefghijklmnopqrstuvwxyz0123456789');
    const fingerprint = `sha256:${randomToken(32, 'abcdef0123456789')}`;

    if (existing) {
      this.db.run(
        'UPDATE platform_signing_keys SET private_key = ?, public_key = ?, fingerprint = ?, rotated_at = ?, is_current = 1, updated_at = ? WHERE id = ?',
        [privateKey, publicKey, fingerprint, now, now, existing.id]
      );
      this.db.run('UPDATE platform_signing_keys SET is_current = 0 WHERE alias = ? AND id <> ?', [keyAlias, existing.id]);
    } else {
      const id = `sk_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run(
        `INSERT INTO platform_signing_keys (id, alias, private_key, public_key, fingerprint, is_current, rotated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [id, keyAlias, privateKey, publicKey, fingerprint, now, now, now]
      );
    }

    this.audit('تدوير مفتاح توقيع', 'SIGNING_KEY', null, { keyAlias });

    const updated = this.db.query<any>('SELECT * FROM platform_signing_keys WHERE alias = ? AND is_current = 1', [keyAlias])[0];
    return this.mapSigningKey(updated);
  }

  // ─── Data Scope ───────────────────────────────────────────────────────────────

  public getStaffDataScope(id: string): PlatformStaffDataScopeState {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.view');

    const staff = this.getPlatformStaff(id);
    if (!staff) throw new Error('الموظف غير موجود.')

    return { staffId: id, scope: staff.dataScope ?? 'ALL', tenantIds: staff.dataScopeTenantIds ?? [] };
  }

  public setStaffDataScope(id: string, scope: 'ALL' | 'LIMITED', tenantIds: string[] = []): void {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.update');

    const staff = this.getPlatformStaff(id);
    if (!staff) throw new Error('الموظف غير موجود.')

    const now = nowIso();
    this.db.run(
      'UPDATE platform_staff SET data_scope = ?, data_scope_tenant_ids = ?, updated_at = ? WHERE id = ?',
      [scope, scope === 'LIMITED' ? JSON.stringify(tenantIds) : null, now, id]
    );

    this.audit('تعيين نطاق بيانات موظف', 'STAFF', id, { scope, tenantIds });
  }

  // ─── Role Permissions ─────────────────────────────────────────────────────────

  public getRolePermissionMatrix(): PlatformRoleMatrix {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.permissions');

    const matrix: Record<string, string[]> = {};

    for (const [role, def] of Object.entries(PLATFORM_ROLE_DEFINITIONS)) {
      const permissions = (def as any).permissions ?? [];
      const rows = this.db.query<any>('SELECT permission_codes FROM platform_role_permissions WHERE role = ?', [role])[0];
      const customCodes = rows ? safeJsonArray(rows.permission_codes) : [];
      matrix[role] = [...new Set([...permissions, ...customCodes])].sort();
    }

    // Build sections from PLATFORM_PERMISSION_SECTIONS
    const sections = Object.entries(PLATFORM_PERMISSION_SECTIONS).map(([module, section]: [string, any]) => ({
      module,
      title: section.title,
      standardActions: section.actions ?? [],
      permissions: (section.permissions ?? []).map((code: string) => ({
        code,
        action: code.split('.').pop() ?? '',
        name: STANDARD_ACTION_LABELS[code] ?? code,
      })),
    }));

    return {
      matrix,
      sections,
      standardActionLabels: STANDARD_ACTION_LABELS,
      fetchedAt: nowIso(),
    };
  }

  public setRolePermissions(role: string, permissionCodes: string[]): void {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.permissions');

    const now = nowIso();
    const existing = this.db.query<any>('SELECT * FROM platform_role_permissions WHERE role = ?', [role])[0];

    if (existing) {
      this.db.run('UPDATE platform_role_permissions SET permission_codes = ?, updated_at = ? WHERE role = ?', [JSON.stringify(permissionCodes), now, role]);
    } else {
      const id = `rp_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      this.db.run('INSERT INTO platform_role_permissions (id, role, permission_codes, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [id, role, JSON.stringify(permissionCodes), now, now]);
    }

    this.audit('تعيين صلاحيات دور', 'ROLE_PERMISSIONS', null, { role, count: permissionCodes.length });
  }

  // ─── Permissions Transfer ─────────────────────────────────────────────────────

  public transferStaffPermissions(fromStaffId: string, toStaffId: string, note?: string): PlatformStaff {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.update');

    const fromStaff = this.getPlatformStaff(fromStaffId);
    if (!fromStaff) throw new Error('موظف المصدر غير موجود.')

    const toStaff = this.getPlatformStaff(toStaffId);
    if (!toStaff) throw new Error('موظف الهدف غير موجود.')

    const now = nowIso();
    this.db.run(
      'UPDATE platform_staff SET data_scope = ?, data_scope_tenant_ids = ?, updated_at = ? WHERE id = ?',
      [fromStaff.dataScope, fromStaff.dataScopeTenantIds, now, toStaffId]
    );

    this.audit('نقل صلاحيات موظف', 'STAFF', toStaffId, { fromStaffId, note });

    const updated = this.getPlatformStaff(toStaffId);
    if (!updated) throw new Error('فشل نقل الصلاحيات.')
    return updated;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private setting(key: string, fallback = ''): string {
    const row = this.db.query<{ value: string }>('SELECT value FROM platform_settings WHERE key = ?', [key])[0];
    return row?.value ?? fallback;
  }

  private generateTotp(secret: string): string {
    const time = Math.floor(Date.now() / 30000);
    
    // Base32 decode (RFC 4648)
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    const keyBytes: number[] = [];
    
    for (const char of secret.toUpperCase().replace(/=+$/, '')) {
      const idx = base32Chars.indexOf(char);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        keyBytes.push((value >> bits) & 0xff);
      }
    }
    
    const hmac = crypto.createHmac('sha1', Buffer.from(keyBytes));
    const timeBuffer = Buffer.allocUnsafe(8);
    timeBuffer.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    hmac.update(timeBuffer);
    const hash = hmac.digest();
    const offset = hash[hash.length - 1] & 0xf;
    const code = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16) | ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
    return String(code % 1000000).padStart(6, '0');
  }

  private mapStaff(row: any): PlatformStaff {
    return {
      id: String(row.id),
      username: String(row.username),
      fullName: String(row.full_name),
      email: row.email ?? null,
      phone: row.phone ?? null,
      role: String(row.role) as PlatformStaffRole,
      isActive: Boolean(row.is_active),
      mfaEnabled: Boolean(row.mfa_enabled),
      mfaEnforcement: row.mfa_enforcement,
      totpSecret: row.totp_secret ?? null,
      backupCodes: row.backup_codes ? JSON.parse(row.backup_codes) : null,
      dataScope: row.data_scope,
      dataScopeTenantIds: row.data_scope_tenant_ids ? JSON.parse(row.data_scope_tenant_ids) : null,
      lastLoginAt: row.last_login_at ?? null,
      failedLoginAttempts: toNumber(row.failed_login_attempts, 0),
      lockedUntil: row.locked_until ?? null,
      deletedAt: row.deleted_at ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      passwordHash: row.password_hash,
    };
  }

  private mapInvite(row: any): PlatformStaffInvite {
    return {
      id: String(row.id),
      token: String(row.token),
      email: String(row.email),
      fullName: String(row.full_name),
      role: String(row.role) as PlatformStaffRole,
      invitedBy: String(row.invited_by),
      status: row.status,
      expiresAt: String(row.expires_at),
      createdAt: String(row.created_at),
    };
  }

  private mapTrustedDevice(row: any): PlatformTrustedDevice {
    return {
      id: String(row.id),
      staffId: String(row.staff_id),
      deviceName: row.device_name ?? null,
      fingerprint: String(row.fingerprint),
      ipAddress: row.ip_address ?? null,
      userAgent: row.user_agent ?? null,
      trustedAt: String(row.trusted_at),
      lastSeenAt: row.last_used_at ?? null,
      createdAt: String(row.created_at),
    };
  }

  private mapSession(row: any): PlatformStaffSession {
    const staff = this.getPlatformStaff(String(row.staff_id));
    return {
      id: String(row.id),
      staffId: String(row.staff_id),
      staffName: staff?.fullName ?? '',
      staffRole: staff?.role ?? '',
      ipAddress: row.ip_address ?? null,
      deviceName: row.device_name ?? null,
      userAgent: row.user_agent ?? null,
      isTrustedDevice: Boolean(row.is_trusted_device ?? false),
      isCurrent: Boolean(row.is_current ?? false),
      expiresAt: row.expires_at ?? null,
      createdAt: String(row.created_at),
      lastActivityAt: row.last_activity_at ?? null,
    };
  }

  private mapLogin(row: any): PlatformStaffLogin {
    return {
      id: String(row.id),
      staffId: row.staff_id ?? null,
      username: row.username ?? null,
      email: row.email ?? null,
      ipAddress: row.ip_address ?? null,
      userAgent: row.user_agent ?? null,
      status: row.success ? 'SUCCESS' : 'FAILED',
      failureReason: row.failure_reason ?? null,
      mfaUsed: Boolean(row.mfa_used),
      attemptedAt: String(row.created_at),
    };
  }

  private mapSecurityIncident(row: any): PlatformCentralSecurityIncident {
    return {
      id: String(row.id),
      type: String(row.type),
      severity: row.severity,
      title: String(row.title),
      description: row.description ?? null,
      tenantId: row.tenant_id ?? null,
      staffId: row.staff_id ?? null,
      deviceId: row.device_id ?? null,
      ipAddress: row.ip_address ?? null,
      status: row.status,
      response: row.response ?? null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      resolvedAt: row.resolved_at ?? null,
    };
  }

  private mapSigningKey(row: any): PlatformSigningKey {
    return {
      id: String(row.id),
      alias: String(row.alias),
      keyAlias: row.key_alias ?? row.alias,
      privateKey: row.private_key ?? null,
      publicKey: row.public_key ?? null,
      algorithm: row.algorithm ?? 'Ed25519',
      version: toNumber(row.version, 1),
      status: row.status,
      fingerprint: row.fingerprint ?? null,
      isCurrent: Boolean(row.is_current),
      rotatedAt: row.rotated_at ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  // ─── API Key Management ───────────────────────────────────────────────────────

  public listApiKeys(tenantId?: string): any[] {
    PlatformStaffService.requirePlatformAccess('apiKeys', 'platform.apiKeys.view');

    const where = tenantId ? 'WHERE tenant_id = ?' : '';
    const params = tenantId ? [tenantId] : [];

    const rows = this.db.query<any>(`SELECT * FROM platform_api_keys ${where} ORDER BY created_at DESC`, params);
    return rows.map((row: any) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      name: String(row.name),
      keyPrefix: String(row.key_prefix),
      scopes: row.scopes ? JSON.parse(row.scopes) : [],
      expiresAt: row.expires_at ?? null,
      lastUsedAt: row.last_used_at ?? null,
      createdAt: String(row.created_at),
      revokedAt: row.revoked_at ?? null,
    }));
  }

  public createApiKey(input: { tenantId: string; name: string; scopes?: string[]; expiresAt?: string }): any {
    PlatformStaffService.requirePlatformAccess('apiKeys', 'platform.apiKeys.create');

    const tenant = this.db.query<any>('SELECT * FROM platform_tenants WHERE id = ?', [input.tenantId])[0];
    if (!tenant) throw new Error('العميل غير موجود.');

    const id = `ak_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const plainKey = `cs_${randomToken(32, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
    const keyPrefix = plainKey.substring(0, 12);
    const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_api_keys (id, tenant_id, name, key_prefix, key_hash, scopes, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.tenantId, input.name.trim(), keyPrefix, keyHash, JSON.stringify(input.scopes ?? []), input.expiresAt ?? null, now]
    );

    this.audit('إنشاء مفتاح API', 'API_KEY', id, { tenantId: input.tenantId, name: input.name });

    return { id, name: input.name, key: plainKey, keyPrefix, scopes: input.scopes ?? [], expiresAt: input.expiresAt ?? null };
  }

  public revokeApiKey(id: string): void {
    PlatformStaffService.requirePlatformAccess('apiKeys', 'platform.apiKeys.delete');

    const row = this.db.query<any>('SELECT * FROM platform_api_keys WHERE id = ?', [id])[0];
    if (!row) throw new Error('مفتاح API غير موجود.')

    const now = nowIso();
    this.db.run('UPDATE platform_api_keys SET revoked_at = ? WHERE id = ?', [now, id]);

    this.audit('إلغاء مفتاح API', 'API_KEY', id, {});
  }

  public rotateApiKey(id: string): any {
    PlatformStaffService.requirePlatformAccess('apiKeys', 'platform.apiKeys.update');

    const row = this.db.query<any>('SELECT * FROM platform_api_keys WHERE id = ?', [id])[0];
    if (!row) throw new Error('مفتاح API غير موجود.')

    const plainKey = `cs_${randomToken(32, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
    const keyPrefix = plainKey.substring(0, 12);
    const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
    const now = nowIso();

    this.db.run('UPDATE platform_api_keys SET key_prefix = ?, key_hash = ?, rotated_at = ?, updated_at = ? WHERE id = ?', [keyPrefix, keyHash, now, now, id]);

    this.audit('تدوير مفتاح API', 'API_KEY', id, {});

    return { id, name: row.name, key: plainKey, keyPrefix, scopes: JSON.parse(row.scopes || '[]'), expiresAt: row.expires_at };
  }

  public validateApiKey(plainTextKey: string): any {
    const keyHash = crypto.createHash('sha256').update(plainTextKey).digest('hex');
    const row = this.db.query<any>('SELECT * FROM platform_api_keys WHERE key_hash = ? AND revoked_at IS NULL', [keyHash])[0];
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
    return { tenantId: row.tenant_id, scopes: JSON.parse(row.scopes || '[]') };
  }

  // ─── Session Management (Extended) ────────────────────────────────────────────

  public revokeStaffSessionsForStaff(staffId: string): void {
    PlatformStaffService.requirePlatformAccess('staff', 'platform.staff.sessions');

    this.db.run('DELETE FROM platform_staff_sessions WHERE staff_id = ?', [staffId]);
    this.audit('إلغاء جميع جلسات موظف', 'STAFF_SESSION', null, { staffId });
  }

  // ─── Security Overview ────────────────────────────────────────────────────────

  public getPlatformSecurityOverview(): PlatformCentralSecurityOverview {
    PlatformStaffService.requirePlatformAccess('security', 'platform.security.view');

    const incidents = this.listPlatformSecurityIncidents();
    const mfaCompliance = this.getStaffMfaCompliance();
    const recentLogins = this.listStaffLogins(50);
    const activeSessions = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_staff_sessions WHERE expires_at > datetime(\'now\')')[0]?.c ?? 0;
    const trustedDevices = this.db.query<any>('SELECT COUNT(*) AS c FROM platform_trusted_devices')[0]?.c ?? 0;
    const signingKeys = this.listPlatformSigningKeys();

    return {
      securityScore: 100,
      twoFactorEnforcement: {
        enabled: true,
        compliantStaffCount: mfaCompliance.enabled,
        totalStaffCount: mfaCompliance.total,
      },
      activeStaffSessionsCount: toNumber(activeSessions, 0),
      failedLogins24hCount: this.db.query<any>('SELECT COUNT(*) AS c FROM platform_staff_logins WHERE success = 0 AND created_at > datetime(\'now\', \'-24 hours\')')[0]?.c ?? 0,
      activeIncidentsCount: incidents.filter(i => i.status === 'OPEN').length,
      signingKeysCount: signingKeys.length,
      trustedDevicesCount: toNumber(signingKeys.length, 0),
      sessions: this.listStaffSessions().slice(0, 50),
      recentLogins: recentLogins.slice(0, 50),
      incidents: incidents.slice(0, 50),
      signingKeys: signingKeys,
    };
  }
}

export const platformStaffService = new PlatformStaffService();