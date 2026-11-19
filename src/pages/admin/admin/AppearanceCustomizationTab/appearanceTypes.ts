import type { SystemSettings } from '../../../../types';

export type ColorSettingKey =
  | 'brandPrimaryColor'
  | 'brandAccentColor'
  | 'uiCanvasColor'
  | 'uiSurfaceColor'
  | 'uiTextColor'
  | 'uiBorderColor'
  | 'uiSuccessColor'
  | 'uiDangerColor'
  | 'uiWarningColor';

export type ThemeFilter = 'all' | 'cool' | 'nature' | 'warm' | 'neutral' | 'vibrant' | 'eyeComfort' | 'matte' | 'websites';

export type ThemePalette = {
  primary: string;
  hover: string;
  soft: string;
  background: string;
  card: string;
  sidebar: string;
  active: string;
  text: string;
  secondaryText: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
};

export interface ReadyTheme {
  id: string;
  name: string;
  category: Exclude<ThemeFilter, 'all'>;
  description: string;
  colors: ThemePalette;
}

export interface CustomThemeRecord {
  id: string;
  name: string;
  colors: ThemePalette;
}

export interface AppearanceCustomizationTabProps {
  settings: SystemSettings;
  readOnly: boolean;
  onChange: <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => void;
}

export type AppearanceOnChange = AppearanceCustomizationTabProps['onChange'];

export interface StorageNotice {
  type: 'success' | 'error';
  text: string;
}
