import { useMemo } from 'react';
import type { BusinessTermKey } from '../../../config/businessTerminology';
import { getBusinessProfile } from '../../../config/businessProfiles';
import { TerminologyService } from '../../../services/domains/config/TerminologyService';
import { SettingsService } from '../../../services/domains/config/SettingsService';
import { getEffectiveBusinessType } from '../../../services/domains/config/BusinessTypeService';
import { useTheme } from '../../../contexts/useTheme';

export function useBusinessTerm(
  key: BusinessTermKey,
): string {
  useTheme();
  return useMemo(
    () => TerminologyService.getTerm(key),
    [key],
  );
}

export function useBusinessProfileMeta() {
  const businessType = getEffectiveBusinessType();
  const customLabel = SettingsService.getValue('businessTypeLabel') || '';

  return useMemo(() => {
    const profile = getBusinessProfile(businessType);
    const label = businessType === 'custom'
      ? (customLabel || profile.name.ar || 'نشاط مخصص')
      : profile.name.ar || 'نشاط عام';

    return {
      businessType,
      label,
      description: profile.description.ar,
      profile,
    };
  }, [businessType, customLabel]);
}
