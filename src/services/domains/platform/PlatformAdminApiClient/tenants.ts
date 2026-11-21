// Tenant-scoped endpoints: tenant CRUD, accounts, directory users, overrides,
// payments, remote control and branches.
import type { PlatformAdminApiCore } from './core';
import type {
  PlatformTenant,
  PlatformTenantInput,
  PlatformTenantProfile,
  PlatformTenantUser,
  PlatformTenantOverride,
  PlatformPayment,
} from '../platformTypes';
import type {
  CentralTenantBranch,
  CentralRemoteConfigRow,
  CentralTenantRemoteControl,
  CentralTenantAccountCreated,
  CentralTenantUserCreated,
  CentralTenantUserInviteResult,
  CentralTenantUserDirectoryEntry,
  CentralTenantSyncResult,
  CentralTenantArchiveResult,
  CentralMutationResult,
} from './centralTypes';

export interface TenantApi {
  listTenants(this: PlatformAdminApiCore, search?: string, status?: string, planId?: string): Promise<PlatformTenant[]>;
  createTenant(this: PlatformAdminApiCore, input: PlatformTenantInput): Promise<PlatformTenant>;
  updateTenant(this: PlatformAdminApiCore, id: string, payload: Record<string, any>): Promise<PlatformTenant>;
  setTenantStatus(this: PlatformAdminApiCore, id: string, status: string): Promise<PlatformTenant>;
  archiveTenant(this: PlatformAdminApiCore, id: string): Promise<CentralTenantArchiveResult>;
  getTenantProfile(this: PlatformAdminApiCore, id: string): Promise<PlatformTenantProfile>;
  createTenantAccount(
    this: PlatformAdminApiCore,
    id: string,
    input?: { username?: string; email?: string; fullName?: string; password?: string }
  ): Promise<CentralTenantAccountCreated>;
  resetTenantAccountPassword(this: PlatformAdminApiCore, id: string): Promise<{ temporaryPassword: string }>;
  updateTenantAccount(
    this: PlatformAdminApiCore,
    id: string,
    input: { username?: string; email?: string; fullName?: string; password?: string }
  ): Promise<any>;
  setTenantAccountActive(this: PlatformAdminApiCore, id: string, isActive: boolean): Promise<CentralMutationResult>;
  listTenantUsers(this: PlatformAdminApiCore, tenantId: string): Promise<PlatformTenantUser[]>;
  createTenantUser(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>): Promise<CentralTenantUserCreated>;
  updateTenantUser(this: PlatformAdminApiCore, tenantId: string, userId: string, input: Record<string, any>): Promise<PlatformTenantUser>;
  deleteTenantUser(this: PlatformAdminApiCore, tenantId: string, userId: string): Promise<CentralMutationResult>;
  setTenantUserActive(this: PlatformAdminApiCore, tenantId: string, userId: string, isActive: boolean): Promise<PlatformTenantUser>;
  resendTenantUserInvite(this: PlatformAdminApiCore, tenantId: string, userId: string): Promise<CentralTenantUserInviteResult>;
  listAllTenantUsers(this: PlatformAdminApiCore, filters?: { tenantId?: string; provisioningStatus?: string; status?: string; search?: string }): Promise<CentralTenantUserDirectoryEntry[]>;
  listTenantOverrides(this: PlatformAdminApiCore, tenantId: string): Promise<PlatformTenantOverride[]>;
  addTenantOverride(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>): Promise<PlatformTenantOverride>;
  removeTenantOverride(this: PlatformAdminApiCore, tenantId: string, overrideId: string): Promise<CentralMutationResult>;
  recordTenantPayment(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>): Promise<PlatformPayment>;
  getTenantRemoteControl(this: PlatformAdminApiCore, tenantId: string): Promise<CentralTenantRemoteControl>;
  pushTenantConfig(this: PlatformAdminApiCore, tenantId: string, input: { key: string; value: any; scope?: string; targetDeviceIds?: string[] }): Promise<CentralRemoteConfigRow>;
  forceTenantSync(this: PlatformAdminApiCore, tenantId: string): Promise<CentralTenantSyncResult>;
  listTenantBranches(this: PlatformAdminApiCore, tenantId: string): Promise<CentralTenantBranch[]>;
  createTenantBranch(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>): Promise<CentralTenantBranch>;
  updateTenantBranch(this: PlatformAdminApiCore, tenantId: string, branchId: string, input: Record<string, any>): Promise<CentralTenantBranch>;
  closeTenantBranch(this: PlatformAdminApiCore, tenantId: string, branchId: string): Promise<CentralMutationResult>;
  // ── Tenant API keys ─────────────────────────────────────────────────────────
  listTenantApiKeys(this: PlatformAdminApiCore, tenantId: string): Promise<any[]>;
  createTenantApiKey(
    this: PlatformAdminApiCore,
    tenantId: string,
    input: { name: string; scopes?: string[]; expiresInDays?: number | null }
  ): Promise<any>;
  revokeTenantApiKey(this: PlatformAdminApiCore, tenantId: string, keyId: string): Promise<CentralMutationResult>;
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
      return this.request<PlatformTenant>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}`,
        method: 'PUT',
        body: payload,
      });
    },

    async setTenantStatus(this: PlatformAdminApiCore, id: string, status: string) {
      return this.request<PlatformTenant>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/status`,
        method: 'POST',
        body: { status },
      });
    },

    async archiveTenant(this: PlatformAdminApiCore, id: string) {
      return this.request<CentralTenantArchiveResult>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/archive`,
        method: 'POST',
      });
    },

    async getTenantProfile(this: PlatformAdminApiCore, id: string) {
      return this.request<PlatformTenantProfile>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/profile`,
        method: 'GET',
      });
    },

    async createTenantAccount(
      this: PlatformAdminApiCore,
      id: string,
      input: { username?: string; email?: string; fullName?: string; password?: string } = {}
    ) {
      return this.request<CentralTenantAccountCreated>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/account`,
        method: 'POST',
        body: input,
      });
    },

    async resetTenantAccountPassword(this: PlatformAdminApiCore, id: string) {
      return this.request<{ temporaryPassword: string }>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/account/reset-password`,
        method: 'POST',
      });
    },

    async updateTenantAccount(
      this: PlatformAdminApiCore,
      id: string,
      input: { username?: string; email?: string; fullName?: string; password?: string }
    ) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/account`,
        method: 'PUT',
        body: input,
      });
    },

    async setTenantAccountActive(this: PlatformAdminApiCore, id: string, isActive: boolean) {
      return this.request<CentralMutationResult>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/account/status`,
        method: 'POST',
        body: { isActive },
      });
    },

    // ── Tenant directory users ────────────────────────────────────────────────

    async listTenantUsers(this: PlatformAdminApiCore, tenantId: string) {
      const rows = await this.request<PlatformTenantUser[]>({ path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    async createTenantUser(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>) {
      return this.request<CentralTenantUserCreated>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users`,
        method: 'POST',
        body: input,
      });
    },

    async updateTenantUser(this: PlatformAdminApiCore, tenantId: string, userId: string, input: Record<string, any>) {
      return this.request<PlatformTenantUser>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}`,
        method: 'PUT',
        body: input,
      });
    },

    async deleteTenantUser(this: PlatformAdminApiCore, tenantId: string, userId: string) {
      return this.request<CentralMutationResult>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}`,
        method: 'DELETE',
      });
    },

    async setTenantUserActive(this: PlatformAdminApiCore, tenantId: string, userId: string, isActive: boolean) {
      return this.request<PlatformTenantUser>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}/status`,
        method: 'POST',
        body: { isActive },
      });
    },

    async resendTenantUserInvite(this: PlatformAdminApiCore, tenantId: string, userId: string) {
      return this.request<CentralTenantUserInviteResult>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}/resend-invite`,
        method: 'POST',
      });
    },

    async listAllTenantUsers(this: PlatformAdminApiCore, filters: { tenantId?: string; provisioningStatus?: string; status?: string; search?: string } = {}) {
      const params = new URLSearchParams();
      if (filters.tenantId) params.set('tenantId', filters.tenantId);
      if (filters.provisioningStatus) params.set('provisioningStatus', filters.provisioningStatus);
      if (filters.status) params.set('status', filters.status);
      if (filters.search) params.set('search', filters.search);
      const q = params.toString();
      const rows = await this.request<CentralTenantUserDirectoryEntry[]>({
        path: `/api/v1/admin/tenant-users${q ? `?${q}` : ''}`,
        method: 'GET',
      });
      return Array.isArray(rows) ? rows : [];
    },

    // ── Tenant overrides ─────────────────────────────────────────────────────

    async listTenantOverrides(this: PlatformAdminApiCore, tenantId: string) {
      const rows = await this.request<PlatformTenantOverride[]>({ path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/overrides`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    async addTenantOverride(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>) {
      return this.request<PlatformTenantOverride>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/overrides`,
        method: 'POST',
        body: input,
      });
    },

    async removeTenantOverride(this: PlatformAdminApiCore, tenantId: string, overrideId: string) {
      return this.request<CentralMutationResult>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/overrides/${encodeURIComponent(overrideId)}`,
        method: 'DELETE',
      });
    },

    // ── Payments ──────────────────────────────────────────────────────────────

    async recordTenantPayment(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>) {
      return this.request<PlatformPayment>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/payments`,
        method: 'POST',
        body: input,
      });
    },

    // ── Remote control ────────────────────────────────────────────────────────

    async getTenantRemoteControl(this: PlatformAdminApiCore, tenantId: string) {
      return this.request<CentralTenantRemoteControl>({ path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/remote`, method: 'GET' });
    },

    async pushTenantConfig(this: PlatformAdminApiCore, tenantId: string, input: { key: string; value: any; scope?: string; targetDeviceIds?: string[] }) {
      return this.request<CentralRemoteConfigRow>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/remote/config`,
        method: 'POST',
        body: input,
      });
    },

    async forceTenantSync(this: PlatformAdminApiCore, tenantId: string) {
      return this.request<CentralTenantSyncResult>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/remote/sync`,
        method: 'POST',
      });
    },

    // ── Tenant branches ────────────────────────────────────────────────────────

    async listTenantBranches(this: PlatformAdminApiCore, tenantId: string) {
      const rows = await this.request<CentralTenantBranch[]>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/branches`,
        method: 'GET',
      });
      return Array.isArray(rows) ? rows : [];
    },

    async createTenantBranch(this: PlatformAdminApiCore, tenantId: string, input: Record<string, any>) {
      return this.request<CentralTenantBranch>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/branches`,
        method: 'POST',
        body: input,
      });
    },

    async updateTenantBranch(this: PlatformAdminApiCore, tenantId: string, branchId: string, input: Record<string, any>) {
      return this.request<CentralTenantBranch>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/branches/${encodeURIComponent(branchId)}`,
        method: 'PUT',
        body: input,
      });
    },

    async closeTenantBranch(this: PlatformAdminApiCore, tenantId: string, branchId: string) {
      return this.request<CentralMutationResult>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/branches/${encodeURIComponent(branchId)}`,
        method: 'DELETE',
      });
    },

    // ── Tenant API keys ───────────────────────────────────────────────────────

    async listTenantApiKeys(this: PlatformAdminApiCore, tenantId: string) {
      const rows = await this.request<any[]>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/api-keys`,
        method: 'GET',
      });
      return Array.isArray(rows) ? rows : [];
    },

    async createTenantApiKey(
      this: PlatformAdminApiCore,
      tenantId: string,
      input: { name: string; scopes?: string[]; expiresInDays?: number | null }
    ) {
      return this.request<any>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/api-keys`,
        method: 'POST',
        body: input,
      });
    },

    async revokeTenantApiKey(this: PlatformAdminApiCore, tenantId: string, keyId: string) {
      return this.request<CentralMutationResult>({
        path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/api-keys/${encodeURIComponent(keyId)}`,
        method: 'DELETE',
      });
    },
  };
}
