import React from 'react';
import { Check, Copy, Eye, Palette, Plus, RotateCcw, Save, Search, Sparkles, Trash2 } from 'lucide-react';
import type { SystemSettings } from '../../types';

type ColorSettingKey =
  | 'brandPrimaryColor'
  | 'brandAccentColor'
  | 'uiCanvasColor'
  | 'uiSurfaceColor'
  | 'uiTextColor'
  | 'uiBorderColor'
  | 'uiSuccessColor'
  | 'uiDangerColor'
  | 'uiWarningColor';

type ThemeFilter = 'all' | 'cool' | 'nature' | 'warm' | 'neutral';

type ThemePalette = {
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

interface ReadyTheme {
  id: string;
  name: string;
  category: Exclude<ThemeFilter, 'all'>;
  description: string;
  colors: ThemePalette;
}

interface CustomThemeRecord {
  id: string;
  name: string;
  colors: ThemePalette;
}

interface AppearanceCustomizationTabProps {
  settings: SystemSettings;
  readOnly: boolean;
  onChange: <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => void;
}

const COLORS: Array<{ key: ColorSettingKey; label: string; description: string; fallback: string }> = [
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

const DEFAULTS: Partial<SystemSettings> = {
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

const DEFAULT_CUSTOM_THEME: ThemePalette = {
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

const THEME_PRESETS: ReadyTheme[] = [
  { id: 'blue-mist', name: 'Blue Mist', category: 'cool', description: 'الأزرق الرمادي الهادئ الافتراضي.', colors: { primary: '#526B84', hover: '#43596F', soft: '#E9EFF5', background: '#F5F7FA', card: '#FFFFFF', sidebar: '#EDF2F7', active: '#DCE7F1', text: '#1F2A36', secondaryText: '#5B6D80', border: '#D9E1E8', success: '#4C7B6D', warning: '#C39A5B', danger: '#B55C61', info: '#5E7FA3' } },
  { id: 'ocean-breeze', name: 'Ocean Breeze', category: 'cool', description: 'نسيم المحيط مع دفء هادئ.', colors: { primary: '#456B83', hover: '#38586D', soft: '#E8F0F4', background: '#F5F8FA', card: '#FFFFFF', sidebar: '#EBF1F5', active: '#D8EAF2', text: '#1F2D36', secondaryText: '#586E7C', border: '#D7E3EA', success: '#4B7C76', warning: '#C5965A', danger: '#B96867', info: '#5E8BA5' } },
  { id: 'calm-teal', name: 'Calm Teal', category: 'cool', description: 'سياج ترابي دافئ مع تركواز ناعم.', colors: { primary: '#3F6D6A', hover: '#335956', soft: '#E7F0EF', background: '#F4F8F7', card: '#FFFFFF', sidebar: '#EAF2F1', active: '#D8E9E6', text: '#1E2B2B', secondaryText: '#58716F', border: '#D8E4E2', success: '#4B7F6D', warning: '#C2924E', danger: '#B2605B', info: '#538E91' } },
  { id: 'soft-slate', name: 'Soft Slate', category: 'cool', description: 'رمادي مزرق احترافي.', colors: { primary: '#515F6D', hover: '#424E5A', soft: '#E9EDF1', background: '#F5F6F8', card: '#FFFFFF', sidebar: '#EDF0F3', active: '#DDE3EA', text: '#242E38', secondaryText: '#5B6672', border: '#D8DEE7', success: '#4A7D72', warning: '#B69058', danger: '#B76067', info: '#687E94' } },
  { id: 'sage-garden', name: 'Sage Garden', category: 'nature', description: 'أخضر مريم متوازن.', colors: { primary: '#4F6B59', hover: '#405647', soft: '#EAF0EB', background: '#F5F8F5', card: '#FFFFFF', sidebar: '#EDF3EE', active: '#DDEBDD', text: '#1F2B22', secondaryText: '#5C6D60', border: '#D9E1D8', success: '#4D7E69', warning: '#B99858', danger: '#B75E5D', info: '#719581' } },
  { id: 'forest-calm', name: 'Forest Calm', category: 'nature', description: 'أخضر الغابة الهادئ.', colors: { primary: '#48664F', hover: '#3B5341', soft: '#E9F0EA', background: '#F5F8F5', card: '#FFFFFF', sidebar: '#EDF2ED', active: '#DDE9DD', text: '#1F2A22', secondaryText: '#596F60', border: '#D4E0D5', success: '#4D7D67', warning: '#B99156', danger: '#B75D60', info: '#698D74' } },
  { id: 'mint-breeze', name: 'Mint Breeze', category: 'nature', description: 'نعناع لطيف مع ضوء هادئ.', colors: { primary: '#477068', hover: '#3A5B55', soft: '#E8F1EF', background: '#F5F9F7', card: '#FFFFFF', sidebar: '#EBF3F0', active: '#D7ECE7', text: '#1E2B2A', secondaryText: '#5A6F6C', border: '#D5E5E2', success: '#4D7F72', warning: '#BA9057', danger: '#B65E65', info: '#5B8F8D' } },
  { id: 'lavender-mist', name: 'Lavender Mist', category: 'nature', description: 'موف ناعم ومريح.', colors: { primary: '#675C82', hover: '#564D6D', soft: '#EEEBF4', background: '#F8F7FA', card: '#FFFFFF', sidebar: '#F0EEF5', active: '#E4DEF0', text: '#272535', secondaryText: '#5F5C70', border: '#E0D9EC', success: '#5B7C69', warning: '#BA8F5F', danger: '#B76969', info: '#7C6F9F' } },
  { id: 'warm-sand', name: 'Warm Sand', category: 'warm', description: 'لون رملي دافئ ومتوازن.', colors: { primary: '#796447', hover: '#65533B', soft: '#F1ECE4', background: '#FAF8F4', card: '#FFFFFF', sidebar: '#F2EEE7', active: '#E9DFC9', text: '#2B241C', secondaryText: '#655B4E', border: '#E5DDCF', success: '#4E7B62', warning: '#BA8A48', danger: '#B76561', info: '#8E785D' } },
  { id: 'dusty-rose', name: 'Dusty Rose', category: 'warm', description: 'وردي ترابي يضيف دفئًا لطيفًا.', colors: { primary: '#805861', hover: '#6B4850', soft: '#F2E9EC', background: '#FAF6F7', card: '#FFFFFF', sidebar: '#F3EBED', active: '#EAD5DA', text: '#2E2023', secondaryText: '#65575B', border: '#E6D5D9', success: '#5E7A67', warning: '#B98D56', danger: '#B85F64', info: '#927081' } },
  { id: 'soft-terracotta', name: 'Soft Terracotta', category: 'warm', description: 'طوبي هادئ واحترافي.', colors: { primary: '#805A48', hover: '#6A493B', soft: '#F2EAE5', background: '#FAF7F5', card: '#FFFFFF', sidebar: '#F2EBE6', active: '#E7D5CC', text: '#2D231F', secondaryText: '#645551', border: '#E7DAD4', success: '#5A7B63', warning: '#B98C53', danger: '#B95D5D', info: '#97715C' } },
  { id: 'neutral-beige', name: 'Neutral Beige', category: 'warm', description: 'بيج محايد لواجهة هادئة.', colors: { primary: '#766957', hover: '#625644', soft: '#F0ECE5', background: '#F9F8F5', card: '#FFFFFF', sidebar: '#F1EEE8', active: '#E6E0D4', text: '#2B261F', secondaryText: '#665E52', border: '#E0D8CB', success: '#5B7E68', warning: '#B89256', danger: '#B86062', info: '#8A7D6A' } },
  { id: 'graphite', name: 'Graphite', category: 'neutral', description: 'جرافيت احترافي ومحايد.', colors: { primary: '#4E5A64', hover: '#404A53', soft: '#EAEDF0', background: '#F6F7F8', card: '#FFFFFF', sidebar: '#ECEFF2', active: '#DDE4EA', text: '#212930', secondaryText: '#5A6470', border: '#DDE2E7', success: '#4F7A67', warning: '#B88E52', danger: '#B75E5F', info: '#687C8A' } },
  { id: 'cloud-gray', name: 'Cloud Gray', category: 'neutral', description: 'رمادي سحابي هادئ.', colors: { primary: '#64717D', hover: '#505C67', soft: '#EDF0F2', background: '#F7F8F9', card: '#FFFFFF', sidebar: '#EEF1F3', active: '#DDE5EA', text: '#24313B', secondaryText: '#5B6976', border: '#E0E5EA', success: '#4F7D68', warning: '#B89252', danger: '#B7665F', info: '#6D7E8F' } },
  { id: 'deep-navy', name: 'Deep Navy', category: 'neutral', description: 'كحلي هادئ ومرتب.', colors: { primary: '#394F67', hover: '#2D4054', soft: '#E8EDF3', background: '#F5F7FA', card: '#FFFFFF', sidebar: '#E9EEF4', active: '#D8E3EE', text: '#1F2A39', secondaryText: '#56697D', border: '#D8E0EA', success: '#4B7D6D', warning: '#B98E54', danger: '#B95C61', info: '#587793' } },
  { id: 'silver-blue', name: 'Silver Blue', category: 'neutral', description: 'فضي أزرق للمشهد المهني.', colors: { primary: '#617D91', hover: '#506A7C', soft: '#EAF0F4', background: '#F6F8FA', card: '#FFFFFF', sidebar: '#EEF2F5', active: '#DDE9F3', text: '#212F3C', secondaryText: '#5E7283', border: '#DDE6ED', success: '#4F7E6C', warning: '#B98D55', danger: '#B75E63', info: '#7493A6' } },
];

const FILTERS: Array<{ value: ThemeFilter; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'cool', label: 'ألوان باردة' },
  { value: 'nature', label: 'ألوان طبيعية' },
  { value: 'warm', label: 'ألوان دافئة' },
  { value: 'neutral', label: 'ألوان محايدة' },
];

const CUSTOM_THEME_STORAGE_KEY = 'cerami-custom-themes';

const normalizeHex = (value: string, fallback: string) => {
  const candidate = (value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toUpperCase() : fallback;
};

const buildPaletteFromSettings = (settings: SystemSettings): ThemePalette => ({
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

const readSavedCustomThemes = (): CustomThemeRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.name === 'string' && entry.colors) : [];
  } catch {
    return [];
  }
};

const createThemeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `theme-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const applyThemePalette = (colors: ThemePalette, onChange: AppearanceCustomizationTabProps['onChange']) => {
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

const SELECT_CLASS =
  'min-h-10 w-full rounded-md border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-3 text-sm text-[var(--cerami-text)] focus:border-[var(--cerami-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cerami-accent-soft)]';

const BUTTON_STYLES: Array<{ value: NonNullable<SystemSettings['uiButtonStyle']>; label: string; description: string }> = [
  { value: 'solid', label: 'ممتلئ', description: 'زر أساسي واضح بخلفية اللون المختار.' },
  { value: 'outline', label: 'محدد', description: 'حدود بارزة ومظهر أخف.' },
  { value: 'soft', label: 'هادئ', description: 'خلفية ناعمة مناسبة للعمل اليومي.' },
];

export const AppearanceCustomizationTab: React.FC<AppearanceCustomizationTabProps> = ({
  settings,
  readOnly,
  onChange,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [themeFilter, setThemeFilter] = React.useState<ThemeFilter>('all');
  const [customThemes, setCustomThemes] = React.useState<CustomThemeRecord[]>(() => readSavedCustomThemes());
  const [customThemeName, setCustomThemeName] = React.useState('الثيم الخاص بي');
  const [customThemeId, setCustomThemeId] = React.useState<string | null>(null);
  const [builder, setBuilder] = React.useState<ThemePalette>(() => buildPaletteFromSettings(settings));

  React.useEffect(() => {
    setBuilder(buildPaletteFromSettings(settings));
  }, [settings]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(customThemes));
    } catch {
      // ignored.
    }
  }, [customThemes]);

  const [systemPrefersDark, setSystemPrefersDark] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true,
  );

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updatePreference = () => setSystemPrefersDark(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener?.('change', updatePreference);
    return () => mediaQuery.removeEventListener?.('change', updatePreference);
  }, []);

  const previewDark = settings.themeMode === 'dark'
    || (settings.themeMode === 'system' && systemPrefersDark);
  const previewCanvas = previewDark ? '#161b22' : settings.uiCanvasColor || '#f5f6f8';
  const previewSurface = previewDark ? '#1e252e' : settings.uiSurfaceColor || '#ffffff';
  const previewText = previewDark ? '#e7ebf0' : settings.uiTextColor || '#252b36';
  const previewBorder = previewDark ? '#343e4a' : settings.uiBorderColor || '#e1e5ea';
  const primaryColor = settings.brandPrimaryColor || '#34445a';
  const previewStyle = {
    '--cerami-primary': primaryColor,
    '--brand-accent': settings.brandAccentColor || '#64748b',
    '--cerami-primary-hover': `color-mix(in srgb, ${primaryColor} 86%, #000000)`,
    '--cerami-primary-pressed': `color-mix(in srgb, ${primaryColor} 74%, #000000)`,
    '--cerami-accent-soft': `color-mix(in srgb, ${primaryColor} 10%, ${previewSurface})`,
    '--cerami-accent-border': `color-mix(in srgb, ${primaryColor} 28%, ${previewSurface})`,
    '--win-accent': primaryColor,
    '--win-accent-hover': `color-mix(in srgb, ${primaryColor} 86%, #000000)`,
    '--win-accent-pressed': `color-mix(in srgb, ${primaryColor} 74%, #000000)`,
    '--win-accent-soft': `color-mix(in srgb, ${primaryColor} 10%, ${previewSurface})`,
    '--win-accent-border': `color-mix(in srgb, ${primaryColor} 28%, ${previewSurface})`,
    '--win-radius': settings.uiCornerRadius === 'compact' ? '4px' : settings.uiCornerRadius === 'rounded' ? '10px' : '6px',
    '--cerami-surface': previewSurface,
    '--cerami-canvas': previewCanvas,
    '--cerami-border': previewBorder,
    '--cerami-text': previewText,
    '--win-surface': previewSurface,
    '--win-canvas': previewCanvas,
    '--win-border': previewBorder,
    '--win-text': previewText,
    '--win-text-secondary': previewText,
    '--win-text-muted': previewText,
    '--win-success': settings.uiSuccessColor || '#39765b',
    '--win-success-text': settings.uiSuccessColor || '#39765b',
    '--preview-radius': settings.uiCornerRadius === 'compact' ? '4px' : settings.uiCornerRadius === 'rounded' ? '10px' : '6px',
  } as React.CSSProperties;

  const filteredThemes = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return THEME_PRESETS.filter((theme) => {
      const matchesFilter = themeFilter === 'all' || theme.category === themeFilter;
      const matchesSearch = !query || theme.name.toLowerCase().includes(query) || theme.description.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [searchQuery, themeFilter]);

  const isPresetActive = (theme: ReadyTheme) => {
    const palette = buildPaletteFromSettings(settings);
    return theme.colors.primary.toUpperCase() === palette.primary.toUpperCase()
      && theme.colors.background.toUpperCase() === palette.background.toUpperCase();
  };

  const updateBuilderColor = (key: keyof ThemePalette, value: string) => {
    setBuilder((current) => ({ ...current, [key]: normalizeHex(value, current[key]) }));
  };

  const saveCustomTheme = (isUpdate = false) => {
    const name = customThemeName.trim() || 'الثيم الخاص بي';
    const record: CustomThemeRecord = {
      id: isUpdate && customThemeId ? customThemeId : createThemeId(),
      name,
      colors: { ...builder },
    };

    setCustomThemes((current) => {
      if (isUpdate && customThemeId) {
        return current.map((item) => item.id === customThemeId ? record : item);
      }
      return [record, ...current];
    });
    setCustomThemeId(record.id);
  };

  const applyCustomTheme = (record: CustomThemeRecord) => {
    applyThemePalette(record.colors, onChange);
    setCustomThemeId(record.id);
    setCustomThemeName(record.name);
    setBuilder({ ...record.colors });
  };

  const deleteCustomTheme = (id: string) => {
    setCustomThemes((current) => current.filter((item) => item.id !== id));
    if (customThemeId === id) {
      setCustomThemeId(null);
    }
  };

  const duplicateCurrentTheme = () => {
    const name = `${customThemeName.trim() || 'الثيم الخاص بي'} نسخة`;
    const record: CustomThemeRecord = { id: createThemeId(), name, colors: { ...builder } };
    setCustomThemes((current) => [record, ...current]);
    setCustomThemeId(record.id);
    setCustomThemeName(name);
  };

  const restoreDefaults = () => {
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

  return (
    <div className="space-y-4" dir="rtl">
      <section className="win-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--cerami-accent-soft)] text-[var(--cerami-primary)]">
              <Palette className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[var(--cerami-text)]">Appearance Studio</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--cerami-muted)]">
                مركز تخصيص المظهر بالكامل: ثيمات جاهزة، وضع فاتح/داكن، ألوان مخصصة، وحفظ بصيغ متعددة مع معاينة فورية.
              </p>
            </div>
          </div>
          <button type="button" className="win-btn" onClick={restoreDefaults} disabled={readOnly}>
            <RotateCcw className="h-4 w-4" />
            استعادة المظهر الافتراضي
          </button>
        </div>
        {readOnly && (
          <p className="mt-4 rounded-md border border-[var(--cerami-warning-border)] bg-[var(--cerami-warning-soft)] px-3 py-2 text-sm text-[var(--cerami-warning)]" role="status">
            يمكنك معاينة الإعدادات، لكن يلزم امتلاك صلاحية تعديل الإعدادات لحفظها.
          </p>
        )}
      </section>

      <section className="win-card p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--cerami-text)]">الثيمات الجاهزة</h3>
            <p className="mt-1 text-xs text-[var(--cerami-muted)]">16 ثيمًا احترافيًا مع تصنيف وبحث، مناسب للاستخدام اليومي.</p>
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="relative sm:min-w-[220px]">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cerami-muted)]" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded-md border border-[var(--cerami-border)] bg-[var(--cerami-surface)] py-2 pr-9 pl-3 text-sm text-[var(--cerami-text)] focus:border-[var(--cerami-primary)] focus:outline-none"
                placeholder="ابحث عن اسم الثيم"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((filter) => (
                <button
                  type="button"
                  key={filter.value}
                  onClick={() => setThemeFilter(filter.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    themeFilter === filter.value
                      ? 'border-[var(--cerami-primary)] bg-[var(--cerami-primary)] text-white'
                      : 'border-[var(--cerami-border)] bg-[var(--cerami-surface)] text-[var(--cerami-text)]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredThemes.map((theme) => (
            <div
              key={theme.id}
              className={`overflow-hidden rounded-xl border p-3 transition ${isPresetActive(theme) ? 'border-[var(--cerami-primary)] ring-2 ring-[var(--cerami-accent-soft)]' : 'border-[var(--cerami-border)]'}`}
              style={{ backgroundColor: theme.colors.card }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold" style={{ color: theme.colors.text }}>{theme.name}</h4>
                  <p className="mt-1 text-[11px]" style={{ color: theme.colors.secondaryText }}>{theme.description}</p>
                </div>
                {isPresetActive(theme) && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--cerami-primary)] bg-[var(--cerami-accent-soft)] px-2 py-1 text-[10px] font-bold text-[var(--cerami-primary)]">
                    <Check className="h-3.5 w-3.5" />
                    نشط
                  </span>
                )}
              </div>

              <div className="rounded-lg border p-2" style={{ backgroundColor: theme.colors.background, borderColor: theme.colors.border }}>
                <div className="mb-2 flex gap-2 rounded-md p-2" style={{ backgroundColor: theme.colors.sidebar }}>
                  <span className="h-7 w-7 rounded-md" style={{ backgroundColor: theme.colors.primary }} />
                  <span className="h-7 flex-1 rounded-md" style={{ backgroundColor: theme.colors.active }} />
                  <span className="h-7 w-7 rounded-md" style={{ backgroundColor: theme.colors.info }} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border p-2" style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
                    <div className="mb-2 h-5 w-2/3 rounded-sm" style={{ backgroundColor: theme.colors.primary }} />
                    <div className="h-8 rounded-md" style={{ backgroundColor: theme.colors.soft }} />
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
                className="mt-3 w-full rounded-md px-3 py-2 text-sm font-bold text-white transition hover:opacity-95"
                style={{ backgroundColor: theme.colors.primary }}
                onClick={() => applyThemePalette(theme.colors, onChange)}
              >
                تطبيق الثيم
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <section className="win-card p-4 sm:p-5">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-[var(--cerami-text)]">المحرر المخصص للألوان</h3>
            <p className="mt-1 text-xs text-[var(--cerami-muted)]">أنشئ ثيمًا مخصصًا ثم احفظه واستخدمه لاحقًا في أي وقت.</p>
          </div>

          <div className="space-y-3">
            {[
              { key: 'primary', label: 'اللون الأساسي', value: builder.primary, description: 'الهوية الأساسية' },
              { key: 'hover', label: 'لون التفاعل', value: builder.hover, description: 'أزرار الفأرة' },
              { key: 'background', label: 'خلفية التطبيق', value: builder.background, description: 'خلفية المساحات' },
              { key: 'card', label: 'خلفية البطاقات', value: builder.card, description: 'السطوح' },
              { key: 'sidebar', label: 'القائمة الجانبية', value: builder.sidebar, description: 'اللوحة الجانبية' },
              { key: 'text', label: 'النص الرئيسي', value: builder.text, description: 'العناوين والمحتوى' },
              { key: 'border', label: 'الحدود', value: builder.border, description: 'الفواصل' },
              { key: 'success', label: 'النجاح', value: builder.success, description: 'حالات النجاح' },
              { key: 'warning', label: 'التحذير', value: builder.warning, description: 'مؤشرات التنبيه' },
              { key: 'danger', label: 'الخطأ', value: builder.danger, description: 'الأخطاء' },
              { key: 'info', label: 'معلومات الهوية', value: builder.info, description: 'اللون المساند' },
            ].map(({ key, label, value, description }) => (
              <label key={key} className="grid gap-2 rounded-md border border-[var(--cerami-border)] p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                <input
                  type="color"
                  value={value}
                  onChange={(event) => updateBuilderColor(key as keyof ThemePalette, event.target.value)}
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
                    value={value}
                    onChange={(event) => updateBuilderColor(key as keyof ThemePalette, event.target.value)}
                    disabled={readOnly}
                    dir="ltr"
                    className="w-[92px] rounded-md border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-2 py-1 text-xs text-[var(--cerami-text)] focus:border-[var(--cerami-primary)] focus:outline-none"
                    aria-label={`${label} HEX`}
                  />
                </div>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="win-btn win-btn--primary" disabled={readOnly} onClick={() => applyThemePalette(builder, onChange)}>
              <Palette className="h-4 w-4" />
              تطبيق الألوان الحالية
            </button>
            <button type="button" className="win-btn" disabled={readOnly} onClick={() => setBuilder({ ...DEFAULT_CUSTOM_THEME })}>
              <RotateCcw className="h-4 w-4" />
              إعادة الافتراضي
            </button>
          </div>
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
                disabled={readOnly}
                className="w-full rounded-md border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-3 py-2 text-sm text-[var(--cerami-text)] focus:border-[var(--cerami-primary)] focus:outline-none"
                placeholder="مثل: ألوان شركتي"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="win-btn win-btn--primary" disabled={readOnly} onClick={() => saveCustomTheme(Boolean(customThemeId))}>
                <Save className="h-4 w-4" />
                {customThemeId ? 'تحديث الثيم' : 'حفظ الثيم'}
              </button>
              <button type="button" className="win-btn" disabled={readOnly} onClick={duplicateCurrentTheme}>
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
                      <button type="button" className="win-btn win-btn--sm" onClick={() => applyCustomTheme(theme)}>تطبيق</button>
                      <button type="button" className="win-btn win-btn--sm" onClick={() => { setCustomThemeId(theme.id); setCustomThemeName(theme.name); setBuilder({ ...theme.colors }); }}>تعديل</button>
                      <button type="button" className="win-btn win-btn--sm" onClick={() => deleteCustomTheme(theme.id)}>حذف</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="win-card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-[var(--cerami-primary)]" aria-hidden="true" />
          <h3 className="text-sm font-bold text-[var(--cerami-text)]">معاينة مباشرة</h3>
        </div>
        <div
          className="customization-preview rounded-md border p-4"
          data-button-style={settings.uiButtonStyle || 'solid'}
          data-corner-radius={settings.uiCornerRadius || 'standard'}
          data-density={settings.uiDensity || 'comfortable'}
          data-font-scale={settings.uiFontScale || 'standard'}
          data-navigation-layout={settings.navigationLayout || 'sidebar'}
          data-direction={settings.interfaceDirection || 'rtl'}
          data-theme-mode={previewDark ? 'dark' : 'light'}
          dir={settings.interfaceDirection || 'rtl'}
          style={{
            ...previewStyle,
            backgroundColor: previewCanvas,
            borderColor: previewBorder,
            borderRadius: settings.uiCornerRadius === 'compact' ? 4 : settings.uiCornerRadius === 'rounded' ? 12 : 6,
            fontFamily: `${settings.fontFamily || 'Cairo'}, Tajawal, system-ui, sans-serif`,
          }}
        >
          <div className="preview-shell">
            <nav className="preview-navigation" aria-label="معاينة عناصر التنقل">
              <span className="preview-navigation__item preview-navigation__item--active">الرئيسية</span>
              <span className="preview-navigation__item">المخزون</span>
              <span className="preview-navigation__item">المبيعات</span>
            </nav>
            <div className="preview-content">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3" style={{ backgroundColor: previewSurface, borderColor: previewBorder }}>
                <div className="min-w-0">
                  <p className="text-sm font-bold" style={{ color: previewText }}>مساحة عمل موحدة</p>
                  <p className="mt-1 text-xs" style={{ color: previewText, opacity: 0.7 }}>معاينة للأزرار والبطاقات في الوضع المحدد.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="win-btn win-btn--primary">
                    <Save className="h-4 w-4" /> حفظ التغييرات
                  </button>
                  <button type="button" className="win-btn">إلغاء</button>
                  <span className="inline-flex min-h-9 items-center rounded-md px-2.5 text-xs font-semibold text-white" style={{ backgroundColor: settings.brandAccentColor || '#64748b' }}>
                    لون الهوية المساند
                  </span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: settings.uiSuccessColor || '#39765b' }}>
                <Sparkles className="h-4 w-4" /> الألوان والحالات تتبع إعداداتك.
              </div>
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--cerami-muted)]">
          استخدم زر «حفظ التغييرات» أعلى صفحة الإعدادات لتطبيق المعاينة على جميع الصفحات.
        </p>
      </section>
    </div>
  );
};
