import React from 'react';
import { RotateCcw } from 'lucide-react';
import type { SystemSettings } from '../../../../../types';
import { COLORS } from '../appearanceConstants';
import type { AppearanceOnChange, ColorSettingKey } from '../appearanceTypes';
import { applyDefaultColorSettings } from '../themeStorage';
import { normalizeHex } from '../themeUtils';

interface SystemColorsSectionProps {
  settings: SystemSettings;
  readOnly: boolean;
  onChange: AppearanceOnChange;
  onOpenColorEditor: (key: ColorSettingKey) => void;
}

export const SystemColorsSection: React.FC<SystemColorsSectionProps> = ({
  settings,
  readOnly,
  onChange,
  onOpenColorEditor,
}) => (
  <section className="win-card p-4 sm:p-5">
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-sm font-bold text-[var(--cerami-text)]">ألوان النظام</h3>
        <p className="mt-1 text-xs text-[var(--cerami-muted)]">اضغط على أي لون لتخصيصه بشكل مستقل مع معاينة مباشرة ومعالجة HEX.</p>
      </div>
      <button type="button" className="win-btn" disabled={readOnly} onClick={() => applyDefaultColorSettings(onChange)}>
        <RotateCcw className="h-4 w-4" />
        استعادة جميع الألوان الافتراضية
      </button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {COLORS.map(({ key, label, description, fallback }) => {
        const currentValue = normalizeHex(String(settings[key] || fallback), fallback);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onOpenColorEditor(key)}
            disabled={readOnly}
            className="appearance-color-item group flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--cerami-border)] bg-[var(--cerami-surface)] p-3 text-right transition duration-150 hover:-translate-y-0.5 hover:border-[var(--cerami-primary)] hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="appearance-color-swatch flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-black/5 shadow-inner" style={{ backgroundColor: currentValue }}>
              <span className="h-2.5 w-2.5 rounded-full border border-white/80 shadow-sm" style={{ backgroundColor: currentValue }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[var(--cerami-text)]">{label}</span>
              <span className="mt-1 block text-[11px] text-[var(--cerami-muted)]">{description}</span>
              <span className="mt-1.5 inline-flex rounded-full bg-[var(--cerami-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--cerami-primary)]" style={{ letterSpacing: '0.02em' }}>
                {currentValue.toUpperCase()}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  </section>
);
