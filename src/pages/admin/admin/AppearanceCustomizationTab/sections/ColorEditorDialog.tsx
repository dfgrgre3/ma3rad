import React from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { isValidHex, normalizeHex } from '../themeUtils';
import type { ColorEditorApi } from '../useColorEditor';

interface ColorEditorDialogProps {
  editor: ColorEditorApi;
  readOnly: boolean;
}

export const ColorEditorDialog: React.FC<ColorEditorDialogProps> = ({ editor, readOnly }) => {
  const {
    activeColorKey,
    colorDialogRef,
    draftColor,
    setDraftColor,
    hexInput,
    setHexInput,
    hexError,
    setHexError,
    copyFeedback,
    closeColorEditor,
    applySelectedColor,
    restoreSelectedColor,
    handleDraftHexChange,
    copySelectedHex,
    selectedColorConfig,
    selectedCurrentValue,
    selectedPalette,
    draftTextColor,
  } = editor;

  if (!selectedColorConfig || !activeColorKey) return null;

  return (
    <div className="appearance-color-backdrop fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeColorEditor();
    }}>
      <div
        ref={colorDialogRef}
        className="appearance-color-modal max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-[var(--cerami-border)] bg-[var(--cerami-surface)] p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="appearance-color-dialog-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--cerami-border)] pb-3">
          <div>
            <p className="text-[11px] font-semibold text-[var(--cerami-muted)]">محرر الألوان</p>
            <h3 id="appearance-color-dialog-title" className="mt-1 text-lg font-bold text-[var(--cerami-text)]">تخصيص {selectedColorConfig.label}</h3>
          </div>
          <button type="button" className="win-btn win-btn--sm" onClick={closeColorEditor}>إغلاق</button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--cerami-border)] bg-[var(--cerami-accent-soft)] p-3">
              <p className="text-xs font-semibold text-[var(--cerami-text-secondary)]">الوصف</p>
              <p className="mt-1 text-sm leading-6 text-[var(--cerami-text)]">{selectedColorConfig.description}</p>
            </div>

            <div className="rounded-xl border border-[var(--cerami-border)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[var(--cerami-text-secondary)]">اللون الحالي</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--cerami-text)]">{selectedCurrentValue.toUpperCase()}</p>
                </div>
                <span className="h-10 w-10 rounded-lg border border-black/5 shadow-inner" style={{ backgroundColor: selectedCurrentValue }} />
              </div>
            </div>

            <div className="appearance-color-preview rounded-xl border border-[var(--cerami-border)] p-3">
              <p className="text-xs font-semibold text-[var(--cerami-text-secondary)]">معاينة مباشرة</p>
              <div className="mt-3 rounded-lg border border-[var(--cerami-border)] p-3" style={{ backgroundColor: draftColor }}>
                <div className="flex items-center justify-between gap-2 rounded-md border border-white/30 bg-surface/10 px-3 py-2 text-xs font-semibold shadow-sm" style={{ color: draftTextColor }}>
                  <span>نموذج تطبيق</span>
                  <span className="rounded-full bg-black/10 px-2 py-0.5">{draftColor.toUpperCase()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">اختيار اللون</span>
              <div className="flex items-center gap-2 rounded-md border border-[var(--cerami-border)] bg-[var(--cerami-surface)] p-2">
                <input
                  type="color"
                  value={draftColor}
                  onChange={(event) => {
                    const next = normalizeHex(event.target.value, draftColor);
                    setDraftColor(next);
                    setHexInput(next);
                    setHexError('');
                  }}
                  disabled={readOnly}
                  className="h-10 w-12 cursor-pointer rounded-md border border-[var(--cerami-border)] bg-transparent"
                />
                <span className="text-xs font-semibold text-[var(--cerami-text)]">{draftColor.toUpperCase()}</span>
                <button
                  type="button"
                  className="win-btn win-btn--sm ms-auto"
                  onClick={copySelectedHex}
                  disabled={readOnly || !isValidHex(draftColor)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copyFeedback ?? 'نسخ HEX'}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">HEX</span>
              <input
                id="appearance-color-hex"
                value={hexInput}
                onChange={(event) => handleDraftHexChange(event.target.value)}
                placeholder="#3B6EAE"
                disabled={readOnly}
                dir="ltr"
                aria-invalid={Boolean(hexError)}
                aria-describedby={hexError ? 'appearance-color-hex-error' : undefined}
                className="w-full rounded-md border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-3 py-2 text-sm text-[var(--cerami-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cerami-primary)]"
              />
              {hexError && <p id="appearance-color-hex-error" className="mt-1 text-xs text-[var(--cerami-danger)]" role="alert">{hexError}</p>}
            </label>

            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--cerami-text-secondary)]">ألوان مقترحة</p>
              <div className="appearance-color-presets grid grid-cols-5 gap-2">
                {selectedPalette.map((swatch) => (
                  <button
                    key={`${activeColorKey}-${swatch}`}
                    type="button"
                    title={swatch}
                    onClick={() => {
                      const normalized = normalizeHex(swatch, draftColor);
                      setDraftColor(normalized);
                      setHexInput(normalized);
                      setHexError('');
                    }}
                    disabled={readOnly}
                    className="h-9 rounded-md border border-black/5 transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cerami-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: swatch }}
                    aria-label={`تحديد ${swatch}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="win-btn" onClick={closeColorEditor}>إلغاء</button>
          <button
            type="button"
            className="win-btn"
            disabled={readOnly}
            onClick={restoreSelectedColor}
          >
            <RotateCcw className="h-4 w-4" />
            استعادة الافتراضي
          </button>
          <button
            type="button"
            className="win-btn win-btn--primary"
            disabled={readOnly || !!hexError || !isValidHex(draftColor)}
            onClick={applySelectedColor}
          >
            <Check className="h-4 w-4" />
            تطبيق اللون
          </button>
        </div>
      </div>
    </div>
  );
};
