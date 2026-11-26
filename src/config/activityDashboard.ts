import { getEffectiveBusinessType } from '../services/domains/config/BusinessTypeService';
import { getBusinessProfile } from './businessProfiles';
import { getActivityPageCopy } from './activityPageCopy';

/**
 * Activity-driven dashboard specification.
 *
 * Each selectable business activity resolves to a dashboard "kind" that
 * decides which dedicated overview panel the dashboard renders, plus the
 * short tab label shown in the section navigation. Resolution order:
 *   activity override → family default → 'generic'.
 *
 * Section titles/descriptions come from `activityPageCopy` (dashboard key),
 * so every activity's dashboard reads as written for that activity.
 */
export type ActivityDashboardKind =
  | 'ceramics'
  | 'hospitality'
  | 'education'
  | 'workshop'
  | 'manufacturing'
  | 'construction'
  | 'professional'
  | 'retail'
  | 'distribution'
  | 'import_export'
  | 'logistics'
  | 'generic';

export interface ActivityDashboardSpec {
  kind: ActivityDashboardKind;
  /** Short label for the dashboard section tab. */
  navLabel: string;
}

const ACTIVITY_KIND: Record<string, ActivityDashboardKind> = {
  // Retail family — dedicated showroom kind only for ceramics; the rest share
  // the retail workspace panel with activity-specific copy.
  ceramics: 'ceramics',
  sanitary: 'retail',
  furniture: 'retail',
  home_appliances: 'retail',
  electronics: 'retail',
  clothing: 'retail',
  food: 'retail',
  cosmetics: 'retail',
  automotive: 'retail',
  building_materials: 'retail',
  lighting: 'retail',
  ecommerce: 'retail',
  general: 'retail',
  // Hospitality family.
  hospitality: 'hospitality',
  // Other dedicated verticals.
  education: 'education',
  workshop: 'workshop',
  manufacturing: 'manufacturing',
  construction: 'construction',
  professional_services: 'professional',
  services: 'professional',
  custom: 'generic',
  healthcare_admin: 'generic',
  import_export: 'import_export',
  logistics: 'logistics',
};

const FAMILY_KIND: Record<string, ActivityDashboardKind> = {
  retail: 'retail',
  distribution: 'distribution',
  manufacturing: 'manufacturing',
  construction: 'construction',
  transport: 'workshop',
  hospitality: 'hospitality',
  healthcare: 'generic',
  education: 'education',
  professional_services: 'professional',
};

const KIND_NAV_LABEL: Record<ActivityDashboardKind, string> = {
  ceramics: 'صالة السيراميك',
  hospitality: 'الفندق',
  education: 'المدرسة',
  workshop: 'الورشة',
  manufacturing: 'الإنتاج',
  construction: 'المشاريع',
  professional: 'الأعمال',
  retail: 'المعرض',
  distribution: 'التوزيع',
  import_export: 'الاستيراد والتصدير',
  logistics: 'اللوجستيات',
  generic: 'نشاطي',
};

/** Per-activity tab label overrides where the kind default is too generic. */
const ACTIVITY_NAV_LABEL: Record<string, string> = {
  food: 'البقالة',
  ecommerce: 'المتجر',
  clothing: 'المحل',
  cosmetics: 'التجميل',
  automotive: 'قطع الغيار',
  building_materials: 'مواد البناء',
  home_appliances: 'الأجهزة',
  electronics: 'الإلكترونيات',
  furniture: 'الأثاث',
  sanitary: 'الأدوات الصحية',
  lighting: 'الإضاءة',
  general: 'التجزئة',
  import_export: 'الاستيراد والتصدير',
  logistics: 'اللوجستيات',
  healthcare_admin: 'المنشأة',
  services: 'الخدمات',
  custom: 'نشاطي',
};

export function getActivityDashboardKind(
  businessType: string = getEffectiveBusinessType(),
): ActivityDashboardKind {
  const direct = ACTIVITY_KIND[businessType];
  if (direct) return direct;
  const familyId = getBusinessProfile(businessType).familyId;
  return (familyId && FAMILY_KIND[familyId]) || 'generic';
}

export function getActivityDashboardSpec(
  businessType: string = getEffectiveBusinessType(),
): ActivityDashboardSpec {
  const kind = getActivityDashboardKind(businessType);
  return {
    kind,
    navLabel: ACTIVITY_NAV_LABEL[businessType] ?? KIND_NAV_LABEL[kind],
  };
}

/** Section title/subtitle for the activity dashboard tab, per activity. */
export function getActivityDashboardCopy(
  businessType: string = getEffectiveBusinessType(),
): { title: string; description: string } {
  const copy = getActivityPageCopy('dashboard', businessType);
  const profile = getBusinessProfile(businessType);
  return {
    title: copy?.title ?? `لوحة ${profile.name.ar}`,
    description: copy?.description ?? profile.description.ar,
  };
}
