import ceramicsProfile from './business-profiles/ceramics.json' with { type: 'json' };
import buildingMaterialsProfile from './business-profiles/building_materials.json' with { type: 'json' };
import sanitaryProfile from './business-profiles/sanitary.json' with { type: 'json' };
import lightingProfile from './business-profiles/lighting.json' with { type: 'json' };
import furnitureProfile from './business-profiles/furniture.json' with { type: 'json' };
import electronicsProfile from './business-profiles/electronics.json' with { type: 'json' };
import clothingProfile from './business-profiles/clothing.json' with { type: 'json' };
import automotiveProfile from './business-profiles/automotive.json' with { type: 'json' };
import homeAppliancesProfile from './business-profiles/home_appliances.json' with { type: 'json' };
import cosmeticsProfile from './business-profiles/cosmetics.json' with { type: 'json' };
import foodProfile from './business-profiles/food.json' with { type: 'json' };
import restaurantProfile from './business-profiles/restaurant.json' with { type: 'json' };
import servicesProfile from './business-profiles/services.json' with { type: 'json' };
import workshopProfile from './business-profiles/workshop.json' with { type: 'json' };
import generalProfile from './business-profiles/general.json' with { type: 'json' };
import customProfile from './business-profiles/custom.json' with { type: 'json' };
import manufacturingProfile from './business-profiles/manufacturing.json' with { type: 'json' };
import constructionProfile from './business-profiles/construction.json' with { type: 'json' };
import importExportProfile from './business-profiles/import_export.json' with { type: 'json' };
import ecommerceProfile from './business-profiles/ecommerce.json' with { type: 'json' };
import logisticsProfile from './business-profiles/logistics.json' with { type: 'json' };
import professionalServicesProfile from './business-profiles/professional_services.json' with { type: 'json' };
import educationProfile from './business-profiles/education.json' with { type: 'json' };
import healthcareAdminProfile from './business-profiles/healthcare_admin.json' with { type: 'json' };
import hospitalityProfile from './business-profiles/hospitality.json' with { type: 'json' };
import {
  MODULE_IDS,
  MODULE_REGISTRY,
  getHiddenModulePaths,
  getManagedModulePaths,
  getModulePathOwner,
} from './moduleRegistry';
import {
  BUSINESS_ACTIVITY_FAMILIES,
  getActivityRows,
  type ActivityDefinition,
} from './activityCatalog';

export interface BusinessProfile {
  schemaVersion: number;
  profileVersion: number;
  id: string;
  name: { ar: string; en: string };
  description: { ar: string; en: string };
  category: string;
  familyId?: string;
  configuration: BusinessConfigurationDefaults;
  modules: { enabledByDefault: string[]; optional: string[] };
  support: Record<string, string | boolean>;
}

const PROFILE_FILES: unknown[] = [
  ceramicsProfile, buildingMaterialsProfile, sanitaryProfile, lightingProfile,
  furnitureProfile, electronicsProfile, clothingProfile, automotiveProfile,
  homeAppliancesProfile, cosmeticsProfile, foodProfile, restaurantProfile,
  servicesProfile, workshopProfile, generalProfile, customProfile,
  manufacturingProfile, constructionProfile, importExportProfile, ecommerceProfile,
  logisticsProfile, professionalServicesProfile, educationProfile,
  healthcareAdminProfile, hospitalityProfile,
];

export const BUSINESS_UNITS = [
  { id: 'M2', label: 'متر مربع' },
  { id: 'LINEAR_METER', label: 'متر طولي' },
  { id: 'METER', label: 'متر' },
  { id: 'PIECE', label: 'قطعة' },
  { id: 'BOX', label: 'كرتونة' },
  { id: 'PACK', label: 'عبوة' },
  { id: 'KG', label: 'كيلوجرام' },
  { id: 'TON', label: 'طن' },
  { id: 'LITER', label: 'لتر' },
  { id: 'SET', label: 'طقم' },
  { id: 'SERVICE', label: 'خدمة' },
] as const;

export type BusinessModel = 'products' | 'services' | 'mixed';

