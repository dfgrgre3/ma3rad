// Tenant experience endpoints: branding, UI customization, app configuration
// rollouts and per-tenant activity settings.
import type { PlatformAdminApiCore } from './core';
import { CentralApiError } from './core';
import type {
  CentralPlatformBrandingRow,
  CentralTenantBrandingRow,
  CentralVersionSummaryRow,
  CentralUiProfileRow,
  CentralTenantUiRow,
  CentralConfigTemplateRow,
  CentralConfigRolloutRow,
  CentralConfigAckRow,
  CentralTenantConfigRow,
  CentralTenantActivityRow,
} from './centralTypes';

export interface TenantExperienceApi {
  // ── Tenant Branding ─────────────────────────────────────────────────────
  getPlatformBranding(this: PlatformAdminApiCore): Promise<CentralPlatformBrandingRow | null>;
  getTenantBranding(this: PlatformAdminApiCore, tenantId: string): Promise<CentralTenantBrandingRow | null>;
  saveTenantBranding(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>): Promise<CentralTenantBrandingRow>;
  listTenantBrandingVersions(this: PlatformAdminApiCore, tenantId: string): Promise<CentralVersionSummaryRow[]>;
  rollbackTenantBranding(this: PlatformAdminApiCore, tenantId: string, version: number): Promise<CentralTenantBrandingRow>;
  // ── Tenant UI Customization ─────────────────────────────────────────────
  // NOTE: list methods stay `any[]` — pages feed results straight into
  // PlatformUiProfile[]/PlatformConfigTemplate[]/PlatformConfigRollout[] state.
  listUiProfiles(this: PlatformAdminApiCore): Promise<any[]>;
  getTenantUiCustomization(this: PlatformAdminApiCore, tenantId: string): Promise<CentralTenantUiRow | null>;
  saveTenantUiCustomization(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>): Promise<CentralTenantUiRow>;
  listTenantUiVersions(this: PlatformAdminApiCore, tenantId: string): Promise<CentralVersionSummaryRow[]>;
  rollbackTenantUi(this: PlatformAdminApiCore, tenantId: string, version: number): Promise<CentralTenantUiRow>;
  // ── Tenant App Configuration ────────────────────────────────────────────
  listConfigTemplates(this: PlatformAdminApiCore): Promise<any[]>;
  listConfigRollouts(this: PlatformAdminApiCore): Promise<any[]>;
  createConfigRollout(this: PlatformAdminApiCore, input: { templateId: string; targetTenants?: string[] }): Promise<CentralConfigRolloutRow>;
  startConfigRollout(this: PlatformAdminApiCore, id: string): Promise<CentralConfigRolloutRow>;
  listConfigAcks(this: PlatformAdminApiCore, rolloutId: string): Promise<CentralConfigAckRow[]>;
  getTenantConfig(this: PlatformAdminApiCore, tenantId: string): Promise<CentralTenantConfigRow | null>;
  saveTenantConfig(this: PlatformAdminApiCore, tenantId: string, input: { templateId?: string; configPayload?: any }): Promise<CentralTenantConfigRow>;
  listTenantConfigVersions(this: PlatformAdminApiCore, tenantId: string): Promise<CentralVersionSummaryRow[]>;
  rollbackTenantConfig(this: PlatformAdminApiCore, tenantId: string, version: number): Promise<CentralTenantConfigRow>;
  // ── Tenant Activity Settings ────────────────────────────────────────────
  getTenantActivity(this: PlatformAdminApiCore, tenantId: string): Promise<CentralTenantActivityRow | null>;
  saveTenantActivity(this: PlatformAdminApiCore, tenantId: string, input: { activityId: string; enabledModules?: any; customTerminology?: any }): Promise<CentralTenantActivityRow>;
  listTenantActivityVersions(this: PlatformAdminApiCore, tenantId: string): Promise<CentralVersionSummaryRow[]>;
  rollbackTenantActivity(this: PlatformAdminApiCore, tenantId: string, version: number): Promise<CentralTenantActivityRow>;
}

