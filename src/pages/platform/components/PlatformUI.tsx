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
  success: 'bg-success-soft text-success border-success-border dark:bg-success/30 ',
  warning: 'bg-warning-soft text-warning border-warning-border dark:bg-warning/30 ',
  danger: 'bg-danger-soft text-danger border-danger-border dark:bg-danger/30 ',
  primary: 'bg-accent-soft text-primary border-accent-border dark:bg-primary/30 ',
  neutral: 'bg-surface-sunken text-ink-secondary border-line ',
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
      checked ? 'bg-success' : 'bg-surface-sunken'
    }`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-surface shadow transition-transform ${
 checked ? '-translate-x-4' : '-translate-x-0.5'
 }`}
    />
  </button>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; description?: string }> = ({ icon, title, description }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
    {icon && <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-muted ">{icon}</span>}
    <p className="text-sm font-bold text-ink ">{title}</p>
    {description && <p className="max-w-md text-xs leading-6 text-muted ">{description}</p>}
  </div>
);

export const Field: React.FC<{ label: string; hint?: string; required?: boolean; children: React.ReactNode; className?: string }> = ({
  label, hint, required, children, className = '',
}) => (
  <label className={`block ${className}`}>
    <span className="mb-1 block text-[11.5px] font-semibold text-ink">
      {label} {required && <span className="text-danger">*</span>}
    </span>
    {required
      ? React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, { required: true })
            : child
        )
      : children}
    {hint && <span className="mt-1 block text-[10.5px] text-muted">{hint}</span>}
  </label>
);

export const inputClass =
  'win-input w-full text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40 dark:bg-primary dark:text-muted dark:border-line-strong';

export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>): void {
  const escape = (cell: string | number | null | undefined) => {
    let text = cell === null || cell === undefined ? '' : String(cell);
    // CSV formula injection guard: prefix cells that spreadsheet apps would
    // evaluate as formulas (=, +, -, @, tab, CR).
    if (/^[=+\-@\t\r]/.test(text)) {
      text = `'${text}`;
    }
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
