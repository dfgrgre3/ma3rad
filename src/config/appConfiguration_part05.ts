import type { AppConfigEntry, AppConfigRuleAction } from './appConfiguration_part01';
import type { AppConfigRule } from './appConfiguration_part02';
import { ENTRY_KEY_PATTERN, PAGE_KEY_PATTERN, asRecord, boundedInteger, boundedString, isAppConfigDomain, normalizeConfigKey, normalizePagePath } from './appConfiguration_part04';

export function validateAppConfigEntry(input: unknown): AppConfigEntry {
  const record = asRecord(input);
  if (!isAppConfigDomain(record.domain)) throw new Error('نوع هدف التكوين غير معروف.');
  const key = normalizeConfigKey(record.key);
  if (!key || !ENTRY_KEY_PATTERN.test(key)) {
    throw new Error('مفتاح هدف التكوين غير صالح. استخدم حروفًا وأرقامًا ورموزًا بسيطة فقط.');
  }
  if (record.domain === 'page' && !PAGE_KEY_PATTERN.test(key)) {
    throw new Error('مسار الصفحة يجب أن يبدأ بشرطة مائلة /.');
  }
  const label = boundedString(record.label, 'التسمية', 160);
  const value = boundedString(record.value, 'القيمة', 4000);
  const order = boundedInteger(record.order, 'الترتيب', -10000, 10000);
  const props = asRecord(record.props);
  const serializedProps = JSON.stringify(props);
  if (serializedProps.length > 8000) throw new Error('خيارات التكوين الإضافية كبيرة جدًا.');

  return {
    domain: record.domain,
    key,
    enabled: record.enabled === undefined ? true : record.enabled === true || record.enabled === 1 || record.enabled === '1' || record.enabled === 'true',
    label,
    value,
    ...(order !== undefined ? { order } : {}),
    ...(record.required === undefined
      ? {}
      : { required: record.required === true || record.required === 1 || record.required === '1' || record.required === 'true' }),
    props,
  };
}

export function validateAppConfigRule(input: unknown): AppConfigRule {
  const record = asRecord(input);
  const kind = record.kind === 'text' ? 'text' : record.kind === 'selector' ? 'selector' : null;
  if (!kind) throw new Error('نوع قاعدة التكوين غير معروف.');
  const pagePath = normalizePagePath(record.pagePath);
  const action: AppConfigRuleAction =
    record.action === 'show' ? 'show' : record.action === 'text' ? 'text' : 'hide';
  if (kind === 'selector' && action === 'text' && !boundedString(record.replacementText, 'النص البديل', 2000)) {
    throw new Error('قاعدة استبدال عنصر تحتاج نصًا بديلًا.');
  }

  const id = boundedString(record.id, 'معرّف القاعدة', 120) || `rule_${Math.random().toString(36).slice(2, 10)}`;
  const selector = kind === 'selector'
    ? boundedString(record.selector, 'محدد العنصر', 400, { allowEmpty: false })
    : '';
  const matchText = kind === 'text'
    ? boundedString(record.matchText, 'النص الأصلي', 300, { allowEmpty: false })
    : '';
  const replacementText = boundedString(record.replacementText, 'النص البديل', 2000);
  const note = boundedString(record.note, 'ملاحظة القاعدة', 300);

  if (kind === 'text' && !replacementText && action !== 'hide') {
    throw new Error('قاعدة النص تحتاج نصًا بديلًا (يمكن أن يكون فارغًا فقط مع الإخفاء).');
  }

  return {
    id,
    kind,
    pagePath,
    ...(selector ? { selector } : {}),
    ...(matchText ? { matchText } : {}),
    ...(kind === 'text' || action === 'text' ? { replacementText } : {}),
    action,
    enabled: record.enabled === undefined ? true : record.enabled === true || record.enabled === 1 || record.enabled === '1' || record.enabled === 'true',
    ...(note ? { note } : {}),
  };
}
