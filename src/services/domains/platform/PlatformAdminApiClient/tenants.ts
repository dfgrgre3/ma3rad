// Tenant-scoped endpoints: tenant CRUD, accounts, directory users, overrides,
// payments, remote control and branches.
import type { PlatformAdminApiCore } from './core';
import type { PlatformTenant, PlatformTenantInput } from '../platformTypes';

export interface TenantApi {
  listTenants(this: PlatformAdminApiCore, search?: string, status?: string, planId?: string): Promise<PlatformTenant[]>;
  createTenant(this: PlatformAdminApiCore, input: PlatformTenantInput): Promise<PlatformTenant>;
  updateTenant(this: PlatformAdminApiCore, id: string, payload: Record<string, any>): Promise<any>;
  setTenantStatus(this: PlatformAdminApiCore, id: string, status: string): Promise<any>;
  archiveTenant(this: PlatformAdminApiCore, id: string): Promise<any>;
  getTenantProfile(this: PlatformAdminApiCore, id: string): Promise<any>;
  createTenantAccount(
    this: PlatformAdminApiCore,
    id: string,
    input?: { username?: string; email?: string; fullName?: string; password?: string }
  ): Promise<{ account: any; temporaryPassword: string; activationCode: string }>;
  resetTenantAccountPassword(this: PlatformAdminApiCore, id: string): Promise<{ temporaryPassword: string }>;
  setTenantAccountActive(this: PlatformAdminApiCore, id: string, isActive: boolean): Promise<any>;
  listTenantUsers(this: PlatformAdminApiCore, tenantId: string): Promise<any[]>;
  createTenantUser(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>): Promise<any>;
  updateTenantUser(this: PlatformAdminApiCore, tenantId: string, userId: string, input: Record<string, any>): Promise<any>;
  deleteTenantUser(this: PlatformAdminApiCore, tenantId: string, userId: string): Promise<any>;
  setTenantUserActive(this: PlatformAdminApiCore, tenantId: string, userId: string, isActive: boolean): Promise<any>;
  resendTenantUserInvite(this: PlatformAdminApiCore, tenantId: string, userId: string): Promise<any>;
  listTenantOverrides(this: PlatformAdminApiCore, tenantId: string): Promise<any[]>;
  addTenantOverride(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>): Promise<any>;
  removeTenantOverride(this: PlatformAdminApiCore, tenantId: string, overrideId: string): Promise<any>;
  recordTenantPayment(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>): Promise<any>;
  getTenantRemoteControl(this: PlatformAdminApiCore, tenantId: string): Promise<any>;
  pushTenantConfig(this: PlatformAdminApiCore, tenantId: string, input: { key: string; value: any; scope?: string; targetDeviceIds?: string[] }): Promise<any>;
  forceTenantSync(this: PlatformAdminApiCore, tenantId: string): Promise<any>;
  listTenantBranches(this: PlatformAdminApiCore, tenantId: string): Promise<any[]>;
  createTenantBranch(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>): Promise<any>;
  updateTenantBranch(this: PlatformAdminApiCore, tenantId: string, branchId: string, input: Record<string, any>): Promise<any>;
  closeTenantBranch(this: PlatformAdminApiCore, tenantId: string, branchId: string): Promise<any>;
}

