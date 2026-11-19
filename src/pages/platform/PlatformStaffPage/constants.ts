export type TabKey = 'accounts' | 'sessions' | 'invites' | 'logins' | 'security';

export const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'accounts', label: 'الحسابات' },
  { key: 'sessions', label: 'الجلسات والأجهزة' },
  { key: 'invites', label: 'الدعوات' },
  { key: 'logins', label: 'سجل الدخول' },
  { key: 'security', label: 'المصادقة والأمان' },
];

export const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  PLATFORM_ADMIN: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  SUPPORT_AGENT: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  BILLING_SPECIALIST: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  OPERATIONS_ENGINEER: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  LICENSE_MANAGER: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
};
