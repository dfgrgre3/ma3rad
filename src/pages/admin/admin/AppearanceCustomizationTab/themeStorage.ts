import type { SystemSettings } from '../../../../types';
import { DEFAULTS, DEFAULT_CUSTOM_THEME, THEME_COLOR_KEYS, CUSTOM_THEME_STORAGE_KEY } from './appearanceConstants';
import type {
  AppearanceOnChange,
  CustomThemeRecord,
  ThemePalette,
} from './appearanceTypes';
import { isValidHex, normalizeHex } from './themeUtils';

export const buildPaletteFromSettings = (settings: SystemSettings): ThemePalette => ({
  primary: normalizeHex(settings.brandPrimaryColor || '#34445a', '#34445a'),
  hover: normalizeHex(settings.brandAccentColor || '#2D3C50', '#2D3C50'),
  soft: '#E9EDF2',
  background: normalizeHex(settings.uiCanvasColor || '#F5F6F8', '#F5F6F8'),
  card: normalizeHex(settings.uiSurfaceColor || '#FFFFFF', '#FFFFFF'),
  sidebar: '#EDF2F7',
  active: '#DDE7F2',
  text: normalizeHex(settings.uiTextColor || '#252B36', '#252B36'),
  secondaryText: '#5B6D80',
  border: normalizeHex(settings.uiBorderColor || '#E1E5EA', '#E1E5EA'),
  success: normalizeHex(settings.uiSuccessColor || '#39765B', '#39765B'),
  warning: normalizeHex(settings.uiWarningColor || '#8A6A35', '#8A6A35'),
  danger: normalizeHex(settings.uiDangerColor || '#A95050', '#A95050'),
  info: normalizeHex(settings.brandAccentColor || '#64748B', '#64748B'),
});

const isThemePalette = (value: unknown): value is ThemePalette => {
  if (!value || typeof value !== 'object') return false;
  const palette = value as Record<string, unknown>;
  return THEME_COLOR_KEYS.every((key) => typeof palette[key] === 'string' && isValidHex(palette[key] as string));
};

const isCustomThemeRecord = (value: unknown): value is CustomThemeRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string'
    && record.id.length > 0
    && record.id.length <= 128
    && typeof record.name === 'string'
    && record.name.trim().length > 0
    && record.name.trim().length <= 64
    && isThemePalette(record.colors);
};

export const readSavedCustomThemes = (): { themes: CustomThemeRecord[]; invalidCount: number } => {
  if (typeof window === 'undefined') return { themes: [], invalidCount: 0 };
  try {
    const value = window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!value) return { themes: [], invalidCount: 0 };
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return { themes: [], invalidCount: 1 };
    const themes: CustomThemeRecord[] = [];
    let invalidCount = 0;
    for (const entry of parsed) {
      if (isCustomThemeRecord(entry)) {
        themes.push({
          id: entry.id,
          name: entry.name.trim(),
          colors: Object.fromEntries(
            THEME_COLOR_KEYS.map((key) => [key, normalizeHex(entry.colors[key], DEFAULT_CUSTOM_THEME[key])]),
          ) as ThemePalette,
        });
      } else {
        invalidCount += 1;
      }
    }
    return { themes, invalidCount };
  } catch (error) {
    console.warn('Appearance customization theme storage could not be read:', error);
    return { themes: [], invalidCount: 1 };
  }
};

export const createThemeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `theme-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const applyThemePalette = (colors: ThemePalette, onChange: AppearanceOnChange) => {
  onChange('brandPrimaryColor', colors.primary);
  onChange('brandAccentColor', colors.info || colors.primary);
  onChange('uiCanvasColor', colors.background);
  onChange('uiSurfaceColor', colors.card);
  onChange('uiTextColor', colors.text);
  onChange('uiBorderColor', colors.border);
  onChange('uiSuccessColor', colors.success);
  onChange('uiWarningColor', colors.warning);
  onChange('uiDangerColor', colors.danger);
};

export const applyDefaultColorSettings = (onChange: AppearanceOnChange) => {
  onChange('brandPrimaryColor', DEFAULTS.brandPrimaryColor);
  onChange('brandAccentColor', DEFAULTS.brandAccentColor);
  onChange('uiCanvasColor', DEFAULTS.uiCanvasColor);
  onChange('uiSurfaceColor', DEFAULTS.uiSurfaceColor);
  onChange('uiTextColor', DEFAULTS.uiTextColor);
  onChange('uiBorderColor', DEFAULTS.uiBorderColor);
  onChange('uiSuccessColor', DEFAULTS.uiSuccessColor);
  onChange('uiWarningColor', DEFAULTS.uiWarningColor);
  onChange('uiDangerColor', DEFAULTS.uiDangerColor);
};

export const applyDefaultSettings = (onChange: AppearanceOnChange) => {
  onChange('brandPrimaryColor', DEFAULTS.brandPrimaryColor);
  onChange('brandAccentColor', DEFAULTS.brandAccentColor);
  onChange('uiCanvasColor', DEFAULTS.uiCanvasColor);
  onChange('uiSurfaceColor', DEFAULTS.uiSurfaceColor);
  onChange('uiTextColor', DEFAULTS.uiTextColor);
  onChange('uiBorderColor', DEFAULTS.uiBorderColor);
  onChange('uiSuccessColor', DEFAULTS.uiSuccessColor);
  onChange('uiDangerColor', DEFAULTS.uiDangerColor);
  onChange('uiWarningColor', DEFAULTS.uiWarningColor);
  onChange('uiButtonStyle', DEFAULTS.uiButtonStyle);
  onChange('uiCornerRadius', DEFAULTS.uiCornerRadius);
  onChange('uiDensity', DEFAULTS.uiDensity);
  onChange('uiFontScale', DEFAULTS.uiFontScale);
  onChange('interfaceDirection', DEFAULTS.interfaceDirection);
  onChange('themeMode', DEFAULTS.themeMode);
  onChange('fontFamily', DEFAULTS.fontFamily);
  onChange('navigationLayout', DEFAULTS.navigationLayout);
};

export { isThemePalette };