export interface BusinessConfiguration {
  businessType: string;
  businessModel: BusinessModel;
  trackInventory: boolean;
  units: string[];
  customUnits: string[];
  productAttributes: string[];
  additionalActivityIds: string[];
}

type BusinessConfigurationDefaults = Omit<BusinessConfiguration, 'businessType'>;

const VALID_BUSINESS_MODELS = new Set<BusinessModel>(['products', 'services', 'mixed']);
const VALID_UNITS = new Set<string>(BUSINESS_UNITS.map((unit) => unit.id));

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function hasUniqueNonEmptyStrings(values: string[]): boolean {
  const normalized = values.map((value) => value.trim().toLowerCase());
  return normalized.every(Boolean) && new Set(normalized).size === normalized.length;
}

function validateBusinessProfile(value: unknown): BusinessProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Business profile must be an object.');
  }
  const profile = value as Partial<BusinessProfile>;
  const fail = (reason: string): never => {
    throw new Error(`Invalid business profile "${profile.id || 'unknown'}": ${reason}`);
  };
  if (profile.schemaVersion !== 1 || !Number.isInteger(profile.profileVersion) || Number(profile.profileVersion) < 1) {
    fail('unsupported schema or profile version.');
  }
  if (typeof profile.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(profile.id)) fail('invalid id.');
  if (typeof profile.name?.ar !== 'string' || !profile.name.ar.trim()
    || typeof profile.name.en !== 'string' || !profile.name.en.trim()
    || typeof profile.description?.ar !== 'string' || !profile.description.ar.trim()
    || typeof profile.description.en !== 'string' || !profile.description.en.trim()) {
    fail('Arabic and English names and descriptions are required.');
  }
  if (typeof profile.category !== 'string' || !profile.category.trim()) fail('category is required.');

  const configuration = profile.configuration;
  if (!configuration) throw new Error(`Invalid business profile "${profile.id}": configuration is incomplete.`);
  if (!VALID_BUSINESS_MODELS.has(configuration.businessModel)
    || typeof configuration.trackInventory !== 'boolean') {
    throw new Error(`Invalid business profile "${profile.id}": configuration is incomplete.`);
  }
  if (!isStringArray(configuration.units) || configuration.units.length === 0
    || !isStringArray(configuration.customUnits)
    || !isStringArray(configuration.productAttributes)) {
    throw new Error(`Invalid business profile "${profile.id}": configuration is incomplete.`);
  }
  if (!hasUniqueNonEmptyStrings(configuration.units)
    || !hasUniqueNonEmptyStrings(configuration.customUnits)
    || !hasUniqueNonEmptyStrings(configuration.productAttributes)) {
    fail('units, custom units, and product attributes must be non-empty and unique.');
  }
  if (configuration.units.some((unit) => !VALID_UNITS.has(unit))) fail('unknown unit.');

  const modules = profile.modules;
  if (!modules) throw new Error(`Invalid business profile "${profile.id}": module defaults are incomplete.`);
  if (!isStringArray(modules.enabledByDefault) || !isStringArray(modules.optional)) {
    throw new Error(`Invalid business profile "${profile.id}": module defaults are incomplete.`);
  }
  const moduleIds = new Set(MODULE_IDS);
  if ([...modules.enabledByDefault, ...modules.optional].some((moduleId) => !moduleIds.has(moduleId))) {
    fail('unknown module id.');
  }
  if (new Set(modules.enabledByDefault).size !== modules.enabledByDefault.length
    || new Set(modules.optional).size !== modules.optional.length
    || modules.enabledByDefault.some((moduleId) => modules.optional.includes(moduleId))
    || [...modules.enabledByDefault, ...modules.optional].length !== MODULE_IDS.length) {
    fail('modules must be uniquely classified as enabled by default or optional.');
  }
  if (!profile.support || typeof profile.support !== 'object' || Array.isArray(profile.support)
    || profile.support.profileDefaults !== 'implemented') {
    fail('support status must explicitly declare profile defaults.');
  }
  return profile as BusinessProfile;
}

