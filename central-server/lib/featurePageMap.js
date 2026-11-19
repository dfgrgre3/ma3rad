'use strict';

/**
 * Maps platform feature-flag codes to the tenant app page paths they own.
 * When a feature is NOT included in the tenant's effective set (license/plan
 * features minus disabled overrides), its pages are appended to hiddenMenus
 * in the signed tenant configuration.
 *
 * Keep in sync with src/config/featurePageMap.ts.
 */
const FEATURE_CODE_TO_PAGE_PATHS = {
  offline_sync: [],
  multi_branch: ['/branches'],
  advanced_reports: ['/reports/statements', '/reports/profit-loss', '/reports/tax'],
  e_invoicing: [],
  loyalty: [],
  restaurant_mode: ['/restaurant'],
  api_access: [],
  audit_export: ['/audit'],
};

/** Page paths owned by features that are disabled for this tenant. */
function hiddenPathsForDisabledFeatures(enabledCodes) {
  const enabled = new Set((enabledCodes || []).map(String));
  const hidden = [];
  for (const [code, paths] of Object.entries(FEATURE_CODE_TO_PAGE_PATHS)) {
    if (!enabled.has(code)) hidden.push(...paths);
  }
  return hidden;
}

module.exports = { FEATURE_CODE_TO_PAGE_PATHS, hiddenPathsForDisabledFeatures };
