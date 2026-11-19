import React from 'react';
import { Palette, RotateCcw } from 'lucide-react';
import type { StorageNotice } from '../appearanceTypes';

interface StudioHeaderSectionProps {
  storageNotice: StorageNotice | null;
  readOnly: boolean;
  onRestoreDefaults: () => void;
}

export const StudioHeaderSection: React.FC<StudioHeaderSectionProps> = ({
  storageNotice,
  readOnly,
  onRestoreDefaults,
}) => (
  <section className="win-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--cerami-accent-soft)] text-[var(--cerami-primary)]">
          <Palette className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-bold text-[var(--cerami-text)]">استوديو مظهر النظام</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--cerami-muted)]">
            مركز تخصيص المظهر بالكامل: ثيمات جاهزة، وضع فاتح/داكن، ألوان مخصصة، وحفظ بصيغ متعددة مع معاينة فورية.
          </p>
        </div>
      </div>
      <button type="button" className="win-btn" onClick={onRestoreDefaults} disabled={readOnly}>
        <RotateCcw className="h-4 w-4" />
        استعادة المظهر الافتراضي
      </button>
    </div>
    {storageNotice && (
      <p className={`mt-4 rounded-md border px-3 py-2 text-sm ${storageNotice.type === 'error' ? 'border-[var(--cerami-danger)]/30 bg-[var(--cerami-danger)]/10 text-[var(--cerami-danger)]' : 'border-[var(--cerami-success)]/30 bg-[var(--cerami-success)]/10 text-[var(--cerami-success)]'}`} role={storageNotice.type === 'error' ? 'alert' : 'status'}>
        {storageNotice.text}
      </p>
    )}
    {readOnly && (
      <p className="mt-4 rounded-md border border-[var(--cerami-warning-border)] bg-[var(--cerami-warning-soft)] px-3 py-2 text-sm text-[var(--cerami-warning)]" role="status">
        يمكنك معاينة الإعدادات، لكن يلزم امتلاك صلاحية تعديل الإعدادات لحفظها.
      </p>
    )}
  </section>
);
