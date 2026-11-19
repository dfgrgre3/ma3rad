import { getBusinessProfile } from './businessProfiles';
import { getEffectiveBusinessType } from '../services/domains/config/BusinessTypeService';

/**
 * Activity-driven page visibility.
 *
 * Modules already hide whole feature areas; this layer hides individual pages
 * that are irrelevant for the selected activity/family (e.g. no restaurant
 * tables for an accounting office, no POS for a hospital).
 *
 * Resolution order: activity override → family default → visible.
 * Rules are additive-only: a path must be listed to be hidden.
 */

/** Pages hidden for every activity in a family. */
const FAMILY_HIDDEN_PATHS: Record<string, string[]> = {
  // Retail showrooms: no restaurant floor, manufacturing, fleets, or estimates.
  retail: [
    '/restaurant',
    '/manufacturing',
    '/construction-estimate',
    '/fleet/dashboard',
    '/vehicles',
    '/drivers',
  ],
  // Distribution/import: B2B — no counter POS, no restaurant, no manufacturing,
  // no showroom floor (they run warehouses, not display stock).
  distribution: [
    '/restaurant',
    '/manufacturing',
    '/pos',
    '/construction-estimate',
    '/inventory/showroom-stock',
  ],
  // Manufacturing: produces goods — no restaurant floor or POS counter.
  manufacturing: [
    '/restaurant',
    '/pos',
    '/construction-estimate',
    '/inventory/showroom-stock',
    '/customers/imported-products',
  ],
  // Construction: sites & contracts — no restaurant, POS, factory floor,
  // showroom stock, or import-tracking pages.
  construction: [
    '/restaurant',
    '/pos',
    '/manufacturing',
    '/inventory/showroom-stock',
    '/customers/imported-products',
  ],
  // Transport (workshop): service bay — no restaurant, factory floor,
  // showroom stock, or import tracking.
  transport: [
    '/restaurant',
    '/manufacturing',
    '/construction-estimate',
    '/inventory/showroom-stock',
    '/customers/imported-products',
  ],
  // Hospitality (hotels & restaurants): no showroom floor or import tracking —
  // they sell stays, meals, and services, not displayed import goods.
  hospitality: [
    '/inventory/showroom-stock',
    '/customers/imported-products',
  ],
  // Professional services: offices — no restaurant, POS, factory, fleet,
  // promotions, or partner accounting.
  professional_services: [
    '/restaurant',
    '/manufacturing',
    '/pos',
    '/construction-estimate',
    '/fleet/dashboard',
    '/vehicles',
    '/drivers',
    '/promotions',
    '/partners',
    '/deliveries',
    '/inventory/showroom-stock',
    '/customers/imported-products',
  ],
  // Healthcare: clinics — same office-only surface as professional services.
  healthcare: [
    '/restaurant',
    '/manufacturing',
    '/pos',
    '/construction-estimate',
    '/fleet/dashboard',
    '/vehicles',
    '/drivers',
    '/promotions',
    '/partners',
    '/deliveries',
    '/inventory/showroom-stock',
    '/customers/imported-products',
  ],
  // Education: schools — same office-only surface.
  education: [
    '/restaurant',
    '/manufacturing',
    '/pos',
    '/construction-estimate',
    '/fleet/dashboard',
    '/vehicles',
    '/drivers',
    '/promotions',
    '/partners',
    '/deliveries',
    '/inventory/showroom-stock',
    '/customers/imported-products',
  ],
};

/** Extra pages hidden for a specific activity on top of its family rules. */
const ACTIVITY_HIDDEN_PATHS: Record<string, string[]> = {
  food: [],
  ecommerce: [],
  // Pure logistics/warehousing: no import-document tracking page.
  logistics: ['/customers/imported-products'],
  // Import/export keeps that page — it is core to their workflow.
  import_export: [],
};

function resolveHiddenPaths(businessType: string): string[] {
  const familyId = getBusinessProfile(businessType).familyId;
  return [
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

/** True when `pathname` equals a hidden path or sits under it. */
export function isActivityPathHidden(
  pathname: string,
  businessType: string = getEffectiveBusinessType(),
): boolean {
  return resolveHiddenPaths(businessType).some(
    (hidden) => pathname === hidden || pathname.startsWith(`${hidden}/`),
  );
}

export default getActivityHiddenPaths;
