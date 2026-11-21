'use strict';

/**
 * Tenant visibility resolution shared by the signed tenant configuration and
 * feature-module package delivery.
 *
 * One resolver guarantees the pages a tenant can SEE are exactly the pages
 * whose packages the server will OFFER: allowed registry modules, merged
 * hidden menus (manual + feature-owned) and feature permissions.
 */

const { resolveDeviceEntitlements, parseJsonArray } = require('./entitlements');
const { FEATURE_CODE_TO_PAGE_PATHS } = require('./featurePageMap');

/**
 * Layered feature config merge: global → tenant → tenant+plan (later wins,
 * per non-empty field). Shared by the signed tenant configuration, the admin
 * "effective config" preview and module package delivery so all agree.
 */
async function loadEffectiveFeatureConfig(db, tenantId, planId) {
  const featureRows = await db.all(
    `SELECT tenant_id AS tenantId, plan_id AS planId, hidden_menus AS hiddenMenus,
            disabled_permissions AS disabledPermissions, feature_permissions AS featurePermissions,
            updated_at AS updatedAt
     FROM tenant_feature_config
     WHERE (tenant_id IS NULL OR tenant_id = '' OR tenant_id = ?)
       AND (plan_id IS NULL OR plan_id = ?)`,
    [tenantId, planId || '']
  );
  const merged = { hiddenMenus: [], disabledPermissions: [], featurePermissions: [] };
  const rank = (row) => (row.tenantId ? 1 : 0) + (row.planId ? 2 : 0);
  const ordered = featureRows.slice().sort((a, b) => rank(a) - rank(b));
  let maxUpdated = '';
  for (const row of ordered) {
    const hidden = parseJsonArray(row.hiddenMenus);
    const disabled = parseJsonArray(row.disabledPermissions);
    const features = parseJsonArray(row.featurePermissions);
    if (hidden.length) merged.hiddenMenus = hidden;
    if (disabled.length) merged.disabledPermissions = disabled;
    if (features.length) merged.featurePermissions = features;
    if (row.updatedAt > maxUpdated) maxUpdated = row.updatedAt;
  }
  return { merged, maxUpdated };
}

/**
 * Page paths hidden because the tenant's effective feature set excludes the
 * feature that owns them (license/plan features → tenant FEATURE overrides,
 * plus admin-managed page_paths on feature flags merged over the static map).
 * Shared by resolveTenantVisibility and the admin effective-config preview.
 */
async function resolveFeatureHiddenPaths(db, tenantId, baseFeatures) {
  const featureOverrides = await db.all(
    `SELECT code, is_enabled AS isEnabled FROM platform_tenant_overrides
     WHERE tenant_id = ? AND kind = 'FEATURE'`,
    [tenantId]
  );
  const effectiveFeatureCodes = new Set(baseFeatures.map(String));
  for (const row of featureOverrides) {
    const code = String(row.code || '');
    if (!code) continue;
    if (row.isEnabled) effectiveFeatureCodes.add(code);
    else effectiveFeatureCodes.delete(code);
  }
  // Only gate feature-owned pages when the tenant actually has a feature
  // set (license/plan features or explicit overrides) — otherwise tenants
  // without plan features would lose pages they never had gated.
  const featureGatingActive = baseFeatures.length > 0 || featureOverrides.length > 0;
  if (!featureGatingActive) return [];
  // Dynamic page ownership: page_paths stored on each feature flag
  // (admin-managed) merged over the built-in static map.
  const flagRows = await db.all('SELECT key, page_paths AS pagePaths FROM platform_feature_flags').catch(() => []);
  const dynamicMap = { ...FEATURE_CODE_TO_PAGE_PATHS };
  for (const row of flagRows || []) {
    const code = String(row.key || '');
    if (!code) continue;
    let paths = [];
    try { paths = JSON.parse(row.pagePaths || '[]'); } catch { paths = []; }
    if (Array.isArray(paths) && paths.length) {
      dynamicMap[code] = [...new Set([...(dynamicMap[code] || []), ...paths.map(String)])];
    }
  }
  return Object.entries(dynamicMap)
    .filter(([code]) => !effectiveFeatureCodes.has(code))
    .flatMap(([, paths]) => paths);
}

/**
 * Resolve everything the signed configuration embeds, plus the inputs needed
 * to decide whether a downloadable package may be offered to this device.
 */
