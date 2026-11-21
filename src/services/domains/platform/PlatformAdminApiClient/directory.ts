// Directory endpoints: plans, roles & permission catalog, platform staff,
// staff sessions/devices/invites, notifications and admin-control staff.
import type { PlatformAdminApiCore, PlatformRoleSummary } from './core';
import { CentralApiError } from './core';
import type { PlatformPlan } from '../platformTypes';
import type {
  PlatformPlanVersion,
  PlatformPriceHistoryEntry,
  PlatformPlanUpgradeRule,
  PlatformPlanUpgradeRuleInput,
  PlatformPlanImpactPreview,
  PlatformPlanInput,
} from '../platformTypes';
import type {
  PlatformStaff,
  PlatformStaffRole,
  PlatformTenantUserDirectoryEntry,
  PlatformUsersOverview,
  PlatformUsersSearchResults,
  PlatformTenantUserDetail,
  PlatformStaffUserDetail,
  PlatformUserAuditEvent,
} from '../platformTypes';
import type {
  CentralStaffMember,
  CentralStaffCreated,
  CentralStaffSessionRow,
  CentralStaffDeviceRow,
  CentralStaffInviteRow,
  CentralMutationResult,
  CentralPermissionCatalog,
  CentralNotificationRow,
  CentralNotificationDeliveryRow,
  CentralNotificationTemplateRow,
  CentralAdminControlStaffRow,
  CentralRoleOption,
} from './centralTypes';

export interface DirectoryApi {
  listPlans(this: PlatformAdminApiCore): Promise<PlatformPlan[]>;
  createPlan(this: PlatformAdminApiCore, input: Record<string, any>): Promise<PlatformPlan>;
  updatePlan(this: PlatformAdminApiCore, id: string, input: Record<string, any>): Promise<PlatformPlan>;
  getPlan(this: PlatformAdminApiCore, id: string): Promise<any>;
  deletePlan(this: PlatformAdminApiCore, id: string): Promise<unknown>;
  listPlanVersions(this: PlatformAdminApiCore, planId: string): Promise<PlatformPlanVersion[]>;
  listPlanPriceHistory(this: PlatformAdminApiCore, planId: string): Promise<PlatformPriceHistoryEntry[]>;
  listPlanSubscribers(this: PlatformAdminApiCore, planId: string): Promise<any[]>;
  copyPlan(this: PlatformAdminApiCore, id: string, input: { code: string; name: string; effectiveFrom?: string }): Promise<{ plan: any; copiedRules: number }>;
  listPlanUpgradeRules(this: PlatformAdminApiCore): Promise<PlatformPlanUpgradeRule[]>;
  upsertPlanUpgradeRule(this: PlatformAdminApiCore, input: PlatformPlanUpgradeRuleInput): Promise<PlatformPlanUpgradeRule>;
  previewPlanImpact(this: PlatformAdminApiCore, id: string, input: Partial<PlatformPlanInput>): Promise<PlatformPlanImpactPreview>;
  getPlanDeactivationCheck(this: PlatformAdminApiCore, id: string): Promise<{ canDeactivate: boolean; activeSubscriptions: number; message: string }>;
  listStaff(this: PlatformAdminApiCore): Promise<CentralStaffMember[]>;
  createStaff(this: PlatformAdminApiCore, input: Record<string, any>): Promise<CentralStaffCreated>;
  listRoles(this: PlatformAdminApiCore): Promise<PlatformRoleSummary[]>;
  getRolePermissions(this: PlatformAdminApiCore, roleCode: string): Promise<string[]>;
  getPermissionCatalog(this: PlatformAdminApiCore): Promise<CentralPermissionCatalog>;
  updateRolePermissions(this: PlatformAdminApiCore, roleCode: string, permissions: string[]): Promise<{ roleCode: string; permissions: string[] }>;
  listStaffSessions(this: PlatformAdminApiCore): Promise<CentralStaffSessionRow[]>;
  revokeStaffSession(this: PlatformAdminApiCore, id: string): Promise<CentralMutationResult>;
  listStaffDevices(this: PlatformAdminApiCore): Promise<CentralStaffDeviceRow[]>;
  revokeStaffDevice(this: PlatformAdminApiCore, id: string): Promise<CentralMutationResult>;
  listStaffInvites(this: PlatformAdminApiCore): Promise<CentralStaffInviteRow[]>;
  createStaffInvite(this: PlatformAdminApiCore, input: { email: string; fullName: string; phone?: string; role?: string; expiresInDays?: number }): Promise<CentralStaffInviteRow>;
  revokeStaffInvite(this: PlatformAdminApiCore, id: string): Promise<CentralMutationResult>;
  listNotifications(this: PlatformAdminApiCore, params?: {
    tenantId?: string | null;
    status?: string | null;
    page?: number;
    limit?: number;
  }): Promise<{ notifications: CentralNotificationRow[]; deliveries: CentralNotificationDeliveryRow[]; meta: Record<string, unknown> }>;
  sendNotification(this: PlatformAdminApiCore, input: {
    tenantId?: string | null;
    audience?: string;
    channel?: 'EMAIL' | 'SMS' | 'IN_APP';
    templateId?: string | null;
    subject: string;
    message: string;
  }): Promise<{ notification: CentralNotificationRow | null; deliveries: CentralNotificationDeliveryRow[] }>;
  listNotificationTemplates(this: PlatformAdminApiCore): Promise<CentralNotificationTemplateRow[]>;
  // NOTE: list methods stay `any[]` — pages feed results straight into
  // PlatformStaff[]/PlatformStaffRoleDefinition[] state without mapping.
  listAdminControlStaff(this: PlatformAdminApiCore, filters?: { search?: string; role?: string }): Promise<any[]>;
  listAdminControlStaffRoles(this: PlatformAdminApiCore): Promise<any[]>;
  createAdminControlStaff(this: PlatformAdminApiCore, input: { username?: string; fullName: string; email: string; phone?: string; role?: string; permissions?: any; password?: string }): Promise<CentralAdminControlStaffRow>;
  updateAdminControlStaff(this: PlatformAdminApiCore, id: string, input: Record<string, any>): Promise<CentralAdminControlStaffRow>;
  deleteAdminControlStaff(this: PlatformAdminApiCore, id: string): Promise<CentralMutationResult>;
  // ── Unified users hub ────────────────────────────────────────────────────
  getUsersOverview(this: PlatformAdminApiCore): Promise<PlatformUsersOverview>;
  searchUsers(this: PlatformAdminApiCore, q: string): Promise<PlatformUsersSearchResults>;
  getTenantUserDetail(this: PlatformAdminApiCore, userId: string): Promise<PlatformTenantUserDetail>;
  getStaffUserDetail(this: PlatformAdminApiCore, id: string): Promise<PlatformStaffUserDetail>;
}

