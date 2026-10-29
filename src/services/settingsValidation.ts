import { HEX_COLOR, type SettingsPatch } from './settingsUtils';

function validateStringSetting(key: string, value: string): string {
  switch (key) {
    case 'brandPrimaryColor':
    case 'brandAccentColor':
      if (!HEX_COLOR.test(value)) throw new Error('لون الهوية يجب أن يكون بصيغة HEX مثل #0284c7.');
      break;
    case 'themeMode':
      if (!['light', 'dark', 'system'].includes(value)) throw new Error('وضع العرض غير صالح.');
      break;
    case 'sidebarStyle':
      if (!['default', 'compact', 'hidden'].includes(value)) throw new Error('نمط القائمة غير صالح.');
      break;
    case 'navigationLayout':
      if (!['sidebar', 'header'].includes(value)) throw new Error('تخطيط التنقل غير صالح.');
      break;
    case 'costingMethod':
      if (!['AVERAGE_COST', 'FIFO'].includes(value)) throw new Error('Invalid inventory costing method.');
      break;
    case 'showroomName':
      if (value.length < 2) throw new Error('اسم المعرض مطلوب (حرفان على الأقل).');
      break;
    case 'currencySymbol':
    case 'currency':
      if (!value) throw new Error('العملة ورمزها مطلوبان.');
      break;
  }

  return value;
}

function serializeSetting(key: string, raw: string | number | boolean | null | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return '';
  if (typeof raw === 'boolean') return raw ? '1' : '0';
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) throw new Error(`قيمة غير صالحة للحقل ${key}.`);
    return String(raw);
  }

  return validateStringSetting(key, String(raw).trim());
}

export function validateSettings(patch: SettingsPatch): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(patch)) {
    const value = serializeSetting(key, raw);
    if (value !== undefined) out[key] = value;
  }
  return out;
}
