import React from 'react';
import type { SystemSettings } from '../../../../types';
import { DEFAULT_CUSTOM_THEME, THEME_COLOR_KEYS } from './appearanceConstants';
import type { ThemePalette } from './appearanceTypes';
import { buildPaletteFromSettings } from './themeStorage';
import { accessibleForeground as getAccessibleForeground } from '../../../../utils/shared/themeContrast';
import { isValidHex, normalizeHex, paletteContrastIssues } from './themeUtils';

export interface ThemeBuilderApi {
  builder: ThemePalette;
  builderHexDrafts: Record<keyof ThemePalette, string>;
  builderHexErrors: Partial<Record<keyof ThemePalette, string>>;
  setBuilder: React.Dispatch<React.SetStateAction<ThemePalette>>;
  setBuilderHexDrafts: React.Dispatch<React.SetStateAction<Record<keyof ThemePalette, string>>>;
  setBuilderHexErrors: React.Dispatch<React.SetStateAction<Partial<Record<keyof ThemePalette, string>>>>;
  updateBuilderColor: (key: keyof ThemePalette, value: string) => void;
  canApplyBuilder: boolean;
  builderContrastIssues: number;
  builderTextOnPrimary: string;
  restoreBuilderDefaults: () => void;
}

export function useThemeBuilder(settings: SystemSettings): ThemeBuilderApi {
  const [builder, setBuilder] = React.useState<ThemePalette>(() => buildPaletteFromSettings(settings));
  const [builderHexDrafts, setBuilderHexDrafts] = React.useState<Record<keyof ThemePalette, string>>(() => buildPaletteFromSettings(settings));
  const [builderHexErrors, setBuilderHexErrors] = React.useState<Partial<Record<keyof ThemePalette, string>>>({});

  React.useEffect(() => {
    const palette = buildPaletteFromSettings(settings);
    setBuilder(palette);
    setBuilderHexDrafts(palette);
    setBuilderHexErrors({});
  }, [settings]);

  const updateBuilderColor = (key: keyof ThemePalette, value: string) => {
    setBuilderHexDrafts((current) => ({ ...current, [key]: value }));
    if (!isValidHex(value)) {
      setBuilderHexErrors((current) => ({ ...current, [key]: 'أدخل لون HEX صالحًا مثل #3B6EAE.' }));
      return;
    }
    const normalized = normalizeHex(value, builder[key]);
    setBuilder((current) => ({ ...current, [key]: normalized }));
    setBuilderHexErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const canApplyBuilder = THEME_COLOR_KEYS.every((key) => isValidHex(builderHexDrafts[key]) && !builderHexErrors[key]);
  const builderContrastIssues = paletteContrastIssues(builder);
  const builderTextOnPrimary = getAccessibleForeground(builder.primary);

  const restoreBuilderDefaults = () => {
    setBuilder({ ...DEFAULT_CUSTOM_THEME });
    setBuilderHexDrafts({ ...DEFAULT_CUSTOM_THEME });
    setBuilderHexErrors({});
  };

  return {
    builder,
    builderHexDrafts,
    builderHexErrors,
    setBuilder,
    setBuilderHexDrafts,
    setBuilderHexErrors,
    updateBuilderColor,
    canApplyBuilder,
    builderContrastIssues,
    builderTextOnPrimary,
    restoreBuilderDefaults,
  };
}
