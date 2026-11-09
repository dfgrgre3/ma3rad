/**
 * Dynamic Application Configuration Engine — shared schema.
 *
 * The engine stores administrator overrides for page/section/field visibility,
 * labels, text values, policies, document numbering and print templates.
 * Definitions in this file are pure and safe to import from services, React
 * components and tests. No database or React dependency belongs here.
 */

export const APP_CONFIG_SCHEMA_VERSION = 1 as const;

export type AppConfigDomain =
  | 'page'
  | 'section'
  | 'field'
  | 'text'
  | 'module'
  | 'action'
  | 'feature'
  | 'policy'
  | 'numbering'
  | 'print';

export const APP_CONFIG_DOMAINS: readonly AppConfigDomain[] = [
  'page', 'section', 'field', 'text', 'module', 'action', 'feature',
  'policy', 'numbering', 'print',
] as const;

export const APP_CONFIG_DOMAIN_LABELS: Record<AppConfigDomain, string> = {
  page: 'الصفحات',
  section: 'أقسام الصفحات',
  field: 'الحقول',
  text: 'النصوص',
  module: 'الوحدات',
  action: 'الأزرار والإجراءات',
  feature: 'أعلام الميزات',
  policy: 'السياسات',
  numbering: 'ترقيم المستندات',
  print: 'قوالب الطباعة',
};

export interface AppConfigEntry {
  domain: AppConfigDomain;
  key: string;
  /** Visibility switch. Defaults to true when no entry exists. */
  enabled: boolean;
  /** Display label override (page, section, field, text title). */
  label: string;
  /** Text/policy/numbering/print value. */
  value: string;
  /** Optional ordering index inside its container. */
  order?: number;
  /** Makes a configured field required. */
  required?: boolean;
  /** Extra typed options (numbering template, policy type, selector, ...). */
  props: Record<string, unknown>;
}

export type AppConfigRuleAction = 'hide' | 'show' | 'text';
