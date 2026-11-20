// Shared Arabic label/tone maps for platform super-admin pages.
// Previously duplicated between PlatformSuperAdminDashboard and PlatformDashboardPage.

export const CHANNEL_LABELS: Record<string, string> = {
  STABLE: 'مستقر',
  BETA: 'تجريبي',
  NIGHTLY: 'ليلي',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'نقدي',
  BANK: 'تحويل بنكي',
  CARD: 'بطاقة',
  WALLET: 'محفظة إلكترونية',
  OTHER: 'أخرى',
};

export const TENANT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'نشط',
  TRIAL: 'تجريبي',
  SUSPENDED: 'موقوف',
  EXPIRED: 'منتهي',
  CANCELLED: 'ملغي',
};

export const TENANT_STATUS_TONES: Record<string, string> = {
  ACTIVE: 'bg-success-soft text-success border-success-border',
  TRIAL: 'bg-warning-soft text-warning border-warning-border',
  SUSPENDED: 'bg-danger-soft text-danger border-danger-border',
  EXPIRED: 'bg-surface-sunken text-ink-secondary border-line',
  CANCELLED: 'bg-surface-sunken text-muted border-line',
};

/** Broad status → Arabic label map used by tables/badges across platform pages. */
export const PLATFORM_STATUS_LABELS: Record<string, string> = {
  TRIAL: 'تجريبي',
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  EXPIRED: 'منتهي',
  CANCELLED: 'ملغي',
  ISSUED: 'صادر',
  REVOKED: 'ملغي',
  PAID: 'مدفوعة',
  PARTIAL: 'جزئية',
  SENT: 'مرسلة',
  OVERDUE: 'متأخرة',
  DRAFT: 'مسودة',
  VOID: 'ملغاة',
  PUBLISHED: 'منشور',
  DEPRECATED: 'متوقف',
  STABLE: 'مستقر',
  BETA: 'تجريبي',
  NIGHTLY: 'ليلي',
};

export const ENTITY_LABELS: Record<string, string> = {
  TENANT: 'عميل',
  PLAN: 'خطة',
  LICENSE: 'ترخيص',
  INVOICE: 'فاتورة',
  PAYMENT: 'دفعة',
  MODULE: 'وحدة',
  FEATURE: 'ميزة',
  RELEASE: 'إصدار',
  SETTINGS: 'إعدادات',
};
