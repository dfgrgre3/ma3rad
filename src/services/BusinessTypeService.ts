import { SettingsService } from './SettingsService';

/** The single fallback used before an activity profile has been saved. */
export const DEFAULT_BUSINESS_TYPE = 'ceramics';

export function getEffectiveBusinessType(): string {
  const stored = SettingsService.getValue('businessType')?.trim();
  return stored || DEFAULT_BUSINESS_TYPE;
}

export class BusinessTypeService {
  public static getEffectiveBusinessType(): string {
    return getEffectiveBusinessType();
  }
}
