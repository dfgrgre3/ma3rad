import ceramicsTerms from './terminology/profiles/ceramics.json';
import servicesTerms from './terminology/profiles/services.json';
import professionalServicesTerms from './terminology/profiles/professional_services.json';
import { getBusinessProfileTemplateId } from './businessProfiles';
import { BUSINESS_TERMINOLOGY, BUSINESS_TERM_DEFAULTS } from './businessTerminology_part01';
import type { BusinessLanguage, BusinessTermKey } from './businessTerminology_part01';

export const BUSINESS_PROFILE_TERMINOLOGY: Record<
  string,
  Partial<Record<BusinessTermKey, Partial<Record<BusinessLanguage, string>>>>
> = {
  ceramics: ceramicsTerms,
  services: servicesTerms,
  professional_services: professionalServicesTerms,
};

export type BusinessTermOverrides = Partial<
  Record<BusinessLanguage, Partial<Record<BusinessTermKey, string>>>
>;

export const BUSINESS_TERM_KEYS = Object.keys(BUSINESS_TERMINOLOGY) as BusinessTermKey[];

export function resolveBusinessTerm(
  key: BusinessTermKey,
  options: {
    businessType: string;
    language: BusinessLanguage;
    overrides?: BusinessTermOverrides;
  },
): string {
  const custom = options.overrides?.[options.language]?.[key]?.trim();
  if (custom) return custom;

  const profileId = getBusinessProfileTemplateId(options.businessType);
  const profileValue = BUSINESS_PROFILE_TERMINOLOGY[profileId]?.[key]?.[options.language];
  if (profileValue) return profileValue;

  return BUSINESS_TERM_DEFAULTS[options.language][key] || BUSINESS_TERM_DEFAULTS.ar[key];
}
