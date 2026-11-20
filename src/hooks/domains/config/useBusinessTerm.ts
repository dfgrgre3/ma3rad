import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { BusinessTermKey } from '../../../config/businessTerminology';
import { getBusinessProfile } from '../../../config/businessProfiles';
import { getActivityPageCopy, type ActivityPageKey, type ActivityPageCopy } from '../../../config/activityPageCopy';
import { getActivityPathCopy } from '../../../config/activityPathCopy';
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

/**
 * Sector page copy for a workspace hub or main page. Returns undefined when
 * the activity has no specific wording — callers should keep their default
 * title/description in that case.
 */
export function useActivityPageCopy(page: ActivityPageKey): ActivityPageCopy | undefined {
  useTheme();
  const businessType = getEffectiveBusinessType();
  return useMemo(() => getActivityPageCopy(page, businessType), [page, businessType]);
}

/**
 * Path-level activity copy for the current route. Resolves title/description
 * written for the selected activity's family (or the activity itself for the
 * main hub pages). Returns undefined on unmapped/admin routes.
 */
export function useActivityPathCopy(): ActivityPageCopy | undefined {
  useTheme();
  const { pathname } = useLocation();
  const businessType = getEffectiveBusinessType();
  return useMemo(() => getActivityPathCopy(pathname, businessType), [pathname, businessType]);
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
