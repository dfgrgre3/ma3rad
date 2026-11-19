// Configuration delegations → PlatformSettingsService (settings, policies,
// tenant activity), PlatformBrandingService (branding, UI profiles,
// customization) and PlatformConfigService (config templates, tenant config,
// rollouts and acks).
import { platformSettingsService } from '../PlatformSettingsService';
import { platformBrandingService } from '../PlatformBrandingService';
import { platformConfigService } from '../PlatformConfigService';
import type {
  PlatformSettingsMap,
  PlatformPolicyDocument,
  PlatformPolicyRetention,
  PlatformTenantActivityConfig,
  PlatformTenantActivityInput,
  PlatformTenantActivityVersion,
  PlatformBrandingConfig,
  PlatformBrandingInput,
  PlatformBrandingVersion,
  PlatformUiProfile,
  PlatformTenantUiCustomization,
  PlatformTenantUiInput,
  PlatformTenantUiVersion,
  PlatformConfigTemplate,
  PlatformTenantConfig,
  PlatformTenantConfigInput,
  PlatformTenantConfigVersion,
  PlatformConfigRollout,
  PlatformConfigRolloutInput,
  PlatformConfigAck,
} from '../platformTypes';

export interface ConfigurationApi {
  // Settings - Delegate to PlatformSettingsService
  getSettings(): PlatformSettingsMap;
  updateSettings(input: Partial<PlatformSettingsMap>): PlatformSettingsMap;
  getPlatformPolicies(): PlatformPolicyDocument;
  savePlatformPolicies(input: {
    terms?: string;
    privacy?: string;
    retention?: Partial<PlatformPolicyRetention>;
  }): PlatformPolicyDocument;
  rotatePlatformEncryptionKeys(): { rotatedAt: string; status: string; newKeyFingerprint: string };
  getTenantActivity(tenantId: string): PlatformTenantActivityConfig | null;
  saveTenantActivity(input: PlatformTenantActivityInput): PlatformTenantActivityConfig;
  listTenantActivityVersions(tenantId: string): PlatformTenantActivityVersion[];
  rollbackTenantActivity(tenantId: string, targetVersion: number): PlatformTenantActivityConfig;
  // Branding - Delegate to PlatformBrandingService
  getPlatformBranding(): PlatformBrandingConfig;
  getTenantBranding(tenantId?: string | null): PlatformBrandingConfig;
  saveTenantBranding(input: PlatformBrandingInput): PlatformBrandingConfig;
  listTenantBrandingVersions(tenantId?: string | null): PlatformBrandingVersion[];
  rollbackTenantBranding(tenantId: string | null | undefined, targetVersion: number): PlatformBrandingConfig;
  listUiProfiles(): PlatformUiProfile[];
  getTenantUiCustomization(tenantId: string): PlatformTenantUiCustomization;
  saveTenantUiCustomization(input: PlatformTenantUiInput): PlatformTenantUiCustomization;
  listTenantUiVersions(tenantId: string): PlatformTenantUiVersion[];
  rollbackTenantUi(tenantId: string, targetVersion: number): PlatformTenantUiCustomization;
  // Config - Delegate to PlatformConfigService
  listConfigTemplates(): PlatformConfigTemplate[];
  getTenantConfig(tenantId: string): PlatformTenantConfig;
  saveTenantConfig(input: PlatformTenantConfigInput): PlatformTenantConfig;
  listTenantConfigVersions(tenantId: string): PlatformTenantConfigVersion[];
  rollbackTenantConfig(tenantId: string, targetVersion: number): PlatformTenantConfig;
  createConfigRollout(input: PlatformConfigRolloutInput): PlatformConfigRollout;
  startConfigRollout(id: string): PlatformConfigRollout;
  listConfigRollouts(): PlatformConfigRollout[];
  listConfigAcks(tenantId?: string): PlatformConfigAck[];
}

export function createConfigurationApi(): ConfigurationApi {
  return {
    // Settings - Delegate to PlatformSettingsService
    getSettings() {
      return platformSettingsService.getSettings();
    },

    updateSettings(input: Partial<PlatformSettingsMap>) {
      return platformSettingsService.updateSettings(input);
    },

    getPlatformPolicies() {
      return platformSettingsService.getPlatformPolicies();
    },

    savePlatformPolicies(input: {
      terms?: string;
      privacy?: string;
      retention?: Partial<PlatformPolicyRetention>;
    }) {
      return platformSettingsService.savePlatformPolicies(input);
    },

    rotatePlatformEncryptionKeys() {
      return platformSettingsService.rotatePlatformEncryptionKeys();
    },

    getTenantActivity(tenantId: string) {
      return platformSettingsService.getTenantActivity(tenantId);
    },

    saveTenantActivity(input: PlatformTenantActivityInput) {
      return platformSettingsService.saveTenantActivity(input);
    },

    listTenantActivityVersions(tenantId: string) {
      return platformSettingsService.listTenantActivityVersions(tenantId);
    },

    rollbackTenantActivity(tenantId: string, targetVersion: number) {
      return platformSettingsService.rollbackTenantActivity(tenantId, targetVersion);
    },

    // Branding - Delegate to PlatformBrandingService
    getPlatformBranding() {
      return platformBrandingService.getPlatformBranding();
    },

    getTenantBranding(tenantId?: string | null) {
      return platformBrandingService.getTenantBranding(tenantId);
    },

    saveTenantBranding(input: PlatformBrandingInput) {
      return platformBrandingService.saveTenantBranding(input);
    },

    listTenantBrandingVersions(tenantId?: string | null) {
      return platformBrandingService.listTenantBrandingVersions(tenantId);
    },

    rollbackTenantBranding(tenantId: string | null | undefined, targetVersion: number) {
      return platformBrandingService.rollbackTenantBranding(tenantId, targetVersion);
    },

    listUiProfiles() {
      return platformBrandingService.listUiProfiles();
    },

    getTenantUiCustomization(tenantId: string) {
      return platformBrandingService.getTenantUiCustomization(tenantId);
    },

    saveTenantUiCustomization(input: PlatformTenantUiInput) {
      return platformBrandingService.saveTenantUiCustomization(input);
    },

    listTenantUiVersions(tenantId: string) {
      return platformBrandingService.listTenantUiVersions(tenantId);
    },

    rollbackTenantUi(tenantId: string, targetVersion: number) {
      return platformBrandingService.rollbackTenantUi(tenantId, targetVersion);
    },

    // Config - Delegate to PlatformConfigService
    listConfigTemplates() {
      return platformConfigService.listConfigTemplates();
    },

    getTenantConfig(tenantId: string) {
      return platformConfigService.getTenantConfig(tenantId);
    },

    saveTenantConfig(input: PlatformTenantConfigInput) {
      return platformConfigService.saveTenantConfig(input);
    },

    listTenantConfigVersions(tenantId: string) {
      return platformConfigService.listTenantConfigVersions(tenantId);
    },

    rollbackTenantConfig(tenantId: string, targetVersion: number) {
      return platformConfigService.rollbackTenantConfig(tenantId, targetVersion);
    },

    createConfigRollout(input: PlatformConfigRolloutInput) {
      return platformConfigService.createConfigRollout(input);
    },

    startConfigRollout(id: string) {
      return platformConfigService.startConfigRollout(id);
    },

    listConfigRollouts() {
      return platformConfigService.listConfigRollouts();
    },

    listConfigAcks(tenantId?: string) {
      return platformConfigService.listConfigAcks(tenantId);
    },
  };
}
