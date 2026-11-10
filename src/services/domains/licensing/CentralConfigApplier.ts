import { SettingsService } from '../config/SettingsService';
import { CentralLicenseService } from './CentralLicenseService';
import { withModuleDependencies } from '../../../config/moduleRegistry';
import { BUSINESS_TYPES } from '../../../config/businessProfiles';

const KNOWN_BUSINESS_TYPE_IDS = new Set(BUSINESS_TYPES.map((type) => type.id));

// Mapping from admin activity_type values to ma3rad business profile ids.
const ACTIVITY_TYPE_MAP: Record<string, string> = {
  ceramics: 'ceramics',
  building_materials: 'building_materials',
  sanitary: 'sanitary',
  electrical: 'electronics',
  lighting: 'lighting',
  retail: 'general',
  general: 'general',
  food: 'food',
  clothing: 'clothing',
  manufacturing: 'manufacturing',
  construction: 'construction',
  import_export: 'import_export',
  ecommerce: 'ecommerce',
  logistics: 'logistics',
  professional_services: 'professional_services',
  education: 'education',
  healthcare: 'healthcare_admin',
  hospitality: 'hospitality',
};

export class CentralConfigApplier {
  static apply(): void {
    try {
      const cfg = CentralLicenseService.getCachedConfig();
      if (!cfg) return;

      const activityType = CentralLicenseService.getActivityType();
      const allowed = CentralLicenseService.getAllowedModules();

      const patch: Record<string, string> = {};

      if (activityType) {
        const profileId = ACTIVITY_TYPE_MAP[activityType] || activityType;
        // getBusinessProfile() falls back silently to `general`, so validate the
        // id against the published catalog before adopting it.
        if (KNOWN_BUSINESS_TYPE_IDS.has(profileId)) {
          patch.businessType = profileId;
        }
      }

      if (allowed && allowed.length) {
        const enabled = withModuleDependencies(allowed);
        patch.enabledModules = JSON.stringify(enabled);
      }

      if (Object.keys(patch).length === 0) return;

      SettingsService.applyCentral(patch);
    } catch (e) {
      // Best-effort: never block app on central config application.
      console.warn('CentralConfigApplier failed:', (e as any)?.message || e);
    }
  }
}