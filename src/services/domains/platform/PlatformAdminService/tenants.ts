// Tenant management delegations → PlatformTenantService.
import { platformTenantService } from '../PlatformTenantService';
import type {
  PlatformTenant,
  PlatformTenantInput,
  PlatformTenantStatus,
  PlatformTenantAccount,
  PlatformTenantAccountInput,
  PlatformTenantProfile,
  PlatformTenantUser,
  PlatformTenantUserInput,
  PlatformTenantUserProvisioningResult,
  PlatformTenantOverride,
  PlatformTenantOverrideInput,
  PlatformActivationDetails,
} from '../platformTypes';

export interface TenantApi {
  listTenants(search?: string, status?: string, planId?: string): PlatformTenant[];
  getTenant(id: string): PlatformTenant | null;
  createTenant(input: PlatformTenantInput): PlatformTenant;
  updateTenant(id: string, input: PlatformTenantInput): PlatformTenant;
  setTenantStatus(id: string, status: PlatformTenantStatus): void;
  archiveTenant(id: string): void;
  getTenantProfile(id: string): PlatformTenantProfile;
  getTenantAccount(tenantId: string): PlatformTenantAccount | null;
  createTenantAccount(tenantId: string, input: PlatformTenantAccountInput): PlatformActivationDetails;
  resetTenantAccountPassword(tenantId: string, temporaryPassword?: string): PlatformActivationDetails;
  setTenantAccountActive(tenantId: string, active: boolean): PlatformTenantAccount;
  listTenantUsers(tenantId: string): PlatformTenantUser[];
  createTenantUser(tenantId: string, input: PlatformTenantUserInput): PlatformTenantUserProvisioningResult;
  updateTenantUser(id: string, input: PlatformTenantUserInput): PlatformTenantUser;
  setTenantUserActive(id: string, active: boolean): PlatformTenantUser;
  deleteTenantUser(id: string): void;
  resendTenantUserInvite(id: string): PlatformTenantUserProvisioningResult;
  markTenantUserProvisioned(id: string, identityUserId?: string): PlatformTenantUser;
  listTenantOverrides(tenantId: string): PlatformTenantOverride[];
  addTenantOverride(tenantId: string, input: PlatformTenantOverrideInput): PlatformTenantOverride;
  setTenantOverrideEnabled(id: string, enabled: boolean): PlatformTenantOverride;
  removeTenantOverride(id: string): void;
  sendTenantActivation(tenantId: string): PlatformActivationDetails;
}

export function createTenantApi(): TenantApi {
  return {
    // Tenant Management - Delegate to PlatformTenantService
    listTenants(search = '', status = '', planId = '') {
      return platformTenantService.listTenants(search, status, planId);
    },

    getTenant(id: string) {
      return platformTenantService.getTenant(id);
    },

    createTenant(input: PlatformTenantInput) {
      return platformTenantService.createTenant(input);
    },

    updateTenant(id: string, input: PlatformTenantInput) {
      return platformTenantService.updateTenant(id, input);
    },

    setTenantStatus(id: string, status: PlatformTenantStatus) {
      platformTenantService.setTenantStatus(id, status);
    },

    archiveTenant(id: string) {
      platformTenantService.archiveTenant(id);
    },

    getTenantProfile(id: string) {
      return platformTenantService.getTenantProfile(id);
    },

    getTenantAccount(tenantId: string) {
      return platformTenantService.getTenantAccount(tenantId);
    },

    createTenantAccount(tenantId: string, input: PlatformTenantAccountInput) {
      return platformTenantService.createTenantAccount(tenantId, input);
    },

    resetTenantAccountPassword(tenantId: string, temporaryPassword?: string) {
      return platformTenantService.resetTenantAccountPassword(tenantId, temporaryPassword);
    },

    setTenantAccountActive(tenantId: string, active: boolean) {
      return platformTenantService.setTenantAccountActive(tenantId, active);
    },

    listTenantUsers(tenantId: string) {
      return platformTenantService.listTenantUsers(tenantId);
    },

    createTenantUser(tenantId: string, input: PlatformTenantUserInput) {
      return platformTenantService.createTenantUser(tenantId, input);
    },

    updateTenantUser(id: string, input: PlatformTenantUserInput) {
      return platformTenantService.updateTenantUser(id, input);
    },

    setTenantUserActive(id: string, active: boolean) {
      return platformTenantService.setTenantUserActive(id, active);
    },

    deleteTenantUser(id: string) {
      platformTenantService.deleteTenantUser(id);
    },

    resendTenantUserInvite(id: string) {
      return platformTenantService.resendTenantUserInvite(id);
    },

    markTenantUserProvisioned(id: string, identityUserId?: string) {
      return platformTenantService.markTenantUserProvisioned(id, identityUserId);
    },

    listTenantOverrides(tenantId: string) {
      return platformTenantService.listTenantOverrides(tenantId);
    },

    addTenantOverride(tenantId: string, input: PlatformTenantOverrideInput) {
      return platformTenantService.addTenantOverride(tenantId, input);
    },

    setTenantOverrideEnabled(id: string, enabled: boolean) {
      return platformTenantService.setTenantOverrideEnabled(id, enabled);
    },

    removeTenantOverride(id: string) {
      platformTenantService.removeTenantOverride(id);
    },

    sendTenantActivation(tenantId: string) {
      return platformTenantService.resetTenantAccountPassword(tenantId);
    },
  };
}
