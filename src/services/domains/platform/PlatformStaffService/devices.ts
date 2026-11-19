import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import type { PlatformTrustedDevice } from '../platformTypes';
import { nowIso } from '../platformUtils';
import type { StaffServiceContext } from './context';
import { PLATFORM_ROLE_CODES_SET } from './shared';
import { mapTrustedDevice } from './mappers';

export function listTrustedDevices(ctx: StaffServiceContext, staffId?: string): PlatformTrustedDevice[] {
  ctx.requirePlatformAccess('staff', 'platform.staff.devices');

  const where = staffId ? 'WHERE staff_id = ?' : '';
  const params = staffId ? [staffId] : [];

  const rows = ctx.db.query<any>(`SELECT * FROM platform_trusted_devices ${where} ORDER BY created_at DESC`, params);
  return rows.map(mapTrustedDevice);
}

export function revokeTrustedDevice(ctx: StaffServiceContext, id: string): void {
  ctx.requirePlatformAccess('staff', 'platform.staff.devices');

  const row = ctx.db.query<any>('SELECT * FROM platform_trusted_devices WHERE id = ?', [id])[0];
  if (!row) throw new Error('الجهاز غير موجود.');

  ctx.db.run('DELETE FROM platform_trusted_devices WHERE id = ?', [id]);
  ctx.audit('إلغاء جهاز موثوق', 'TRUSTED_DEVICE', id, { staffId: row.staff_id });
}

export function trustCurrentStaffDevice(ctx: StaffServiceContext, deviceName?: string): void {
  const user = AuthService.getCurrentUser();
  if (!user || !PLATFORM_ROLE_CODES_SET.has(String(user.role))) {
    throw new Error('هذه العملية متاحة لموظفي المنصة فقط.');
  }

  const staff = ctx.getPlatformStaff(user.id);
  if (!staff) throw new Error('حساب الموظف غير موجود.');

  let fingerprint: string;
  try {
    fingerprint = getDeviceFingerprint();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'تعذر الحصول على بصمة الجهاز.');
  }

  const existing = ctx.db.query<any>(
    'SELECT id FROM platform_trusted_devices WHERE staff_id = ? AND fingerprint = ?',
    [staff.id, fingerprint]
  )[0];
  if (existing) {
    throw new Error('هذا الجهاز موثق بالفعل لهذا الموظف.');
  }

  const id = `td_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now = nowIso();

  ctx.db.run(
    `INSERT INTO platform_trusted_devices (id, staff_id, device_name, fingerprint, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, staff.id, deviceName || null, fingerprint, now, now]
  );

  ctx.audit('إضافة جهاز موثوق', 'TRUSTED_DEVICE', id, { staffId: staff.id, deviceName, fingerprint });
}

function getDeviceFingerprint(): string {
  if (typeof window !== 'undefined' && (window as any).ceramisys?.license?.getHwid) {
    const hwid = (window as any).ceramisys.license.getHwid();
    if (hwid && typeof hwid === 'string' && hwid.trim()) return hwid.trim();
  }
  try {
    let id = localStorage.getItem('central_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('central_device_id', id);
    }
    return id;
  } catch {
    return 'dev_' + Math.random().toString(36).slice(2, 10);
  }
}
