// Directory endpoints: plans, roles & permission catalog, platform staff,
// staff sessions/devices/invites, notifications and admin-control staff.
import type { PlatformAdminApiCore, PlatformRoleSummary } from './core';
import { CentralApiError } from './core';
import type { PlatformPlan } from '../platformTypes';

export interface DirectoryApi {
  listPlans(this: PlatformAdminApiCore): Promise<PlatformPlan[]>;
  listStaff(this: PlatformAdminApiCore): Promise<any[]>;
  createStaff(this: PlatformAdminApiCore, input: any): Promise<any>;
  listRoles(this: PlatformAdminApiCore): Promise<PlatformRoleSummary[]>;
  getRolePermissions(this: PlatformAdminApiCore, roleCode: string): Promise<string[]>;
  getPermissionCatalog(this: PlatformAdminApiCore): Promise<{
    sections: unknown[];
    pages: unknown[];
    permissions: unknown[];
    roles: Array<PlatformRoleSummary & { permissions: string[] }>;
  }>;
  updateRolePermissions(this: PlatformAdminApiCore, roleCode: string, permissions: string[]): Promise<{ roleCode: string; permissions: string[] }>;
  listStaffSessions(this: PlatformAdminApiCore): Promise<any[]>;
  revokeStaffSession(this: PlatformAdminApiCore, id: string): Promise<any>;
  listStaffDevices(this: PlatformAdminApiCore): Promise<any[]>;
  revokeStaffDevice(this: PlatformAdminApiCore, id: string): Promise<any>;
  listStaffInvites(this: PlatformAdminApiCore): Promise<any[]>;
  createStaffInvite(this: PlatformAdminApiCore, input: { email: string; fullName: string; phone?: string; role?: string; expiresInDays?: number }): Promise<any>;
  revokeStaffInvite(this: PlatformAdminApiCore, id: string): Promise<any>;
  listNotifications(this: PlatformAdminApiCore, params?: {
    tenantId?: string | null;
    status?: string | null;
    page?: number;
    limit?: number;
  }): Promise<{ notifications: any[]; deliveries: any[]; meta: Record<string, unknown> }>;
  sendNotification(this: PlatformAdminApiCore, input: {
    tenantId?: string | null;
    audience?: string;
    channel?: 'EMAIL' | 'SMS' | 'IN_APP';
    templateId?: string | null;
    subject: string;
    message: string;
  }): Promise<{ notification: any; deliveries: any[] }>;
  listNotificationTemplates(this: PlatformAdminApiCore): Promise<any[]>;
  listAdminControlStaff(this: PlatformAdminApiCore, filters?: { search?: string; role?: string }): Promise<any[]>;
  listAdminControlStaffRoles(this: PlatformAdminApiCore): Promise<any[]>;
  createAdminControlStaff(this: PlatformAdminApiCore, input: { fullName: string; email: string; phone?: string; role?: string; permissions?: any }): Promise<any>;
  updateAdminControlStaff(this: PlatformAdminApiCore, id: string, input: Record<string, any>): Promise<any>;
  deleteAdminControlStaff(this: PlatformAdminApiCore, id: string): Promise<any>;
}

export function createDirectoryApi(): DirectoryApi {
  return {
    // Plans
    async listPlans(this: PlatformAdminApiCore) {
      return this.request<PlatformPlan[]>({ path: '/api/v1/admin/plans', method: 'GET' });
    },

    // Staff
    async listStaff(this: PlatformAdminApiCore) {
      return this.request<any[]>({ path: '/api/v1/admin/staff', method: 'GET' });
    },

    async createStaff(this: PlatformAdminApiCore, input: any) {
      return this.request<any>({
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
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/permissions/catalog',
        method: 'GET' });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return (envelope.data ?? {}) as any;
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
      const envelope = await this.requestEnvelope<{ notifications: any[]; deliveries: any[]; meta: Record<string, unknown> }>({
        path: `/api/v1/admin/notifications${qs.toString() ? `?${qs.toString()}` : ''}`,
        method: 'GET',
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return {
        notifications: (envelope.data?.notifications as any[]) || [],
        deliveries: (envelope.data?.deliveries as any[]) || [],
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
      const envelope = await this.requestEnvelope<{ notification: any; deliveries: any[] }>({
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
      const data = (envelope.data as { notification: any; deliveries: any[] } | null) || { notification: null, deliveries: [] };
      return { notification: data.notification, deliveries: data.deliveries || [] };
    },

    async listNotificationTemplates(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/notifications/templates',
        method: 'GET' });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return (envelope.data as any[]) || [];
    },

    // ── Staff Sessions, Devices & Invites ───────────────────────────────────
    async listStaffSessions(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/staff/sessions', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async revokeStaffSession(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<any>({ path: `/api/v1/admin/staff/sessions/${encodeURIComponent(id)}`, method: 'DELETE' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async listStaffDevices(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/staff/devices', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async revokeStaffDevice(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<any>({ path: `/api/v1/admin/staff/devices/${encodeURIComponent(id)}`, method: 'DELETE' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async listStaffInvites(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/staff/invites', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async createStaffInvite(this: PlatformAdminApiCore, input: { email: string; fullName: string; phone?: string; role?: string; expiresInDays?: number }) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/staff/invites', method: 'POST', body: input });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async revokeStaffInvite(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<any>({ path: `/api/v1/admin/staff/invites/${encodeURIComponent(id)}`, method: 'DELETE' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    // ── Admin Control ───────────────────────────────────────────────────────
    async listAdminControlStaff(this: PlatformAdminApiCore, filters: { search?: string; role?: string } = {}) {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.role) params.set('role', filters.role);
      const query = params.toString();
      const envelope = await this.requestEnvelope<any[]>({
        path: `/api/v1/admin/admin-control/staff${query ? `?${query}` : ''}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async listAdminControlStaffRoles(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/admin-control/staff-roles', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async createAdminControlStaff(this: PlatformAdminApiCore, input: { fullName: string; email: string; phone?: string; role?: string; permissions?: any }) {
      const envelope = await this.requestEnvelope<any>({
        path: '/api/v1/admin/admin-control/staff',
        method: 'POST',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async updateAdminControlStaff(this: PlatformAdminApiCore, id: string, input: Record<string, any>) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/admin-control/staff/${encodeURIComponent(id)}`,
        method: 'PUT',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async deleteAdminControlStaff(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/admin-control/staff/${encodeURIComponent(id)}`,
        method: 'DELETE',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },
  };
}
