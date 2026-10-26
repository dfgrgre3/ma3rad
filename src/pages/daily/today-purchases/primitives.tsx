import React from 'react';
import { ArrowUpDown, TrendingDown, TrendingUp } from 'lucide-react';
import { PAY_LABEL, STATUS_BADGE } from './constants';
import { sortIndicator } from './helpers';
import type { SortDir, SortKey } from './types';

export const Panel: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, icon: Icon, action, className = '', children }) => (
  <section className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-5 ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-start gap-2">
        {Icon && (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div>
          <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

export const Metric: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: string;
  featured?: boolean;
  delta?: number | null;
}> = ({ label, value, hint, tone, featured, delta }) => (
  <div className={`min-w-0 rounded-xl border p-4 ${featured
    ? 'border-slate-800 bg-slate-900 text-white dark:border-slate-700'
    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
    <p className={`text-[11px] font-bold ${featured ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>{label}</p>
    <p className={`mt-2 whitespace-normal break-words text-sm font-black leading-snug tabular-nums [overflow-wrap:anywhere] min-[400px]:text-base sm:text-lg xl:text-xl ${featured ? 'text-orange-300' : tone || 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
    <div className={`mt-1 flex flex-wrap items-center gap-1.5 text-[11px] ${featured ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
      {hint && <span className="break-words [overflow-wrap:anywhere]">{hint}</span>}
      {typeof delta === 'number' && Number.isFinite(delta) && (
        <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-bold tabular-nums ${delta >= 0
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}`}>
          {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(delta).toLocaleString('ar-EG', { maximumFractionDigits: 1 })}%
        </span>
      )}
    </div>
  </div>
);

export const MiniStat: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-1 truncate text-sm font-black tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
    {hint && <p className="mt-0.5 truncate text-[10px] text-slate-400">{hint}</p>}
  </div>
);

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
    {PAY_LABEL[status] || status || '—'}
  </span>
);

/** Share-of-total bar used by the items and suppliers tables. */
export const ShareBar: React.FC<{ share: number }> = ({ share }) => (
  <div className="flex min-w-[80px] items-center gap-1.5">
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.max(share, 2)}%` }} />
    </div>
    <span className="w-9 text-left text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{share.toLocaleString('ar-EG', { maximumFractionDigits: 1 })}%</span>
  </div>
);

export const SortableTh: React.FC<{
  label: string;
  columnKey: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}> = ({ label, columnKey, sortKey, sortDir, onSort }) => (
  <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">
    <button type="button" onClick={() => onSort(columnKey)} className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
      {label} <ArrowUpDown className="h-3 w-3" /> <span aria-hidden="true">{sortIndicator(sortKey, sortDir, columnKey)}</span>
    </button>
  </th>
);
