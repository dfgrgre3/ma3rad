import React from 'react';

export const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/30';
export const labelCls = 'mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300';

export const Field: React.FC<{ label: string; full?: boolean; children: React.ReactNode }> = ({ label, full, children }) => (
  <div className={full ? 'md:col-span-2' : ''}>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
);

export const NavigationLayoutPreview: React.FC<{ variant: 'sidebar' | 'header' }> = ({ variant }) => (
  <div
    className="flex h-16 w-full gap-1 overflow-hidden rounded-[2px] border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800"
    aria-hidden="true"
  >
    {variant === 'sidebar' ? (
      <>
        <div className="h-full w-5 shrink-0 rounded-[1px] bg-sky-500/80" />
        <div className="flex h-full flex-1 flex-col gap-1">
          <div className="h-2.5 w-full rounded-[1px] bg-slate-300 dark:bg-slate-600" />
          <div className="flex-1 rounded-[1px] bg-white dark:bg-slate-900" />
        </div>
      </>
    ) : (
      <div className="flex h-full flex-1 flex-col gap-1">
        <div className="flex h-2.5 items-center gap-1">
          <div className="h-2.5 w-2.5 shrink-0 rounded-[1px] bg-sky-500" />
          <div className="h-2 w-4 rounded-[1px] bg-slate-300 dark:bg-slate-600" />
          <div className="h-2 w-4 rounded-[1px] bg-slate-300 dark:bg-slate-600" />
          <div className="h-2 w-4 rounded-[1px] bg-slate-300 dark:bg-slate-600" />
          <div className="mr-auto h-2 w-3 rounded-[1px] bg-slate-300 dark:bg-slate-600" />
        </div>
        <div className="flex-1 rounded-[1px] bg-white dark:bg-slate-900" />
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
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
        : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
    }`}
  >
    <span>{label}</span>
    <span className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'right-0.5' : 'right-4'}`} />
    </span>
  </button>
);

export const ColorInput: React.FC<{ value: string; onChange: (value: string) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <div className="flex items-center gap-2">
    <input type="color" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700" />
    <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`${inputCls} font-mono`} />
  </div>
);
