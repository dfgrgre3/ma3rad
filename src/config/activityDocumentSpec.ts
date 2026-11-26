import { getEffectiveBusinessType } from '../services/domains/config/BusinessTypeService';
import { getBusinessProfile } from './businessProfiles';
import { isActivityPathHidden } from './activityPageVisibility';

/**
 * Per-document element spec.
 *
 * `activityElementSpec.ts` controls elements *inside a page*; this registry
 * controls elements *inside a business document* (invoice, order, quotation,
 * purchase invoice) regardless of which page renders it. Keys are synthetic
 * document paths (`/doc/<type>`); element ids are stable action keys shared
 * by every UI that renders that document type.
 *
 * Each rule supports the same fields as page element rules:
 * - `hiddenFor` / `onlyFor`: hide by activity or family id.
 * - `hiddenPath` / `hiddenPaths`: hide when a related route is hidden.
 * - `labels`: per-activity label override.
 * - `required`: marks an element/field as mandatory for the activity —
 *   enforcement is applied by the consuming form (validation on save).
 */
export interface DocElementRule {
  hiddenFor?: string[];
  onlyFor?: string[];
  hiddenPath?: string;
  hiddenPaths?: string[];
  labels?: Record<string, string>;
  required?: boolean;
}

export type DocElementRules = Record<string, DocElementRule>;

/** Office-only activities: B2B billing, no counter receipts or goods returns. */
const SERVICE_OFFICES = ['professional_services', 'healthcare', 'education', 'construction'];
/** Activities that don't sell returnable physical goods. */
const NO_GOODS_RETURNS = ['professional_services', 'healthcare', 'education'];

export const DOC_ELEMENT_RULES: Record<string, DocElementRules> = {
  // ── Sales invoice ──────────────────────────────────────────────────
  '/doc/sales_invoice': {
    'preview': {},
    'print-a4': {},
    // Thermal slips belong to counter/POS sales, not B2B office billing.
    'receipt-thermal': { hiddenFor: SERVICE_OFFICES },
    'statement': {},
    // Services aren't returned as goods.
    'return': { hiddenFor: NO_GOODS_RETURNS },
    'collect-payment': {},
    'void': {},
  },

  // ── Sales order ────────────────────────────────────────────────────
  '/doc/sales_order': {
    'print': {},
    'share': {},
    'timeline': {},
    // Delivery tracking only exists where a delivery workflow is enabled.
    'delivery': { hiddenPath: '/deliveries' },
    'advance': {},
    'hold': {},
    'ready': {},
    'convert-to-invoice': {},
    'cancel': {},
    'delete': {},
  },

  // ── Quotation ──────────────────────────────────────────────────────
  '/doc/quotation': {
    'print': {},
    'send': { labels: { hospitality: 'إرسال للنزيل', healthcare: 'إرسال للمريض', education: 'إرسال لولي الأمر' } },
    'follow-up': {},
    'duplicate': {},
    'edit': {},
    // Converting a quotation into a stocked order only makes sense where the
    // business sells physical goods — service offices quote services directly.
    'convert-to-order': { hiddenFor: ['professional_services', 'healthcare', 'education'] },
    'convert-to-invoice': {},
    'reopen': {},
    'cancel': {},
    'delete': {},
  },

  // ── Purchase invoice ───────────────────────────────────────────────
  '/doc/purchase_invoice': {
    'print': {},
    'export': {},
    'pay-supplier': {},
    'return': {},
    // Customs/quality claims only apply to traders and producers.
    'claim': { onlyFor: ['import_export', 'logistics', 'manufacturing'] },
  },
};

/**
 * Operational fields an activity makes mandatory when a record is *created*.
 * Keyed by activity or family id; values are `entityType:CODE`. Enforced by
 * `OperationalFieldService` on create only, so existing records stay editable.
 * A field is only enforced if its definition exists for the tenant (presets
 * seed them), so this never blocks on a field the tenant has removed.
 */
export const ACTIVITY_REQUIRED_FIELDS: Record<string, string[]> = {
  import_export: ['purchase_invoices:INCOTERM', 'purchase_orders:INCOTERM'],
  logistics: ['purchase_orders:VEHICLE_PLATE'],
  construction: ['projects:CONTRACT_VALUE', 'projects:SITE_ADDRESS'],
  food: ['purchase_invoices:EXPIRY_DATE'],
};

