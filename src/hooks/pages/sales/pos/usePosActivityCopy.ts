import { useMemo } from 'react';
import { useTheme } from '../../../../contexts/useTheme';
import { getEffectiveBusinessType } from '../../../../services/domains/config/BusinessTypeService';
import { BUSINESS_ACTIVITY_CATALOG } from '../../../../config/businessProfiles';
import {
  POS_ACTIVITY_COPY,
  POS_DEFAULT_COPY,
  POS_FAMILY_COPY,
  type PosActivityCopy,
} from '../../../../config/posActivityCopy';

/**
 * POS wording for the currently selected activity: activity override →
 * family fallback → generic defaults. Re-renders with the theme tick so a
 * changed activity selection is picked up like the other activity hooks.
 */
export function usePosActivityCopy(): PosActivityCopy {
  useTheme();
  const businessType = getEffectiveBusinessType();
  return useMemo(() => {
    const activity = BUSINESS_ACTIVITY_CATALOG.find((item) => item.id === businessType);
    return {
      ...POS_DEFAULT_COPY,
      ...(activity ? POS_FAMILY_COPY[activity.familyId] : undefined),
      ...(activity ? POS_ACTIVITY_COPY[activity.id] : undefined),
    };
  }, [businessType]);
}
