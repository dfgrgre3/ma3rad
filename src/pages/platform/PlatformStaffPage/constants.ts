export type TabKey = 'accounts' | 'sessions' | 'invites' | 'logins' | 'security';

export const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'accounts', label: 'الحسابات' },
  { key: 'sessions', label: 'الجلسات والأجهزة' },
  { key: 'invites', label: 'الدعوات' },
  { key: 'logins', label: 'سجل الدخول' },
  { key: 'security', label: 'المصادقة والأمان' },
];

export const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN: 'bg-primary/20 text-primary border-primary/30',
  PLATFORM_ADMIN: 'bg-primary/20 text-primary border-primary/30',
  SUPPORT_AGENT: 'bg-success/20 text-success border-success/30',
  BILLING_SPECIALIST: 'bg-warning/20 text-warning border-warning/30',
  OPERATIONS_ENGINEER: 'bg-primary/20 text-primary border-primary/30',
  LICENSE_MANAGER: 'bg-success/20 text-success border-success/30',
};
