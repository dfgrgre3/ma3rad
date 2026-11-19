import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AuthService } from '../../auth/AuthService';
import type {
  PlatformStaff,
  PlatformStaffInvite,
  PlatformStaffInviteInput,
  PlatformStaffInviteCreated,
  PlatformStaffInviteStatus,
} from '../platformTypes';
import { nowIso, randomToken, generateTemporaryPassword, addDays } from '../platformUtils';
import type { StaffServiceContext } from './context';
import { mapInvite } from './mappers';

export function createStaffInvite(ctx: StaffServiceContext, input: PlatformStaffInviteInput): PlatformStaffInviteCreated {
  ctx.assertOwnerRoleGrant(input.role, { creating: true });
  ctx.requirePlatformAccess('staff', 'platform.staff.invite');

  const token = randomToken(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  const expiresAt = addDays(new Date(), 7).toISOString();

  const id = `si_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now = nowIso();

  ctx.db.run(
    `INSERT INTO platform_staff_invites
      (id, token, token_hash, email, full_name, role, invited_by, status, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
    [id, token, crypto.createHash('sha256').update(token).digest('hex'), input.email.trim().toLowerCase(), input.fullName.trim(), input.role, AuthService.getCurrentUser()!.id, expiresAt, now, now]
  );

  ctx.audit('إنشاء دعوة موظف', 'STAFF_INVITE', id, { email: input.email, role: input.role });

  const invite = ctx.getStaffInvite(id);
  if (!invite) throw new Error('فشل إنشاء الدعوة.');

  const loginUrl = `${ctx.setting('platform.staffLoginUrl', 'https://admin.ceramisys.com')}/invite/${token}`;

  return { invite, token, link: loginUrl, loginUrl, temporaryPassword: generateTemporaryPassword() };
}

export function listStaffInvites(ctx: StaffServiceContext, status: 'all' | PlatformStaffInviteStatus = 'all'): PlatformStaffInvite[] {
  ctx.requirePlatformAccess('staff', 'platform.staff.view');

  const where = status !== 'all' ? 'WHERE UPPER(status) = UPPER(?)' : '';
  const params = status !== 'all' ? [status] : [];

  const rows = ctx.db.query<any>(`SELECT * FROM platform_staff_invites ${where} ORDER BY created_at DESC`, params);
  return rows.map(mapInvite);
}

export function revokeStaffInvite(ctx: StaffServiceContext, id: string): void {
  ctx.requirePlatformAccess('staff', 'platform.staff.invite');

  const invite = ctx.getStaffInvite(id);
  if (!invite) throw new Error('الدعوة غير موجودة.');

  ctx.db.run('DELETE FROM platform_staff_invites WHERE id = ?', [id]);
  ctx.audit('إلغاء دعوة موظف', 'STAFF_INVITE', id, {});
}

export function getStaffInviteByToken(ctx: StaffServiceContext, token: string): PlatformStaffInvite {
  const row = ctx.db.query<any>('SELECT * FROM platform_staff_invites WHERE token = ?', [token])[0];
  if (!row) throw new Error('الدعوة غير موجودة.');
  return mapInvite(row);
}

export function acceptStaffInvite(ctx: StaffServiceContext, token: string, fullName: string, password: string): PlatformStaff {
  let invite: PlatformStaffInvite;
  try {
    invite = ctx.getStaffInviteByToken(token);
  } catch {
    throw new Error('رابط الدعوة غير صالح.');
  }
  if (invite.status === 'ACCEPTED') throw new Error('تم استخدام هذه الدعوة من قبل.');
  if (invite.status !== 'PENDING') throw new Error('الدعوة لم تعد صالحة.');
  if (new Date(invite.expiresAt) < new Date()) throw new Error('الدعوة منتهية الصلاحية.');

  if (password.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');

  const username = invite.email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24);
  let finalUsername = username;
  let index = 1;
  while (ctx.db.query('SELECT 1 FROM platform_staff WHERE username = ?', [finalUsername]).length) {
    finalUsername = `${username}${index}`;
    index++;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const id = `stf_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now = nowIso();

  ctx.db.executeTransaction(() => {
    ctx.db.run(
      `INSERT INTO platform_staff
        (id, username, full_name, email, phone, role, password_hash, is_active, mfa_enabled, mfa_enforcement, totp_secret, backup_codes, data_scope, data_scope_tenant_ids, last_login_at, failed_login_attempts, locked_until, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 1, 0, 'optional', NULL, NULL, 'ALL', NULL, NULL, 0, NULL, NULL, ?, ?)`,
      [id, finalUsername, fullName.trim(), invite.email, invite.role, passwordHash, now, now]
    );

    ctx.db.run('UPDATE platform_staff_invites SET status = \'ACCEPTED\', updated_at = ? WHERE id = ?', [now, invite.id]);
  });

  ctx.audit('قبول دعوة موظف', 'STAFF_INVITE', invite.id, { staffId: id });

  const staff = ctx.getPlatformStaff(id);
  if (!staff) throw new Error('فشل إنشاء حساب الموظف.');
  return staff;
}

export function getStaffInvite(ctx: StaffServiceContext, id: string): PlatformStaffInvite | null {
  const row = ctx.db.query<any>('SELECT * FROM platform_staff_invites WHERE id = ?', [id])[0];
  return row ? mapInvite(row) : null;
}
