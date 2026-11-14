import React from 'react';

export function formatMoney(value: number, currency = 'EGP'): string {
  try {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  } catch {
    return `${Number(value || 0).toLocaleString('ar-EG')} ${currency}`;
  }
}

export function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 });
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

const TONE_MAP: Record<string, string> = {
  ACTIVE: 'success',
  TRIAL: 'warning',
  SUSPENDED: 'danger',
  EXPIRED: 'danger',
  EXPIRING: 'warning',
  CANCELLED: 'neutral',
  ISSUED: 'primary',
  REVOKED: 'danger',
  PAID: 'success',
  PARTIAL: 'warning',
  SENT: 'primary',
  OVERDUE: 'danger',
  DRAFT: 'neutral',
  VOID: 'neutral',
  PUBLISHED: 'success',
  DEPRECATED: 'warning',
  STABLE: 'success',
  BETA: 'warning',
  NIGHTLY: 'neutral',
};

const BADGE_CLASS: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  danger: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
  primary: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

export const StatusBadge: React.FC<{ value: string; label?: string }> = ({ value, label }) => {
  const tone = TONE_MAP[value] || 'neutral';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${BADGE_CLASS[tone]}`}>
      {label || value}
    </span>
  );
};

export const Toggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
      checked ? 'bg-emerald-600' : 'bg-slate-300'
    }`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
        checked ? '-translate-x-4' : '-translate-x-0.5'
      }`}
    />
  </button>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; description?: string }> = ({ icon, title, description }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
    {icon && <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">{icon}</span>}
    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</p>
    {description && <p className="max-w-md text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
  </div>
);

export const Field: React.FC<{ label: string; hint?: string; required?: boolean; children: React.ReactNode; className?: string }> = ({
  label, hint, required, children, className = '',
}) => (
  <label className={`block ${className}`}>
    <span className="mb-1 block text-[11.5px] font-semibold text-slate-700">
      {label} {required && <span className="text-rose-500">*</span>}
    </span>
    {children}
    {hint && <span className="mt-1 block text-[10.5px] text-slate-500">{hint}</span>}
  </label>
);

export const inputClass =
  'win-input w-full text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600';

export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>): void {
  const escape = (cell: string | number | null | undefined) => {
    const text = cell === null || cell === undefined ? '' : String(cell);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = `\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
