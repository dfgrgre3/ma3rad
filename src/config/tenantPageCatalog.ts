/**
 * Tenant page catalog — the single read model listing EVERY page that exists
 * in the user-facing app (the tenant ERP), with its Arabic label and the
 * business module that owns it.
 *
 * Sources (all pure config, no component imports):
 *   - APP_ROUTE_PATHS        — canonical route manifest (router/routePaths.ts)
 *   - NAV_GROUPS             — user-facing menu labels (config/navigation)
 *   - listScreens()          — page-view labels + permission patterns
 *   - MODULE_REGISTRY        — module ownership via longest path prefix
 *
 * Used by the platform plan wizard so the owner can see and gate every page
 * a plan exposes to subscribers.
 */
import { APP_ROUTE_PATHS } from '../router/routePaths';
import { NAV_GROUPS } from './navigation';
import { listScreens } from './screenRegistry';
import { MODULE_REGISTRY, getModulePathOwner } from './moduleRegistry';

export interface TenantPage {
  /** Absolute app path, e.g. `/sales/orders-deposits`. */
  path: string;
  /** Arabic label from navigation/screens registry; falls back to the path. */
  label: string;
  /** Registry module id owning the page (MODULE_REGISTRY), or null for core pages. */
  moduleId: string | null;
}

export interface TenantPageGroup {
  id: string;
  label: string;
  pages: TenantPage[];
}

const toAbsolute = (routePath: string): string => `/${routePath}`;

// ─── Label resolution ─────────────────────────────────────────────────────────

const navLabelByPath = new Map<string, string>();
for (const group of NAV_GROUPS) {
  for (const item of group.items) {
    if (item?.to && item?.label && !navLabelByPath.has(item.to)) {
      navLabelByPath.set(item.to, item.label);
    }
  }
}

const screenLabelByPattern = new Map<string, string>();
for (const screen of listScreens()) {
  if (screen.labelAr && !screenLabelByPattern.has(screen.pathPattern)) {
    screenLabelByPattern.set(screen.pathPattern, screen.labelAr);
  }
}

const segmentMatch = (patternSegments: string[], pathSegments: string[]): boolean =>
  patternSegments.length === pathSegments.length &&
  patternSegments.every((seg, i) => seg.startsWith(':') || seg === pathSegments[i]);

/** Match a concrete/parameterized app path against screen patterns (exact → param-aware). */
const screenLabelFor = (absolutePath: string): string | null => {
  const exact = screenLabelByPattern.get(absolutePath);
  if (exact) return exact;
  const pathSegs = absolutePath.split('/').filter(Boolean);
  let best: string | null = null;
  let bestLen = -1;
  for (const [pattern, label] of screenLabelByPattern) {
    const patSegs = pattern.split('/').filter(Boolean);
    if (patSegs.length <= bestLen) continue;
    if (segmentMatch(patSegs, pathSegs)) {
      best = label;
      bestLen = patSegs.length;
    }
  }
  return best;
};

const labelFor = (absolutePath: string): string =>
  navLabelByPath.get(absolutePath) ?? screenLabelFor(absolutePath) ?? absolutePath;

// ─── Catalog ──────────────────────────────────────────────────────────────────

const CORE_GROUP_ID = '__core__';
const CORE_GROUP_LABEL = 'أساسيات النظام والإدارة';

const buildPages = (): TenantPage[] => {
  const seen = new Set<string>();
  const pages: TenantPage[] = [];
  for (const routePath of APP_ROUTE_PATHS) {
    if (routePath === '*') continue;
    const path = toAbsolute(routePath);
    if (seen.has(path)) continue;
    seen.add(path);
    pages.push({
      path,
      label: labelFor(path),
      moduleId: getModulePathOwner(path) ?? null,
    });
  }
  return pages;
};

let cachedPages: TenantPage[] | null = null;

/** Every page in the user-facing app, sorted by path. */
export const listTenantPages = (): TenantPage[] => {
  if (!cachedPages) {
    cachedPages = buildPages().sort((a, b) => a.path.localeCompare(b.path, 'en'));
  }
  return cachedPages;
};

const MODULE_ORDER = new Map(MODULE_REGISTRY.map((mod, index) => [mod.id, index]));
const MODULE_LABELS = new Map(MODULE_REGISTRY.map((mod) => [mod.id, mod.label]));

/** All tenant pages grouped by owning business module (unowned → core group). */
export const listTenantPageGroups = (): TenantPageGroup[] => {
  const groups = new Map<string, TenantPageGroup>();
  for (const page of listTenantPages()) {
    const id = page.moduleId ?? CORE_GROUP_ID;
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        label: page.moduleId ? MODULE_LABELS.get(page.moduleId) ?? page.moduleId : CORE_GROUP_LABEL,
        pages: [],
      });
    }
    groups.get(id)!.pages.push(page);
  }
  return [...groups.values()].sort((a, b) => {
    const ai = a.id === CORE_GROUP_ID ? Number.MAX_SAFE_INTEGER : MODULE_ORDER.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = b.id === CORE_GROUP_ID ? Number.MAX_SAFE_INTEGER : MODULE_ORDER.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.label.localeCompare(b.label, 'ar');
  });
};

export const resetTenantPageCatalogCache = (): void => {
  cachedPages = null;
};
