// Platform settings, policies, product modules, feature flags,
// tenant feature-permission overrides, overview and analytics endpoints.
import type { PlatformAdminApiCore, TenantFeaturePermissions, EffectiveTenantFeaturePermissions, TenantPermissionLimit } from './core';
import { CentralApiError } from './core';
import type { PlatformFeatureOverride } from '../platformTypes';

/** Map a central feature-override row (camelCase per contract; snake_case tolerated) to the UI type. */
function mapFeatureOverride(row: any): PlatformFeatureOverride {
  return {
    id: String(row.id ?? ''),
    featureId: String(row.featureId ?? row.feature_id ?? ''),
    targetType: String(row.targetType ?? row.target_type ?? 'TENANT') as PlatformFeatureOverride['targetType'],
    targetId: String(row.targetId ?? row.target_id ?? ''),
    targetName: row.targetName ?? row.target_name ?? null,
    isEnabled: Boolean(row.isEnabled ?? row.is_enabled),
    customRolloutPercent: row.customRolloutPercent ?? row.custom_rollout_percent ?? null,
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ''),
  };
}

export interface SettingsApi {
  // Tenant-scoped feature permission overrides (central persistence).
  getFeaturePermissions(this: PlatformAdminApiCore, scope: { tenantId: string | null; planId: string | null }): Promise<TenantFeaturePermissions>;
  /** Layer-merged effective config for a tenant + its own stored row. */
  getEffectiveFeaturePermissions(this: PlatformAdminApiCore, tenantId: string): Promise<EffectiveTenantFeaturePermissions>;
  getPermissionLimits(this: PlatformAdminApiCore, tenantId: string): Promise<TenantPermissionLimit[]>;
  setPermissionLimits(this: PlatformAdminApiCore, tenantId: string, limits: Array<Record<string, unknown>>): Promise<{ ok: boolean; count: number }>;
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
  listFeatureFlagOverrides(this: PlatformAdminApiCore, featureId: string): Promise<PlatformFeatureOverride[]>;
  upsertFeatureFlagOverride(this: PlatformAdminApiCore, featureId: string, input: { targetType: PlatformFeatureOverride['targetType']; targetId: string; isEnabled: boolean; customRolloutPercent?: number | null }): Promise<PlatformFeatureOverride>;
  deleteFeatureFlagOverride(this: PlatformAdminApiCore, featureId: string, overrideId: string): Promise<{ deleted: boolean }>;
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

    async getEffectiveFeaturePermissions(this: PlatformAdminApiCore, tenantId: string) {
      const envelope = await this.requestEnvelope<EffectiveTenantFeaturePermissions>({
        path: `/api/v1/admin/config/feature-permissions?forTenant=${encodeURIComponent(tenantId)}`,
        method: 'GET',
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      const data = (envelope.data as EffectiveTenantFeaturePermissions) || { effective: {}, tenant: {} };
      const normalizeScope = (value: any): TenantFeaturePermissions => ({
        hiddenMenus: Array.isArray(value?.hiddenMenus) ? value.hiddenMenus.map(String) : [],
        disabledPermissions: Array.isArray(value?.disabledPermissions) ? value.disabledPermissions.map(String) : [],
        featurePermissions: Array.isArray(value?.featurePermissions) ? value.featurePermissions : [],
      });
      return { effective: normalizeScope(data.effective), tenant: normalizeScope(data.tenant) };
    },

    async getPermissionLimits(this: PlatformAdminApiCore, tenantId: string) {
      const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
      const envelope = await this.requestEnvelope<TenantPermissionLimit[]>({
        path: `/api/v1/admin/config/permission-limits${qs}`,
        method: 'GET',
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      const rows = Array.isArray(envelope.data) ? envelope.data : [];
      return rows.map((row: any) => ({
        permissionCode: String(row.permissionCode ?? row.permission_code ?? ''),
        maxAmount: row.maxAmount ?? row.max_amount ?? null,
        costVisible: row.costVisible ?? row.cost_visible ?? null,
        profitVisible: row.profitVisible ?? row.profit_visible ?? null,
        disabled: row.disabled ?? 0,
        updatedAt: row.updatedAt ?? row.updated_at ?? undefined,
      }));
    },

    async setPermissionLimits(this: PlatformAdminApiCore, tenantId: string, limits: Array<Record<string, unknown>>) {
      const envelope = await this.requestEnvelope<{ ok: boolean; count: number }>({
        path: '/api/v1/admin/config/permission-limits',
        method: 'PUT',
        body: { tenantId: tenantId || '', limits },
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return (envelope.data as { ok: boolean; count: number }) ?? { ok: true, count: limits.length };
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

    // ── Feature-flag per-target overrides ───────────────────────────────────

    async listFeatureFlagOverrides(this: PlatformAdminApiCore, featureId: string) {
      const envelope = await this.requestEnvelope<any[]>({
        path: `/api/v1/admin/feature-flags/${encodeURIComponent(featureId)}/overrides`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return (Array.isArray(envelope.data) ? envelope.data : []).map(mapFeatureOverride);
    },

    async upsertFeatureFlagOverride(this: PlatformAdminApiCore, featureId: string, input: { targetType: PlatformFeatureOverride['targetType']; targetId: string; isEnabled: boolean; customRolloutPercent?: number | null }) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/feature-flags/${encodeURIComponent(featureId)}/overrides`,
        method: 'POST',
        body: {
          targetType: input.targetType,
          targetId: input.targetId,
          isEnabled: input.isEnabled,
          customRolloutPercent: input.customRolloutPercent ?? null,
        },
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return mapFeatureOverride(envelope.data ?? {});
    },

    async deleteFeatureFlagOverride(this: PlatformAdminApiCore, featureId: string, overrideId: string) {
      const envelope = await this.requestEnvelope<{ deleted?: boolean }>({
        path: `/api/v1/admin/feature-flags/${encodeURIComponent(featureId)}/overrides/${encodeURIComponent(overrideId)}`,
        method: 'DELETE',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return { deleted: Boolean(envelope.data?.deleted ?? true) };
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
