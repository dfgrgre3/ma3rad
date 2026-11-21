import React from 'react';
import type { PlatformTenantProfile } from '../../../services/domains/platform/platformTypes';
import { formatDateTime } from '../components/PlatformUI';

/** Tenant branch row as returned by the central branches API (no shared DTO yet). */
export interface TenantBranch {
  id: string;
  code?: string;
  name?: string;
  city?: string | null;
  phone?: string | null;
  seatsLimit?: number;
  devicesLimit?: number;
  isMain?: boolean;
  status?: string;
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  'bg-primary/10 text-primary',
  'bg-success/10 text-success',
  'bg-warning/10 text-warning',
  'bg-accent-soft text-primary',
  'bg-danger/10 text-danger',
  'bg-surface-sunken text-ink-secondary',
];

const avatarTone = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
};

const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
};

export const Avatar: React.FC<{ name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string; tone?: string }> = ({
  name,
  size = 'md',
  className = '',
  tone,
}) => {
  const sizeClass = {
    sm: 'h-8 w-8 text-[11px]',
    md: 'h-10 w-10 text-[13px]',
    lg: 'h-12 w-12 text-[15px]',
    xl: 'h-16 w-16 text-[20px]',
  }[size];
  const radiusClass = /rounded-/.test(className) ? '' : 'rounded-2xl';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-black ${radiusClass} ${sizeClass} ${tone ?? avatarTone(name)} ${className}`}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
};

// ─── Shared building blocks ───────────────────────────────────────────────────

export const InfoItem: React.FC<{ label: string; value: React.ReactNode; ltr?: boolean }> = ({ label, value, ltr }) => (
  <div className="rounded-xl border border-line/70 bg-surface px-3 py-2.5 transition hover:border-line-strong">
    <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</dt>
    <dd className={`mt-1 text-[12.5px] font-bold text-ink ${ltr ? 'font-mono' : ''}`} dir={ltr ? 'ltr' : undefined}>
      {value || '—'}
    </dd>
  </div>
);

export const SectionCard: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, subtitle, icon, action, children, className = '', bodyClassName = '' }) => (
  <section className={`overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 bg-surface-muted/50 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-primary">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h4 className="truncate text-[13px] font-black text-ink">{title}</h4>
          {subtitle && <p className="truncate text-[10.5px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
    <div className={bodyClassName}>{children}</div>
  </section>
);

const ENTITY_LABELS: Record<string, string> = {
  TENANT: 'إدارة',
  ACTIVATION: 'تفعيل',
  CONFIG_PUSH: 'دفع تكوين',
  SUBSCRIPTION: 'اشتراك',
  INVOICE: 'فاتورة',
  PAYMENT: 'دفعة',
  USER: 'مستخدم',
  BRANCH: 'فرع',
  DEVICE: 'جهاز',
  OVERRIDE: 'تجاوز',
  LICENSE: 'ترخيص',
};

const ENTITY_TONES: Record<string, string> = {
  TENANT: 'bg-primary/10 text-primary',
  ACTIVATION: 'bg-success/10 text-success',
  CONFIG_PUSH: 'bg-accent-soft text-primary',
  SUBSCRIPTION: 'bg-warning/10 text-warning',
  INVOICE: 'bg-accent-soft text-primary',
  PAYMENT: 'bg-success/10 text-success',
  USER: 'bg-surface-sunken text-ink-secondary',
  BRANCH: 'bg-surface-sunken text-ink-secondary',
  DEVICE: 'bg-surface-sunken text-ink-secondary',
  OVERRIDE: 'bg-warning/10 text-warning',
  LICENSE: 'bg-success/10 text-success',
};

export const LogList: React.FC<{ entries: PlatformTenantProfile['activityLog']; empty: string }> = ({ entries, empty }) => (
  entries.length === 0 ? (
    <p className="px-4 py-6 text-center text-[11.5px] text-muted">{empty}</p>
  ) : (
    <ol className="relative divide-y divide-line/60">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-center gap-2.5 px-4 py-2.5">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-black ${ENTITY_TONES[entry.entityType] ?? 'bg-surface-sunken text-ink-secondary'}`}>
            {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
          </span>
          <p className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-ink">{entry.action}</p>
          <span className="shrink-0 text-[10px] font-medium text-muted">{entry.actorName || 'النظام'}</span>
          <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[9.5px] font-bold text-muted">{formatDateTime(entry.createdAt)}</span>
        </li>
      ))}
    </ol>
  )
);

/** Maps a health score (0-100) to a tone class pair for badges/bars. */
export const healthTone = (score: number): { bar: string; text: string; label: string } => {
  if (score >= 90) return { bar: 'bg-success', text: 'text-success', label: 'ممتاز' };
  if (score >= 70) return { bar: 'bg-success', text: 'text-success', label: 'جيد' };
  if (score >= 50) return { bar: 'bg-warning', text: 'text-warning', label: 'مقبول' };
  return { bar: 'bg-danger', text: 'text-danger', label: 'ضعيف' };
};

/** Days until a date (negative = past). Returns null when unparsable. */
export const daysUntil = (value?: string | null): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.ceil((time - Date.now()) / 86_400_000);
};

export const ArrowRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M4 12h16" />
  </svg>
);
