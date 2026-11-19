import bcrypt from 'bcryptjs';
import { AuthService } from '../../auth/AuthService';
import { PLATFORM_ROLE_CODES_SET } from './shared';
import { nowIso } from '../platformUtils';
import type { StaffServiceContext } from './context';
import { mapStaff } from './mappers';

export function resetPlatformStaffPassword(ctx: StaffServiceContext, id: string, newPassword: string): void {
  ctx.requirePlatformAccess('staff', 'platform.staff.password');

  const existing = ctx.getPlatformStaff(id);
  if (!existing) throw new Error('الموظف غير موجود.');

  if (newPassword.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  const now = nowIso();

  ctx.db.run('UPDATE platform_staff SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?', [passwordHash, now, id]);

  ctx.audit('إعادة تعيين كلمة مرور موظف', 'STAFF', id, {});
}

export function forcePlatformStaffPasswordChange(ctx: StaffServiceContext, id: string, flag = true): void {
  ctx.requirePlatformAccess('staff', 'platform.staff.password');

  const existing = ctx.getPlatformStaff(id);
  if (!existing) throw new Error('الموظف غير موجود.');

  const now = nowIso();
  ctx.db.run('UPDATE platform_staff SET must_change_password = ?, updated_at = ? WHERE id = ?', [flag ? 1 : 0, now, id]);

  ctx.audit(flag ? 'إجبار تغيير كلمة المرور' : 'إلغاء إجبار تغيير كلمة المرور', 'STAFF', id, {});
}

export function changeOwnStaffPassword(ctx: StaffServiceContext, currentPassword: string, newPassword: string, fullName?: string): void {
  const user = AuthService.getCurrentUser();
  if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
    throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
  }

  const row = ctx.db.query<any>('SELECT * FROM platform_staff WHERE id = ?', [user.id])[0];
  const staff = row ? mapStaff(row) : null;
  if (!staff) throw new Error('حساب الموظف غير موجود.');

  if (!bcrypt.compareSync(currentPassword, staff.passwordHash || '')) {
    throw new Error('كلمة المرور الحالية غير صحيحة.');
  }

  if (newPassword.length < 8) throw new Error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.');

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  const now = nowIso();

  ctx.db.run('UPDATE platform_staff SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?', [passwordHash, now, staff.id]);

  ctx.audit('تغيير كلمة مرور ذاتية', 'STAFF', staff.id, {});
}
