import React from 'react';
import { Bell, Boxes, Check, Copy, Eye, Home, Menu, Palette, Plus, RotateCcw, Save, Search, ShoppingCart, Sparkles, Trash2 } from 'lucide-react';
import type { SystemSettings } from '../../types';
import {
  accessibleForeground as getAccessibleForeground,
  mixHexColors,
  readableColorOnSurface,
} from '../../utils/themeContrast';

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

type ThemeFilter = 'all' | 'cool' | 'nature' | 'warm' | 'neutral' | 'vibrant' | 'eyeComfort' | 'matte' | 'websites';

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

const COLOR_PRESETS: Record<ColorSettingKey, string[]> = {
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

const getColorConfig = (key: ColorSettingKey) => COLORS.find((item) => item.key === key) ?? COLORS[0];

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

const THEME_COLOR_KEYS: Array<keyof ThemePalette> = [
  'primary', 'hover', 'soft', 'background', 'card', 'sidebar', 'active',
  'text', 'secondaryText', 'border', 'success', 'warning', 'danger', 'info',
];

const THEME_PRESETS: ReadyTheme[] = [
  { id: 'blue-mist', name: 'ضباب أزرق', category: 'cool', description: 'الأزرق الرمادي الهادئ الافتراضي.', colors: { primary: '#526B84', hover: '#43596F', soft: '#E9EFF5', background: '#F5F7FA', card: '#FFFFFF', sidebar: '#EDF2F7', active: '#DCE7F1', text: '#1F2A36', secondaryText: '#5B6D80', border: '#D9E1E8', success: '#4C7B6D', warning: '#C39A5B', danger: '#B55C61', info: '#5E7FA3' } },
  { id: 'ocean-breeze', name: 'نسيم المحيط', category: 'cool', description: 'نسيم المحيط مع دفء هادئ.', colors: { primary: '#456B83', hover: '#38586D', soft: '#E8F0F4', background: '#F5F8FA', card: '#FFFFFF', sidebar: '#EBF1F5', active: '#D8EAF2', text: '#1F2D36', secondaryText: '#586E7C', border: '#D7E3EA', success: '#4B7C76', warning: '#C5965A', danger: '#B96867', info: '#5E8BA5' } },
  { id: 'calm-teal', name: 'تركواز هادئ', category: 'cool', description: 'تركواز هادئ ونقي.', colors: { primary: '#3F6D6A', hover: '#335956', soft: '#E7F0EF', background: '#F4F8F7', card: '#FFFFFF', sidebar: '#EAF2F1', active: '#D8E9E6', text: '#1E2B2B', secondaryText: '#58716F', border: '#D8E4E2', success: '#4B7F6D', warning: '#C2924E', danger: '#B2605B', info: '#538E91' } },
  { id: 'soft-slate', name: 'رمادي مزرق', category: 'cool', description: 'رمادي مزرق احترافي.', colors: { primary: '#515F6D', hover: '#424E5A', soft: '#E9EDF1', background: '#F5F6F8', card: '#FFFFFF', sidebar: '#EDF0F3', active: '#DDE3EA', text: '#242E38', secondaryText: '#5B6672', border: '#D8DEE7', success: '#4A7D72', warning: '#B69058', danger: '#B76067', info: '#687E94' } },
  { id: 'sage-garden', name: 'حديقة الميرمية', category: 'nature', description: 'أخضر مريم متوازن.', colors: { primary: '#4F6B59', hover: '#405647', soft: '#EAF0EB', background: '#F5F8F5', card: '#FFFFFF', sidebar: '#EDF3EE', active: '#DDEBDD', text: '#1F2B22', secondaryText: '#5C6D60', border: '#D9E1D8', success: '#4D7E69', warning: '#B99858', danger: '#B75E5D', info: '#719581' } },
  { id: 'forest-calm', name: 'غابة هادئة', category: 'nature', description: 'أخضر الغابة الهادئ.', colors: { primary: '#48664F', hover: '#3B5341', soft: '#E9F0EA', background: '#F5F8F5', card: '#FFFFFF', sidebar: '#EDF2ED', active: '#DDE9DD', text: '#1F2A22', secondaryText: '#596F60', border: '#D4E0D5', success: '#4D7D67', warning: '#B99156', danger: '#B75D60', info: '#698D74' } },
  { id: 'mint-breeze', name: 'نسيم النعناع', category: 'nature', description: 'نعناع لطيف مع ضوء هادئ.', colors: { primary: '#477068', hover: '#3A5B55', soft: '#E8F1EF', background: '#F5F9F7', card: '#FFFFFF', sidebar: '#EBF3F0', active: '#D7ECE7', text: '#1E2B2A', secondaryText: '#5A6F6C', border: '#D5E5E2', success: '#4D7F72', warning: '#BA9057', danger: '#B65E65', info: '#5B8F8D' } },
  { id: 'lavender-mist', name: 'ضباب اللافندر', category: 'nature', description: 'موف ناعم ومريح.', colors: { primary: '#675C82', hover: '#564D6D', soft: '#EEEBF4', background: '#F8F7FA', card: '#FFFFFF', sidebar: '#F0EEF5', active: '#E4DEF0', text: '#272535', secondaryText: '#5F5C70', border: '#E0D9EC', success: '#5B7C69', warning: '#BA8F5F', danger: '#B76969', info: '#7C6F9F' } },
  { id: 'warm-sand', name: 'رمال دافئة', category: 'warm', description: 'لون رملي دافئ ومتوازن.', colors: { primary: '#796447', hover: '#65533B', soft: '#F1ECE4', background: '#FAF8F4', card: '#FFFFFF', sidebar: '#F2EEE7', active: '#E9DFC9', text: '#2B241C', secondaryText: '#655B4E', border: '#E5DDCF', success: '#4E7B62', warning: '#BA8A48', danger: '#B76561', info: '#8E785D' } },
  { id: 'dusty-rose', name: 'وردي ترابي', category: 'warm', description: 'وردي ترابي يضيف دفئًا لطيفًا.', colors: { primary: '#805861', hover: '#6B4850', soft: '#F2E9EC', background: '#FAF6F7', card: '#FFFFFF', sidebar: '#F3EBED', active: '#EAD5DA', text: '#2E2023', secondaryText: '#65575B', border: '#E6D5D9', success: '#5E7A67', warning: '#B98D56', danger: '#B85F64', info: '#927081' } },
  { id: 'soft-terracotta', name: 'طوبي هادئ', category: 'warm', description: 'طوبي هادئ واحترافي.', colors: { primary: '#805A48', hover: '#6A493B', soft: '#F2EAE5', background: '#FAF7F5', card: '#FFFFFF', sidebar: '#F2EBE6', active: '#E7D5CC', text: '#2D231F', secondaryText: '#645551', border: '#E7DAD4', success: '#5A7B63', warning: '#B98C53', danger: '#B95D5D', info: '#97715C' } },
  { id: 'neutral-beige', name: 'بيج محايد', category: 'warm', description: 'بيج محايد لواجهة هادئة.', colors: { primary: '#766957', hover: '#625644', soft: '#F0ECE5', background: '#F9F8F5', card: '#FFFFFF', sidebar: '#F1EEE8', active: '#E6E0D4', text: '#2B261F', secondaryText: '#665E52', border: '#E0D8CB', success: '#5B7E68', warning: '#B89256', danger: '#B86062', info: '#8A7D6A' } },
  { id: 'graphite', name: 'جرافيت', category: 'neutral', description: 'جرافيت احترافي ومحايد.', colors: { primary: '#4E5A64', hover: '#404A53', soft: '#EAEDF0', background: '#F6F7F8', card: '#FFFFFF', sidebar: '#ECEFF2', active: '#DDE4EA', text: '#212930', secondaryText: '#5A6470', border: '#DDE2E7', success: '#4F7A67', warning: '#B88E52', danger: '#B75E5F', info: '#687C8A' } },
  { id: 'cloud-gray', name: 'رمادي سحابي', category: 'neutral', description: 'رمادي سحابي هادئ.', colors: { primary: '#64717D', hover: '#505C67', soft: '#EDF0F2', background: '#F7F8F9', card: '#FFFFFF', sidebar: '#EEF1F3', active: '#DDE5EA', text: '#24313B', secondaryText: '#5B6976', border: '#E0E5EA', success: '#4F7D68', warning: '#B89252', danger: '#B7665F', info: '#6D7E8F' } },
  { id: 'deep-navy', name: 'كحلي عميق', category: 'neutral', description: 'كحلي هادئ ومرتب.', colors: { primary: '#394F67', hover: '#2D4054', soft: '#E8EDF3', background: '#F5F7FA', card: '#FFFFFF', sidebar: '#E9EEF4', active: '#D8E3EE', text: '#1F2A39', secondaryText: '#56697D', border: '#D8E0EA', success: '#4B7D6D', warning: '#B98E54', danger: '#B95C61', info: '#587793' } },
  { id: 'silver-blue', name: 'أزرق فضي', category: 'neutral', description: 'فضي أزرق للمشهد المهني.', colors: { primary: '#617D91', hover: '#506A7C', soft: '#EAF0F4', background: '#F6F8FA', card: '#FFFFFF', sidebar: '#EEF2F5', active: '#DDE9F3', text: '#212F3C', secondaryText: '#5E7283', border: '#DDE6ED', success: '#4F7E6C', warning: '#B98D55', danger: '#B75E63', info: '#7493A6' } },
  { id: 'vibrant-coral', name: 'مرجان زاهٍ', category: 'vibrant', description: 'مرجان قوي ولمسات دافئة لواجهة حيوية.', colors: { primary: '#D9435F', hover: '#B8324B', soft: '#FCE9EC', background: '#FFF7F7', card: '#FFFFFF', sidebar: '#FCEDEF', active: '#F8D8DE', text: '#302127', secondaryText: '#72545C', border: '#F0D8DD', success: '#24845D', warning: '#BD7A16', danger: '#B8323F', info: '#7047C6' } },
  { id: 'vibrant-cobalt', name: 'كوبالت مشرق', category: 'vibrant', description: 'أزرق كوبالت واضح مع ألوان مساندة نابضة.', colors: { primary: '#2456D8', hover: '#1C43AE', soft: '#E8EEFF', background: '#F5F7FF', card: '#FFFFFF', sidebar: '#EDF1FF', active: '#DCE5FF', text: '#1D2740', secondaryText: '#536384', border: '#D8E1FA', success: '#16845D', warning: '#B87508', danger: '#C63E4B', info: '#6B4BD1' } },
  { id: 'vibrant-sunset', name: 'غروب متوهّج', category: 'vibrant', description: 'برتقالي مشبع وتدرجات دافئة مرحة.', colors: { primary: '#D95724', hover: '#B8431B', soft: '#FCECE4', background: '#FFF8F3', card: '#FFFFFF', sidebar: '#FDF0E7', active: '#F8DFD0', text: '#35251E', secondaryText: '#765B4C', border: '#F0DED3', success: '#267B57', warning: '#B47A12', danger: '#B83F38', info: '#5A68C7' } },
  { id: 'vibrant-violet', name: 'بنفسجي حيوي', category: 'vibrant', description: 'بنفسجي جريء مع لمسات وردية مشرقة.', colors: { primary: '#7138C8', hover: '#592BA3', soft: '#F0E9FC', background: '#FAF7FF', card: '#FFFFFF', sidebar: '#F1EBFA', active: '#E6D9F8', text: '#292239', secondaryText: '#66587D', border: '#E5DAF3', success: '#21805D', warning: '#B77B12', danger: '#BD4052', info: '#C33F88' } },
  { id: 'comfort-sage', name: 'راحة الميرمية', category: 'eyeComfort', description: 'درجات خضراء طبيعية وخلفية دافئة للاستخدام الطويل.', colors: { primary: '#617A5B', hover: '#4E6449', soft: '#EDF1E9', background: '#F7F8F2', card: '#FDFDF9', sidebar: '#EEF1E8', active: '#E1E9D9', text: '#283027', secondaryText: '#606C5C', border: '#E0E5D9', success: '#4D795C', warning: '#A78348', danger: '#A95C56', info: '#64818A' } },
  { id: 'comfort-sea', name: 'هدوء البحر', category: 'eyeComfort', description: 'أزرق مخضر منخفض التباين البصري ومريح.', colors: { primary: '#52777A', hover: '#426366', soft: '#E9F0EF', background: '#F5F8F6', card: '#FCFDFC', sidebar: '#EAF1EF', active: '#DCEAE7', text: '#263334', secondaryText: '#5C6E6D', border: '#DCE6E3', success: '#4D7968', warning: '#A7834B', danger: '#A85F5B', info: '#5F818C' } },
  { id: 'comfort-sky', name: 'سماء هادئة', category: 'eyeComfort', description: 'أزرق رمادي هادئ بخلفية عاجية خفيفة.', colors: { primary: '#5B7486', hover: '#4A6070', soft: '#EAF0F3', background: '#F6F8F8', card: '#FDFDFC', sidebar: '#ECF1F2', active: '#DDE8EB', text: '#283238', secondaryText: '#606E75', border: '#DEE5E6', success: '#4E7966', warning: '#A8864E', danger: '#AA625C', info: '#68869A' } },
  { id: 'comfort-lavender', name: 'لافندر هادئ', category: 'eyeComfort', description: 'بنفسجي رمادي ناعم ومساحات فاتحة مريحة.', colors: { primary: '#756A83', hover: '#62586E', soft: '#F0EDF2', background: '#F8F7F8', card: '#FDFCFD', sidebar: '#F0EEF1', active: '#E7E1EA', text: '#302C34', secondaryText: '#6A626D', border: '#E5E0E6', success: '#567963', warning: '#A78350', danger: '#A85E62', info: '#6E8290' } },
  { id: 'matte-olive', name: 'زيتوني مطفي', category: 'matte', description: 'زيتوني ترابي منخفض التشبع بطابع متزن.', colors: { primary: '#687254', hover: '#555E45', soft: '#ECEEE7', background: '#F6F6F1', card: '#FCFCF8', sidebar: '#ECEDE5', active: '#DEE2D3', text: '#2D3028', secondaryText: '#686B5E', border: '#E0E2D9', success: '#54735A', warning: '#9B7C4C', danger: '#A65F59', info: '#687A7A' } },
  { id: 'matte-clay', name: 'طين مطفي', category: 'matte', description: 'طوبي مطفأ وبيج محايد بتباين لطيف.', colors: { primary: '#956A5A', hover: '#795548', soft: '#F1EBE6', background: '#F8F5F1', card: '#FDFBF8', sidebar: '#F0EAE4', active: '#E9DCD1', text: '#342923', secondaryText: '#716057', border: '#E6DDD5', success: '#5E765E', warning: '#9C7D4A', danger: '#A65852', info: '#6D7F83' } },
  { id: 'matte-blue', name: 'أزرق مطفي', category: 'matte', description: 'أزرق مغبر ورمادي دافئ للمظهر العملي.', colors: { primary: '#627889', hover: '#506372', soft: '#E9EEF0', background: '#F5F6F5', card: '#FCFCFA', sidebar: '#EAEFF0', active: '#DCE5E8', text: '#293238', secondaryText: '#606B70', border: '#DDE3E4', success: '#577563', warning: '#9B7D4C', danger: '#A65D5C', info: '#71858D' } },
  { id: 'matte-rose', name: 'وردي مطفي', category: 'matte', description: 'وردي غباري هادئ بعيد عن الألوان الحادة.', colors: { primary: '#936875', hover: '#78525E', soft: '#F2E9EC', background: '#F8F5F5', card: '#FDFBFC', sidebar: '#F0E9EB', active: '#E9D9DE', text: '#34272B', secondaryText: '#705F63', border: '#E6DCE0', success: '#567661', warning: '#9C7B4B', danger: '#A6535D', info: '#6D7C89' } },
  { id: 'site-facebook', name: 'مستوحى من Facebook', category: 'websites', description: 'أزرق اجتماعي واضح مع أسطح فاتحة.', colors: { primary: '#1877F2', hover: '#145FC2', soft: '#E7F0FE', background: '#F0F2F5', card: '#FFFFFF', sidebar: '#E8EBF0', active: '#DCE7F7', text: '#1C1E21', secondaryText: '#606770', border: '#D8DDE5', success: '#24845D', warning: '#B87508', danger: '#C23E48', info: '#1877F2' } },
  { id: 'site-youtube', name: 'مستوحى من YouTube', category: 'websites', description: 'أحمر بارز مع خلفيات بيضاء ورمادية.', colors: { primary: '#D93025', hover: '#B3261E', soft: '#FCE9E7', background: '#F8F8F8', card: '#FFFFFF', sidebar: '#F0F0F0', active: '#F8DEDC', text: '#202124', secondaryText: '#5F6368', border: '#E1E3E6', success: '#18865B', warning: '#B7791F', danger: '#B3261E', info: '#4267B2' } },
  { id: 'site-google', name: 'مستوحى من Google', category: 'websites', description: 'أزرق نظيف مع لمسات متعددة الألوان.', colors: { primary: '#4285F4', hover: '#3367D6', soft: '#E8F0FE', background: '#F8F9FA', card: '#FFFFFF', sidebar: '#F1F3F4', active: '#DCE8FC', text: '#202124', secondaryText: '#5F6368', border: '#DADCE0', success: '#18865B', warning: '#B7791F', danger: '#C5221F', info: '#4285F4' } },
  { id: 'site-whatsapp', name: 'مستوحى من WhatsApp', category: 'websites', description: 'أخضر تواصلي مع خلفية محايدة مريحة.', colors: { primary: '#128C7E', hover: '#0E7166', soft: '#E5F4F1', background: '#F5F7F6', card: '#FFFFFF', sidebar: '#EAF1EF', active: '#D8EEE9', text: '#1F2D2A', secondaryText: '#5D6A66', border: '#DCE5E2', success: '#128C7E', warning: '#B7791F', danger: '#B53C42', info: '#3977A8' } },
  { id: 'site-instagram', name: 'مستوحى من Instagram', category: 'websites', description: 'وردي أرجواني مع تفاصيل دافئة.', colors: { primary: '#A12B78', hover: '#81215F', soft: '#F7E8F1', background: '#FAF8F9', card: '#FFFFFF', sidebar: '#F3EDF1', active: '#F0DCE9', text: '#28212A', secondaryText: '#6C5D6A', border: '#E8DDE5', success: '#27805D', warning: '#B7791F', danger: '#B53C4D', info: '#6F54B5' } },
  { id: 'site-spotify', name: 'مستوحى من Spotify', category: 'websites', description: 'أخضر موسيقي غني على خلفيات محايدة.', colors: { primary: '#147D43', hover: '#0F6636', soft: '#E5F2E9', background: '#F5F7F5', card: '#FFFFFF', sidebar: '#EAF0EB', active: '#D8EBDC', text: '#202820', secondaryText: '#5E695F', border: '#DCE4DD', success: '#147D43', warning: '#AD781D', danger: '#B23E45', info: '#47759A' } },
];

const FILTERS: Array<{ value: ThemeFilter; label: string }> = [
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

const CUSTOM_THEME_STORAGE_KEY = 'cerami-custom-themes';

const isValidHex = (value: string) => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((value || '').trim());

const normalizeHex = (value: string, fallback: string) => {
  const candidate = (value || '').trim();
  if (/^#[0-9a-fA-F]{3}$/.test(candidate)) {
    const expanded = candidate.slice(1).split('').map((char) => char + char).join('');
    return `#${expanded.toUpperCase()}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toUpperCase() : fallback;
};

const relativeLuminance = (hex: string) => {
  const color = normalizeHex(hex, '#000000').slice(1);
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const contrastRatio = (foreground: string, background: string) => {
  const luminances = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
};

const paletteContrastIssues = (palette: ThemePalette) => [
  contrastRatio(getAccessibleForeground(palette.background, palette.text), palette.background),
  contrastRatio(getAccessibleForeground(palette.card, palette.text), palette.card),
  contrastRatio(getAccessibleForeground(palette.primary), palette.primary),
].filter((ratio) => ratio < 4.5).length;

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

const readSavedCustomThemes = (): { themes: CustomThemeRecord[]; invalidCount: number } => {
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
  const [savedThemeLoad] = React.useState(readSavedCustomThemes);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [themeFilter, setThemeFilter] = React.useState<ThemeFilter>('all');
  const [customThemes, setCustomThemes] = React.useState<CustomThemeRecord[]>(savedThemeLoad.themes);
  const [customThemesDirty, setCustomThemesDirty] = React.useState(false);
  const [customThemeName, setCustomThemeName] = React.useState('الثيم الخاص بي');
  const [customThemeId, setCustomThemeId] = React.useState<string | null>(null);
  const [builder, setBuilder] = React.useState<ThemePalette>(() => buildPaletteFromSettings(settings));
  const [builderHexDrafts, setBuilderHexDrafts] = React.useState<Record<keyof ThemePalette, string>>(() => buildPaletteFromSettings(settings));
  const [builderHexErrors, setBuilderHexErrors] = React.useState<Partial<Record<keyof ThemePalette, string>>>({});
  const [activeColorKey, setActiveColorKey] = React.useState<ColorSettingKey | null>(null);
  const colorDialogRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const [draftColor, setDraftColor] = React.useState('#34445a');
  const [hexInput, setHexInput] = React.useState('#34445a');
  const [hexError, setHexError] = React.useState('');
  const [copyFeedback, setCopyFeedback] = React.useState<string | null>(null);
  const [storageNotice, setStorageNotice] = React.useState<{ type: 'success' | 'error'; text: string } | null>(
    savedThemeLoad.invalidCount
      ? { type: 'error', text: `تم تجاهل ${savedThemeLoad.invalidCount} من الثيمات المحفوظة لاحتوائها على بيانات غير صالحة.` }
      : null,
  );

  React.useEffect(() => {
    const palette = buildPaletteFromSettings(settings);
    setBuilder(palette);
    setBuilderHexDrafts(palette);
    setBuilderHexErrors({});
  }, [settings]);

  const openColorEditor = React.useCallback((key: ColorSettingKey) => {
    const config = getColorConfig(key);
    const nextValue = normalizeHex(String(settings[key] || config.fallback), config.fallback);
    setActiveColorKey(key);
    setDraftColor(nextValue);
    setHexInput(nextValue);
    setHexError('');
  }, [settings]);

  const closeColorEditor = React.useCallback(() => {
    setActiveColorKey(null);
    setDraftColor('#34445a');
    setHexInput('#34445a');
    setHexError('');
  }, []);

  const applySelectedColor = React.useCallback(() => {
    if (!activeColorKey) return;
    const config = getColorConfig(activeColorKey);
    const normalized = normalizeHex(draftColor, config.fallback);
    if (!isValidHex(normalized)) {
      setHexError('يرجى إدخال كود HEX صالح مثل #3B6EAE');
      return;
    }
    onChange(activeColorKey as keyof SystemSettings, normalized as SystemSettings[keyof SystemSettings]);
    closeColorEditor();
  }, [activeColorKey, closeColorEditor, draftColor, onChange]);

  const restoreSelectedColor = React.useCallback(() => {
    if (!activeColorKey) return;
    const config = getColorConfig(activeColorKey);
    const defaultValue = config.fallback;
    setDraftColor(defaultValue);
    setHexInput(defaultValue);
    setHexError('');
  }, [activeColorKey]);

  const handleDraftHexChange = React.useCallback((value: string) => {
    const trimmed = value.trim();
    setHexInput(trimmed);
    if (!trimmed) {
      setHexError('أدخل رمز HEX');
      return;
    }
    if (!isValidHex(trimmed)) {
      setHexError('رمز HEX غير صالح');
      return;
    }
    const normalized = normalizeHex(trimmed, draftColor);
    setDraftColor(normalized);
    setHexError('');
  }, [draftColor]);

  const selectedColorConfig = activeColorKey ? getColorConfig(activeColorKey) : null;
  const selectedCurrentValue = selectedColorConfig ? normalizeHex(String(settings[selectedColorConfig.key] || selectedColorConfig.fallback), selectedColorConfig.fallback) : '#34445a';
  const selectedPalette = activeColorKey ? COLOR_PRESETS[activeColorKey] ?? [] : [];

  React.useEffect(() => {
    if (activeColorKey) {
      const config = getColorConfig(activeColorKey);
      const nextValue = normalizeHex(String(settings[activeColorKey] || config.fallback), config.fallback);
      setDraftColor(nextValue);
      setHexInput(nextValue);
    }
  }, [activeColorKey, settings]);

  React.useEffect(() => {
    if (!activeColorKey) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => colorDialogRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeColorEditor();
        return;
      }
      if (event.key !== 'Tab' || !colorDialogRef.current) return;
      const focusable = Array.from(colorDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        colorDialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === colorDialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [activeColorKey, closeColorEditor]);

  const copySelectedHex = React.useCallback(async () => {
    const value = draftColor.toUpperCase();
    let copied = false;

    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        // Fallback below for browsers or contexts that block clipboard access.
      }
    }

    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        copied = document.execCommand('copy');
      } catch (error) {
        console.warn('Clipboard write failed:', error);
      } finally {
        document.body.removeChild(textarea);
      }
    }

    if (copied) {
      setCopyFeedback('\u062a\u0645 \u0646\u0633\u062e HEX');
      setStorageNotice(null);
      window.setTimeout(() => setCopyFeedback(null), 1200);
      return;
    }

    setCopyFeedback(null);
    setStorageNotice({ type: 'error', text: `\u062a\u0639\u0630\u0631 \u0646\u0633\u062e ${value} \u0625\u0644\u0649 \u0627\u0644\u062d\u0627\u0641\u0638\u0629. \u064a\u0645\u0643\u0646\u0643 \u0646\u0633\u062e\u0647 \u064a\u062f\u0648\u064a\u0627.` });
  }, [draftColor]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !customThemesDirty) return;
    try {
      window.localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(customThemes));
      setCustomThemesDirty(false);
      setStorageNotice((current) => current?.type === 'error' && current.text.includes('\u0627\u0644\u062d\u0627\u0641\u0638\u0629') ? null : current);
    } catch (error) {
      const message = '\u062a\u0639\u0630\u0651\u0631\u062a \u062d\u0641\u0638 \u0627\u0644\u062b\u064a\u0645\u0627\u062a \u0627\u0644\u0645\u062e\u0635\u0635\u0629 \u0641\u064a \u0647\u0630\u0627 \u0627\u0644\u0645\u062a\u0635\u0641\u062d. \u0633\u062a\u0628\u0642\u0649 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a \u0627\u0644\u062d\u0627\u0644\u064a\u0629 \u0641\u064a \u0647\u0630\u0627 \u0627\u0644\u062c\u0644\u0633\u0629 \u0641\u0642\u0637\u0627.';
      setStorageNotice({ type: 'error', text: message });
      console.warn('Appearance customization theme storage could not be saved:', error);
    }
  }, [customThemes, customThemesDirty]);

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
  const preferredPreviewText = previewDark ? '#e7ebf0' : settings.uiTextColor || '#252b36';
  const previewCanvasText = getAccessibleForeground(previewCanvas, preferredPreviewText);
  const previewText = getAccessibleForeground(previewSurface, preferredPreviewText);
  const previewBorder = previewDark ? '#343e4a' : settings.uiBorderColor || '#e1e5ea';
  const primaryColor = settings.brandPrimaryColor || '#34445a';
  const primaryHover = mixHexColors(primaryColor, '#000000', 0.14);
  const primaryPressed = mixHexColors(primaryColor, '#000000', 0.26);
  const accentSoft = mixHexColors(primaryColor, previewSurface, 0.9);
  const accentBorder = mixHexColors(primaryColor, previewSurface, 0.72);
  const successColor = settings.uiSuccessColor || '#39765b';
  const warningColor = settings.uiWarningColor || '#8a6a35';
  const dangerColor = settings.uiDangerColor || '#a95050';
  const previewStyle = {
    '--cerami-primary': primaryColor,
    '--brand-accent': settings.brandAccentColor || '#64748b',
    '--cerami-primary-hover': primaryHover,
    '--cerami-primary-pressed': primaryPressed,
    '--cerami-primary-text': getAccessibleForeground(primaryColor),
    '--cerami-primary-hover-text': getAccessibleForeground(primaryHover),
    '--cerami-primary-pressed-text': getAccessibleForeground(primaryPressed),
    '--cerami-primary-readable': readableColorOnSurface(primaryColor, previewSurface),
    '--cerami-accent-soft': accentSoft,
    '--cerami-accent-soft-text': getAccessibleForeground(accentSoft),
    '--cerami-accent-border': accentBorder,
    '--cerami-accent-border-text': getAccessibleForeground(accentBorder),
    '--win-accent': primaryColor,
    '--win-accent-hover': primaryHover,
    '--win-accent-pressed': primaryPressed,
    '--win-accent-text': getAccessibleForeground(primaryColor),
    '--win-accent-hover-text': getAccessibleForeground(primaryHover),
    '--win-accent-pressed-text': getAccessibleForeground(primaryPressed),
    '--win-accent-readable': readableColorOnSurface(primaryColor, previewSurface),
    '--win-accent-soft': accentSoft,
    '--win-accent-soft-text': getAccessibleForeground(accentSoft),
    '--win-accent-border': accentBorder,
    '--win-radius': settings.uiCornerRadius === 'compact' ? '4px' : settings.uiCornerRadius === 'rounded' ? '10px' : '6px',
    '--cerami-surface': previewSurface,
    '--cerami-canvas': previewCanvas,
    '--cerami-canvas-text': previewCanvasText,
    '--cerami-border': previewBorder,
    '--cerami-text': previewText,
    '--cerami-surface-text': previewText,
    '--win-surface': previewSurface,
    '--win-canvas': previewCanvas,
    '--win-canvas-text': previewCanvasText,
    '--win-surface-text': previewText,
    '--win-border': previewBorder,
    '--win-text': previewText,
    '--win-text-secondary': previewText,
    '--win-text-muted': previewText,
    '--win-success': successColor,
    '--win-success-text': readableColorOnSurface(successColor, previewSurface),
    '--cerami-success-on-color': getAccessibleForeground(successColor),
    '--win-warning': warningColor,
    '--win-warning-text': readableColorOnSurface(warningColor, previewSurface),
    '--cerami-warning-on-color': getAccessibleForeground(warningColor),
    '--win-danger': dangerColor,
    '--win-danger-text': readableColorOnSurface(dangerColor, previewSurface),
    '--cerami-danger-on-color': getAccessibleForeground(dangerColor),
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
    const colors: Array<[string | undefined, string, string]> = [
      [settings.brandPrimaryColor, String(DEFAULTS.brandPrimaryColor), theme.colors.primary],
      [settings.brandAccentColor, String(DEFAULTS.brandAccentColor), theme.colors.info],
      [settings.uiCanvasColor, String(DEFAULTS.uiCanvasColor), theme.colors.background],
      [settings.uiSurfaceColor, String(DEFAULTS.uiSurfaceColor), theme.colors.card],
      [settings.uiTextColor, String(DEFAULTS.uiTextColor), theme.colors.text],
      [settings.uiBorderColor, String(DEFAULTS.uiBorderColor), theme.colors.border],
      [settings.uiSuccessColor, String(DEFAULTS.uiSuccessColor), theme.colors.success],
      [settings.uiWarningColor, String(DEFAULTS.uiWarningColor), theme.colors.warning],
      [settings.uiDangerColor, String(DEFAULTS.uiDangerColor), theme.colors.danger],
    ];
    return colors.every(([setting, fallback, preset]) => normalizeHex(setting || fallback, fallback) === preset.toUpperCase());
  };

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
  const draftTextColor = contrastRatio('#FFFFFF', draftColor) >= contrastRatio('#000000', draftColor)
    ? '#FFFFFF'
    : '#000000';

  const saveCustomTheme = (isUpdate = false) => {
    if (readOnly || !canApplyBuilder || builderContrastIssues > 0) return;
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
    setCustomThemesDirty(true);
    setCustomThemeId(record.id);
  };

  const applyCustomTheme = (record: CustomThemeRecord) => {
    if (readOnly || !isThemePalette(record.colors)) return;
    if (paletteContrastIssues(record.colors) > 0) {
      setStorageNotice({ type: 'error', text: 'تعذر تطبيق الثيم لضعف التباين. عدّل ألوان النص والخلفية واللون الأساسي حتى تحقق نسبة 4.5:1 على الأقل.' });
      return;
    }
    applyThemePalette(record.colors, onChange);
    setCustomThemeId(record.id);
    setCustomThemeName(record.name);
    setBuilder({ ...record.colors });
    setBuilderHexDrafts({ ...record.colors });
    setBuilderHexErrors({});
  };

  const deleteCustomTheme = (id: string) => {
    setCustomThemes((current) => current.filter((item) => item.id !== id));
    setCustomThemesDirty(true);
    if (customThemeId === id) {
      setCustomThemeId(null);
    }
  };

  const duplicateCurrentTheme = () => {
    if (readOnly || !canApplyBuilder || builderContrastIssues > 0) return;
    const name = `${customThemeName.trim() || 'الثيم الخاص بي'} نسخة`;
    const record: CustomThemeRecord = { id: createThemeId(), name, colors: { ...builder } };
    setCustomThemes((current) => [record, ...current]);
    setCustomThemesDirty(true);
    setCustomThemeId(record.id);
    setCustomThemeName(name);
  };

  const restoreDefaults = () => {
    if (readOnly || !window.confirm('هل تريد استعادة إعدادات الواجهة الافتراضية؟')) return;
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

  const restoreBuilderDefaults = () => {
    setBuilder({ ...DEFAULT_CUSTOM_THEME });
    setBuilderHexDrafts({ ...DEFAULT_CUSTOM_THEME });
    setBuilderHexErrors({});
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
              <h2 className="text-base font-bold text-[var(--cerami-text)]">استوديو مظهر النظام</h2>
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

      <section className="win-card p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--cerami-text)]">ألوان النظام</h3>
            <p className="mt-1 text-xs text-[var(--cerami-muted)]">اضغط على أي لون لتخصيصه بشكل مستقل مع معاينة مباشرة ومعالجة HEX.</p>
          </div>
          <button type="button" className="win-btn" disabled={readOnly} onClick={() => {
            onChange('brandPrimaryColor', DEFAULTS.brandPrimaryColor);
            onChange('brandAccentColor', DEFAULTS.brandAccentColor);
            onChange('uiCanvasColor', DEFAULTS.uiCanvasColor);
            onChange('uiSurfaceColor', DEFAULTS.uiSurfaceColor);
            onChange('uiTextColor', DEFAULTS.uiTextColor);
            onChange('uiBorderColor', DEFAULTS.uiBorderColor);
            onChange('uiSuccessColor', DEFAULTS.uiSuccessColor);
            onChange('uiWarningColor', DEFAULTS.uiWarningColor);
            onChange('uiDangerColor', DEFAULTS.uiDangerColor);
          }}>
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
                onClick={() => openColorEditor(key)}
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

      <section className="win-card p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-[var(--cerami-text)]">إعدادات الواجهة</h3>
          <p className="mt-1 text-xs text-[var(--cerami-muted)]">
            اضبط نمط العرض والخط والحجم والاتجاه والتخطيط بما يناسب طريقة عملك.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">نمط الأزرار</span>
            <select
              value={settings.uiButtonStyle || 'solid'}
              onChange={(event) => onChange('uiButtonStyle', event.target.value as SystemSettings['uiButtonStyle'])}
              disabled={readOnly}
              className={SELECT_CLASS}
            >
              {BUTTON_STYLES.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">استدارة الزوايا</span>
            <select
              value={settings.uiCornerRadius || 'standard'}
              onChange={(event) => onChange('uiCornerRadius', event.target.value as SystemSettings['uiCornerRadius'])}
              disabled={readOnly}
              className={SELECT_CLASS}
            >
              <option value="compact">زوايا صغيرة</option>
              <option value="standard">متوسطة</option>
              <option value="rounded">مستديرة</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">كثافة الواجهة</span>
            <select
              value={settings.uiDensity || 'comfortable'}
              onChange={(event) => onChange('uiDensity', event.target.value as SystemSettings['uiDensity'])}
              disabled={readOnly}
              className={SELECT_CLASS}
            >
              <option value="comfortable">مريحة — مسافات أوسع</option>
              <option value="compact">مضغوطة — معلومات أكثر</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">حجم الخط</span>
            <select
              value={settings.uiFontScale || 'standard'}
              onChange={(event) => onChange('uiFontScale', event.target.value as SystemSettings['uiFontScale'])}
              disabled={readOnly}
              className={SELECT_CLASS}
            >
              <option value="small">صغير</option>
              <option value="standard">قياسي</option>
              <option value="large">كبير</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">نوع الخط</span>
            <select
              value={settings.fontFamily || 'Cairo'}
              onChange={(event) => onChange('fontFamily', event.target.value as SystemSettings['fontFamily'])}
              disabled={readOnly}
              className={SELECT_CLASS}
            >
              <option value="Cairo">القاهرة</option>
              <option value="Tajawal">تجوال</option>
              <option value="system-ui">خط واجهة النظام</option>
              <option value="Arial">أريال</option>
              <option value="Tahoma">تاهوما</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">الوضع</span>
            <select
              value={settings.themeMode || 'light'}
              onChange={(event) => onChange('themeMode', event.target.value as SystemSettings['themeMode'])}
              disabled={readOnly}
              className={SELECT_CLASS}
            >
              <option value="light">فاتح</option>
              <option value="dark">داكن</option>
              <option value="system">حسب إعداد الجهاز</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">تخطيط التنقل</span>
            <select
              value={settings.navigationLayout || 'sidebar'}
              onChange={(event) => onChange('navigationLayout', event.target.value as SystemSettings['navigationLayout'])}
              disabled={readOnly}
              className={SELECT_CLASS}
            >
              <option value="sidebar">قائمة جانبية</option>
              <option value="header">شريط علوي</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--cerami-text-secondary)]">اتجاه الواجهة</span>
            <select
              value={settings.interfaceDirection || 'rtl'}
              onChange={(event) => onChange('interfaceDirection', event.target.value as SystemSettings['interfaceDirection'])}
              disabled={readOnly}
              className={SELECT_CLASS}
            >
              <option value="rtl">من اليمين إلى اليسار (RTL)</option>
              <option value="ltr">من اليسار إلى اليمين (LTR)</option>
            </select>
          </label>
        </div>
      </section>

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
              className={`overflow-hidden rounded-xl border p-3 transition ${isPresetActive(theme) ? 'border-[var(--cerami-primary)] ring-2 ring-[var(--cerami-accent-soft)]' : 'border-[var(--cerami-border)]'}`}
              style={{ backgroundColor: theme.colors.card }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold" style={{ color: theme.colors.text }}>{theme.name}</h4>
                  <p className="mt-1 text-[11px]" style={{ color: theme.colors.text, opacity: 0.72 }}>{theme.description}</p>
                </div>
                {isPresetActive(theme) && (
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
                aria-pressed={isPresetActive(theme)}
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
              { key: 'background', label: 'خلفية التطبيق', value: builder.background, description: 'خلفية المساحات' },
              { key: 'card', label: 'خلفية البطاقات', value: builder.card, description: 'السطوح' },
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
                    value={builderHexDrafts[key as keyof ThemePalette]}
                    onChange={(event) => updateBuilderColor(key as keyof ThemePalette, event.target.value)}
                    disabled={readOnly}
                    dir="ltr"
                    aria-invalid={Boolean(builderHexErrors[key as keyof ThemePalette])}
                    aria-describedby={builderHexErrors[key as keyof ThemePalette] ? `builder-${key}-error` : undefined}
                    className="w-[92px] rounded-md border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-2 py-1 text-xs text-[var(--cerami-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cerami-primary)]"
                    aria-label={`${label} HEX`}
                  />
                </div>
                {builderHexErrors[key as keyof ThemePalette] && (
                  <p id={`builder-${key}-error`} className="text-xs text-[var(--cerami-danger)] sm:col-span-3" role="alert">
                    {builderHexErrors[key as keyof ThemePalette]}
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
                      <button type="button" className="win-btn win-btn--sm" disabled={readOnly} onClick={() => {
                        setCustomThemeId(theme.id);
                        setCustomThemeName(theme.name);
                        setBuilder({ ...theme.colors });
                        setBuilderHexDrafts({ ...theme.colors });
                        setBuilderHexErrors({});
                      }}>تعديل</button>
                      <button type="button" className="win-btn win-btn--sm" disabled={readOnly} onClick={() => deleteCustomTheme(theme.id)}>حذف</button>
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
            color: previewCanvasText,
            borderColor: previewBorder,
            borderRadius: settings.uiCornerRadius === 'compact' ? 4 : settings.uiCornerRadius === 'rounded' ? 12 : 6,
            fontFamily: `${settings.fontFamily || 'Cairo'}, Tajawal, system-ui, sans-serif`,
          }}
        >
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2" style={{ backgroundColor: previewSurface, borderColor: previewBorder }}>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-black" style={{ backgroundColor: primaryColor, color: getAccessibleForeground(primaryColor) }}>
                {(settings.brandShortName || 'س').slice(0, 2)}
              </span>
              <div>
                <p className="text-xs font-bold" style={{ color: previewText }}>{settings.brandName || 'سيراميسيس'}</p>
                <p className="text-[10px]" style={{ color: previewText }}>إدارة المعرض</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden min-w-36 items-center gap-2 rounded-md border px-2 py-1.5 text-[10px] sm:flex" style={{ borderColor: previewBorder, color: previewText }}>
                <Search className="h-3 w-3" /> ابحث في النظام
              </div>
              <Bell className="h-4 w-4" style={{ color: previewText }} aria-hidden="true" />
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold" style={{ backgroundColor: settings.brandAccentColor || '#64748b', color: getAccessibleForeground(settings.brandAccentColor || '#64748b') }}>م</span>
            </div>
          </header>
          <div className="preview-shell">
            <nav className="preview-navigation" aria-label="معاينة عناصر التنقل">
              <span className="preview-navigation__item preview-navigation__item--active"><Home className="inline h-3.5 w-3.5" /> الرئيسية</span>
              <span className="preview-navigation__item"><Boxes className="inline h-3.5 w-3.5" /> المخزون</span>
              <span className="preview-navigation__item"><ShoppingCart className="inline h-3.5 w-3.5" /> المبيعات</span>
              <span className="preview-navigation__item"><Menu className="inline h-3.5 w-3.5" /> المشتريات</span>
            </nav>
            <main className="preview-content min-w-0" aria-label="معاينة لوحة معلومات المعرض">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold" style={{ color: previewText }}>لوحة المعلومات</p>
                  <p className="mt-0.5 text-[10px]" style={{ color: previewText }}>ملخص أداء المعرض · اليوم</p>
                </div>
                <button type="button" className="win-btn win-btn--primary"><Save className="h-3.5 w-3.5" /> إجراء جديد</button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { label: 'مبيعات اليوم', value: '١٢٬٤٥٠ ج.م', color: primaryColor },
                  { label: 'طلبات قيد التنفيذ', value: '١٨ طلبًا', color: warningColor },
                  { label: 'فواتير مكتملة', value: '٣٢ فاتورة', color: successColor },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-md border p-2" style={{ backgroundColor: previewSurface, borderColor: previewBorder }}>
                    <p className="text-[10px]" style={{ color: previewText }}>{metric.label}</p>
                    <p className="mt-1 text-xs font-bold" style={{ color: readableColorOnSurface(metric.color, previewSurface) }}>{metric.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 overflow-x-auto rounded-md border" style={{ backgroundColor: previewSurface, borderColor: previewBorder }}>
                <table className="preview-table w-full min-w-[360px] text-start text-[10px]" style={{ color: previewText }}>
                  <thead>
                    <tr style={{ backgroundColor: previewCanvas }}>
                      <th className="px-2 py-1.5 font-semibold">الطلب</th>
                      <th className="px-2 py-1.5 font-semibold">العميل</th>
                      <th className="px-2 py-1.5 font-semibold">الحالة</th>
                      <th className="px-2 py-1.5 font-semibold">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t" style={{ borderColor: previewBorder }}>
                          <td className="px-2 py-1.5">#١٠٤٨</td><td className="px-2 py-1.5">معرض النور</td>
                      <td className="px-2 py-1.5" style={{ color: readableColorOnSurface(successColor, previewSurface) }}>مكتمل</td><td className="px-2 py-1.5">٤٬٨٠٠ ج.م</td>
                    </tr>
                    <tr className="border-t" style={{ borderColor: previewBorder }}>
                      <td className="px-2 py-1.5">#١٠٤٧</td><td className="px-2 py-1.5">سيراميك المدينة</td>
                      <td className="px-2 py-1.5" style={{ color: readableColorOnSurface(warningColor, previewSurface) }}>قيد التجهيز</td><td className="px-2 py-1.5">٢٬٦٥٠ ج.م</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[10px]" style={{ color: readableColorOnSurface(successColor, previewCanvas) }}>
                <Sparkles className="h-3.5 w-3.5" /> تتغير المسافات والخط والاتجاه مع الإعدادات المختارة.
              </div>
            </main>
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--cerami-muted)]">
          استخدم زر «حفظ التغييرات» أعلى صفحة الإعدادات لتطبيق المعاينة على جميع الصفحات.
        </p>
      </section>

      {selectedColorConfig && activeColorKey && (
        <div className="appearance-color-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeColorEditor();
        }}>
          <div
            ref={colorDialogRef}
            className="appearance-color-modal max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-[var(--cerami-border)] bg-[var(--cerami-surface)] p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appearance-color-dialog-title"
            tabIndex={-1}
            dir="rtl"
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
                    <div className="flex items-center justify-between gap-2 rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold shadow-sm" style={{ color: draftTextColor }}>
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
                      className="win-btn win-btn--sm mr-auto"
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
      )}
    </div>
  );
};