// ─── Unified users hub mappers ──────────────────────────────────────────────

const parseJsonArrayLocal = (value: unknown): string[] | null => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : null;
    } catch {
      return null;
    }
  }
  return null;
};

const mapStaffRow = (row: any): PlatformStaff => ({
  id: String(row.id),
  username: String(row.username ?? row.email ?? ''),
  fullName: String(row.fullName ?? row.full_name ?? ''),
  email: String(row.email ?? ''),
  phone: row.phone ?? null,
  role: String(row.role ?? 'SUPPORT_AGENT') as PlatformStaffRole,
  isActive: Boolean(row.isActive ?? row.is_active),
  mustChangePassword: Boolean(row.mustChangePassword ?? row.must_change_password),
  permissionsOverride: parseJsonArrayLocal(row.permissionsOverride ?? row.permissions) ?? undefined,
  mfaEnabled: Boolean(row.mfaEnabled ?? row.mfa_enabled),
  mfaEnforcement: 'optional',
  dataScope: String(row.dataScope ?? row.data_scope ?? 'ALL') === 'LIMITED' ? 'LIMITED' : 'ALL',
  dataScopeTenantIds: null,
  lastLoginAt: row.lastLoginAt ?? row.last_login_at ?? null,
  failedLoginAttempts: Number(row.failedLoginAttempts ?? row.failed_login_attempts ?? 0),
  lockedUntil: row.lockedUntil ?? row.locked_until ?? null,
  createdAt: String(row.createdAt ?? row.created_at ?? ''),
  updatedAt: String(row.updatedAt ?? row.updated_at ?? ''),
});

