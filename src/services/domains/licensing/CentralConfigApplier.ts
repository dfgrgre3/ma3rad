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

      const branding = cfg.config?.branding;
      if (branding && typeof branding === 'object') {
        if (branding.company_name) {
          const name = String(branding.company_name);
          patch.brandName = name;
          patch.showroomName = name;
        }
        if (branding.logo_url) patch.brandLogoDataUrl = String(branding.logo_url);
        if (branding.logo_dark_url) patch.brandLogoDarkDataUrl = String(branding.logo_dark_url);
        if (branding.favicon_url) patch.brandFaviconUrl = String(branding.favicon_url);
        if (branding.primary_color) patch.brandPrimaryColor = String(branding.primary_color);
        if (branding.secondary_color) patch.brandSecondaryColor = String(branding.secondary_color);
        if (branding.accent_color) patch.brandAccentColor = String(branding.accent_color);
        if (branding.font_family) patch.fontFamily = String(branding.font_family);
        if (branding.invoice_template) patch.defaultInvoiceTemplate = String(branding.invoice_template);
        if (branding.login_welcome_title) patch.loginWelcomeTitle = String(branding.login_welcome_title);
        if (branding.login_welcome_subtitle) patch.loginWelcomeSubtitle = String(branding.login_welcome_subtitle);
      }

      if (Object.keys(patch).length === 0) return;

      SettingsService.applyCentral(patch);
    } catch (e) {
      // Best-effort: never block app on central config application.
      console.warn('CentralConfigApplier failed:', (e as any)?.message || e);
    }
  }
}