export function createTenantApi(): TenantApi {
  return {
    // Tenants
    async listTenants(this: PlatformAdminApiCore, search = '', status = '', planId = '') {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (status) params.status = status;
      if (planId) params.planId = planId;
      const q = new URLSearchParams(params).toString();
      const queryPart = q ? `?${q}` : '';
      return this.request<PlatformTenant[]>({ path: `/api/v1/admin/tenants${queryPart}`, method: 'GET' });
    },

    async createTenant(this: PlatformAdminApiCore, input: PlatformTenantInput) {
      return this.request<PlatformTenant>({
        path: '/api/v1/admin/tenants',
        method: 'POST',
        body: input,
      });
    },

    async updateTenant(this: PlatformAdminApiCore, id: string, payload: Record<string, any>) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}`,
        method: 'PUT',
        body: payload,
      });
    },

    async setTenantStatus(this: PlatformAdminApiCore, id: string, status: string) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/status`,
        method: 'POST',
        body: { status },
      });
    },

    async archiveTenant(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/archive`,
        method: 'POST',
      });
    },

    async getTenantProfile(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/profile`,
        method: 'GET',
      });
    },

    async createTenantAccount(
      this: PlatformAdminApiCore,
      id: string,
      input: { username?: string; email?: string; fullName?: string; password?: string } = {}
    ) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/account`,
        method: 'POST',
        body: input,
      });
    },

    async resetTenantAccountPassword(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/account/reset-password`,
        method: 'POST',
      });
    },

    async setTenantAccountActive(this: PlatformAdminApiCore, id: string, isActive: boolean) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/account/status`,
        method: 'POST',
        body: { isActive },
      });
    },

    // ── Tenant directory users ────────────────────────────────────────────────

    async listTenantUsers(this: PlatformAdminApiCore, tenantId: string) {
      const rows = await this.request<any[]>({ path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    async createTenantUser(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users`,
        method: 'POST',
        body: input,
      });
    },

    async updateTenantUser(this: PlatformAdminApiCore, tenantId: string, userId: string, input: Record<string, any>) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}`,
        method: 'PUT',
        body: input,
      });
    },

    async deleteTenantUser(this: PlatformAdminApiCore, tenantId: string, userId: string) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}`,
        method: 'DELETE',
      });
    },

    async setTenantUserActive(this: PlatformAdminApiCore, tenantId: string, userId: string, isActive: boolean) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}/status`,
        method: 'POST',
        body: { isActive },
      });
    },

    async resendTenantUserInvite(this: PlatformAdminApiCore, tenantId: string, userId: string) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}/resend-invite`,
        method: 'POST',
      });
    },

    // ── Tenant overrides ─────────────────────────────────────────────────────

    async listTenantOverrides(this: PlatformAdminApiCore, tenantId: string) {
      const rows = await this.request<any[]>({ path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/overrides`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    async addTenantOverride(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/overrides`,
        method: 'POST',
        body: input,
      });
    },

    async removeTenantOverride(this: PlatformAdminApiCore, tenantId: string, overrideId: string) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/overrides/${encodeURIComponent(overrideId)}`,
        method: 'DELETE',
      });
    },

    // ── Payments ──────────────────────────────────────────────────────────────

    async recordTenantPayment(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/payments`,
        method: 'POST',
        body: input,
      });
    },

    // ── Remote control ────────────────────────────────────────────────────────

    async getTenantRemoteControl(this: PlatformAdminApiCore, tenantId: string) {
      return this.request<any>({ path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/remote`, method: 'GET' });
    },

    async pushTenantConfig(this: PlatformAdminApiCore, tenantId: string, input: { key: string; value: any; scope?: string; targetDeviceIds?: string[] }) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/remote/config`,
        method: 'POST',
        body: input,
      });
    },

    async forceTenantSync(this: PlatformAdminApiCore, tenantId: string) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/remote/sync`,
        method: 'POST',
      });
    },

    // ── Tenant branches ────────────────────────────────────────────────────────

    async listTenantBranches(this: PlatformAdminApiCore, tenantId: string) {
      const rows = await this.request<any[]>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/branches`,
        method: 'GET',
      });
      return Array.isArray(rows) ? rows : [];
    },

    async createTenantBranch(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/branches`,
        method: 'POST',
        body: input,
      });
    },

    async updateTenantBranch(this: PlatformAdminApiCore, tenantId: string, branchId: string, input: Record<string, any>) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/branches/${encodeURIComponent(branchId)}`,
        method: 'PUT',
        body: input,
      });
    },

    async closeTenantBranch(this: PlatformAdminApiCore, tenantId: string, branchId: string) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/branches/${encodeURIComponent(branchId)}`,
        method: 'DELETE',
      });
    },
  };
}
