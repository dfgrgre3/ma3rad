import { useMemo } from 'react';
import type { BusinessTermKey } from '../config/businessTerminology';
import { getBusinessProfile } from '../config/businessProfiles';
import { TerminologyService } from '../services/TerminologyService';
import { SettingsService } from '../services/SettingsService';
import { useTheme } from '../contexts/ThemeContext';

export function useBusinessTerm(
  key: BusinessTermKey,
): string {
  const { settings } = useTheme();
  return useMemo(
    () => TerminologyService.getTerm(key),
    [key, settings],
  );
}

export function useBusinessProfileMeta() {
  const businessType = SettingsService.getValue('businessType') || 'ceramics';
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
