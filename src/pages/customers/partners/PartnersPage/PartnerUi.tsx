import React from 'react';
import { Users } from 'lucide-react';
import { Modal } from '../../../../components/ui/Modal';

export const SummaryCard: React.FC<{
  label: string;
  value: string;
  icon: typeof Users;
  tone?: 'sky' | 'emerald' | 'amber' | 'rose';
}> = ({ label, value, icon: Icon, tone = 'sky' }) => {
  const tones = {
    sky: 'bg-[var(--win-accent-soft)] text-[var(--win-accent-readable)]',
    emerald: 'bg-[var(--win-success-soft)] text-[var(--win-success-text)]',
    amber: 'bg-[var(--win-warning-soft)] text-[var(--win-warning-text)]',
    rose: 'bg-[var(--win-danger-soft)] text-[var(--win-danger-text)]',
  };
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[var(--win-radius)] border border-[var(--win-border)] bg-[var(--win-surface)] p-3">
      <span className={`rounded-[var(--ui-radius-sm)] p-1.5 ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0"><p className="truncate text-[var(--ui-font-xs)] font-bold text-[var(--win-text-muted)]">{label}</p><p className="mt-0.5 truncate text-[var(--ui-font-md)] font-extrabold text-[var(--win-text)]">{value}</p></div>
    </div>
  );
};

export const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <Modal open onClose={onClose} title={title} size="lg">
    {children}
  </Modal>
);

export const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <label className="block space-y-1 text-xs font-bold text-slate-600 dark:text-slate-300">
    <span>{label}{required && <span className="text-rose-600"> *</span>}</span>
    {React.cloneElement(children as React.ReactElement<{ className?: string }>, {
      className: 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
    })}
  </label>
);

export const ModalActions: React.FC<{ onCancel: () => void; saving: boolean; submitLabel: string }> = ({ onCancel, saving, submitLabel }) => (
  <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
    <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">إلغاء</button>
    <button type="submit" disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'جارٍ الحفظ...' : submitLabel}</button>
  </div>
);
