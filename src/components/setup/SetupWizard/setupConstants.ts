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

export const inputClass = 'w-full min-h-10 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';
export const labelClass = 'block text-xs font-semibold text-slate-600 mb-1.5 dark:text-slate-300';