export const BUSINESS_PROFILES: BusinessProfile[] = PROFILE_FILES.map(validateBusinessProfile);
const PROFILE_BY_ID = new Map<string, BusinessProfile>();
for (const profile of BUSINESS_PROFILES) {
  if (PROFILE_BY_ID.has(profile.id)) throw new Error(`Duplicate business profile id: ${profile.id}`);
  PROFILE_BY_ID.set(profile.id, profile);
}

const ACTIVITY_DEFINITIONS: ActivityDefinition[] = getActivityRows();
export const BUSINESS_ACTIVITY_CATALOG: readonly ActivityDefinition[] = ACTIVITY_DEFINITIONS;
const ACTIVITY_BY_ID = new Map<string, ActivityDefinition>();
const ACTIVITY_FAMILY_IDS = new Set(BUSINESS_ACTIVITY_FAMILIES.map((family) => family.id));
for (const activity of ACTIVITY_DEFINITIONS) {
  if (!/^[a-z][a-z0-9_]*$/.test(activity.id)) throw new Error(`Invalid activity id: ${activity.id}`);
  if (ACTIVITY_BY_ID.has(activity.id)) throw new Error(`Duplicate activity id: ${activity.id}`);
  if (!activity.label.trim() || !ACTIVITY_FAMILY_IDS.has(activity.familyId)) {
    throw new Error(`Activity "${activity.id}" has incomplete display metadata or an unknown family.`);
  }
  if (!PROFILE_BY_ID.has(activity.profileId)) {
    throw new Error(`Activity "${activity.id}" references unknown profile "${activity.profileId}".`);
  }
  ACTIVITY_BY_ID.set(activity.id, activity);
}

const ACTIVITY_PROFILE_BY_ID = new Map<string, BusinessProfile>();
for (const activity of ACTIVITY_DEFINITIONS) {
  const template = PROFILE_BY_ID.get(activity.profileId)!;
  const family = BUSINESS_ACTIVITY_FAMILIES.find((item) => item.id === activity.familyId);
  const englishActivityName = activity.id.replace(/_/g, ' ');
  ACTIVITY_PROFILE_BY_ID.set(activity.id, {
    ...template,
    id: activity.id,
    name: { ar: activity.label, en: `${englishActivityName} (${family?.labelEn || template.category})` },
    description: {
      ar: `قالب ${family?.label || template.category} مبني على إعداد ${template.name.ar}.`,
      en: `${englishActivityName} uses the shared ${template.name.en} profile defaults.`,
    },
    category: activity.familyId,
    familyId: activity.familyId,
  });
}

/* Keep old profile ids selectable so existing installations and drafts remain valid. */
const LEGACY_BUSINESS_TYPES = BUSINESS_PROFILES.map((profile) => ({
  id: profile.id,
  label: profile.name.ar,
  category: profile.category,
  familyLabel: profile.category,
  description: profile.description.ar,
}));

export const getBusinessProfile = (businessType: string): BusinessProfile =>
  ACTIVITY_PROFILE_BY_ID.get(businessType)
  || PROFILE_BY_ID.get(businessType)
  || PROFILE_BY_ID.get('general')!;

export const getBusinessProfileTemplateId = (businessType: string): string =>
  ACTIVITY_BY_ID.get(businessType)?.profileId
  || (PROFILE_BY_ID.has(businessType) ? businessType : 'general');

export const BUSINESS_TYPES = [
  ...ACTIVITY_DEFINITIONS.map((activity) => ({
    id: activity.id,
    label: activity.label,
    category: activity.familyId,
    familyLabel: BUSINESS_ACTIVITY_FAMILIES.find((family) => family.id === activity.familyId)?.label || activity.familyId,
    description: getBusinessProfile(activity.id).description.ar,
  })),
  ...LEGACY_BUSINESS_TYPES.filter((legacy) => !ACTIVITY_BY_ID.has(legacy.id)),
];

export const BUSINESS_ACTIVITY_FAMILY_OPTIONS = BUSINESS_ACTIVITY_FAMILIES.map((family) => ({
  id: family.id,
  label: family.label,
}));

