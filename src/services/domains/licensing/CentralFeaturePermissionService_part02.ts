import { getCachedDisabledPermissions } from './centralConfigStore';
import { forPath, isPageVisible, getCurrentPath } from './CentralFeaturePermissionService_part01';
import { GRANULAR_LEGACY_MAP, GRANULAR_PERMISSIONS } from '../../../config/permissionMatrix';
import type { CentralAction } from './CentralFeaturePermissionService';

const ACTION_BY_SUFFIX: Record<string, CentralAction> = {
  view: 'view', read: 'view', list: 'view', show: 'view', open: 'view',
  create: 'create', add: 'create', new: 'create', insert: 'create',
  update: 'edit', edit: 'edit', save: 'edit', post: 'edit', adjust: 'edit',
  transfer: 'edit', approve: 'edit', reject: 'edit', void: 'edit', cancel: 'edit',
  send: 'edit', process: 'edit', manage: 'edit', assign: 'edit', close: 'edit', reopen: 'edit',
  delete: 'delete', remove: 'delete', destroy: 'delete',
  export: 'export', print: 'export', download: 'export',
};

export function canEdit(pathname: string): boolean {
  return isActionAllowed(pathname, 'edit');
}

export function canDelete(pathname: string): boolean {
  return isActionAllowed(pathname, 'delete');
}

export function canExportPrint(pathname: string): boolean {
  return isActionAllowed(pathname, 'export');
}

export function actionOf(permissionCode: string): CentralAction {
  const suffix = String(permissionCode || '').split('.').pop()?.toLowerCase() || '';
  return ACTION_BY_SUFFIX[suffix] || 'edit';
}

export function isActionAllowed(pathname: string, action: CentralAction): boolean {
  if (!isPageVisible(pathname)) return false;
  const fp = forPath(pathname);
  if (!fp) return true;
  if (action === 'view') return true;
  if (fp.allowViewOnly) return false;
  if (action === 'delete') return fp.canDelete !== false;
  if (action === 'export') return fp.canExportPrint !== false;
  return fp.canEdit !== false;
}

export function disabledPermissions(): string[] {
  return getCachedDisabledPermissions();
}

// ─── Legacy ↔ granular equivalence ────────────────────────────────────────────
// The admin access editor disables granular `ui.*` codes while many pages still
// check legacy codes (`inventory.export`). Both directions must resolve to the
// same disabled state or a disabled section would silently keep working.

const GRANULAR_EQUIVALENTS = new Map<string, Set<string>>();
const LEGACY_TO_GRANULAR = new Map<string, Set<string>>();

for (const perm of GRANULAR_PERMISSIONS) {
  const equivalents = new Set<string>();
  if (perm.legacy) equivalents.add(perm.legacy);
  for (const alias of perm.legacyAliases ?? []) equivalents.add(alias);
  GRANULAR_EQUIVALENTS.set(perm.code, equivalents);
  for (const legacy of equivalents) {
    const set = LEGACY_TO_GRANULAR.get(legacy) ?? new Set<string>();
    set.add(perm.code);
    LEGACY_TO_GRANULAR.set(legacy, set);
  }
}

/** All codes equivalent to `code` for disabled-check purposes (itself included). */
function equivalentCodes(code: string): Set<string> {
  const out = new Set<string>([code]);
  for (const eq of GRANULAR_EQUIVALENTS.get(code) ?? []) out.add(eq);
  for (const granular of LEGACY_TO_GRANULAR.get(code) ?? []) {
    out.add(granular);
    for (const eq of GRANULAR_EQUIVALENTS.get(granular) ?? []) out.add(eq);
  }
  // GRANULAR_LEGACY_MAP covers codes whose legacy field lives outside the
  // PAGES-derived entries; merge it defensively.
  const mapped = GRANULAR_LEGACY_MAP[code];
  if (mapped) out.add(mapped);
  return out;
}

export function isPermissionDisabled(permissionCode: string): boolean {
  const code = String(permissionCode || '');
  if (!code || code === '*') return false;
  const disabled = disabledPermissions();
  if (disabled.includes(code)) return true;
  for (const equivalent of equivalentCodes(code)) {
    if (equivalent !== code && disabled.includes(equivalent)) return true;
  }
  return false;
}

// ─── Permission → owning page routes ──────────────────────────────────────────
// Every granular def knows the route of the page it belongs to; legacy codes
// resolve through the same fields used for disabled-equivalence. Legacy codes
// are often shared by several pages (e.g. 'sales.create' serves /sales,
// /daily/sales and /ceramics), so a code is only dead when EVERY route it maps
// to is hidden centrally — hiding one of its pages must not break the others.

let routesByCode: Map<string, Set<string>> | null = null;

function permissionRoutes(code: string): Set<string> {
  if (!routesByCode) {
    routesByCode = new Map();
    for (const perm of GRANULAR_PERMISSIONS) {
      if (!perm.route) continue;
      const codes = [perm.code, perm.legacy, ...(perm.legacyAliases ?? [])].filter(Boolean) as string[];
      for (const c of codes) {
        const set = routesByCode.get(c) ?? new Set<string>();
        set.add(perm.route);
        routesByCode.set(c, set);
      }
    }
  }
  return routesByCode.get(code) ?? new Set();
}

/**
 * True when the permission belongs to page(s) that are ALL hidden by the
 * signed tenant configuration. Service-layer callers that pass no page
 * context still get denied — a hidden page's functions stay unreachable.
 */
export function isPermissionPageHidden(permissionCode: string): boolean {
  const code = String(permissionCode || '');
  if (!code || code === '*') return false;
  // Direct lookup only: a granular code maps to its own page, while a shared
  // legacy code ('sales.create') was registered under every page that lists
  // it — so expansion through equivalence must NOT happen here or a granular
  // code would inherit sibling pages' routes and stay allowed.
  const routes = permissionRoutes(code);
  if (routes.size === 0) return false;
  for (const route of routes) {
    if (isPageVisible(route)) return false;
  }
  return true;
}

export function allowsPermission(permissionCode: string, pathname?: string): boolean {
  const code = String(permissionCode || '');
  if (isPermissionDisabled(code)) return false;
  if (isPermissionPageHidden(code)) return false;
  if (!code || code === '*' || !code.includes('.')) return true;
  const path = pathname ?? getCurrentPath();
  return isActionAllowed(path, actionOf(code));
}