async function resolveTenantVisibility(db, device) {
  const { tenantId, planId, license, baseFeatures, allowedModuleIds } = await resolveDeviceEntitlements(db, device);

  // Pages owned by features the tenant's plan/overrides exclude.
  const featureHiddenPaths = await resolveFeatureHiddenPaths(db, tenantId, baseFeatures);

  // Layered feature config: global → tenant → tenant+plan (later wins).
  const { merged, maxUpdated: maxFeatureUpdated } = await loadEffectiveFeatureConfig(db, tenantId, planId);
  // Pages owned by features the tenant's plan/overrides exclude.
  if (featureHiddenPaths.length) {
    merged.hiddenMenus = [...new Set([...merged.hiddenMenus, ...featureHiddenPaths])];
  }

  // Permission limits: tenant-specific rows override global ('' tenant) rows.
  const limitRows = await db.all(
    `SELECT tenant_id AS tenantId, permission_code AS permissionCode, max_amount AS maxAmount,
            cost_visible AS costVisible, profit_visible AS profitVisible, disabled, updated_at AS updatedAt
     FROM tenant_permission_limits WHERE tenant_id IN ('', ?) ORDER BY tenant_id`,
    [tenantId]
  );
  const limitsByCode = new Map();
  let maxLimitUpdated = '';
  for (const row of limitRows) {
    limitsByCode.set(row.permissionCode, {
      permissionCode: row.permissionCode,
      maxAmount: row.maxAmount ?? null,
      costVisible: row.costVisible ?? null,
      profitVisible: row.profitVisible ?? null,
      disabled: row.disabled ? 1 : 0,
    });
    if (row.updatedAt > maxLimitUpdated) maxLimitUpdated = row.updatedAt;
  }

  const configurationVersion = Math.max(
    1,
    Math.floor(Date.parse(maxFeatureUpdated || maxLimitUpdated || '') / 1000) || 1
  );

  return {
    tenantId,
    planId,
    license,
    allowedModuleIds,
    hiddenMenus: merged.hiddenMenus,
    disabledPermissions: merged.disabledPermissions,
    featurePermissions: merged.featurePermissions,
    permissionLimits: [...limitsByCode.values()],
    configurationVersion,
  };
}

// ─── Page/package visibility ──────────────────────────────────────────────────

function normalizePath(pathname) {
  return String(pathname || '').split('?')[0].toLowerCase().replace(/\/+$/, '');
}

/**
 * Mirror of the client-side CentralFeaturePermissionService.isPageVisible:
 * a path is hidden when a hiddenMenus entry equals or prefixes it, or when the
 * longest-prefix featurePermissions entry for it disables the page/feature.
 */
function isPathHidden(pathname, visibility) {
  const norm = normalizePath(pathname);
  if (!norm) return false;

  const hiddenMatch = (visibility.hiddenMenus || []).some((entry) => {
    const h = normalizePath(entry);
    return !!h && (norm === h || norm.startsWith(`${h}/`));
  });
  if (hiddenMatch) return true;

  let best;
  let bestLen = -1;
  for (const fp of visibility.featurePermissions || []) {
    const url = normalizePath(fp?.pageUrl || '');
    if (!url) continue;
    if (norm === url || norm.startsWith(`${url}/`)) {
      if (url.length > bestLen) {
        best = fp;
        bestLen = url.length;
      }
    }
  }
  return Boolean(best && (best.pageVisible === false || best.featureEnabled === false));
}

/** Registry module ids a manifest may be delivered under. */
function manifestModuleIds(manifest) {
  const mods = Array.isArray(manifest?.modules) ? manifest.modules.filter(Boolean) : [];
  if (mods.length) return mods;
  // Legacy packages carry no modules list: moduleId IS the module.
  return manifest?.moduleId ? [manifest.moduleId] : [];
}

/**
 * May this package be offered to the device? True when at least one of its
 * modules is allowed AND it is not the case that every route it serves is
 * hidden for this tenant. Packages without page metadata behave exactly like
 * the old module-level packages.
 */
function isPackageVisible(manifest, visibility) {
  const allowed = new Set(visibility.allowedModuleIds || []);
  if (!manifestModuleIds(manifest).some((id) => allowed.has(id))) return false;
  const pages = Array.isArray(manifest?.pages) ? manifest.pages : [];
  if (pages.length > 0 && pages.every((page) => isPathHidden(page, visibility))) return false;
  return true;
}

module.exports = {
  resolveTenantVisibility,
  loadEffectiveFeatureConfig,
  resolveFeatureHiddenPaths,
  isPathHidden,
  isPackageVisible,
  manifestModuleIds,
};