function uniqueActivityIds(primaryId: string, additionalIds: string[]): string[] {
  return [...new Set(additionalIds)]
    .filter((id) => id !== primaryId && ACTIVITY_BY_ID.has(id));
}

export const getDefaultBusinessConfiguration = (
  businessType: string,
  additionalActivityIds: string[] = [],
): BusinessConfiguration => {
  const primary = getBusinessProfile(businessType);
  const additionalIds = uniqueActivityIds(businessType, additionalActivityIds);
  const profiles = [primary, ...additionalIds.map(getBusinessProfile)];
  const models = new Set(profiles.map((profile) => profile.configuration.businessModel));
  const combinedModel: BusinessModel = models.size > 1
    ? 'mixed'
    : primary.configuration.businessModel;
  return {
    businessType,
    businessModel: combinedModel,
    trackInventory: profiles.some((profile) => profile.configuration.trackInventory),
    units: [...new Set(profiles.flatMap((profile) => profile.configuration.units))],
    customUnits: [...new Set(profiles.flatMap((profile) => profile.configuration.customUnits))],
    productAttributes: [...new Set(profiles.flatMap((profile) => profile.configuration.productAttributes))],
    additionalActivityIds: additionalIds,
  };
};

export const getActivityModuleIds = (businessType: string, additionalActivityIds: string[] = []): string[] =>
  [...new Set([
    ...getProfileModuleIds(businessType),
    ...uniqueActivityIds(businessType, additionalActivityIds).flatMap(getProfileModuleIds),
  ])];

export const parseBusinessConfiguration = (raw: string | undefined, businessType: string): BusinessConfiguration => {
  if (!raw) return getDefaultBusinessConfiguration(businessType);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return getDefaultBusinessConfiguration(businessType);
    }
    const saved = parsed as Partial<BusinessConfiguration>;
    const additionalActivityIds = uniqueActivityIds(
      businessType,
      isStringArray(saved.additionalActivityIds) ? saved.additionalActivityIds : [],
    );
    const defaults = getDefaultBusinessConfiguration(businessType, additionalActivityIds);
    const strings = (value: unknown, fallback: string[]) => Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
      : fallback;
    return {
      ...defaults,
      businessType,
      businessModel: VALID_BUSINESS_MODELS.has(saved.businessModel as BusinessModel) ? saved.businessModel as BusinessModel : defaults.businessModel,
      trackInventory: typeof saved.trackInventory === 'boolean' ? saved.trackInventory : defaults.trackInventory,
      units: strings(saved.units, defaults.units).filter((unit) => VALID_UNITS.has(unit)),
      customUnits: strings(saved.customUnits, defaults.customUnits),
      productAttributes: strings(saved.productAttributes, defaults.productAttributes),
      additionalActivityIds,
    };
  } catch {
    return getDefaultBusinessConfiguration(businessType);
  }
};

// The registry is the source of truth for module metadata. `BUSINESS_MODULES`
// stays exported for existing UI code and keeps its original shape.
export const BUSINESS_MODULES = MODULE_REGISTRY.map((module) => ({
  id: module.id,
  label: module.label,
  paths: [...module.paths],
}));

export const getProfileModuleIds = (businessType: string): string[] => {
  const profile = getBusinessProfile(businessType);
  return [...profile.modules.enabledByDefault];
};


export const parseEnabledModules = (raw: string | undefined, businessType: string): string[] => {
  if (!raw) return getProfileModuleIds(businessType);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getProfileModuleIds(businessType);
    const valid = parsed.filter((id): id is string =>
      typeof id === 'string' && BUSINESS_MODULES.some((module) => module.id === id)
    );
    return valid.length === 0 && parsed.length > 0
      ? getProfileModuleIds(businessType)
      : [...new Set(valid)];
  } catch {
    return getProfileModuleIds(businessType);
  }
};

export const getProfileHiddenPaths = (enabledModuleIds: string[]): string[] =>
  getHiddenModulePaths(enabledModuleIds);

export const getBusinessModuleForPath = (pathname: string): string | undefined =>
  getModulePathOwner(pathname);

export const getManagedBusinessPaths = (): Set<string> =>
  getManagedModulePaths();
