import { getEffectiveBusinessType } from '../services/domains/config/BusinessTypeService';
import { getBusinessProfile } from './businessProfiles';
import { FAMILY_PAGE_COPY } from './activityPageCopy_families';
import { ACTIVITY_PAGE_COPY } from './activityPageCopy_activities';
import type { ActivityPageCopy, ActivityPageKey } from './activityPageCopyTypes';

/**
 * Sector page copy: titles & descriptions for the main workspace hubs,
 * resolved per activity. Resolution order:
 *   activity override → family default → undefined (page keeps its own text).
 *
 * Data lives in `activityPageCopy_families.ts` (one complete entry set per
 * business family) and `activityPageCopy_activities.ts` (one complete entry
 * set per selectable activity), so every activity's pages carry wording
 * written for that activity.
 */
export type { ActivityPageCopy, ActivityPageKey } from './activityPageCopyTypes';

export function getActivityPageCopy(
  page: ActivityPageKey,
  businessType: string = getEffectiveBusinessType(),
): ActivityPageCopy | undefined {
  const activity = ACTIVITY_PAGE_COPY[businessType]?.[page];
  if (activity) return activity;
  const familyId = getBusinessProfile(businessType).familyId;
  if (familyId) {
    const family = FAMILY_PAGE_COPY[familyId]?.[page];
    if (family) return family;
  }
  return undefined;
}

/** Resolves the activity label for inline copy composition. */
export function getActivityLabel(): string {
  return getBusinessProfile(getEffectiveBusinessType()).name.ar || 'النشاط';
}
