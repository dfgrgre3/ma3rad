import { BUSINESS_TERMINOLOGY } from './businessTerminology_part01';
import type { BusinessTermKey } from './businessTerminology_part01';
import type { BusinessTermOverrides } from './businessTerminology_part02';

export function validateBusinessTermOverrides(value: unknown): BusinessTermOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('تخصيص المصطلحات يجب أن يكون كائنًا صالحًا.');
  }

  const input = value as Record<string, unknown>;
  const normalized: BusinessTermOverrides = {};
  const seenValues = new Map<string, BusinessTermKey>();

  // Ignore saved overrides for any non-Arabic language (notably legacy 'en')
  // so existing installations migrate to Arabic-only labels without errors.

  const rawArabicDictionary = input.ar;
  if (rawArabicDictionary !== undefined) {
    if (!rawArabicDictionary || typeof rawArabicDictionary !== 'object' || Array.isArray(rawArabicDictionary)) {
      throw new Error('قاموس المصطلحات للغة العربية غير صالح.');
    }

    const dictionary = rawArabicDictionary as Record<string, unknown>;
    const entries: Partial<Record<BusinessTermKey, string>> = {};
    for (const [rawKey, rawLabel] of Object.entries(dictionary)) {
      if (!Object.prototype.hasOwnProperty.call(BUSINESS_TERMINOLOGY, rawKey)) {
        throw new Error(`مفتاح مصطلح غير مسموح: ${rawKey}.`);
      }
      if (typeof rawLabel !== 'string') {
        throw new Error(`قيمة المصطلح ${rawKey} يجب أن تكون نصًا.`);
      }

      const label = rawLabel.trim();
      if (!label) continue;
      if (label.length > 80) throw new Error(`قيمة المصطلح ${rawKey} تتجاوز 80 حرفًا.`);

      const key = rawKey as BusinessTermKey;
      const duplicate = seenValues.get(label.toLocaleLowerCase('ar'));
      if (duplicate && duplicate !== key) {
        throw new Error(`المصطلح «${label}» مكرر بين ${duplicate} و${key}.`);
      }
      seenValues.set(label.toLocaleLowerCase('ar'), key);
      entries[key] = label;
    }
    normalized.ar = entries;
  }

  // Ignore saved English overrides so existing installations migrate to Arabic-only labels.
  return normalized;
}
