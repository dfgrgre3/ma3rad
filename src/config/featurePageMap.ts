/**
 * Maps platform feature-flag codes to the tenant app page paths they own.
 * Mirror of central-server/lib/featurePageMap.js — keep in sync.
 */
export const FEATURE_CODE_TO_PAGE_PATHS: Record<string, string[]> = {
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
export const hiddenPathsForDisabledFeatures = (enabledCodes: string[]): string[] => {
  const enabled = new Set((enabledCodes ?? []).map(String));
  return Object.entries(FEATURE_CODE_TO_PAGE_PATHS)
    .filter(([code]) => !enabled.has(code))
    .flatMap(([, paths]) => paths);
};
