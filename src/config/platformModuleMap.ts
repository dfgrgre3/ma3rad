/**
 * Canonical mapping between platform catalog module codes (platform_modules.code,
 * plan.includedModules, tenant overrides kind='MODULE') and the tenant app's
 * business-module registry ids (MODULE_REGISTRY in ./moduleRegistry).
 *
 * The two catalogs use different codes, so anything crossing the boundary
 * (license issuance, signed tenant configuration) MUST translate through this
 * map — unknown codes are silently dropped by the tenant app.
 *
 * Keep in sync with central-server/lib/platformModuleMap.js.
 */
export const PLATFORM_MODULE_TO_REGISTRY_IDS: Record<string, string[]> = {
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
  documents: ['documents'],};

/** Translate platform module codes to tenant registry module ids. */
export const platformCodesToRegistryIds = (codes: string[]): string[] => {
  const out = new Set<string>();
  for (const code of codes ?? []) {
    for (const id of PLATFORM_MODULE_TO_REGISTRY_IDS[code] ?? []) out.add(id);
  }
  return [...out];
};
