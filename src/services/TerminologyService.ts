import {
  BUSINESS_PROFILE_TERMINOLOGY,
  resolveBusinessTerm,
  validateBusinessTermOverrides,
  type BusinessTermKey,
  type BusinessTermOverrides,
} from '../config/businessTerminology';
import { getBusinessProfileTemplateId } from '../config/businessProfiles';
import { SettingsService } from './SettingsService';
import type { User } from '../types';

const OVERRIDES_SETTING = 'businessTerminologyOverrides';
const warnedInvalidSettings = new Set<string>();

export type BusinessTermSource = 'organization' | 'profile' | 'language-default';

export class TerminologyService {
  public static getOverrides(): BusinessTermOverrides {
    const raw = SettingsService.getValue(OVERRIDES_SETTING);
    if (!raw) return {};

    try {
      return validateBusinessTermOverrides(JSON.parse(raw));
    } catch (error) {
      if (!warnedInvalidSettings.has(raw)) {
        warnedInvalidSettings.add(raw);
        console.warn(
          'Invalid business terminology settings; using profile and language defaults.',
          error instanceof Error ? error.message : String(error),
        );
      }
      return {};
    }
  }

  public static getTerm(
    key: BusinessTermKey,
  ): string {
    const businessType = SettingsService.getValue('businessType') || 'ceramics';
    return resolveBusinessTerm(key, {
      businessType,
      language: 'ar',
      overrides: TerminologyService.getOverrides(),
    });
  }

  public static getSource(
    key: BusinessTermKey,
    businessType = SettingsService.getValue('businessType') || 'ceramics',
    overrides = TerminologyService.getOverrides(),
  ): BusinessTermSource {
    if (overrides.ar?.[key]?.trim()) return 'organization';
    return BUSINESS_PROFILE_TERMINOLOGY[getBusinessProfileTemplateId(businessType)]?.[key]?.ar
      ? 'profile'
      : 'language-default';
  }

  public static validateOverrides(value: unknown): BusinessTermOverrides {
    return validateBusinessTermOverrides(value);
  }

  public static saveOverrides(
    value: unknown,
    actor?: User | null,
  ): void {
    const normalized = validateBusinessTermOverrides(value);
    SettingsService.update(
      { [OVERRIDES_SETTING]: JSON.stringify(normalized) },
      actor,
    );
  }
}
