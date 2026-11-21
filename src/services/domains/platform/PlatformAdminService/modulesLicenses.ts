// Module/feature-flag/release delegations → PlatformModuleFeatureService and
// license/device delegations → PlatformLicenseService.
import { platformModuleFeatureService } from '../PlatformModuleFeatureService';
import { platformLicenseService } from '../PlatformLicenseService';
import type {
  PlatformModule,
  PlatformFeatureFlag,
  PlatformFeatureOverride,
  PlatformRelease,
  PlatformReleaseTarget,
  PlatformLicense,
  PlatformLicenseStatus,
  PlatformLicenseActivation,
  PlatformLicenseChange,
  PlatformDevice,
} from '../platformTypes';

export interface ModulesLicensesApi {
  // Module & Feature Management - Delegate to PlatformModuleFeatureService
  listModules(): PlatformModule[];
  listModulesForRuntime(): PlatformModule[];
  listFeatureFlags(): PlatformFeatureFlag[];
  listFeatureFlagsForRuntime(): PlatformFeatureFlag[];
  listFeatureOverrides(featureId: string): PlatformFeatureOverride[];
  setFeatureOverride(input: {
    featureId: string;
    targetType?: 'TENANT' | 'PLAN' | 'STAGING_GROUP';
    targetId?: string | null;
    tenantId?: string | null;
    isEnabled?: boolean;
    enabled?: boolean;
    customRolloutPercent?: number | null;
    rolloutPercentage?: number;
  }): PlatformFeatureOverride;
  removeFeatureOverride(id: string): void;
  setModuleEnabled(id: string, enabled: boolean): void;
  upsertFeatureFlag(input: {
    id?: string;
    key?: string;
    code?: string;
    name: string;
    description?: string;
    category?: string;
    isEnabled?: boolean;
    isActive?: boolean;
    defaultEnabled?: boolean;
    rolloutPercent?: number;
    rolloutPercentage?: number;
    isStagingOnly?: boolean;
    minPlanTier?: string | null;
    pagePaths?: string[];
  }): PlatformFeatureFlag;
  setFeatureEnabled(id: string, enabled: boolean): void;
  deleteFeatureFlag(id: string): void;
  listReleases(): PlatformRelease[];
  listReleaseTargets(releaseId: string): PlatformReleaseTarget[];
  setReleaseTargets(releaseId: string, tenantIds: string[]): PlatformReleaseTarget[];
  updateReleaseTargetStatus(releaseId: string, tenantId: string, status: PlatformReleaseTarget['status'], error?: string): void;
  disableRelease(id: string): PlatformRelease;
  rollbackRelease(releaseId: string, safeRollbackVersion: string): PlatformRelease;
  upsertRelease(input: {
    id?: string;
    version: string;
    channel?: string;
    status?: string | null;
    isMandatory?: boolean | null;
    minVersion?: string | null;
    rolloutGroup?: string | null;
    notes?: string | null;
    releasedAt?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    checksumSha256?: string | null;
    packageSignature?: string | null;
    changelog?: string | null;
    rollbackVersion?: string | null;
    stagingGroup?: string | null;
    name?: string;
    description?: string;
    releaseDate?: string;
    isActive?: boolean;
    minClientVersion?: string;
    maxClientVersion?: string;
    artifactUrl?: string;
    artifactHash?: string;
  }): PlatformRelease;
  // License Management - Delegate to PlatformLicenseService
  listLicenses(search?: string, status?: string): PlatformLicense[];
  getLicense(id: string): PlatformLicense | null;
  issueLicense(tenantId: string, planId: string, options?: any): PlatformLicense;
  renewLicense(id: string, months?: number): PlatformLicense;
  updateLicense(id: string, fields: {
    seats?: number;
    deviceLimit?: number;
    branchesLimit?: number;
    offlineGracePeriodDays?: number;
    notes?: string | null;
    couplingMode?: PlatformLicense['couplingMode'];
  }): PlatformLicense;
  setLicenseStatus(id: string, status: PlatformLicenseStatus): void;
  setLicenseCouplingMode(id: string, couplingMode: PlatformLicense['couplingMode']): PlatformLicense;
  bindLicenseHardware(id: string, hardwareId: string): void;
  deactivateLicenseDevice(id: string, notes?: string): void;
  listLicenseActivations(licenseId: string): PlatformLicenseActivation[];
  listLicenseChanges(licenseId: string): PlatformLicenseChange[];
  listDevices(tenantId?: string): PlatformDevice[];
  registerDevice(input: {
    licenseId: string;
    hardwareId: string;
    deviceName?: string;
    deviceType?: string;
    os?: string;
    appVersion?: string;
  }): PlatformDevice;
  setDeviceStatus(id: string, status: PlatformDevice['status']): PlatformDevice;
  deleteDevice(id: string): void;
  markDeviceCloneSuspected(id: string, suspected: boolean): PlatformDevice;
  reassignDeviceSeat(deviceId: string, licenseId: string): PlatformDevice;
  suspendDevice(deviceId: string, reason?: string): PlatformDevice;
  releaseDevice(deviceId: string, reason?: string): PlatformDevice;
  revokeDevice(deviceId: string, reason?: string): PlatformDevice;
  getDevice(deviceId: string): PlatformDevice | null;
  listDevicesCentral(filters: { tenantId?: string; status?: string; hardwareId?: string; limit?: number }): PlatformDevice[];
  suspendDeviceCentral(deviceId: string, reason?: string): PlatformDevice;
  releaseDeviceCentral(deviceId: string): PlatformDevice;
  revokeDeviceCentral(deviceId: string, reason?: string): PlatformDevice;
}

