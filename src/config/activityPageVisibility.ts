import { getBusinessProfile } from './businessProfiles';
import { getEffectiveBusinessType } from '../services/domains/config/BusinessTypeService';

/**
 * Activity-driven page visibility.
 *
 * Modules already hide whole feature areas; this layer hides individual pages
 * that are irrelevant for the selected activity/family (e.g. no POS
 * for a hospital).
 *
 * Resolution order: activity override → family default → visible.
 * Rules are additive-only: a path must be listed to be hidden.
 */

/** Pages hidden for every activity in a family. */
const FAMILY_HIDDEN_PATHS: Record<string, string[]> = {
  // Retail showrooms: no hotel, workshop bay, school,
  // manufacturing, time-billing or fleets.
  retail: [
    '/hospitality',
    '/workshop',
    '/education',
    '/time-billing',
    '/manufacturing',
    '/construction-estimate',
    '/fleet/dashboard',
    '/vehicles',
    '/drivers',
  ],
  // Distribution/import: B2B — no counter POS, no hotel, workshop,
  // school, manufacturing, or showroom floor (they run warehouses).
  distribution: [
    '/hospitality',
    '/workshop',
    '/education',
    '/time-billing',
    '/manufacturing',
    '/pos',
    '/construction-estimate',
    '/inventory/showroom-stock',
    '/retail',
  ],
  // Manufacturing: produces goods — no service-vertical pages.
  manufacturing: [
    '/hospitality',
    '/workshop',
    '/education',
    '/time-billing',
    '/pos',
    '/construction-estimate',
    '/inventory/showroom-stock',
    '/customers/imported-products', '/customers/*/imported-products',
    '/retail',
  ],
  // Construction: sites & contracts — no service-vertical pages.
  construction: [
    '/hospitality',
    '/workshop',
    '/education',
    '/time-billing',
    '/pos',
    '/manufacturing',
    '/inventory/showroom-stock',
    '/customers/imported-products', '/customers/*/imported-products',
    '/promotions',
    '/products/barcodes',
    '/retail',
  ],
  // Transport (workshop): service bay — keeps /workshop, hides the rest.
  transport: [
    '/hospitality',
    '/education',
    '/time-billing',
    '/manufacturing',
    '/construction-estimate',
    '/inventory/showroom-stock',
    '/customers/imported-products', '/customers/*/imported-products',
    '/retail',
  ],
  // Hospitality (hotels): keeps /hospitality. No workshop/school pages.
  hospitality: [
    '/inventory/showroom-stock',
    '/customers/imported-products', '/customers/*/imported-products',
    '/manufacturing',
    '/construction-estimate',
    '/fleet/dashboard',
    '/vehicles',
    '/drivers',
    '/workshop',
    '/education',
    '/retail',
  ],
  // Professional services: offices — keeps /time-billing, hides the rest.
  professional_services: [
    '/manufacturing',
    '/pos',
    '/hospitality',
    '/workshop',
    '/education',
    '/construction-estimate',
    '/fleet/dashboard',
    '/vehicles',
    '/drivers',
    '/promotions',
    '/partners',
    '/deliveries',
    '/inventory/showroom-stock',
    '/customers/imported-products', '/customers/*/imported-products',
    '/retail',
  ],
  // Healthcare: clinics — same office-only surface as professional services.
  healthcare: [
    '/manufacturing',
    '/pos',
    '/hospitality',
    '/workshop',
    '/education',
    '/construction-estimate',
    '/fleet/dashboard',
    '/vehicles',
    '/drivers',
    '/promotions',
    '/partners',
    '/deliveries',
    '/inventory/showroom-stock',
    '/customers/imported-products', '/customers/*/imported-products',
    '/retail',
  ],
  // Education: schools — keeps /education, hides the rest.
  education: [
    '/manufacturing',
    '/pos',
    '/hospitality',
    '/workshop',
    '/time-billing',
    '/construction-estimate',
    '/fleet/dashboard',
    '/vehicles',
    '/drivers',
    '/promotions',
    '/partners',
    '/deliveries',
    '/inventory/showroom-stock',
    '/customers/imported-products', '/customers/*/imported-products',
    '/retail',
  ],
};

/** Extra pages hidden for a specific activity on top of its family rules. */
const ACTIVITY_HIDDEN_PATHS: Record<string, string[]> = {
  // Ceramics showroom: tiles/porcelain never expire, and imported-customer
  // product tracking belongs to the import/export workflow, not a showroom.
  ceramics: ['/inventory/expiry', '/customers/imported-products', '/customers/*/imported-products', '/retail'],
  // Supermarkets & online stores sell from the warehouse — no display floor.
  food: ['/inventory/showroom-stock'],
  ecommerce: ['/inventory/showroom-stock'],
  // Import/export traders run no delivery fleet of their own.
  import_export: ['/fleet/dashboard', '/vehicles', '/drivers'],
  // Pure logistics/warehousing: no import-document tracking page.
  logistics: ['/customers/imported-products', '/customers/*/imported-products'],
  // Import/export keeps the import-tracking page — it is core to their workflow.
};

/**
 * Pages that belong to a single activity only — hidden for every other
 * activity regardless of family (e.g. the ceramics showroom page is meaningless
 * for a hotel or an accounting office).
 */
const ACTIVITY_EXCLUSIVE_PATHS: Record<string, string[]> = {
  '/ceramics': ['ceramics'],
};

function resolveHiddenPaths(businessType: string): string[] {
  const familyId = getBusinessProfile(businessType).familyId;
  const exclusive = Object.entries(ACTIVITY_EXCLUSIVE_PATHS)
    .filter(([, allowed]) => !allowed.includes(businessType))
    .map(([path]) => path);
  return [
    ...exclusive,
    ...(ACTIVITY_HIDDEN_PATHS[businessType] ?? []),
    ...(familyId ? FAMILY_HIDDEN_PATHS[familyId] ?? [] : []),
  ];
}

/** Exact paths hidden for the effective (or given) activity. */
export function getActivityHiddenPaths(
  businessType: string = getEffectiveBusinessType(),
): string[] {
  return [...new Set(resolveHiddenPaths(businessType))];
}

/**
 * True when `pathname` equals a hidden path or sits under it.
 * Hidden entries may contain a `*` segment matching exactly one path segment,
 * so parameterized routes (e.g. per-customer imported-products) can reuse the
 * same rules as their static siblings.
 */
function matchesHiddenPath(hidden: string, pathname: string): boolean {
  if (!hidden.includes('*')) {
    return pathname === hidden || pathname.startsWith(`${hidden}/`);
  }
  const hiddenSegs = hidden.split('/');
  const pathSegs = pathname.split('/');
  if (pathSegs.length !== hiddenSegs.length) return false;
  return hiddenSegs.every((seg, i) => seg === '*' || seg === pathSegs[i]);
}

export function isActivityPathHidden(
  pathname: string,
  businessType: string = getEffectiveBusinessType(),
): boolean {
  return resolveHiddenPaths(businessType).some((hidden) => matchesHiddenPath(hidden, pathname));
}

export default getActivityHiddenPaths;
