import React from 'react';

export const inputCls =
  'w-full px-3 py-2 bg-surface-muted rounded-xl border border-line text-ink text-xs focus:outline-none focus:ring-2 focus:ring-primary/30';
export const labelCls = 'mb-1 block text-xs font-bold text-ink ';

export const Field: React.FC<{ label: string; full?: boolean; children: React.ReactNode }> = ({ label, full, children }) => (
  <div className={full ? 'md:col-span-2' : ''}>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
);

export const NavigationLayoutPreview: React.FC<{ variant: 'sidebar' | 'header' }> = ({ variant }) => (
  <div
    className="flex h-16 w-full gap-1 overflow-hidden rounded-[2px] border border-line bg-surface-muted p-1 "
    aria-hidden="true"
  >
    {variant === 'sidebar' ? (
      <>
        <div className="h-full w-5 shrink-0 rounded-[1px] bg-primary/80" />
        <div className="flex h-full flex-1 flex-col gap-1">
          <div className="h-2.5 w-full rounded-[1px] bg-surface-sunken " />
          <div className="flex-1 rounded-[1px] bg-surface " />
        </div>
      </>
    ) : (
      <div className="flex h-full flex-1 flex-col gap-1">
        <div className="flex h-2.5 items-center gap-1">
          <div className="h-2.5 w-2.5 shrink-0 rounded-[1px] bg-primary" />
          <div className="h-2 w-4 rounded-[1px] bg-surface-sunken " />
          <div className="h-2 w-4 rounded-[1px] bg-surface-sunken " />
          <div className="h-2 w-4 rounded-[1px] bg-surface-sunken " />
          <div className="ms-auto h-2 w-3 rounded-[1px] bg-surface-sunken " />
        </div>
        <div className="flex-1 rounded-[1px] bg-surface " />
      </div>
    )}
  </div>
);

export const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
      checked
        ? 'border-success bg-success-soft text-success dark:border-success/30 dark:bg-success/10 '
        : 'border-line bg-surface-muted text-muted '
    }`}
  >
    <span>{label}</span>
    <span className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-success' : 'bg-surface-sunken dark:bg-primary'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all ${checked ? 'right-0.5' : 'right-4'}`} />
    </span>
  </button>
);

export const ColorInput: React.FC<{ value: string; onChange: (value: string) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <div className="flex items-center gap-2">
    <input type="color" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-transparent disabled:cursor-not-allowed disabled:opacity-50 " />
    <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`${inputCls} font-mono`} />
  </div>
);
