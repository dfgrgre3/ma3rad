import { getEffectiveBusinessType } from '../services/domains/config/BusinessTypeService';
import { getActivityRows, type ActivityDefinition } from './activityCatalog';
import { getActivityHiddenPaths, isActivityPathHidden } from './activityPageVisibility';
import { getActivityNavLabel } from './activityNavLabels';
import { getActivityPathCopy } from './activityPathCopy';
import type { ActivityPageCopy } from './activityPageCopy';

/**
 * Unified read layer over the per-activity configuration.
 *
 * This module does not own any data. It exposes one object per activity that
 * answers "what does this activity show?" by delegating to the existing
 * sources (visibility rules, nav labels, path copy). Behaviour is identical to
 * calling those sources directly; the point is a single entry point that later
 * phases (per-activity page specs, dynamic switching) can build on.
 */
export interface ActivitySpec {
  readonly id: string;
  readonly label: string;
  readonly familyId: string;
  /** Exact paths hidden for this activity (family rules + activity overrides). */
  hiddenPaths(): string[];
  /** True when the path or a parent of it is hidden for this activity. */
  isPathHidden(pathname: string): boolean;
  /** Sidebar label override for a path, or undefined to keep the default. */
  navLabel(pathname: string): string | undefined;
  /** Page title/description copy for a path, or undefined to keep the default. */
  pathCopy(pathname: string): ActivityPageCopy | undefined;
}

function toSpec(row: ActivityDefinition): ActivitySpec {
  const id = row.id;
  return {
    id,
    label: row.label,
    familyId: row.familyId,
    hiddenPaths: () => getActivityHiddenPaths(id),
    isPathHidden: (pathname) => isActivityPathHidden(pathname, id),
    navLabel: (pathname) => getActivityNavLabel(pathname, id),
    pathCopy: (pathname) => getActivityPathCopy(pathname, id),
  };
}

/** Every activity known to the catalog, in catalog order. */
export function getActivitySpecs(): ActivitySpec[] {
  return getActivityRows().map(toSpec);
}

/**
 * The spec for one activity. Unknown ids fall back to the same behaviour the
 * existing sources already give for unknown business types, so callers never
 * need a separate error path.
 */
export function getActivitySpec(businessType: string = getEffectiveBusinessType()): ActivitySpec {
  const row = getActivityRows().find((candidate) => candidate.id === businessType);
  return toSpec(row ?? { id: businessType, label: businessType, familyId: '', profileId: businessType });
}