const mapTenantUserDirectoryRow = (row: any): PlatformTenantUserDirectoryEntry => ({
  id: String(row.id),
  tenantId: String(row.tenantId ?? row.tenant_id ?? ''),
  tenantName: String(row.tenantName ?? row.tenant_name ?? ''),
  tenantCode: row.tenantCode ?? row.tenant_code ?? null,
  fullName: String(row.fullName ?? row.full_name ?? ''),
  username: row.username ?? null,
  email: row.email ?? null,
  phone: row.phone ?? null,
  role: String(row.role ?? 'USER'),
  status: String(row.status ?? 'ACTIVE') as PlatformTenantUserDirectoryEntry['status'],
  isActive: Boolean(row.isActive ?? (row.status === 'ACTIVE')),
  notes: row.notes ?? null,
  provisioningStatus: String(row.provisioningStatus ?? row.provisioning_status ?? 'NOT_REQUESTED') as PlatformTenantUserDirectoryEntry['provisioningStatus'],
  provisioningMode: row.provisioningMode ?? row.provisioning_mode ?? null,
  identityUserId: row.identityUserId ?? row.identity_user_id ?? null,
  scope: row.scope ?? null,
  inviteExpiresAt: row.inviteExpiresAt ?? row.invite_expires_at ?? null,
  provisionedAt: row.provisionedAt ?? row.provisioned_at ?? null,
  lastError: row.lastError ?? row.last_error ?? null,
  origin: row.origin ?? 'PLATFORM',
  createdAt: String(row.createdAt ?? row.created_at ?? ''),
  updatedAt: String(row.updatedAt ?? row.updated_at ?? ''),
});

const mapUserAuditEvent = (row: any): PlatformUserAuditEvent => ({
  id: String(row.id ?? ''),
  actorName: row.actorName ?? row.actor_name ?? null,
  action: String(row.action ?? ''),
  resourceType: row.resourceType ?? row.resource_type ?? null,
  resourceId: row.resourceId ?? row.resource_id ?? null,
  tenantId: row.tenantId ?? row.tenant_id ?? null,
  createdAt: row.createdAt ?? row.created_at ?? null,
});

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const mapUsersOverview = (data: any): PlatformUsersOverview => ({
  staff: {
    total: num(data?.staff?.total),
    active: num(data?.staff?.active),
    inactive: num(data?.staff?.inactive),
    locked: num(data?.staff?.locked),
    mustChangePassword: num(data?.staff?.mustChangePassword),
    byRole: data?.staff?.byRole && typeof data.staff.byRole === 'object' ? data.staff.byRole : {},
  },
  tenantUsers: {
    total: num(data?.tenantUsers?.total),
    byStatus: data?.tenantUsers?.byStatus ?? {},
    byProvisioning: data?.tenantUsers?.byProvisioning ?? {},
    byOrigin: data?.tenantUsers?.byOrigin ?? {},
    newLast7Days: num(data?.tenantUsers?.newLast7Days),
  },
  provisioning: {
    pending: num(data?.provisioning?.pending),
    failed: num(data?.provisioning?.failed),
  },
  recentEvents: Array.isArray(data?.recentEvents) ? data.recentEvents.map(mapUserAuditEvent) : [],
});

const mapTenantUserJob = (row: any) => ({
  id: String(row.id ?? ''),
  event: row.event ?? null,
  status: row.status ?? null,
  attempts: row.attempts ?? null,
  maxAttempts: row.max_attempts ?? row.maxAttempts ?? null,
  lastError: row.last_error ?? row.lastError ?? null,
  claimedByDeviceId: row.claimed_by_device_id ?? row.claimedByDeviceId ?? null,
  resultIdentityUserId: row.result_identity_user_id ?? row.resultIdentityUserId ?? null,
  createdAt: row.created_at ?? row.createdAt ?? null,
  updatedAt: row.updated_at ?? row.updatedAt ?? null,
  completedAt: row.completed_at ?? row.completedAt ?? null,
});

