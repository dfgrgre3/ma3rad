import React from 'react';
import type { PlatformTenantProfile } from '../../../services/domains/platform/platformTypes';
import { formatDateTime } from '../components/PlatformUI';

export const InfoItem: React.FC<{ label: string; value: React.ReactNode; ltr?: boolean }> = ({ label, value, ltr }) => (
  <div className="rounded-lg border border-line bg-surface px-3 py-2">
    <dt className="text-[10.5px] font-semibold text-muted">{label}</dt>
    <dd className={`mt-0.5 text-[12px] font-bold text-ink ${ltr ? 'font-mono' : ''}`} dir={ltr ? 'ltr' : undefined}>
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
}> = ({ title, subtitle, icon, action, children }) => (
  <section className="rounded-xl border border-line bg-surface shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-secondary">{icon}</span>}
        <div className="min-w-0">
          <h4 className="truncate text-[12.5px] font-bold text-ink">{title}</h4>
          {subtitle && <p className="truncate text-[10.5px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
    {children}
  </section>
);

export const LogList: React.FC<{ entries: PlatformTenantProfile['activityLog']; empty: string }> = ({ entries, empty }) => (
  entries.length === 0 ? (
    <p className="px-3 py-4 text-[11px] text-muted">{empty}</p>
  ) : (
    <ol className="divide-y divide-line-strong">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[9.5px] font-bold text-ink-secondary">
            {entry.entityType === 'ACTIVATION' ? 'تفعيل' : entry.entityType === 'TENANT' ? 'إدارة' : entry.entityType}
          </span>
          <p className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-ink">{entry.action}</p>
          <span className="shrink-0 text-[10px] text-muted">{entry.actorName || 'النظام'}</span>
          <span className="shrink-0 text-[10px] text-muted">{formatDateTime(entry.createdAt)}</span>
        </li>
      ))}
    </ol>
  )
);

export const ArrowRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M4 12h16" />
  </svg>
);
