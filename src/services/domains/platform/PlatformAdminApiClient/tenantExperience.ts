// Tenant experience endpoints: branding, UI customization, app configuration
// rollouts and per-tenant activity settings.
import type { PlatformAdminApiCore } from './core';
import { CentralApiError } from './core';

export interface TenantExperienceApi {
  // ── Tenant Branding ─────────────────────────────────────────────────────
  getPlatformBranding(this: PlatformAdminApiCore): Promise<any>;
  getTenantBranding(this: PlatformAdminApiCore, tenantId: string): Promise<any>;
  saveTenantBranding(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>): Promise<any>;
  listTenantBrandingVersions(this: PlatformAdminApiCore, tenantId: string): Promise<any[]>;
  rollbackTenantBranding(this: PlatformAdminApiCore, tenantId: string, version: number): Promise<any>;
  // ── Tenant UI Customization ─────────────────────────────────────────────
  listUiProfiles(this: PlatformAdminApiCore): Promise<any[]>;
  getTenantUiCustomization(this: PlatformAdminApiCore, tenantId: string): Promise<any>;
  saveTenantUiCustomization(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>): Promise<any>;
  listTenantUiVersions(this: PlatformAdminApiCore, tenantId: string): Promise<any[]>;
  rollbackTenantUi(this: PlatformAdminApiCore, tenantId: string, version: number): Promise<any>;
  // ── Tenant App Configuration ────────────────────────────────────────────
  listConfigTemplates(this: PlatformAdminApiCore): Promise<any[]>;
  listConfigRollouts(this: PlatformAdminApiCore): Promise<any[]>;
  createConfigRollout(this: PlatformAdminApiCore, input: { templateId: string; targetTenants?: string[] }): Promise<any>;
  startConfigRollout(this: PlatformAdminApiCore, id: string): Promise<any>;
  listConfigAcks(this: PlatformAdminApiCore, rolloutId: string): Promise<any[]>;
  getTenantConfig(this: PlatformAdminApiCore, tenantId: string): Promise<any>;
  saveTenantConfig(this: PlatformAdminApiCore, tenantId: string, input: { templateId?: string; configPayload?: any }): Promise<any>;
  listTenantConfigVersions(this: PlatformAdminApiCore, tenantId: string): Promise<any[]>;
  rollbackTenantConfig(this: PlatformAdminApiCore, tenantId: string, version: number): Promise<any>;
  // ── Tenant Activity Settings ────────────────────────────────────────────
  getTenantActivity(this: PlatformAdminApiCore, tenantId: string): Promise<any>;
  saveTenantActivity(this: PlatformAdminApiCore, tenantId: string, input: { activityId: string; enabledModules?: any; customTerminology?: any }): Promise<any>;
  listTenantActivityVersions(this: PlatformAdminApiCore, tenantId: string): Promise<any[]>;
  rollbackTenantActivity(this: PlatformAdminApiCore, tenantId: string, version: number): Promise<any>;
}

export function createTenantExperienceApi(): TenantExperienceApi {
  return {
    // ── Tenant Branding ─────────────────────────────────────────────────────
    async getPlatformBranding(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/branding/platform', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async getTenantBranding(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/branding/tenant/${encodeURIComponent(tenantId)}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async saveTenantBranding(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/branding/tenant/${encodeURIComponent(tenantId)}`,
        method: 'PUT',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async listTenantBrandingVersions(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<any[]>({
        path: `/api/v1/admin/branding/tenant/${encodeURIComponent(tenantId)}/versions`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async rollbackTenantBranding(this: PlatformAdminApiCore, tenantId: string, version: number) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/branding/tenant/${encodeURIComponent(tenantId)}/rollback/${version}`,
        method: 'POST',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    // ── Tenant UI Customization ─────────────────────────────────────────────
    async listUiProfiles(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/customization/ui-profiles', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async getTenantUiCustomization(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/customization/tenant/${encodeURIComponent(tenantId)}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async saveTenantUiCustomization(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/customization/tenant/${encodeURIComponent(tenantId)}`,
        method: 'PUT',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async listTenantUiVersions(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<any[]>({
        path: `/api/v1/admin/customization/tenant/${encodeURIComponent(tenantId)}/versions`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async rollbackTenantUi(this: PlatformAdminApiCore, tenantId: string, version: number) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/customization/tenant/${encodeURIComponent(tenantId)}/rollback/${version}`,
        method: 'POST',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    // ── Tenant App Configuration ────────────────────────────────────────────
    async listConfigTemplates(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/app-config/templates', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async listConfigRollouts(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/app-config/rollouts', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async createConfigRollout(this: PlatformAdminApiCore, input: { templateId: string; targetTenants?: string[] }) {
      const envelope = await this.requestEnvelope<any>({
        path: '/api/v1/admin/app-config/rollouts',
        method: 'POST',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async startConfigRollout(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/app-config/rollouts/${encodeURIComponent(id)}/start`,
        method: 'POST',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async listConfigAcks(this: PlatformAdminApiCore, rolloutId: string) {
      const envelope = await this.requestEnvelope<any[]>({
        path: `/api/v1/admin/app-config/rollouts/${encodeURIComponent(rolloutId)}/acks`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async getTenantConfig(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/app-config/tenant/${encodeURIComponent(tenantId)}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async saveTenantConfig(this: PlatformAdminApiCore, tenantId: string, input: { templateId?: string; configPayload?: any }) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/app-config/tenant/${encodeURIComponent(tenantId)}`,
        method: 'PUT',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async listTenantConfigVersions(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<any[]>({
        path: `/api/v1/admin/app-config/tenant/${encodeURIComponent(tenantId)}/versions`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async rollbackTenantConfig(this: PlatformAdminApiCore, tenantId: string, version: number) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/app-config/tenant/${encodeURIComponent(tenantId)}/rollback/${version}`,
        method: 'POST',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    // ── Tenant Activity Settings ────────────────────────────────────────────
    async getTenantActivity(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/activity/tenant/${encodeURIComponent(tenantId)}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async saveTenantActivity(this: PlatformAdminApiCore, tenantId: string, input: { activityId: string; enabledModules?: any; customTerminology?: any }) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/activity/tenant/${encodeURIComponent(tenantId)}`,
        method: 'PUT',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async listTenantActivityVersions(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<any[]>({
        path: `/api/v1/admin/activity/tenant/${encodeURIComponent(tenantId)}/versions`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async rollbackTenantActivity(this: PlatformAdminApiCore, tenantId: string, version: number) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/activity/tenant/${encodeURIComponent(tenantId)}/rollback/${version}`,
        method: 'POST',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },
  };
}
