import { APP_CONFIG_SCHEMA_VERSION } from './appConfiguration_part01';
import type { AppConfigEntry, AppConfigRuleAction } from './appConfiguration_part01';

export interface AppConfigRule {
  id: string;
  /** `selector` targets a DOM element; `text` replaces an exact visible string. */
  kind: 'selector' | 'text';
  /** Page path the rule applies to, or `*` for every page. */
  pagePath: string;
  selector?: string;
  matchText?: string;
  replacementText?: string;
  action: AppConfigRuleAction;
  enabled: boolean;
  note?: string;
}

export interface AppConfigSnapshot {
  schemaVersion: typeof APP_CONFIG_SCHEMA_VERSION;
  entries: AppConfigEntry[];
  rules: AppConfigRule[];
}

export interface AppConfigNumbering {
  prefix: string;
  template: string;
  /** Reset the sequence each calendar year (informational for callers). */
  resetYearly: boolean;
}

export const DEFAULT_NUMBER_TEMPLATE = '{prefix}-{year}-{seq:6}';

export const APP_CONFIG_TEXT_CATALOG: Array<{ key: string; label: string; value: string }> = [
  { key: 'shell.status.database', label: 'حالة الاتصال بقاعدة البيانات', value: 'قاعدة البيانات متصلة' },
  { key: 'shell.brand.name', label: 'اسم العلامة في شريط الحالة', value: 'سيراميسيس' },
  { key: 'shell.loading', label: 'نص التحميل', value: 'جاري التحميل...' },
  { key: 'shell.footer.today', label: 'تسمية تاريخ اليوم', value: 'اليوم' },
  { key: 'common.save', label: 'حفظ', value: 'حفظ التغييرات' },
  { key: 'common.cancel', label: 'إلغاء', value: 'إلغاء' },
  { key: 'common.search', label: 'بحث', value: 'بحث' },
];
