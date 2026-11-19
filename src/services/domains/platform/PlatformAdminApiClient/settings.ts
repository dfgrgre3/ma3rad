// Platform settings, policies, product modules, feature flags,
// tenant feature-permission overrides, overview and analytics endpoints.
import type { PlatformAdminApiCore, TenantFeaturePermissions } from './core';
import { CentralApiError } from './core';

export interface SettingsApi {
  // Tenant-scoped feature permission overrides (central persistence).
  getFeaturePermissions(this: PlatformAdminApiCore, scope: { tenantId: string | null; planId: string | null }): Promise<TenantFeaturePermissions>;
  setFeaturePermissions(this: PlatformAdminApiCore, input: {
    tenantId?: string | null;
    planId?: string | null;
    hiddenMenus?: string[];
    disabledPermissions?: string[];
    featurePermissions?: Array<Record<string, unknown>>;
  }): Promise<void>;
  getOverview(this: PlatformAdminApiCore): Promise<any>;
  getSettings(this: PlatformAdminApiCore): Promise<Record<string, string>>;
  updateSettings(this: PlatformAdminApiCore, settings: Record<string, string>): Promise<any>;
  getPlatformPolicies(this: PlatformAdminApiCore): Promise<{ terms: string; privacy: string; retention: any; updatedAt: string }>;
  savePlatformPolicies(this: PlatformAdminApiCore, input: { terms?: string; privacy?: string; retention?: any }): Promise<any>;
  listModules(this: PlatformAdminApiCore): Promise<any[]>;
  createModule(this: PlatformAdminApiCore, input: { code: string; name: string; description?: string; category?: string; isActive?: boolean; sortOrder?: number }): Promise<any>;
  updateModule(this: PlatformAdminApiCore, id: string, input: { name?: string; description?: string; category?: string; isActive?: boolean; sortOrder?: number }): Promise<any>;
  listFeatureFlags(this: PlatformAdminApiCore): Promise<any[]>;
  createFeatureFlag(this: PlatformAdminApiCore, input: { key: string; name: string; description?: string; isEnabled?: boolean; rolloutPercentage?: number; targetTenants?: string[]; pagePaths?: string[] }): Promise<any>;
  updateFeatureFlag(this: PlatformAdminApiCore, id: string, input: { name?: string; description?: string; isEnabled?: boolean; rolloutPercentage?: number; targetTenants?: string[]; pagePaths?: string[] }): Promise<any>;
  deleteFeatureFlag(this: PlatformAdminApiCore, id: string): Promise<any>;
  getBusinessPerformance(this: PlatformAdminApiCore, period?: string): Promise<any>;
  getCustomerMetrics(this: PlatformAdminApiCore, period?: string): Promise<any>;
  getLicenseMetrics(this: PlatformAdminApiCore): Promise<any>;
  getSubscriptionMetrics(this: PlatformAdminApiCore): Promise<any>;
  getOperationsMetrics(this: PlatformAdminApiCore): Promise<any>;
}

