import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { AuthService } from '../../auth/AuthService';
import { PLATFORM_ROLE_DEFINITIONS } from '../PlatformAuthorizationService';
import type {
  PlatformStaff,
  PlatformStaffInput,
  PlatformStaffRoleDefinition,
} from '../platformTypes';
import { nowIso, generateTemporaryPassword } from '../platformUtils';
import type { StaffServiceContext } from './context';
import { sanitizeStaffUsername } from './shared';
import { mapStaff } from './mappers';

export function listPlatformStaffRoles(ctx: StaffServiceContext): PlatformStaffRoleDefinition[] {
  ctx.requirePlatformAccess('staff', 'platform.staff.view');
  return Object.values(PLATFORM_ROLE_DEFINITIONS);
}

export function listPlatformStaff(ctx: StaffServiceContext, search = '', role = '', includeDeleted = false): PlatformStaff[] {
  ctx.requirePlatformAccess('staff', 'platform.staff.view');

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
  const rows = ctx.db.query<any>(`SELECT * FROM platform_staff ${whereSql} ORDER BY created_at DESC`, params);
  return rows.map(mapStaff);
}

export function getPlatformStaff(ctx: StaffServiceContext, id: string): PlatformStaff | null {
  ctx.requirePlatformAccess('staff', 'platform.staff.view');
  const row = ctx.db.query<any>('SELECT * FROM platform_staff WHERE id = ?', [id])[0];
  return row ? mapStaff(row) : null;
}

export function createPlatformStaff(ctx: StaffServiceContext, input: PlatformStaffInput): PlatformStaff {
  ctx.requirePlatformAccess('staff', 'platform.staff.create');

  ctx.assertOwnerRoleGrant(input.role, { creating: true });

  let username = input.username == null ? input.username : sanitizeStaffUsername(input.username);
  if (!username && input.email) {
    username = input.email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24);
  }
  if (!username) throw new Error('اسم المستخدم مطلوب.');

  if (ctx.db.query('SELECT 1 FROM platform_staff WHERE username = ?', [username]).length) {
    const base = username;
    let index = 2;
    while (ctx.db.query('SELECT 1 FROM platform_staff WHERE username = ?', [`${base}${index}`]).length) index++;
    username = `${base}${index}`.slice(0, 24);
  }

  if (input.email && ctx.db.query('SELECT 1 FROM platform_staff WHERE email = ?', [input.email.trim()]).length) {
    throw new Error('البريد الإلكتروني مستخدم بالفعل.');
  }

  const temporaryPassword = input.password || generateTemporaryPassword();
  const passwordHash = bcrypt.hashSync(temporaryPassword, 10);

  const id = `stf_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now = nowIso();

  ctx.db.run(
    `INSERT INTO platform_staff
      (id, username, full_name, email, phone, role, password_hash, is_active, must_change_password, mfa_enabled, mfa_enforcement, totp_secret, backup_codes, data_scope, data_scope_tenant_ids, last_login_at, failed_login_attempts, locked_until, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0, 'optional', NULL, NULL, 'ALL', NULL, NULL, 0, NULL, NULL, ?, ?)`,
    [id, username, input.fullName.trim(), input.email?.trim() ?? null, input.phone?.trim() ?? null, input.role, passwordHash, now, now]
  );

  ctx.audit('إنشاء موظف منصة', 'STAFF', id, { username, role: input.role });

  const staff = ctx.getPlatformStaff(id);
  if (!staff) throw new Error('فشل إنشاء الموظف.');
  return staff;
}

export function updatePlatformStaff(ctx: StaffServiceContext, id: string, input: Partial<PlatformStaffInput>): PlatformStaff {
  ctx.requirePlatformAccess('staff', 'platform.staff.update');

  const existing = ctx.getPlatformStaff(id);
  if (!existing) throw new Error('الموظف غير موجود.');

  const actor = AuthService.getCurrentUser();
  if (existing.role === 'SUPER_ADMIN' && actor?.role !== 'SUPER_ADMIN') {
    throw new Error('حساب مالك المنصة لا يمكن تعديله إلا من قبل مالك المنصة.');
  }

  ctx.assertOwnerRoleGrant(input.role ?? existing.role, { creating: false });

  if (input.username && input.username !== existing.username) {
    const username = sanitizeStaffUsername(input.username);
    if (ctx.db.query('SELECT 1 FROM platform_staff WHERE username = ? AND id <> ?', [username, id]).length) {
      throw new Error('اسم المستخدم مستخدم بالفعل.');
    }
  }

  if (input.email && input.email !== existing.email) {
    if (ctx.db.query('SELECT 1 FROM platform_staff WHERE email = ? AND id <> ?', [input.email.trim(), id]).length) {
      throw new Error('البريد الإلكتروني مستخدم بالفعل.');
    }
  }

  const now = nowIso();
  ctx.db.run(
    `UPDATE platform_staff SET
       username = ?, full_name = ?, email = ?, phone = ?, role = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.username == null ? existing.username : sanitizeStaffUsername(input.username),
      input.fullName?.trim() ?? existing.fullName,
      input.email?.trim() ?? existing.email,
      input.phone?.trim() ?? existing.phone,
      input.role ?? existing.role,
      now, id,
    ]
  );

  ctx.audit('تحديث موظف منصة', 'STAFF', id, { role: input.role ?? existing.role });

  const updated = ctx.getPlatformStaff(id);
  if (!updated) throw new Error('فشل تحديث الموظف.');
  return updated;
}

export function setPlatformStaffActive(ctx: StaffServiceContext, id: string, isActive: boolean): PlatformStaff {
  ctx.requirePlatformAccess('staff', 'platform.staff.update');

  const existing = ctx.getPlatformStaff(id);
  if (!existing) throw new Error('الموظف غير موجود.');

  const now = nowIso();
  ctx.db.run(
    'UPDATE platform_staff SET is_active = ?, updated_at = ? WHERE id = ?',
    [isActive ? 1 : 0, now, id]
  );

  ctx.audit(isActive ? 'تفعيل موظف منصة' : 'تعطيل موظف منصة', 'STAFF', id, {});

  const updated = ctx.getPlatformStaff(id);
  if (!updated) throw new Error('فشل تحديث الموظف.');
  return updated;
}

export function deletePlatformStaff(ctx: StaffServiceContext, id: string): void {
  ctx.requirePlatformAccess('staff', 'platform.staff.delete');

  const existing = ctx.getPlatformStaff(id);
  if (!existing) throw new Error('الموظف غير موجود.');

  if (existing.role === 'SUPER_ADMIN') throw new Error('لا يمكن حذف حساب مالك المنصة.');

  const now = nowIso();
  ctx.db.run('UPDATE platform_staff SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);

  ctx.audit('حذف موظف منصة', 'STAFF', id, {});
}
