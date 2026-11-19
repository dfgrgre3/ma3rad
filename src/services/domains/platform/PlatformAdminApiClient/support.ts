// Support endpoints: tickets, messages and remote-access sessions.
import type { PlatformAdminApiCore } from './core';
import { CentralApiError } from './core';

export interface SupportApi {
  listSupportTickets(this: PlatformAdminApiCore, filters?: { tenantId?: string; status?: string; priority?: string; category?: string; q?: string; assigneeId?: string }): Promise<any[]>;
  createSupportTicket(this: PlatformAdminApiCore, input: Record<string, any>): Promise<any>;
  getSupportTicket(this: PlatformAdminApiCore, id: string): Promise<any>;
  updateSupportTicket(this: PlatformAdminApiCore, id: string, input: Record<string, any>): Promise<any>;
  addSupportTicketMessage(this: PlatformAdminApiCore, id: string, body: string, internal?: boolean): Promise<any>;
  deleteSupportTicket(this: PlatformAdminApiCore, id: string): Promise<any>;
  requestRemoteAccess(this: PlatformAdminApiCore, ticketId: string, requested: boolean, durationMinutes?: number): Promise<any>;
  approveRemoteAccess(this: PlatformAdminApiCore, ticketId: string, approved: boolean): Promise<any>;
  startRemoteSession(this: PlatformAdminApiCore, ticketId: string, technicianName: string, durationMinutes?: number): Promise<any>;
  endRemoteSession(this: PlatformAdminApiCore, sessionId: string, summary?: string): Promise<any>;
  listRemoteSessions(this: PlatformAdminApiCore, ticketId: string): Promise<any[]>;
}

export function createSupportApi(): SupportApi {
  return {
    // ── Support tickets ────────────────────────────────────────────────────────

    async listSupportTickets(this: PlatformAdminApiCore, filters: { tenantId?: string; status?: string; priority?: string; category?: string; q?: string; assigneeId?: string } = {}) {
      const params: Record<string, string> = {};
      if (filters.tenantId) params.tenantId = filters.tenantId;
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      if (filters.category) params.category = filters.category;
      if (filters.q) params.q = filters.q;
      if (filters.assigneeId) params.assigneeId = filters.assigneeId;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<any[]>({ path: `/api/v1/admin/support${qs ? `?${qs}` : ''}`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    async createSupportTicket(this: PlatformAdminApiCore, input: Record<string, any>) {
      return this.request<any>({ path: '/api/v1/admin/support', method: 'POST', body: input });
    },

    async getSupportTicket(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({ path: `/api/v1/admin/support/${encodeURIComponent(id)}`, method: 'GET' });
    },

    async updateSupportTicket(this: PlatformAdminApiCore, id: string, input: Record<string, any>) {
      return this.request<any>({ path: `/api/v1/admin/support/${encodeURIComponent(id)}`, method: 'PUT', body: input });
    },

    async addSupportTicketMessage(this: PlatformAdminApiCore, id: string, body: string, internal = false) {
      return this.request<any>({
        path: `/api/v1/admin/support/${encodeURIComponent(id)}/messages`,
        method: 'POST',
        body: { body, internal },
      });
    },

    async deleteSupportTicket(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({ path: `/api/v1/admin/support/${encodeURIComponent(id)}`, method: 'DELETE' });
    },

    // ── Support Remote Access ────────────────────────────────────────────────
    async requestRemoteAccess(this: PlatformAdminApiCore, ticketId: string, requested: boolean, durationMinutes: number = 60) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/support/${encodeURIComponent(ticketId)}/remote-access/request`,
        method: 'POST',
        body: { requested, durationMinutes },
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async approveRemoteAccess(this: PlatformAdminApiCore, ticketId: string, approved: boolean) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/support/${encodeURIComponent(ticketId)}/remote-access/approve`,
        method: 'POST',
        body: { approved },
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async startRemoteSession(this: PlatformAdminApiCore, ticketId: string, technicianName: string, durationMinutes: number = 60) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/support/${encodeURIComponent(ticketId)}/remote-access/start`,
        method: 'POST',
        body: { technicianName, durationMinutes },
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async endRemoteSession(this: PlatformAdminApiCore, sessionId: string, summary?: string) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/support/remote-sessions/${encodeURIComponent(sessionId)}/end`,
        method: 'POST',
        body: { summary },
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async listRemoteSessions(this: PlatformAdminApiCore, ticketId: string) {
      const envelope = await this.requestEnvelope<any[]>({
        path: `/api/v1/admin/support/${encodeURIComponent(ticketId)}/remote-sessions`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },
  };
}