/** True when the activity (or its family) requires this field on create. */
export function isFieldRequiredByActivity(
  entityType: string,
  code: string,
  businessType: string = getEffectiveBusinessType(),
): boolean {
  const key = `${entityType}:${code.toUpperCase()}`;
  const familyId = getBusinessProfile(businessType).familyId;
  return Boolean(
    ACTIVITY_REQUIRED_FIELDS[businessType]?.includes(key)
    || (familyId && ACTIVITY_REQUIRED_FIELDS[familyId]?.includes(key)),
  );
}

/**
 * Workflow gates: a document action that is only allowed once the document
 * has reached one of the listed statuses, per activity/family. This is the
 * enforced form of the profile's declared `workflows` (e.g. manufacturing's
 * "production → quality check → ready → delivery"): invoicing is blocked
 * until the order is READY/PARTIAL. Activities without an entry are unchanged.
 */
export const DOC_WORKFLOW_GATES: Record<string, Record<string, Record<string, string[]>>> = {
  '/doc/sales_order': {
    manufacturing: { 'convert-to-invoice': ['PARTIAL', 'READY'] },
  },
};

/** Statuses from which the action is allowed, or null when it is ungated. */
export function getWorkflowGate(
  docPath: string,
  elementId: string,
  businessType: string = getEffectiveBusinessType(),
): string[] | null {
  const gates = DOC_WORKFLOW_GATES[docPath];
  if (!gates) return null;
  const familyId = getBusinessProfile(businessType).familyId;
  return gates[businessType]?.[elementId] ?? (familyId ? gates[familyId]?.[elementId] : undefined) ?? null;
}

/** True when the action may run for a document currently in `status`. */
export function isWorkflowActionAllowed(
  docPath: string,
  elementId: string,
  status: string,
  businessType: string = getEffectiveBusinessType(),
): boolean {
  const allowed = getWorkflowGate(docPath, elementId, businessType);
  return allowed === null || allowed.includes(status);
}

export interface DocElementState {
  visible: boolean;
  label?: string;
  required: boolean;
}

function ruleHides(rule: DocElementRule, businessType: string): boolean {
  const familyId = getBusinessProfile(businessType).familyId;
  const matches = (id: string) => id === businessType || (familyId ? id === familyId : false);
  if (rule.onlyFor?.length && !rule.onlyFor.some(matches)) return true;
  if (rule.hiddenFor?.length && rule.hiddenFor.some(matches)) return true;
  if (rule.hiddenPath && isActivityPathHidden(rule.hiddenPath, businessType)) return true;
  if (rule.hiddenPaths?.some((path) => isActivityPathHidden(path, businessType))) return true;
  return false;
}

function ruleLabel(rule: DocElementRule, businessType: string): string | undefined {
  if (!rule.labels) return undefined;
  const familyId = getBusinessProfile(businessType).familyId;
  return rule.labels[businessType] ?? (familyId ? rule.labels[familyId] : undefined);
}

/** Resolve one element of a document type for the effective (or given) activity. */
export function resolveDocElement(
  docPath: string,
  elementId: string,
  businessType: string = getEffectiveBusinessType(),
): DocElementState {
  const rule = DOC_ELEMENT_RULES[docPath]?.[elementId];
  if (!rule) return { visible: true, required: false };
  return {
    visible: !ruleHides(rule, businessType),
    label: ruleLabel(rule, businessType),
    required: rule.required === true,
  };
}

/** True when `elementId` is hidden for the activity on this document type. */
export function isDocElementHidden(
  docPath: string,
  elementId: string,
  businessType: string = getEffectiveBusinessType(),
): boolean {
  return !resolveDocElement(docPath, elementId, businessType).visible;
}

/** Label override for a document element, or undefined for the default. */
export function getDocElementLabel(
  docPath: string,
  elementId: string,
  businessType: string = getEffectiveBusinessType(),
): string | undefined {
  return resolveDocElement(docPath, elementId, businessType).label;
}

/** All element states declared for a document type. */
export function resolveDocElements(
  docPath: string,
  businessType: string = getEffectiveBusinessType(),
): Record<string, DocElementState> {
  const rules = DOC_ELEMENT_RULES[docPath];
  if (!rules) return {};
  const out: Record<string, DocElementState> = {};
  for (const elementId of Object.keys(rules)) {
    out[elementId] = resolveDocElement(docPath, elementId, businessType);
  }
  return out;
}

export default DOC_ELEMENT_RULES;