export function createModulesLicensesApi(): ModulesLicensesApi {
  return {
    // Module & Feature Management - Delegate to PlatformModuleFeatureService
    listModules() {
      return platformModuleFeatureService.listModules();
    },

    listModulesForRuntime() {
      return platformModuleFeatureService.listModulesForRuntime();
    },

    listFeatureFlags() {
      return platformModuleFeatureService.listFeatureFlags();
    },

    listFeatureFlagsForRuntime() {
      return platformModuleFeatureService.listFeatureFlagsForRuntime();
    },

    listFeatureOverrides(featureId: string) {
      return platformModuleFeatureService.listFeatureOverrides(featureId);
    },

    setFeatureOverride(input: {
      featureId: string;
      targetType?: 'TENANT' | 'PLAN' | 'STAGING_GROUP';
      targetId?: string | null;
      tenantId?: string | null;
      isEnabled?: boolean;
      enabled?: boolean;
      customRolloutPercent?: number | null;
      rolloutPercentage?: number;
    }) {
      return platformModuleFeatureService.setFeatureOverride(input);
    },

    removeFeatureOverride(id: string) {
      platformModuleFeatureService.removeFeatureOverride(id);
    },

    setModuleEnabled(id: string, enabled: boolean) {
      platformModuleFeatureService.setModuleEnabled(id, enabled);
    },

    upsertFeatureFlag(input: {
      id?: string;
      key?: string;
      code?: string;
      name: string;
      description?: string;
      category?: string;
      isEnabled?: boolean;
      isActive?: boolean;
      defaultEnabled?: boolean;
      rolloutPercent?: number;
      rolloutPercentage?: number;
      isStagingOnly?: boolean;
      minPlanTier?: string | null;
      pagePaths?: string[];
    }) {
      return platformModuleFeatureService.upsertFeatureFlag(input);
    },

    setFeatureEnabled(id: string, enabled: boolean) {
      platformModuleFeatureService.setFeatureEnabled(id, enabled);
    },

    deleteFeatureFlag(id: string) {
      platformModuleFeatureService.deleteFeatureFlag(id);
    },

    listReleases() {
      return platformModuleFeatureService.listReleases();
    },

    listReleaseTargets(releaseId: string) {
      return platformModuleFeatureService.listReleaseTargets(releaseId);
    },

    setReleaseTargets(releaseId: string, tenantIds: string[]) {
      return platformModuleFeatureService.setReleaseTargets(releaseId, tenantIds);
    },

    updateReleaseTargetStatus(releaseId: string, tenantId: string, status: PlatformReleaseTarget['status'], error?: string) {
      platformModuleFeatureService.updateReleaseTargetStatus(releaseId, tenantId, status, error);
    },

    disableRelease(id: string) {
      return platformModuleFeatureService.disableRelease(id);
    },

    rollbackRelease(releaseId: string, safeRollbackVersion: string) {
      return platformModuleFeatureService.rollbackRelease(releaseId, safeRollbackVersion);
    },

    upsertRelease(input: {
      id?: string;
      version: string;
      channel?: string;
      status?: string | null;
      isMandatory?: boolean | null;
      minVersion?: string | null;
      rolloutGroup?: string | null;
      notes?: string | null;
      releasedAt?: string | null;
      fileUrl?: string | null;
      fileName?: string | null;
      fileSize?: number | null;
      checksumSha256?: string | null;
      packageSignature?: string | null;
      changelog?: string | null;
      rollbackVersion?: string | null;
      stagingGroup?: string | null;
      name?: string;
      description?: string;
      releaseDate?: string;
      isActive?: boolean;
      minClientVersion?: string;
      maxClientVersion?: string;
      artifactUrl?: string;
      artifactHash?: string;
    }) {
      return platformModuleFeatureService.upsertRelease(input);
    },

    // License Management - Delegate to PlatformLicenseService
    listLicenses(search = '', status = '') {
      return platformLicenseService.listLicenses(search, status);
    },

    getLicense(id: string) {
      return platformLicenseService.getLicense(id);
    },

    issueLicense(tenantId: string, planId: string, options: any = {}) {
      // Synchronous wrapper for backward compatibility
      return platformLicenseService.issueLicense({ tenantId, planId, ...options }) as any;
    },

    renewLicense(id: string, months = 12) {
      return platformLicenseService.renewLicense(id, months);
    },

    updateLicense(id: string, fields: {
      seats?: number;
      deviceLimit?: number;
      branchesLimit?: number;
      offlineGracePeriodDays?: number;
      notes?: string | null;
      couplingMode?: PlatformLicense['couplingMode'];
    }) {
      return platformLicenseService.updateLicense(id, fields);
    },

    setLicenseStatus(id: string, status: PlatformLicenseStatus) {
      platformLicenseService.setLicenseStatus(id, status);
    },

    setLicenseCouplingMode(id: string, couplingMode: PlatformLicense['couplingMode']) {
      return platformLicenseService.setLicenseCouplingMode(id, couplingMode);
    },

    bindLicenseHardware(id: string, hardwareId: string) {
      platformLicenseService.bindLicenseHardware(id, hardwareId);
    },

    deactivateLicenseDevice(id: string, notes?: string) {
      platformLicenseService.deactivateLicenseDevice(id, notes);
    },

    listLicenseActivations(licenseId: string) {
      return platformLicenseService.listLicenseActivations(licenseId);
    },

    listLicenseChanges(licenseId: string) {
      return platformLicenseService.listLicenseChanges(licenseId);
    },

    listDevices(tenantId?: string) {
      return platformLicenseService.listDevices(tenantId);
    },

    registerDevice(input: {
      licenseId: string;
      hardwareId: string;
      deviceName?: string;
      deviceType?: string;
      os?: string;
      appVersion?: string;
    }) {
      return platformLicenseService.registerDevice(input);
    },

    setDeviceStatus(id: string, status: PlatformDevice['status']) {
      return platformLicenseService.setDeviceStatus(id, status);
    },

    deleteDevice(id: string) {
      platformLicenseService.deleteDevice(id);
    },

    markDeviceCloneSuspected(id: string, suspected: boolean) {
      return platformLicenseService.markDeviceCloneSuspected(id, suspected);
    },

    reassignDeviceSeat(deviceId: string, licenseId: string) {
      return platformLicenseService.reassignDeviceSeat(deviceId, licenseId);
    },

    suspendDevice(deviceId: string, reason?: string) {
      return platformLicenseService.suspendDevice(deviceId, reason);
    },

    releaseDevice(deviceId: string, reason?: string) {
      return platformLicenseService.releaseDevice(deviceId, reason);
    },

    revokeDevice(deviceId: string, reason?: string) {
      return platformLicenseService.revokeDevice(deviceId, reason);
    },

    getDevice(deviceId: string) {
      return platformLicenseService.getDevice(deviceId);
    },

    listDevicesCentral(filters: { tenantId?: string; status?: string; hardwareId?: string; limit?: number }) {
      return platformLicenseService.listDevices(filters.tenantId);
    },

    suspendDeviceCentral(deviceId: string, reason?: string) {
      return platformLicenseService.suspendDevice(deviceId, reason);
    },

    releaseDeviceCentral(deviceId: string) {
      return platformLicenseService.releaseDevice(deviceId);
    },

    revokeDeviceCentral(deviceId: string, reason?: string) {
      return platformLicenseService.revokeDevice(deviceId, reason);
    },
  };
}
