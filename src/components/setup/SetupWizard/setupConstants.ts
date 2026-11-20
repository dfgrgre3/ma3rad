import { Store, Warehouse, Boxes, Settings2, Rocket } from 'lucide-react';
import type { SystemCheckResult, SetupOptions } from './setupTypes';

export const SETUP_DRAFT_KEY = 'setup_draft';

export const CHECKING_RESULT: SystemCheckResult = { state: 'checking', detail: 'جارٍ الفحص...' };

export const DEFAULT_SETUP_OPTIONS: SetupOptions = {
  company: true,
  branch: true,
  users: true,
  modules: true,
  accounting: true,
  inventory: true,
};

export const CURRENCIES = [
  { code: 'EGP', symbol: 'ج.م', label: 'جنيه مصري' },
  { code: 'SAR', symbol: 'ر.س', label: 'ريال سعودي' },
  { code: 'AED', symbol: 'د.إ', label: 'درهم إماراتي' },
  { code: 'USD', symbol: '$', label: 'دولار أمريكي' },
];

export const STEPS = [
  { label: 'الشركة', icon: Store },
  { label: 'الفرع والمخزون', icon: Warehouse },
  { label: 'النشاط والوحدات', icon: Boxes },
  { label: 'المالية والأمان', icon: Settings2 },
  { label: 'مراجعة الإعداد', icon: Rocket },
] as const;

export const inputClass = 'w-full min-h-10 px-3.5 py-2.5 text-sm border border-line-strong rounded-lg bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-60 dark:placeholder:text-muted';
export const labelClass = 'block text-xs font-semibold text-ink-secondary mb-1.5 ';
