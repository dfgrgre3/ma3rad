import type { SystemSettings } from '../../../../types';
import type { ColorSettingKey, ThemeFilter, ThemePalette } from './appearanceTypes';

export const COLORS: Array<{ key: ColorSettingKey; label: string; description: string; fallback: string }> = [
  { key: 'brandPrimaryColor', label: 'اللون الأساسي', description: 'الأزرار الأساسية والعناصر المحددة.', fallback: '#34445a' },
  { key: 'brandAccentColor', label: 'اللون المساند', description: 'الهوية والعناصر الثانوية.', fallback: '#64748b' },
  { key: 'uiCanvasColor', label: 'خلفية الصفحات', description: 'مساحة العمل خلف البطاقات.', fallback: '#f5f6f8' },
  { key: 'uiSurfaceColor', label: 'خلفية البطاقات', description: 'البطاقات والقوائم والحقول.', fallback: '#ffffff' },
  { key: 'uiTextColor', label: 'النص الرئيسي', description: 'العناوين والمحتوى الأساسي.', fallback: '#252b36' },
  { key: 'uiBorderColor', label: 'الحدود والفواصل', description: 'إطارات الحقول والبطاقات والجداول.', fallback: '#e1e5ea' },
  { key: 'uiSuccessColor', label: 'لون النجاح', description: 'حالات النجاح والإجراءات المكتملة.', fallback: '#39765b' },
  { key: 'uiWarningColor', label: 'لون التحذير', description: 'التنبيهات والحالات التي تتطلب الانتباه.', fallback: '#8a6a35' },
  { key: 'uiDangerColor', label: 'لون الخطأ', description: 'الأخطاء والإجراءات الحساسة.', fallback: '#a95050' },
];

export const COLOR_PRESETS: Record<ColorSettingKey, string[]> = {
  brandPrimaryColor: ['#1F4E79', '#2F5D8A', '#3B6EAE', '#355C7D', '#446E6D', '#4F6C7C', '#5B6B73', '#5D6F9A', '#7B8DB6', '#2C5F5E'],
  brandAccentColor: ['#6C8EBF', '#7B9DBE', '#8DA9C7', '#739C8C', '#8FAF9D', '#A08DAE', '#B48A7A', '#C39C7B', '#A4B3C9', '#7A8CA7'],
  uiCanvasColor: ['#F7F9FC', '#F3F6F8', '#EEF3F7', '#F6F7F3', '#F5F4F1', '#F3F5F9', '#F2F4F8', '#F3F4F6', '#F9FAFB', '#F1F3F5'],
  uiSurfaceColor: ['#FFFFFF', '#F8FAFC', '#F4F6F8', '#FCFCFD', '#F7F8F9', '#F1F3F5', '#FAFBFC', '#FFFFFF', '#EEF1F4', '#F8F7F8'],
  uiTextColor: ['#1F2A37', '#23313F', '#2A3745', '#1F2937', '#27374B', '#2C3440', '#364152', '#1E2430', '#2A2F36', '#202B3B'],
  uiBorderColor: ['#E2E8F0', '#DDE3EA', '#E5E7EB', '#E8EEF4', '#D7DFEA', '#C9D4DE', '#DCE7F1', '#E4E9F0', '#D8E1E7', '#DFE6EE'],
  uiSuccessColor: ['#2F7D5B', '#3E8D6B', '#4D9B76', '#5EAD88', '#3A705D', '#4C7E67', '#6AA785', '#7CB690', '#5A8C6A', '#507D6A'],
  uiWarningColor: ['#CFAF5C', '#D6B15B', '#E0C369', '#E3B86A', '#B89044', '#D2A757', '#C99A45', '#B48B40', '#E7C76A', '#D1A85B'],
  uiDangerColor: ['#C95D5D', '#D76C6C', '#B95D5D', '#C76868', '#BE5F5F', '#B25B59', '#D88383', '#B95858', '#C77D7D', '#B65D5D'],
};

export const getColorConfig = (key: ColorSettingKey) => COLORS.find((item) => item.key === key) ?? COLORS[0];

export const DEFAULTS: Partial<SystemSettings> = {
  brandPrimaryColor: '#34445a',
  brandAccentColor: '#64748b',
  uiCanvasColor: '#f5f6f8',
  uiSurfaceColor: '#ffffff',
  uiTextColor: '#252b36',
  uiBorderColor: '#e1e5ea',
  uiSuccessColor: '#39765b',
  uiDangerColor: '#a95050',
  uiWarningColor: '#8a6a35',
  uiButtonStyle: 'solid',
  uiCornerRadius: 'standard',
  uiDensity: 'comfortable',
  uiFontScale: 'standard',
  interfaceDirection: 'rtl',
  themeMode: 'light',
  fontFamily: 'Cairo',
  navigationLayout: 'sidebar',
};

export const DEFAULT_CUSTOM_THEME: ThemePalette = {
  primary: '#34445a',
  hover: '#2d3c50',
  soft: '#E9EDF2',
  background: '#F5F6F8',
  card: '#FFFFFF',
  sidebar: '#EDF2F7',
  active: '#DDE7F2',
  text: '#252B36',
  secondaryText: '#4C5664',
  border: '#E1E5EA',
  success: '#39765B',
  warning: '#8A6A35',
  danger: '#A95050',
  info: '#64748B',
};

export const THEME_COLOR_KEYS: Array<keyof ThemePalette> = [
  'primary', 'hover', 'soft', 'background', 'card', 'sidebar', 'active',
  'text', 'secondaryText', 'border', 'success', 'warning', 'danger', 'info',
];

export const FILTERS: Array<{ value: ThemeFilter; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'vibrant', label: 'ألوان زاهية جاهزة' },
  { value: 'eyeComfort', label: 'مريحة للعين' },
  { value: 'matte', label: 'ألوان مطفية' },
  { value: 'websites', label: 'مواقع عالمية' },
  { value: 'cool', label: 'ألوان باردة' },
  { value: 'nature', label: 'ألوان طبيعية' },
  { value: 'warm', label: 'ألوان دافئة' },
  { value: 'neutral', label: 'ألوان محايدة' },
];

export const CUSTOM_THEME_STORAGE_KEY = 'cerami-custom-themes';

export const SELECT_CLASS =
  'min-h-10 w-full rounded-md border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-3 text-sm text-[var(--cerami-text)] focus:border-[var(--cerami-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cerami-accent-soft)]';

export const BUTTON_STYLES: Array<{ value: NonNullable<SystemSettings['uiButtonStyle']>; label: string; description: string }> = [
  { value: 'solid', label: 'ممتلئ', description: 'زر أساسي واضح بخلفية اللون المختار.' },
  { value: 'outline', label: 'محدد', description: 'حدود بارزة ومظهر أخف.' },
  { value: 'soft', label: 'هادئ', description: 'خلفية ناعمة مناسبة للعمل اليومي.' },
];
