import { HEX_COLOR, type SettingsPatch } from './settingsUtils';

export function validateSettings(patch: SettingsPatch): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(patch)) {
      if (raw === undefined) continue;
      if (raw === null) {
        out[key] = '';
        continue;
      }
      if (typeof raw === 'boolean') {
        out[key] = raw ? '1' : '0';
        continue;
      }
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) throw new Error(`قيمة غير صالحة للحقل ${key}.`);
        out[key] = String(raw);
        continue;
      }
      const value = String(raw).trim();
      switch (key) {
        case 'brandPrimaryColor':
        case 'brandAccentColor':
          if (!HEX_COLOR.test(value)) throw new Error('لون الهوية يجب أن يكون بصيغة HEX مثل #0284c7.');
          out[key] = value;
          break;
        case 'themeMode':
          if (!['light', 'dark', 'system'].includes(value)) throw new Error('وضع العرض غير صالح.');
          out[key] = value;
          break;
        case 'sidebarStyle':
          if (!['default', 'compact', 'hidden'].includes(value)) throw new Error('نمط القائمة غير صالح.');
          out[key] = value;
          break;
        case 'costingMethod':
          if (!['AVERAGE_COST', 'FIFO'].includes(value)) throw new Error('Invalid inventory costing method.');
          out[key] = value;
          break;
        case 'showroomName':
          if (value.length < 2) throw new Error('اسم المعرض مطلوب (حرفان على الأقل).');
          out[key] = value;
          break;
        case 'currencySymbol':
        case 'currency':
          if (!value) throw new Error('العملة ورمزها مطلوبان.');
          out[key] = value;
          break;
        default:
          out[key] = value;
      }
    }
    return out;
  }
