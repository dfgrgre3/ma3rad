'use strict';

/**
 * Canonical mapping between platform catalog module codes (platform_modules.code,
 * plan.included_modules, tenant overrides kind='MODULE') and the tenant app's
 * business-module registry ids (src/config/moduleRegistry.ts MODULE_REGISTRY).
 *
 * The two catalogs use different codes, so anything crossing the boundary
 * (license issuance, signed tenant configuration) MUST translate through this
 * map — unknown codes are silently dropped by the tenant app.
 *
 * Keep in sync with src/config/platformModuleMap.ts.
 */
const PLATFORM_MODULE_TO_REGISTRY_IDS = {
  dashboard: [],
  sales: ['sales'],
  pos: ['sales'],
  inventory: ['inventory'],
  purchases: ['purchasing'],
  customers: ['customers'],
  crm: ['customers'],
  finance: ['finance'],
  cashier: ['finance'],
  reports: ['reports'],
  hr: ['hr'],
  projects: ['projects'],
  manufacturing: ['manufacturing'],
  documents: ['documents'],
  restaurant: ['sales'],
};

/** Registry modules that have no platform catalog counterpart stay untouched. */
const UNMAPPED_REGISTRY_IDS = ['operations', 'approvals'];

/**
 * Translate platform module codes to tenant registry module ids.
 * Unknown codes are ignored (they have no tenant-side surface).
 */
function platformCodesToRegistryIds(codes) {
  const out = new Set();
  for (const code of codes || []) {
    const mapped = PLATFORM_MODULE_TO_REGISTRY_IDS[String(code)];
    if (mapped) for (const id of mapped) out.add(id);
  }
  return [...out];
}

module.exports = {
  PLATFORM_MODULE_TO_REGISTRY_IDS,
  UNMAPPED_REGISTRY_IDS,
  platformCodesToRegistryIds,
};
