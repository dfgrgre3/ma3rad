import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PLATFORM_ROLE_CODES_SET } from './shared';
import type {
  PlatformStaffSession,
  PlatformStaffLogin,
} from '../platformTypes';
import { nowIso } from '../platformUtils';
import type { StaffServiceContext } from './context';
import { mapSession, mapLogin } from './mappers';

export function listStaffSessions(ctx: StaffServiceContext, staffId?: string): PlatformStaffSession[] {
  ctx.requirePlatformAccess('staff', 'platform.staff.sessions');

  const where = staffId ? 'WHERE staff_id = ?' : '';
  const params = staffId ? [staffId] : [];

  const rows = ctx.db.query<any>(`SELECT * FROM platform_staff_sessions ${where} ORDER BY created_at DESC`, params);
  return rows.map((row: any) => mapSession(row, ctx.getPlatformStaff));
}

export function revokeStaffSession(ctx: StaffServiceContext, sessionId: string): void {
  ctx.requirePlatformAccess('staff', 'platform.staff.sessions');

  const row = ctx.db.query<any>('SELECT * FROM platform_staff_sessions WHERE id = ?', [sessionId])[0];
  if (!row) throw new Error('الجلسة غير موجودة.')

  ctx.db.run('DELETE FROM platform_staff_sessions WHERE id = ?', [sessionId]);
  ctx.audit('إلغاء جلسة موظف', 'STAFF_SESSION', sessionId, { staffId: row.staff_id });
}

export function revokeAllOtherStaffSessions(ctx: StaffServiceContext): void {
  const user = AuthService.getCurrentUser();
  if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
    throw new Error('هذه العملية متاحة لموظفي المنصة فقط.')
  }

  ctx.db.run('DELETE FROM platform_staff_sessions WHERE staff_id = ? AND id <> (SELECT id FROM platform_staff_sessions WHERE staff_id = ? ORDER BY created_at DESC LIMIT 1)', [user.id, user.id]);
  ctx.audit('إلغاء جميع الجلسات الأخرى', 'STAFF_SESSION', null, { staffId: user.id });
}

export function revokeStaffSessionsForStaff(ctx: StaffServiceContext, staffId: string): void {
  ctx.requirePlatformAccess('staff', 'platform.staff.sessions');

  ctx.db.run('DELETE FROM platform_staff_sessions WHERE staff_id = ?', [staffId]);
  ctx.audit('إلغاء جميع جلسات موظف', 'STAFF_SESSION', null, { staffId });
}

export function listStaffLogins(ctx: StaffServiceContext, limit = 100, failedOnly = false, staffId?: string): PlatformStaffLogin[] {
  ctx.requirePlatformAccess('staff', 'platform.staff.logins');

  const where: string[] = [];
  const params: (string | number)[] = [];

  if (failedOnly) where.push('success = 0');
  if (staffId) {
    where.push('staff_id = ?');
    params.push(staffId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit);

  const rows = ctx.db.query<any>(`SELECT * FROM platform_staff_logins ${whereSql} ORDER BY created_at DESC LIMIT ?`, params);
  return rows.map(mapLogin);
}

export function recordStaffLoginAttempt(ctx: StaffServiceContext, input: {
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
  const staffEmail = input.staffId
    ? ctx.db.query<any>('SELECT email FROM platform_staff WHERE id = ?', [input.staffId])[0]?.email ?? null
    : null;

  ctx.db.run(
    `INSERT INTO platform_staff_logins
      (id, staff_id, email, username, ip_address, user_agent, status, success, mfa_used, failure_reason, attempted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.staffId ?? null, staffEmail ?? input.username ?? '', input.username ?? null, input.ipAddress ?? null, input.userAgent ?? null,
     input.success ? 'SUCCESS' : 'FAILED', input.success ? 1 : 0, input.mfaUsed ? 1 : 0, input.failureReason ?? null, now, now]
  );

  if (!input.success && input.staffId) {
    ctx.db.run(
      `UPDATE platform_staff SET failed_login_attempts = failed_login_attempts + 1,
         locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN datetime('now', '+15 minutes') ELSE locked_until END
       WHERE id = ?`,
      [input.staffId]
    );
  } else if (input.success && input.staffId) {
    ctx.db.run(
      `UPDATE platform_staff SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?`,
      [now, input.staffId]
    );
  }
}