export function createTenantExperienceApi(): TenantExperienceApi {
  return {
    // ── Tenant Branding ─────────────────────────────────────────────────────
    async getPlatformBranding(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralPlatformBrandingRow | null>({ path: '/api/v1/admin/branding/platform', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async getTenantBranding(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<CentralTenantBrandingRow | null>({
        path: `/api/v1/admin/branding/tenant/${encodeURIComponent(tenantId)}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async saveTenantBranding(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>) {
      const envelope = await this.requestEnvelope<CentralTenantBrandingRow>({
        path: `/api/v1/admin/branding/tenant/${encodeURIComponent(tenantId)}`,
        method: 'PUT',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralTenantBrandingRow;
    },

    async listTenantBrandingVersions(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<CentralVersionSummaryRow[]>({
        path: `/api/v1/admin/branding/tenant/${encodeURIComponent(tenantId)}/versions`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async rollbackTenantBranding(this: PlatformAdminApiCore, tenantId: string, version: number) {
      const envelope = await this.requestEnvelope<CentralTenantBrandingRow>({
        path: `/api/v1/admin/branding/tenant/${encodeURIComponent(tenantId)}/rollback/${version}`,
        method: 'POST',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralTenantBrandingRow;
    },

    // ── Tenant UI Customization ─────────────────────────────────────────────
    async listUiProfiles(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralUiProfileRow[]>({ path: '/api/v1/admin/customization/ui-profiles', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async getTenantUiCustomization(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<CentralTenantUiRow | null>({
        path: `/api/v1/admin/customization/tenant/${encodeURIComponent(tenantId)}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async saveTenantUiCustomization(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>) {
      const envelope = await this.requestEnvelope<CentralTenantUiRow>({
        path: `/api/v1/admin/customization/tenant/${encodeURIComponent(tenantId)}`,
        method: 'PUT',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralTenantUiRow;
    },

    async listTenantUiVersions(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<CentralVersionSummaryRow[]>({
        path: `/api/v1/admin/customization/tenant/${encodeURIComponent(tenantId)}/versions`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async rollbackTenantUi(this: PlatformAdminApiCore, tenantId: string, version: number) {
      const envelope = await this.requestEnvelope<CentralTenantUiRow>({
        path: `/api/v1/admin/customization/tenant/${encodeURIComponent(tenantId)}/rollback/${version}`,
        method: 'POST',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralTenantUiRow;
    },

    // ── Tenant App Configuration ────────────────────────────────────────────
    async listConfigTemplates(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralConfigTemplateRow[]>({ path: '/api/v1/admin/app-config/templates', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async listConfigRollouts(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralConfigRolloutRow[]>({ path: '/api/v1/admin/app-config/rollouts', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async createConfigRollout(this: PlatformAdminApiCore, input: { templateId: string; targetTenants?: string[] }) {
      const envelope = await this.requestEnvelope<CentralConfigRolloutRow>({
        path: '/api/v1/admin/app-config/rollouts',
        method: 'POST',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralConfigRolloutRow;
    },

    async startConfigRollout(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<CentralConfigRolloutRow>({
        path: `/api/v1/admin/app-config/rollouts/${encodeURIComponent(id)}/start`,
        method: 'POST',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralConfigRolloutRow;
    },

    async listConfigAcks(this: PlatformAdminApiCore, rolloutId: string) {
      const envelope = await this.requestEnvelope<CentralConfigAckRow[]>({
        path: `/api/v1/admin/app-config/rollouts/${encodeURIComponent(rolloutId)}/acks`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async getTenantConfig(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<CentralTenantConfigRow | null>({
        path: `/api/v1/admin/app-config/tenant/${encodeURIComponent(tenantId)}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async saveTenantConfig(this: PlatformAdminApiCore, tenantId: string, input: { templateId?: string; configPayload?: any }) {
      const envelope = await this.requestEnvelope<CentralTenantConfigRow>({
        path: `/api/v1/admin/app-config/tenant/${encodeURIComponent(tenantId)}`,
        method: 'PUT',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralTenantConfigRow;
    },

    async listTenantConfigVersions(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<CentralVersionSummaryRow[]>({
        path: `/api/v1/admin/app-config/tenant/${encodeURIComponent(tenantId)}/versions`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async rollbackTenantConfig(this: PlatformAdminApiCore, tenantId: string, version: number) {
      const envelope = await this.requestEnvelope<CentralTenantConfigRow>({
        path: `/api/v1/admin/app-config/tenant/${encodeURIComponent(tenantId)}/rollback/${version}`,
        method: 'POST',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralTenantConfigRow;
    },

    // ── Tenant Activity Settings ────────────────────────────────────────────
    async getTenantActivity(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<CentralTenantActivityRow | null>({
        path: `/api/v1/admin/activity/tenant/${encodeURIComponent(tenantId)}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async saveTenantActivity(this: PlatformAdminApiCore, tenantId: string, input: { activityId: string; enabledModules?: any; customTerminology?: any }) {
      const envelope = await this.requestEnvelope<CentralTenantActivityRow>({
        path: `/api/v1/admin/activity/tenant/${encodeURIComponent(tenantId)}`,
        method: 'PUT',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralTenantActivityRow;
    },

    async listTenantActivityVersions(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<CentralVersionSummaryRow[]>({
        path: `/api/v1/admin/activity/tenant/${encodeURIComponent(tenantId)}/versions`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async rollbackTenantActivity(this: PlatformAdminApiCore, tenantId: string, version: number) {
      const envelope = await this.requestEnvelope<CentralTenantActivityRow>({
        path: `/api/v1/admin/activity/tenant/${encodeURIComponent(tenantId)}/rollback/${version}`,
        method: 'POST',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralTenantActivityRow;
    },
  };
}
