import { GRANULAR_PERMISSIONS, type GranularPermissionDef } from '../../../../config/permissionMatrix';
import { FEATURE_CODE_TO_PAGE_PATHS } from '../../../../config/featurePageMap';
import type { TenantPage } from '../../../../config/tenantPageCatalog';

/** Minimal feature-flag shape needed for page-ownership resolution. */
export interface PageOwnerFeature {
  code: string;
  pagePaths?: string[];
}

// ─── Route pattern matching ────────────────────────────────────────────────────
// Mirrors the segment matcher in config/tenantPageCatalog.ts: a pattern
// segment starting with ':' matches any single path segment; lengths must be
// equal so '/sales' does not claim '/sales/orders'.

const segmentMatch = (patternSegments: string[], pathSegments: string[]): boolean =>
  patternSegments.length === pathSegments.length &&
  patternSegments.every((seg, i) => seg.startsWith(':') || seg === pathSegments[i]);

/** True when a route pattern (e.g. '/products/:id') matches a concrete page path. */
export const routePatternMatches = (pattern: string, path: string): boolean => {
  // Case-insensitive like CentralFeaturePermissionService.normalize — page
  // paths and permission routes are lowercase, but be tolerant.
  const norm = (p: string) => p.split('?')[0].toLowerCase().replace(/\/+$/, '');
  const patternSegs = norm(pattern).split('/').filter(Boolean);
  const pathSegs = norm(path).split('/').filter(Boolean);
  if (!patternSegs.length || !pathSegs.length) return false;
  return segmentMatch(patternSegs, pathSegs);
};

// ─── Granular permission codes ─────────────────────────────────────────────────

const GRANULAR_CODE_SET = new Set(GRANULAR_PERMISSIONS.map((p) => p.code));

export const isGranularPermissionCode = (code: string): boolean => GRANULAR_CODE_SET.has(code);

/** All granular permission defs whose route pattern claims this page path. */
export const permissionsForPagePath = (path: string): GranularPermissionDef[] =>
  GRANULAR_PERMISSIONS.filter((p) => p.route && routePatternMatches(p.route, path));

/**
 * Expand a granular permission code into every code the tenant app may check:
 * the granular code itself plus its legacy equivalents (old codes are still
 * passed to AuthorizationService.evaluate in parts of the app).
 */
export const expandPermissionCodes = (code: string): string[] => {
  const def = GRANULAR_PERMISSIONS.find((p) => p.code === code);
  if (!def) return [code];
  return [...new Set([def.code, def.legacy, ...(def.legacyAliases ?? [])].filter((c): c is string => Boolean(c)))];
};

// ─── Feature-owned hidden paths (mirrors central-server/routes/config.js) ──────

/**
 * Page paths hidden because the tenant's plan does NOT include the feature
 * that owns them. Merges the static FEATURE_CODE_TO_PAGE_PATHS map with the
 * admin-managed pagePaths stored on each feature flag — same as the signed
 * tenant configuration does server-side.
 */
export const featureHiddenPathsForPlan = (
  features: PageOwnerFeature[],
  includedFeatureCodes: ReadonlySet<string>
): string[] => {
  // Mirror central-server/routes/config.js: the dynamic map is seeded with
  // EVERY static FEATURE_CODE_TO_PAGE_PATHS entry — a plan that does not
  // include the code hides those pages even when no flag row exists.
  const flagByCode = new Map(features.map((feature) => [feature.code, feature]));
  const codes = new Set([...Object.keys(FEATURE_CODE_TO_PAGE_PATHS), ...features.map((feature) => feature.code)]);
  const hidden = new Set<string>();
  for (const code of codes) {
    if (includedFeatureCodes.has(code)) continue;
    for (const path of FEATURE_CODE_TO_PAGE_PATHS[code] ?? []) hidden.add(path);
    for (const path of flagByCode.get(code)?.pagePaths ?? []) hidden.add(path);
  }
  return [...hidden];
};

// ─── Effective visibility for the plan preview ─────────────────────────────────

export type PageVisibilityStatus = 'visible' | 'hidden-manual' | 'hidden-feature' | 'hidden-permission' | 'module-excluded';

export interface PageVisibility {
  status: PageVisibilityStatus;
  /** True when the page has granular restrictions (view-only or disabled permissions). */
  restricted: boolean;
}

/**
 * Compute how a page appears to a subscriber on this plan draft:
 *  - hidden-manual:   explicitly hidden in the plan's hiddenMenus draft
 *  - hidden-feature:  owned by a feature flag the plan does not include
 *  - module-excluded: its owning registry module maps only to platform modules
 *                     absent from the plan's includedModules draft
 *  - visible:         reachable (possibly with granular restrictions)
 */
export const computePageVisibility = (input: {
  page: TenantPage;
  hiddenDraft: ReadonlySet<string>;
  featureHiddenPaths: ReadonlySet<string>;
  /** Paths hidden via featurePermissions entries (pageVisible/featureEnabled = false). */
  permissionHiddenPaths?: ReadonlySet<string>;
  /** registry module id → platform module codes that own it (inverted PLATFORM_MODULE_TO_REGISTRY_IDS) */
  registryToPlatformCodes: ReadonlyMap<string, string[]>;
  moduleDraft: ReadonlySet<string>;
  hasRestrictions: (path: string) => boolean;
}): PageVisibility => {
  const { page } = input;
  if (input.hiddenDraft.has(page.path)) return { status: 'hidden-manual', restricted: false };
  if (input.featureHiddenPaths.has(page.path)) return { status: 'hidden-feature', restricted: false };
  if (input.permissionHiddenPaths?.has(page.path)) return { status: 'hidden-permission', restricted: false };
  if (page.moduleId) {
    const owners = input.registryToPlatformCodes.get(page.moduleId) ?? [];
    // Only exclude when the registry module is exclusively owned by platform
    // modules — core/unmapped pages stay visible.
    if (owners.length > 0 && !owners.some((code) => input.moduleDraft.has(code))) {
      return { status: 'module-excluded', restricted: false };
    }
  }
  return { status: 'visible', restricted: input.hasRestrictions(page.path) };
};
