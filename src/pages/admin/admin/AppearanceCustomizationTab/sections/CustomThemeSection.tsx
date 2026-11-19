import React from 'react';
import { Copy, Palette, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { AppearanceOnChange, ThemePalette } from '../appearanceTypes';
import { applyThemePalette } from '../themeStorage';
import { contrastRatio } from '../themeUtils';
import { accessibleForeground as getAccessibleForeground } from '../../../../../utils/shared/themeContrast';
import type { ThemeBuilderApi } from '../useThemeBuilder';
import type { CustomThemesApi } from '../useCustomThemes';

interface CustomThemeSectionProps {
  readOnly: boolean;
  onChange: AppearanceOnChange;
  builderApi: ThemeBuilderApi;
  themes: CustomThemesApi;
}

const BUILDER_COLOR_ROWS: Array<{ key: keyof ThemePalette; label: string; description: string }> = [
  { key: 'primary', label: 'اللون الأساسي', description: 'الهوية الأساسية' },
  { key: 'background', label: 'خلفية التطبيق', description: 'خلفية المساحات' },
  { key: 'card', label: 'خلفية البطاقات', description: 'السطوح' },
  { key: 'text', label: 'النص الرئيسي', description: 'العناوين والمحتوى' },
  { key: 'border', label: 'الحدود', description: 'الفواصل' },
  { key: 'success', label: 'النجاح', description: 'حالات النجاح' },
  { key: 'warning', label: 'التحذير', description: 'مؤشرات التنبيه' },
  { key: 'danger', label: 'الخطأ', description: 'الأخطاء' },
  { key: 'info', label: 'معلومات الهوية', description: 'اللون المساند' },
];

export const CustomThemeSection: React.FC<CustomThemeSectionProps> = ({
  readOnly,
  onChange,
  builderApi,
  themes,
}) => {
  const {
    builder,
    builderHexDrafts,
    builderHexErrors,
    updateBuilderColor,
    canApplyBuilder,
    builderContrastIssues,
    restoreBuilderDefaults,
  } = builderApi;
  const {
    customThemes,
    customThemeName,
    setCustomThemeName,
    customThemeId,
    saveCustomTheme,
    applyCustomTheme,
    deleteCustomTheme,
    duplicateCurrentTheme,
    loadCustomThemeIntoBuilder,
  } = themes;
  const builderTextOnPrimary = getAccessibleForeground(builder.primary);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
      <section className="win-card p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-[var(--cerami-text)]">المحرر المخصص للألوان</h3>
          <p className="mt-1 text-xs text-[var(--cerami-muted)]">أنشئ ثيمًا مخصصًا ثم احفظه واستخدمه لاحقًا في أي وقت.</p>
        </div>

        <div className="space-y-3">
          {BUILDER_COLOR_ROWS.map(({ key, label, description }) => (
            <label key={key} className="grid gap-2 rounded-md border border-[var(--cerami-border)] p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <input
                type="color"
                value={builder[key]}
                onChange={(event) => updateBuilderColor(key, event.target.value)}
                disabled={readOnly}
                className="h-10 w-12 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed"
                aria-label={label}
              />
              <div className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--cerami-text)]">{label}</span>
                <span className="block text-xs text-[var(--cerami-muted)]">{description}</span>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <input
                  type="text"
                  value={builderHexDrafts[key]}
                  onChange={(event) => updateBuilderColor(key, event.target.value)}
                  disabled={readOnly}
                  dir="ltr"
                  aria-invalid={Boolean(builderHexErrors[key])}
                  aria-describedby={builderHexErrors[key] ? `builder-${key}-error` : undefined}
                  className="w-[92px] rounded-md border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-2 py-1 text-xs text-[var(--cerami-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cerami-primary)]"
                  aria-label={`${label} HEX`}
                />
              </div>
              {builderHexErrors[key] && (
                <p id={`builder-${key}-error`} className="text-xs text-[var(--cerami-danger)] sm:col-span-3" role="alert">
                  {builderHexErrors[key]}
                </p>
              )}
            </label>
          ))}
        </div>

        <div
          className="mt-4 rounded-md border p-3"
          style={{ backgroundColor: builder.background, borderColor: builder.border, color: builder.text }}
          aria-label="معاينة ألوان الثيم المخصص"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold">معاينة الثيم الخاص بك</p>
              <p className="mt-1 text-[10px]" style={{ opacity: 0.72 }}>الخلفية والسطوح والأزرار وحالات النظام</p>
            </div>
            <button type="button" className="rounded-md px-2.5 py-1.5 text-xs font-bold" style={{ backgroundColor: builder.primary, color: builderTextOnPrimary }}>
              زر أساسي
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-md border p-2" style={{ backgroundColor: builder.card, borderColor: builder.border }}>
              <p className="text-[10px]">بطاقة معاينة</p>
              <p className="mt-1 text-xs font-bold">{customThemeName || 'الثيم الخاص بي'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-2" style={{ backgroundColor: builder.card, borderColor: builder.border }}>
              {[
                { label: 'نجاح', color: builder.success },
                { label: 'تنبيه', color: builder.warning },
                { label: 'خطأ', color: builder.danger },
              ].map((status) => (
                <span key={status.label} className="rounded px-1.5 py-1 text-[10px] font-semibold" style={{ backgroundColor: status.color, color: contrastRatio('#FFFFFF', status.color) >= contrastRatio('#000000', status.color) ? '#FFFFFF' : '#000000' }}>
                  {status.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="win-btn win-btn--primary" disabled={readOnly || !canApplyBuilder || builderContrastIssues > 0} onClick={() => applyThemePalette(builder, onChange)}>
            <Palette className="h-4 w-4" />
            تطبيق الألوان الحالية
          </button>
          <button type="button" className="win-btn" disabled={readOnly} onClick={restoreBuilderDefaults}>
            <RotateCcw className="h-4 w-4" />
            إعادة الافتراضي
          </button>
        </div>
        {builderContrastIssues > 0 && (
          <p className="mt-3 rounded-md border border-[var(--cerami-warning-border)] bg-[var(--cerami-warning-soft)] px-3 py-2 text-xs text-[var(--cerami-warning)]" role="status">
            لا يمكن تطبيق هذا الثيم قبل تحسين تباين النص مع الخلفيات ونص الزر مع اللون الأساسي إلى 4.5:1 على الأقل.
          </p>
        )}
      </section>

      <section className="win-card p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-bold text-[var(--cerami-text)]">حفظ الثيم المخصص</h3>
          <p className="mt-1 text-xs text-[var(--cerami-muted)]">احفظ أكثر من تصميم، ثم عد إلى كلٍ منها في لحظات.</p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">اسم الثيم</span>
            <input
              value={customThemeName}
              onChange={(event) => setCustomThemeName(event.target.value)}
              maxLength={64}
              disabled={readOnly}
              className="w-full rounded-md border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-3 py-2 text-sm text-[var(--cerami-text)] focus:border-[var(--cerami-primary)] focus:outline-none"
              placeholder="مثل: ألوان شركتي"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="win-btn win-btn--primary" disabled={readOnly || !canApplyBuilder || builderContrastIssues > 0} onClick={() => saveCustomTheme(Boolean(customThemeId))}>
              <Save className="h-4 w-4" />
              {customThemeId ? 'تحديث الثيم' : 'حفظ الثيم'}
            </button>
            <button type="button" className="win-btn" disabled={readOnly || !canApplyBuilder || builderContrastIssues > 0} onClick={duplicateCurrentTheme}>
              <Copy className="h-4 w-4" />
              نسخ
            </button>
            <button type="button" className="win-btn" disabled={readOnly || !customThemeId} onClick={() => customThemeId && deleteCustomTheme(customThemeId)}>
              <Trash2 className="h-4 w-4" />
              حذف
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-[var(--cerami-primary)]" />
            <h4 className="text-xs font-bold text-[var(--cerami-text)]">الثيمات المحفوظة</h4>
          </div>
          {customThemes.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--cerami-border)] bg-[var(--cerami-surface-muted)] p-3 text-xs text-[var(--cerami-muted)]">
              لا توجد ثيمات مخصصة حتى الآن. احفظ تصميمك الأول لتسترجعه لاحقًا.
            </p>
          ) : (
            <div className="space-y-2">
              {customThemes.map((theme) => (
                <div key={theme.id} className="flex items-center justify-between gap-2 rounded-md border border-[var(--cerami-border)] bg-[var(--cerami-surface)] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border border-white" style={{ backgroundColor: theme.colors.primary }} />
                    <div>
                      <div className="text-xs font-semibold text-[var(--cerami-text)]">{theme.name}</div>
                      <div className="text-[10px] text-[var(--cerami-muted)]">{theme.colors.primary.toUpperCase()}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="win-btn win-btn--sm" disabled={readOnly} onClick={() => applyCustomTheme(theme)}>تطبيق</button>
                    <button type="button" className="win-btn win-btn--sm" disabled={readOnly} onClick={() => loadCustomThemeIntoBuilder(theme)}>تعديل</button>
                    <button type="button" className="win-btn win-btn--sm" disabled={readOnly} onClick={() => deleteCustomTheme(theme.id)}>حذف</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
