import { AuthService } from '../../auth/AuthService';
import { platformStaffTwoFactorAuth } from '../../auth/twoFactorAuth';
import { deletePlatformStaffTwoFactorRow } from '../../auth/twoFactorAuth';
import { PLATFORM_ROLE_CODES_SET } from './shared';
import { nowIso } from '../platformUtils';
import type { StaffServiceContext } from './context';

export function getOwnStaffMfaStatus(ctx: StaffServiceContext): { enabled: boolean; enforcement: 'off' | 'optional' | 'required' } {
  const user = AuthService.getCurrentUser();
  if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
    throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
  }

  const staff = ctx.getPlatformStaff(user.id);
  if (!staff) throw new Error('حساب الموظف غير موجود.');

  return { enabled: staff.mfaEnabled, enforcement: staff.mfaEnforcement };
}

export function getStaffMfaEnforcement(ctx: StaffServiceContext): 'off' | 'optional' | 'required' {
  ctx.requirePlatformAccess('staff', 'platform.staff.mfa');
  const row = ctx.db.query<any>('SELECT value FROM platform_settings WHERE key = ?', ['platform.staffMfaEnforcement'])[0];
  return (row?.value as 'off' | 'optional' | 'required') ?? 'optional';
}

export function setStaffMfaEnforcement(ctx: StaffServiceContext, policy: 'off' | 'optional' | 'required'): void {
  ctx.requirePlatformAccess('staff', 'platform.staff.mfa');

  const now = nowIso();
  const existing = ctx.db.query<any>('SELECT 1 FROM platform_settings WHERE key = ?', ['platform.staffMfaEnforcement'])[0];
  if (existing) {
    ctx.db.run('UPDATE platform_settings SET value = ?, updated_at = ? WHERE key = ?', [policy, now, 'platform.staffMfaEnforcement']);
  } else {
    ctx.db.run('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)', ['platform.staffMfaEnforcement', policy, now]);
  }

  ctx.audit('تعيين سياسة MFA', 'STAFF_MFA', null, { policy });
}

export function getStaffMfaCompliance(ctx: StaffServiceContext): {
  total: number;
  enabled: number;
  requiredButDisabled: number;
  byRole: Record<string, { total: number; enabled: number }>;
} {
  ctx.requirePlatformAccess('staff', 'platform.staff.view');

  const rows = ctx.db.query<any>(
    `SELECT role, mfa_enabled FROM platform_staff
     WHERE (deleted_at IS NULL OR deleted_at = '')`
  );

  const byRole: Record<string, { total: number; enabled: number }> = {};
  let total = 0, enabled = 0, requiredButDisabled = 0;
  const enforcement = ctx.getStaffMfaEnforcement();

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

export async function startMfaEnrollmentForStaffSelf(ctx: StaffServiceContext): Promise<{ secret: string; uri: string; backupCodes: string[] }> {
  const user = AuthService.getCurrentUser();
  if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
    throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
  }

  const setup = await platformStaffTwoFactorAuth.setup2FA(user.id, 'TOTP');
  ctx.audit('بدء تسجيل MFA', 'STAFF_MFA', user.id, {});
  return { secret: setup.secret, uri: setup.qrCodeImage ?? '', backupCodes: setup.recoveryCodes };
}

export async function confirmMfaForStaffSelf(ctx: StaffServiceContext, code: string): Promise<void> {
  const user = AuthService.getCurrentUser();
  if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
    throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
  }

  await platformStaffTwoFactorAuth.enable2FA(user.id, 'TOTP', code);

  ctx.audit('تأكيد MFA', 'STAFF_MFA', user.id, {});
}

export async function disableMfaForStaffSelf(ctx: StaffServiceContext, code: string): Promise<void> {
  const user = AuthService.getCurrentUser();
  if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
    throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
  }

  if (!platformStaffTwoFactorAuth.isEnabled(user.id)) throw new Error('MFA غير مفعل.');

  await platformStaffTwoFactorAuth.disable2FA(user.id, code);

  const now = nowIso();
  ctx.db.run('UPDATE platform_staff SET mfa_enabled = 0, totp_secret = NULL, backup_codes = NULL, updated_at = ? WHERE id = ?', [now, user.id]);

  ctx.audit('تعطيل MFA', 'STAFF_MFA', user.id, {});
}

export function resetStaffMfa(ctx: StaffServiceContext, id: string): void {
  ctx.requirePlatformAccess('staff', 'platform.staff.mfa');

  const staff = ctx.getPlatformStaff(id);
  if (!staff) throw new Error('الموظف غير موجود.')

  const now = nowIso();
  deletePlatformStaffTwoFactorRow(id);
  ctx.db.run('UPDATE platform_staff SET mfa_enabled = 0, totp_secret = NULL, backup_codes = NULL, updated_at = ? WHERE id = ?', [now, id]);

  ctx.audit('إعادة تعيين MFA موظف', 'STAFF_MFA', id, {});
}
