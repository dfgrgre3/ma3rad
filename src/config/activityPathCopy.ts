import { getEffectiveBusinessType } from '../services/domains/config/BusinessTypeService';
import { BUSINESS_ACTIVITY_CATALOG, getBusinessProfile } from './businessProfiles';
import { getActivityPageCopy } from './activityPageCopy';
import {
  PATH_PREFIX_SEMANTIC_KEYS,
  PATH_SEMANTIC_KEYS,
  type ActivityCopyFamilyId,
  type ActivityPageCopy,
} from './activityPathCopyTypes';
import { ACTIVITY_PATH_COPY_PART1 } from './activityPathCopy_part01';
import { ACTIVITY_PATH_COPY_PART2 } from './activityPathCopy_part02';
import { ACTIVITY_PATH_COPY_PART3 } from './activityPathCopy_part03';
import { ACTIVITY_PATH_COPY_PART4 } from './activityPathCopy_part04';

/**
 * Path-level activity page copy.
 *
 * Every workspace route carries a title/description written for each business
 * family, so a restaurant, a factory and an accounting office each read the
 * same screen in their own vocabulary. Resolution order:
 *   semantic page copy (per-activity, richest) → family path copy → undefined.
 *
 * Admin/system routes intentionally have no entries — they stay static.
 */
const ACTIVITY_PATH_FAMILY_COPY: Record<
  string,
  Partial<Record<ActivityCopyFamilyId, ActivityPageCopy>>
> = {
  ...ACTIVITY_PATH_COPY_PART1,
  ...ACTIVITY_PATH_COPY_PART2,
  ...ACTIVITY_PATH_COPY_PART3,
  ...ACTIVITY_PATH_COPY_PART4,
};

export function normalizeActivityPath(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0];
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** Title/description for `pathname` resolved for the effective (or given) activity. */
export function getActivityPathCopy(
  pathname: string,
  businessType: string = getEffectiveBusinessType(),
): ActivityPageCopy | undefined {
  const path = normalizeActivityPath(pathname);

  const semanticKey = PATH_SEMANTIC_KEYS[path]
    ?? PATH_PREFIX_SEMANTIC_KEYS.find((rule) => path.startsWith(rule.prefix))?.key;
  if (semanticKey) {
    const semantic = getActivityPageCopy(semanticKey, businessType);
    if (semantic) return semantic;
  }

  const profile = getBusinessProfile(businessType);
  // Legacy profile ids carry no familyId — resolve through the activity that
  // uses that profile so old installations still get family wording.
  const familyId = (profile.familyId
    ?? BUSINESS_ACTIVITY_CATALOG.find((a) => a.profileId === businessType)?.familyId) as
    | ActivityCopyFamilyId
    | undefined;
  if (!familyId) return undefined;
  return ACTIVITY_PATH_FAMILY_COPY[path]?.[familyId];
}

export default getActivityPathCopy;
