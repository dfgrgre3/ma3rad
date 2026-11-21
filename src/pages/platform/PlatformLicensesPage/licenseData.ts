import type {
  PlatformCouplingMode,
  PlatformLicenseChangeType,
  PlatformLicenseStatus,
} from '../../../services/domains/platform/platformTypes';

export const LICENSE_STATUS_LABELS: Record<PlatformLicenseStatus, string> = {
  ISSUED: 'صادر',
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  REVOKED: 'ملغي',
  EXPIRED: 'منتهي',
};

export const COUPLING_LABELS: Record<PlatformCouplingMode, string> = {
  FULL: 'كامل',
  EXPIRY_ONLY: 'انتهاء الصلاحية فقط',
  NONE: 'مستقل',
};

export const STATUSES: PlatformLicenseStatus[] = ['ACTIVE', 'ISSUED', 'SUSPENDED', 'EXPIRED', 'REVOKED'];

/** Days until expiry (negative when already expired); null when no expiry date. */
export const daysUntilExpiry = (expiresAt?: string | null): number | null => {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / 86_400_000);
};

/** Clamp a numeric input: finite, integer, minimum `min` (NaN-safe). */
export const clampInt = (raw: string, min: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(min, Math.floor(n)) : min;
};

export const ACTIVATION_ACTION_LABELS: Record<string, string> = {
  ACTIVATE: 'تفعيل',
  DEACTIVATE: 'إلغاء تفعيل',
  TRANSFER: 'نقل',
  RENEW: 'تجديد',
  REVOKE: 'إلغاء',
};

export const ACTIVATION_STATUS_LABELS: Record<string, string> = {
  SUCCESS: 'ناجح',
  FAILED: 'فاشل',
  PENDING: 'قيد الانتظار',
};

export const LICENSE_CHANGE_TYPE_LABELS: Record<PlatformLicenseChangeType, string> = {
  ISSUE: 'إصدار',
  RENEW: 'تجديد',
  SUSPEND: 'إيقاف',
  REVOKE: 'إلغاء',
  TRANSFER: 'نقل',
  MODULE_CHANGE: 'تغيير وحدات',
  LIMIT_CHANGE: 'تغيير حدود',
  COUPLING_CHANGE: 'تغيير وضع الربط',
  STATUS_CHANGE: 'تغيير حالة',
  UPDATE: 'تعديل',
  REACTIVATE: 'إعادة تفعيل',
  UNBIND: 'فك ربط',
};
