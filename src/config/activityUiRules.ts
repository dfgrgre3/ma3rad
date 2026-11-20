import { getBusinessProfile } from './businessProfiles';
import { getEffectiveBusinessType } from '../services/domains/config/BusinessTypeService';

/**
 * Control-level activity rules.
 *
 * Page-level hiding lives in `activityPageVisibility.ts`; this registry hides
 * individual controls (buttons, fields, actions) that have no dedicated route —
 * e.g. a "print barcode" button on a page that stays visible while barcode
 * printing itself is irrelevant for the activity.
 *
 * Keys are control ids (`domain.feature`), values list the activity ids or
 * family ids for which the control must be hidden.
 */

const HIDDEN_CONTROLS: Record<string, string[]> = {
  // Batch/expiry tracking only matters where goods perish or are certified.
  'inventory.expiry-batches': [
    'professional_services',
    'healthcare',
    'education',
    'construction',
  ],
  // Barcode label printing is meaningless for service-only catalogs.
  'products.barcode-labels': [
    'professional_services',
    'healthcare',
    'education',
    'construction',
    'logistics',
  ],
  // POS quick-sale is already hidden at route level; mirrored here so pages
  // embedding a POS shortcut can check the control id without hardcoding
  // the path list.
  'sales.pos-checkout': [
    'distribution',
    'manufacturing',
    'construction',
    'professional_services',
    'healthcare',
    'education',
  ],
  // Marketing/promotions do not apply to medical, legal or school billing.
  'sales.promotions': [
    'professional_services',
    'healthcare',
    'education',
  ],
};

function resolveHidden(controlId: string, businessType: string): boolean {
  const rule = HIDDEN_CONTROLS[controlId];
  if (!rule?.length) return false;
  const familyId = getBusinessProfile(businessType).familyId;
  return rule.includes(businessType) || (familyId ? rule.includes(familyId) : false);
}

/** True when `controlId` is hidden for the effective (or given) activity. */
export function isActivityControlHidden(
  controlId: string,
  businessType: string = getEffectiveBusinessType(),
): boolean {
  return resolveHidden(controlId, businessType);
}

export default HIDDEN_CONTROLS;