export function createDirectoryApi(): DirectoryApi {
  return {
    // Plans
    async listPlans(this: PlatformAdminApiCore) {
      return this.request<PlatformPlan[]>({ path: '/api/v1/admin/plans', method: 'GET' });
    },

    async createPlan(this: PlatformAdminApiCore, input: Record<string, any>) {
      return this.request<PlatformPlan>({ path: '/api/v1/admin/plans', method: 'POST', body: input });
    },

    async updatePlan(this: PlatformAdminApiCore, id: string, input: Record<string, any>) {
      return this.request<PlatformPlan>({ path: `/api/v1/admin/plans/${encodeURIComponent(id)}`, method: 'PUT', body: input });
    },

    async getPlan(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({ path: `/api/v1/admin/plans/${encodeURIComponent(id)}`, method: 'GET' });
    },

    async deletePlan(this: PlatformAdminApiCore, id: string) {
      return this.request<unknown>({ path: `/api/v1/admin/plans/${encodeURIComponent(id)}`, method: 'DELETE' });
    },

    async listPlanVersions(this: PlatformAdminApiCore, planId: string) {
      return this.request<PlatformPlanVersion[]>({ path: `/api/v1/admin/plans/${encodeURIComponent(planId)}/versions`, method: 'GET' });
    },

    async listPlanPriceHistory(this: PlatformAdminApiCore, planId: string) {
      return this.request<PlatformPriceHistoryEntry[]>({ path: `/api/v1/admin/plans/${encodeURIComponent(planId)}/price-history`, method: 'GET' });
    },

    async listPlanSubscribers(this: PlatformAdminApiCore, planId: string) {
      return this.request<any[]>({ path: `/api/v1/admin/plans/${encodeURIComponent(planId)}/subscribers`, method: 'GET' });
    },

    async copyPlan(this: PlatformAdminApiCore, id: string, input: { code: string; name: string; effectiveFrom?: string }) {
      return this.request<{ plan: any; copiedRules: number }>({ path: `/api/v1/admin/plans/${encodeURIComponent(id)}/copy`, method: 'POST', body: input });
    },

    async listPlanUpgradeRules(this: PlatformAdminApiCore) {
      return this.request<PlatformPlanUpgradeRule[]>({ path: '/api/v1/admin/plans/upgrade-rules', method: 'GET' });
    },

    async upsertPlanUpgradeRule(this: PlatformAdminApiCore, input: PlatformPlanUpgradeRuleInput) {
      return this.request<PlatformPlanUpgradeRule>({ path: '/api/v1/admin/plans/upgrade-rules', method: 'PUT', body: input });
    },

    async previewPlanImpact(this: PlatformAdminApiCore, id: string, input: Partial<PlatformPlanInput>) {
      return this.request<PlatformPlanImpactPreview>({ path: `/api/v1/admin/plans/${encodeURIComponent(id)}/impact-preview`, method: 'POST', body: input });
    },

    async getPlanDeactivationCheck(this: PlatformAdminApiCore, id: string) {
      return this.request<{ canDeactivate: boolean; activeSubscriptions: number; message: string }>({ path: `/api/v1/admin/plans/${encodeURIComponent(id)}/deactivation-check`, method: 'GET' });
    },

    // Staff
    async listStaff(this: PlatformAdminApiCore) {
      return this.request<CentralStaffMember[]>({ path: '/api/v1/admin/staff', method: 'GET' });
    },

    async createStaff(this: PlatformAdminApiCore, input: Record<string, any>) {
      return this.request<CentralStaffCreated>({
        path: '/api/v1/admin/staff',
        method: 'POST',
        body: input,
      });
    },

    // Roles & permission catalog
    async listRoles(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<PlatformRoleSummary[]>({ path: '/api/v1/admin/roles',
        method: 'GET' });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return (envelope.data as PlatformRoleSummary[]) || [];
    },

    async getRolePermissions(this: PlatformAdminApiCore, roleCode: string) {
      const envelope = await this.requestEnvelope<string[]>({
        path: `/api/v1/admin/roles/${encodeURIComponent(roleCode)}/permissions`,
        method: 'GET',
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return (envelope.data as string[]) || [];
    },

    async getPermissionCatalog(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralPermissionCatalog>({ path: '/api/v1/admin/permissions/catalog',
        method: 'GET' });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return (envelope.data as CentralPermissionCatalog) || { sections: [], pages: [], permissions: [], roles: [] };
    },

    /** Replace a role's granted permission codes (SUPER_ADMIN is immutable server-side). */
    async updateRolePermissions(this: PlatformAdminApiCore, roleCode: string, permissions: string[]) {
      const envelope = await this.requestEnvelope<{ roleCode: string; permissions: string[] }>({
        path: `/api/v1/admin/roles/${encodeURIComponent(roleCode)}/permissions`,
        method: 'PUT',
        body: { permissions },
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return (envelope.data as { roleCode: string; permissions: string[] }) || { roleCode, permissions };
    },

    // Notifications: delivery history, templates and real send.
    async listNotifications(this: PlatformAdminApiCore, params?: {
      tenantId?: string | null;
      status?: string | null;
      page?: number;
      limit?: number;
    }) {
      const qs = new URLSearchParams();
      if (params?.tenantId) qs.set('tenantId', params.tenantId);
      if (params?.status) qs.set('status', params.status);
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      const envelope = await this.requestEnvelope<{ notifications: CentralNotificationRow[]; deliveries: CentralNotificationDeliveryRow[]; meta: Record<string, unknown> }>({
        path: `/api/v1/admin/notifications${qs.toString() ? `?${qs.toString()}` : ''}`,
        method: 'GET',
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return {
        notifications: (envelope.data?.notifications as CentralNotificationRow[]) || [],
        deliveries: (envelope.data?.deliveries as CentralNotificationDeliveryRow[]) || [],
        meta: (envelope.data?.meta as Record<string, unknown>) || {},
      };
    },

    async sendNotification(this: PlatformAdminApiCore, input: {
      tenantId?: string | null;
      audience?: string;
      channel?: 'EMAIL' | 'SMS' | 'IN_APP';
      templateId?: string | null;
      subject: string;
      message: string;
    }) {
      const envelope = await this.requestEnvelope<{ notification: CentralNotificationRow | null; deliveries: CentralNotificationDeliveryRow[] }>({
        path: '/api/v1/admin/notifications',
        method: 'POST',
        body: {
          tenantId: input.tenantId ?? null,
          audience: input.audience ?? 'ALL',
          channel: input.channel ?? 'IN_APP',
          templateId: input.templateId ?? null,
          subject: input.subject,
          message: input.message,
        },
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      const data = (envelope.data as { notification: CentralNotificationRow | null; deliveries: CentralNotificationDeliveryRow[] } | null) || { notification: null, deliveries: [] };
      return { notification: data.notification, deliveries: data.deliveries || [] };
    },

    async listNotificationTemplates(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralNotificationTemplateRow[]>({ path: '/api/v1/admin/notifications/templates',
        method: 'GET' });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return (envelope.data as CentralNotificationTemplateRow[]) || [];
    },

    // ── Staff Sessions, Devices & Invites ───────────────────────────────────
    async listStaffSessions(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralStaffSessionRow[]>({ path: '/api/v1/admin/staff/sessions', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async revokeStaffSession(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<CentralMutationResult>({ path: `/api/v1/admin/staff/sessions/${encodeURIComponent(id)}`, method: 'DELETE' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralMutationResult;
    },

    async listStaffDevices(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralStaffDeviceRow[]>({ path: '/api/v1/admin/staff/devices', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async revokeStaffDevice(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<CentralMutationResult>({ path: `/api/v1/admin/staff/devices/${encodeURIComponent(id)}`, method: 'DELETE' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralMutationResult;
    },

    async listStaffInvites(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralStaffInviteRow[]>({ path: '/api/v1/admin/staff/invites', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async createStaffInvite(this: PlatformAdminApiCore, input: { email: string; fullName: string; phone?: string; role?: string; expiresInDays?: number }) {
      const envelope = await this.requestEnvelope<CentralStaffInviteRow>({ path: '/api/v1/admin/staff/invites', method: 'POST', body: input });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralStaffInviteRow;
    },

    async revokeStaffInvite(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<CentralMutationResult>({ path: `/api/v1/admin/staff/invites/${encodeURIComponent(id)}`, method: 'DELETE' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralMutationResult;
    },

    // ── Admin Control ───────────────────────────────────────────────────────
    async listAdminControlStaff(this: PlatformAdminApiCore, filters: { search?: string; role?: string } = {}) {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.role) params.set('role', filters.role);
      const query = params.toString();
      const envelope = await this.requestEnvelope<CentralAdminControlStaffRow[]>({
        path: `/api/v1/admin/admin-control/staff${query ? `?${query}` : ''}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async listAdminControlStaffRoles(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralRoleOption[]>({ path: '/api/v1/admin/admin-control/staff-roles', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async createAdminControlStaff(this: PlatformAdminApiCore, input: { fullName: string; email: string; phone?: string; role?: string; permissions?: any }) {
      const envelope = await this.requestEnvelope<CentralAdminControlStaffRow>({
        path: '/api/v1/admin/admin-control/staff',
        method: 'POST',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralAdminControlStaffRow;
    },

    async updateAdminControlStaff(this: PlatformAdminApiCore, id: string, input: Record<string, any>) {
      const envelope = await this.requestEnvelope<CentralAdminControlStaffRow>({
        path: `/api/v1/admin/admin-control/staff/${encodeURIComponent(id)}`,
        method: 'PUT',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralAdminControlStaffRow;
    },

    async deleteAdminControlStaff(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<CentralMutationResult>({
        path: `/api/v1/admin/admin-control/staff/${encodeURIComponent(id)}`,
        method: 'DELETE',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralMutationResult;
    },

    // ── Unified users hub ───────────────────────────────────────────────────
    async getUsersOverview(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any>({
        path: '/api/v1/admin/admin-control/users/overview',
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return mapUsersOverview(envelope.data);
    },

    async searchUsers(this: PlatformAdminApiCore, q: string) {
      const envelope = await this.requestEnvelope<{ staff?: any[]; tenantUsers?: any[] }>({
        path: `/api/v1/admin/admin-control/users/search?q=${encodeURIComponent(q)}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      const data = envelope.data ?? {};
      return {
        staff: (Array.isArray(data.staff) ? data.staff : []).map(mapStaffRow),
        tenantUsers: (Array.isArray(data.tenantUsers) ? data.tenantUsers : []).map(mapTenantUserDirectoryRow),
      } satisfies PlatformUsersSearchResults;
    },

    async getTenantUserDetail(this: PlatformAdminApiCore, userId: string) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/admin-control/users/tenant/${encodeURIComponent(userId)}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      const data = envelope.data ?? {};
      const userRow = data.user ?? {};
      const tenant = data.tenant ?? null;
      return {
        user: {
          ...mapTenantUserDirectoryRow({
            ...userRow,
            tenantId: userRow.tenantId ?? userRow.tenant_id,
            tenantName: tenant?.name ?? null,
            tenantCode: tenant?.code ?? null,
          }),
          notes: userRow.notes ?? null,
          scope: userRow.scope ?? null,
          inviteExpiresAt: userRow.inviteExpiresAt ?? userRow.invite_expires_at ?? null,
          provisionedAt: userRow.provisionedAt ?? userRow.provisioned_at ?? null,
          lastError: userRow.lastError ?? userRow.last_error ?? null,
        },
        tenant: tenant
          ? { id: String(tenant.id), name: tenant.name ?? null, code: tenant.code ?? null, status: tenant.status ?? null }
          : null,
        jobs: (Array.isArray(data.jobs) ? data.jobs : []).map(mapTenantUserJob),
        events: (Array.isArray(data.events) ? data.events : []).map(mapUserAuditEvent),
      } satisfies PlatformTenantUserDetail;
    },

    async getStaffUserDetail(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/admin-control/users/staff/${encodeURIComponent(id)}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      const data = envelope.data ?? {};
      return {
        staff: mapStaffRow(data.staff ?? {}),
        roles: Array.isArray(data.roles) ? data.roles.map(String) : [],
        grants: Array.isArray(data.grants) ? data.grants : [],
        denies: Array.isArray(data.denies) ? data.denies : [],
        activeSessions: num(data.activeSessions),
        recentLogins: (Array.isArray(data.recentLogins) ? data.recentLogins : []).map((row: any) => ({
          username: row.username ?? null,
          success: row.success ?? null,
          failureReason: row.failure_reason ?? row.failureReason ?? null,
          ipAddress: row.ip_address ?? row.ipAddress ?? null,
          createdAt: row.created_at ?? row.createdAt ?? null,
        })),
      } satisfies PlatformStaffUserDetail;
    },
  };
}