export function createSettingsApi(): SettingsApi {
  return {
    // Tenant-scoped feature permission overrides (central persistence).
    async getFeaturePermissions(this: PlatformAdminApiCore, scope: { tenantId: string | null; planId: string | null }) {
      const params = new URLSearchParams();
      if (scope.tenantId) params.set('tenantId', scope.tenantId);
      if (scope.planId) params.set('planId', scope.planId);
      const qs = params.toString();
      const envelope = await this.requestEnvelope<TenantFeaturePermissions>({
        path: `/api/v1/admin/config/feature-permissions${qs ? `?${qs}` : ''}`,
        method: 'GET',
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      const data = (envelope.data as TenantFeaturePermissions) || { hiddenMenus: [], disabledPermissions: [], featurePermissions: [] };
      return {
        hiddenMenus: Array.isArray(data.hiddenMenus) ? data.hiddenMenus.map(String) : [],
        disabledPermissions: Array.isArray(data.disabledPermissions) ? data.disabledPermissions.map(String) : [],
        featurePermissions: Array.isArray(data.featurePermissions) ? data.featurePermissions : [],
      };
    },

    async setFeaturePermissions(this: PlatformAdminApiCore, input: {
      tenantId?: string | null;
      planId?: string | null;
      hiddenMenus?: string[];
      disabledPermissions?: string[];
      featurePermissions?: Array<Record<string, unknown>>;
    }) {
      const envelope = await this.requestEnvelope<{ ok: boolean }>({
        path: '/api/v1/admin/config/feature-permissions',
        method: 'PUT',
        body: {
          tenantId: input.tenantId ?? null,
          planId: input.planId ?? null,
          hiddenMenus: input.hiddenMenus ?? [],
          disabledPermissions: input.disabledPermissions ?? [],
          featurePermissions: input.featurePermissions ?? [],
        },
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
    },

    // ── Dashboard Overview ──────────────────────────────────────────────────
    async getOverview(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/overview', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    // ── Platform Settings ───────────────────────────────────────────────────
    async getSettings(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<Record<string, string>>({ path: '/api/v1/admin/settings', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data || {};
    },

    async updateSettings(this: PlatformAdminApiCore, settings: Record<string, string>) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/settings', method: 'PUT', body: settings });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    // ── Platform Policies (stored in platform_settings) ─────────────────────
    async getPlatformPolicies(this: PlatformAdminApiCore) {
      const settings = await this.getSettings();
      let retention: any = {};
      try {
        retention = settings['policy.retention'] ? JSON.parse(settings['policy.retention']) : {};
      } catch { /* keep defaults */ }
      return {
        terms: settings['policy.terms'] || '',
        privacy: settings['policy.privacy'] || '',
        retention,
        updatedAt: settings['policy.updated_at'] || '',
      };
    },

    async savePlatformPolicies(this: PlatformAdminApiCore, input: { terms?: string; privacy?: string; retention?: any }) {
      const updates: Record<string, string> = {};
      const now = new Date().toISOString();
      if (input.terms !== undefined) updates['policy.terms'] = input.terms;
      if (input.privacy !== undefined) updates['policy.privacy'] = input.privacy;
      if (input.retention !== undefined) {
        const current = await this.getPlatformPolicies();
        updates['policy.retention'] = JSON.stringify({ ...current.retention, ...input.retention });
      }
      updates['policy.updated_at'] = now;
      return this.updateSettings(updates);
    },

    // ── Product Modules & Feature Flags ─────────────────────────────────────
    async listModules(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/modules', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async createModule(this: PlatformAdminApiCore, input: { code: string; name: string; description?: string; category?: string; isActive?: boolean; sortOrder?: number }) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/modules', method: 'POST', body: input });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async updateModule(this: PlatformAdminApiCore, id: string, input: { name?: string; description?: string; category?: string; isActive?: boolean; sortOrder?: number }) {
      const envelope = await this.requestEnvelope<any>({ path: `/api/v1/admin/modules/${encodeURIComponent(id)}`, method: 'PUT', body: input });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async listFeatureFlags(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/feature-flags', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async createFeatureFlag(this: PlatformAdminApiCore, input: { key: string; name: string; description?: string; isEnabled?: boolean; rolloutPercentage?: number; targetTenants?: string[]; pagePaths?: string[] }) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/feature-flags', method: 'POST', body: input });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async updateFeatureFlag(this: PlatformAdminApiCore, id: string, input: { name?: string; description?: string; isEnabled?: boolean; rolloutPercentage?: number; targetTenants?: string[]; pagePaths?: string[] }) {
      const envelope = await this.requestEnvelope<any>({ path: `/api/v1/admin/feature-flags/${encodeURIComponent(id)}`, method: 'PUT', body: input });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async deleteFeatureFlag(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/feature-flags/${encodeURIComponent(id)}`,
        method: 'DELETE',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    // ── Complex Analytics ───────────────────────────────────────────────────
    async getBusinessPerformance(this: PlatformAdminApiCore, period: string = '30d') {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/analytics/business-performance?period=${period}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async getCustomerMetrics(this: PlatformAdminApiCore, period: string = '30d') {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/analytics/customer-metrics?period=${period}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async getLicenseMetrics(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/analytics/license-metrics', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async getSubscriptionMetrics(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/analytics/subscription-metrics', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async getOperationsMetrics(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/analytics/operations-metrics', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },
  };
}
