import React from 'react';
import { Check, Search } from 'lucide-react';
import type { SystemSettings } from '../../../../../types';
import { FILTERS } from '../appearanceConstants';
import type { AppearanceOnChange, ThemeFilter } from '../appearanceTypes';
import { THEME_PRESETS, isPresetThemeActive } from '../themePresets';
import { applyThemePalette } from '../themeStorage';
import { contrastRatio } from '../themeUtils';

interface PresetThemesSectionProps {
  settings: SystemSettings;
  readOnly: boolean;
  onChange: AppearanceOnChange;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  themeFilter: ThemeFilter;
  setThemeFilter: React.Dispatch<React.SetStateAction<ThemeFilter>>;
}

export const PresetThemesSection: React.FC<PresetThemesSectionProps> = ({
  settings,
  readOnly,
  onChange,
  searchQuery,
  setSearchQuery,
  themeFilter,
  setThemeFilter,
}) => {
  const filteredThemes = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return THEME_PRESETS.filter((theme) => {
      const matchesFilter = themeFilter === 'all' || theme.category === themeFilter;
      const matchesSearch = !query || theme.name.toLowerCase().includes(query) || theme.description.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [searchQuery, themeFilter]);

  return (
    <section className="win-card p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--cerami-text)]">الثيمات الجاهزة</h3>
          <p className="mt-1 text-xs text-[var(--cerami-muted)]">{THEME_PRESETS.length} ثيمًا متكاملًا مع تصنيفات جاهزة وبحث، مناسب للاستخدام اليومي.</p>
        </div>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="relative sm:min-w-[220px]">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cerami-muted)]" />
            <input
              id="appearance-theme-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="البحث في الثيمات الجاهزة"
              className="w-full rounded-md border border-[var(--cerami-border)] bg-[var(--cerami-surface)] py-2 pr-9 pl-3 text-sm text-[var(--cerami-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cerami-primary)]"
              placeholder="ابحث عن اسم الثيم"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                type="button"
                key={filter.value}
                onClick={() => setThemeFilter(filter.value)}
                aria-pressed={themeFilter === filter.value}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  themeFilter === filter.value
                    ? 'border-[var(--cerami-primary)] bg-[var(--cerami-primary)] text-white'
                    : 'border-[var(--cerami-border)] bg-[var(--cerami-surface)] text-[var(--cerami-text)]'
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cerami-primary)]`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {filteredThemes.length === 0 && (
          <p className="rounded-md border border-dashed border-[var(--cerami-border)] p-4 text-sm text-[var(--cerami-muted)]" role="status">
            لم نعثر على ثيمات تطابق البحث. جرّب كلمة أخرى أو اختر تصنيفًا مختلفًا.
          </p>
        )}
        {filteredThemes.map((theme) => (
          <div
            key={theme.id}
            className={`overflow-hidden rounded-xl border p-3 transition ${isPresetThemeActive(theme, settings) ? 'border-[var(--cerami-primary)] ring-2 ring-[var(--cerami-accent-soft)]' : 'border-[var(--cerami-border)]'}`}
            style={{ backgroundColor: theme.colors.card }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold" style={{ color: theme.colors.text }}>{theme.name}</h4>
                <p className="mt-1 text-[11px]" style={{ color: theme.colors.text, opacity: 0.72 }}>{theme.description}</p>
              </div>
              {isPresetThemeActive(theme, settings) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--cerami-primary)] bg-[var(--cerami-accent-soft)] px-2 py-1 text-[10px] font-bold text-[var(--cerami-primary)]">
                  <Check className="h-3.5 w-3.5" />
                  نشط
                </span>
              )}
            </div>

            <div className="rounded-lg border p-2" style={{ backgroundColor: theme.colors.background, borderColor: theme.colors.border }}>
              <div className="mb-2 flex gap-2 rounded-md p-2" style={{ backgroundColor: theme.colors.card }}>
                <span className="h-7 w-7 rounded-md" style={{ backgroundColor: theme.colors.primary }} />
                <span className="h-7 flex-1 rounded-md" style={{ backgroundColor: `color-mix(in srgb, ${theme.colors.primary} 10%, ${theme.colors.card})` }} />
                <span className="h-7 w-7 rounded-md" style={{ backgroundColor: theme.colors.info }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border p-2" style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
                  <div className="mb-2 h-5 w-2/3 rounded-sm" style={{ backgroundColor: theme.colors.primary }} />
                  <div className="h-8 rounded-md" style={{ backgroundColor: `color-mix(in srgb, ${theme.colors.primary} 10%, ${theme.colors.card})` }} />
                </div>
                <div className="rounded-md border p-2" style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
                  <div className="mb-2 flex gap-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.colors.success }} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.colors.warning }} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.colors.danger }} />
                  </div>
                  <div className="h-8 rounded-md" style={{ backgroundColor: theme.colors.primary, opacity: 0.15 }} />
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              {[theme.colors.primary, theme.colors.info, theme.colors.success, theme.colors.warning, theme.colors.danger].map((color, index) => (
                <span key={`${theme.id}-${index}`} className="h-5 w-5 rounded-full border border-white shadow-sm" style={{ backgroundColor: color }} />
              ))}
            </div>

            <button
              type="button"
              className="mt-3 w-full rounded-md px-3 py-2 text-sm font-bold text-white transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cerami-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: theme.colors.primary,
                color: contrastRatio('#FFFFFF', theme.colors.primary) >= contrastRatio('#000000', theme.colors.primary) ? '#FFFFFF' : '#000000',
              }}
              disabled={readOnly}
              aria-pressed={isPresetThemeActive(theme, settings)}
              onClick={() => applyThemePalette(theme.colors, onChange)}
            >
              تطبيق الثيم
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};
